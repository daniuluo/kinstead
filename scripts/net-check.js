// Headless test of multiplayer: the command dispatcher, and keeping guests'
// copies of a town in step with the host's. Two (or three) games run side by
// side in this process, joined by in-memory links instead of WebRTC.
// Usage: npm install three@0.170.0 --no-save && node scripts/net-check.js

import { World, fw, fd } from '../src/world/world.js';
import { growDemoTown } from '../src/world/demo.js';
import { PathFinder } from '../src/sim/path.js';
import { Sim } from '../src/sim/sim.js';
import { Agents } from '../src/sim/agents.js';
import { Transit } from '../src/sim/transit.js';
import { Construction } from '../src/sim/construction.js';
import { ReplicaSim, ReplicaConstruction } from '../src/net/replica.js';
import { worldFromSnapshot, makeSnapshot, PROTOCOL } from '../src/net/sync.js';
import { HostSession, GuestSession, makeLink, APPROVE_WAIT } from '../src/net/session.js';
import { runCommand, packResult, VISITOR_REASON } from '../src/commands.js';
import { BUILDINGS, TECHS } from '../src/defs.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };

// ------------------------------------------------------------ a headless game
function makeGame(name) {
  const g = {
    name, speed: 1, prevSpeed: 1, demo: false, replica: false, net: null, env: { night: 0 }, _ev: {}, toasts: [],
    renderer: { scene: { add() {}, remove() {} }, worldToScreen: () => ({ x: 0, y: 0 }) },
    view: { smoke: { emit() {} } },
    input: { hover: null, tool: { kind: 'select' } },
    cursors: { list: new Map(), set(id, c) { this.list.set(id, c); }, remove(id) { this.list.delete(id); }, clear() { this.list.clear(); } },
    sfx() {},
    on(e, f) { (this._ev[e] ||= []).push(f); },
    off(e, f) { this._ev[e] = (this._ev[e] || []).filter(x => x !== f); },
    emit(e, d) { for (const f of this._ev[e] || []) f(d); },
    get isGuest() { return !!(this.net && this.net.isGuest); },
    cmd(c, done = null) {
      if (this.isGuest) { this.net.request(c, done); return null; }
      const r = runCommand(this, c);
      if (done) done(r);
      return r;
    },
    applySpeed(s) { if (s === 0 && this.speed) this.prevSpeed = this.speed; this.speed = s; },
    load(world, { fresh = false, replica = false } = {}) {
      this.world = world;
      this.replica = replica;
      this.paths = new PathFinder(world);
      this.sim = replica ? new ReplicaSim(this) : new Sim(this);
      this.transit = new Transit(this);
      if (fresh) this.sim.seedFounders(); else this.sim.recompute();
      this.agents = new Agents(this);
      this.construction = replica ? new ReplicaConstruction(this) : new Construction(this);
      world.on('research:done', (id) => this.toasts.push(`research ${id}`));
      world.on('building:done', () => this.toasts.push('built'));
      this.transit.rebuild();
      this.transit.planCarts();
    },
    joinTown(snap, session) {
      const w = worldFromSnapshot(snap);
      this.net = session;
      this.load(w, { replica: true });
      this.applySpeed(snap.clock[2]);
      this.sim.syncClock(w.day, w.hours);
    },
  };
  g.ui = { selection: null, toast: (m, k) => g.toasts.push(`${k}: ${m}`), refreshAfterSandbox() {} };
  g.on('day', () => g.transit.planCarts());
  return g;
}

function step(g, dt) {
  const gh = g.sim.update(dt);
  g.agents.update(dt, gh);
  g.construction.update(dt, gh);
  g.transit.update(dt);
  if (g.net) g.net.update(dt);
}

// --------------------------------------------------------- in-memory links
// The host's end of a pipe carries the guest's peer id, as a PeerJS link does.
const queue = [];
let bytes = 0;
function pipe(peer = null) {
  const ends = [{ data: [], close: [] }, { data: [], close: [] }];
  let closed = false;
  const raw = (me, other) => ({
    send: (s) => { if (closed) return; bytes += s.length; queue.push(() => { if (!closed) for (const f of other.data) f(s); }); },
    onData: (f) => me.data.push(f),
    onClose: (f) => me.close.push(f),
    close: () => { if (closed) return; closed = true; queue.push(() => { for (const e of ends) for (const f of e.close) f(); }); },
  });
  return [{ ...raw(ends[0], ends[1]), peer }, raw(ends[1], ends[0])];
}
const pump = () => { for (let i = 0; i < 100000 && queue.length; i++) queue.shift()(); };
const until = async (pred, ms = 3000) => { const end = Date.now() + ms; while (!pred() && Date.now() < end) { pump(); await new Promise(r => setTimeout(r, 10)); } pump(); return pred(); };

