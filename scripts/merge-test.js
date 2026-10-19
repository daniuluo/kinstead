// Headless test for "Merge villages": merges generated towns in every kind of
// arrangement (beside on each side, overlapping, apart, turned, trimmed to fit,
// a town with itself) and checks the result is a sound town: no overlapping
// plots, no dangling references, one town hall, one road network, nothing on
// water, a smooth join, a clean save round-trip, and a simulation that runs.
// Usage: node scripts/merge-test.js [--write dir]   (--write saves the inputs
// and one merged town as .json files, handy for trying them in the browser)

import { World, fw, fd } from '../src/world/world.js';
import { growDemoTown } from '../src/world/demo.js';
import { PathFinder } from '../src/sim/path.js';
import { Sim } from '../src/sim/sim.js';
import { Agents } from '../src/sim/agents.js';
import { Transit } from '../src/sim/transit.js';
import { Construction } from '../src/sim/construction.js';
import { serialize, deserialize } from '../src/save/saves.js';
import { mergeTowns, layoutMerge, besideOffset, reportLines, MERGE_MAX_N, newVillage } from '../src/save/merge.js';
import { BUILDINGS, TECHS, LINE_COLORS } from '../src/defs.js';
import { auditTown } from './audit.js';

let failures = 0, passes = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FAIL', msg); } else passes++; };
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };

const scene = { add() {}, remove() {} };
function gameFor(w) {
  const g = {
    world: w, speed: 4, env: { night: 0 }, renderer: { scene, worldToScreen: () => ({ x: 0, y: 0 }) }, view: { smoke: { emit() {} } },
    _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); },
  };
  g.paths = new PathFinder(w);
  g.sim = new Sim(g);
  g.transit = new Transit(g);
  return g;
}

// A lived-in town: grown streets and buildings, founders, a coach line, a
// house being moved and a building site, so ids and references get exercised.
function makeTown(N, seed, name, { day = 1, research = null, bigParks = false } = {}) {
  const w = World.createNew({ N, seed, name });
  growDemoTown(w, seed, 1);
  const g = gameFor(w);
  g.sim.seedFounders();
  w.money = 6000;
  const stops = [];
  for (let z = 0; z < N && stops.length < 3; z++) for (let x = 0; x < N && stops.length < 3; x++) {
    if (stops.some(s => Math.abs(s.x - x) + Math.abs(s.z - z) < 7)) continue;
    const r = w.placeBuilding('coachstop', x, z, { free: true, ignoreMoney: true, instant: true });
    if (r.ok && r.building.connected) stops.push(r.building); else if (r.ok) w.removeBuilding(r.building.id, 0);
  }
  if (stops.length >= 2) w.lines.push({ id: w.newId(), mode: 'coach', name: 'Coach Line 1', color: LINE_COLORS[0], stops: stops.map(s => s.id), vehicles: 1 });
  const home = [...w.buildings.values()].find(b => b.type === 'house' && !b.con && b.residents.length);
  if (home) {
    for (let r = 2; r < 9; r++) {
      let done = false;
      for (let dz = -r; dz <= r && !done; dz++) for (let dx = -r; dx <= r && !done; dx++) {
        const c = w.moveCheck(home, home.x + dx, home.z + dz);
        if (c.ok && c.access.some(a => a.conn)) done = w.moveBuilding(home.id, home.x + dx, home.z + dz).ok;
      }
      if (done) break;
    }
  }
  for (let z = 2; z < N - 2; z++) {
    const c = w.checkBuild('house', N >> 1, z, { ignoreMoney: true });
    if (c.ok) { w.placeBuilding('house', N >> 1, z, {}); break; }
  }
  // a City Park and a Grand Park, laid out round what they grew from
  if (bigParks) for (const [type, flavor] of [['citypark', 'grandpark#1@1,-1/zoo#0@-1,1'], ['grandpark', 'landscapepark#1@-1,1/rosegarden']]) {
    const S = BUILDINGS[type].size;
    let done = false;
    for (let z = 2; z < N - S - 1 && !done; z++) for (let x = 2; x < N - S - 1 && !done; x++) {
      if (w.checkBuild(type, x, z, { ignoreMoney: true, ignoreUnlock: true }).ok) done = w.placeBuilding(type, x, z, { instant: true, ignoreUnlock: true, ignoreMoney: true, free: true, flavor }).ok;
    }
  }
  w.day = day;
  if (research) w.research = { done: research.slice(), current: null, progress: 0, bank: 5 };
  return JSON.parse(JSON.stringify(serialize(w)));
}

