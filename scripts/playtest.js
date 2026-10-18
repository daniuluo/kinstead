// Headless playtest: a simple bot plays a fresh town for many in-game days
// with the normal economy, using most features (building, roads, research,
// utilities, upgrades with styles, joins, expansions, moves, demolition), and
// checks the town for broken invariants every day. Prints a daily log, a
// summary, and any problems found.
// Usage: node scripts/playtest.js [days=60] [mapSize=48] [seed=2024] [mode]
//   mode: economy (default, real money) · stress (sandbox money, everything
//   unlocked, lots of building / joining / moving every day) · scale (a big
//   ready-grown town, to measure how the simulation copes) · chaos (like
//   stress, with instant construction, so far more upgrades / joins / moves)

import { World, fw, fd, isOpen, capOf } from '../src/world/world.js';
import { PathFinder } from '../src/sim/path.js';
import { Sim } from '../src/sim/sim.js';
import { Agents, visitorCap } from '../src/sim/agents.js';
import { Transit } from '../src/sim/transit.js';
import { Animals } from '../src/sim/animals.js';
import { Construction } from '../src/sim/construction.js';
import { BUILDINGS, TECHS } from '../src/defs.js';
import { STYLES } from '../src/render/buildings.js';
import { serialize, deserialize } from '../src/save/saves.js';
import { computeIssues } from '../src/ui/issues.js';
import { RNG } from '../src/util/rng.js';
import { growDemoTown } from '../src/world/demo.js';

const DAYS = Number(process.argv[2] || 60), N = Number(process.argv[3] || 48), SEED = Number(process.argv[4] || 2024);
const MODE = process.argv[5] || 'economy';
const busy = MODE !== 'economy' ? 3 : 1;
const rng = new RNG(SEED);
const problems = [];
const problem = (day, msg) => { if (problems.length < 60) problems.push(`day ${day}: ${msg}`); };

const scene = { add() {}, remove() {} };
const game = {
  speed: 8, env: { night: 0 }, renderer: { scene, worldToScreen: () => ({ x: 0, y: 0 }) }, view: { smoke: { emit() {} } },
  _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); },
};
const w = World.createNew({ N, seed: SEED, name: 'Botton' });
if (MODE === 'scale') growDemoTown(w, SEED, 2);
if (MODE !== 'economy') w.setSandbox({ infiniteMoney: true, unlockAll: true, instantBuild: MODE === 'chaos' });
game.world = w;
game.paths = new PathFinder(w);
game.sim = new Sim(game);
game.transit = new Transit(game);
game.sim.seedFounders();
game.agents = new Agents(game);
game.animals = new Animals(game);
game.construction = new Construction(game);
game.on('day', () => game.transit.planCarts());
w.on('roads', () => game.paths.invalidate?.());
const counts = { placed: 0, upgrades: 0, merges: 0, expands: 0, moves: 0, demolish: 0, roads: 0, research: 0, born: 0, died: 0, grads: 0 };
game.on('born', (b) => { counts.born += b.length; });
game.on('died', (d) => { counts.died += d.length; });
game.on('graduated', () => { counts.grads++; });
w.on('research:done', () => { counts.research++; });