// Everything about the town that must match between host and guest.
function differences(a, b) {
  const A = a.world, B = b.world, out = [];
  const add = (m) => { if (out.length < 12) out.push(m); };
  if (A.buildings.size !== B.buildings.size) add(`buildings ${A.buildings.size} vs ${B.buildings.size}`);
  for (const x of A.buildings.values()) {
    const y = B.buildings.get(x.id);
    if (!y) { add(`building ${x.id} (${x.type}) missing`); continue; }
    const k = (o) => JSON.stringify([o.type, o.level, o.x, o.z, fw(o), fd(o), o.rot, o.look || null, o.flavor || null, o.variant, o.access, !!o.connected, o.front || 0, o.leases && o.leases.length ? o.leases : null,
      o.con ? [o.con.kind, o.con.to, o.con.toType, o.con.wait || null] : null]);
    if (k(x) !== k(y)) add(`building ${x.id} differs: ${k(x)} vs ${k(y)}`);
    else if (x.con && Math.abs(x.con.done - y.con.done) > 0.02) add(`site ${x.id} progress ${x.con.done} vs ${y.con.done}`);
  }
  for (let i = 0; i < A.roads.length; i++) {
    if (A.roads[i] !== B.roads[i]) { add(`road at ${i}`); break; }
    if (A.rails[i] !== B.rails[i]) { add(`rail at ${i}`); break; }
    if (A.treeCount[i] !== B.treeCount[i]) { add(`trees at ${i}: ${A.treeCount[i]} vs ${B.treeCount[i]}`); break; }
    if (A.buildingAt[i] !== B.buildingAt[i]) { add(`plot at ${i}: ${A.buildingAt[i]} vs ${B.buildingAt[i]}`); break; }
  }
  for (let i = 0; i < A.terrain.H.length; i++) if (Math.abs(A.terrain.H[i] - B.terrain.H[i]) > 0.0011) { add(`height at ${i}`); break; }
  if (A.residents.size !== B.residents.size) add(`villagers ${A.residents.size} vs ${B.residents.size}`);
  for (const r of A.residents.values()) {
    const s = B.residents.get(r.id);
    if (!s) { add(`villager ${r.id} missing`); continue; }
    if (r.home !== s.home || r.job !== s.job || r.age !== s.age || (r.school ?? null) !== (s.school ?? null)) add(`villager ${r.id} differs`);
  }
  const ln = (w) => JSON.stringify(w.lines.map(l => [l.id, l.mode, l.stops, l.vehicles]));
  if (ln(A) !== ln(B)) add('lines differ');
  const st = (w) => JSON.stringify([Number.isFinite(w.money) ? Math.round(w.money) : 'inf', w.taxRate, w.townName, w.sandbox, w.research, w.day, w.titleIdx]);
  if (st(A) !== st(B)) add(`town state: ${st(A)} vs ${st(B)}`);
  if (Math.abs(A.hours - B.hours) > 0.6 && Math.abs(A.hours - B.hours) < 23.4) add(`clock ${A.hours.toFixed(2)} vs ${B.hours.toFixed(2)}`);
  return out;
}

const find = (w, pred) => { for (let z = 2; z < w.N - 3; z++) for (let x = 2; x < w.N - 3; x++) { const r = pred(x, z); if (r) return r; } return null; };
const freeSpot = (w, type = 'house') => find(w, (x, z) => { const c = w.checkBuild(type, x, z, { ignoreMoney: true, ignoreUnlock: true }); return c.ok && c.access.some(a => a.conn) ? { x, z } : null; });
// a command from a guest, answered after the messages have gone round
const ask = async (g, c) => { let res = null; g.cmd(c, (r) => { res = r; }); await until(() => res); return res; };

// ---------------------------------------------------------------- 1. host
const hw = World.createNew({ N: 48, seed: 4242, name: 'Netherby' });
growDemoTown(hw, 99, 1);
const host = makeGame('host');
host.load(hw, { fresh: true });
hw.money = 50000;

// ------------------------------------------------------ 2. the dispatcher
{
  ok(runCommand(host, { t: 'nope' }).ok === false, 'unknown commands are refused');
  ok(/valid/.test(runCommand(host, { t: 'place', type: 'house', x: 'a', z: 1 }).reason), 'malformed commands are refused');
  ok(/valid/.test(runCommand(host, { t: 'place', type: 'villa', x: 5, z: 5 }).reason), 'hidden building types cannot be placed directly');
  ok(/valid/.test(runCommand(host, { t: 'roads', tiles: [[0, 0], [999, 3]], level: 1 }).reason), 'tiles off the map are refused');
  ok(/valid/.test(runCommand(host, { t: 'upgrade', id: 1, look: '<script>' }).reason), 'unknown styles are refused');
  ok(/host/.test(runCommand(host, { t: 'sandbox', opts: { infiniteMoney: true } }, { id: 5, name: 'X', role: 'builder' }).reason), 'only the host may flip sandbox switches');
  ok(runCommand(host, { t: 'tax', rate: 3 }, { id: 5, name: 'V', role: 'visitor' }).reason === VISITOR_REASON && hw.taxRate !== 3, 'a visitor\'s commands are refused, with the reason');
  ok(runCommand(host, { t: 'tax', rate: 3 }, { id: 5, name: 'X' }).reason === VISITOR_REASON, '…and so are those of a player with no role at all');
  ok(!hw.sandbox.infiniteMoney, '…and a refused switch stays off');
  const spot = freeSpot(hw);
  const before = hw.money;
  const r = host.cmd({ t: 'place', type: 'house', x: spot.x, z: spot.z, variant: 7, accessIndex: 0, free: true, instant: true });
  ok(r.ok && r.building.con && hw.money < before, 'a placed house is a paid-for building site (extra options are ignored)');
  const p = packResult(r);
  ok(p.ok === true && p.building === r.building.id && typeof p.cost === 'number' && Object.values(p).every(v => typeof v !== 'object' || v === null), `results pack to plain data (${JSON.stringify(p)})`);
  const again = host.cmd({ t: 'place', type: 'house', x: spot.x, z: spot.z });
  ok(!again.ok && again.reason === 'Occupied', `the World rules still apply ("${again.reason}")`);
}

// ------------------------------------------------------------ 3. joining
host.net = new HostSession(host, { name: 'Ada' });
const guest = makeGame('guest');
let ended = null;
{
  ok(host.net.approve && !host.net.locked, 'a new host is asked before anyone joins');
  const [a, b] = pipe('peer-bo');
  host.net.addLink(makeLink(a));
  let joined = false, waited = false;
  const gs = new GuestSession(guest, makeLink(b), { name: 'Bo', onEnd: (why) => { ended = why; }, onWait: () => { waited = true; } });
  gs.join().then(() => { joined = true; }, (e) => console.error(e));
  await until(() => waited);
  const ask0 = [...host.net.waiting.values()][0];
  ok(waited && gs.waiting && !joined && host.net.players.length === 1 && ask0?.name === 'Bo' && host.toasts.some(t => /Bo wants to join/.test(t)),
    'a newcomer waits while the host is asked ("Bo wants to join")');
  host.net.letIn(ask0.id);
  await until(() => joined);
  ok(joined && guest.replica && guest.net === gs, 'the guest joined and loaded the town');
  ok(gs.players.length === 2 && gs.players.some(p => p.name === 'Ada' && p.host) && gs.me.name === 'Bo', `both players listed (${gs.players.map(p => p.name).join(', ')})`);
  const diff = differences(host, guest);
  ok(!diff.length, `the guest's copy matches the host's town (${hw.buildings.size} buildings, ${hw.residents.size} villagers)${diff.length ? ': ' + diff.join('; ') : ''}`);
}