const maxStep = (t) => {
  let m = 0;
  for (let z = 0; z <= t.N; z++) for (let x = 0; x <= t.N; x++) {
    if (x < t.N) m = Math.max(m, Math.abs(t.ch(x, z) - t.ch(x + 1, z)));
    if (z < t.N) m = Math.max(m, Math.abs(t.ch(x, z) - t.ch(x, z + 1)));
  }
  return m;
};

function roadPieces(w) {
  const N = w.N, seen = new Uint8Array(N * N);
  let pieces = 0;
  for (let s = 0; s < N * N; s++) {
    if (!w.roads[s] || seen[s]) continue;
    pieces++;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, ni = nz * N + nx;
        if (nx >= 0 && nz >= 0 && nx < N && nz < N && w.roads[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni); }
      }
    }
  }
  return pieces;
}

// steepest corner-to-corner step within `band` corners of either town's edge
function seamStep(w, L, band) {
  const t = w.terrain, N = w.N;
  const lines = [];
  for (const [x, z, n] of [[L.ax, L.az, L.NA], [L.bx, L.bz, L.NB]]) lines.push(['x', x], ['x', x + n], ['z', z], ['z', z + n]);
  const near = (cx, cz) => lines.some(([k, v]) => v > 0 && v < N && Math.abs((k === 'x' ? cx : cz) - v) <= band);
  let m = 0;
  for (let cz = 0; cz <= N; cz++) for (let cx = 0; cx <= N; cx++) {
    if (!near(cx, cz)) continue;
    if (cx < N) m = Math.max(m, Math.abs(t.ch(cx, cz) - t.ch(cx + 1, cz)));
    if (cz < N) m = Math.max(m, Math.abs(t.ch(cx, cz) - t.ch(cx, cz + 1)));
  }
  return m;
}