// ------------------------------------------------------------ bot helpers
const center = (() => { const th = [...w.buildings.values()].find(b => b.type === 'townhall'); return { x: th.x + 1, z: th.z + 1 }; })();
function spots(type, near = center, max = 14) {
  const out = [];
  for (let r = 1; r <= max; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = near.x + dx, z = near.z + dz;
    const c = w.checkBuild(type, x, z);
    if (c.ok && c.access.some(a => a.conn)) out.push({ x, z });
    if (out.length >= 3) return out;
  }
  return out;
}
function place(type, near) {
  if (MODE === 'economy' && [...w.buildings.values()].some(b => b.type === type && b.con && b.con.kind === 'build') && type !== 'house') return null;
  const s = spots(type, near)[0];
  if (!s) return null;
  const r = w.placeBuilding(type, s.x, s.z, { variant: (rng.next() * 1e9) | 0 });
  if (r.ok) counts.placed++;
  return r.ok ? r.building : null;
}
// lay a new street off an existing one, heading out of town
function growRoads() {
  const roads = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (w.roadAt(x, z) && w.connected[w.idx(x, z)]) roads.push([x, z]);
  for (let t = 0; t < 40; t++) {
    const [sx, sz] = rng.pick(roads);
    const [dx, dz] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const tiles = [];
    for (let k = 1; k <= 6; k++) {
      const x = sx + dx * k, z = sz + dz * k;
      if (!w.checkRoad(x, z, 1).ok || w.buildingOn(x, z)) break;
      tiles.push([x, z]);
    }
    if (tiles.length >= 3) { const r = w.placeRoads(tiles, 1); if (r.placed) { counts.roads += r.placed; return true; } }
  }
  return false;
}

// ------------------------------------------------------------ the bot's day
function botDay() {
  const sim = game.sim;
  if (w.money < 150) return;
  for (let k = 1; k < busy; k++) { if (!place(rng.pick(['house', 'house', 'market', 'bakery', 'tavern', 'workshop', 'chapel', 'school', 'clinic', 'garden', 'well']))) growRoads(); }
  const issues = computeIssues(game);
  const has = (t) => issues.some(i => i.text.includes(t));
  // research: cheapest available project
  if (!w.research.current) {
    const can = Object.keys(TECHS).filter(id => w.canResearch(id)).sort((a, b) => TECHS[a].cost - TECHS[b].cost);
    if (can.length) w.startResearch(can[0]);
  }
  // keep the builders ahead of the work
  if (has('waiting for builders')) {
    const yard = [...w.buildings.values()].find(b => b.type === 'builder' && !b.con && w.upgradeCheck(b).ok);
    if (yard) { if (w.upgradeBuilding(yard.id).ok) counts.upgrades++; } else place('builder');
  }
  // homes
  const free = sim.housing.cap - sim.housing.used;
  if (free < 4) { for (let i = 0; i < 2; i++) if (!place('house')) { growRoads(); break; } }
  // jobs
  const jobless = [...w.residents.values()].filter(r => r.age === 'adult' && r.job == null && r.school == null).length;
  if (jobless > 3) place(rng.pick(['market', 'farm', 'workshop', 'lumber', 'bakery', 'tavern'].filter(t => w.checkBuild(t, center.x, center.z).reason !== `Research ${w.techName(BUILDINGS[t].tech)} first`)));
  // services that homes lack
  for (const [s, type] of [['water', 'well'], ['health', 'clinic'], ['safety', 'watch'], ['education', 'school']]) {
    const miss = [...w.buildings.values()].filter(b => b.factors && !b.factors[s] && BUILDINGS[b.type].levels[b.level].housing);
    if (miss.length >= 3) place(type, rng.pick(miss));
  }
  if (has('need a middle school') || has('need a high school') || has('need an elementary')) {
    const sch = [...w.buildings.values()].filter(b => BUILDINGS[b.type].levels[b.level].seats && !b.con);
    const opt = sch.flatMap(b => w.upgradeOptions(b).map(o => ({ b, o }))).find(({ b, o }) => w.upgradeCheck(b, o.type).ok);
    if (opt) { const r = w.upgradeBuilding(opt.b.id, opt.o.type); if (r.ok) counts.upgrades++; } else place('school');
  }
  if (has('Water for')) place(w.hasTech('hydraulics') && rng.chance(0.5) ? 'pump' : 'well');
  if ((has('No electricity') || has('Power short')) && w.hasTech('electricity')) place(rng.chance(0.5) ? 'windgen' : 'watermill');
  if (has('builders can\'t reach') || has('not connected')) growRoads();
  // upgrades, with a random style now and then
  const ups = [...w.buildings.values()].filter(b => !b.con).sort(() => rng.next() - 0.5);
  let n = 0;
  for (const b of ups) {
    if (n >= 3 * busy) break;
    const opts = w.upgradeOptions(b).filter(o => w.upgradeCheck(b, o.type).ok);
    if (!opts.length) continue;
    const o = rng.pick(opts);
    const look = rng.chance(0.3) ? rng.pick(STYLES).id : undefined;
    if (w.upgradeBuilding(b.id, o.type, look).ok) { n++; counts.upgrades++; }
  }
  // joins, expansions, moves, demolition
  for (let k = 0; k < busy; k++) if (rng.chance(MODE !== 'economy' ? 0.8 : 0.25)) {
    const cands = [...w.buildings.values()].filter(b => w.mergeOptions(b).some(m => m.ok));
    const b = cands.length && rng.pick(cands);
    const m = b && rng.pick(w.mergeOptions(b).filter(m => m.ok));
    if (m && w.mergeBuildings(b.id, m.other.id).ok) counts.merges++;
  }
  for (let k = 0; k < busy; k++) if (rng.chance(MODE !== 'economy' ? 0.6 : 0.12)) {
    const cands = [...w.buildings.values()].filter(b => !b.con && w.expandOptions(b).length);
    const b = cands.length && rng.pick(cands);
    const opts = b ? w.expandOptions(b).filter(o => MODE !== 'economy' || o.kind !== 'takeover') : [];
    const o = opts.length && rng.pick(opts);
    if (o && w.expandBuilding(b.id, o.dir, o.kind).ok) counts.expands++;
  }
  if (rng.chance(MODE !== 'economy' ? 0.5 : 0.06)) {
    const cands = [...w.buildings.values()].filter(b => !b.con && BUILDINGS[b.type].size === 1 && b.type !== 'townhall');
    const b = cands.length && rng.pick(cands);
    const s = b && spots(b.type, { x: b.x, z: b.z }, 8)[0];
    if (s && w.moveBuilding(b.id, s.x, s.z).ok) counts.moves++;
  }
  if (rng.chance(MODE !== 'economy' ? 0.3 : 0.04)) {
    const cands = [...w.buildings.values()].filter(b => !b.con && b.type !== 'townhall' && b.type !== 'builder');
    const b = cands.length && rng.pick(cands);
    if (b && w.demolishBuilding(b.id).ok) counts.demolish++;
  }
}

