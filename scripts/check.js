// Headless smoke test: generates worlds, builds every model, runs the
// simulation for a few in-game days and round-trips a save.
// Usage: npm install three@0.170.0 --no-save && node scripts/check.js

import { World } from '../src/world/world.js';
import { growDemoTown } from '../src/world/demo.js';
import { PathFinder } from '../src/sim/path.js';
import { Sim } from '../src/sim/sim.js';
import { Agents } from '../src/sim/agents.js';
import { Transit } from '../src/sim/transit.js';
import { Animals } from '../src/sim/animals.js';
import { Construction } from '../src/sim/construction.js';
import { siteGeo, bodyBox } from '../src/render/construction.js';
import { serialize, deserialize } from '../src/save/saves.js';
import { buildModel, STYLES } from '../src/render/buildings.js';
import { fw, fd } from '../src/world/world.js';
import { BUILDINGS } from '../src/defs.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };

// 1. every model builds
let verts = 0;
for (const [type, def] of Object.entries(BUILDINGS)) {
  def.levels.forEach((_, level) => {
    for (const variant of [1, 2, 3, 4]) {
      const W = def.merged ? (variant % 2 ? 2 : 1) : def.size, D = def.merged ? (variant % 2 ? 1 : 2) : def.size;
      const flavor = type === 'shophouse' ? ['market', 'bakery', 'tavern', 'market'][variant - 1] : null;
      const look = variant === 4 ? STYLES[level % STYLES.length].id : null;
      const ext = variant === 3 && def.size === 1 ? { x0: type === 'house' ? -0.25 : 0.25, x1: 0, z0: 0, z1: 0 } : null;
      const b = { type, level, variant, flavor, look, ext, size: Math.max(W, D), w: W, d: D, baseY: 0.5, minY: 0.2, rot: variant % 4, rail: def.needsRail ? { x: 0, z: 0, dir: 0 } : null };
      const m = buildModel(b);
      if (!m.geo || !m.geo.attributes.position.count) throw new Error(`empty model ${type} L${level}`);
      for (const v of m.geo.attributes.position.array) if (!Number.isFinite(v)) throw new Error(`NaN in ${type} L${level}`);
      verts += m.geo.attributes.position.count;
      // and every stage of putting it up / taking it down
      if (variant === 1) {
        const box = bodyBox(m.geo);
        for (const kind of ['build', 'merge', 'dismantle', 'upgrade']) for (const p of [0, 0.15, 0.5, 0.95]) {
          const g = siteGeo({ target: m.geo, old: m.geo, box, oldBox: box, kind, p, wait: null, Ex: W / 2, Ez: D / 2, gy: () => 0, seed: 7 });
          for (const v of g.attributes.position.array) if (!Number.isFinite(v)) throw new Error(`NaN in site ${type} ${kind}`);
        }
      }
    }
  });
}
ok(true, `all building models build (${verts} verts total)`);

// 2. terrain generation over many seeds
for (let s = 1; s <= 25; s++) {
  const w = World.createNew({ N: 48, seed: s * 7919, name: 'T' });
  const th = [...w.buildings.values()].find(b => b.type === 'townhall');
  if (!th) { ok(false, `seed ${s}: no town hall`); continue; }
  if (!th.connected) ok(false, `seed ${s}: town hall not connected`);
}
ok(true, 'generated 25 worlds');

// 3. simulation
const scene = { add() {}, remove() {} };
const events = {};
const game = {
  speed: 4, env: { night: 0 },
  renderer: { scene, worldToScreen: () => ({ x: 0, y: 0 }) },
  view: { smoke: { emit() {} } },
  _ev: {},
  on(e, f) { (this._ev[e] ||= []).push(f); },
  emit(e, d) { events[e] = (events[e] || 0) + 1; for (const f of this._ev[e] || []) f(d); },
};
const w = World.createNew({ N: 48, seed: 4242, name: 'Testbury' });
ok([...w.buildings.values()].some(b => b.type === 'builder'), "new towns start with a builder's yard");
growDemoTown(w, 99, 1);
ok([...w.buildings.values()].some(b => b.type === 'terrace' || b.type === 'shophouse'), 'demo town has joined buildings');
game.world = w;
game.paths = new PathFinder(w);
game.sim = new Sim(game);
game.transit = new Transit(game);
game.sim.seedFounders();
game.agents = new Agents(game);
game.construction = new Construction(game);
game.on('day', () => game.transit.planCarts());
const step = (dt) => { const g = game.sim.update(dt); game.agents.update(dt, g); game.construction.update(dt, g); game.transit.update(dt); return g; };
game.transit.rebuild();
game.transit.planCarts();
const pop0 = w.population;
ok(pop0 > 10, `demo town seeded with ${pop0} villagers`);

