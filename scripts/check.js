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
import { fw, fd, capOf } from '../src/world/world.js';
import { BUILDINGS, TECHS } from '../src/defs.js';
import { makeAudit } from './audit.js';

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
// ...and a shop with homes above for every trade it can be joined from
{
  const { MERGES } = await import('../src/defs.js');
  const flavors = MERGES.find(m => m.to === 'shophouse').b;
  for (const flavor of flavors) for (let level = 0; level < BUILDINGS.shophouse.levels.length; level++) for (const rot of [0, 1]) {
    const b = { type: 'shophouse', level, variant: 5 + level, flavor, size: 2, w: rot ? 1 : 2, d: rot ? 2 : 1, baseY: 0.5, minY: 0.2, rot };
    const m = buildModel(b);
    if (!m.geo || !m.geo.attributes.position.count || !m.door) throw new Error(`shophouse ${flavor} L${level}`);
  }
  ok(true, `a shop with homes above builds for every trade it is joined from (${flavors.join(', ')})`);
}
// ...and depends only on the building, not on what the page built before it
// (the title screen's random demo town): every model built in a fresh
// process, and again in one that has built a different town first
{
  const { execFileSync } = await import('node:child_process');
  const src = (p) => JSON.stringify(new URL(`../src/${p}`, import.meta.url).href);
  const hashes = (warm) => execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { World } = await import(${src('world/world.js')});
    const { growDemoTown } = await import(${src('world/demo.js')});
    const { buildModel } = await import(${src('render/buildings.js')});
    const { BUILDINGS } = await import(${src('defs.js')});
    if (${warm}) {
      const w = World.createNew({ N: 44, seed: ${warm}, name: 'T' });
      growDemoTown(w, ${warm}, 1);
      for (const b of w.buildings.values()) buildModel(b, { ground: (x, z) => w.terrain.heightAt(x, z) });
    }
    const ground = (x, z) => 0.5 + 0.08 * Math.sin(x * 1.7) + 0.06 * Math.cos(z * 1.3), out = [];
    for (const [type, def] of Object.entries(BUILDINGS)) def.levels.forEach((_, level) => {
      for (const variant of [21, 22]) {
        const W = def.merged ? 2 : def.size, D = def.merged ? 1 : def.size;
        const b = { type, level, variant, x: 3, z: 5, size: Math.max(W, D), w: W, d: D, baseY: 0.6, minY: 0.4, rot: variant % 4, rail: def.needsRail ? { x: 0, z: 0, dir: 0 } : null };
        const at = buildModel(b, { ground }).geo.attributes;
        let h = 2166136261;
        for (const a of [at.position.array, at.color.array]) for (const x of new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) h = Math.imul(h ^ x, 16777619);
        out.push(type + ' L' + level + ':' + (h >>> 0).toString(16));
      }
    });
    process.stdout.write(out.join('\\n'));
  `]).toString().split('\n');
  const cold = hashes(0), changed = [];
  for (const warm of [101, 202]) hashes(warm).forEach((h, i) => { if (h !== cold[i]) changed.push(h.split(':')[0]); });
  ok(cold.length > 100 && !changed.length, `building models are the same whatever was built before them (${cold.length} models${changed.length ? `; changed: ${[...new Set(changed)].slice(0, 6).join(', ')}` : ''})`);
}

// 1b. shops: on a street corner (b.corner) the shopfront turns the corner,
// the model stays inside its plot and the villagers' way in stays the shop
// door at the front (not the back door every shop now has); and a shop with
// homes above keeps the look of its trade, so no two trades look alike
{
  const { CORNER_SHOPS, MERGES } = await import('../src/defs.js');
  const THREE = await import('three');
  const bad = [];
  let shops = 0;
  for (const type of CORNER_SHOPS) {
    const def = BUILDINGS[type];
    def.levels.forEach((_, level) => {
      const bw = def.merged ? 2 : def.size, bd = def.merged ? 1 : def.size;
      const base = { type, level, variant: 11 + level, flavor: def.merged ? 'grocer' : null, size: def.size, w: bw, d: bd, baseY: 0, minY: 0, rot: 0 };
      const plain = buildModel(base, { flat: true });
      // the open market and the market hall have no shopfront; the inn's
      // wings and the ironmonger's open store take their right-hand side
      const none = type === 'market' && (level === 0 || level === 3), right = (type === 'tavern' && level > 0) || (type === 'ironmonger' && level === 0);
      for (const corner of [1, 2, 3]) {
        const m = buildModel({ ...base, corner }, { flat: true }), bb = new THREE.Box3().setFromBufferAttribute(m.geo.attributes.position);
        shops++;
        if (m.geo.attributes.position.count <= plain.geo.attributes.position.count && !none && !(right && corner === 2)) bad.push(`${type} L${level} corner ${corner}: no side front`);
        if (bb.min.x < -bw / 2 - 0.005 || bb.max.x > bw / 2 + 0.005 || bb.min.z < -bd / 2 - 0.005 || bb.max.z > bd / 2 + 0.005) bad.push(`${type} L${level} corner ${corner}: off its plot`);
        if (plain.door && (!m.door || m.door.dz < 0.9)) bad.push(`${type} L${level} corner ${corner}: the way in faces ${m.door && m.door.dz.toFixed(2)}`);
      }
    });
  }
  ok(!bad.length, `corner shops turn their shopfront round the corner, inside their plots, the door still at the front (${shops} models)${bad.length ? ': ' + bad.join('; ') : ''}`);
  const flavors = MERGES.find(m => m.to === 'shophouse').b, alike = [];
  for (let level = 0; level < BUILDINGS.shophouse.levels.length; level++) {
    const seen = new Map();
    for (const flavor of flavors) {
      const g = buildModel({ type: 'shophouse', level, variant: 9, flavor, size: 2, w: 2, d: 1, baseY: 0, minY: 0, rot: 0 }, { flat: true }).geo;
      const col = g.attributes.color.array;
      let sum = 0;
      for (let i = 0; i < col.length; i += 7) sum += col[i];
      const sig = `${g.attributes.position.count}:${sum.toFixed(2)}`;
      if (seen.has(sig)) alike.push(`L${level} ${seen.get(sig)} = ${flavor}`);
      seen.set(sig, flavor);
    }
  }
  ok(!alike.length, `a shop with homes above looks like its own trade at every level${alike.length ? ': ' + alike.join('; ') : ''}`);
}

// 1c. the world knows a shop stands on a street corner from the roads round
// it (b.corner: 1 its left, 2 its right), rebuilds it when that changes, and
// never saves it: a load works it out again
{
  const tw = World.createNew({ N: 48, seed: 77, name: 'Cornerby' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  let shop = null, sideRoad = null;
  const free = (x, z) => tw.inBounds(x, z) && !tw.buildingOn(x, z) && !tw.roadAt(x, z) && !tw.terrain.isWater(x, z) && tw.checkRoad(x, z, 1).ok;
  for (let z = 4; z < tw.N - 5 && !shop; z++) for (let x = 4; x < tw.N - 5 && !shop; x++) {
    // a street in front (z - 1) and a side street down the right (x + 1), and nothing else round it
    const street = [[x - 1, z - 1], [x, z - 1], [x + 1, z - 1]], side = [[x + 1, z], [x + 1, z + 1]];
    if (![...street, ...side, [x, z], [x - 1, z], [x, z + 1]].every(([a, b]) => free(a, b))) continue;
    tw.placeRoads(street, 1);
    const r = tw.placeBuilding('grocer', x, z, { instant: true });
    if (!r.ok || r.building.rot !== 2) { if (r.ok) tw.removeBuilding(r.building.id, 0); continue; }
    shop = r.building; sideRoad = side;
  }
  ok(!!shop && !shop.corner, 'a shop with only a street in front is not on a corner');
  if (shop) {
    const refits = [];
    tw.on('building:refit', (b) => refits.push(b.id));
    tw.placeRoads(sideRoad, 1);
    // facing -z (rot 2), the side street at x + 1 is on its left
    ok(shop.corner === 1 && refits.includes(shop.id), `a side street turning the corner makes it a corner shop, rebuilt (corner ${shop.corner})`);
    const saved = JSON.stringify(serialize(tw));
    ok(!saved.includes('corner'), 'the corner is never saved');
    const tw2 = deserialize(JSON.parse(saved));
    ok(tw2.buildings.get(shop.id).corner === 1, 'a loaded town works the corner out again');
    refits.length = 0;
    for (const [x, z] of sideRoad) tw.removeRoad(x, z);
    ok(!shop.corner && refits.includes(shop.id), 'taking the side street up makes it an ordinary shop again');
  }
}

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
{
  // the happiness breakdown shown to the player must add up to the real score
  const homes = [...w.buildings.values()].filter(b => b.factors && b.factors.parts);
  const off = homes.filter(b => {
    const sum = b.factors.parts.reduce((n, p) => n + p[1], 0);
    return Math.abs(Math.max(0, Math.min(100, Math.round(sum))) - b.happiness) > 1;
  });
  ok(homes.length > 0 && !off.length, `happiness breakdowns add up (${homes.length} homes${off.length ? `, ${off.length} off` : ''})`);
}

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
  // founders are random: make sure the builder's yard has a builder
  const yard = [...w.buildings.values()].find(b => BUILDINGS[b.type].builders);
  if (yard && ![...w.residents.values()].some(r => r.job === yard.id)) {
    const hand = [...w.residents.values()].find(r => r.age === 'adult');
    if (hand) { hand.job = yard.id; game.sim.recompute(); }
  }
  const spot = freeSpot();
  const r = w.placeBuilding('house', spot.x, spot.z, {});
  ok(r.ok && r.building.con && r.building.con.kind === 'build', 'a new cottage starts as a building site');
  // hired hands start every site at once; make this one big enough that the
  // town's builders, on their slow walk from the yard, get there before
  // the hands finish it
  r.building.con.work *= 20;
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
  // a new style without an upgrade: paid for, and a job for the builders
  {
    const m0 = w.money, chk = w.restyleCheck(h, 'brick');
    const rr = w.restyleBuilding(h.id, 'brick');
    ok(chk.ok && rr.ok && w.money === m0 - chk.cost && chk.cost === Math.max(30, Math.round(w.buildValue(h) * 0.3)) && h.con && h.con.restyle && h.type === 'villa' && h.level === 0, `restyling without an upgrade costs $${chk.cost} and starts a job`);
    ok(runUntil(() => !h.con).ok && h.look === 'brick' && h.type === 'villa' && h.level === 0, 'builders restyle it in brick, same building and level');
    ok(!w.restyleBuilding(h.id, 'brick').ok, 'restyling to the style it has already is refused');
  }

  // a site the player puts first gets the builders before an older one
  {
    const { runCommand } = await import('../src/commands.js');
    const sa = freeSpot(), A = w.placeBuilding('house', sa.x, sa.z, {}).building;
    const sb = freeSpot(), B = w.placeBuilding('house', sb.x, sb.z, {}).building;
    A.con.work *= 20; B.con.work *= 20;   // so the hired hands don't finish them before the builders come
    const pr = runCommand(game, { t: 'priority', id: B.id, on: true });
    const crew = (b) => game.construction.crew.get(b.id) || { assigned: 0 };
    const got = runUntil(() => crew(A).assigned > 0 || crew(B).assigned > 0);
    ok(pr.ok && B.con && B.con.priority === true && got.ok && crew(B).assigned > 0 && crew(A).assigned === 0, `a site put first gets the builders before an older one (${crew(B).assigned} at it, ${crew(A).assigned} at the older)`);
    ok(deserialize(JSON.parse(JSON.stringify(serialize(w)))).buildings.get(B.id).con.priority === true, "saves keep a site's priority");
    ok(!runCommand(game, { t: 'priority', id: h.id, on: true }).ok && !runCommand(game, { t: 'priority', id: B.id, on: 'yes' }).ok, 'only a building site can be put first, and only by a yes or no');
    ok(runUntil(() => !A.con && !B.con).ok, 'both sites get finished');
  }

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

// 3d0. combination joins: every pairing in every recipe yields its building,
// and no earlier recipe takes a pair meant for a later one (in a fresh town
// with a long street, so there is room for every pair)
// Two side-by-side plots with a short street in front, for joining tests.
const placePair = (tw, ta, tb) => {
  for (let z = 3; z < tw.N - 4; z++) for (let x = 3; x < tw.N - 5; x++) {
    if (![x, x + 1].every(k => tw.checkRoad(k, z - 1, 1).ok || tw.roadAt(k, z - 1))) continue;
    if (![[x, z], [x + 1, z]].every(([a, b]) => tw.inBounds(a, b) && !tw.buildingOn(a, b) && !tw.roadAt(a, b) && !tw.terrain.isWater(a, b))) continue;
    if (!tw.roadAt(x, z - 1) || !tw.roadAt(x + 1, z - 1)) tw.placeRoads([[x, z - 1], [x + 1, z - 1]], 1);
    const A = tw.placeBuilding(ta, x, z, { instant: true }), B = A.ok && tw.placeBuilding(tb, x + 1, z, { instant: true });
    if (A.ok && B.ok) return [A.building, B.building];
    for (const P of [A, B]) if (P && P.ok && tw.buildings.has(P.building.id)) tw.removeBuilding(P.building.id, 0);
  }
  return null;
};
{
  const { MERGES } = await import('../src/defs.js');
  const tw = World.createNew({ N: 64, seed: 31, name: 'Joinbury' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const pairs = [];
  for (const m of MERGES) for (const ta of m.a) for (const tb of m.b) pairs.push([ta, tb, m.to]);
  const wrong = [];
  for (const [ta, tb, to] of pairs) {
    const P = placePair(tw, ta, tb);
    const r = P ? tw.mergeBuildings(P[0].id, P[1].id) : { ok: false, reason: 'no room' };
    if (!r.ok || r.building.type !== to) wrong.push(`${ta} + ${tb} → ${r.ok ? r.building.type : r.reason} (not ${to})`);
  }
  ok(!wrong.length, `every pairing in every join recipe makes its building (${pairs.length} pairs, ${MERGES.length} recipes)${wrong.length ? ': ' + wrong.join('; ') : ''}`);
}

// 3d0d. a tea garden lifts the street round it and sells tea; a free library
// joined from a stationer and a school adds to research once it's staffed
{
  const { RESEARCH_SOURCES, tradesOf } = await import('../src/defs.js');
  const tw = World.createNew({ N: 48, seed: 35, name: 'Teaby' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const tg = { world: tw, speed: 0, _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); } };
  const sim = new Sim(tg);
  sim.seedFounders();
  const [Co, Gr] = placePair(tw, 'coffeehouse', 'garden');
  const i = tw.idx(Co.x, Co.z - 2);
  sim.recompute();
  const before = sim.appeal[i];
  const t = tw.mergeBuildings(Co.id, Gr.id);
  sim.recompute();
  ok(t.ok && t.building.type === 'teagarden' && tradesOf(t.building).includes('tea') && sim.appeal[i] > before, `a coffee house and a green make a Tea Garden that sells tea and lifts the street (appeal ${before.toFixed(1)} → ${sim.appeal[i].toFixed(1)})`);
  // the library goes on the town's own street, so it is connected and staffed
  let St = null, Sc = null;
  const conn = (t, x, z) => { const c = tw.checkBuild(t, x, z); return c.ok && c.access.some(a => a.conn); };
  for (let z = 1; z < tw.N - 1 && !St; z++) for (let x = 1; x < tw.N - 2 && !St; x++) {
    if (!conn('stationer', x, z) || !conn('school', x + 1, z)) continue;
    St = tw.placeBuilding('stationer', x, z, { instant: true }).building;
    Sc = tw.placeBuilding('school', x + 1, z, { instant: true }).building;
  }
  const lib = tw.mergeBuildings(St.id, Sc.id).building;
  for (const r of [...tw.residents.values()].filter(r => r.age === 'adult').slice(0, 2)) { r.job = lib.id; r.edu = 3; }
  sim.recompute();
  const src = sim.researchSources().find(s => s.name === 'Free Library');
  ok(lib.type === 'library' && RESEARCH_SOURCES.library && src && src.points > 0, `a stationer and a school make a Free Library that adds ${src ? src.points : 0} research a day`);
}

// 3d0c. a builder's yard joined with a woodcutter is still where the builders
// work from, and they work faster; a chapel keeps its look in its vicarage
{
  const tw = World.createNew({ N: 48, seed: 34, name: 'Yardley' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const [Y, Wd] = placePair(tw, 'builder', 'lumber');
  const r = tw.mergeBuildings(Y.id, Wd.id), def = r.ok && BUILDINGS[r.building.type];
  ok(def && def.builders && def.levels[0].rate > BUILDINGS.builder.levels[0].rate && capOf(r.building, 'jobs') >= 6, `a builder's yard and a woodcutter make a ${def && def.levels[0].name} whose builders work at ${def && def.levels[0].rate}×`);
  const [Ch, Co] = placePair(tw, 'house', 'chapel');
  const v = tw.mergeBuildings(Ch.id, Co.id);
  ok(v.ok && v.building.type === 'vicarage' && v.building.variant === Co.variant, 'a chapel taking in the cottage next door keeps the chapel\'s look');
}