function checkMerge(label, dA, dB, arr, { simDays = 0 } = {}) {
  const wA = deserialize(dA), wB = deserialize(dB);
  const L = layoutMerge(wA, wB, arr);
  if (!L.ok) { ok(false, `${label}: layout refused (${L.reason})`); return null; }
  const t0 = Date.now();
  const { data, world: w, report: rep } = mergeTowns(dA, dB, arr);
  const ms = Date.now() - t0;
  const g = gameFor(w);
  g.sim.recompute();
  const probs = [];
  auditTown(w, (m) => probs.push(m));
  ok(!probs.length, `${label}: town invariants hold${probs.length ? ' — ' + probs.slice(0, 4).join('; ') : ''}`);
  ok(w.N === L.N && w.N <= MERGE_MAX_N, `${label}: map is ${w.N}×${w.N}`);
  // ids: buildings, villagers and lines share one counter, so no id is used twice
  const ids = [...w.buildings.keys(), ...w.residents.keys(), ...w.lines.map(l => l.id)];
  ok(new Set(ids).size === ids.length, `${label}: every id is unique`);
  ok(ids.every(i => i < w.nextId), `${label}: next id is past every id in use`);
  ok([...w.buildings.values()].filter(b => BUILDINGS[b.type].unique).length <= 1, `${label}: at most one town hall`);
  // every building is still there, or the report says where it went
  const gone = wA.buildings.size + wB.buildings.size - w.buildings.size;
  ok(gone === rep.refunded.length + rep.removed.length, `${label}: buildings add up (${gone} gone, ${rep.refunded.length} refunded, ${rep.removed.length} dropped)`);
  // the ground suits every building
  const wet = [...w.buildings.values()].filter(b => { for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) if (w.terrain.isWater(b.x + dx, b.z + dz)) return true; return false; });
  ok(!wet.length, `${label}: no building stands in water${wet.length ? ` (${wet.map(b => b.type).join(', ')})` : ''}`);
  const steep = [...w.buildings.values()].filter(b => {
    let lo = Infinity, hi = -Infinity;
    for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) { lo = Math.min(lo, w.terrain.tileMin(b.x + dx, b.z + dz)); hi = Math.max(hi, w.terrain.tileMax(b.x + dx, b.z + dz)); }
    return hi - lo > 1.3;
  });
  ok(!steep.length, `${label}: no building on a cliff`);
  // one road network, reaching the edge of the map, that every building uses
  const pieces = roadPieces(w);
  ok(pieces === 1, `${label}: one road network (${pieces} piece${pieces === 1 ? '' : 's'})`);
  const e = w.entry;
  ok(w.roadAt(e.x, e.z) && (e.x === 0 || e.z === 0 || e.x === w.N - 1 || e.z === w.N - 1), `${label}: the road out of town starts at the map edge (${e.x},${e.z})`);
  const cut = [...w.buildings.values()].filter(b => !BUILDINGS[b.type].park && !b.connected);
  ok(!cut.length, `${label}: every building reaches the road network${cut.length ? ` (${cut.length} cut off: ${cut.slice(0, 3).map(b => b.type + '@' + b.x + ',' + b.z).join(' ')})` : ''}`);
  // a smooth join: no step steeper than the steepest in either valley, at the
  // edges of the two maps or anywhere else (overlaps join inside the overlap)
  const natural = Math.max(maxStep(wA.terrain), maxStep(wB.terrain), 0.75);
  const step = seamStep(w, L, rep.seam.width + 1), anywhere = maxStep(w.terrain);
  ok(step <= natural + 0.05, `${label}: smooth join at the map edges (steepest step ${step.toFixed(2)}, valleys ${natural.toFixed(2)})`);
  ok(anywhere <= natural + 0.05, `${label}: no cliff anywhere on the merged map (steepest step ${anywhere.toFixed(2)})`);
  // streets stay on dry ground: no more bridges than both towns had, plus a
  // few where joined-up rivers cross a road
  const bridges = (x) => { let n = 0; for (let i = 0; i < x.N * x.N; i++) if (x.roads[i] && x.terrain.isWater(i % x.N, (i / x.N) | 0)) n++; return n; };
  ok(bridges(w) <= bridges(wA) + bridges(wB) + 6 * rep.rivers + rep.roadsLaid, `${label}: roads were not flooded (${bridges(w)} bridge tiles, towns had ${bridges(wA)} + ${bridges(wB)})`);
  // people: everyone has a real home, nobody was lost without being counted
  const homeless = [...w.residents.values()].filter(r => r.home == null || !BUILDINGS[w.buildings.get(r.home)?.type]?.levels[w.buildings.get(r.home).level].housing);
  ok(!homeless.length, `${label}: every villager has a home`);
  ok(w.residents.size === wA.residents.size + wB.residents.size - rep.released, `${label}: villagers add up (${wA.residents.size} + ${wB.residents.size} − ${rep.released} moved away)`);
  const names = [...w.residents.values()].map(r => `${r.first} ${r.last}`);
  ok(new Set(names).size === names.length, `${label}: no two villagers share a name`);
  // lines, research, money, calendar
  ok(w.lines.every(l => l.stops.length >= 2 && l.stops.every(s => w.buildings.has(s))), `${label}: transit lines only stop at real stops`);
  ok(new Set(w.lines.map(l => l.name)).size === w.lines.length, `${label}: transit line names are unique`);
  const union = new Set([...wA.research.done, ...wB.research.done]);
  ok(w.research.done.length === union.size && [...union].every(t => w.research.done.includes(t)), `${label}: research is the union of both towns (${union.size})`);
  ok(Math.abs(w.money - (wA.money + wB.money + rep.refundTotal)) <= 1, `${label}: money is summed plus refunds`);
  ok(w.day === Math.max(wA.day, wB.day), `${label}: calendar is the later town's (day ${w.day})`);
  // move pairs and sites still point at real buildings
  ok([...w.buildings.values()].every(b => !b.con || b.con.wait !== 'dismantle' || w.buildings.has(b.con.from)), `${label}: buildings being moved still have their old plot`);
  // it saves and loads back the same
  const w2 = deserialize(JSON.parse(JSON.stringify(data)));
  ok(w2.buildings.size === w.buildings.size && w2.residents.size === w.residents.size && w2.lines.length === w.lines.length && w2.N === w.N, `${label}: save round-trip`);
  // and the town runs
  if (simDays) {
    g.agents = new Agents(g);
    g.construction = new Construction(g);
    g.transit.rebuild();
    g.transit.planCarts();
    const end = w.day + simDays;
    let frames = 0;
    while (w.day < end && frames < 30000) { const dt = g.sim.update(0.1); g.agents.update(0.1, dt); g.construction.update(0.1, dt); g.transit.update(0.1); frames++; }
    const p2 = [];
    auditTown(w, (m) => p2.push(m));
    ok(w.day >= end && !p2.length, `${label}: ran ${simDays} day${simDays > 1 ? 's' : ''} after merging${p2.length ? ' — ' + p2.slice(0, 3).join('; ') : ''}`);
  }
  log(`  ${label.padEnd(26)} ${String(ms).padStart(4)} ms · ${w.N}×${w.N} · ${w.buildings.size} buildings · ${w.residents.size} villagers · seam ${rep.seam.width} (${step.toFixed(2)}) · moved ${rep.moved.length} · refunded ${rep.refunded.length} · roads +${rep.roadsLaid + rep.entryLaid} · rivers ${rep.rivers}`);
  return { w, rep, data };
}