// add a coach line between two stops along the roads
const stops = [];
for (let z = 0; z < w.N && stops.length < 3; z++) for (let x = 0; x < w.N && stops.length < 3; x++) {
  if (stops.some(s => Math.abs(s.x - x) + Math.abs(s.z - z) < 8)) continue;
  const r = w.placeBuilding('coachstop', x, z, { free: true, ignoreMoney: true, instant: true });
  if (r.ok && r.building.connected) stops.push(r.building); else if (r.ok) w.removeBuilding(r.building.id, 0);
}
w.money += 1000;
const line = game.transit.createLine('coach', stops.map(s => s.id));
ok(line.ok, `coach line created through ${stops.length} stops (${line.reason || 'ok'})`);
game.transit.rebuild();

let maxWalkers = 0, frames = 0;
const startDay = w.day;
while (w.day < startDay + 6 && frames < 40000) {
  step(0.1);
  maxWalkers = Math.max(maxWalkers, game.agents.walkers.size);
  frames++;
}
ok(w.day >= startDay + 6, `ran 6 days in ${frames} frames`);
ok(maxWalkers > 5, `villagers walked about (peak ${maxWalkers} on screen)`);
ok((events.coins || 0) > 0, `shops / fares earned coins (${events.coins} payouts, ${w.stats.visitIncome} coins)`);
const st = game.transit.stats[line.line?.id] || { riders: 0 };
console.log('      coach riders:', st.riders, ' population:', pop0, '→', w.population, ' money:', Math.round(w.money), ' happiness:', Math.round(game.sim.happiness));
ok(game.transit.vehicles.length === 1, 'one coach on the line');