// 3d0b. a joined building is never a level the town can't build yet, a grand
// home leads when it takes in a cottage, and the join says who must move out
{
  const tw = World.createNew({ N: 48, seed: 33, name: 'Clampton' });
  tw.money = 1e6;
  Object.defineProperty(tw, 'unlockPop', { value: 500 });
  tw.research.done.push('carpentry', 'joining', 'masonry', 'stonework', 'architecture', 'homes2', 'homes3', 'brickmaking', 'urban', 'flats');
  const [V, H] = placePair(tw, 'villa', 'house');
  V.level = 1;   // a Manor House
  let opt = tw.mergeOptions(V).find(m => m.other === H);
  ok(opt && opt.type === 'mansion' && opt.level === 0, `a Manor House and a cottage make a ${opt && opt.name} until Grand Architecture is researched`);
  tw.research.done.push('pigments', 'paints', 'grandarch');
  opt = tw.mergeOptions(V).find(m => m.other === H);
  ok(opt && opt.level === 1 && opt.name === 'Stately Home', `...and a ${opt && opt.name} after`);
  const r = tw.mergeBuildings(V.id, H.id);
  ok(r.ok && r.building.variant === V.variant, 'the villa leads: the joined house keeps its look, not the cottage\'s');
  const [F, G] = placePair(tw, 'flats', 'flats');
  F.level = G.level = 2;   // two Mansion Blocks, full
  const full = BUILDINGS.flats.levels[2].housing, room = BUILDINGS.apartments.levels[1].housing;
  F.residents = new Array(full).fill(0); G.residents = new Array(full).fill(0);
  tw.research.done.push('steam', 'electricity', 'hydraulics', 'highrise');
  opt = tw.mergeOptions(F).find(m => m.other === G);
  ok(opt && opt.name === 'Grand Apartments' && opt.moveOut === Math.max(0, 2 * full - room), `two full Mansion Blocks (${full} each) joined into the ${opt && opt.name} (${room}) say ${opt && opt.moveOut} must move out`);
  F.residents = []; G.residents = [];
  // ...and when the two hold more than what they become, the ones who won't fit
  const [V2, H2] = placePair(tw, 'villa', 'house');
  V2.level = 2; H2.level = 1;   // a Grand Manor and a Family House, full
  const a = BUILDINGS.villa.levels[2].housing, b = BUILDINGS.house.levels[1].housing, into = BUILDINGS.mansion.levels[1].housing;
  V2.residents = new Array(a).fill(0); H2.residents = new Array(b).fill(0);
  const o2 = tw.mergeOptions(V2).find(m => m.other === H2);
  ok(o2 && o2.name === 'Stately Home' && o2.moveOut === a + b - into && o2.moveOut > 0, `a full Grand Manor (${a}) and Family House (${b}) joined into a ${o2 && o2.name} (${into}) say ${o2 && o2.moveOut} must move out`);
  V2.residents = []; H2.residents = [];
}

// 3d0f. farms: the farmyard by the road with fields behind; farmland beyond
// the plot (touching it, up to a limit, priced, blocking building, cleared by
// the bulldozer and with the farm); what a farm produces; a homestead
{
  const { capOf, homeField, aheadOf } = await import('../src/world/world.js');
  const { CONFIG } = await import('../src/config.js');
  const { PRODUCE } = await import('../src/defs.js');
  const { workArea } = await import('../src/render/buildings.js');
  const tw = World.createNew({ N: 48, seed: 61, name: 'Furrowby' });
  tw.setSandbox({ unlockAll: true, instantBuild: true });
  tw.money = 1e5;
  const th = [...tw.buildings.values()].find(b => b.type === 'townhall');
  let F = null;
  for (let r = 3; r < 18 && !F; r++) for (let dz = -r; dz <= r && !F; dz++) for (let dx = -r; dx <= r && !F; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const c = tw.checkBuild('farm', th.x + dx, th.z + dz);
    if (!c.ok || !c.access.some(a => a.conn)) continue;
    const p = tw.placeBuilding('farm', th.x + dx, th.z + dz, { instant: true });
    if (p.ok) F = p.building;
  }
  ok(!!F, 'found room for a test farm');
  const wk = workArea(F), [fx, fz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][F.rot];
  const cx = F.x + 1, cz = F.z + 1, front = (x, z) => (x - cx) * fx + (z - cz) * fz;
  ok(front((wk[0] + wk[2]) / 2, (wk[1] + wk[3]) / 2) < 0, 'its fields lie behind the farmyard, away from the road');
  const ring = [];
  for (let z = F.z - 6; z < F.z + 8; z++) for (let x = F.x - 6; x < F.x + 8; x++) ring.push([x, z]);
  const far = tw.planFields(F.id, [[F.x - 6, F.z - 6]], true);
  ok(!far.n && /touch/.test(far.tiles[0].reason || ''), 'a field must touch the farm or its fields');
  const hf = homeField(F);
  ok(hf.length === 2 && hf.every(([x, z]) => tw.buildingAt[tw.idx(x, z)] === F.id && front(x + 0.5, z + 0.5) < 0), 'its own field is the back row of its plot, one farmland with the fields beyond');
  const ahead = ring.find(([x, z]) => aheadOf(F, x, z) > 0 && tw.inBounds(x, z) && !tw.roads[tw.idx(x, z)] && tw.buildingAt[tw.idx(x, z)] < 0 && !tw.terrain.isWater(x, z) && tw.terrain.slope(x, z) <= 0.6);
  ok(!ahead || /behind and beside/.test(tw._fieldBlock(F, ...ahead) || ''), 'fields go behind and beside a farm, not between it and the road');
  const m0 = tw.money, plan = tw.planFields(F.id, ring, true), r1 = tw.setFields(F.id, ring, true);
  ok(r1.ok && F.fields === CONFIG.FIELD_MAX[0] && tw.money === m0 - plan.cost && plan.cost >= CONFIG.FIELD_MAX[0] * CONFIG.FIELD_COST, `a farmstead ploughs up to ${CONFIG.FIELD_MAX[0]} fields at $${CONFIG.FIELD_COST} each ($${plan.cost})`);
  ok(capOf(F, 'jobs') === Math.round(BUILDINGS.farm.levels[0].jobs + F.fields * CONFIG.FIELD_JOBS), `each field adds work (${capOf(F, 'jobs')} jobs)`);
  tw.upgradeBuilding(F.id);
  ok(tw.setFields(F.id, ring, true).ok && F.fields === CONFIG.FIELD_MAX[1], `a farm works more (${F.fields})`);
  const fi = tw.fieldTiles.get(F.id)[0], fxz = [fi % tw.N, (fi / tw.N) | 0];
  ok(!tw.checkBuild('house', ...fxz).ok && !tw.checkRoad(...fxz, 1).ok, 'fields block buildings and roads');
  const n1 = F.fields;
  ok(tw.bulldoze(...fxz).ok && F.fields === n1 - 1 && tw.fields[fi] === -1, 'the bulldozer takes a field out');
  // what it produces: jobs and earnings
  const sim = new Sim({ world: tw, speed: 0, agents: { relocate() {}, depart() {}, arrive() {} }, _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); } });
  const j0 = capOf(F, 'jobs');
  ok(tw.setProduce(F.id, 'sheep').ok && F.flavor === 'sheep' && capOf(F, 'jobs') === Math.round((BUILDINGS.farm.levels[1].jobs + F.fields * CONFIG.FIELD_JOBS) * PRODUCE.sheep.jobs), `sheep take fewer hands (${j0} → ${capOf(F, 'jobs')})`);
  ok(!tw.setProduce(F.id, 'unicorns').ok && !tw.setProduce(F.id, 'sheep').ok, 'only real produce, and only a change');
  sim.recompute();
  F.working = 1;   // fully staffed, for the sum
  const perWorker = sim.incomeOf(F) / capOf(F, 'jobs');
  ok(perWorker > BUILDINGS.farm.levels[1].income * 1.4, `each shepherd earns more ($${perWorker.toFixed(1)} a worker)`);
  // saved and loaded
  const back = deserialize(JSON.parse(JSON.stringify(serialize(tw))));
  const FB = back.buildings.get(F.id);
  ok(FB.fields === F.fields && back.fields.every((v, i) => v === tw.fields[i]) && FB.flavor === 'sheep', 'saves keep the fields and what the farm keeps');
  // a homestead: a cottage beside it joined on
  let cot = null;
  for (let dz = -1; dz <= 2 && !cot; dz++) for (let dx = -1; dx <= 2 && !cot; dx++) {
    if ((dx === -1 || dx === 2) === (dz === -1 || dz === 2)) continue;
    const c = tw.checkBuild('house', F.x + dx, F.z + dz);
    if (c.ok) { const p = tw.placeBuilding('house', F.x + dx, F.z + dz, { instant: true }); if (p.ok) cot = p.building; }
  }
  if (cot) {
    sim.makeFamily(cot, 3);
    const people = cot.residents.slice();
    const opt = tw.mergeOptions(F).find(m => m.farmJoin && m.other === cot);
    const jr = opt && tw.mergeBuildings(F.id, cot.id);
    ok(jr && jr.ok && F.type === 'homestead' && !tw.buildings.has(cot.id) && people.every(id => tw.residents.get(id).home === F.id) && F.fields > 0 && F.flavor === 'sheep', `a cottage joined on makes it a homestead: the family moves in, the fields and flock stay (${people.length} people)`);
  } else ok(false, 'no room for a cottage beside the farm');
  // a farm turned orchard keeps its fields, planted with fruit trees
  {
    let G = null;
    for (let r = 6; r < 22 && !G; r++) for (let dz = -r; dz <= r && !G; dz++) for (let dx = -r; dx <= r && !G; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || Math.max(Math.abs(th.x + dx - F.x), Math.abs(th.z + dz - F.z)) < 10) continue;
      const c = tw.checkBuild('farm', th.x + dx, th.z + dz);
      if (!c.ok || !c.access.some(a => a.conn)) continue;
      const p = tw.placeBuilding('farm', th.x + dx, th.z + dz, { instant: true });
      if (p.ok) G = p.building;
    }
    if (G) {
      tw.upgradeBuilding(G.id);
      const near = [];
      for (let z = G.z - 4; z < G.z + 6; z++) for (let x = G.x - 4; x < G.x + 6; x++) near.push([x, z]);
      tw.setFields(G.id, near, true);
      const n0 = G.fields, u = tw.upgradeBuilding(G.id, 'orchard');
      ok(u.ok && G.type === 'orchard' && n0 > 0 && G.fields === n0 && tw.fieldMax(G) >= n0 && !homeField(G).length && !tw.setProduce(G.id, 'sheep').ok, `a farm turned orchard keeps its ${n0} fields (as fruit trees), and grows only fruit`);
    } else ok(false, 'no room for a second farm');
  }
  // gone with the farm
  const id = F.id;
  tw.removeBuilding(id, 0);
  ok(!tw.fields.some(v => v === id), 'its fields go with the farm');
}