// ------------------------------------------------- 4. guests' commands
{
  const gw = () => guest.world;
  let spot = freeSpot(gw());
  const r = await ask(guest, { t: 'place', type: 'house', x: spot.x, z: spot.z, variant: 1234 });
  ok(r.ok && r.building && r.building.con && hw.buildings.get(r.building.id)?.variant === 1234, `a guest builds a cottage (site ${r.building?.id} on both)`);
  const bad = await ask(guest, { t: 'place', type: 'house', x: spot.x, z: spot.z });
  ok(!bad.ok && bad.reason === 'Occupied', `the host refuses an occupied plot ("${bad.reason}")`);
  // roads
  const roadSpot = find(hw, (x, z) => (hw.checkRoad(x, z, 1).ok && !hw.roadAt(x, z) && hw.checkRoad(x + 1, z, 1).ok && !hw.roadAt(x + 1, z) ? { x, z } : null));
  const rr = await ask(guest, { t: 'roads', tiles: [[roadSpot.x, roadSpot.z], [roadSpot.x + 1, roadSpot.z]], level: 1 });
  ok(rr.placed === 2 && gw().roadAt(roadSpot.x, roadSpot.z) === 1, 'a guest lays a road');
  // research
  // (the demo town has researched everything: forget one project nothing else needs)
  let tech = Object.keys(TECHS).find(id => hw.canResearch(id) && hw.research.current !== id);
  if (!tech) {
    tech = Object.keys(TECHS).find(id => !Object.values(TECHS).some(t => t.needs.includes(id)) && TECHS[id].needs.length);
    hw.research.done = hw.research.done.filter(id => id !== tech);
    host.net.flush(); pump();
  }
  const rs = await ask(guest, { t: 'research', id: tech });
  ok(rs.ok && hw.research.current === tech && gw().research.current === tech, `a guest picks research (${tech})`);
  // tax, speed, name
  await ask(guest, { t: 'tax', rate: 13 });
  ok(hw.taxRate === 13 && gw().taxRate === 13, 'a guest sets the tax rate');
  await ask(guest, { t: 'speed', s: 4 });
  ok(host.speed === 4 && guest.speed === 4, 'a guest changes the speed for everyone');
  await ask(guest, { t: 'rename', name: 'Netherby-on-Wold' });
  ok(hw.townName === 'Netherby-on-Wold' && gw().townName === hw.townName, 'a guest renames the town');
  const sb = await ask(guest, { t: 'sandbox', opts: { infiniteMoney: true } });
  ok(!sb.ok && !gw().sandbox.infiniteMoney, `a guest can't flip sandbox switches ("${sb.reason}")`);
  // the host turns on a few switches so every kind of change can be tried quickly
  host.cmd({ t: 'sandbox', opts: { unlockAll: true, freeUpgrades: true, instantBuild: true } });
  host.net.update(0.25);   // the host's next update sends it
  await until(() => gw().sandbox.instantBuild);
  ok(gw().sandbox.unlockAll && gw().sandbox.instantBuild, "the host's sandbox switches reach the guest");
  // upgrade with a style
  const home = [...hw.buildings.values()].find(b => b.type === 'house' && !b.con && b.level === 1) || [...hw.buildings.values()].find(b => b.type === 'house' && !b.con);
  const up = await ask(guest, { t: 'upgrade', id: home.id, to: home.level === 1 ? 'villa' : null, look: 'brick' });
  ok(up.ok && up.building && gw().buildings.get(home.id).look === 'brick' && gw().buildings.get(home.id).type === hw.buildings.get(home.id).type, `a guest upgrades a home in brick (${hw.buildings.get(home.id).type})`);
  // join two neighbours
  let pair = null;
  for (const a of hw.buildings.values()) { const m = !a.con && hw.mergeOptions(a).find(m => !m.farmJoin); if (m) { pair = [a.id, m.other.id, m.type]; break; } }
  if (pair) {
    const mr = await ask(guest, { t: 'merge', a: pair[0], b: pair[1] });
    ok(mr.ok && mr.building && mr.building.type === pair[2] && !gw().buildings.has(pair[0]) && !gw().buildings.has(pair[1]), `a guest joins two neighbours into a ${pair[2]}`);
  } else ok(false, 'no pair of neighbours to join');
  // expand onto the next plot
  let grow = null;
  for (const b of hw.buildings.values()) { const o = b.type === 'house' && !b.con && hw.expandOptions(b).find(o => o.kind === 'land'); if (o) { grow = [b.id, o]; break; } }
  if (grow) {
    const er = await ask(guest, { t: 'expand', id: grow[0], dir: grow[1].dir, kind: 'land' });
    const gb = gw().buildings.get(grow[0]);
    ok(er.ok && fw(gb) * fd(gb) === 2 && gw().buildingOn(grow[1].x, grow[1].z) === gb, 'a guest expands a house onto the next plot');
  } else ok(false, 'no house could expand');
  // a guest ploughs fields for a farm and changes what it grows
  {
    let farm = null;
    for (const b of hw.buildings.values()) if (b.type === 'farm' && !b.con) { farm = b; break; }
    if (!farm) {
      const s = freeSpot(hw, 'farm');
      if (s) { const p = hw.placeBuilding('farm', s.x, s.z, { instant: true, ignoreUnlock: true }); if (p.ok) farm = p.building; }
    }
    if (farm) {
      const tiles = [];
      for (let z = farm.z - 2; z < farm.z + 4; z++) for (let x = farm.x - 2; x < farm.x + 4; x++) tiles.push([x, z]);
      const fr = await ask(guest, { t: 'fields', id: farm.id, tiles, add: true });
      const pr = await ask(guest, { t: 'produce', id: farm.id, produce: 'cattle' });
      await until(() => { const g2 = gw().buildings.get(farm.id); return g2 && g2.fields === farm.fields && g2.flavor === 'cattle'; });
      const gf = gw().buildings.get(farm.id);
      ok(fr.ok && fr.n > 0 && pr.ok && gf && gf.fields === farm.fields && gf.flavor === 'cattle' && gw().fields.every((v, i) => v === hw.fields[i]), `a guest ploughs ${fr.n} fields and turns the farm to cattle, and the guest sees it`);
      ok(!(await ask(guest, { t: 'fields', id: farm.id, tiles: 'lots', add: true })).ok, 'a malformed fields command is refused');
    } else ok(false, 'no farm for the fields check');
  }
  // a guest grows a 2×2 park onto the land round it and lays it out as a
  // Grand Park: the guest's copy has the same 3×3 grounds and what it grew from
  {
    let park = null, opt = null;
    for (let z = 2; z < hw.N - 5 && !opt; z++) for (let x = 2; x < hw.N - 5 && !opt; x++) {
      const c = hw.checkBuild('landscapepark', x, z, { ignoreMoney: true, ignoreUnlock: true });
      if (!c.ok || !c.access.some(a => a.conn)) continue;
      const p = hw.placeBuilding('landscapepark', x, z, { instant: true, ignoreUnlock: true });
      if (!p.ok) continue;
      const o = hw.expandOptions(p.building).find(o => o.kind === 'grand');
      if (o) { park = p.building; opt = o; } else hw.removeBuilding(p.building.id, 0);
    }
    if (opt) {
      const er = await ask(guest, { t: 'expand', id: park.id, dir: opt.dir, kind: 'grand' });
      const ur = await ask(guest, { t: 'upgrade', id: park.id, to: 'grandpark' });
      await until(() => { const g2 = gw().buildings.get(park.id); return g2 && g2.type === 'grandpark' && fw(g2) === 3; });
      const g2 = gw().buildings.get(park.id);
      ok(er.ok && ur.ok && hw.buildings.get(park.id).type === 'grandpark' && g2 && fw(g2) === 3 && fd(g2) === 3 && g2.flavor === hw.buildings.get(park.id).flavor && /^landscapepark#/.test(g2.flavor),
        `a guest grows a landscape park into 3×3 grounds and lays out a Grand Park, and sees it (${g2 && g2.flavor})`);
    } else ok(false, 'no room to grow a 2×2 park into bigger grounds');
  }
  // a guest builds a planting of a kind of their choosing, and has a
  // monument reworked as another kind; the guest's copy follows
  {
    const s = find(hw, (x, z) => (hw.checkBuild('flowers', x, z, { ignoreMoney: true, ignoreUnlock: true }).ok ? { x, z } : null));
    const pr = await ask(guest, { t: 'place', type: 'flowers', x: s.x, z: s.z, flavor: 'topiary' });
    const s2 = find(hw, (x, z) => (hw.checkBuild('statue', x, z, { ignoreMoney: true, ignoreUnlock: true }).ok ? { x, z } : null));
    const mr = await ask(guest, { t: 'place', type: 'statue', x: s2.x, z: s2.z });
    const kr = mr.ok && await ask(guest, { t: 'kind', id: mr.building.id, kind: 'clock' });
    await until(() => { const a = pr.ok && gw().buildings.get(pr.building.id), b = mr.ok && gw().buildings.get(mr.building.id); return a && a.flavor === 'topiary' && b && b.flavor === 'clock'; });
    const ga = pr.ok && gw().buildings.get(pr.building.id), gm = mr.ok && gw().buildings.get(mr.building.id);
    ok(pr.ok && kr && kr.ok && ga && ga.flavor === 'topiary' && gm && gm.flavor === 'clock', `a guest builds a topiary planting and has a monument reworked as a clock tower, and sees both (${ga && ga.flavor}, ${gm && gm.flavor})`);
    ok(!(await ask(guest, { t: 'kind', id: mr.building.id, kind: 'nonsense' })).ok, 'an unknown kind is refused');
  }
  // move a building
  const mover = [...hw.buildings.values()].find(b => b.type === 'house' && !b.con && fw(b) === 1 && fd(b) === 1);
  spot = freeSpot(hw);
  const mv = await ask(guest, { t: 'move', id: mover.id, x: spot.x, z: spot.z });
  ok(mv.ok && mv.building && !gw().buildings.has(mover.id) && gw().buildings.get(mv.building.id)?.x === spot.x, 'a guest moves a house (instantly, in sandbox)');
  // terraform, trees, bulldoze
  const land = find(hw, (x, z) => (hw.checkTerraform(x, z).ok && !hw.roadAt(x, z) && hw.checkPlant(x + 3, z).ok ? { x, z } : null));
  const tf = await ask(guest, { t: 'terraform', x: land.x, z: land.z, mode: 'raise' });
  const pl = await ask(guest, { t: 'plant', x: land.x + 3, z: land.z });
  ok(tf.ok && pl.ok && Math.abs(gw().terrain.ch(land.x, land.z) - hw.terrain.ch(land.x, land.z)) < 0.002 && gw().treeCount[gw().idx(land.x + 3, land.z)] === hw.treeCount[hw.idx(land.x + 3, land.z)], 'a guest raises land and plants a tree');
  const bd = await ask(guest, { t: 'bulldoze', tiles: [[land.x + 3, land.z]] });
  ok(bd.ok && gw().treeCount[gw().idx(land.x + 3, land.z)] === 0, 'a guest clears the tree again');
  // dress a street with hedges, then upgrade that stretch of road
  const { planDress } = await import('../src/world/roadDress.js');
  const street = [];
  for (let i = 0; i < hw.N * hw.N && street.length < 4; i++) {
    const x = i % hw.N, z = (i / hw.N) | 0;
    if (hw.roads[i] && hw.roads[i] < 3 && planDress(hw, [[x, z]], 2).n) street.push([x, z]);
  }
  const dr = await ask(guest, { t: 'dress', kind: 2, tiles: street });
  ok(dr.ok && dr.n === street.length && street.every(([x, z]) => gw().dress[gw().idx(x, z)] === 2 && hw.dress[hw.idx(x, z)] === 2), 'a guest plants hedges along a street, and everyone sees them');
  const re = await ask(guest, { t: 'roadedit', op: 'up', tiles: street });
  ok(re.ok && street.every(([x, z]) => gw().roadAt(x, z) === hw.roadAt(x, z) && hw.roadAt(x, z) >= 2), 'a guest upgrades that stretch of road in one go');
  // two roads side by side: a guest lays a boulevard and gives it a look,
  // and everyone works out the same boulevard and sees the same look
  {
    const { DRESSINGS, lookPart } = await import('../src/config.js');
    const { boulevardTiles } = await import('../src/world/boulevard.js');
    const free = (x, z) => hw.inBounds(x, z) && !hw.roadAt(x, z) && !hw.buildingOn(x, z) && hw.checkRoad(x, z, 2).ok && !hw.terrain.isWater(x, z);
    let pair = null;
    for (let z = 2; z < hw.N - 3 && !pair; z++) for (let x = 2; x < hw.N - 8 && !pair; x++) {
      const a = [0, 1, 2, 3, 4, 5].map(k => [x + k, z]), b = a.map(([ax, az]) => [ax, az + 1]);
      if ([...a, ...b].every(([ax, az]) => free(ax, az)) && (hw.roadAt(x - 1, z) || hw.roadAt(x - 1, z + 1))) pair = [a, b];
    }
    if (pair) {
      const lr = await ask(guest, { t: 'roads', tiles: [...pair[0], ...pair[1]], level: 2 });
      const lanes = boulevardTiles(hw, ...pair[0][2]), look = DRESSINGS.findIndex(d => d && d.key === 'bhedge');
      const lk = await ask(guest, { t: 'dress', kind: look, tiles: lanes });
      await until(() => lanes.every(([x, z]) => lookPart(gw().dress[gw().idx(x, z)]) === look));
      ok(lr.placed > 0 && lanes.length >= 4 && lk.ok && gw().blvd.every((v, i) => v === hw.blvd[i]) && lanes.every(([x, z]) => lookPart(gw().dress[gw().idx(x, z)]) === look),
        `a guest lays two roads side by side and gives the boulevard a hedge; everyone has the same boulevard (${lanes.length} lane tiles) and sees its look`);
      const rm = await ask(guest, { t: 'roadedit', op: 'remove', tiles: pair[1] });
      await until(() => pair[1].every(([x, z]) => !gw().roadAt(x, z)));
      ok(rm.ok && gw().blvd.every((v, i) => v === hw.blvd[i]) && pair[0].every(([x, z]) => !lookPart(gw().dress[gw().idx(x, z)]) && !gw().blvd[gw().idx(x, z)]), 'taking one road up again ends the boulevard and its look for everyone');
    } else ok(false, 'no room for a boulevard');
  }
  // a coach line between two stops
  const stops = [];
  for (let z = 1; z < hw.N - 1 && stops.length < 2; z++) for (let x = 1; x < hw.N - 1 && stops.length < 2; x++) {
    if (stops.some(s => Math.abs(s.x - x) + Math.abs(s.z - z) < 8)) continue;
    const c = hw.checkBuild('coachstop', x, z);
    if (!c.ok || !c.access.some(a => a.conn)) continue;
    const r2 = await ask(guest, { t: 'place', type: 'coachstop', x, z });
    if (r2.ok) stops.push(r2.building);
  }
  const ln = await ask(guest, { t: 'line', mode: 'coach', stops: stops.map(s => s.id) });
  ok(ln.ok && ln.line && gw().lines.some(l => l.id === ln.line.id), `a guest opens ${ln.line ? ln.line.name : 'a coach line'} (${ln.reason || 'ok'})`);
  if (ln.ok) {
    await ask(guest, { t: 'vehicles', id: ln.line.id, n: 2 });
    ok(hw.lines.find(l => l.id === ln.line.id).vehicles === 2 && gw().lines.find(l => l.id === ln.line.id).vehicles === 2, 'a guest adds a second coach');
  }
  // demolish
  const victim = [...hw.buildings.values()].find(b => b.type === 'house' && !b.con && b.residents.length);
  const dm = await ask(guest, { t: 'demolish', id: victim.id });
  ok(dm.ok && !gw().buildings.has(victim.id), 'a guest demolishes a house');
  host.cmd({ t: 'sandbox', opts: { instantBuild: false } });
  // and something real to build while the clock runs
  spot = freeSpot(hw);
  const site = await ask(guest, { t: 'place', type: 'house', x: spot.x, z: spot.z });
  globalThis.__site = site.building && site.building.id;
  // and puts it first for the builders
  const pr = await ask(guest, { t: 'priority', id: site.building.id, on: true });
  await until(() => gw().buildings.get(site.building.id)?.con?.priority === true);
  ok(pr.ok && hw.buildings.get(site.building.id).con.priority === true && gw().buildings.get(site.building.id)?.con?.priority === true, 'a guest puts a building site first, and everyone sees it');
  await until(() => !queue.length);
  const diff = differences(host, guest);
  ok(!diff.length, `after all that, both towns match${diff.length ? ': ' + diff.join('; ') : ''}`);
}

