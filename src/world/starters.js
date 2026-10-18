// Starter towns: small villages a few weeks along, to begin a game from
// instead of an empty valley.
//
// Each one is grown the same way every time from a fixed map seed and a short
// build script. Every step goes through the normal World rules: it is paid
// for, waits for the population and research it needs, and is placed with
// instant construction. Between steps the real Sim runs a day at a time, so
// families move in, take jobs and school places, age, have children, pay
// taxes and do research just as they would in play. The finished town is
// saved and loaded back (serialize → deserialize), so a game starts from
// exactly what a save of it would load.

import { World } from './world.js';
import { generateTerrain } from './terrain.js';
import { Sim } from '../sim/sim.js';
import { PathFinder } from '../sim/path.js';
import { Transit } from '../sim/transit.js';
import { BUILDINGS, TECHS } from '../defs.js';
import { RNG, hash2 } from '../util/rng.js';
import { serialize, deserialize } from '../save/saves.js';
import { growCity } from './city.js';

// Places in a starter's build script are given in the town's own frame:
// [a, b] is a steps along the main road (towards the way out of the valley)
// and b steps across it, from the founding crossroads.
//
// known: research the founders bring with them (what a town a few weeks along
// has behind it). Its points are banked on the first day, so each project is
// done as soon as it can be begun, in order. research: what the town then
// works on with its own points as it grows.
//
// Script steps (each waits, retried day after day, until it can be done;
// tech: an extra research project to wait for, e.g. for a style):
//   { day, street: [a, b], go: 'out' | 'in' | 'left' | 'right', len, level }
//   { day, build: type, n, near, look }   near: [a, b], a list of them (one
//       for each building), 'water' (the bank), 'trees' (the woods), or
//       'need:<service>' (among the homes out of reach of that service)
//   { day, upgrade: type, n, to, look }   to: a branch type (flats, …)
//   { day, cobble: radius }                 cobble the streets near the centre
//   { day, line: 'coach', vehicles }        a coach line through every stop
export const STARTERS = [
  {
    // summer · out = south, right = east (towards the river)
    id: 'hamlet', name: 'Riverside hamlet', town: 'Willowford', N: 48, seed: 23770, days: 9,
    desc: 'A handful of cottages down by the river, with a woodcutter and a fishing hut.',
    known: ['carpentry'],
    research: ['pigments', 'homes2'],
    plan: [
      { day: 1, street: [0, 4], go: 'right', len: 5 },
      { day: 1, build: 'house', n: 2, near: [[1, 2], [-1, -2]] },
      { day: 2, build: 'lumber', near: 'trees' },
      { day: 3, build: 'fishery', near: 'water' },
      { day: 4, build: 'house', n: 3, near: [[1, 6], [-1, 6], [1, 4]] },
      { day: 5, build: 'farm', near: [6, -3] },
      { day: 6, build: 'well', near: 'need:water' },
      { day: 6, build: 'flowers', near: [-1, 1] },
      { day: 7, build: 'garden', near: [1, 7] },
      { day: 7, build: 'house', n: 2, near: [[-1, 4], [-1, 8]] },
      { day: 9, build: 'house', near: [1, 8] },
    ],
  },
  {
    // autumn · out = east along the high street, right = south
    id: 'market', name: 'Market village', town: 'Marbury', N: 64, seed: 142555, days: 18,
    desc: 'A busy high street with a bakery, a tavern and a school, cobbled in the middle.',
    known: ['commerce', 'homes2', 'hospitality', 'pigments'],
    research: ['trade2', 'industry2'],
    plan: [
      { day: 1, street: [0, -4], go: 'left', len: 3 },
      { day: 1, street: [0, 4], go: 'right', len: 3 },
      { day: 1, street: [4, -1], go: 'left', len: 5 },
      { day: 1, street: [4, 1], go: 'right', len: 5 },
      { day: 1, street: [-3, 0], go: 'in', len: 4 },
      { day: 1, build: 'house', n: 4, near: [[2, 1], [2, -1], [-1, 2], [-1, -2]] },
      { day: 2, build: 'farm', near: [12, 4] },
      { day: 2, build: 'school', near: [-2, 4] },
      { day: 3, build: 'house', n: 3, near: [[5, -3], [5, 3], [3, -3]] },
      { day: 4, build: 'lumber', near: 'trees' },
      { day: 5, build: 'bakery', near: [2, 1] },
      { day: 5, build: 'well', near: 'need:water' },
      { day: 6, build: 'house', n: 4, near: [[-4, 1], [-4, -1], [1, -5], [-1, 5]] },
      { day: 7, build: 'clinic', near: 'need:health' },
      { day: 8, street: [8, -1], go: 'left', len: 4 },
      { day: 8, street: [8, 1], go: 'right', len: 4 },
      { day: 9, build: 'workshop', near: [11, -2] },
      { day: 10, build: 'house', n: 3, near: [[7, -2], [7, 2], [3, 3]] },
      { day: 11, build: 'watch', near: 'need:safety' },
      { day: 11, build: 'well', near: 'need:water' },
      { day: 12, build: 'tavern', near: [1, -1] },
      { day: 12, build: 'farm', near: [-8, 5] },
      { day: 13, build: 'house', n: 3, near: [[-1, 5], [9, 3], [5, 5]] },
      { day: 14, cobble: 6 },
      { day: 15, upgrade: 'house', n: 4, look: 'plaster', tech: 'pigments' },
      { day: 15, build: 'well', near: 'need:water' },
      { day: 16, build: 'garden', near: [-2, -1] },
      { day: 16, build: 'flowers', n: 2, near: [[3, 2], [3, -2]] },
      { day: 16, build: 'house', n: 2, near: [[9, -3], [-3, -5]] },
      { day: 18, build: 'house', n: 2, near: [[11, 2], [-5, 3]] },
    ],
  },
  {
    // spring of the second year · out = north, right = west, in = south towards the river
    id: 'mill', name: 'Mill town', town: 'Millbrook', N: 48, seed: 174231, days: 26,
    desc: 'A farm, a workshop and a chapel, with a water wheel on the river for power.',
    known: ['hydraulics', 'electricity', 'industry2', 'carpentry'],
    research: ['masonry', 'horticulture'],
    plan: [
      { day: 1, street: [-3, 0], go: 'in', len: 6 },
      { day: 1, street: [0, -4], go: 'left', len: 4 },
      { day: 1, build: 'house', n: 3, near: [[1, 1], [-1, -2], [1, -2]] },
      { day: 2, build: 'farm', near: [-5, 4] },
      { day: 3, build: 'lumber', near: 'trees' },
      { day: 3, build: 'school', near: [1, 2] },
      { day: 4, build: 'workshop', near: [-6, -1] },
      { day: 5, build: 'house', n: 3, near: [[-2, -2], [-4, -1], [1, -6]] },
      { day: 7, build: 'chapel', near: [-1, 3] },
      { day: 8, build: 'farm', near: [-3, 6] },
      { day: 9, build: 'house', n: 2, near: [[-1, -6], [-4, 1]] },
      { day: 10, cobble: 3 },
      { day: 11, build: 'clinic', near: 'need:health' },
      { day: 12, build: 'house', n: 2, near: [[1, 4], [-2, 2]] },
      { day: 14, build: 'watermill', near: 'water' },
      { day: 16, build: 'well', near: 'need:water' },
      { day: 18, build: 'watch', near: 'need:safety' },
      { day: 19, build: 'garden', near: [-1, -3] },
      { day: 20, upgrade: 'farm', n: 2 },
      { day: 22, upgrade: 'builder', look: 'timber', tech: 'carpentry' },
      { day: 23, build: 'house', n: 2, near: [[2, -7], [1, 6]] },
      { day: 24, build: 'watch', near: 'need:safety' },
      { day: 24, build: 'well', near: 'need:water' },
      { day: 25, build: 'flowers', n: 2, near: [[1, -1], [-1, 1]] },
      { day: 26, build: 'house', n: 2, near: [[-2, -7], [3, 3]] },
    ],
  },
  {
    // autumn · out = north, right = west, left = east, in = south
    id: 'crossroads', name: 'Crossroads village', town: 'Coldharbour', N: 64, seed: 213826, days: 16,
    desc: 'Where two roads meet: a coaching tavern, a smithy, and a coach line to every corner.',
    known: ['commerce', 'hospitality', 'carpentry'],
    research: ['masonry', 'brickmaking'],
    plan: [
      { day: 1, street: [0, -4], go: 'left', len: 7 },
      { day: 1, street: [0, 4], go: 'right', len: 7 },
      { day: 1, street: [-3, 0], go: 'in', len: 6 },
      { day: 1, build: 'house', n: 3, near: [[1, 2], [-1, -2], [1, -2]] },
      { day: 2, build: 'workshop', near: [-6, 2] },
      { day: 2, build: 'school', near: [2, -2] },
      { day: 3, build: 'house', n: 2, near: [[1, 6], [-1, -6]] },
      { day: 4, build: 'coachstop', n: 4, near: [[9, 1], [-1, 10], [-1, -10], [-8, 1]] },
      { day: 4, line: 'coach', vehicles: 2 },
      { day: 5, build: 'well', near: 'need:water' },
      { day: 6, build: 'house', n: 3, near: [[-6, -1], [1, 9], [-1, 7]] },
      { day: 7, build: 'farm', near: [-8, 4] },
      { day: 8, build: 'lumber', near: 'trees' },
      { day: 8, build: 'clinic', near: 'need:health' },
      { day: 9, build: 'house', n: 3, near: [[5, 1], [-1, -9], [3, -1]] },
      { day: 10, build: 'well', near: [2, 2] },
      { day: 11, build: 'tavern', near: [1, -1] },
      { day: 11, build: 'house', n: 2, near: [[2, 5], [-2, -5]] },
      { day: 12, build: 'watch', near: 'need:safety' },
      { day: 13, build: 'chapel', near: 'need:culture' },
      { day: 13, build: 'flowers', n: 2, near: [[1, 1], [-1, 1]] },
      { day: 14, upgrade: 'builder', look: 'timber', tech: 'carpentry' },
    ],
  },
  {
    // spring of the eleventh year · laid out whole by src/world/city.js, not
    // grown from a script: radius is how far out the streets go
    id: 'city', name: 'Cathedral city', town: 'Kingsbridge', N: 80, seed: 315838, radius: 20, city: true, day: 241, settle: 4, money: 60000,
    desc: 'A whole city decades along: a domed civic palace, a cathedral, high streets of every trade, works and a wind farm, and some 3,000 people at work.',
  },
];