// 3d0c. shopping trips spread over the trades the town sells: everyday food
// most, the town's only draper still gets the clothes shopping, a trade sold
// only far from home is shopped for less; offices take no shoppers, and a
// shop with homes above sells its own trade
{
  const { tradesOf, TRADES } = await import('../src/defs.js');
  const { visitKind } = await import('../src/sim/agents.js');
  const tw = World.createNew({ N: 48, seed: 35, name: 'Shopton' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const [home, mk] = placePair(tw, 'house', 'market');
  const near = ['bakery', 'butcher', 'draper'].map(t => placePair(tw, t, 'garden')[0]);
  const far = (() => {
    for (let z = tw.N - 6; z > 3; z--) for (let x = tw.N - 6; x > 3; x--) {
      const d = Math.abs(x - home.x) + Math.abs(z - home.z);
      if (d < 18 || d > 26 || !tw.checkRoad(x, z - 1, 1).ok) continue;
      if (tw.buildingOn(x, z) || tw.roadAt(x, z) || tw.terrain.isWater(x, z)) continue;
      tw.placeRoads([[x, z - 1]], 1);
      const r = tw.placeBuilding('bank', x, z, { instant: true });
      if (r.ok) return r.building;
    }
    return null;
  })();
  const shops = [mk, ...near, far].filter(Boolean);
  const A = { world: tw, _nearest: Agents.prototype._nearest };
  const n = 6000, got = new Map();
  for (let i = 0; i < n; i++) { const id = Agents.prototype._shopFor.call(A, { home: home.id }, shops); got.set(id, (got.get(id) || 0) + 1); }
  const share = (b) => (got.get(b.id) || 0) / n;
  const [bak, but, dra] = near;
  const pct = (b) => `${Math.round(share(b) * 100)}%`;
  ok(shops.every(b => share(b) > 0), `every trade gets shoppers (market ${pct(mk)}, bakery ${pct(bak)}, butcher ${pct(but)}, draper ${pct(dra)}${far ? `, a bank ${Math.abs(far.x - home.x) + Math.abs(far.z - home.z)} tiles off ${pct(far)}` : ''})`);
  ok(share(mk) > share(bak) && share(bak) > share(but) && share(but) > share(dra) && share(dra) > 0.05, 'everyday trades are shopped for most, clothes less, but the lone draper still gets its share');
  ok(!far || share(far) < 0.5 * TRADES.banking.often / TRADES.clothes.often * share(dra), 'a trade only sold far from home is shopped for less');
  ok(visitKind(BUILDINGS.offices) === null && !tradesOf({ type: 'offices' }).length, 'offices take no shoppers');
  ok(tradesOf({ type: 'shophouse', flavor: 'butcher' }).join() === 'meat' && tradesOf({ type: 'deptstore' }).includes('clothes') && !tradesOf({ type: 'deptstore' }).includes('banking'), 'a shophouse sells its own trade, a department store every trade but banking');
}

// 3d0d. somewhere to play: a home with children and a play area in reach is
// happier for it, one without children isn't asked, and children mostly
// head for somewhere to play
{
  const tw = World.createNew({ N: 48, seed: 37, name: 'Playford' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const [home, pg] = placePair(tw, 'house', 'playground');
  const [other, gd] = placePair(tw, 'house', 'garden');
  const kid = { id: tw.newId(), first: 'Pip', last: 'Swing', age: 'child', years: 8, edu: 0, home: home.id, job: null, look: 12345, mood: 60 };
  tw.residents.set(kid.id, kid); home.residents.push(kid.id);
  const tg = { world: tw, speed: 0, _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); } };
  const sim = new Sim(tg);
  const play = (b) => { sim.recompute(); sim._happiness(); const p = b.factors.parts.find(q => q[0] === 'play'); return p ? p[1] : null; };
  ok(play(home) === 4 && play(other) === null, 'a home with a child beside a play area gets +4 for somewhere to play; a home without children isn\'t asked');
  const A = { world: tw, _nearest: Agents.prototype._nearest, _shopFor: Agents.prototype._shopFor, _places: Agents.prototype._places, _candidates: (pred) => [...tw.buildings.values()].filter(b => pred(BUILDINGS[b.type], b)) };
  let toPlay = 0, outings = 0;
  for (let i = 0; i < 400; i++) { Agents.prototype.planDay.call(A, kid, null); for (const p of kid.plan) if (p.dest === pg.id || p.dest === gd.id) { outings++; if (p.dest === pg.id) toPlay++; } }
  ok(outings > 100 && toPlay / outings > 0.6, `children mostly head for somewhere to play (${Math.round((toPlay / outings) * 100)}% of ${outings} outings to the play area, the rest to the garden)`);
  tw.removeBuilding(pg.id, 0);
  ok(play(home) === 0, 'without the play area the home misses it');
}

// 3d1a. taking the land beside or behind a building leaves it where it
// stood: same place, same turn, same floor, before and after a save (which
// rounds the ground heights a little)
{
  const tw = World.createNew({ N: 48, seed: 39, name: 'Stayput' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const P = placePair(tw, 'bakery', 'flowers');
  const spot = { x: P[0].x, z: P[0].z };
  tw.removeBuilding(P[0].id, 0); tw.removeBuilding(P[1].id, 0);
  // where its front door is in the world, from its model
  const doorAt = (b) => {
    const m = buildModel(b), j = m.jitter, d = m.door, th = (b.rot * Math.PI) / 2 + j.yaw;
    const cx = b.x + fw(b) / 2 + j.ox, cz = b.z + fd(b) / 2 + j.oz;
    return [cx + d.x * Math.cos(th) + d.z * Math.sin(th), cz - d.x * Math.sin(th) + d.z * Math.cos(th), b.baseY];
  };
  const tried = [], moved = [];
  for (let k = 0; k < 4; k++) {
    for (const variant of [16, 48]) {   // both ends a seed would pick
      const r = tw.placeBuilding('bakery', spot.x, spot.z, { instant: true, variant });
      if (!r.ok) continue;
      const b = r.building, before = doorAt(b);
      const opt = tw.expandOptions(b).find(o => o.dir === k && o.kind === 'land');
      if (opt && tw.expandBuilding(b.id, k, 'land').ok) {
        const after = doorAt(b);
        const w2 = deserialize(JSON.parse(JSON.stringify(serialize(tw))));
        const loaded = doorAt(w2.buildings.get(b.id));
        const off = Math.max(...before.map((v, i) => Math.max(Math.abs(v - after[i]), Math.abs(v - loaded[i]))));
        tried.push(`${opt.where} v${variant}`);
        if (off > 1e-3) moved.push(`${opt.where} v${variant} by ${off.toFixed(3)}`);
      }
      tw.removeBuilding(b.id, 0);
    }
  }
  ok(tried.length >= 2 && !moved.length, `taking land leaves the building where it stood (${tried.join(', ')})${moved.length ? ': moved ' + moved.join('; ') : ''}`);
}

// 3d1b. ...and where the street ends beside it, the grown plot doesn't come
// forward over the neighbour in front of its new tile (only the building
// itself does, over its own street)
{
  const { auditTown } = await import('./audit.js');
  const tw = World.createNew({ N: 48, seed: 41, name: 'Streetend' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const free = (x, z) => tw.inBounds(x, z) && !tw.buildingOn(x, z) && !tw.roadAt(x, z) && !tw.terrain.isWater(x, z);
  let A = null, C = null;
  for (let z = 4; z < tw.N - 4 && !A; z++) for (let x = 4; x < tw.N - 4 && !A; x++) {
    // a street ending at (x, z - 1), the bakery behind its last tile, and a
    // neighbour on the tile past the end that faces another street
    if (![[x - 2, z - 1], [x - 1, z - 1], [x, z - 1], [x + 1, z - 2]].every(([a, c]) => tw.roadAt(a, c) || tw.checkRoad(a, c, 1).ok)) continue;
    if (![[x, z], [x + 1, z], [x + 1, z - 1]].every(([a, c]) => free(a, c))) continue;
    if (Math.abs(tw.terrain.tileMax(x, z) - tw.terrain.tileMin(x + 1, z)) > 0.6) continue;
    tw.placeRoads([[x - 2, z - 1], [x - 1, z - 1], [x, z - 1]], 1); tw.placeRoads([[x + 1, z - 2]], 1);
    const a = tw.placeBuilding('bakery', x, z, { instant: true });
    let c = null;
    for (let k = 0; k < 4 && a.ok && !(c && c.ok && c.building.rot === 2); k++) { if (c && c.ok) tw.removeBuilding(c.building.id, 0); c = tw.placeBuilding('bakery', x + 1, z - 1, { instant: true, accessIndex: k }); }
    if (a.ok && c && c.ok && a.building.rot === 2 && c.building.rot === 2) { A = a.building; C = c.building; }
    else for (const P of [a, c]) if (P && P.ok && tw.buildings.has(P.building.id)) tw.removeBuilding(P.building.id, 0);
  }
  const opt = A && tw.expandOptions(A).find(o => o.kind === 'land' && o.x === A.x + 1 && o.z === A.z);
  const grew = opt && tw.expandBuilding(A.id, opt.dir, 'land').ok;
  const faults = [];
  auditTown(tw, (m) => faults.push(m));
  ok(grew && !faults.some(m => /overlap/.test(m)) && (A.front || 0) === 0 && A.ownFront > 0, `a plot grown past the end of its street keeps behind the neighbour in front of its new tile (front ${A && A.front}, the building's own ${A && A.ownFront})${faults.length ? ': ' + faults.join('; ') : ''}`);
}

// 3d1. taking a neighbouring plot: the land first (no builders, the building
// stays its size), then what to build across it
{
  const { sizeK, sizeKFor } = await import('../src/world/world.js');
  const { CONFIG } = await import('../src/config.js');
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
  ok(done && fw(done.b) * fd(done.b) === 2 && !done.b.con && done.b.spare && sizeK(done.b) === 1, `a house takes a neighbouring plot (${done ? done.opt.kind : 'none'}) as land only: no builders, still its own size`);
  if (done) {
    const b = done.b;
    ok(w.buildingOn(done.opt.x, done.opt.z) === b, 'the new plot belongs to it');
    ok(done.opt.kind !== 'land' || done.opt.cost === CONFIG.PLOT_PRICE + w.treeCount[w.idx(done.opt.x, done.opt.z)] * 3, `an empty plot costs the price of the land ($${done.opt.cost})`);
    const opts = w.upgradeOptions(b), big = opts.filter(o => o.large).map(o => o.type);
    ok(big.length >= 2 && opts.some(o => o.extend), `then it can be rebuilt bigger (${big.join(', ')}) or extended`);
    const cap0 = capOf(b, 'housing'), chk = w.upgradeCheck(b, 'extend');
    ok(chk.target && chk.target.extend && chk.cost === Math.max(20, Math.round((BUILDINGS.house.levels.slice(0, b.level + 1).reduce((s, L) => s + L.cost, 0)) * (sizeKFor('house', 2, 1) - 1))), `extending costs what the extra half is worth ($${chk.cost})`);
    const r = w.upgradeBuilding(b.id, 'extend');
    ok(r.ok && b.con && b.con.extend && b.spare, 'builders extend it across the plot');
    ok(runUntil(() => !b.con).ok && !b.spare && sizeK(b) === 1.5 && capOf(b, 'housing') === Math.round(BUILDINGS.house.levels[b.level].housing * 1.5) && capOf(b, 'housing') > cap0, `extended, it holds half as many again (${cap0} → ${capOf(b, 'housing')})`);
  }
  w.setSandbox({ infiniteMoney: false });
  w.money = 1e6;
}

// 3d1a. land deals beside street corners: a plot never reaches into a third
// plot, whichever order the deals and the buildings come in
{
  // a small flat town: a street along z = 6, plus the road tiles given
  const back = Array.from({ length: 12 }, (_, x) => [x, 3]);
  const town = (roads, builds) => {
    const tw = new World(12, 1, { isWater: () => false, tileMin: () => 0, tileMax: () => 0 });
    tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
    for (let x = 0; x < 12; x++) tw.roads[tw.idx(x, 6)] = 1;
    for (const [x, z] of roads) tw.roads[tw.idx(x, z)] = 1;
    tw.entry = { x: 0, z: 6 };
    tw.updateRoadNetwork();
    const at = {};
    for (const [k, type, x, z] of builds) at[k] = tw.placeBuilding(type, x, z).building;
    return { tw, at };
  };
  const overlapsIn = (tw) => {
    const found = [];
    makeAudit({ world: tw, construction: {}, agents: { walkers: [] }, animals: { list: [] } }, (d, m) => { if (m.startsWith('plots overlap')) found.push(m); })(0);
    return found;
  };
  const axes = (b) => new Set((b.leases || []).filter(l => l.buyer).map(l => l.side[0]));
  // a villa between a cottage beside it and one behind it buys from only one
  // of them, so a chapel can still go on the corner plot between the two
  {
    const { tw, at } = town(back, [['v', 'villa', 5, 5], ['a', 'house', 4, 5], ['b', 'house', 5, 4]]);
    tw.tryEncroach(at.v);
    const c = tw.placeBuilding('chapel', 4, 4);
    ok(axes(at.v).size === 1 && c.ok && !overlapsIn(tw).length, `a villa buys garden on one axis only (${[...axes(at.v)]}) and the corner plot stays free ${overlapsIn(tw).join('; ')}`);
  }
  // a cottage between two villas sells a strip to one of them only
  {
    const { tw, at } = town(back, [['h', 'house', 5, 5], ['a', 'villa', 4, 5], ['b', 'villa', 5, 4]]);
    tw.tryEncroach(at.a); tw.tryEncroach(at.b);
    ok((at.h.leases || []).length === 1 && !overlapsIn(tw).length, `a cottage sells one strip at most (${(at.h.leases || []).length}) ${overlapsIn(tw).join('; ')}`);
  }
  // a villa facing the street with a strip of the garden beside it: its front
  // does not run into a building on the street corner next to it
  {
    // villa (5,4) faces the spur at (5,5); cottage (6,4) faces the spur at (7,4)
    const spurs = [[5, 5], [7, 4], [7, 5]];
    const a = town(spurs, [['v', 'villa', 5, 4], ['h', 'house', 6, 4]]);
    a.tw.tryEncroach(a.at.v);
    const kept = a.at.v.front > 0 && (a.at.v.leases || []).length === 1;
    a.tw.placeBuilding('market', 6, 5);
    const b = town(spurs, [['v', 'villa', 5, 4], ['h', 'house', 6, 4], ['m', 'market', 6, 5]]);
    b.tw.tryEncroach(b.at.v);
    ok(kept && (b.at.v.leases || []).length === 1 && !overlapsIn(a.tw).length && !overlapsIn(b.tw).length,
      `a villa with a strip beside it keeps clear of the corner plot (front ${a.at.v.front} / ${b.at.v.front}) ${[...overlapsIn(a.tw), ...overlapsIn(b.tw)].join('; ')}`);
  }
}

// 3d1e. single-family homes take one family (a few in the big houses), and
// newcomers to them come as one family sized to the house; a home with more
// households than it takes (an old save) lets the newest one move on
{
  const { householdCap } = await import('../src/world/world.js');
  const { householdsIn } = await import('../src/sim/people.js');
  const sim = game.sim;
  w.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const placeNear = (type) => {
    const th = [...w.buildings.values()].find(b => b.type === 'townhall');
    for (let r = 2; r < 20; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const c = w.checkBuild(type, th.x + dx, th.z + dz);
      if (!c.ok || !c.access.some(a => a.conn)) continue;
      const p = w.placeBuilding(type, th.x + dx, th.z + dz, { instant: true });
      if (p.ok) return p.building;
    }
    return null;
  };
  const evict = (b) => { for (const id of b.residents) w.residents.delete(id); b.residents = []; };
  const fh = placeNear('house');
  fh.level = 1;   // a Family House: room for 6, one household
  const sizes = [];
  for (let k = 0; k < 30; k++) { sizes.push(sim.makeFamily(fh, capOf(fh, 'housing')).length); evict(fh); }
  ok(sizes.every(n => n >= 5 && n <= 6), `newcomers to a family house come as one family of 5–6 (${Math.min(...sizes)}–${Math.max(...sizes)})`);
  sim.makeFamily(fh, 3);
  ok(householdsIn(w, fh) === 1 && fh.residents.length < capOf(fh, 'housing') && !sim.vacantHomes().includes(fh), 'with a family in, it takes no other household, though it has room');
  ok(householdCap({ type: 'house', level: 0 }) === 1 && householdCap({ type: 'villa', level: 2 }) === 2 && householdCap({ type: 'flats', level: 0 }) === Infinity, 'cottages and villas take one family, a grand manor two, flats any number');
  // an old save: two households in one cottage, and a home with room nearby
  const c = placeNear('house');
  evict(c);
  const lodger = sim.makeFamily(c, 1)[0], other = sim.makeFamily(c, 1)[0];
  lodger.fam = lodger.id; other.fam = other.id;
  const spare = placeNear('flats');
  sim.recompute();
  sim._settleHouseholds();
  ok(householdsIn(w, c) === 1 && c.residents.includes(lodger.id) && w.residents.get(other.id).home !== c.id, 'an extra household moves on to a home with room (the newest one)');
  for (const b of [fh, c, spare]) if (b && w.buildings.has(b.id)) { evict(b); w.removeBuilding(b.id, 0); }
  w.setSandbox({ infiniteMoney: false, unlockAll: false, instantBuild: false });
  w.money = 1e6;
}

// 3d1b. a home rebuilt to hold fewer people (a Grand Manor on a double plot
// becoming a Country Mansion): the households that no longer fit move out
{
  w.setSandbox({ infiniteMoney: true, unlockAll: true, freeUpgrades: true, instantBuild: true });
  const b = [...w.buildings.values()].find(b => b.type === 'house' && !b.con && fw(b) * fd(b) === 2);
  if (b) {
    b.type = 'villa'; b.level = 2;
    const people = () => [...w.residents.values()].filter(r => r.home === b.id);
    while (people().length < capOf(b, 'housing')) game.agents.arrive(game.sim.makeFamily(b, capOf(b, 'housing') - people().length), b);
    game.sim.recompute();
    const before = people(), was = capOf(b, 'housing');
    const chk = w.upgradeCheck(b, 'mansion');
    const r = w.upgradeBuilding(b.id, 'mansion');
    const stay = people(), cap = capOf(b, 'housing');
    const moved = before.filter(p => w.residents.has(p.id) && p.home !== b.id);
    const left = before.filter(p => !w.residents.has(p.id));
    const fam = (p) => p.fam ?? p.id;
    const split = before.some(p => !stay.includes(p) && stay.some(s => fam(s) === fam(p)));
    const fits = (h) => h && [...w.residents.values()].filter(r => r.home === h.id).length <= capOf(h, 'housing');
    ok(r.ok && b.type === 'mansion' && stay.length <= cap && chk.moveOut === before.length - stay.length,
      `a Grand Manor (${before.length}/${was}) rebuilt as a ${BUILDINGS.mansion.levels[0].name} keeps ${stay.length}/${cap}; ${moved.length} moved house, ${left.length} left (${chk.moveOut} foretold)`);
    ok(!split && moved.every(p => fits(w.buildings.get(p.home))), 'whole households move out, into homes with room');
  } else ok(false, 'no house on a double plot to rebuild');
  w.setSandbox({ infiniteMoney: false, unlockAll: false, freeUpgrades: false, instantBuild: false });
  w.money = 1e6;
}

// 3d1c. with Great Plots a double plot grows into a 2×2 estate onto the two
// plots behind it, and can then be rebuilt as its 2×2 counterpart (every
// ESTATE recipe), at the level it had reached
{
  const { ESTATE, techForLevel } = await import('../src/defs.js');
  const { sizeK, capOf } = await import('../src/world/world.js');
  const tw = World.createNew({ N: 64, seed: 37, name: 'Grangeley' });
  tw.setSandbox({ infiniteMoney: true, instantBuild: true });
  tw.research.done.push('surveying');
  const made = [];
  let gated = null;
  for (const [src, list] of Object.entries(ESTATE)) {
    let done = false;
    for (let z = 3; z < tw.N - 5 && !done; z++) for (let x = 3; x < tw.N - 5 && !done; x++) {
      if (![x, x + 1].every(k => tw.checkRoad(k, z - 1, 1).ok || tw.roadAt(k, z - 1))) continue;
      if (![[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]].every(([a, b]) => tw.inBounds(a, b) && !tw.buildingOn(a, b) && !tw.roadAt(a, b) && !tw.terrain.isWater(a, b))) continue;
      tw.placeRoads([[x, z - 1], [x + 1, z - 1]], 1);
      const P = tw.placeBuilding(src, x, z, { w: 2, d: 1, instant: true, ignoreUnlock: true, level: BUILDINGS[src].levels.length - 1 });
      if (!P.ok) continue;
      const b = P.building;
      if (gated === null) { gated = !tw.expandOptions(b).some(o => o.kind === 'estate'); tw.research.done.push('bigplots'); }
      const opt = tw.expandOptions(b).find(o => o.kind === 'estate');
      if (!opt || !tw.expandBuilding(b.id, opt.dir, 'estate').ok) { tw.removeBuilding(b.id, 0); continue; }
      tw.setSandbox({ unlockAll: true, freeUpgrades: true });
      const up = tw.upgradeOptions(b).find(o => o.estate && o.type === list[0]);
      const r = up && tw.upgradeBuilding(b.id, up.type);
      tw.setSandbox({ unlockAll: false, freeUpgrades: false });
      const L = BUILDINGS[b.type].levels[b.level], m = r && r.ok && buildModel(b);
      if (r && r.ok && b.type === list[0] && fw(b) * fd(b) === 4 && sizeK(b) === 1 && capOf(b, L.housing ? 'housing' : 'jobs') === (L.housing || L.jobs || 0)
        && b.level === Math.min(BUILDINGS[src].levels.length - 1, BUILDINGS[b.type].levels.length - 1) && !tw.expandOptions(b).length && m.geo.attributes.position.count) {
        made.push(`${src}→${b.type}`); done = true;
      }
    }
  }
  ok(gated, 'a double plot only grows into a 2×2 estate once Great Plots is researched');
  ok(made.length === Object.keys(ESTATE).length, `every double-plot building grown to 2×2 rebuilds as its estate, at its level (${made.join(', ')})`);
  ok(Object.values(ESTATE).flat().every(t => BUILDINGS[t].estate && techForLevel(t, 0) && BUILDINGS[t].levels.every((_, i) => techForLevel(t, i))), 'every estate level is gated by research');
}

// 3d1d. parks: every park type looks different from one plot to the next
// (its own seed) and the same every time it is drawn, keeps its layout as
// it goes up a level, follows the seasons, and gives its visitors somewhere
// to stroll to; a park joined from a little one keeps that one's feature
{
  const { parkFeature } = await import('../src/world/world.js');
  // (where everything is and what colour)
  const hashOf = (geo) => { let h = 0; const a = geo.attributes.position.array, c = geo.attributes.color.array; for (let i = 0; i < a.length; i += 5) h = (Math.imul(h, 31) + Math.round(a[i] * 1000) + Math.round(c[i] * 255)) | 0; return h; };
  const mk = (type, level, variant, season = 1) => {
    const d = BUILDINGS[type], W = d.merged ? 2 : d.size, D = d.merged ? 1 : d.size;
    return buildModel({ type, level, variant, size: Math.max(W, D), w: W, d: D, baseY: 0.5, minY: 0.2, rot: 0 }, { flat: true, season });
  };
  const alike = [], unstable = [], still = [], nowhere = [];
  for (const [type, d] of Object.entries(BUILDINGS)) {
    if (!d.park) continue;
    const L = d.levels.length - 1;
    const looks = new Set([1, 2, 3, 4, 5, 6].map(v => hashOf(mk(type, L, v * 7919 + 13).geo)));
    if (looks.size < 4) alike.push(`${type} (${looks.size} looks in 6)`);
    if (hashOf(mk(type, L, 4242).geo) !== hashOf(mk(type, L, 4242).geo)) unstable.push(type);
    if (type !== 'statue' && hashOf(mk(type, L, 4242, 1).geo) === hashOf(mk(type, L, 4242, 3).geo)) still.push(type);
    if (d.outdoor && !mk(type, L, 4242).spots.length) nowhere.push(type);
  }
  ok(!alike.length, `every park type looks different from one plot to the next${alike.length ? ': not ' + alike.join(', ') : ''}`);
  ok(!unstable.length, `...and the same every time it is drawn${unstable.length ? ': not ' + unstable.join(', ') : ''}`);
  ok(!still.length, `every park follows the seasons${still.length ? ': not ' + still.join(', ') : ''}`);
  ok(!nowhere.length, `every open-air park gives its visitors somewhere to stroll to${nowhere.length ? ': not ' + nowhere.join(', ') : ''}`);
  // its layout stays as it goes up a level: the green's great tree (or its
  // pump, maypole or yews) stands in the same corner at every level
  const corner = (geo) => { const p = geo.attributes.position.array; let sx = 0, sz = 0, n = 0; for (let i = 0; i < p.length; i += 3) if (p[i + 1] > 0.3) { sx += p[i]; sz += p[i + 2]; n++; } return n ? [Math.sign(sx), Math.sign(sz)] : [0, 0]; };
  const moved = [11, 22, 33, 44, 55, 66].filter(v => { const a = corner(mk('garden', 0, v).geo), b = corner(mk('garden', 1, v).geo); return a[0] !== b[0] || a[1] !== b[1]; });
  ok(moved.length <= 1, `a green keeps its great tree in its corner as it becomes a garden (${6 - moved.length} of 6)`);
  ok(parkFeature('park', ['garden', 'bandstand']) === 'bandstand' && parkFeature('lakepark', ['pond', 'pond']) === null && parkFeature('botanic', ['physic', 'pond']) === 'pond', 'a park joined from a little park with a feature of its own keeps it');
}

// 3d1e. parks grow: a little park takes the empty plot beside it and is
// rebuilt as the double-plot park; a double-plot park grows into a 2×2
// estate taking in the little parks in the way; and with Public Parks a 2×2
// park grows into 3×3 grounds and those into 4×4, laid out round the park
// it was (in the corner it stood in), saved and loaded back
{
  const { parkOrigin, GRAND, techForLevel } = await import('../src/defs.js');
  const { runCommand } = await import('../src/commands.js');
  const { CONFIG } = await import('../src/config.js');
  const tw = World.createNew({ N: 64, seed: 41, name: 'Greenwick' });
  tw.setSandbox({ infiniteMoney: true, instantBuild: true, freeUpgrades: true });
  for (const t of ['surveying', 'joining', 'gardening', 'bigplots', 'parks2']) tw.research.done.push(t);
  // an open 6×5 block with a street along its front
  let at = null;
  for (let z = 3; z < tw.N - 8 && !at; z++) for (let x = 3; x < tw.N - 8 && !at; x++) {
    let open = true;
    for (let dz = 0; dz < 5 && open; dz++) for (let dx = 0; dx < 6; dx++) {
      const tx = x + dx, tz = z + dz;
      if (tw.buildingOn(tx, tz) || tw.roadAt(tx, tz) || tw.terrain.isWater(tx, tz) || tw.fields[tw.idx(tx, tz)] >= 0 || tw.terrain.tileMax(tx, tz) - tw.terrain.tileMin(x, z) > 0.5) open = false;
    }
    if (open && [0, 1, 2, 3, 4, 5].every(dx => tw.checkRoad(x + dx, z + 5, 1).ok)) at = { x, z };
  }
  const { x, z } = at;
  tw.placeRoads([0, 1, 2, 3, 4, 5].map(dx => [x + dx, z + 5]), 1);
  const put = (type, px, pz, o = {}) => tw.placeBuilding(type, px, pz, { instant: true, ignoreUnlock: true, ...o }).building;
  // a pond takes the empty plot beside it and becomes a lake garden
  const pond = put('pond', x + 5, z + 4);
  const land = tw.expandOptions(pond).find(o => o.kind === 'land' && o.x === x + 5);
  ok(land && !tw.expandOptions(pond).some(o => o.kind !== 'land'), 'a little park can take the empty plot beside it (and only empty land)');
  tw.expandBuilding(pond.id, land.dir, 'land');
  const up = tw.upgradeOptions(pond);
  ok(up.some(o => o.type === 'lakepark' && o.large) && !up.some(o => o.extend), `...and be rebuilt across the double plot as a lake garden, not extended as it is (${up.map(o => o.type + (o.extend ? '+' : '')).join(', ')})`);
  ok(tw.upgradeBuilding(pond.id, 'lakepark').ok && pond.type === 'lakepark' && fw(pond) * fd(pond) === 2 && !pond.spare, 'the pond is a lake garden on its double plot');
  // a garden and a rose garden join into a park that keeps its roses...
  const g1 = put('garden', x, z + 4), g2 = put('rosegarden', x + 1, z + 4);
  const park = tw.mergeBuildings(g1.id, g2.id).building;
  ok(park && park.type === 'park' && park.flavor === 'rosegarden', `a garden and a rose garden join into a park laid out round the roses (${park && park.flavor})`);
  // ...which grows onto the plots behind it, taking in the pond there
  const duck = put('pond', x, z + 3), stat = put('statue', x + 2, z + 2);
  const est = tw.expandOptions(park).find(o => o.kind === 'estate' && o.absorb.length);
  ok(est && est.absorb[0] === duck && /becomes part of the park/.test(est.warn || '') && est.cost < 2 * CONFIG.PLOT_PRICE, `a park growing into a 2×2 estate takes in the little park in the way, paying only for the empty plot ($${est && est.cost})`);
  tw.expandBuilding(park.id, est.dir, 'estate');
  ok(!tw.buildings.has(duck.id) && tw.buildingOn(x, z + 3) === park && fw(park) * fd(park) === 4, 'the pond is now part of the park');
  ok(tw.upgradeBuilding(park.id, 'landscapepark').ok && park.type === 'landscapepark' && park.flavor === 'rosegarden', 'rebuilt as a landscape park, it keeps its roses');
  // grounds: only with Public Parks
  ok(!tw.expandOptions(park).length, 'a 2×2 park only grows into bigger grounds once Public Parks is researched');
  tw.research.done.push('publicparks');
  const grand = tw.expandOptions(park).filter(o => o.kind === 'grand');
  const g3 = grand.find(o => o.absorb.includes(stat));
  ok(grand.length >= 1 && grand.every(o => o.tiles.length === 5) && g3, `...then it can take the land round a corner (${grand.length} ways), taking in the statue in the way`);
  ok(g3 && runCommand({ world: tw, demo: false }, { t: 'expand', id: park.id, dir: g3.dir, kind: 'grand' }).ok, 'the expand command takes the land for bigger grounds');
  const sp0 = { ...(park.spare || {}) };
  ok(fw(park) === 3 && fd(park) === 3 && park.spare && park.spare.w === 2 && !tw.buildings.has(stat.id), `the park now stands on 3×3 grounds, the landscape park in its corner (${JSON.stringify(park.spare)})`);
  const gup = tw.upgradeOptions(park);
  ok(gup.some(o => o.type === 'grandpark' && o.grand) && !gup.some(o => o.extend), 'it can be laid out as a Grand Park');
  tw.upgradeBuilding(park.id, 'grandpark');
  const o1 = parkOrigin(park.flavor);
  ok(park.type === 'grandpark' && o1 && o1.type === 'landscapepark' && o1.sx === sp0.sx && o1.sz === sp0.sz && o1.inner === 'rosegarden' && !park.spare, `the Grand Park is laid out round the landscape park it was, in its corner (${park.flavor})`);
  // and again into 4×4: a City Park
  const city = tw.expandOptions(park).filter(o => o.kind === 'grand');
  ok(city.length && city.every(o => o.tiles.length === 7), `a Grand Park grows again onto 7 more plots (${city.length} ways)`);
  if (city.length) {
    tw.expandBuilding(park.id, city[0].dir, 'grand');
    tw.upgradeBuilding(park.id, 'citypark');
    const o2 = parkOrigin(park.flavor), o3 = o2 && parkOrigin(o2.inner);
    ok(park.type === 'citypark' && fw(park) === 4 && o2.type === 'grandpark' && o3 && o3.type === 'landscapepark' && !tw.expandOptions(park).length, `a City Park on 4×4 grounds round the Grand Park, round the landscape park (${park.flavor})`);
    const m0 = buildModel(park), cells = new Set();
    for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) cells.add(tw.buildingAt[tw.idx(park.x + dx, park.z + dz)]);
    ok(m0.geo.attributes.position.count > 0 && cells.size === 1 && cells.has(park.id), 'every plot of the City Park is the park\'s, and it builds');
    // saved and loaded back: same grounds, same layout
    const back = deserialize(JSON.parse(JSON.stringify(serialize(tw)))).buildings.get(park.id);
    const h = (geo) => { let s = 0; const a = geo.attributes.position.array; for (let i = 0; i < a.length; i += 11) s = (Math.imul(s, 31) + Math.round(a[i] * 1000)) | 0; return s; };
    ok(back && back.type === 'citypark' && fw(back) === 4 && fd(back) === 4 && back.flavor === park.flavor && h(buildModel(back).geo) === h(m0.geo), 'a save keeps the City Park, its grounds and what it grew from, drawn the same');
  }
  ok(Object.values(GRAND).flat().every(t => BUILDINGS[t].grand && BUILDINGS[t].levels.every((_, i) => techForLevel(t, i) === 'publicparks')), 'every level of the grand parks takes Public Parks');
}

// 3d1f. what the new parks do: a bandstand brings culture to the streets
// round it, allotments cheer homes with the retired in them (and the old go
// and dig there), and the boating lake and the zoo charge their visitors
{
  const tw = World.createNew({ N: 48, seed: 39, name: 'Bandbury' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const tg = { world: tw, speed: 0, _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); } };
  const sim = new Sim(tg);
  // on the town's own street, so they are connected
  const conn = (t, x, z) => { const c = tw.checkBuild(t, x, z); return c.ok && c.access.some(a => a.conn); };
  let home = null, stand = null;
  for (let z = 1; z < tw.N - 1 && !stand; z++) for (let x = 1; x < tw.N - 2 && !stand; x++) {
    if (!conn('house', x, z) || !conn('bandstand', x + 1, z)) continue;
    home = tw.placeBuilding('house', x, z, { instant: true }).building;
    stand = tw.placeBuilding('bandstand', x + 1, z, { instant: true }).building;
  }
  sim.recompute();
  const i = tw.idx(home.x, home.z);
  const cult = sim.coverage.culture[i];
  tw.removeBuilding(stand.id, 0);
  sim.recompute();
  ok(cult && !sim.coverage.culture[i], 'a bandstand brings culture to the homes round it');
  const old = { id: tw.newId(), first: 'Ada', last: 'Spade', age: 'elder', years: 70, edu: 1, home: home.id, job: null, look: 4321, mood: 60 };
  tw.residents.set(old.id, old); home.residents.push(old.id);
  const potter = () => { sim.recompute(); sim._happiness(); const p = home.factors.parts.find(q => q[0] === 'potter'); return p ? p[1] : null; };
  const before = potter();
  const plot = tw.placeBuilding('allotment', stand.x, stand.z, { instant: true }).building;
  const after = potter();
  ok(before === 0 && after === 3, `a home with someone retired in it is happier with allotments in reach (${before} → +${after})`);
  const A = { world: tw, _nearest: Agents.prototype._nearest, _shopFor: Agents.prototype._shopFor, _places: Agents.prototype._places, _candidates: (pred) => [...tw.buildings.values()].filter(b => b.access && pred(BUILDINGS[b.type], b)) };
  // (with a green beside it too, so the allotment isn't the only park to go to)
  const green = tw.placeBuilding('garden', home.x, home.z - 1, { instant: true }).building || tw.placeBuilding('garden', home.x, home.z + 1, { instant: true }).building;
  let digs = 0;
  for (let k = 0; k < 200; k++) { A._lists = null; Agents.prototype.planDay.call(A, old, null); if (old.plan.some(p => p.dest === plot.id && p.t < 11.5)) digs++; }
  ok(green && digs > 50 && digs < 180, `the old go and dig their allotment of a morning, some mornings (${digs} in 200)`);
  // a boat hired on the boating lake is paid for; a stroll in the town park isn't
  const pay = (type, level) => {
    const W = 2, D = BUILDINGS[type].merged ? 1 : 2;
    let b = { ok: false };
    for (let pz = 1; pz < tw.N - 3 && !b.ok; pz++) for (let px = 1; px < tw.N - 3 && !b.ok; px++) if (tw.checkBuild(type, px, pz, { w: W, d: D, ignoreUnlock: true }).ok) b = tw.placeBuilding(type, px, pz, { instant: true, ignoreUnlock: true, level, w: W, d: D });
    if (!b.ok) return null;
    b.building.wet = 2;
    const m0 = tw.stats.visitIncome, ag = { world: tw, game: { sim, emit() {} }, _visiting: Agents.prototype._visiting, _occupancy: () => new Map(), _drop() {} };
    b.building.working = 1;
    Agents.prototype._arrive.call(ag, { id: -1, age: 'adult', home: home.id, job: null, walk: null }, b.building.id);
    tw.removeBuilding(b.building.id, 0);
    return Math.round(tw.stats.visitIncome - m0);
  };
  const boat = pay('lakepark', 1), stroll = pay('park', 0), zoo = pay('zoo', 0);
  ok(boat === BUILDINGS.lakepark.levels[1].visit && stroll === 0 && zoo === BUILDINGS.zoo.levels[0].visit, `the boating lake takes $${boat} a visit and the zoo $${zoo}; a walk in the park is free (${stroll})`);
  // grounds keep the uses of the park they grew from
  const { researchOf, visitOf } = await import('../src/defs.js');
  const gz = { type: 'grandpark', level: 0, flavor: 'zoo#1@1,1' }, gp = { type: 'citypark', level: 1, flavor: 'grandpark#0@1,1/palmhouse#1@-1,1' };
  ok(visitOf(gz) === BUILDINGS.zoo.levels[1].visit && researchOf(gp) === 8 && researchOf({ type: 'grandpark', level: 0, flavor: 'landscapepark#1' }) === 0 && visitOf({ type: 'grandpark', level: 0, flavor: null }) === 0,
    `grounds grown from a zoo keep its gate ($${visitOf(gz)}), and from the royal botanic gardens their research (${researchOf(gp)} a day)`);
}

// 3d1g. plantings and monuments come in kinds: each kind builds at every
// level and looks like no other, one without a kind takes one by its seed
// (from those that need no research), a kind can be chosen when it is
// built (if researched) and reworked later by the builders for a share of
// its worth, and a grand monument brings culture
{
  const { KINDS, REKIND, kindOf } = await import('../src/defs.js');
  const { runCommand } = await import('../src/commands.js');
  const hashOf = (geo) => { let h = 0; const a = geo.attributes.position.array, c = geo.attributes.color.array; for (let i = 0; i < a.length; i += 5) h = (Math.imul(h, 31) + Math.round(a[i] * 1000) + Math.round(c[i] * 255)) | 0; return h; };
  const bad = [], looks = new Map();
  for (const [type, K] of Object.entries(KINDS)) for (const kind of Object.keys(K)) BUILDINGS[type].levels.forEach((_, level) => {
    const b = { type, level, variant: 4242, flavor: kind, size: 1, w: 1, d: 1, baseY: 0.5, minY: 0.2, rot: 0 };
    let h = null;
    for (const season of [0, 1, 2, 3]) {
      const m = buildModel(b, { flat: true, season });
      if (!m.geo || !m.geo.attributes.position.count || [...m.geo.attributes.position.array].some(v => !Number.isFinite(v))) bad.push(`${type} ${kind} L${level}`);
      else if (season === 1) h = hashOf(m.geo);
    }
    const key = `${type}:${level}`;
    if (!looks.has(key)) looks.set(key, new Set());
    looks.get(key).add(h);
  });
  ok(!bad.length, `every kind of planting (${Object.keys(KINDS.flowers).length}) and monument (${Object.keys(KINDS.statue).length}) builds at every level and season${bad.length ? ': not ' + bad.join(', ') : ''}`);
  ok([...looks].every(([k, s]) => s.size === Object.keys(KINDS[k.split(':')[0]]).length), `...and at each level each kind looks like no other (${[...looks].map(([k, s]) => `${k} ${s.size}`).join(', ')})`);
  const seeds = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(v => kindOf({ type: 'statue', variant: v * 977 })));
  ok(seeds.size >= 3 && [...seeds].every(k => !KINDS.statue[k].tech) && kindOf({ type: 'statue', variant: 5, flavor: 'clock' }) === 'clock' && kindOf({ type: 'house', variant: 5 }) === null,
    `one without a kind takes one by its seed, of those needing no research (${[...seeds].join(', ')})`);
  // choosing one when it is built, and reworking it later
  const tw = World.createNew({ N: 48, seed: 43, name: 'Kindleton' });
  tw.money = 1e6;
  const G = { world: tw, demo: false };
  const spot = (type) => { for (let z = 2; z < tw.N - 2; z++) for (let x = 2; x < tw.N - 2; x++) if (tw.checkBuild(type, x, z, { ignoreUnlock: true }).ok) return { x, z }; return null; };
  const s1 = spot('flowers');
  const locked = runCommand(G, { t: 'place', type: 'flowers', x: s1.x, z: s1.z, flavor: 'knot' });
  tw.research.done.push('gardening', 'botany', 'stonework');
  const knot = runCommand(G, { t: 'place', type: 'flowers', x: s1.x, z: s1.z, flavor: 'knot' });
  ok(!locked.ok && /Botany/.test(locked.reason || '') && knot.ok && knot.building.flavor === 'knot' && kindOf(knot.building) === 'knot', `a planting can be built as a herb knot once Botany is researched (${locked.reason})`);
  ok(!runCommand(G, { t: 'place', type: 'flowers', x: s1.x + 1, z: s1.z, flavor: 'clock' }).ok && !runCommand(G, { t: 'place', type: 'house', x: s1.x + 1, z: s1.z, flavor: 'rockery' }).ok, 'a kind of one is refused for the other, and for anything else');
  const plot = knot.building;
  plot.con = null;
  const m0 = tw.money, ck = tw.kindCheck(plot, 'rockery');
  const rk = runCommand(G, { t: 'kind', id: plot.id, kind: 'rockery' });
  ok(ck.ok && rk.ok && plot.con && plot.con.kind === 'upgrade' && plot.con.flavor === 'rockery' && tw.money === m0 - ck.cost && ck.cost === Math.max(20, Math.round(tw.buildValue(plot) * REKIND)) && plot.flavor === 'knot',
    `builders rework the knot as a rockery for $${ck.cost} (${Math.round(REKIND * 100)}% of its worth)`);
  tw.finishConstruction(plot);
  ok(plot.flavor === 'rockery' && plot.level === 0 && !plot.con, 'when they are done it is a rockery, at its level');
  ok(!tw.kindCheck(plot, 'rockery').ok && !tw.kindCheck(plot, 'arch').ok && !tw.kindCheck(plot, 'tree').ok, 'not as the kind it is, a kind it has not, or one not yet researched');
  // a grand monument brings culture
  const tg = { world: tw, speed: 0, _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); } };
  const sim = new Sim(tg);
  let mon = null;
  for (let z = 1; z < tw.N - 1 && !mon; z++) for (let x = 1; x < tw.N - 1 && !mon; x++) { const c = tw.checkBuild('statue', x, z, { ignoreUnlock: true }); if (c.ok && c.access.some(a => a.conn)) mon = tw.placeBuilding('statue', x, z, { instant: true, ignoreUnlock: true, level: 1, flavor: 'founder' }).building; }
  const count = () => { sim.recompute(); let n = 0; for (const v of sim.coverage.culture) n += v ? 1 : 0; return n; };
  const before = count();
  mon.level = 2;
  const after = count();
  ok(after > before && BUILDINGS.statue.levels[2].culture > 0, `a grand monument brings culture to the streets within ${BUILDINGS.statue.levels[2].culture} tiles (a civic one doesn't)`);
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
  fresh.addResearch(TECHS.commerce.cost);
  ok(fresh.research.done.includes('commerce') && fresh.checkBuild('bakery', spot[0], spot[1], { ignoreMoney: true }).ok, 'finished research unlocks the bakery');
  ok(!fresh.canResearch('highrise'), 'later projects wait for their prerequisites');
}

// 3d4. school stages: children go to the stage for their age; a school can
// grow larger or move on to the next stage (the bigger stages need room)
{
  const sch = [...w.buildings.values()].find(b => b.type === 'school') || (() => {
    for (let z = 2; z < w.N - 3; z++) for (let x = 2; x < w.N - 3; x++) { const r = w.placeBuilding('school', x, z, { instant: true, ignoreUnlock: true }); if (r.ok) return r.building; }
  })();
  w.setSandbox({ unlockAll: true });
  const opts = w.upgradeOptions(sch).map(o => o.type);
  ok(opts.includes('school') && opts.includes('middleschool'), `a schoolhouse can grow larger or become a middle school (${opts.join(', ')})`);
  game.sim.recompute();
  const kid = [...w.residents.values()].find(r => r.school != null && r.age === 'child');
  ok(!kid || BUILDINGS[w.buildings.get(kid.school).type].levels[w.buildings.get(kid.school).level].teaches === 1 + (kid.years >= 11) + (kid.years >= 14), 'children are placed at the stage for their age');
  sch.type = 'middleschool'; sch.level = 0;
  const hs = w.upgradeCheck(sch, 'highschool');
  ok(hs.reqs.some(r => r.space && !r.met), 'a high school needs a double plot first');
  sch.type = 'school';
  w.setSandbox({ unlockAll: false });
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

// 3f. power, water and workers decide what works (Sim._working): an
// unpowered machine makes nothing, street lamps go dark, things without
// water or staff do less, and the issues panel lists what has stopped
// (in a small fresh town, so supply is under control)
{
  const { RoadsView } = await import('../src/render/roadsView.js');
  const { computeIssues } = await import('../src/ui/issues.js');
  const tw = World.createNew({ N: 40, seed: 77, name: 'Wattsby' });
  tw.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: true });
  const tg = { world: tw, speed: 0, _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); } };
  const sim = tg.sim = new Sim(tg);
  sim.seedFounders();
  // founders are random: make sure of two grown-ups to staff things
  for (const r of [...tw.residents.values()].slice(0, 2)) { r.age = 'adult'; r.years = 30; r.school = null; }
  const well = [...tw.buildings.values()].find(b => b.type === 'well');
  // cobbled streets get lamps
  const roads = [];
  for (let z = 0; z < tw.N; z++) for (let x = 0; x < tw.N; x++) if (tw.roadAt(x, z)) roads.push([x, z]);
  tw.placeRoads(roads, 2);
  const near = (type, max = 12) => {
    for (let r = 1; r <= max; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const c = tw.checkBuild(type, well.x + dx, well.z + dz);
      if (!c.ok || !c.access.some(a => a.conn)) continue;
      const p = tw.placeBuilding(type, well.x + dx, well.z + dz, { instant: true });
      if (p.ok) return p.building;
    }
    return null;
  };
  const mf = near('workshop');
  mf.level = 2;
  for (const r of tw.residents.values()) if (r.age === 'adult') r.job = mf.id;
  for (let k = 0; k < 8 && (sim.recompute(), sim.powerShare < 1); k++) near('windgen', 16);
  const rv = new RoadsView(tw, { add() {}, remove() {} });
  rv.lit = (x, z) => sim.lampLit(x, z);
  rv.rebuild();
  const lamps = rv.lamps.length;
  ok(mf.powered && mf.working > 0 && sim.incomeOf(mf) > 0, `a powered Manufactory works (${Math.round(mf.working * 100)}% staffed, $${Math.round(sim.incomeOf(mf))} a day)`);
  ok(lamps > 0 && rv.darkLamps === 0, `street lamps are lit with enough power (${lamps})`);
  // cut the power
  for (const b of [...tw.buildings.values()]) if (BUILDINGS[b.type].generator) tw.removeBuilding(b.id, 0);
  sim.recompute();
  rv.rebuild();
  ok(!mf.powered && mf.working === 0 && mf.blockers.includes('power') && sim.incomeOf(mf) === 0, `an unpowered Manufactory makes nothing (lacks ${mf.blockers.join(', ')})`);
  ok(rv.lamps.length === 0 && rv.darkLamps === lamps, `street lamps go dark without power (${rv.darkLamps})`);
  const iss = computeIssues(tg).map(i => i.text);
  ok(iss.some(t => /manufactory stopped — no power/.test(t)), `issues list the stopped works ("${iss.find(t => /no power/.test(t))}")`);
  for (let k = 0; k < 8 && (sim.recompute(), sim.powerShare < 1); k++) near('windgen', 16);
  ok(mf.working > 0 && !computeIssues(tg).some(i => /no power/.test(i.text)), 'it starts again once the power is back');
  // water: without it a bakery works at reduced output, a clinic reaches
  // less, homes can't expand, and the issues panel says so
  const bak = near('bakery'), cl = near('clinic');
  let n = 0;
  for (const r of tw.residents.values()) if (r.age === 'adult') { r.job = n++ % 2 ? bak.id : cl.id; r.edu = 3; }
  sim.recompute();
  const k0 = bak.working, reach0 = sim.reachOf(cl);
  ok(bak.wet === 2 && cl.wet === 2 && k0 > 0 && reach0 > 0, `the bakery and clinic have running water (bakery at ${Math.round(k0 * 100)}%, clinic reaches ${reach0} tiles)`);
  const home = [...tw.buildings.values()].find(b => b.type === 'house' && b.wet === 2 && tw.expandOptions(b).length);
  const grow = home && tw.expandOptions(home)[0];
  tw.removeBuilding(well.id, 0);
  sim.recompute();
  ok(bak.blockers.includes('water') && Math.abs(bak.working - k0 * 0.3) < 1e-9, `without water the bakery works at 30% of that (${Math.round(bak.working * 100)}%)`);
  ok(cl.blockers.includes('water') && sim.reachOf(cl) < reach0, `without water the clinic reaches less (${reach0} → ${sim.reachOf(cl)} tiles)`);
  ok(computeIssues(tg).some(i => /bakery without water/.test(i.text)), 'issues list the bakery without water');
  ok(home && home.blockers.includes('water') && !tw.expandOptions(home).length && /water/.test(tw.expandBuilding(home.id, grow.dir, grow.kind).reason || ''), "a home that could expand can't once its water is gone");
  // workers: a school with no teachers has no places
  const sch = near('school');
  sim.recompute();
  ok(!sch.workers.length && sim.seatsOf(sch) === 0 && sch.working === 0 && sch.blockers.includes('workers') && computeIssues(tg).some(i => /schoolhouse with no workers/.test(i.text)), 'a school with no teachers has no places, and the issues panel says so');
  // water comes through the mains under the streets: one well anywhere on
  // the roads waters a bakery right across town, but nothing off the roads
  const { runCommand } = await import('../src/commands.js');
  const { townRoadTiles } = await import('../src/ui/working.js');
  const well2 = near('well', 16);
  let far = null, fd2 = -1;
  for (let z = 1; z < tw.N - 1; z++) for (let x = 1; x < tw.N - 1; x++) {
    const d = Math.abs(x - well2.x) + Math.abs(z - well2.z), c = d > fd2 && tw.checkBuild('bakery', x, z);
    if (c && c.ok && c.access.some(a => a.conn)) { far = [x, z]; fd2 = d; }
  }
  const fb = tw.placeBuilding('bakery', far[0], far[1], { instant: true }).building;
  let lone = null;
  for (let z = 2; z < tw.N - 3 && !lone; z++) for (let x = 2; x < tw.N - 4 && !lone; x++) {
    const row = [[x, z], [x + 1, z], [x + 2, z]];
    const clear = (tx, tz) => tw.inBounds(tx, tz) && !tw.roadAt(tx, tz) && !tw.buildingOn(tx, tz) && !tw.terrain.isWater(tx, tz);
    if (![-1, 0, 1, 2, 3].every(dx => [-1, 0, 1, 2].every(dz => clear(x + dx, z + dz)))) continue;
    if (!row.every(([tx, tz]) => tw.checkRoad(tx, tz, 1).ok)) continue;
    tw.placeRoads(row, 1);
    const h = tw.placeBuilding('house', x + 1, z + 1, { instant: true });
    if (h.ok) lone = h.building;
  }
  sim.recompute();
  ok(fb.connected && fb.wet === 2 && !fb.blockers.includes('water'), `water reaches a bakery ${fd2} tiles from the well, through the mains`);
  ok(lone && !lone.connected && lone.wet === 0, 'a home on a road that leads nowhere gets no water');
  // power lines can be buried (Underground Cables): street by street or the
  // whole town; the poles come down, the street looks better, saves keep it
  near('windgen', 16);
  sim.recompute();
  rv.rebuild();
  const poles0 = rv.poles, th = [...tw.buildings.values()].find(b => b.type === 'townhall'), a = th.access;
  const appeal0 = sim.appeal[tw.idx(a.x, a.z)];
  tw.setSandbox({ unlockAll: false });
  ok(!runCommand(tg, { t: 'bury', tiles: tw.streetTiles(a.x, a.z) }).ok, 'burying power lines needs Underground Cables');
  tw.setSandbox({ unlockAll: true });
  ok(!runCommand(tg, { t: 'bury', tiles: [[-1, 3]] }).ok, 'a bury command with a tile off the map is refused');
  const r1 = runCommand(tg, { t: 'bury', tiles: tw.streetTiles(a.x, a.z) });
  sim.recompute();
  rv.rebuild();
  ok(r1.ok && r1.n > 0 && rv.poles < poles0 && sim.appeal[tw.idx(a.x, a.z)] > appeal0, `burying one street takes its poles down (${poles0} → ${rv.poles} poles) and makes it prettier`);
  const r2 = runCommand(tg, { t: 'bury', tiles: townRoadTiles(tw) });
  rv.rebuild();
  ok(r2.ok && rv.poles === 0, `burying every line in town leaves no poles (${r2.n} more road tiles)`);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(tw))));
  ok(townRoadTiles(tw).every(([x, z]) => back.buried[back.idx(x, z)] === 1), 'saves keep the buried power lines');
}