// ------------------------------------------------------------ invariants
function audit(day) {
  // plots never overlap (land deals and street fronts included) and the tile map agrees
  const DIR = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const rects = [];
  for (const b of w.buildings.values()) {
    for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) if (w.buildingAt[w.idx(b.x + dx, b.z + dz)] !== b.id) problem(day, `tile map disagrees with ${b.type} #${b.id}`);
    const e = { x0: 0, x1: 0, z0: 0, z1: 0, ...(b.ext || {}) };
    const [dx, dz] = DIR[b.rot], f = b.front || 0;
    if (dx > 0) e.x1 += f; if (dx < 0) e.x0 += f; if (dz > 0) e.z1 += f; if (dz < 0) e.z0 += f;
    rects.push([b.x - e.x0, b.z - e.z0, b.x + fw(b) + e.x1, b.z + fd(b) + e.z1, b]);
    for (let dz2 = 0; dz2 < fd(b); dz2++) for (let dx2 = 0; dx2 < fw(b); dx2++) if (w.roadAt(b.x + dx2, b.z + dz2) || w.railAt(b.x + dx2, b.z + dz2)) problem(day, `${b.type} #${b.id} sits on a road or track`);
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], c = rects[j];
    if (a[0] < c[2] - 1e-6 && c[0] < a[2] - 1e-6 && a[1] < c[3] - 1e-6 && c[1] < a[3] - 1e-6) problem(day, `plots overlap: ${a[4].type} #${a[4].id} and ${c[4].type} #${c[4].id}`);
  }
  for (const i in w.buildingAt) if (w.buildingAt[i] >= 0 && !w.buildings.has(w.buildingAt[i])) { problem(day, `tile ${i} points at a missing building`); break; }
  // people point at real places and fit in them
  for (const r of w.residents.values()) {
    if (r.home != null && !w.buildings.has(r.home)) problem(day, `${r.first} ${r.last} lives in a missing building`);
    if (r.job != null && !w.buildings.has(r.job)) problem(day, `${r.first} ${r.last} works at a missing building`);
    if (r.job != null && r.school != null) problem(day, `${r.first} ${r.last} both works and studies`);
    if (!Number.isFinite(r.years) || !Number.isFinite(r.wealth ?? 0)) problem(day, `${r.first} has a broken age or savings`);
  }
  for (const b of w.buildings.values()) {
    if (!isOpen(b)) continue;
    const L = BUILDINGS[b.type].levels[b.level];
    if (L.housing && b.residents.length > capOf(b, 'housing') + 6) problem(day, `${L.name} #${b.id} overcrowded: ${b.residents.length}/${capOf(b, 'housing')}`);
    if (b.workers.length > capOf(b, 'jobs')) problem(day, `${L.name} #${b.id} has too many workers`);
    if (L.seats && (b.pupils || []).length > capOf(b, 'seats')) problem(day, `${L.name} #${b.id} has too many pupils`);
  }
  // sites keep moving
  // the oldest open site must keep moving while there are builders
  const C = game.construction;
  const open = [...w.buildings.values()].filter(b => b.con && !b.con.wait && b.access && b.connected).sort((a, b) => a._queued - b._queued);
  const head = open[0];
  if (head) {
    const key = `${head.id}:${head.con.kind}:${Math.floor((head.con.done / head.con.work) * 20)}`;
    if (audit.head !== key) { audit.head = key; audit.headSince = day; }
    else if (day - audit.headSince > 3 && C.hasBuilders) problem(day, `the oldest site (${head.type} #${head.id}, ${head.con.kind}) has not moved for ${day - audit.headSince} days`);
  }
  if (Number.isNaN(w.money)) problem(day, 'money is not a number');
  for (const wk of game.agents.walkers) if (!Number.isFinite(wk.x) || !Number.isFinite(wk.z)) { problem(day, 'a walker has no position'); break; }
  for (const a of game.animals.list) if (!Number.isFinite(a.x)) { problem(day, 'an animal has no position'); break; }
}

