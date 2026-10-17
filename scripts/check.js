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
import { serialize, deserialize } from '../src/save/saves.js';
import { buildModel } from '../src/render/buildings.js';
import { BUILDINGS } from '../src/defs.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };

// 1. every model builds
let verts = 0;
for (const [type, def] of Object.entries(BUILDINGS)) {
  def.levels.forEach((_, level) => {
    for (const variant of [1, 2, 3]) {
      const m = buildModel({ type, level, variant, size: def.size, baseY: 0.5, minY: 0.2, rot: 1, rail: def.needsRail ? { x: 0, z: 0, dir: 0 } : null });
      if (!m.geo || !m.geo.attributes.position.count) throw new Error(`empty model ${type} L${level}`);
      for (const v of m.geo.attributes.position.array) if (!Number.isFinite(v)) throw new Error(`NaN in ${type} L${level}`);
      verts += m.geo.attributes.position.count;
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
growDemoTown(w, 99, 1);
game.world = w;
game.paths = new PathFinder(w);
game.sim = new Sim(game);
game.transit = new Transit(game);
game.sim.seedFounders();
game.agents = new Agents(game);
game.on('day', () => game.transit.planCarts());
game.transit.rebuild();
game.transit.planCarts();
const pop0 = w.population;
ok(pop0 > 10, `demo town seeded with ${pop0} villagers`);

// add a coach line between two stops along the roads
const stops = [];
for (let z = 0; z < w.N && stops.length < 3; z++) for (let x = 0; x < w.N && stops.length < 3; x++) {
  if (stops.some(s => Math.abs(s.x - x) + Math.abs(s.z - z) < 8)) continue;
  const r = w.placeBuilding('coachstop', x, z, { free: true, ignoreMoney: true });
  if (r.ok && r.building.connected) stops.push(r.building); else if (r.ok) w.removeBuilding(r.building.id, 0);
}
w.money += 1000;
const line = game.transit.createLine('coach', stops.map(s => s.id));
ok(line.ok, `coach line created through ${stops.length} stops (${line.reason || 'ok'})`);
game.transit.rebuild();

let maxWalkers = 0, frames = 0;
const startDay = w.day;
while (w.day < startDay + 6 && frames < 40000) {
  const gdt = game.sim.update(0.1);
  game.agents.update(0.1, gdt);
  game.transit.update(0.1);
  maxWalkers = Math.max(maxWalkers, game.agents.walkers.size);
  frames++;
}
ok(w.day >= startDay + 6, `ran 6 days in ${frames} frames`);
ok(maxWalkers > 5, `villagers walked about (peak ${maxWalkers} on screen)`);
ok((events.coins || 0) > 0, `shops / fares earned coins (${events.coins} payouts, ${w.stats.visitIncome} coins)`);
const st = game.transit.stats[line.line?.id] || { riders: 0 };
console.log('      coach riders:', st.riders, ' population:', pop0, '→', w.population, ' money:', Math.round(w.money), ' happiness:', Math.round(game.sim.happiness));
ok(game.transit.vehicles.length === 1, 'one coach on the line');

// 3b. railway: lay a straight track with a station at each end and run a train
{
  w.setSandbox({ infiniteMoney: true, unlockAll: true });
  let made = null;
  for (let z = 2; z < w.N - 2 && !made; z++) {
    for (let x = 2; x < w.N - 14 && !made; x++) {
      const tiles = [];
      for (let k = 0; k < 12; k++) tiles.push([x + k, z]);
      if (!tiles.every(([tx, tz]) => w.checkRail(tx, tz).ok && !w.roadAt(tx, tz))) continue;
      if (!w.checkRoad(x, z + 2, 1).ok || !w.checkRoad(x + 11, z + 2, 1).ok) continue;
      w.placeRails(tiles);
      w.placeRoads([[x, z + 2], [x + 11, z + 2]], 1);
      const s1 = w.placeBuilding('station', x, z + 1, {});
      const s2 = s1.ok ? w.placeBuilding('station', x + 11, z + 1, {}) : { ok: false };
      if (s1.ok && s2.ok) made = [s1.building, s2.building];
      else { if (s1.ok) w.removeBuilding(s1.building.id); for (const [tx, tz] of tiles) w.removeRail(tx, tz); }
    }
  }
  if (made) {
    const rl = game.transit.createLine('rail', made.map(b => b.id));
    ok(rl.ok, `rail line created (${rl.reason || 'ok'})`);
    game.transit.rebuild();
    const v = game.transit.vehicles.find(v => v.line.mode === 'rail');
    const visited = new Set();
    let minGap = Infinity, maxGap = 0, reversals = 0, lastDir = v ? v.dir : 1;
    for (let i = 0; i < 2400; i++) {
      game.sim.update(0.05); game.agents.update(0.05, 0.05); game.transit.update(0.05);
      if (!v) break;
      if (v.state === 'dwell') visited.add(v.next);
      if (v.dir !== lastDir) { reversals++; lastDir = v.dir; }
      const a = v.meshes[0].position, b = v.meshes[1].position;
      const gap = Math.hypot(a.x - b.x, a.z - b.z);
      minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
    }
    ok(v && visited.size === 2, `train calls at both stations (${[...visited].join(', ')})`);
    ok(reversals >= 2, `train shuttles back and forth (${reversals} reversals)`);
    ok(minGap > 0.45 && maxGap < 0.62, `engine never runs into its carriages (gap ${minGap.toFixed(2)}–${maxGap.toFixed(2)})`);
  } else console.log('      (no flat spot for a rail test on this map)');
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

// 4. save round-trip
const data = serialize(w);
const json = JSON.stringify(data);
const w2 = deserialize(JSON.parse(json));
ok(w2.buildings.size === w.buildings.size, `save round-trip buildings (${w.buildings.size}) — ${(json.length / 1024).toFixed(0)} KB`);
ok(w2.residents.size === w.residents.size, `save round-trip residents (${w.residents.size})`);
ok(w2.trees.length === w.trees.length, `save round-trip trees (${w.trees.length})`);
ok(w2.lines.length === w.lines.length, 'save round-trip lines');
let same = true;
for (let i = 0; i < w.terrain.H.length; i++) if (Math.abs(w.terrain.H[i] - w2.terrain.H[i]) > 0.001) same = false;
ok(same, 'save round-trip heights');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