// 3b. railway: trains never reverse, so a dead-end line is refused and a
// loop of track runs forward forever
{
  w.setSandbox({ infiniteMoney: true, unlockAll: true });
  const W = 10, H = 5;
  let spot = null;
  for (let z0 = 3; z0 < w.N - H - 3 && !spot; z0++) {
    for (let x0 = 2; x0 < w.N - W - 2 && !spot; x0++) {
      const ring = [];
      for (let x = x0; x <= x0 + W; x++) ring.push([x, z0], [x, z0 + H]);
      for (let z = z0 + 1; z < z0 + H; z++) ring.push([x0, z], [x0 + W, z]);
      const okRing = ring.every(([tx, tz]) => w.checkRail(tx, tz).ok && !w.roadAt(tx, tz));
      const st1 = [x0 + 3, z0 - 1], st2 = [x0 + W - 3, z0 + H + 1];
      const okSt = w.checkRoad(st1[0], st1[1] - 1, 1).ok && w.checkRoad(st2[0], st2[1] + 1, 1).ok
        && [st1, st2, [x0 + W - 2, z0 + 2], [x0 + W - 1, z0 + 2]].every(([tx, tz]) => w.inBounds(tx, tz) && !w.buildingOn(tx, tz) && !w.roadAt(tx, tz) && !w.terrain.isWater(tx, tz) && w.terrain.slope(tx, tz) < 0.5);
      if (okRing && okSt) spot = { x0, z0, ring, st1, st2 };
    }
  }
  if (spot) {
    const { x0, z0, ring, st1, st2 } = spot;
    const top = ring.filter(([, tz]) => tz === z0);
    w.placeRails(top);
    w.placeRoads([[st1[0], st1[1] - 1]], 1);
    const s1 = w.placeBuilding('station', st1[0], st1[1], { instant: true });
    // second station on a spur off the top row: a dead end the train would have to back out of
    w.placeRails([[x0 + W - 3, z0 + 1], [x0 + W - 3, z0 + 2]]);
    w.placeRoads([[x0 + W - 1, z0 + 2]], 1);
    const s2tmp = w.placeBuilding('station', x0 + W - 2, z0 + 2, { instant: true });
    ok(s1.ok && s2tmp.ok, 'stations placed beside the track');
    const dead = game.transit.createLine('rail', [s1.building.id, s2tmp.building.id]);
    ok(!dead.ok && /reverse/.test(dead.reason), `dead-end line refused ("${dead.reason}")`);
    w.removeBuilding(s2tmp.building.id);
    w.removeRail(x0 + W - 3, z0 + 1); w.removeRail(x0 + W - 3, z0 + 2);
    // complete the loop and put the second station on the far side
    w.placeRails(ring);
    w.placeRoads([[st2[0], st2[1] + 1]], 1);
    const s2 = w.placeBuilding('station', st2[0], st2[1], { instant: true });
    const rl = game.transit.createLine('rail', [s1.building.id, s2.building.id]);
    ok(rl.ok, `loop line created (${rl.reason || 'ok'})`);
    game.transit.rebuild();
    const v = game.transit.vehicles.find(v => v.line.mode === 'rail');
    const L = v.route.length;
    const visited = new Set();
    let backwards = 0, laps = 0, minGap = Infinity, maxGap = 0, prev = v.s;
    for (let i = 0; i < 6000; i++) {
      step(0.05);
      const ds = ((v.s - prev) + L) % L;
      if (ds > L / 2) backwards++;
      if (v.s < prev - L / 2) laps++;
      prev = v.s;
      if (v.state === 'dwell') visited.add(v.next);
      const p0 = v.meshes[0].position, p1 = v.meshes[1].position;
      const gap = Math.hypot(p0.x - p1.x, p0.z - p1.z);
      minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
    }
    ok(backwards === 0, `train only ever moves forward (${laps} laps of a ${L.toFixed(1)}-tile loop)`);
    ok(laps >= 1, 'train completes laps of the loop');
    ok(visited.size === 2, `train calls at both stations (${[...visited].join(', ')})`);
    ok(minGap > 0.4 && maxGap < 0.62, `cars stay coupled (gap ${minGap.toFixed(2)}–${maxGap.toFixed(2)})`);
  } else console.log('      (no room for a rail loop on this map)');
  w.setSandbox({ infiniteMoney: false, unlockAll: false });
  ok(Number.isFinite(w.money), 'sandbox can be switched off again');
}

// 3c. animals keep out of buildings and stay in their habitat
{
  const animals = new Animals(game);
  const counts = {};
  for (const a of animals.list) counts[a.sp] = (counts[a.sp] || 0) + 1;
  ok(animals.list.length > 5, `animals spawned: ${JSON.stringify(counts)}`);
  let bad = 0;
  const check = () => {
    for (const a of animals.list) {
      const tx = Math.floor(a.x), tz = Math.floor(a.z);
      const b = w.buildingOn(tx, tz);
      const water = w.terrain.isWater(tx, tz);
      if (a.sp === 'duck') { if (!water) bad++; }
      else if (a.farm != null) { if (!b || b.id !== a.farm) bad++; }
      else if (b || water) bad++;
    }
  };
  for (let i = 0; i < 1500; i++) {
    game.sim.update(0.05); game.agents.update(0.05, 0.05); animals.update(0.05, 4);
    if (i % 25 === 0) check();
  }
  ok(bad === 0, `no animal walked into a building or out of its habitat (${bad} violations)`);
  // build right on top of a wild animal: it should be moved out of the way
  const wild = animals.list.find(a => a.farm == null && a.sp !== 'duck');
  if (wild) {
    const tx = Math.floor(wild.x), tz = Math.floor(wild.z);
    w.setSandbox({ infiniteMoney: true, unlockAll: true });
    w.placeRoads([[tx + 1, tz]], 1);
    const r = w.placeBuilding('house', tx, tz, {});
    for (let i = 0; i < 30; i++) animals.update(0.05, 1);
    if (r.ok) ok(!animals.list.includes(wild) || w.buildingOn(Math.floor(wild.x), Math.floor(wild.z)) === null, 'animal under a new building steps aside');
    w.setSandbox({ infiniteMoney: false, unlockAll: false });
  }
}