// ------------------------------------------------------------ run
const t0 = Date.now();
let day = w.day, botDone = -1, worstDayMs = 0;
console.log('day  pop  homes  jobs     money   happy  sites  issues  walkers  ms/day');
let dayStart = Date.now();
const startDay = w.day;
let steps = 0, idleCheck = -1, idleDays = 0, crowdCheck = -1, peakVisit = 0;
while (w.day < startDay + DAYS && steps < 400000) {
  const g = game.sim.update(0.1);
  game.agents.update(0.1, g);
  game.construction.update(0.1, g);
  game.transit.update(0.1);
  game.animals.update(0.1, game.speed);
  steps++;
  if (w.hours >= 9 && botDone !== w.day) { botDone = w.day; botDay(); }
  // parks and squares never hold more villagers than they have room for
  if (w.hours >= 15 && crowdCheck !== w.day) {
    crowdCheck = w.day;
    const at = new Map();
    for (const wk of game.agents.walkers) if (wk.r && wk.mode === 'wander' && !wk.working) at.set(wk.r.at, (at.get(wk.r.at) || 0) + 1);
    for (const [id, n] of at) {
      const b = w.buildings.get(id);
      if (!b || visitorCap(b) === Infinity) continue;
      peakVisit = Math.max(peakVisit, n / visitorCap(b));
      if (n > visitorCap(b)) problem(w.day, `${n} villagers crowd ${b.type} #${b.id} (room for ${visitorCap(b)})`);
    }
  }
  if (w.hours >= 12.5 && idleCheck !== w.day) {
    idleCheck = w.day;
    const C = game.construction;
    const idle = [...w.residents.values()].filter(r => r.site == null && r.loc === 'in' && r.at === r.job && BUILDINGS[w.buildings.get(r.job)?.type]?.builders && r.age === 'adult');
    const waiting = [...w.buildings.values()].filter(b => b.con && !b.con.wait && b.access && b.connected && !(b._unreach > w.day * 24 + w.hours) && ((C.crew.get(b.id) || {}).assigned || 0) < 2);
    idleDays = idle.length && waiting.length ? idleDays + 1 : 0;
    if (idleDays >= 3) problem(w.day, `${idle.length} builders idle at the yard while ${waiting.length} sites wait`);
  }
  if (w.day !== day) {
    const ms = Date.now() - dayStart; dayStart = Date.now();
    worstDayMs = Math.max(worstDayMs, ms);
    day = w.day;
    audit(day);
    if (process.env.DEBUG_SITES) {
      const C = game.construction;
      const sites = [...w.buildings.values()].filter(b => b.con).sort((a, b) => a.id - b.id).slice(0, 4);
      const builders = [...w.residents.values()].filter(r => r.job != null && BUILDINGS[w.buildings.get(r.job)?.type]?.builders);
      console.log('  sites', sites.map(s => `${s.type}#${s.id}:${s.con.kind}${s.con.wait ? '/' + s.con.wait : ''} ${(s.con.done / s.con.work * 100).toFixed(0)}% acc=${!!s.access} conn=${s.connected} unreach=${s._unreach ? (s._unreach - (w.day * 24 + w.hours)).toFixed(1) : '-'}`).join(' | '));
      console.log('  builders', builders.length, builders.map(r => r.loc + (r.site != null ? '@' + r.site : '')).join(' '), 'yards', [...w.buildings.values()].filter(b => b.type === 'builder').map(b => b.workers.length + '/' + capOf(b, 'jobs')).join(','));
    }
    const s = game.sim;
    const sites = [...w.buildings.values()].filter(b => b.con).length;
    if ((day - startDay) % 5 === 0 || day - startDay <= 2) {
      console.log(`${String(day).padStart(3)}  ${String(w.population).padStart(4)}  ${String(s.housing.cap).padStart(5)}  ${(s.jobs.filled + '/' + s.jobs.total).padStart(7)}  ${String(Math.round(w.money)).padStart(7)}   ${String(Math.round(s.happiness)).padStart(4)}%  ${String(sites).padStart(5)}  ${String(computeIssues(game).length).padStart(6)}  ${String(game.agents.walkers.size).padStart(7)}  ${String(ms).padStart(6)}`);
    }
  }
}
// a save from the middle of all this must load back the same
const json = JSON.stringify(serialize(w));
const w2 = deserialize(JSON.parse(json));
if (w2.buildings.size !== w.buildings.size || w2.residents.size !== w.residents.size) problems.push('save round-trip lost buildings or people');

const types = {};
for (const b of w.buildings.values()) types[b.type] = (types[b.type] || 0) + 1;
console.log(`\n${DAYS} days in ${((Date.now() - t0) / 1000).toFixed(1)} s (worst day ${worstDayMs} ms) · map ${N}×${N} · ${w.buildings.size} buildings · save ${(json.length / 1024).toFixed(0)} KB`);
console.log('activity:', JSON.stringify(counts));
console.log(`busiest park at 3pm: ${Math.round(peakVisit * 100)}% full`);
console.log('research done:', w.research.done.length, '/', Object.keys(TECHS).length, '· education:', [0, 1, 2, 3, 4, 5].map(e => [...w.residents.values()].filter(r => r.age !== 'child' && r.edu === e).length).join('/'));
console.log('buildings:', Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('issues now:', computeIssues(game).map(i => i.text).join(' | ') || 'none');
console.log(problems.length ? `\n${problems.length} problem(s):\n  ` + problems.join('\n  ') : '\nno problems found');
process.exit(problems.length ? 1 : 0);