// 3g. road shapes and road selection: corners turn in a curve and junction
// corners are filled in; a click picks the stretch between junctions; plans
// add up costs and refunds and say what can't change and who'd be cut off
{
  const { roadTile, surfaceAt, curvesAt } = await import('../src/world/roadShape.js');
  const { roadRun, roadsInBox, planRoadEdit, applyRoadEdit } = await import('../src/world/roadEdit.js');
  const { tilePolyline } = await import('../src/sim/path.js');
  const { RoadsView } = await import('../src/render/roadsView.js');
  const { runCommand } = await import('../src/commands.js');
  const { roadRefund, ROAD_LEVELS } = await import('../src/config.js');
  const tw = World.createNew({ N: 48, seed: 5, name: 'Bendwick' });
  tw.money = 1e6;
  // a free, gentle 9 × 9 patch for a little network
  let o = null;
  for (let z = 1; z < tw.N - 10 && !o; z++) for (let x = 1; x < tw.N - 10 && !o; x++) {
    let free = true;
    for (let dz = -1; dz < 10 && free; dz++) for (let dx = -1; dx < 10 && free; dx++) {
      const X = x + dx, Z = z + dz;
      if (tw.terrain.isWater(X, Z) || tw.roadAt(X, Z) || tw.railAt(X, Z) || tw.buildingOn(X, Z) || tw.terrain.slope(X, Z) > 0.5) free = false;
    }
    if (free) o = { x, z };
  }
  ok(!!o, 'found a free patch for the road-shape checks');
  const P = (x, z) => [o.x + x, o.z + z];
  // dirt (0..2, 1), cobbled junction (3, 1), paved (4..6, 1) turning down
  // (6, 2..4), cobbled (3, 2..7), dirt (0..2, 5) meeting it at (3, 5)
  tw.setSandbox({ unlockAll: true });
  tw.placeRoads([0, 1, 2].map(x => P(x, 1)), 1);
  tw.placeRoads([P(3, 1), ...[2, 3, 4, 5, 6, 7].map(z => P(3, z))], 2);
  tw.placeRoads([...[4, 5, 6].map(x => P(x, 1)), ...[2, 3, 4].map(z => P(6, z))], 3);
  tw.placeRoads([0, 1, 2].map(x => P(x, 5)), 1);
  tw.setSandbox({ unlockAll: false });
  const key = (l) => l.map(([x, z]) => `${x - o.x},${z - o.z}`).sort().join(' ');
  // shapes
  const bend = roadTile(tw, ...P(6, 1)), tee = roadTile(tw, ...P(3, 1)), straight = roadTile(tw, ...P(3, 3));
  ok(bend.bend === 2 && !bend.fillets.length, 'a corner (west and south arms) is laid as a bend round its south-west corner');
  ok(tee.bend < 0 && key([[0, 0]]) && tee.fillets.join() === '1,2', 'a T-junction fills in its two inside corners');
  ok(straight.bend < 0 && !straight.fillets.length, 'a straight road has no curves');
  const [bx, bz] = P(6, 1), [tx, tz] = P(3, 1);
  ok(surfaceAt(tw, bx + 0.95, bz + 0.05) === 0 && surfaceAt(tw, bx + 0.04, bz + 0.96) === 0, 'the bend leaves grass at its outer and inner corners');
  ok(surfaceAt(tw, bx + 1 - 0.5 * Math.SQRT1_2 - 0.5, bz + 0.5 * Math.SQRT1_2 + 0.5 - 0.5) > 0 || surfaceAt(tw, bx + 0.5 - 0.5 * Math.SQRT1_2 + 0.5 * Math.SQRT1_2, bz + 1 - 0.5) > 0, 'the bend is road along its curve');
  ok(surfaceAt(tw, tx + 1 - 0.21, tz + 1 - 0.21) > 0 && surfaceAt(tw, tx + 0.95, tz + 0.95) === 0, 'a junction corner is road out to the fillet, grass right in the corner');
  ok(curvesAt(tw, bx, bz) && !curvesAt(tw, o.x - 5, o.z - 5), 'walkers may curve on land roads only');
  // villagers on the inside lane follow the bend and stay on the road
  const walk = tilePolyline([P(4, 1), P(5, 1), P(6, 1), P(6, 2), P(6, 3)], 0.12, null, null, (x, z) => curvesAt(tw, x, z));
  const corner = { x: bx, z: bz + 1 };
  const onArc = walk.filter(([x, z]) => Math.abs(Math.hypot(x - corner.x, z - corner.z) - 0.38) < 1e-6);
  ok(onArc.length >= 5 && walk.every(([x, z]) => surfaceAt(tw, x, z) > 0), `a villager turning the corner follows the curve (${onArc.length} points on it) and stays on the street`);
  const view = new RoadsView(tw, scene);
  ok([...view.surface.geometry.attributes.position.array].every(Number.isFinite) && view.surface.geometry.attributes.position.count > 0, 'road surfaces with bends and fillets build cleanly');
  view.dispose();
  // stretches between junctions
  ok(key(roadRun(tw, ...P(1, 1))) === key([P(0, 1), P(1, 1), P(2, 1)]), 'a click picks the stretch up to the junction');
  ok(key(roadRun(tw, ...P(4, 1))) === key([P(4, 1), P(5, 1), P(6, 1), P(6, 2), P(6, 3), P(6, 4)]), 'a stretch follows the road round a bend');
  ok(key(roadRun(tw, ...P(3, 1))) === key([P(3, 1)]) && roadRun(tw, o.x + 8, o.z + 8).length === 0, 'a junction is a stretch of its own; grass picks nothing');
  ok(key(roadRun(tw, ...P(3, 3))) === key([P(3, 2), P(3, 3), P(3, 4)]), 'a stretch stops at the next junction too');
  const all = roadsInBox(tw, { x: o.x, z: o.z }, { x: o.x + 8, z: o.z + 8 });
  ok(all.length === 3 + 1 + 6 + 6 + 3, `a box picks every road tile in it (${all.length})`);
  // plans: costs, refunds, what can't change and why
  const dirt = roadRun(tw, ...P(1, 1)), paved = roadRun(tw, ...P(4, 1)), cob = roadRun(tw, ...P(3, 3));
  const locked = planRoadEdit(tw, all, 'up');
  ok(locked.n === 0 && locked.blocked.some(b => /Unlocks at 25/.test(b.reason)) && locked.blocked.some(b => /paved/.test(b.reason)), 'upgrades wait for their unlock, and paved streets go no higher');
  tw.setSandbox({ unlockAll: true });
  const up = planRoadEdit(tw, all, 'up');
  const want = all.reduce((s, [x, z]) => { const L = tw.roadAt(x, z); return s + (L < 3 ? ROAD_LEVELS[L + 1].cost - ROAD_LEVELS[L].cost : 0); }, 0);
  ok(up.n === 13 && up.cost === want && up.blocked.length === 1 && up.blocked[0].n === 6, `upgrading the lot costs the sum of each step ($${up.cost}); the 6 paved tiles are skipped`);
  const down = planRoadEdit(tw, [...dirt, ...paved], 'down');
  ok(down.n === 6 && down.refund === 6 * roadRefund(3, 2, false) && down.blocked[0].n === 3, `downgrading pays back a quarter of the difference ($${down.refund}); dirt can't go lower`);
  const rm = planRoadEdit(tw, cob, 'remove');
  ok(rm.n === 3 && rm.refund === 3 * roadRefund(2, 0, false), `taking up 3 cobbled tiles pays back $${rm.refund}`);
  ok(roadRefund(2, 0, true) === Math.round(ROAD_LEVELS[2].cost * 3 * 0.25), 'bridges pay back at bridge prices');
  const entry = planRoadEdit(tw, [[tw.entry.x, tw.entry.z]], 'remove');
  ok(entry.n === 0 && /outside world/.test(entry.blocked[0].reason), 'the road to the outside world must stay');
  // who would be cut off: a home on the dirt street, a shop at the bend,
  // and a coach line between them
  const H1 = tw.placeBuilding('house', ...P(1, 0), { instant: true }).building;
  const H2 = tw.placeBuilding('house', ...P(7, 3), { instant: true }).building;
  tw.lines.push({ id: 9999, mode: 'coach', name: 'Test Line', color: '#fff', stops: [H1.id, H2.id], vehicles: 1 });
  const before = tw.roads.slice();
  const cutBend = planRoadEdit(tw, paved, 'remove');
  ok(cutBend.lost.includes(H2.id) && !cutBend.lost.includes(H1.id) && cutBend.lines.includes(9999), 'taking up the bend leaves its house without a road and the coach line without a route');
  const cutJunction = planRoadEdit(tw, [P(3, 1)], 'remove');
  ok(!cutJunction.lost.length && cutJunction.lines.includes(9999), 'taking up the junction between the stops breaks the line too');
  ok(!planRoadEdit(tw, cob, 'remove').lines.length, 'a stretch the line does not need leaves it alone');
  ok(H1.front > 0 && planRoadEdit(tw, dirt, 'remove').back.includes(H1.id), 'a house standing forward into the street would step back');
  // the town itself: taking up the road beside the way in cuts the town off
  const th = [...tw.buildings.values()].find(b => b.type === 'townhall');
  const way = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tw.roadAt(tw.entry.x + dx, tw.entry.z + dz)) way.push([tw.entry.x + dx, tw.entry.z + dz]);
  const sever = planRoadEdit(tw, way, 'remove');
  ok(sever.cut.includes(th.id), 'taking up the road next to the way in would cut the town hall off');
  ok(tw.roads.every((v, i) => v === before[i]), 'plans change nothing');
  // doing it
  tw.money = 30;
  const poor = applyRoadEdit(tw, dirt, 'up');
  ok(!poor.ok && poor.reason === 'Not enough money' && tw.roadAt(...P(1, 1)) === 1 && tw.money === 30, 'an upgrade the town cannot afford changes nothing');
  tw.money = 1000;
  const did = applyRoadEdit(tw, dirt, 'up');
  ok(did.ok && did.n === 3 && did.spent === 42 && tw.money === 958 && dirt.every(([x, z]) => tw.roadAt(x, z) === 2), 'upgrading the dirt stretch makes it cobbled and costs $42');
  const g2 = { world: tw, demo: false, emit() {} };
  ok(!runCommand(g2, { t: 'roadedit', op: 'paint', tiles: dirt }).ok, 'the roadedit command refuses unknown actions');
  const gone = runCommand(g2, { t: 'roadedit', op: 'remove', tiles: cob });
  ok(gone.ok && gone.refund === rm.refund && tw.money === 958 + rm.refund && cob.every(([x, z]) => !tw.roadAt(x, z)), 'taking the cobbled stretch up through the command pays back its refund');
  const one = tw.money, [ux, uz] = P(5, 5);
  ok(tw.removeRoad(...P(2, 5)) === true && tw.money === one + roadRefund(1, 0, false) && ux >= 0, 'taking up a single tile pays back too');
}