// 3d. construction: builders walk out, work on site, and finish the job
const freeSpot = (W = 1, D = 1, skip = new Set()) => {
  for (let z = 2; z < w.N - 3; z++) for (let x = 2; x < w.N - 3; x++) {
    if (skip.has(`${x},${z}`)) continue;
    const c = w.checkBuild('house', x, z, { w: W, d: D, ignoreMoney: true, ignoreUnlock: true });
    if (c.ok && c.access.some(a => a.conn)) return { x, z };
  }
  return null;
};
const runUntil = (pred, days = 6) => {
  const end = w.day + days;
  let peak = 0;
  while (w.day < end) {
    step(0.1);
    for (const c of game.construction.crew.values()) peak = Math.max(peak, c.onSite);
    if (pred()) return { ok: true, peak };
  }
  return { ok: false, peak };
};
{
  w.money = 1e6;
  const spot = freeSpot();
  const r = w.placeBuilding('house', spot.x, spot.z, {});
  ok(r.ok && r.building.con && r.building.con.kind === 'build', 'a new cottage starts as a building site');
  const t0 = w.day * 24 + w.hours;
  const res = runUntil(() => !r.building.con);
  const took = w.day * 24 + w.hours - t0;
  ok(res.ok && res.peak > 0, `builders put it up on site (peak ${res.peak} on site, ${took.toFixed(1)} game hours)`);
  ok(took > 2, 'construction takes a while');

  // branching upgrade with a chosen style
  w.setSandbox({ freeUpgrades: true, unlockAll: true });
  const h = r.building;
  h.level = 1;
  const opts = w.upgradeOptions(h);
  ok(opts.length === 2 && opts.map(o => o.type).join() === 'villa,flats', `a Family House can become: ${opts.map(o => o.type).join(' or ')}`);
  const up = w.upgradeBuilding(h.id, 'villa', 'stone');
  ok(up.ok && h.con && h.con.toType === 'villa', 'upgrade to a villa started');
  const res2 = runUntil(() => !h.con);
  ok(res2.ok && h.type === 'villa' && h.level === 0 && h.look === 'stone', `villa finished in stone (${h.type} L${h.level} ${h.look})`);

  // joining two neighbours
  let pair = null;
  for (const a of w.buildings.values()) {
    if (a.con) continue;
    const m = w.mergeOptions(a).find(m => m.type === 'terrace' || m.type === 'shophouse');
    if (m) { pair = [a, m]; break; }
  }
  if (pair) {
    const [a, m] = pair;
    const people = [...w.residents.values()].filter(r => r.home === a.id || r.home === m.other.id).length;
    const mr = w.mergeBuildings(a.id, m.other.id);
    const nb = mr.building;
    ok(mr.ok && fw(nb) * fd(nb) === 2 && !w.buildings.has(a.id), `joined into a ${m.name} on a ${fw(nb)}×${fd(nb)} plot`);
    const kept = [...w.residents.values()].filter(r => r.home === nb.id).length;
    ok(kept === people, `everyone moved in (${kept}/${people})`);
    ok(runUntil(() => !nb.con).ok, 'builders finished the joined building');
  } else ok(false, 'no pair of neighbours to join');

  // moving a house: taken down, carted over, rebuilt
  const home = [...w.buildings.values()].find(b => b.type === 'house' && !b.con && b.residents.length);
  const dest = freeSpot(1, 1, new Set([`${home.x},${home.z}`]));
  const who = home.residents.slice();
  const mv = w.moveBuilding(home.id, dest.x, dest.z);
  ok(mv.ok && home.con && home.con.kind === 'dismantle' && mv.building.con.wait === 'dismantle', 'move: old house is being taken down');
  ok(who.every(id => w.residents.get(id)?.home === mv.building.id), 'the household now belongs to the new plot');
  let sawHaul = false;
  const res3 = runUntil(() => { if (mv.building.con && mv.building.con.wait === 'haul') sawHaul = true; return !mv.building.con; }, 8);
  ok(res3.ok && !w.buildings.has(home.id), `moved house rebuilt on its new plot (old plot cleared, cart ${sawHaul ? 'used' : 'skipped'})`);

  // land deals never make plots overlap
  w.setSandbox({ instantBuild: true });
  let deals = 0;
  for (let k = 0; k < 6; k++) w.encroachPass();
  for (const b of w.buildings.values()) deals += (b.leases || []).filter(l => l.buyer).length;
  if (!deals) {
    // make one: a villa next to a cottage
    for (const b of w.buildings.values()) {
      if (b.type !== 'house' || b.con) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = w.checkBuild('villa', b.x + dx, b.z + dz, { ignoreMoney: true, ignoreUnlock: true });
        if (!c.ok) continue;
        const v = w.placeBuilding('villa', b.x + dx, b.z + dz, { ignoreUnlock: true });
        if (v.ok) w.tryEncroach(v.building);
        break;
      }
      deals = [...w.buildings.values()].reduce((n, x) => n + (x.leases || []).filter(l => l.buyer).length, 0);
      if (deals) break;
    }
  }
  const DIR = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const rects = [...w.buildings.values()].map(b => {
    const e = { x0: 0, x1: 0, z0: 0, z1: 0, ...(b.ext || {}) };
    const [dx, dz] = DIR[b.rot], f = b.front || 0;
    if (dx > 0) e.x1 += f; if (dx < 0) e.x0 += f; if (dz > 0) e.z1 += f; if (dz < 0) e.z0 += f;
    return [b.x - e.x0, b.z - e.z0, b.x + fw(b) + e.x1, b.z + fd(b) + e.z1, b.id];
  });
  ok([...w.buildings.values()].some(b => b.front > 0), `buildings come forward to the street (${[...w.buildings.values()].filter(b => b.front > 0).length})`);
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6) overlaps++;
  }
  ok(deals > 0, `big homes bought garden land (${deals} deal${deals === 1 ? '' : 's'})`);
  ok(overlaps === 0, `no two plots overlap after land deals (${overlaps})`);
  w.setSandbox({ freeUpgrades: false, unlockAll: false, instantBuild: false });
}