const FRAME = { out: [1, 0], in: [-1, 0], right: [0, 1], left: [0, -1] };

export function starterById(id) { return STARTERS.find(s => s.id === id) || null; }

// ------------------------------------------------------------ growing

// A stand-in for the game object the Sim reports to. Nobody walks about
// while a starter town grows, so arrivals simply move in and leavers go.
export function headlessGame(w) {
  const game = {
    world: w, speed: 1, _ev: {},
    on(e, f) { (this._ev[e] ||= []).push(f); },
    emit(e, d) { for (const f of this._ev[e] || []) f(d); },
    renderer: { scene: { add() {}, remove() {} } },
  };
  game.agents = {
    arrive() {}, relocate() {}, refreshLook() {}, remove() {},
    depart(ids) {
      for (const id of ids) if (w.residents.delete(id)) w.stats.departures++;
      game.sim.dirty = true;
    },
  };
  game.paths = new PathFinder(w);
  game.sim = new Sim(game);
  game.transit = new Transit(game);
  return game;
}

// Grow a starter town. Returns the live World (with the Sim's listeners on
// it), its Sim, and a log of any script steps that could not be done.
// onDay(world, sim) is called at the end of every day (for tests).
export function growStarter(def, { onDay } = {}) {
  if (def.city) return growCity(def, { onDay });
  const { N, seed } = def;
  const w = World.createNew({ N, seed, name: def.town });
  w.townId = ('starter' + def.id).replace(/[^a-z0-9]/g, '').slice(0, 24);   // grown the same every time (a game started from it gets its own)
  // The founders' research: a town a few weeks along has already worked
  // through its known list, so those points are banked from the start and
  // each project completes as soon as it can begin (in order, prerequisites
  // first). The town's own research then carries on through its research list.
  const known = def.known || [];
  w.research.bank += known.reduce((n, id) => n + (TECHS[id] ? TECHS[id].cost : 0), 0);
  const rng = new RNG(seed ^ 0x2f6b1d3);
  // the founding buildings were given random looks: make them fixed
  for (const b of w.buildings.values()) b.variant = (rng.next() * 1e9) | 0;
  const { start, entryPath } = generateTerrain(N, seed);
  const first = entryPath[1] || [start.x + 1, start.z];
  const dir = [Math.sign(first[0] - start.x), Math.sign(first[1] - start.z)];
  const perp = [dir[1], dir[0]];
  const at = ([a, b]) => ({ x: start.x + dir[0] * a + perp[0] * b, z: start.z + dir[1] * a + perp[1] * b });
  const step = (go) => { const [a, b] = FRAME[go]; return [dir[0] * a + perp[0] * b, dir[1] * a + perp[1] * b]; };

  const game = headlessGame(w);
  const sim = game.sim;
  sim.rng = new RNG(seed ^ 0x5eed);
  sim.seedFounders();

  let centre = { x: start.x, z: start.z };
  for (const b of w.buildings.values()) if (b.type === 'townhall') centre = { x: b.x + 1, z: b.z + 1 };

  // ---- where to put things
  const treesNear = (x, z, r) => {
    let n = 0;
    for (let tz = z - r; tz <= z + r; tz++) for (let tx = x - r; tx <= x + r; tx++) if (w.inBounds(tx, tz)) n += w.treeCount[w.idx(tx, tz)];
    return n;
  };
  // homes out of reach of a service (as the Sim last worked it out)
  const lacking = (service) => [...w.buildings.values()].filter(b => b.factors && BUILDINGS[b.type].levels[b.level].housing && !b.factors[service]);
  const anchorOf = (near, k) => {
    if (Array.isArray(near) && Array.isArray(near[0])) return at(near[k % near.length]);
    if (Array.isArray(near)) return at(near);
    if (typeof near === 'string' && near.startsWith('need:')) {
      // the middle of the homes that go without
      const homes = lacking(near.slice(5));
      return { x: Math.round(homes.reduce((a, b) => a + b.x, 0) / homes.length), z: Math.round(homes.reduce((a, b) => a + b.z, 0) / homes.length) };
    }
    return centre;
  };
  const findSpot = (type, near, k) => {
    const A = anchorOf(near, k);
    const def = BUILDINGS[type];
    const R = 16;
    const cands = [];
    for (let z = A.z - R; z <= A.z + R; z++) for (let x = A.x - R; x <= A.x + R; x++) {
      if (!w.inBounds(x, z)) continue;
      let s = Math.hypot(x - A.x, z - A.z) + hash2(x, z, seed) * 1.5;
      if (near === 'water') s = Math.hypot(x - centre.x, z - centre.z) + hash2(x, z, seed);
      if (near === 'trees') s = Math.hypot(x - centre.x, z - centre.z) - Math.min(24, treesNear(x, z, 3)) * 0.4;
      if (def.levels[0].housing) s += sim.pollution[w.idx(x, z)] * 0.4;
      cands.push([s, x, z]);
    }
    cands.sort((p, q) => p[0] - q[0]);
    let reason = 'No room';
    for (const [, x, z] of cands) {
      const c = w.checkBuild(type, x, z);
      if (!c.ok) {
        // these don't depend on the spot
        if (/Unlocks|Research|money|Only one/.test(c.reason)) return { reason: c.reason };
        continue;
      }
      if (!c.access.some(a => a.conn)) continue;
      return { x, z };
    }
    return { reason };
  };

  // ---- the script
  const instantly = (fn) => {
    const was = w.sandbox.instantBuild;
    w.sandbox.instantBuild = true;
    try { return fn(); } finally { w.sandbox.instantBuild = was; }
  };
  const actions = {
    street(s) {
      const p = at(s.street), [dx, dz] = step(s.go), level = s.level || 1;
      const tiles = [];
      for (let k = 0; k < s.len; k++) {
        const x = p.x + dx * k, z = p.z + dz * k;
        const c = w.checkRoad(x, z, level);
        if (!c.ok || (c.water && !s.bridge)) break;
        tiles.push([x, z]);
      }
      if (!tiles.length) return 'blocked';
      const cost = tiles.reduce((n, [x, z]) => n + (w.checkRoad(x, z, level).cost || 0), 0);
      if (w.money < cost) return 'Not enough money';
      w.placeRoads(tiles, level);
      return true;
    },
    build(s, st) {
      const n = s.n || 1;
      while (st.count < n) {
        // a service where homes go without it: done once none do
        if (typeof s.near === 'string' && s.near.startsWith('need:') && !lacking(s.near.slice(5)).length) return true;
        const spot = findSpot(s.build, s.near, st.count);
        if (spot.reason) return spot.reason;
        const r = w.placeBuilding(s.build, spot.x, spot.z, { instant: true, variant: (rng.next() * 1e9) | 0, look: s.look || null });
        if (!r.ok) return r.reason;
        st.count++;
        sim.recompute();
      }
      return true;
    },
    upgrade(s, st) {
      const n = s.n || 1;
      const list = [...w.buildings.values()].filter(b => b.type === s.upgrade && !b.con)
        .sort((p, q) => Math.hypot(p.x - centre.x, p.z - centre.z) - Math.hypot(q.x - centre.x, q.z - centre.z));
      let last = 'Nothing to upgrade';
      for (const b of list) {
        if (st.count >= n) break;
        const chk = w.upgradeCheck(b, s.to || null);
        if (!chk.ok) { last = (chk.reqs || []).filter(r => !r.met).map(r => r.label).join(', ') || chk.reason; continue; }
        const r = instantly(() => w.upgradeBuilding(b.id, s.to || null, s.look));
        if (r.ok) { st.count++; sim.recompute(); }
      }
      return st.count >= n ? true : last;
    },
    cobble(s) {
      const tiles = [];
      for (let z = centre.z - s.cobble; z <= centre.z + s.cobble; z++) for (let x = centre.x - s.cobble; x <= centre.x + s.cobble; x++) {
        if (w.roadAt(x, z) === 1 && !w.terrain.isWater(x, z) && Math.hypot(x - centre.x, z - centre.z) <= s.cobble) tiles.push([x, z]);
      }
      const blocked = tiles.map(([x, z]) => w.checkRoad(x, z, 2)).find(c => !c.ok);
      if (blocked) return blocked.reason;
      const cost = tiles.reduce((n, [x, z]) => n + (w.checkRoad(x, z, 2).cost || 0), 0);
      if (w.money < cost) return 'Not enough money';
      w.placeRoads(tiles, 2);
      return true;
    },
    line(s) {
      const stops = [...w.buildings.values()].filter(b => b.type === 'coachstop')
        .sort((p, q) => Math.atan2(p.z - centre.z, p.x - centre.x) - Math.atan2(q.z - centre.z, q.x - centre.x));
      const r = game.transit.createLine(s.line, stops.map(b => b.id));
      if (!r.ok) return r.reason;
      for (let v = 1; v < (s.vehicles || 1); v++) game.transit.setVehicles(r.line.id, v + 1);
      return true;
    },
  };
  const kindOf = (s) => Object.keys(actions).find(k => k in s);
  const pending = def.plan.map(s => ({ s, kind: kindOf(s), count: 0, why: null }));
  const runScript = () => {
    for (const st of pending) {
      if (st.done || st.s.day > w.day) continue;
      if (st.s.tech && !w.hasTech(st.s.tech)) { st.why = `waiting for ${st.s.tech}`; continue; }
      const r = actions[st.kind](st.s, st);
      if (r === true) st.done = true; else st.why = r;
    }
  };
  const queue = [...known, ...(def.research || [])];
  const nextResearch = () => {
    for (;;) {
      if (w.research.current) return;
      while (queue.length && w.research.done.includes(queue[0])) queue.shift();
      if (!queue.length || !w.canResearch(queue[0])) return;
      w.startResearch(queue.shift());
    }
  };

  // Villagers spend money in shops and taverns as they go about their day;
  // without walkers this is an estimate of that (about two visits a day for
  // every three grown-ups).
  const visits = () => {
    const places = [...w.buildings.values()].map(b => BUILDINGS[b.type].levels[b.level].visit || 0).filter(v => v > 0);
    if (!places.length) return 0;
    let grown = 0;
    for (const r of w.residents.values()) if (r.age !== 'child') grown++;
    const n = Math.round(grown * 0.7), avg = places.reduce((a, b) => a + b, 0) / places.length;
    const v = Math.round(n * avg);
    w.stats.visits += n; w.stats.visitIncome += v; w.stats.todayVisitIncome += v;
    return v;
  };

  const arrivalsToday = () => {
    for (const a of sim.arrivals.filter(a => a.day === w.day)) sim._arrive(a);
    sim.arrivals = sim.arrivals.filter(a => a.day !== w.day);
  };
  const log = [];
  while (true) {
    w.hours = 8;
    arrivalsToday();
    sim.recompute();
    nextResearch();
    runScript();
    sim.recompute();
    if (onDay) onDay(w, sim);
    if (w.day >= def.days) break;
    w.money += sim.budget.net + visits();
    w.day++;
    sim.daily();
  }
  w.hours = 8.5;
  for (const st of pending) if (!st.done) log.push(`${st.kind} ${JSON.stringify(st.s)}: ${st.why || 'not reached'}`);
  for (const id of known) if (!w.research.done.includes(id)) log.push(`known research ${id}: never begun (${TECHS[id] ? `needs ${TECHS[id].needs.join(', ')}` : 'no such project'})`);
  return { world: w, sim, log };
}

// ------------------------------------------------------------ cached saves

const cache = new Map();

// The starter town as save data (grown once, then kept).
export function starterSave(id) {
  if (cache.has(id)) return cache.get(id);
  const def = starterById(id);
  if (!def) throw new Error(`No starter town called ${id}`);
  const { world } = growStarter(def);
  const data = serialize(world);
  cache.set(id, data);
  return data;
}

// A fresh World for a new game started from a starter town.
export function loadStarter(id, { name, sandbox } = {}) {
  const data = structuredClone(starterSave(id));
  if (name) data.name = name;
  data.savedAt = new Date().toISOString();
  const w = deserialize(data);
  if (sandbox) w.setSandbox(sandbox);
  return w;
}

// What a card shows about a starter town.
export function starterSummary(id) {
  const d = starterSave(id), def = starterById(id);
  return { id, name: def.name, desc: def.desc, N: d.N, pop: d.meta.pop, money: d.meta.money, day: d.meta.day, title: d.meta.title, buildings: d.buildings.length };
}