// 3h. dressing a street: trees, hedges, lamps or a planted median priced per
// tile, kept off junctions, bends and driveways, liked by the neighbours,
// saved, and taken away with the road
{
  const { planDress, applyDress, dressSpots, plainLamp } = await import('../src/world/roadDress.js');
  const { planRoadEdit, applyRoadEdit } = await import('../src/world/roadEdit.js');
  const { runCommand } = await import('../src/commands.js');
  const { DRESSINGS, dressRefund, roadRefund } = await import('../src/config.js');
  const { doorPoint } = await import('../src/world/world.js');
  const tw = World.createNew({ N: 48, seed: 12, name: 'Avenue End' });
  tw.money = 1e6;
  let o = null;
  for (let z = 1; z < tw.N - 10 && !o; z++) for (let x = 1; x < tw.N - 11 && !o; x++) {
    let free = true;
    for (let dz = -1; dz < 9 && free; dz++) for (let dx = -1; dx < 11 && free; dx++) {
      const X = x + dx, Z = z + dz;
      if (tw.terrain.isWater(X, Z) || tw.roadAt(X, Z) || tw.railAt(X, Z) || tw.buildingOn(X, Z) || tw.terrain.slope(X, Z) > 0.5) free = false;
    }
    if (free) o = { x, z };
  }
  ok(!!o, 'found a free patch for the street-dressing checks');
  const P = (x, z) => [o.x + x, o.z + z];
  // a paved street (0..8, 2), a cobbled one down from it (4, 3..6) turning
  // east (5..6, 6), and a cottage beside the paved street at (2, 3)
  tw.setSandbox({ unlockAll: true });
  const paved = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(x => P(x, 2)), cob = [...[3, 4, 5, 6].map(z => P(4, z)), P(5, 6), P(6, 6)];
  tw.placeRoads(paved, 3);
  tw.placeRoads(cob, 2);
  const H = tw.placeBuilding('house', ...P(2, 3), { instant: true }).building;
  tw.setSandbox({ unlockAll: false });
  const all = [...paved, ...cob];
  const early = planDress(tw, all, 1);
  ok(!early.n && /Unlocks at 25/.test(early.blocked[0].reason) && planDress(tw, all, 2).n === all.length, 'avenues wait for a village; hedges can go in from the start');
  tw.setSandbox({ unlockAll: true });
  const med = planDress(tw, all, 4);
  ok(med.n === paved.length && med.blocked[0].reason === 'Only on paved streets', 'a planted median only goes down paved streets');
  const trees = planDress(tw, all, 1);
  ok(trees.n === all.length && trees.cost === all.length * DRESSINGS[1].cost, `an avenue costs $${DRESSINGS[1].cost} a tile ($${trees.cost} for ${all.length})`);
  // the town hall's appeal before and after (the sim adds it up)
  const tg = { world: tw, speed: 0, _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); } };
  const sim = new Sim(tg);
  sim.recompute();
  const hi = tw.idx(H.x, H.z), before = sim.appeal[hi], m0 = tw.money, forward = H.front;
  sim._budget();
  const upkeep0 = sim.budget.expense.roads;
  ok(applyDress(tw, all, 1).ok && tw.money === m0 - trees.cost && tw.dress[tw.idx(...P(1, 2))] === 1, 'the avenue is planted and paid for');
  sim.recompute();
  sim._budget();
  ok(sim.appeal[hi] > before + 1, `the cottage beside it likes it (appeal ${before.toFixed(1)} → ${sim.appeal[hi].toFixed(1)})`);
  ok(Math.abs(sim.budget.expense.roads - upkeep0 - all.length * DRESSINGS[1].upkeep) < 1e-6, 'and the avenue has its upkeep');
  let sp = dressSpots(tw);
  const tileOf = (p) => [Math.floor(p.x), Math.floor(p.z)];
  const at = (list, [x, z]) => list.filter(p => tileOf(p)[0] === x && tileOf(p)[1] === z);
  ok(sp.trees.length > 10 && !at(sp.trees, P(4, 2)).length && !at(sp.trees, P(4, 6)).length, `street trees (${sp.trees.length}) stand clear of the junction and the bend`);
  const door = doorPoint(H);
  const nearDoor = (list, gap) => list.filter(p => p.z > door.z - 0.5 && Math.abs(p.x - door.x) < gap && tileOf(p)[1] === o.z + 2);
  ok(forward > 0 && trees.back.includes(H.id) && H.front === 0 && sp.trees.some(p => tileOf(p)[0] === o.x + 2 && tileOf(p)[1] === o.z + 2 && p.z > o.z + 2.5), 'the cottage that stood forward into the street steps back behind its trees');
  ok(!nearDoor(sp.trees, 0.2).length && (!H.front || !sp.trees.some(p => tileOf(p)[1] === o.z + 2 && tileOf(p)[0] === o.x + 2 && p.z > o.z + 2.5)), 'and leave the cottage its driveway');
  // hedges instead along the paved street: a quarter of the trees back
  const m1 = tw.money, hedge = applyDress(tw, paved, 2);
  ok(hedge.ok && hedge.refund === paved.length * dressRefund(1) && tw.money === m1 - hedge.spent + hedge.refund, 'swapping trees for hedges pays back a quarter of the trees');
  sp = dressSpots(tw);
  ok(sp.hedges.length > 50 && !nearDoor(sp.hedges, 0.13).length && !at(sp.hedges, P(4, 2)).length, `hedges (${sp.hedges.length} plants) run along the street with gaps at the junction and the driveway`);
  // lamps down the cobbled street, instead of its plain ones
  applyDress(tw, cob, 3);
  sp = dressSpots(tw);
  ok(sp.lamps.length >= 1 && cob.every(([x, z]) => !plainLamp(tw, x, z)), `a lamp-lit street has its own lamps (${sp.lamps.length}) and none of the plain ones`);
  // a planted median down the paved street
  applyDress(tw, paved, 4);
  sp = dressSpots(tw);
  ok(sp.medians.length === 6 && !at(sp.medians.map(m => ({ x: (m.x0 + m.x1) / 2, z: (m.z0 + m.z1) / 2 })), P(4, 2)).length && sp.shrubs.length > 6, 'the median runs down the straight paved tiles, stopping short of the junction and the ends');
  ok(planRoadEdit(tw, paved, 'down').undressed === paved.length, 'downgrading below paving would take the median off');
  applyRoadEdit(tw, [P(1, 2)], 'down');
  ok(tw.dress[tw.idx(...P(1, 2))] === 0 && tw.roadAt(...P(1, 2)) === 2, 'and does');
  // saved, sent to guests through the command, and gone with the road
  const back = deserialize(JSON.parse(JSON.stringify(serialize(tw))));
  ok(back.dress.every((v, i) => v === tw.dress[i]) && back.dress.some(Boolean), 'saves keep the dressed streets');
  const g2 = { world: tw, demo: false, emit() {} };
  ok(!runCommand(g2, { t: 'dress', kind: 9, tiles: cob }).ok && runCommand(g2, { t: 'dress', kind: 0, tiles: [P(4, 6)] }).ok && !tw.dress[tw.idx(...P(4, 6))], 'the dress command refuses unknown kinds and can take a dressing away');
  const m2 = tw.money, lampTile = P(4, 4);
  ok(tw.removeRoad(...lampTile) === true && !tw.dress[tw.idx(...lampTile)] && tw.money === m2 + roadRefund(2, 0, false) + dressRefund(3), 'taking a lamp-lit tile up takes its lamp too (a quarter of both back)');
}