// --------------------------------------------- 5. the clock runs on
{
  const gw = guest.world;
  bytes = 0;
  const startDay = hw.day, t0 = Date.now();
  let worst = [], frames = 0, simSeconds = 0;
  const siteId = globalThis.__site;
  let built = false;
  host.applySpeed(8); guest.applySpeed(8);
  while (hw.day < startDay + 3 && frames < 20000) {
    step(host, 0.1); step(guest, 0.1); pump();
    frames++; simSeconds += 0.1;
    if (siteId && !built && !hw.buildings.get(siteId)?.con) built = true;
    if (frames % 600 === 0) { host.net.flush(); pump(); const d = differences(host, guest); if (d.length > worst.length) worst = d; }
  }
  host.net.flush(); pump();
  ok(hw.day >= startDay + 3, `ran three days at 8× (${frames} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  ok(!worst.length, `the towns stayed in step while the clock ran${worst.length ? ': ' + worst.join('; ') : ''}`);
  const end = differences(host, guest);
  ok(!end.length, `…and match at the end (${hw.buildings.size} buildings, ${hw.residents.size} villagers, day ${gw.day})${end.length ? ': ' + end.join('; ') : ''}`);
  ok(built && gw.buildings.get(siteId) && !gw.buildings.get(siteId).con, "the guest's cottage was built by the host's builders, and the guest saw it finish");
  ok(guest.toasts.some(t => /built/.test(t)), 'the guest heard about finished buildings');
  ok(guest.agents.walkers.size > 5, `villagers walk about on the guest too (${guest.agents.walkers.size} out now)`);
  const perSec = bytes / simSeconds;
  console.log(`      host → guest: ${(perSec / 1024).toFixed(1)} KB per second of play at 8×`);
  ok(perSec < 60 * 1024, 'the updates stay small');
}

// -------------------------------------------- 6. drift gets repaired
{
  const gw = guest.world;
  const b = [...gw.buildings.values()].find(x => !x.con && BUILDINGS[x.type].levels.length > 1 && x.level === 0);
  const r = [...gw.residents.values()][0];
  b.level = 1;
  gw.residents.delete(r.id);
  gw.money += 999;
  host.net.flush(true); pump();
  const d = differences(host, guest);
  ok(!d.length && gw.buildings.get(b.id).level === 0 && gw.residents.has(r.id), `a keyframe puts right anything that drifted${d.length ? ': ' + d.join('; ') : ''}`);
}

// ------------------------------------- 7. a second guest joins later
// (newcomers come straight in from here; section 7c goes back to asking)
host.net.setApprove(false);
{
  const g2 = makeGame('guest2');
  const [a, b] = pipe();
  host.net.addLink(makeLink(a));
  const s2 = new GuestSession(g2, makeLink(b), { name: 'Cy' });
  let joined = false;
  s2.join().then(() => { joined = true; });
  await until(() => joined);
  const d = differences(host, g2);
  ok(joined && !d.length, `a second guest joins mid-game with the town as it is now${d.length ? ': ' + d.join('; ') : ''}`);
  await until(() => guest.net.players.length === 3);
  ok(guest.net.players.length === 3 && host.net.players.length === 3, 'everyone sees three players');
  // cursors are relayed
  g2.input.hover = { x: 10, z: 11 };
  step(g2, 0.2); pump(); pump();
  ok(host.cursors.list.get(s2.me.id)?.x === 10 && guest.cursors.list.get(s2.me.id)?.z === 11, "players see each other's cursors");
  s2.close();
  await until(() => host.net.players.length === 2);
  ok(host.net.players.length === 2 && guest.net.players.length === 2 && !guest.cursors.list.has(s2.me.id), 'a guest leaving is fine: the others carry on');
  // a snapshot is just data
  const snap = JSON.parse(JSON.stringify(makeSnapshot(host)));
  ok(worldFromSnapshot(snap).buildings.size === hw.buildings.size, `a snapshot is plain JSON (${(JSON.stringify(snap).length / 1024).toFixed(0)} KB)`);
}

// ------------------------------- 7b. a hostile player can't hurt the others
{
  // a guest that ignores the rules: odd command names, prototype keys, markup,
  // floods, and messages far too big
  const [a, b] = pipe();
  host.net.addLink(makeLink(a));
  const evil = makeLink(b);
  const replies = [];
  evil.onMessage = (m) => { if (m.t === 'res') replies.push(m); };
  evil.send({ t: 'hello', proto: PROTOCOL, name: '<img src=x onerror=alert(1)>Mallory' });
  await until(() => host.net.players.length === 3);
  const mal = host.net.players[host.net.players.length - 1];
  ok(mal && !/[<>"]/.test(mal.name), `a player's name loses its markup ("${mal && mal.name}")`);
  const townBefore = hw.townName, bBefore = hw.buildings.size;
  const bad = [
    { t: '__proto__' }, { t: 'constructor' }, { t: 'toString' },
    { t: 'place', type: '__proto__', x: 5, z: 5 }, { t: 'place', type: 'constructor', x: 5, z: 5 },
    { t: 'research', id: '__proto__' }, { t: 'research', id: 'constructor' },
    { t: 'upgrade', id: 1, to: '__proto__' }, { t: 'line', mode: 'toString', stops: [] },
    { t: 'sandbox', opts: { infiniteMoney: true } },
  ];
  bad.forEach((c, i) => evil.send({ t: 'cmd', id: 100 + i, c }));
  await until(() => replies.length >= bad.length);
  ok(replies.length === bad.length && replies.every(m => m.r.ok === false), `every rule-bending command is refused (${replies.filter(m => !m.r.ok).length}/${bad.length})`);
  ok(hw.buildings.size === bBefore && !hw.sandbox.infiniteMoney, 'nothing changed in the town');
  ok(({}).hidden === undefined && ({}).levels === undefined && Object.keys(Object.prototype).length === 0, 'nothing leaked onto Object.prototype');
  replies.length = 0;
  evil.send({ t: 'cmd', id: 200, c: { t: 'rename', name: '<script>alert(1)</script>Evilton' } });
  await until(() => replies.length >= 1);
  ok(!/[<>"]/.test(hw.townName) && hw.townName.includes('Evilton'), `a town name loses its markup ("${hw.townName}")`);
  host.cmd({ t: 'rename', name: townBefore });
  // a flood of commands is cut short
  replies.length = 0;
  for (let i = 0; i < 200; i++) evil.send({ t: 'cmd', id: 300 + i, c: { t: 'tax', rate: 5 } });
  await until(() => replies.length >= 200);
  const slowed = replies.filter(m => !m.r.ok && /slow down/i.test(m.r.reason || '')).length;
  ok(slowed > 100, `a flood of 200 commands is mostly turned away (${slowed} refused)`);
  // a message announced as enormous is dropped, not buffered
  const raw = b;
  const received = host.net.players.length;
  raw.send('#999999999|' + 'x'.repeat(10));
  for (let i = 0; i < 5; i++) raw.send('+' + 'x'.repeat(10000));
  raw.send(JSON.stringify({ t: 'cmd', id: 1, c: { t: 'tax', rate: 5 } }) + ' '.repeat(300 * 1024));
  pump();
  ok(host.net.players.length === received && !evil.closed, 'oversized messages are ignored without breaking the link');
  evil.send({ t: 'bye' });
  await until(() => host.net.players.length === 2);
}
{
  // a host that sends markup in names and colours: the guest cleans it on arrival
  const g3 = makeGame('guest3');
  const [a, b] = pipe();
  const fakeHost = makeLink(a);
  const gs3 = new GuestSession(g3, makeLink(b), { name: 'Di' });
  fakeHost.onMessage = (m) => {
    if (m.t !== 'hello') return;
    const snap = JSON.parse(JSON.stringify(makeSnapshot(host)));
    snap.save.name = '<img src=x onerror=alert(1)>Town';
    snap.save.residents[0][1] = '<img src=x onerror=alert(2)>';
    snap.save.residents[0][2] = '"><b>';
    fakeHost.send({ t: 'welcome', you: { id: 9, name: '<b>Di</b>', color: 'red;background:url(//evil)' },
      players: [{ id: 0, name: '<i>Boss</i>', color: 'javascript:alert(1)', host: true }, { id: 9, name: 'Di', color: '#4fb84a', extra: { __proto__: { polluted: 1 } } }], snap, cursors: [] });
  };
  let joined = false;
  gs3.join().then(() => { joined = true; }, (e) => console.error(e));
  await until(() => joined);
  const r0 = g3.world.residents.get(host.world.residents.values().next().value.id);
  ok(joined && r0 && !/[<>"]/.test(r0.first + r0.last), `villager names from a host lose their markup ("${r0 && r0.first}" "${r0 && r0.last}")`);
  ok(!/[<>"]/.test(g3.world.townName), `the town name from a host loses its markup ("${g3.world.townName}")`);
  ok(gs3.players.every(p => /^#[0-9a-fA-F]{3,8}$/.test(p.color) && !/[<>]/.test(p.name)) && gs3.me.color === '#888888', 'player names and colours from a host are cleaned');
  ok(({}).polluted === undefined, 'nothing leaked onto Object.prototype');
  gs3.close();
  pump();
}

// --------------------------------- 7c. the host decides who gets in
{
  const N = host.net;
  // a newcomer in a game of their own, knocking with this name from this browser tab (peer id)
  const knock = async (name, peer) => {
    const g = makeGame(name);
    const [a, b] = pipe(peer);
    N.addLink(makeLink(a));
    const out = { g, joined: false, waited: false, error: null, ended: null };
    out.s = new GuestSession(g, makeLink(b), { name, onWait: () => { out.waited = true; }, onEnd: (why) => { out.ended = why; } });
    out.s.join().then(() => { out.joined = true; }, (e) => { out.error = e.message; });
    await until(() => out.joined || out.error || out.waited);
    return out;
  };
  const askFor = (name) => [...N.waiting.values()].find(a => a.name === name);
  N.setApprove(true);
  const players = () => N.players.length;

  // turned away
  const mal = await knock('Mallory', 'peer-mal');
  ok(mal.waited && askFor('Mallory'), 'with asking on, a newcomer waits for the host');
  N.turnAway(askFor('Mallory').id);
  await until(() => mal.error);
  ok(/turned down/.test(mal.error || '') && !N.waiting.size && !mal.g.world, `turned away, they're told so ("${mal.error}")`);
  const mal2 = await knock('Mallory', 'peer-mal');
  ok(/moment ago/.test(mal2.error || '') && !N.waiting.size, 'knocking again straight away is refused without asking the host again');

  // nobody answers
  N.approveWait = 150;
  const kit = await knock('Kit', 'peer-kit');
  await until(() => kit.error);
  ok(kit.waited && /didn't answer/.test(kit.error || '') && !N.waiting.size && host.toasts.some(t => /Kit gave up/.test(t)), `a newcomer nobody answers is told after a while ("${kit.error}")`);
  N.approveWait = APPROVE_WAIT;

  // a waiting newcomer can't do anything yet, and can give up
  {
    const [a, b] = pipe('peer-pat');
    N.addLink(makeLink(a));
    const pat = makeLink(b), got = [];
    pat.onMessage = (m) => got.push(m);
    pat.send({ t: 'hello', proto: PROTOCOL, name: 'Pat' });
    await until(() => got.some(m => m.t === 'wait'));
    const tax = hw.taxRate;
    pat.send({ t: 'cmd', id: 1, c: { t: 'tax', rate: tax === 1 ? 2 : 1 } });
    pat.send({ t: 'cur', c: { x: 3, z: 3 } });
    host.net.flush(true);
    await until(() => false, 100);
    ok(got.every(m => m.t === 'wait' || m.t === 'ping') && hw.taxRate === tax && players() === 2, 'someone still waiting gets no town and can\'t change it');
    pat.send({ t: 'bye' });
    await until(() => !N.waiting.size);
    ok(!N.waiting.size && host.toasts.some(t => /Pat stopped waiting/.test(t)), 'if they stop waiting, the question goes away');
  }

  // only so many can wait at once
  {
    const got = [];
    for (let i = 0; i < 5; i++) {
      const [a, b] = pipe(`peer-q${i}`);
      N.addLink(makeLink(a));
      const l = makeLink(b);
      got.push({ l, t: null });
      l.onMessage = (m) => { if (m.t !== 'ping') got[i].t = m.t; };
      l.send({ t: 'hello', proto: PROTOCOL, name: `Q${i}` });
    }
    await until(() => got.every(x => x.t));
    ok(N.waiting.size === 4 && got.filter(x => x.t === 'refuse').length === 1, `at most four newcomers wait at once (${got.map(x => x.t).join(', ')})`);
    for (const x of got) x.l.send({ t: 'bye' });
    await until(() => !N.waiting.size);
  }

  // a refused connection can't try again on the same link
  {
    N.setApprove(false);
    const [a, b] = pipe('peer-sly');
    N.addLink(makeLink(a));
    const sly = makeLink(b), got = [];
    sly.onMessage = (m) => got.push(m.t);
    sly.send({ t: 'hello', proto: 0, name: 'Sly' });
    sly.send({ t: 'hello', proto: PROTOCOL, name: 'Sly' });
    await until(() => got.includes('refuse'));
    await until(() => false, 50);
    ok(!got.includes('welcome') && players() === 2, 'a refused connection gets nowhere with a second hello');
    N.setApprove(true);
  }

  // let in, then made a visitor
  const eve = await knock('Eve', 'peer-eve');
  N.letIn(askFor('Eve').id);
  await until(() => eve.joined);
  ok(eve.joined && players() === 3 && !differences(host, eve.g).length, 'let in, a newcomer gets the town');
  N.setRole(eve.s.me.id, 'visitor');
  await until(() => eve.s.me.role === 'visitor' && guest.net.players.find(p => p.id === eve.s.me.id)?.role === 'visitor');
  ok(eve.s.me.role === 'visitor' && eve.g.toasts.some(t => /made you a visitor/.test(t)), 'a player made a visitor is told, and everyone sees it');
  const tax = hw.taxRate;
  const local = await ask(eve.g, { t: 'tax', rate: tax === 2 ? 4 : 2 });
  ok(!local.ok && local.reason === VISITOR_REASON && eve.g.toasts.some(t => t.includes(VISITOR_REASON)), 'a visitor\'s own game says why it can\'t build');
  let res = null;
  eve.s.pending.set(999, (r) => { res = r; });
  eve.s.link.send({ t: 'cmd', id: 999, c: { t: 'tax', rate: tax === 2 ? 4 : 2 } });
  await until(() => res);
  ok(res && !res.ok && res.reason === VISITOR_REASON && hw.taxRate === tax, 'a visitor that skips that check is refused by the host');
  eve.g.input.hover = { x: 12, z: 9 };
  step(eve.g, 0.2); pump(); pump();
  ok(host.cursors.list.get(eve.s.me.id)?.x === 12 && guest.cursors.list.get(eve.s.me.id)?.z === 9, "a visitor's cursor still shows for the others");
  N.setRole(eve.s.me.id, 'builder');
  await until(() => eve.s.me.role === 'builder');
  const back = await ask(eve.g, { t: 'tax', rate: tax === 2 ? 4 : 2 });
  ok(back.ok && hw.taxRate !== tax && eve.g.toasts.some(t => /made you a builder/.test(t)), 'made a builder again, they can build');
  host.cmd({ t: 'tax', rate: tax });

  // removed
  const eveId = eve.s.me.id;
  N.kick(eveId);
  await until(() => eve.ended && !guest.net.players.some(p => p.id === eveId));
  ok(eve.ended === 'kicked' && eve.g.world && eve.g.world.buildings.size === hw.buildings.size, 'a removed player is told why, and keeps the town as it was');
  ok(!N.players.some(p => p.id === eveId) && !guest.net.players.some(p => p.id === eveId) && !host.cursors.list.has(eveId), 'everyone else sees them go');
  let late = null;
  eve.s.request({ t: 'tax', rate: 1 }, (r) => { late = r; });
  ok(late && !late.ok, 'their commands after that go nowhere');
  const again = await knock('Eve', 'peer-eve');
  const renamed = await knock('Evie', 'peer-eve');
  const sameName = await knock('  EVE ', 'peer-other');
  ok([again, renamed, sameName].every(x => /removed you/.test(x.error || '')) && !N.waiting.size,
    'a removed player is turned away for the session: same tab under a new name, or the same name from elsewhere');
  ok(host.toasts.some(t => /Turned away Eve: you removed them/.test(t)), 'the host hears about it');
  const other = await knock('Gil', 'peer-gil');
  ok(other.waited, 'someone else can still ask to join');
  other.s.close();
  await until(() => !N.waiting.size);
  N.forgive(N.removed[0].id);
  const forgiven = await knock('Eve', 'peer-eve');
  ok(forgiven.waited && !N.removed.length, 'allowed back, they can ask again');
  forgiven.s.close();
  await until(() => !N.waiting.size);

  // locked
  const hal = await knock('Hal', 'peer-hal');
  N.setLocked(true);
  await until(() => hal.error);
  ok(/locked/.test(hal.error || ''), `locking turns away anyone still waiting ("${hal.error}")`);
  N.setApprove(false);
  const ivy = await knock('Ivy', 'peer-ivy');
  ok(/locked/.test(ivy.error || '') && players() === 2, 'a locked town lets nobody new in, even without asking');
  N.setLocked(false);
  const ivy2 = await knock('Ivy', 'peer-ivy');
  ok(ivy2.joined && players() === 3, 'unlocked, newcomers come in again');
  ivy2.s.close();
  await until(() => players() === 2);

  // joining as a visitor
  N.setJoinRole('visitor');
  const vic = await knock('Vic', 'peer-vic');
  const vr = await ask(vic.g, { t: 'place', type: 'house', x: 5, z: 5 });
  ok(vic.joined && vic.s.me.role === 'visitor' && !vr.ok && vr.reason === VISITOR_REASON, 'newcomers can join as visitors');
  N.setJoinRole('builder');

  // a new code keeps everyone in
  N.transport = { renew: async () => 'NEWCDE', close() {} };
  const before = players();
  const code = await N.newCode();
  ok(code === 'NEWCDE' && N.code === 'NEWCDE' && players() === before && !vic.ended, 'a new code keeps everyone who is already in');
  vic.s.close();
  await until(() => players() === 2);
  N.setApprove(true);
}

// ---------------------------------------- 8. the host closes the town
{
  const g4 = makeGame('fay');
  const [a, b] = pipe('peer-fay');
  host.net.addLink(makeLink(a));
  let fay = null, waited = false;
  new GuestSession(g4, makeLink(b), { name: 'Fay', onWait: () => { waited = true; } }).join().catch((e) => { fay = e.message; });
  await until(() => waited);
  host.net.close();
  await until(() => fay);
  ok(/closed/.test(fay || ''), `someone waiting to join is told the town closed ("${fay}")`);
  await until(() => ended, 2000);
  ok(ended === 'ended', `the guest is told the host closed the town ("${ended}")`);
  let res = null;
  guest.net.request({ t: 'tax', rate: 3 }, (r) => { res = r; });
  ok(res && !res.ok, 'commands after that are refused locally, not lost');
  ok(guest.world.buildings.size === hw.buildings.size, 'the guest still has the whole town to keep');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall multiplayer checks passed');
process.exit(failures ? 1 : 0);