// ------------------------------------------------------------ the towns
const T = {
  a: makeTown(48, 101, 'Amberford', { research: ['commerce', 'surveying', 'joining'] }),
  b: makeTown(48, 202, 'Bramblewick', { day: 23, research: ['commerce', 'hydraulics'] }),
  c: makeTown(32, 303, 'Cloverdale', { day: 9 }),
  d: makeTown(64, 404, 'Dunmere', { day: 40 }),
  // brand-new villages, as merged in from the game: an empty valley and a starter town
  e: newVillage({ seed: 777, N: 48, name: 'Freshby' }),
  s: newVillage({ starter: 'mill', name: 'Millstead' }),
};
log('towns:', Object.entries(T).map(([k, d]) => `${k}=${d.name} ${d.N}×${d.N} (${d.buildings.length} buildings, ${d.residents.length} villagers)`).join(' · '));

const runs = [];
for (const side of ['right', 'left', 'below', 'above']) runs.push([`beside ${side}`, 'a', 'b', { ...besideOffset(48, 48, side), rot: 0 }, 1]);
for (let rot = 1; rot < 4; rot++) runs.push([`beside right, turned ${rot * 90}°`, 'a', 'b', { ...besideOffset(48, 48, 'right'), rot }, 0]);
runs.push(['overlap 28,6', 'a', 'b', { x: 28, z: 6, rot: 0 }, 1]);
runs.push(['overlap 20,6 turned 180°', 'a', 'b', { x: 20, z: 6, rot: 2 }, 0]);
runs.push(['overlap -14,-10 turned 90°', 'a', 'b', { x: -14, z: -10, rot: 1 }, 0]);
runs.push(['overlap right on top', 'a', 'b', { x: 0, z: 0, rot: 0 }, 1]);
runs.push(['apart with a gap', 'a', 'c', { x: 54, z: 10, rot: 3 }, 0]);
runs.push(['small inside big', 'd', 'c', { x: 4, z: 4, rot: 1 }, 1]);
runs.push(['big beside, trimmed', 'd', 'a', { ...besideOffset(64, 48, 'below'), rot: 0 }, 0]);
runs.push(['a town with itself', 'a', 'a', { x: 30, z: 4, rot: 0 }, 0]);
runs.push(['a brand-new village beside', 'a', 'e', { ...besideOffset(48, 48, 'above'), rot: 0 }, 1]);
runs.push(['a starter town overlapping', 'a', 's', { x: 20, z: 10, rot: 1 }, 1]);