// 3z. every method the UI, game and input code call on themselves exists
// (a missing one only shows up as a frozen game in the browser)
{
  const fsm = await import('node:fs');
  const missing = [];
  const esc = (s) => s.replace(/[$]/g, '[$]');
  for (const f of ['src/ui/ui.js', 'src/game.js', 'src/ui/input.js', 'src/render/worldView.js', 'src/sim/construction.js', 'src/world/world.js', 'src/sim/sim.js', 'src/sim/agents.js', 'src/net/session.js', 'src/net/sync.js', 'src/net/cursors.js']) {
    const src = fsm.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const called = new Set([...src.matchAll(/this\.([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]));
    for (const name of called) {
      const n = esc(name);
      const defined = new RegExp('^\\s+(?:static\\s+|async\\s+|get\\s+)?' + n + '\\s*\\(', 'm').test(src) || new RegExp('this\\.' + n + '\\s*=').test(src);
      if (!defined) missing.push(f + ': this.' + name + '()');
    }
  }
  ok(!missing.length, 'no calls to missing methods' + (missing.length ? ': ' + missing.join(', ') : ''));
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

// 5. snow: only in winter; a fall lays fresh snow on roads and roofs, and it
// melts away again within the day (the same for everyone from the weather)
{
  const { freshSnowAt, coverAt } = await import('../src/render/sky.js');
  const { seasonOf } = await import('../src/config.js');
  let summer = 0, peak = 0, clear = 0, winterHours = 0;
  for (let day = 1; day <= 48; day++) for (let h = 0; h < 24; h += 0.5) {
    const f = freshSnowAt(77, day, h);
    if (seasonOf(day) !== 3) { summer = Math.max(summer, f, coverAt(day, h)); continue; }
    winterHours++; peak = Math.max(peak, f); if (f < 0.02) clear++;
  }
  ok(summer === 0 && peak > 0.6 && clear > winterHours * 0.3, `fresh snow only in winter: up to ${peak.toFixed(2)} after a fall, gone again ${Math.round((clear / winterHours) * 100)}% of winter hours`);
  // the seasons turn gradually: each holds for its first half, then shades
  // into the next, ending where the next begins
  const { seasonBlend } = await import('../src/render/sky.js');
  const { CONFIG } = await import('../src/config.js');
  const D = CONFIG.DAYS_PER_SEASON;
  let jump = 0;
  for (let t = 0.25; t < 8 * D * 24; t += 0.25) {
    const day = 1 + Math.floor(t / 24), h = t % 24, pd = 1 + Math.floor((t - 0.25) / 24), ph = (t - 0.25) % 24;
    const look = (d, hh) => seasonOf(d) + seasonBlend(d, hh);   // seasons and the turn between, on one scale
    let a = look(pd, ph), b = look(day, h);
    if (b < a - 2) b += 4;   // winter into spring
    jump = Math.max(jump, Math.abs(b - a));
  }
  ok(seasonBlend(1, 12) === 0 && seasonBlend(D / 2, 0) === 0 && seasonBlend(D, 23.9) > 0.97 && jump < 0.03, `seasons hold for half their days, then turn gradually (largest step in a quarter hour ${jump.toFixed(3)})`);
}

// ---- saves in the browser are packed (src/save/pack.js)
{
  const { pack, unpack, isPacked } = await import('../src/save/pack.js');
  const rnd = (n, max, seed) => { let x = seed, s = ''; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; s += String.fromCharCode(x % max); } return s; };
  const cases = ['', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'abababababababab', 'Zoë Ñúñez — 🏰 and a lone \ud800 surrogate', rnd(6000, 65536, 1), rnd(150000, 40, 2), rnd(120000, 65536, 3), 'x'.repeat(60000) + rnd(30000, 300, 4)];
  const plain = (p) => { for (let i = 5; i < p.length; i++) { const c = p.charCodeAt(i); if (c < 32 || c > 0x801f) return false; } return true; };
  const bad = cases.filter(c => { const p = pack(c); return !isPacked(p) || unpack(p) !== c || !plain(p); });
  ok(!bad.length, `packing a save round-trips any text, every packed character a plain one (${cases.length} cases${bad.length ? ', failed: ' + bad.map(c => c.length).join(', ') : ''})`);
  const w = World.createNew({ N: 48, seed: 99, name: 'Packby' });
  const text = JSON.stringify(serialize(w)), p = pack(text);
  ok(unpack(p) === text && p.length < text.length * 0.6 && unpack(text) === text, `a town's save packs to ${Math.round(100 * p.length / text.length)}% and back, and an unpacked (older) save reads as it is`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