// 3d0. combination joins: every recipe yields its building (in a fresh
// town with a long street, so there is room for every pair)
{
  const { MERGES } = await import('../src/defs.js');
  const tw = World.createNew({ N: 64, seed: 31, name: 'Joinbury' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const made = [];
  for (const m of MERGES) {
    let done = false;
    for (let z = 3; z < tw.N - 4 && !done; z++) for (let x = 3; x < tw.N - 5 && !done; x++) {
      // a short street in front of the pair
      if (![x, x + 1].every(k => tw.checkRoad(k, z - 1, 1).ok || tw.roadAt(k, z - 1))) continue;
      if (![[x, z], [x + 1, z]].every(([a, b]) => tw.inBounds(a, b) && !tw.buildingOn(a, b) && !tw.roadAt(a, b) && !tw.terrain.isWater(a, b))) continue;
      tw.placeRoads([[x, z - 1], [x + 1, z - 1]], 1);
      const A = tw.placeBuilding(m.a[0], x, z, { instant: true }), B = tw.placeBuilding(m.b[0], x + 1, z, { instant: true });
      const r = A.ok && B.ok ? tw.mergeBuildings(A.building.id, B.building.id) : { ok: false };
      if (r.ok && r.building.type === m.to) { made.push(m.to); done = true; }
      else for (const P of [A, B]) if (P.ok && tw.buildings.has(P.building.id)) tw.removeBuilding(P.building.id, 0);
    }
  }
  ok(made.length === MERGES.length, `every join recipe works (${made.join(', ')})`);
}

// 3d1. expanding onto a neighbouring plot
{
  w.setSandbox({ infiniteMoney: true });
  let done = null;
  for (const b of [...w.buildings.values()]) {
    if (b.type !== 'house' || b.con) continue;
    const opt = w.expandOptions(b).find(o => o.kind === 'land') || w.expandOptions(b).find(o => o.kind === 'takeover');
    if (!opt) continue;
    const cap0 = b.level >= 0 ? (b.residents.length, null) : null; void cap0;
    const r = w.expandBuilding(b.id, opt.dir, opt.kind);
    if (r.ok) { done = { b, opt }; break; }
  }
  ok(done && fw(done.b) * fd(done.b) === 2 && done.b.con && done.b.con.expand, `a house expands onto a neighbouring plot (${done ? done.opt.kind : 'none'})`);
  if (done) {
    ok(w.buildingOn(done.opt.x, done.opt.z) === done.b, 'the new plot belongs to it');
    ok(runUntil(() => !done.b.con).ok, 'builders finished the extension');
    const big = w.upgradeOptions(done.b).filter(o => o.large).map(o => o.type);
    ok(big.length >= 2, `the bigger plot opens larger paths: ${big.join(', ')}`);
  }
  w.setSandbox({ infiniteMoney: false });
  w.money = 1e6;
}

// 3d2. demolition takes a crew and some time
{
  const target = [...w.buildings.values()].find(b => b.type === 'house' && !b.con && b.residents.length);
  const people = target.residents.slice();
  const r = w.demolishBuilding(target.id);
  ok(r.ok && target.con && target.con.kind === 'demolish', 'demolition starts as a job for a crew');
  ok(people.every(id => w.residents.get(id)?.home !== target.id), 'the household moved out at once');
  const res = runUntil(() => !w.buildings.has(target.id), 4);
  ok(res.ok, `the crew pulled it down (peak ${res.peak} on site)`);
}

// 3d3. research gates buildings and is earned daily
{
  const fresh = World.createNew({ N: 32, seed: 99, name: 'Lab' });
  let spot = null;
  for (let z = 1; z < 31 && !spot; z++) for (let x = 1; x < 31 && !spot; x++) if (fresh.checkBuild('house', x, z, { ignoreMoney: true }).ok) spot = [x, z];
  fresh.residents.set(9999, { id: 9999, age: 'adult' });
  for (let i = 0; i < 40; i++) fresh.residents.set(10000 + i, { id: 10000 + i, age: 'adult' });
  const c1 = fresh.checkBuild('bakery', spot[0], spot[1], { ignoreMoney: true });
  ok(!c1.ok && /Research/.test(c1.reason), `a bakery needs research first ("${c1.reason}")`);
  ok(fresh.startResearch('commerce') && fresh.research.current === 'commerce', 'research project started');
  fresh.addResearch(30);
  ok(fresh.research.done.includes('commerce') && fresh.checkBuild('bakery', spot[0], spot[1], { ignoreMoney: true }).ok, 'finished research unlocks the bakery');
  ok(!fresh.canResearch('highrise'), 'later projects wait for their prerequisites');
}

// 3e. utilities: a generator powers the town, demand is counted
{
  game.sim.recompute();
  const before = [...w.buildings.values()].filter(b => b.powered).length;
  let gen = null;
  for (let z = 2; z < w.N - 3 && !gen; z++) for (let x = 2; x < w.N - 3 && !gen; x++) {
    const r = w.placeBuilding('windgen', x, z, { instant: true, ignoreMoney: true, ignoreUnlock: true });
    if (r.ok && r.building.connected) gen = r.building; else if (r.ok) w.removeBuilding(r.building.id, 0);
  }
  game.sim.recompute();
  const U = game.sim.utility;
  const after = [...w.buildings.values()].filter(b => b.powered).length;
  ok(gen && U.power.gen >= 25 && after > before, `a wind generator powers ${after} buildings (${U.power.demand}/${U.power.gen} kW)`);
  ok(U.water.supply > 0 && U.water.demand === w.population, `water: ${U.water.demand} villagers, supply for ${U.water.supply}`);
}

// 4. save round-trip
const data = serialize(w);
const json = JSON.stringify(data);
const w2 = deserialize(JSON.parse(json));
ok(w2.buildings.size === w.buildings.size, `save round-trip buildings (${w.buildings.size}) — ${(json.length / 1024).toFixed(0)} KB`);
ok(w2.residents.size === w.residents.size, `save round-trip residents (${w.residents.size})`);
ok(w2.trees.length === w.trees.length, `save round-trip trees (${w.trees.length})`);
ok(w2.lines.length === w.lines.length, 'save round-trip lines');
ok(JSON.stringify(w2.research.done) === JSON.stringify(w.research.done), 'save round-trip research');
ok([...w.buildings.values()].every(b => { const c = w2.buildings.get(b.id); return c && c.type === b.type && fw(c) === fw(b) && fd(c) === fd(b) && (c.look || null) === (b.look || null) && JSON.stringify(c.leases || []) === JSON.stringify(b.leases || []); }), 'save round-trip plots, styles and land deals');
let same = true;
for (let i = 0; i < w.terrain.H.length; i++) if (Math.abs(w.terrain.H[i] - w2.terrain.H[i]) > 0.001) same = false;
ok(same, 'save round-trip heights');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