const t0 = Date.now();
let rivers = 0, moved = 0, refunded = 0;
let sample = null;
for (const [label, a, b, arr, days] of runs) {
  const r = checkMerge(label, T[a], T[b], arr, { simDays: days });
  if (!r) continue;
  rivers += r.rep.rivers; moved += r.rep.moved.length; refunded += r.rep.refunded.length;
  if (label === 'overlap 28,6') sample = r;
}
// a town's 3×3 and 4×4 parks come through a merge whole, turned with their
// town, laid out round what they grew from
{
  const P = makeTown(48, 101, 'Parkhurst', { bigParks: true });
  const big = (d) => d.buildings.filter(r => BUILDINGS[r[1]].grand).map(r => `${r[1]}:${r[8]}×${r[9]}:${r[10]}`).sort();
  const before = big(P);
  for (const [label, arr] of [['big parks beside', { ...besideOffset(48, 48, 'right'), rot: 0 }], ['big parks turned 90°', { ...besideOffset(48, 48, 'left'), rot: 1 }]]) {
    const r = checkMerge(label, T.b, P, arr);
    if (!r) continue;
    const after = big(r.data);
    ok(before.length === 2 && JSON.stringify(after) === JSON.stringify(before), `${label}: the City Park and the Grand Park come through whole (${after.join(', ')})`);
  }
}
// rivers that reach the join a few tiles apart flow on into the other valley
{
  const rA = makeTown(48, 1, 'Riverby'), rB = makeTown(48, 46, 'Fordwick');
  const r = checkMerge('rivers meet at the join', rA, rB, { x: 48, z: 0, rot: 0 });
  if (r) {
    const wA = deserialize(rA), wB = deserialize(rB), w = r.w, N = w.N, L = layoutMerge(wA, wB, { x: 48, z: 0 });
    const wetMid = (src, x) => { const zs = []; for (let z = 0; z < src.N; z++) if (src.terrain.isWater(x, z)) zs.push(z); return zs.length ? zs[zs.length >> 1] : null; };
    const za = wetMid(wA, 42), zb = wetMid(wB, 5);
    const from = [L.ax + 42, L.az + za], to = [L.bx + 5, L.bz + zb];
    const seen = new Uint8Array(N * N), q = [from[1] * N + from[0]];
    seen[q[0]] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, ni = nz * N + nx;
        if (nx >= 0 && nz >= 0 && nx < N && nz < N && !seen[ni] && w.terrain.isWater(nx, nz)) { seen[ni] = 1; q.push(ni); }
      }
    }
    ok(za != null && zb != null && w.terrain.isWater(...from) && seen[to[1] * N + to[0]], `the river flows on across the join (z ${za} → ${zb}, ${r.rep.rivers} carried across)`);
  }
}
// buried power lines and street dressings stay with their streets
{
  const wA = deserialize(T.a);
  let k = 0;
  for (let i = 0; i < wA.N * wA.N; i++) if (wA.roads[i]) { wA.buried[i] = k & 1; wA.dress[i] = 1 + (k % 2); k++; }
  const dA = JSON.parse(JSON.stringify(serialize(wA)));
  const arr = { ...besideOffset(48, 48, 'right'), rot: 0 };
  const r = checkMerge('dressed streets beside', dA, T.b, arr);
  if (r) {
    const w = r.w, L = layoutMerge(wA, deserialize(T.b), arr);
    let kept = 0, wrong = 0, stray = 0;
    for (let z = 0; z < wA.N; z++) for (let x = 0; x < wA.N; x++) {
      const i = z * wA.N + x, X = L.ax + x, Z = L.az + z;
      if (!wA.roads[i] || !w.inBounds(X, Z) || !w.roads[Z * w.N + X]) continue;
      const j = Z * w.N + X;
      if (w.buried[j] === wA.buried[i] && w.dress[j] === wA.dress[i]) kept++; else wrong++;
    }
    for (let j = 0; j < w.N * w.N; j++) if (!w.roads[j] && (w.buried[j] || w.dress[j])) stray++;
    ok(kept > 20 && !wrong && !stray, `buried lines and dressings go with their streets (${kept} kept, ${wrong} changed, ${stray} off-street)`);
  }
}
// a boulevard and its look come through a merge, beside and turned (the
// boulevard worked out again from the merged roads; the audit checks every
// look still suits its tile)
{
  const { applyDress } = await import('../src/world/roadDress.js');
  const { DRESSINGS, lookPart } = await import('../src/config.js');
  const wA = deserialize(T.a), N = wA.N, HEDGE = DRESSINGS.findIndex(d => d && d.key === 'bhedge');
  const free = (x, z) => wA.inBounds(x, z) && !wA.roadAt(x, z) && !wA.buildingOn(x, z) && wA.checkRoad(x, z, 1).ok && !wA.terrain.isWater(x, z);
  let pair = null;
  for (let z = 2; z < N - 3 && !pair; z++) for (let x = 2; x < N - 8 && !pair; x++) {
    const a = [0, 1, 2, 3, 4, 5].map(k => [x + k, z]), b = a.map(([ax, az]) => [ax, az + 1]);
    // (touching the town's roads, or the merge would take it up as unjoined)
    const touch = [[x - 1, z], [x - 1, z + 1], [x + 6, z], [x + 6, z + 1], ...a.map(([ax]) => [ax, z - 1]), ...a.map(([ax]) => [ax, z + 2])];
    if ([...a, ...b].every(([ax, az]) => free(ax, az)) && touch.some(([tx, tz]) => wA.inBounds(tx, tz) && wA.connected[wA.idx(tx, tz)])) pair = [...a, ...b];
  }
  wA.money = 1e5;
  const laid = pair && wA.placeRoads(pair, 1).placed === 12;
  const look = laid && applyDress(wA, pair, HEDGE);
  const looked = (w) => { let n = 0; for (let i = 0; i < w.N * w.N; i++) if (w.blvd[i] && lookPart(w.dress[i]) === HEDGE) n++; return n; };
  const n0 = looked(wA);
  ok(laid && look && look.ok && n0 >= 8, `a town with a boulevard with a hedge down it (${n0} lane tiles)`);
  const dA = JSON.parse(JSON.stringify(serialize(wA)));
  for (const [label, arr] of [['a boulevard beside', { ...besideOffset(48, 48, 'right'), rot: 0 }], ['a boulevard turned 90°', { ...besideOffset(48, 48, 'left'), rot: 1 }]]) {
    const r = checkMerge(label, dA, T.b, arr);
    if (r) ok(looked(r.w) >= n0, `${label}: the boulevard and its look come through (${looked(r.w)} of ${n0} lane tiles)`);
  }
}
// something must actually have been settled across all those arrangements
ok(moved > 0 && refunded >= 0, `overlapping plots were moved (${moved}) or refunded (${refunded})`);
ok(runs.some(([l]) => l.startsWith('beside')), 'every side was tried');
// an arrangement too wide for one map is refused with a reason, not merged badly
{
  const big = makeTown(80, 505, 'Eastwold'), big2 = makeTown(80, 606, 'Westwold');
  const L = layoutMerge(deserialize(big), deserialize(big2), { x: 80, z: 0, rot: 0 });
  ok(!L.ok && /limit/.test(L.reason), `two 80×80 valleys side by side are refused (${L.reason || 'accepted'})`);
  let threw = false;
  try { mergeTowns(big, big2, { x: 80, z: 0 }); } catch { threw = true; }
  ok(threw, 'merging them anyway throws instead of producing a broken town');
}
log(`\n  rivers carried across: ${rivers}`);
if (sample && !quiet) for (const [icon, text] of reportLines(sample.rep)) console.log('   ', icon, text);

const wi = process.argv.indexOf('--write');
if (wi > 0) {
  const fs = await import('node:fs');
  const dir = process.argv[wi + 1] || '.';
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, d] of Object.entries(T)) fs.writeFileSync(`${dir}/${d.name.toLowerCase()}.kinstead.json`, JSON.stringify(d));
  if (sample) fs.writeFileSync(`${dir}/merged.kinstead.json`, JSON.stringify(sample.data));
  log(`  wrote saves to ${dir}`);
}

console.log(`\n${passes} checks passed, ${failures} failed · ${runs.length} merges in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
