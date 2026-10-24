// World state and the rules for changing it (placing, upgrading, bulldozing).
// Rendering and simulation listen to the events emitted here.

import { CONFIG, ROAD_LEVELS, BRIDGE_MULT, TREE_COST, CLEAR_COST, TERRAFORM_COST, roadRefund, dressRefund, dressRefundAll, streetPart, lookPart, packDress, DRESSINGS } from '../config.js';
import { BUILDINGS, unlockOf, RAIL_COST, workNeeded, TECHS, STYLE_TECH, MERGES, LARGE, ESTATE, GRAND, KINDS, REKIND, kindOf, techForLevel, growsInto, plotName, isSmallPark, BURY_COST, FARM_JOIN, PRODUCE, produceOf, hasFields, choosesProduce, CORNER_SHOPS, CIVIC_QUARTER, seatWorth, SEAT_RESTYLE } from '../defs.js';
const STYLE_TECH_OF = (look) => STYLE_TECH[look] || null;
import { generateTerrain } from './terrain.js';
import { findBoulevards, dressFits } from './boulevard.js';
import { SIDES, CORNERS, CUT, spillsOf, diagLinked, roadTile, cornerFrame } from './roadShape.js';
import { tidyDiag, linkStroke, isStroke, cornerTo, diagCapable, facingCorner, sideTo } from './diagonal.js';
import { cleanPose } from './pose.js';
import { newTownId } from '../util/text.js';
import { RNG, hash2, makeNoise2D, fbm } from '../util/rng.js';

// rot index → direction the building faces (its door side)
export const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
// the world.blvd bit for the side of a tile towards (dx, dz) (N 1, E 2, S 4, W 8)
export const sideBit = (dx, dz) => (dz < 0 ? 1 : dx > 0 ? 2 : dz > 0 ? 4 : 8);

// Footprint in tiles along world x / z (merged buildings can be 2×1).
export const fw = (b) => b.w ?? b.size;
export const fd = (b) => b.d ?? b.size;

// A farm's own field: the back row of its plot, behind the farmyard (an
// orchard's trees fill its whole plot, so it has none). Farmland is this
// and the farm's fields beyond the plot.
export function homeField(b) {
  const def = BUILDINGS[b.type];
  if (!def || !def.fields || def.fruit) return [];
  const [fx, fz] = DIRS[b.rot] || DIRS[0], cx = b.x + fw(b) / 2, cz = b.z + fd(b) / 2, out = [];
  for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) {
    if ((b.x + dx + 0.5 - cx) * fx + (b.z + dz + 0.5 - cz) * fz < 0) out.push([b.x + dx, b.z + dz]);
  }
  return out;
}
// A farm's farmland, as tile indices: its fields, and its own field behind
// the yard once the farm stands (not while it is going up or coming down).
export function farmlandOf(w, farm) {
  const land = new Set((w.fieldTiles && w.fieldTiles.get(farm.id)) || []);
  if (!farm.con || farm.con.kind === 'upgrade') for (const [x, z] of homeField(farm)) land.add(z * w.N + x);
  return land;
}
// how far tile (x, z) lies in front of building b's front edge (> 0: in front)
export function aheadOf(b, x, z) {
  const [fx, fz] = DIRS[b.rot] || DIRS[0], cx = b.x + fw(b) / 2, cz = b.z + fd(b) / 2;
  return (x + 0.5 - cx) * fx + (z + 0.5 - cz) * fz - (fx ? fw(b) : fd(b)) / 2;
}

// A building does its job unless it is a fresh building site or being taken
// down. Upgrades and merges carry on behind the scaffolding.
//   b.con = { kind: 'build' | 'upgrade' | 'merge' | 'dismantle', work, done, ... }
export const isOpen = (b) => !b.con || b.con.kind === 'upgrade' || b.con.kind === 'merge';

// A building that has grown onto a neighbouring plot (see World.expandOptions)
// holds half as many people / jobs again.
// restyling a building as it is upgraded costs this much of the upgrade on top
const RESTYLE = 0.3;
// tiles a type's own footprint covers: 1, 2 (joined, 2×1) or 4 (2×2)
const baseAreaOf = (type) => (BUILDINGS[type].merged ? 2 : BUILDINGS[type].size ** 2);
const baseArea = (b) => baseAreaOf(b.type);
export const isExpanded = (b) => fw(b) * fd(b) > baseArea(b);
// How high a building's floor sits on a plot whose ground runs from minH to
// maxH. On a slope it stands on the highest ground under its walls (a little
// in from the plot's edges, where they stand), so no wall is buried in the
// hillside, and never below the ground at its front door (so the door stays
// at street level). Where the hill falls away, what is left showing is drawn
// as a stone lower floor (see footing in render/buildings.js). Buildings that
// must meet track or water exactly, and parks, keep to the top.
const WALL_IN = 0.05;
export function floorHeight(terrain, type, x, z, w, d, rot, minH, maxH) {
  const def = BUILDINGS[type];
  if (!def || def.needsRail || def.needsWater || def.park || !(maxH > minH)) return maxH;
  const [dx, dz] = DIRS[rot] || [0, 1];
  const front = terrain.heightAt(x + w / 2 + (dx * w) / 2, z + d / 2 + (dz * d) / 2);
  let walls = -Infinity;
  const us = [WALL_IN, w / 2, w - WALL_IN], vs = [WALL_IN, d / 2, d - WALL_IN];
  for (let i = 1; i < w; i++) us.push(i);
  for (let i = 1; i < d; i++) vs.push(i);
  for (const u of us) for (const v of vs) walls = Math.max(walls, terrain.heightAt(x + u, z + v));
  return Math.min(maxH, Math.max(minH, front - 0.02, walls - 0.005));
}
// each extra plot's worth of ground adds half as much again
export function capOf(b, key) {
  const v = BUILDINGS[b.type].levels[b.level][key] || 0;
  const k = sizeK(b);
  const out = k > 1 ? Math.round(v * k) : v;
  // a farm's fields beyond its plot need hands too, as many as what it grows takes
  if (key === 'jobs' && v && hasFields(b.type)) return Math.round((out + (b.fields || 0) * CONFIG.FIELD_JOBS) * produceOf(b).jobs);
  return out;
}
// The most households a home takes (its level's `households`): a cottage,
// family house or villa is a home for one family, and the bigger houses and
// terraces for a few; flats and shophouses take any number.
export function householdCap(b) {
  const H = BUILDINGS[b.type].levels[b.level].households;
  if (!H) return Infinity;
  const k = sizeK(b);
  return Math.max(1, Math.floor(H * (k > 1 ? k : 1)));
}
// How much bigger than usual a building of this type is on a w × d plot. Its
// capacity, output, upkeep, value and upgrade prices all scale by this.
export function sizeKFor(type, w, d) {
  const def = BUILDINGS[type];
  return Math.max(1, 1 + 0.5 * ((w * d) / (def.merged ? 2 : def.size ** 2) - 1));
}
// A building whose plot has grown but which hasn't been built out across it
// yet (b.spare: the footprint it does cover) is still its old size.
export const sizeK = (b) => (b.spare ? sizeKFor(b.type, b.spare.w, b.spare.d) : sizeKFor(b.type, fw(b), fd(b)));
// b.spare as saved or sent: [w, d, sx, sz] (or { w, d, sx, sz }), only if
// smaller than the plot. sx, sz: which end of the plot the building stands
// at, in its own frame (sx across it, sz from back to front: -1, 0 or 1);
// older saves have neither.
export function spareOf(s, w, d) {
  const [sw, sd, sx, sz] = Array.isArray(s) ? s : s && typeof s === 'object' ? [s.w, s.d, s.sx, s.sz] : [];
  if (!(Number.isInteger(sw) && Number.isInteger(sd) && sw >= 1 && sd >= 1 && sw <= w && sd <= d && sw * sd < w * d)) return undefined;
  const side = (v) => v === -1 || v === 0 || v === 1;
  return side(sx) && side(sz) ? { w: sw, d: sd, sx, sz } : { w: sw, d: sd };
}
// The tiles a building stands on while it covers only part of its grown
// plot (b.spare with its end known), or null.
export function spareRect(b) {
  const s = b.spare;
  if (!s || s.sx == null) return null;
  const W = fw(b), D = fd(b), odd = (b.rot & 1) === 1;
  const Ex = (odd ? D : W) / 2, Ez = (odd ? W : D) / 2, lw = odd ? s.d : s.w, ld = odd ? s.w : s.d;
  const lx = s.sx * (Ex - lw / 2), lz = s.sz * (Ez - ld / 2);
  const th = (b.rot * Math.PI) / 2, co = Math.cos(th), si = Math.sin(th);
  return { x: Math.round(b.x + W / 2 + lx * co + lz * si - s.w / 2), z: Math.round(b.z + D / 2 - lx * si + lz * co - s.d / 2), w: s.w, d: s.d };
}
// A building's floor (b.baseY) and the lowest ground under its plot
// (b.minY). On a grown plot it hasn't been built across yet, the floor is
// the one over the tiles it stands on, so taking land beside or behind it
// neither lifts nor sinks it.
export function setFloor(terrain, b) {
  let minH = Infinity, maxH = -Infinity;
  for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) {
    minH = Math.min(minH, terrain.tileMin(b.x + dx, b.z + dz));
    maxH = Math.max(maxH, terrain.tileMax(b.x + dx, b.z + dz));
  }
  const r = spareRect(b);
  if (!r) { b.baseY = floorHeight(terrain, b.type, b.x, b.z, fw(b), fd(b), b.rot, minH, maxH); b.minY = minH; return; }
  let lo = Infinity, hi = -Infinity;
  for (let dz = 0; dz < r.d; dz++) for (let dx = 0; dx < r.w; dx++) {
    lo = Math.min(lo, terrain.tileMin(r.x + dx, r.z + dz));
    hi = Math.max(hi, terrain.tileMax(r.x + dx, r.z + dz));
  }
  b.baseY = floorHeight(terrain, b.type, r.x, r.z, r.w, r.d, b.rot, lo, hi); b.minY = minH;
}
// A level's figures for a building of that size: capacities, outputs, upkeep, price.
const SCALED = ['housing', 'jobs', 'seats', 'supply', 'kw', 'upkeep', 'cost'];
export function scaledLevel(L, k) {
  if (!(k > 1)) return L;
  const out = { ...L };
  for (const key of SCALED) if (L[key]) out[key] = Math.round(L[key] * k);
  return out;
}

// Neighbouring buildings that can be joined into one mixed-use building.
const MERGE_SHOPS = ['market', 'bakery', 'tavern'];
const MERGE_COST = [150, 300, 500];
// A park joined (or rebuilt on a double plot) from a little park with a
// feature of its own keeps it: b.flavor is the most telling of the two
// (not the recipe's own kind: every lake garden has its pond).
const PARK_FEATURE = ['bandstand', 'statue', 'rosegarden', 'pond', 'physic', 'flowers'];
const PARK_BASE = { park: null, lakepark: 'pond', botanic: 'physic' };
export function parkFeature(to, types) {
  if (!(to in PARK_BASE)) return null;
  return PARK_FEATURE.find(t => t !== PARK_BASE[to] && types.includes(t)) || null;
}
function mergeResult(a, o, has = () => true) {
  const one = (x) => BUILDINGS[x.type].size === 1 && !BUILDINGS[x.type].merged;
  if (!one(a) || !one(o)) return null;
  for (const m of MERGES) {
    let base = null, other = null;
    if (m.a.includes(a.type) && m.b.includes(o.type)) { base = a; other = o; }
    else if (m.a.includes(o.type) && m.b.includes(a.type)) { base = o; other = a; }
    if (!base) continue;
    // keep the house's look when a house is involved (unless the recipe's
    // first building leads: a villa taking in a cottage stays a villa)
    if (!m.lead && other.type === 'house' && base.type !== 'house') [base, other] = [other, base];
    const def = BUILDINGS[m.to];
    // the higher of the two levels, but never one the town can't build yet
    let level = Math.min(Math.max(a.level, o.level), def.levels.length - 1);
    while (level > 0 && !has(m.to, level)) level--;
    const flavor = m.to === 'shophouse' || m.to === 'inn' ? (base.type === 'house' || base.type === 'tavern' ? other.type : base.type) : parkFeature(m.to, [a.type, o.type]);
    const cost = Math.round(120 + def.levels[level].cost * 0.3);
    return { type: m.to, base, flavor, level, cost, name: def.levels[level].name };
  }
  return null;
}

// How far a building may come forward into the street in front of it (in
// tiles). Roads are narrower than their tiles, so this is verge, not roadway;
// two buildings facing each other across a street still stay well apart.
export const FRONT = 0.16;

export const TREE = { PINE: 0, ROUND: 1, BIRCH: 2, BUSH: 3, ROCK: 4, PEBBLE: 5 };

export class World {
  constructor(N, seed, terrain) {
    this.N = N;
    this.seed = seed;
    this.terrain = terrain;
    this.roads = new Uint8Array(N * N);
    this.rails = new Uint8Array(N * N);
    this.buried = new Uint8Array(N * N);   // 1: the power line along this street is underground
    this.dress = new Uint8Array(N * N);    // how the street is dressed, and a boulevard lane's look (see packDress in config.js)
    this.blvd = new Uint8Array(N * N);     // boulevards: the sides of each tile with a median across them (from the roads, never saved; see boulevard.js)
    this.diag = new Uint8Array(N * N);     // diagonal streets: links across tile corners, and roads beside them cut off (see diagonal.js)
    this.diagN = 0;                        // how many diagonal links there are (kept by tidyDiag)
    this.fields = new Int32Array(N * N).fill(-1);   // the farm a tile is a field of (-1: none)
    this.fieldTiles = new Map();           // farm id → its field tiles (kept by _countFields)
    this.lines = [];
    this.sandbox = { infiniteMoney: false, unlockAll: false, freeUpgrades: false, instantBuild: false };
    this.buildingAt = new Int32Array(N * N).fill(-1);
    this.connected = new Uint8Array(N * N);
    this.treeCount = new Uint8Array(N * N);
    this.buildings = new Map();
    this.residents = new Map();
    this.trees = [];
    this.money = CONFIG.START_MONEY;
    this.taxRate = 10;
    this.day = 1;
    this.hours = 7;
    this.nextId = 1;
    this.entry = { x: 0, z: 0 };
    this.townName = 'Kinstead';
    this.history = [];
    this.titleIdx = 0;
    this.stats = { visits: 0, visitIncome: 0, todayVisitIncome: 0, arrivals: 0, departures: 0 };
    this.research = { done: [], current: null, progress: 0, bank: 0 };
    this._listeners = {};
  }

  // ------------------------------------------------------------- events
  on(evt, fn) { (this._listeners[evt] ||= []).push(fn); }
  emit(evt, data) { for (const fn of this._listeners[evt] || []) fn(data); }

  // ------------------------------------------------------------- basics
  idx(x, z) { return z * this.N + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N; }
  roadAt(x, z) { return this.inBounds(x, z) ? this.roads[z * this.N + x] : 0; }
  railAt(x, z) { return this.inBounds(x, z) ? this.rails[z * this.N + x] : 0; }
  buildingOn(x, z) {
    if (!this.inBounds(x, z)) return null;
    const id = this.buildingAt[z * this.N + x];
    return id >= 0 ? this.buildings.get(id) : null;
  }
  get population() { return this.residents.size; }
  // population used for unlocks (sandbox can unlock everything)
  get unlockPop() { return this.sandbox.unlockAll ? Infinity : this.residents.size; }
  setSandbox(opts) {
    Object.assign(this.sandbox, opts);
    if (this.sandbox.infiniteMoney) this.money = Infinity;
    else if (!Number.isFinite(this.money)) this.money = 100000;
  }

  newId() { return this.nextId++; }

  // ------------------------------------------------------------ research
  hasTech(id) { return !id || this.sandbox.unlockAll || this.research.done.includes(id); }
  techName(id) { return TECHS[id] ? TECHS[id].name : id; }
  canResearch(id) {
    const t = TECHS[id];
    return !!t && !this.research.done.includes(id) && t.needs.every(n => this.research.done.includes(n));
  }
  startResearch(id) {
    if (!this.canResearch(id)) return false;
    const R = this.research;
    if (R.current && R.current !== id) R.bank += R.progress;
    R.current = id;
    R.progress = R.current === id ? R.progress : 0;
    // points banked while idle go straight in
    const use = Math.min(R.bank, TECHS[id].cost);
    R.progress += use; R.bank -= use;
    this._checkResearch();
    return true;
  }
  addResearch(points) {
    const R = this.research;
    if (!R.current) { R.bank += points; return; }
    R.progress += points;
    this._checkResearch();
  }
  _checkResearch() {
    const R = this.research;
    if (!R.current || R.progress < TECHS[R.current].cost) return;
    const id = R.current;
    R.bank += R.progress - TECHS[id].cost;
    R.done.push(id);
    R.current = null; R.progress = 0;
    this.emit('research:done', id);
  }

  // Walkable surface height (roads hover slightly, bridges float over water,
  // and the road ramps up or down to meet a bridge deck).
  walkHeight(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (this.inBounds(tx, tz) && this.roads[tz * this.N + tx]) {
      if (this.terrain.isWater(tx, tz)) return bridgeDeckY();
      const r = this.rampHeight(x, z);
      if (r != null) return r + 0.02;
    }
    return Math.max(this.terrain.heightAt(x, z) + 0.03, CONFIG.WATER_LEVEL - 0.05);
  }

  // Within RAMP of a bridge, a land road climbs (or drops) smoothly from the
  // bank to the deck. Surface height there, or null off any ramp.
  rampHeight(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!this.inBounds(tx, tz) || !this.roads[this.idx(tx, tz)] || this.terrain.isWater(tx, tz)) return null;
    const deck = bridgeDeckY(), med = this.blvd[this.idx(tx, tz)];
    let best = null;
    for (const [dx, dz] of DIRS) {
      const nx = tx + dx, nz = tz + dz;
      if (!this.inBounds(nx, nz) || !this.roads[this.idx(nx, nz)] || !this.terrain.isWater(nx, nz)) continue;
      if (med & sideBit(dx, dz)) continue;   // a boulevard's other lane, not a bridge this one climbs to
      const d = dx > 0 ? tx + 1 - x : dx < 0 ? x - tx : dz > 0 ? tz + 1 - z : z - tz;
      if (d >= RAMP) continue;
      const fx = dx ? (dx > 0 ? tx + 1 - RAMP : tx + RAMP) : x, fz = dz ? (dz > 0 ? tz + 1 - RAMP : tz + RAMP) : z;
      const bank = this.terrain.heightAt(fx, fz) + 0.012;
      const k = Math.max(0, d) / RAMP, s = k * k * (3 - 2 * k);
      const y = deck + (bank - deck) * s;
      best = best == null ? y : Math.max(best, y);
    }
    return best;
  }

  // ------------------------------------------------------------ buildings
  findAccess(x, z, w, d = w) {
    const out = [];
    const push = (ax, az, rot) => {
      if (this.roadAt(ax, az)) out.push({ x: ax, z: az, rot, conn: this.connected[this.idx(ax, az)] });
    };
    for (let k = 0; k < w; k++) { push(x + k, z + d, 0); push(x + k, z - 1, 2); }
    for (let k = 0; k < d; k++) { push(x + w, z + k, 1); push(x - 1, z + k, 3); }
    // connected roads first; then prefer facing the street along the long side
    const long = (rot) => (rot % 2 === 0 ? w : d);
    out.sort((a, b) => (b.conn - a.conn) || (long(b.rot) - long(a.rot)));
    return out;
  }

  checkBuild(type, x, z, opts = {}) {
    const def = BUILDINGS[type];
    const W = opts.w ?? def.size, D = opts.d ?? def.size;
    const t = this.terrain;
    let reason = null;
    if (!opts.ignoreUnlock && this.unlockPop < unlockOf(type, 0)) reason = `Unlocks at ${unlockOf(type, 0)} villagers`;
    if (!reason && !opts.ignoreUnlock && !this.hasTech(def.tech)) reason = `Research ${this.techName(def.tech)} first`;
    // (one seat of government, whichever it has grown into)
    if (def.unique && !opts.ignoreUnique) for (const b of this.buildings.values()) if (b.type === type || (def.seat && BUILDINGS[b.type].seat)) { reason = 'Only one allowed'; break; }
    let minH = Infinity, maxH = -Infinity, trees = 0;
    for (let dz = 0; dz < D && !reason; dz++) {
      for (let dx = 0; dx < W; dx++) {
        const tx = x + dx, tz = z + dz;
        if (!this.inBounds(tx, tz)) { reason = 'Out of bounds'; break; }
        const i = this.idx(tx, tz);
        if (t.isWater(tx, tz)) { reason = "Can't build on water"; break; }
        if (this.roads[i]) { reason = 'A road is in the way'; break; }
        if (this.rails[i]) { reason = 'Railway track is in the way'; break; }
        if (this.buildingAt[i] >= 0) { reason = 'Occupied'; break; }
        if (this.fields[i] >= 0) { reason = 'Farm fields: take them out of the farm first'; break; }
        minH = Math.min(minH, t.tileMin(tx, tz));
        maxH = Math.max(maxH, t.tileMax(tx, tz));
        trees += this.treeCount[i];
      }
    }
    if (!reason && maxH - minH > (Math.max(W, D) === 1 ? 0.9 : 1.1)) reason = 'Too steep here';
    let access = reason ? [] : this.findAccess(x, z, W, D);
    // a diagonal passing a corner of the plot: only a one-tile building, which
    // turns to face it (its way in one of the two tiles the diagonal links)
    if (!reason && this.diagN) {
      let sp = 0;
      for (let dz = 0; dz < D; dz++) for (let dx = 0; dx < W; dx++) sp |= spillsOf(this, x + dx, z + dz);
      if (sp && !diagCapable({ type, w: W, d: D, size: Math.max(W, D) })) reason = 'A diagonal street passes the corner of this plot: only a one-tile building can stand here';
      else if (sp) {
        const pair = this._diagPair({ x, z }, facingCorner(sp, access.length ? access[0].rot : 0));
        const near = access.filter(a => pair.some(([px, pz]) => px === a.x && pz === a.z));
        if (near.length) access = near;
      }
    }
    if (!reason && !def.park && !access.length) reason = 'Needs a road next to it';
    if (!reason && def.needsWater) {
      const ring = [];
      for (let k = -1; k <= W; k++) ring.push([x + k, z - 1], [x + k, z + D]);
      for (let k = 0; k < D; k++) ring.push([x - 1, z + k], [x + W, z + k]);
      if (!ring.some(([ax, az]) => this.inBounds(ax, az) && t.isWater(ax, az))) reason = 'Must be next to water';
    }
    const rail = !reason && def.needsRail ? this.findRail(x, z, W, D) : null;
    if (!reason && def.needsRail && !rail) reason = 'Needs railway track next to it';
    const cost = (opts.baseCost ?? def.levels[0].cost) + trees * CLEAR_COST;
    if (!reason && !opts.ignoreMoney && this.money < cost) reason = 'Not enough money';
    return { ok: !reason, reason, cost, access, minH, maxH, trees, rail };
  }

  findRail(x, z, w, d = w) {
    const cand = [];
    for (let k = 0; k < w; k++) cand.push([x + k, z + d, 0], [x + k, z - 1, 2]);
    for (let k = 0; k < d; k++) cand.push([x + w, z + k, 1], [x - 1, z + k, 3]);
    for (const [ax, az, dir] of cand) if (this.railAt(ax, az)) return { x: ax, z: az, dir };
    return null;
  }

  // New buildings start as a building site (see Construction) unless placed
  // with opts.instant (world generation) or the instant-build sandbox switch.
  placeBuilding(type, x, z, opts = {}) {
    // a planting or a monument of a kind the town can make
    if (opts.flavor && KINDS[type]) {
      const K = KINDS[type][opts.flavor];
      if (!K) return { ok: false, reason: 'There is no such kind' };
      if (!opts.ignoreUnlock && !this.hasTech(K.tech)) return { ok: false, reason: `Research ${this.techName(K.tech)} first` };
    }
    const chk = this.checkBuild(type, x, z, opts);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const def = BUILDINGS[type];
    const b = this._record(type, x, z, chk, opts);
    this._occupy(b);
    if (!opts.free) this.money -= chk.cost;
    if (!opts.instant && !this.sandbox.instantBuild) b.con = { kind: 'build', work: workNeeded(def.levels[b.level].cost), done: 0 };
    this.buildings.set(b.id, b);
    this._updateFronts(b);
    if (chk.trees) this.emit('trees');
    this.emit('building:add', b);
    return { ok: true, building: b, cost: chk.cost };
  }

  _record(type, x, z, chk, o = {}) {
    const def = BUILDINGS[type];
    const w = o.w ?? def.size, d = o.d ?? def.size;
    const variant = o.variant ?? ((Math.random() * 1e9) | 0);
    const pick = chk.access.length ? chk.access[(o.accessIndex || 0) % chk.access.length] : null;
    const b = {
      id: this.newId(), type, level: o.level || 0, x, z, size: Math.max(w, d), w, d, flavor: o.flavor || null, look: o.look || null,
      rot: pick ? pick.rot : variant % 4,
      variant,
      access: pick ? { x: pick.x, z: pick.z } : null,
      rail: chk.rail ? { x: chk.rail.x, z: chk.rail.z, dir: chk.rail.dir } : null,
      baseY: floorHeight(this.terrain, type, x, z, w, d, pick ? pick.rot : variant % 4, chk.minH, chk.maxH), minY: chk.minH,
      built: this.day,
      residents: [], workers: [],
      connected: !!(pick && this.connected[this.idx(pick.x, pick.z)]),
      happiness: o.happiness ?? 60, factors: o.factors ?? null,
      con: null,
    };
    // turned or nudged on its plot (see pose.js): as asked, or as it stood
    const p = cleanPose(o.pose || (o.yaw ? [o.yaw, 0, 0] : null));
    if (p) b.pose = p;
    return b;
  }

  // A building comes forward into the street when every tile along its
  // front is road.
  // The tiles in front of a building's plot (or of part of it).
  _frontTiles(b, part = null) {
    const [dx, dz] = DIRS[b.rot];
    const r = part || { x: b.x, z: b.z, w: fw(b), d: fd(b) }, tiles = [];
    if (dz) for (let k = 0; k < r.w; k++) tiles.push([r.x + k, dz > 0 ? r.z + r.d : r.z - 1]);
    else for (let k = 0; k < r.d; k++) tiles.push([dx > 0 ? r.x + r.w : r.x - 1, r.z + k]);
    return tiles;
  }

  _frontOf(b, part = null) {
    if (!b.access) return 0;
    const tiles = this._frontTiles(b, part);
    if (!tiles.every(([x, z]) => this.roadAt(x, z))) return 0;
    // street trees and hedges take the verge, so it stays behind them
    if (this.dress && tiles.some(([x, z]) => (DRESSINGS[streetPart(this.dress[this.idx(x, z)])] || {}).verge)) return 0;
    // two buildings on a street corner facing the same road tile would meet
    // in its corner, so neither of them comes forward there. Nor does one
    // whose garden strip (b.ext) widens its front past a building on the corner.
    const [dx, dz] = DIRS[b.rot], e = b.ext || {}, ax = dz ? 'x' : 'z';
    for (const [x, z] of tiles) for (const s of [-1, 1]) {
      const o = this.buildingOn(x + (dz ? s : 0), z + (dx ? s : 0));
      if (!o || o === b) continue;
      if (e[ax + (s < 0 ? '0' : '1')] > 0) return 0;
      if (o.access && this._frontTiles(o).some(([fx, fz]) => fx === x && fz === z)) return 0;
    }
    return FRONT;
  }

  // A shop on a street corner: the street it faces turns the corner at one
  // end of its front or both, a road running down that side of it too
  // (b.corner: 1 its left, 2 its right, 3 both, as seen from the street).
  // Such a shop carries its shopfront round onto the side street.
  _cornerOf(b) {
    if (!b.access || !CORNER_SHOPS.has(b.type)) return 0;
    const [fx, fz] = DIRS[b.rot], [rx, rz] = DIRS[(b.rot + 1) % 4];
    let m = 0;
    for (const [bit, s] of [[1, -1], [2, 1]]) {
      // the plot's tile at that end of its front: the street ahead of it and the road beside it
      let at = null, best = -Infinity;
      for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) {
        const x = b.x + dx, z = b.z + dz, v = (x * fx + z * fz) * 1000 + s * (x * rx + z * rz);
        if (v > best) { best = v; at = [x, z]; }
      }
      if (this.roadAt(at[0] + fx, at[1] + fz) && this.roadAt(at[0] + s * rx, at[1] + s * rz)) m |= bit;
    }
    return m;
  }

  // Which of a building's other sides have a road along them (b.sides: 1 its
  // left, 2 its right, 4 its back, as seen from the street in front), so its
  // walls there get windows and a door rather than a blank face.
  _sidesOf(b) {
    if (!b.access) return 0;
    const [fx, fz] = DIRS[b.rot], [rx, rz] = DIRS[(b.rot + 1) % 4];
    let m = 0;
    for (const [bit, ax, az] of [[1, -rx, -rz], [2, rx, rz], [4, -fx, -fz]]) {
      // the plot's tiles along that side, and the road beyond them
      let best = -Infinity;
      for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) best = Math.max(best, (b.x + dx) * ax + (b.z + dz) * az);
      for (let dz = 0; dz < fd(b) && !(m & bit); dz++) for (let dx = 0; dx < fw(b); dx++) {
        const x = b.x + dx, z = b.z + dz;
        if (x * ax + z * az === best && this.roadAt(x + ax, z + az)) { m |= bit; break; }
      }
    }
    return m;
  }

  // Re-decide every building's street front (after building, demolishing or
  // re-laying roads). The new building itself, if any, is not refitted.
  // The plot comes forward only where the street runs the whole width of it
  // (b.front). While a building stands on part of a grown plot (b.spare),
  // the building itself comes forward as far as its own part's street
  // allows, as it did before the plot grew (b.ownFront). A shop on a corner
  // turns its shopfront round it (b.corner). All of these come from the
  // roads, so none is saved or sent.
  _updateFronts(except = null) {
    const refit = [];
    for (const b of this.buildings.values()) {
      // a building with a diagonal past its plot's corner faces it, turned
      // 45 degrees (b.diag: 1 + the corner), its way to the street one of the
      // two road tiles the diagonal links; it never comes forward, and gives
      // up any garden land it bought or sold (the plots no longer line up)
      const dq = this._diagOf(b), dg = dq + 1;
      if (dg && dg !== (b.diag || 0)) {
        if (b.leases && b.leases.length) this._dissolveLeases(b);
        this._diagAccess(b, dq);
      }
      const f = dg ? 0 : this._frontOf(b), r = dg ? null : spareRect(b), own = r ? this._frontOf(b, r) : undefined;
      const cn = dg ? 0 : this._cornerOf(b), sd = dg ? this._diagSides(b, dq) : this._sidesOf(b), cv = dg ? 0 : this._curveOf(b);
      if (f !== (b.front || 0) || own !== b.ownFront || cn !== (b.corner || 0) || sd !== (b.sides || 0) || dg !== (b.diag || 0) || cv !== (b.curve || 0)) {
        if (dg) b.diag = dg; else delete b.diag;
        if (cv) b.curve = cv; else delete b.curve;
        if (sd) b.sides = sd; else delete b.sides;
        b.front = f;
        if (own === undefined) delete b.ownFront; else b.ownFront = own;
        if (cn) b.corner = cn; else delete b.corner;
        if (b !== except) refit.push(b);
      }
    }
    for (const b of refit) this.emit('building:refit', b);
  }

  // A one-tile building facing the outside of a bend in the street turns to
  // sit square to its curve: towards the corner the bend turns round (b.curve,
  // radians from facing straight out of its plot; 0 for none). See pose.js.
  _curveOf(b) {
    if (!b.access || !diagCapable(b) || b.spare) return 0;
    const { x: ax, z: az } = b.access, [fx, fz] = DIRS[b.rot];
    if (b.x + fx !== ax || b.z + fz !== az) return 0;
    const s = roadTile(this, ax, az);
    if (!s || s.bend < 0 || s.arms[sideTo(ax, az, b.x, b.z)]) return 0;
    const K = cornerFrame(ax, az, s.bend);
    let rel = Math.atan2(K.Kx - b.x - 0.5, K.Kz - b.z - 0.5) - (b.rot * Math.PI) / 2;
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    return Math.abs(rel) < 0.7 ? Math.round(rel * 1000) / 1000 : 0;
  }

  // Turn and nudge a building on its plot (pose: [turn, across, forward], see
  // pose.js); null squares it to its street again.
  setPose(id, pose) {
    const b = this.buildings.get(id);
    if (!b) return { ok: false, reason: 'That building is gone' };
    if (b.spare) return { ok: false, reason: 'Build it across its whole plot first' };
    const p = pose == null ? null : cleanPose(pose);
    if (JSON.stringify(p) === JSON.stringify(b.pose || null)) return { ok: true, building: b };
    if (p) b.pose = p; else delete b.pose;
    this.emit('building:refit', b);
    return { ok: true, building: b };
  }

  // The corner a building faces a diagonal across (see above), or -1.
  _diagOf(b) {
    if (!this.diagN || !diagCapable(b)) return -1;
    return facingCorner(spillsOf(this, b.x, b.z), b.rot);
  }

  // The two road tiles a diagonal past corner q of b's plot links.
  _diagPair(b, q) {
    const [ax, az] = SIDES[q], [bx, bz] = SIDES[(q + 1) & 3];
    return [[b.x + ax, b.z + az], [b.x + bx, b.z + bz]];
  }

  // Point a building facing a diagonal at one of its two road tiles (one
  // joined to the way out of town, if either is).
  _diagAccess(b, q) {
    const pair = this._diagPair(b, q).filter(([x, z]) => this.roadAt(x, z));
    if (!pair.length) return;
    const conn = ([x, z]) => !!this.connected[this.idx(x, z)];
    const keep = pair.find(([x, z]) => b.access && b.access.x === x && b.access.z === z && (conn([x, z]) || !pair.some(conn)));
    const [x, z] = keep || pair.find(conn) || pair[0];
    b.access = { x, z };
    b.connected = conn([x, z]);
  }

  // The other sides of a building facing a diagonal with a diagonal along
  // them too (b.sides: 1 its left, 2 its right, 4 its back, as seen from the
  // street): the ones passing the plot's other corners.
  _diagSides(b, q) {
    const sp = spillsOf(this, b.x, b.z);
    return (sp & (1 << ((q + 1) & 3)) ? 1 : 0) | (sp & (1 << ((q + 3) & 3)) ? 2 : 0) | (sp & (1 << ((q + 2) & 3)) ? 4 : 0);
  }

  _occupy(b) {
    const plot = [];
    for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) plot.push([b.x + dx, b.z + dz]);
    this._unfield(plot);
    for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) {
      this.buildingAt[this.idx(b.x + dx, b.z + dz)] = b.id;
      this._clearTrees(b.x + dx, b.z + dz);
    }
    this._clearTreesNear(b.x, b.z, b.w, b.d, 0.22);
  }

  // Take a building off the map without refunds or rehousing (its people
  // and line stops have already been pointed elsewhere).
  _detach(b) {
    this._dissolveLeases(b);
    this._dropFields(b);
    for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) this.buildingAt[this.idx(b.x + dx, b.z + dz)] = -1;
    this.buildings.delete(b.id);
    this.emit('building:remove', b);
    this._updateFronts();
  }

  // Point everyone and everything that refers to one building at another.
  _retarget(from, to) {
    for (const r of this.residents.values()) {
      if (r.home === from) r.home = to;
      if (r.job === from) r.job = to;
      if (r.at === from) r.at = to;
      if (r.site === from) r.site = null;
      if (r.plan) for (const p of r.plan) if (p.dest === from) p.dest = to;
    }
    let lines = false;
    for (const l of this.lines) {
      const i = l.stops.indexOf(from);
      if (i >= 0) { l.stops[i] = to; lines = true; }
    }
    if (lines) this.emit('lines');
  }

  buildValue(b) {
    const def = BUILDINGS[b.type];
    let v = 0;
    for (let l = 0; l <= b.level; l++) v += def.levels[l].cost;
    return Math.round(v * sizeK(b));
  }

  // Called by Construction when the builders have done all the work.
  finishConstruction(b) {
    const con = b.con;
    if (!con) return;
    if (con.kind === 'demolish') { this.removeBuilding(b.id); return; }
    if (con.kind === 'dismantle') {
      const dest = this.buildings.get(con.dest);
      this._detach(b);
      if (dest && dest.con && dest.con.wait === 'dismantle') {
        dest.con.wait = 'haul';
        this.emit('building:dismantled', { from: b, to: dest });
      }
      return;
    }
    const homes = capOf(b, 'housing');
    if (con.kind === 'upgrade') {
      if (con.toType && BUILDINGS[con.toType]) b.type = con.toType;
      if (con.look !== undefined) b.look = con.look;
      if (con.flavor !== undefined) b.flavor = con.flavor;
      b.level = Math.min(con.to, BUILDINGS[b.type].levels.length - 1);
      this._fill(b, con.extend);
      if (!hasFields(b.type)) this._dropFields(b);
    }
    if (con.kind === 'build') b.built = this.day;
    b.con = null;
    // a cottage rebuilt as something grander takes its garden back
    if (b.type !== 'house') this._dissolveLeases(b, true);
    this.emit('building:change', b);
    this.emit('building:done', { building: b, kind: con.kind, moved: !!con.moved });
    this._shrunk(b, homes);
    if (BUILDINGS[b.type].spacious) this.tryEncroach(b);
  }

  // Built out across the whole plot: extended, or rebuilt as a building whose
  // own footprint is the plot (a Country Mansion on a double plot).
  _fill(b, extend) {
    if (b.spare && (extend || baseArea(b) >= fw(b) * fd(b))) { delete b.spare; setFloor(this.terrain, b); this._updateFronts(b); }
  }

  // A home rebuilt to hold fewer people (a Grand Manor on a double plot
  // becoming a Country Mansion): the households that no longer fit move out,
  // to another home or out of town (see Sim._onShrunk).
  _shrunk(b, homes) {
    if (capOf(b, 'housing') < homes) this.emit('building:shrink', b);
  }

  // The households that would have to leave a home for only `cap` people to
  // live there: the ones that moved in last, whole.
  movingOut(b, cap) {
    const fams = new Map();
    for (const r of this.residents.values()) {
      if (r.home !== b.id) continue;
      if (!fams.has(r.fam ?? r.id)) fams.set(r.fam ?? r.id, []);
      fams.get(r.fam ?? r.id).push(r);
    }
    let n = [...fams.values()].reduce((s, f) => s + f.length, 0);
    const out = [];
    for (const fam of [...fams.values()].reverse()) {
      if (n <= cap) break;
      out.push(...fam);
      n -= fam.length;
    }
    return out;
  }

  // ---------------------------------------------------------- land deals
  // A big home (def.spacious) can buy a strip of garden from a cottage or
  // family house next door. Its plot grows by LAND tiles on that side and the
  // seller's shrinks by the same amount, so the two never overlap. The buyer's
  // household pays the seller's household (not the town).
  tryEncroach(b) {
    const LAND = 0.25;
    if (!this.hasTech('surveying')) return [];
    if (!b || !BUILDINGS[b.type].spacious || b.con || fw(b) !== 1 || fd(b) !== 1 || b.diag) return [];
    b.leases ||= [];
    const ext = this._ext(b);
    const sold = [];
    const sides = [['x1', 1, 0, 'x0'], ['x0', -1, 0, 'x1'], ['z1', 0, 1, 'z0'], ['z0', 0, -1, 'z1']];
    for (const [side, dx, dz, opp] of sides) {
      if (b.leases.length >= 2) break;
      if (ext[side]) continue;
      // strips on two perpendicular sides would meet in a corner of a third plot
      const perp = side[0] === 'x' ? 'z' : 'x';
      if (ext[perp + '0'] > 0 || ext[perp + '1'] > 0) continue;
      const o = this.buildingOn(b.x + dx, b.z + dz);
      if (!o || o.type !== 'house' || o.con || fw(o) !== 1 || fd(o) !== 1 || o.diag) continue;
      const oe = this._ext(o);
      // a seller gives up one strip at most, and keeps its street side
      if (oe.x0 < 0 || oe.x1 < 0 || oe.z0 < 0 || oe.z1 < 0) continue;
      if (o.access && o.access.x === b.x && o.access.z === b.z) continue;
      const price = 60 + 40 * b.level + (b.type === 'villa' ? 30 : 0);
      ext[side] = LAND;
      oe[opp] = -LAND;
      b.leases.push({ with: o.id, side, amt: LAND, price, buyer: true });
      (o.leases ||= []).push({ with: b.id, side: opp, amt: LAND, price, buyer: false });
      sold.push(o);
      this.emit('building:refit', o);
      this.emit('land:sold', { buyer: b, seller: o, price });
    }
    if (sold.length) { this._updateFronts(b); this.emit('building:refit', b); }
    return sold;
  }

  _ext(b) { return (b.ext ||= { x0: 0, x1: 0, z0: 0, z1: 0 }); }

  // Undo every land deal a building is part of (it was demolished, moved,
  // joined or rebuilt as something that no longer fits the deal).
  _dissolveLeases(b, onlySold = false) {
    if (!b.leases || !b.leases.length) return;
    const keep = [];
    for (const l of b.leases) {
      if (onlySold && l.buyer) { keep.push(l); continue; }
      this._ext(b)[l.side] = 0;
      const o = this.buildings.get(l.with);
      if (!o || !o.leases) continue;
      const opp = { x0: 'x1', x1: 'x0', z0: 'z1', z1: 'z0' }[l.side];
      o.leases = o.leases.filter(x => x.with !== b.id);
      this._ext(o)[opp] = 0;
      if (o !== b) this.emit('building:refit', o);
    }
    b.leases = keep;
  }

  // Each morning a few big homes look for garden land to buy.
  encroachPass(rng = Math.random) {
    for (const b of [...this.buildings.values()]) {
      if (BUILDINGS[b.type].spacious && !b.con && (b.leases || []).length < 2 && rng() < 0.3) this.tryEncroach(b);
    }
  }

  // ----------------------------------------------------------- expansion
  // Grow a 1×1 building onto the plot beside or behind it. Empty land is
  // simply taken; a small neighbour is either squeezed (it sells a garden
  // strip and keeps its house) or bought out and demolished.
  expandOptions(b) {
    const out = [];
    const def = BUILDINGS[b.type];
    if (!b || !this.hasTech('surveying') || this._dryHome(b) || b.diag) return out;
    // a 2×2 park, or a 3×3 one, can grow onto the land round one of its
    // corners into grounds a size bigger (Public Parks); so can the seat of
    // government at its top level (Capital City)
    const n = fw(b);
    const grows = def.park ? this.hasTech('publicparks') : def.seat && b.level === def.levels.length - 1 && this.hasTech('capital');
    if (!b.con && !b.spare && grows && n >= 2 && fd(b) === n && n * n === baseArea(b) && growsInto(b.type, (n + 1) ** 2).length) {
      const [fx, fz] = DIRS[b.rot];
      for (const cz of [-1, 1]) for (const cx of [-1, 1]) {
        const x0 = cx < 0 ? b.x - 1 : b.x, z0 = cz < 0 ? b.z - 1 : b.z, tiles = [];
        for (let z = z0; z <= z0 + n; z++) for (let x = x0; x <= x0 + n; x++) if (x < b.x || x >= b.x + n || z < b.z || z >= b.z + n) tiles.push([x, z]);
        const take = this._growLand(b, tiles, 1.4);
        if (!take) continue;
        // which corner, as the park sees it from its street side
        const ahead = cx * fx + cz * fz, right = -cx * fz + cz * fx;
        const where = `${ahead > 0 ? 'in front of it' : 'behind it'} and to its ${right > 0 ? 'right' : 'left'}`;
        out.push({ dir: 20 + (cx > 0 ? 1 : 0) + (cz > 0 ? 2 : 0), x: tiles[0][0], z: tiles[0][1], tiles, kind: 'grand', where, ...take, label: `Take the land ${where} for ${plotName((n + 1) ** 2)}` });
      }
      return out;
    }
    // a double plot can grow into a 2×2 estate onto two plots beside it:
    // empty land or, for a park, the little parks there too
    if (!b.con && fw(b) * fd(b) === 2 && this.hasTech('bigplots') && !def.stop && growsInto(b.type, 4).length) {
      const along = fw(b) === 2;
      for (const s of [-1, 1]) {
        const tiles = along ? [[b.x, s < 0 ? b.z - 1 : b.z + 1], [b.x + 1, s < 0 ? b.z - 1 : b.z + 1]] : [[s < 0 ? b.x - 1 : b.x + 1, b.z], [s < 0 ? b.x - 1 : b.x + 1, b.z + 1]];
        const take = this._growLand(b, tiles, 1.2);
        if (!take) continue;
        const [fx, fz] = DIRS[b.rot], where = (along ? -fz === s && !fx : -fx === s && !fz) ? 'behind it' : 'beside it';
        out.push({ dir: 10 + (s + 1), x: tiles[0][0], z: tiles[0][1], tiles, kind: 'estate', where, ...take, label: `Take the two plots ${where} for a 2×2 estate` });
      }
      return out;
    }
    // a one-plot park only takes an empty plot beside it (it joins with the
    // parks next door instead)
    if (def.park && !b.con && fw(b) === 1 && fd(b) === 1 && def.size === 1 && growsInto(b.type, 2).length) {
      const sideOf = (k) => (k === b.rot ? 'in front' : (k + 2) % 4 === b.rot ? 'behind' : 'beside');
      DIRS.forEach(([dx, dz], k) => {
        const take = this._growLand(b, [[b.x + dx, b.z + dz]], 1.1, false);
        if (take) out.push({ dir: k, x: b.x + dx, z: b.z + dz, kind: 'land', where: sideOf(k), ...take, label: `Take the empty plot ${sideOf(k)}` });
      });
      return out;
    }
    if (!b || b.con || def.merged || def.park || def.stop || fw(b) !== 1 || fd(b) !== 1 || def.size !== 1) return out;
    // only where the double plot opens up something bigger to upgrade into
    if (!growsInto(b.type, 2).length) return out;
    const base = CONFIG.PLOT_PRICE;   // the land, whatever stands beside it
    const front = DIRS[b.rot];
    const sideOf = (k) => (k === b.rot ? 'in front' : (k + 2) % 4 === b.rot ? 'behind' : 'beside');
    const names = { 0: 'z1', 1: 'x1', 2: 'z0', 3: 'x0' };
    DIRS.forEach(([dx, dz], k) => {
      const x = b.x + dx, z = b.z + dz;
      if (!this.inBounds(x, z) || this.roadAt(x, z) || this.railAt(x, z) || this.terrain.isWater(x, z) || this.fields[this.idx(x, z)] >= 0) return;
      // (a plot a diagonal street passes takes nothing bigger than one tile)
      if (this.diagN && spillsOf(this, x, z)) return;
      const lo = Math.min(this.terrain.tileMin(x, z), this.terrain.tileMin(b.x, b.z)), hi = Math.max(this.terrain.tileMax(x, z), this.terrain.tileMax(b.x, b.z));
      if (hi - lo > 1.1) return;
      const o = this.buildingOn(x, z);
      const where = sideOf(k);
      const trees = this.treeCount[this.idx(x, z)] * CLEAR_COST;
      if (!o) { out.push({ dir: k, x, z, kind: 'land', where, cost: base + trees, label: `Take the empty plot ${where}` }); return; }
      if (o.con || BUILDINGS[o.type].unique || fw(o) !== 1 || fd(o) !== 1) return;
      const oname = BUILDINGS[o.type].levels[o.level].name;
      // squeeze: buy a strip of a cottage's garden (it keeps its house)
      const side = names[k], opp = names[(k + 2) % 4];
      const be = b.ext || {}, oe = o.ext || {};
      const perp = side[0] === 'x' ? 'z' : 'x';
      if (o.type === 'house' && !be[side] && !(be[perp + '0'] > 0 || be[perp + '1'] > 0) && !(oe.x0 < 0 || oe.x1 < 0 || oe.z0 < 0 || oe.z1 < 0)) {
        out.push({ dir: k, x, z, kind: 'strip', where, other: o, side, opp, cost: 60 + 40 * b.level, label: `Buy a strip of the ${oname}'s garden ${where}`, warn: `The ${oname} next door gets a smaller garden (its owners are paid)` });
      }
      const comp = this.buildValue(o);   // its owners are paid what their building is worth
      out.push({ dir: k, x, z, kind: 'takeover', where, other: o, cost: base + comp, comp, label: `Take over the ${oname} ${where}`,
        warn: `The ${oname} will be demolished${o.residents.length ? ` and its ${o.residents.length} resident${o.residents.length > 1 ? 's' : ''} rehoused` : ''} ($${comp} to its owners included)` });
    });
    return out;
  }

  // Land a building can grow onto: every tile in bounds, clear of roads,
  // track, water and fields and with no building on it (though a park, or
  // the seat's grounds, may take in the little parks there), and the ground
  // over the old plot and the new no rougher than `rough`. { cost, absorb,
  // warn }, or null.
  _growLand(b, tiles, rough, absorb = true) {
    const def = BUILDINGS[b.type], taken = [];
    for (const [x, z] of tiles) {
      if (!this.inBounds(x, z) || this.roadAt(x, z) || this.railAt(x, z) || this.terrain.isWater(x, z) || this.fields[this.idx(x, z)] >= 0) return null;
      // (nor where a diagonal street passes the plot's corner: see diagonal.js)
      if (this.diagN && spillsOf(this, x, z)) return null;
      const o = this.buildingOn(x, z);
      if (!o) continue;
      if (!(absorb && (def.park || def.seat) && isSmallPark(o) && !(o.leases || []).length)) return null;
      if (!taken.includes(o)) taken.push(o);
    }
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of [...tiles, [b.x, b.z], [b.x + fw(b) - 1, b.z], [b.x, b.z + fd(b) - 1], [b.x + fw(b) - 1, b.z + fd(b) - 1]]) {
      lo = Math.min(lo, this.terrain.tileMin(x, z)); hi = Math.max(hi, this.terrain.tileMax(x, z));
    }
    if (hi - lo > rough) return null;
    const empty = tiles.filter(([x, z]) => !this.buildingOn(x, z));
    const trees = empty.reduce((s, [x, z]) => s + this.treeCount[this.idx(x, z)], 0) * CLEAR_COST;
    const names = [...new Set(taken.map(o => BUILDINGS[o.type].levels[o.level].name.toLowerCase()))];
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return { cost: empty.length * CONFIG.PLOT_PRICE + trees, absorb: taken, warn: taken.length ? `The ${list} there ${taken.length > 1 ? 'become' : 'becomes'} part of the ${def.park ? 'park' : 'grounds'}` : undefined };
  }

  // Homes need running water to grow (see Sim._working), unless the sandbox
  // lets buildings upgrade without meeting their needs.
  _dryHome(b) {
    return !this.sandbox.freeUpgrades && !!BUILDINGS[b.type].levels[b.level].housing && (b.blockers || []).includes('water');
  }

  expandBuilding(id, dir, kind) {
    const b = this.buildings.get(id);
    if (b && this._dryHome(b)) return { ok: false, reason: 'No running water: homes need it to grow' };
    const opt = b && this.expandOptions(b).find(o => o.dir === dir && o.kind === kind);
    if (!opt) return { ok: false, reason: "Can't expand that way" };
    if (this.money < opt.cost) return { ok: false, reason: 'Not enough money' };
    if (opt.kind === 'strip') {
      const LAND = 0.25;
      this.money -= opt.cost;
      this._ext(b)[opt.side] = LAND;
      this._ext(opt.other)[opt.opp] = -LAND;
      (b.leases ||= []).push({ with: opt.other.id, side: opt.side, amt: LAND, price: opt.cost, buyer: true });
      (opt.other.leases ||= []).push({ with: b.id, side: opt.opp, amt: LAND, price: opt.cost, buyer: false });
      this._updateFronts(b);
      this.emit('building:refit', opt.other);
      this.emit('building:refit', b);
      this.emit('land:sold', { buyer: b, seller: opt.other, price: opt.cost });
      return { ok: true, building: b, kind: 'strip' };
    }
    if (opt.other) this.removeBuilding(opt.other.id, 0);
    // the little parks a growing park takes in
    for (const o of opt.absorb || []) this.removeBuilding(o.id, 0);
    this.money -= opt.cost;
    this._dissolveLeases(b);
    const tiles = opt.tiles || [[opt.x, opt.z]];
    // what the building itself covers, and where (it stays where it stands)
    const spare = b.spare || { w: fw(b), d: fd(b) };
    const ox = b.x + fw(b) / 2, oz = b.z + fd(b) / 2;
    this._unfield(tiles);
    for (const [x, z] of tiles) { this._clearTrees(x, z); this.buildingAt[this.idx(x, z)] = b.id; }
    const xs = [b.x, b.x + fw(b) - 1, ...tiles.map(t => t[0])], zs = [b.z, b.z + fd(b) - 1, ...tiles.map(t => t[1])];
    const x0 = Math.min(...xs), z0 = Math.min(...zs);
    b.w = Math.max(...xs) - x0 + 1; b.d = Math.max(...zs) - z0 + 1;
    b.x = x0; b.z = z0; b.size = Math.max(b.w, b.d);
    if (spare.sx == null) {
      // which end of the new plot it stands at, in its own frame
      const dx = ox - (b.x + b.w / 2), dz = oz - (b.z + b.d / 2), th = (b.rot * Math.PI) / 2, co = Math.cos(th), si = Math.sin(th);
      const lx = dx * co - dz * si, lz = dx * si + dz * co, sign = (v) => (Math.abs(v) < 0.01 ? 0 : Math.sign(v));
      spare.sx = sign(lx); spare.sz = sign(lz);
    }
    b.spare = spare;
    delete b.pose;   // (a turn was for the plot it had: square on the bigger one)
    setFloor(this.terrain, b);
    this._updateFronts(b);
    this._clearTreesNear(b.x, b.z, b.w, b.d, 0.22);
    // the land is the building's now, as a garden; what to build across it
    // (the bigger buildings it opens up, or the same one extended) is the
    // next choice, under Upgrade
    this.emit('trees');
    this.emit('building:change', b);
    return { ok: true, building: b, kind: opt.kind };
  }

  // ---------------------------------------------------------- demolition
  // A demolition crew (builders, or hired hands) pulls the building down
  // over time. People move out at once; plots that are still only pegged
  // out, and anything in instant-build sandbox, are cleared straight away.
  demolishBuilding(id) {
    const b = this.buildings.get(id);
    if (!b) return { ok: false };
    if (b.con && b.con.kind === 'demolish') return { ok: false, reason: 'Already being demolished' };
    if (this.sandbox.instantBuild || (b.con && (b.con.kind === 'build' || b.con.kind === 'dismantle'))) {
      this.removeBuilding(id);
      return { ok: true, instant: true };
    }
    this._dissolveLeases(b);
    b.con = { kind: 'demolish', work: workNeeded(this.buildValue(b), 'demolish'), done: 0 };
    this.emit('building:vacate', b);
    this.emit('building:change', b);
    return { ok: true, building: b };
  }

  // ------------------------------------------------------------- moving
  moveCost(b) { return Math.round(40 + this.buildValue(b) * 0.3); }

  moveCheck(b, x, z) {
    if (b.con) return { ok: false, reason: 'Construction under way', access: [], cost: 0 };
    if (!this.hasTech('relocation')) return { ok: false, reason: 'Research House Moving first', access: [], cost: 0 };
    return this.checkBuild(b.type, x, z, { w: fw(b), d: fd(b), ignoreUnlock: true, ignoreUnique: true, baseCost: this.moveCost(b) });
  }

  // Moving = builders take the building down, a cart hauls the materials
  // over, and it goes back up on the new plot. People and line stops move
  // to the new plot straight away.
  moveBuilding(id, x, z, opts = {}) {
    const b = this.buildings.get(id);
    if (!b) return { ok: false, reason: 'That building is gone' };
    const chk = this.moveCheck(b, x, z);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const nb = this._record(b.type, x, z, chk, {
      w: fw(b), d: fd(b), level: b.level, variant: b.variant, flavor: b.flavor, look: b.look, accessIndex: opts.accessIndex,
      happiness: b.happiness, factors: b.factors, pose: b.pose,
    });
    if (b.spare) nb.spare = { ...b.spare };
    this._occupy(nb);
    this.money -= chk.cost;
    this._retarget(b.id, nb.id);
    this.buildings.set(nb.id, nb);
    this._updateFronts(nb);
    if (this.sandbox.instantBuild) {
      this._detach(b);
      if (chk.trees) this.emit('trees');
      this.emit('building:add', nb);
      return { ok: true, building: nb, cost: chk.cost, instant: true };
    }
    const value = this.buildValue(b);
    nb.con = { kind: 'build', work: workNeeded(value, 'rebuild'), done: 0, wait: 'dismantle', from: b.id, moved: true };
    b.con = { kind: 'dismantle', work: workNeeded(value, 'dismantle'), done: 0, dest: nb.id };
    if (chk.trees) this.emit('trees');
    this.emit('building:add', nb);
    this.emit('building:change', b);
    return { ok: true, building: nb, old: b, cost: chk.cost };
  }

  // ------------------------------------------------------------ merging
  mergeOptions(b) {
    const out = this._farmJoins(b);
    if (!this.hasTech('joining')) return out;
    if (!b || b.con || fw(b) !== 1 || fd(b) !== 1 || b.diag) return out;
    for (const [dx, dz] of DIRS) {
      const o = this.buildingOn(b.x + dx, b.z + dz);
      if (!o || o.con || fw(o) !== 1 || fd(o) !== 1 || o.diag) continue;
      const m = mergeResult(b, o, (type, level) => this.hasTech(techForLevel(type, level)) && this.unlockPop >= unlockOf(type, level));
      if (!m || !this.hasTech(BUILDINGS[m.type].tech)) continue;
      // people who won't fit in what the two become
      const people = b.residents.length + o.residents.length, room = capOf({ type: m.type, level: m.level, w: 2, d: 1, size: 2 }, 'housing');
      out.push({ other: o, ...m, moveOut: Math.max(0, people - room), ok: this.money >= m.cost });
    }
    return out;
  }

  mergeBuildings(aId, bId) {
    const a = this.buildings.get(aId), o = this.buildings.get(bId);
    const opt = this.mergeOptions(a).find(m => m.other === o);
    if (!opt) return { ok: false, reason: "These two can't be joined" };
    if (this.money < opt.cost) return { ok: false, reason: 'Not enough money' };
    if (opt.farmJoin) return this._joinFarm(opt);
    const x = Math.min(a.x, o.x), z = Math.min(a.z, o.z), w = a.x !== o.x ? 2 : 1, d = a.z !== o.z ? 2 : 1;
    let minH = Infinity, maxH = -Infinity;
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      minH = Math.min(minH, this.terrain.tileMin(x + dx, z + dz));
      maxH = Math.max(maxH, this.terrain.tileMax(x + dx, z + dz));
    }
    if (maxH - minH > 1.1) return { ok: false, reason: 'The ground is too uneven to join them' };
    const access = this.findAccess(x, z, w, d);
    if (!access.length) return { ok: false, reason: 'Needs a road alongside' };
    const homes = capOf(a, 'housing') + capOf(o, 'housing');
    const nb = this._record(opt.type, x, z, { access, rail: null, minH, maxH }, {
      w, d, level: opt.level, variant: opt.base.variant, flavor: opt.flavor, look: opt.base.look, happiness: opt.base.happiness, factors: opt.base.factors,
    });
    this.money -= opt.cost;
    this._retarget(a.id, nb.id);
    this._retarget(o.id, nb.id);
    this._detach(a);
    this._detach(o);
    this._occupy(nb);
    if (!this.sandbox.instantBuild) nb.con = { kind: 'merge', work: workNeeded(opt.cost * 3, 'merge'), done: 0 };
    this.buildings.set(nb.id, nb);
    this._updateFronts(nb);
    this.emit('building:add', nb);
    this._shrunk(nb, homes);
    return { ok: true, building: nb, cost: opt.cost };
  }

  // A farm and a house beside it (FARM_JOIN), from either side: the farm
  // becomes a homestead at its level, with its fields and produce, and the
  // house's family moves into the farmhouse (the house's plot is freed).
  // Needs no research: any farm can have its farmhouse.
  _farmJoins(b) {
    const out = [];
    if (!b || b.con) return out;
    const J = FARM_JOIN, farmSide = J.from.includes(b.type), houseSide = J.with.includes(b.type) && fw(b) === 1 && fd(b) === 1;
    if (!farmSide && !houseSide) return out;
    const seen = new Set();
    for (let dz = -1; dz <= fd(b); dz++) for (let dx = -1; dx <= fw(b); dx++) {
      const inX = dx >= 0 && dx < fw(b), inZ = dz >= 0 && dz < fd(b);
      if (inX === inZ) continue;   // the plot itself, and its corners
      const o = this.buildingOn(b.x + dx, b.z + dz);
      if (!o || o === b || o.con || seen.has(o.id) || o.diag || b.diag) continue;
      seen.add(o.id);
      const farm = farmSide ? b : o, house = farmSide ? o : b;
      if (!J.from.includes(farm.type) || !J.with.includes(house.type) || fw(house) !== 1 || fd(house) !== 1) continue;
      const to = BUILDINGS[J.to], level = Math.min(farm.level, to.levels.length - 1);
      let value = 0;
      for (let l = 0; l <= level; l++) value += to.levels[l].cost;
      const cost = Math.max(0, value - this.buildValue(farm) - this.buildValue(house)) + 60;
      out.push({ other: o, type: J.to, farmJoin: true, farm, house, base: farm, flavor: farm.flavor || null, level, cost, name: to.levels[level].name, ok: this.money >= cost });
    }
    return out;
  }

  _joinFarm(opt) {
    const { farm, house } = opt;
    const people = house.residents.length;
    this.money -= opt.cost;
    this._retarget(house.id, farm.id);
    farm.residents = [...(farm.residents || []), ...house.residents];
    this._detach(house);
    farm.type = opt.type;
    farm.level = opt.level;
    this.emit('building:change', farm);
    this._shrunk(farm, people);
    return { ok: true, building: farm, cost: opt.cost, farmJoin: true };
  }

  // Restore a building from a save without any checks.
  restoreBuilding(rec) {
    const def = BUILDINGS[rec.type];
    if (!def) return;
    const w = rec.w || def.size, d = rec.d || def.size;
    let minH = Infinity, maxH = -Infinity;
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      minH = Math.min(minH, this.terrain.tileMin(rec.x + dx, rec.z + dz));
      maxH = Math.max(maxH, this.terrain.tileMax(rec.x + dx, rec.z + dz));
    }
    const b = {
      id: rec.id, type: rec.type, level: Math.min(rec.level, def.levels.length - 1), x: rec.x, z: rec.z, size: Math.max(w, d), w, d,
      flavor: rec.flavor || null, look: rec.look || null, con: rec.con && typeof rec.con === 'object' ? { ...rec.con } : null,
      rot: rec.rot, variant: rec.variant, access: null, rail: null, baseY: floorHeight(this.terrain, rec.type, rec.x, rec.z, w, d, rec.rot, minH, maxH), minY: minH, built: rec.built || 1,
      residents: [], workers: [], connected: false, happiness: 60, factors: null,
    };
    const spare = spareOf(rec.spare, w, d);
    if (spare) { b.spare = spare; setFloor(this.terrain, b); }
    const pose = spare ? null : cleanPose(rec.pose);
    if (pose) b.pose = pose;
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) this.buildingAt[this.idx(rec.x + dx, rec.z + dz)] = b.id;
    if (Array.isArray(rec.leases) && rec.leases.length) {
      b.leases = rec.leases.map(l => ({ ...l }));
      const e = this._ext(b);
      for (const l of b.leases) e[l.side] = l.buyer ? l.amt : -l.amt;
    }
    this.buildings.set(b.id, b);
  }

  // What a building can become next: its next level, or at the top level
  // the first level of each branch type (e.g. Family House → Villa / Flats).
  upgradeOptions(b) {
    const def = BUILDINGS[b.type];
    const out = def.levels[b.level + 1] ? [{ type: b.type, level: b.level + 1 }] : (def.branches || []).map(type => ({ type, level: 0 }));
    // side paths open up at a particular level (a smithy can become a foundry)
    for (const type of (def.paths && def.paths[b.level]) || []) out.push({ type, level: 0, side: true });
    // schools can always move on to the next stage of education
    for (const type of def.stageNext || []) out.push({ type, level: 0, stage: true });
    // a building that has taken over the plot next door can grow into
    // something bigger
    if (isExpanded(b) && LARGE[b.type]) {
      for (const type of LARGE[b.type]) {
        const L = BUILDINGS[type].levels;
        const level = BUILDINGS[type].cat === 'residential' && type !== 'terrace' ? 0 : Math.min(b.level, L.length - 1);
        out.push({ type, level, large: true });
      }
    }
    // ...and a double-plot building grown into a 2×2 estate can be rebuilt as
    // its estate counterpart, at the level it has reached
    if (fw(b) * fd(b) >= 4 && ESTATE[b.type]) {
      for (const type of ESTATE[b.type]) out.push({ type, level: Math.min(b.level, BUILDINGS[type].levels.length - 1), estate: true });
    }
    // ...and a 2×2 park grown into 3×3 grounds (or a 3×3 one into 4×4) laid
    // out afresh across them, round what it was; the seat rebuilt across
    // them as the first level of the grander seat
    if (b.spare && fw(b) * fd(b) >= 9 && GRAND[b.type]) {
      for (const type of GRAND[b.type]) if (baseAreaOf(type) === fw(b) * fd(b)) out.push({ type, level: def.seat ? 0 : Math.min(b.level, BUILDINGS[type].levels.length - 1), grand: true });
    }
    // ...or the building as it is can be built out across the land it took
    // (not a park: a bigger lawn holds no more scenery; nor the seat, which
    // is rebuilt grander or not at all)
    if (b.spare && !def.park && !def.seat) out.push({ type: b.type, level: b.level, extend: true });
    return out;
  }

  // look: the style chosen for the upgrade (undefined: keep the building's own).
  // A new style means new fronts and roofs, so it costs more than keeping the old one.
  upgradeCheck(b, toType = null, look = undefined) {
    const opts = this.upgradeOptions(b);
    const target = toType === 'extend' ? opts.find(o => o.extend) : opts.find(o => o.type === toType && !o.extend) || opts.find(o => !o.extend) || opts[0];
    if (!target) return { ok: false, reason: 'Fully upgraded', max: true };
    // a building on a grown plot is that much bigger, and so is its upgrade;
    // one not yet built out across it stays its own size unless the new
    // building fills the plot
    const fills = !!target.extend || baseAreaOf(target.type) >= fw(b) * fd(b);
    const k = b.spare && !fills ? sizeKFor(target.type, b.spare.w, b.spare.d) : sizeKFor(target.type, fw(b), fd(b));
    const next = scaledLevel(BUILDINGS[target.type].levels[target.level], k);
    // extending costs what the building is worth, times how much bigger it gets
    let price = next.cost;
    if (target.extend) {
      let v = 0;
      for (let l = 0; l <= b.level; l++) v += BUILDINGS[b.type].levels[l].cost;
      price = Math.max(20, Math.round(v * (k - sizeK(b))));
    }
    const restyle = look !== undefined && (look || null) !== (b.look || null) ? Math.round(price * RESTYLE) : 0;
    const cost = price + restyle;
    if (b.con) return { ok: false, reason: 'Construction under way', busy: true, next, target, cost, restyle, reqs: [] };
    const unlock = target.extend ? 0 : unlockOf(target.type, target.level);
    const tech = target.extend ? null : techForLevel(target.type, target.level);
    const reqs = [];
    const free = this.sandbox.freeUpgrades;
    if (free) reqs.push({ label: 'Sandbox: no requirements', met: true });
    if (unlock && !free) reqs.push({ label: `${unlock} villagers`, met: this.unlockPop >= unlock });
    if (next.req && !free && !target.extend) {
      if (next.req.happiness) reqs.push({ label: `Happiness ${next.req.happiness}%`, met: (b.happiness || 0) >= next.req.happiness });
      for (const s of ['water', 'health', 'education', 'safety', 'culture']) {
        if (next.req[s]) reqs.push({ label: `${s[0].toUpperCase() + s.slice(1)} coverage`, met: !!(b.factors && b.factors[s]) });
      }
      if (next.req.power) reqs.push({ label: 'Electricity', met: !!b.powered });
    }
    if (tech) reqs.unshift({ label: `Research: ${this.techName(tech)}`, met: this.hasTech(tech), tech });
    // the bigger stages need a double plot: expand onto the plot next door
    // first; estates need a 2×2 plot, grown from a double plot
    if (fw(b) * fd(b) < baseAreaOf(target.type)) {
      const grounds = plotName(baseAreaOf(target.type));
      reqs.unshift(BUILDINGS[target.type].grand
        ? { label: `${grounds[0].toUpperCase()}${grounds.slice(1)} — grow the ${BUILDINGS[target.type].seat ? 'seat' : 'park'} onto the land round it first`, met: false, space: true }
        : BUILDINGS[target.type].estate
          ? { label: 'A 2×2 estate — grow the double plot onto the two plots beside it first', met: false, space: true }
          : { label: 'A double plot — expand onto a neighbouring plot first', met: false, space: true });
    }
    reqs.push({ label: restyle ? `$${cost} (with $${restyle} for the new style)` : `$${cost}`, met: this.money >= cost });
    const ok = reqs.every(r => r.met);
    // residents of the households that won't fit in what it becomes
    const homes = capOf({ ...b, type: target.type, level: target.level, spare: fills ? undefined : b.spare }, 'housing');
    const moveOut = (b.residents || []).length > homes ? this.movingOut(b, homes).length : 0;
    return { ok, next, target, cost, restyle, reqs, moveOut, reason: ok ? null : 'Requirements not met' };
  }

  // A home or shop can take on a new style without being upgraded: builders
  // rebuild its fronts and roof, for the same share of what it is worth as a
  // new style costs on an upgrade (RESTYLE).
  restyleCheck(b, look) {
    if (!b) return { ok: false, reason: 'That building is gone' };
    const def = BUILDINGS[b.type];
    if (def.cat !== 'residential' && def.cat !== 'commercial') return { ok: false, reason: "Only homes and shops come in styles" };
    const cost = Math.max(30, Math.round(this.buildValue(b) * RESTYLE));
    if (b.con) return { ok: false, reason: 'Construction under way', cost };
    if ((look || null) === (b.look || null)) return { ok: false, reason: 'It is in that style already', cost };
    if (look && !this.hasTech(STYLE_TECH_OF(look))) return { ok: false, reason: 'Research that style first', cost };
    if (this.money < cost) return { ok: false, reason: 'Not enough money', cost };
    return { ok: true, cost };
  }

  // A planting replanted, or a monument reworked, as another of its kinds
  // (KINDS, kept in b.flavor): builders do it, for a share of what it is
  // worth (REKIND), keeping its level.
  kindCheck(b, key) {
    const K = b && KINDS[b.type];
    if (!K) return { ok: false, reason: 'It only comes in one kind' };
    const cost = BUILDINGS[b.type].seat ? Math.round(seatWorth(b) * SEAT_RESTYLE) : Math.max(20, Math.round(this.buildValue(b) * REKIND));
    if (typeof key !== 'string' || !Object.hasOwn(K, key)) return { ok: false, reason: 'There is no such kind', cost };
    if (b.con) return { ok: false, reason: 'Construction under way', cost };
    if (kindOf(b) === key) return { ok: false, reason: BUILDINGS[b.type].seat ? 'It is in that style already' : `It is ${K[key].name.toLowerCase()} already`, cost };
    if (!this.hasTech(K[key].tech)) return { ok: false, reason: `Research ${this.techName(K[key].tech)} first`, cost };
    if (this.money < cost) return { ok: false, reason: 'Not enough money', cost };
    return { ok: true, cost };
  }

  setKind(id, key) {
    const b = this.buildings.get(id), chk = this.kindCheck(b, key);
    if (!chk.ok) return chk;
    this.money -= chk.cost;
    if (this.sandbox.instantBuild) {
      b.flavor = key;
      this.emit('building:change', b);
      return { ok: true, building: b, cost: chk.cost, instant: true };
    }
    b.con = { kind: 'upgrade', to: b.level, toType: b.type, flavor: key, restyle: true, work: workNeeded(chk.cost, 'upgrade'), done: 0 };
    this.emit('building:change', b);
    return { ok: true, building: b, cost: chk.cost };
  }

  restyleBuilding(id, look) {
    const b = this.buildings.get(id), chk = this.restyleCheck(b, look);
    if (!chk.ok) return chk;
    this.money -= chk.cost;
    if (this.sandbox.instantBuild) {
      b.look = look || null;
      this.emit('building:change', b);
      return { ok: true, building: b, cost: chk.cost, instant: true };
    }
    b.con = { kind: 'upgrade', to: b.level, toType: b.type, look: look || null, restyle: true, work: workNeeded(chk.cost, 'upgrade'), done: 0 };
    this.emit('building:change', b);
    return { ok: true, building: b, cost: chk.cost };
  }

  upgradeBuilding(id, toType = null, look = undefined) {
    if (look && !this.hasTech(STYLE_TECH_OF(look))) look = undefined;
    const b = this.buildings.get(id);
    if (!b) return { ok: false };
    const chk = this.upgradeCheck(b, toType, look);
    if (!chk.ok) return chk;
    this.money -= chk.cost;
    const { type, level } = chk.target;
    const flavor = this._grownFlavor(b, chk.target);
    if (this.sandbox.instantBuild) {
      const homes = capOf(b, 'housing');
      b.type = type;
      b.level = level;
      if (look !== undefined) b.look = look;
      if (flavor !== undefined) b.flavor = flavor;
      this._fill(b, chk.target.extend);
      if (!hasFields(b.type)) this._dropFields(b);
      this.emit('building:change', b);
      this._shrunk(b, homes);
      return { ok: true, building: b, instant: true };
    }
    b.con = { kind: 'upgrade', to: level, toType: type, work: workNeeded(chk.cost, 'upgrade'), done: 0 };
    if (chk.target.extend) b.con.extend = true;
    if (look !== undefined) b.con.look = look;
    if (flavor !== undefined) b.con.flavor = flavor;
    this.emit('building:change', b);
    return { ok: true, building: b };
  }

  // What a park rebuilt on its bigger plot keeps of what it was (b.flavor):
  // grounds are laid out round the 2×2 park they grew from, and a park
  // rebuilt from a little one with a feature of its own keeps the feature.
  // undefined: as it is.
  _grownFlavor(b, target) {
    if (!BUILDINGS[b.type].park) return undefined;
    if (target.grand) {
      // the park it was, at its level, in the corner it stands in (see parkOrigin)
      const at = b.spare && b.spare.sx != null ? `@${b.spare.sx},${b.spare.sz}` : '';
      return `${b.type}#${b.level}${at}${b.flavor ? `/${b.flavor}` : ''}`;
    }
    if (target.large) return parkFeature(target.type, [b.type]);
    return undefined;
  }

  removeBuilding(id, refund = 0.25) {
    const b = this.buildings.get(id);
    if (!b) return;
    // demolishing a building that was being taken down for a move: the new
    // plot gets on with it using fresh materials
    if (b.con && b.con.kind === 'dismantle') {
      const dest = this.buildings.get(b.con.dest);
      if (dest && dest.con && dest.con.wait) dest.con.wait = null;
    }
    this._dissolveLeases(b);
    this._dropFields(b);
    for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) this.buildingAt[this.idx(b.x + dx, b.z + dz)] = -1;
    this.buildings.delete(id);
    const def = BUILDINGS[b.type];
    let value = 0;
    for (let l = 0; l <= b.level; l++) value += def.levels[l].cost;
    this.money += Math.round(value * sizeK(b) * refund);
    this.emit('building:remove', b);
    this._updateFronts();
    if (def.stop) {
      let changed = false;
      for (const line of this.lines) {
        const n = line.stops.length;
        line.stops = line.stops.filter(s => s !== id);
        if (line.stops.length !== n) changed = true;
      }
      if (changed) this.emit('lines');
    }
  }

  // ---------------------------------------------------------------- rails
  checkRail(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    const i = this.idx(x, z);
    const t = this.terrain;
    if (this.buildingAt[i] >= 0) return { ok: false, reason: 'A building is in the way' };
    if (this.fields[i] >= 0) return { ok: false, reason: 'Farm fields are in the way: take them out of the farm first' };
    if (this.rails[i]) return { ok: true, cost: 0, noop: true };
    const water = t.isWater(x, z);
    if (!water && t.slope(x, z) > 0.6) return { ok: false, reason: 'Too steep for track' };
    if (water && t.tileAvg(x, z) < -0.9) return { ok: false, reason: 'Water too deep' };
    if (this.unlockPop < 25) return { ok: false, reason: 'Railways unlock at 25 villagers' };
    if (!this.hasTech('railways')) return { ok: false, reason: 'Research Railways first' };
    let cost = RAIL_COST * (water ? BRIDGE_MULT : 1) + this.treeCount[i] * CLEAR_COST;
    return { ok: true, cost, water };
  }

  placeRails(tiles) {
    let placed = 0, spent = 0, failed = null;
    for (const [x, z] of tiles) {
      const c = this.checkRail(x, z);
      if (!c.ok) { failed ||= c.reason; continue; }
      if (c.noop) continue;
      if (this.money < c.cost) { failed = 'Not enough money'; break; }
      this.money -= c.cost; spent += c.cost; placed++;
      this.rails[this.idx(x, z)] = 1;
      this._clearTrees(x, z);
      this._clearTreesNear(x, z, 1, 1, 0.2);
    }
    if (placed) { this._boulevards(true); this.updateRailLinks(); this.emit('trees'); }
    return { placed, spent, failed };
  }

  removeRail(x, z) {
    if (!this.railAt(x, z)) return false;
    this.rails[this.idx(x, z)] = 0;
    this._boulevards(true);
    this.updateRailLinks();
    return true;
  }

  updateRailLinks() {
    this._boulevards();   // a level crossing breaks a boulevard's median
    for (const b of this.buildings.values()) {
      if (!BUILDINGS[b.type].needsRail) continue;
      const r = this.findRail(b.x, b.z, fw(b), fd(b));
      const changed = !!r !== !!b.rail || (r && b.rail && (r.x !== b.rail.x || r.z !== b.rail.z));
      b.rail = r ? { x: r.x, z: r.z, dir: r.dir } : null;
      if (changed) this.emit('building:change', b);
    }
    this.emit('rails');
  }

  // ---------------------------------------------------------------- roads
  checkRoad(x, z, level, opts = {}) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    const i = this.idx(x, z);
    const t = this.terrain;
    if (this.buildingAt[i] >= 0) return { ok: false, reason: 'A building is in the way' };
    if (this.fields[i] >= 0) return { ok: false, reason: 'Farm fields are in the way: take them out of the farm first' };
    const water = t.isWater(x, z);
    if (!water && t.slope(x, z) > 0.85) return { ok: false, reason: 'Too steep for a road' };
    if (water && t.tileAvg(x, z) < -0.9) return { ok: false, reason: 'Water too deep' };
    if (!opts.ignoreUnlock && this.unlockPop < ROAD_LEVELS[level].unlock) return { ok: false, reason: `Unlocks at ${ROAD_LEVELS[level].unlock} villagers` };
    const cur = this.roads[i];
    if (cur >= level) return { ok: true, cost: 0, noop: true };
    let cost = ROAD_LEVELS[level].cost - (cur ? ROAD_LEVELS[cur].cost : 0);
    if (water) cost *= BRIDGE_MULT;
    if (!cur) cost += this.treeCount[i] * CLEAR_COST;
    return { ok: true, cost, water };
  }

  // What laying a drag of road would do, tile by tile (as checkRoad). A step
  // across a corner is a diagonal (see diagonal.js), whose band passes over
  // the corners of the two tiles beside it, so only a building that can turn
  // to face it may stand there. A tile whose step in is refused isn't laid
  // (or, already road, isn't linked): { ok, reason, cost, noop, step }.
  checkStroke(tiles, level) {
    const out = tiles.map(([x, z]) => ({ ...this.checkRoad(x, z, level), step: true }));
    for (let n = 1; n < tiles.length; n++) {
      const [ax, az] = tiles[n - 1], [bx, bz] = tiles[n];
      if (cornerTo(ax, az, bx, bz) < 0) continue;
      const why = this._diagBlock(ax, az, bx, bz);
      if (!why) continue;
      out[n].step = false;
      if (out[n].ok && !out[n].noop) Object.assign(out[n], { ok: false, reason: why });
    }
    return out;
  }

  // Why a diagonal can't run from tile a to tile b (across their shared
  // corner), or null.
  _diagBlock(ax, az, bx, bz) {
    const t = this.terrain;
    if (!this.inBounds(ax, az) || !this.inBounds(bx, bz)) return 'Out of bounds';
    if (t.isWater(ax, az) || t.isWater(bx, bz)) return 'Bridges run along the grid, not diagonally';
    for (const [x, z] of [[bx, az], [ax, bz]]) {
      const o = this.buildingOn(x, z);
      if (o && !diagCapable(o)) return `The ${BUILDINGS[o.type].levels[o.level].name.toLowerCase()} on the corner is in the way`;
      if (this.fields[this.idx(x, z)] >= 0) return 'Farm fields are in the way: take them out of the farm first';
    }
    return null;
  }

  // Lay road on these tiles at this level (a lesser road is upgraded). With
  // opts.stroke the tiles are a drag, in order, and are linked as it runs:
  // diagonally where it steps across a corner (see diagonal.js).
  placeRoads(tiles, level, opts = {}) {
    const stroke = !!opts.stroke && isStroke(tiles);
    const plan = stroke ? this.checkStroke(tiles, level) : null;
    let placed = 0, spent = 0, failed = null;
    const fresh = new Set();
    for (let n = 0; n < tiles.length; n++) {
      const [x, z] = tiles[n];
      const c = plan ? plan[n] : this.checkRoad(x, z, level);
      if (!c.ok) { failed ||= c.reason; continue; }
      if (c.noop) continue;
      if (this.money < c.cost) { failed = 'Not enough money'; break; }
      this.money -= c.cost; spent += c.cost; placed++;
      if (!this.roads[this.idx(x, z)]) fresh.add(this.idx(x, z));
      this.roads[this.idx(x, z)] = level;
      this._clearTrees(x, z);
    }
    let linked = 0;
    if (stroke) {
      const before = this.diag.slice();
      // link each run of steps that weren't refused
      let from = 0;
      for (let n = 1; n <= tiles.length; n++) {
        if (n < tiles.length && plan[n].step) continue;
        if (n - from > 1) linkStroke(this, tiles.slice(from, n), fresh);
        from = n;
      }
      tidyDiag(this);
      for (let i = 0; i < before.length; i++) if (before[i] !== this.diag[i]) linked++;
      // trees in the way where a diagonal passes the corners beside it
      for (let n = 1; n < tiles.length; n++) {
        const [ax, az] = tiles[n - 1], [bx, bz] = tiles[n], k = cornerTo(ax, az, bx, bz);
        if (k < 0 || !diagLinked(this, ax, az, k)) continue;
        this._clearTreesNear(Math.max(ax, bx) - 0.4, Math.max(az, bz) - 0.4, 0.8, 0.8, 0);
      }
    }
    if (placed || linked) { this._boulevards(true); this.updateRoadNetwork(); this.emit('trees'); }
    return { placed, spent, failed, linked };
  }

  removeRoad(x, z) {
    const L = this.roadAt(x, z);
    if (!L) return false;
    if (x === this.entry.x && z === this.entry.z) return 'The road to the outside world must stay';
    this.roads[this.idx(x, z)] = 0;
    this.diag[this.idx(x, z)] = 0;
    this.money += roadRefund(L, 0, this.terrain.isWater(x, z)) + dressRefundAll(this.dress[this.idx(x, z)]);
    this.buried[this.idx(x, z)] = 0;
    this.dress[this.idx(x, z)] = 0;
    this._boulevards(true);
    this.updateRoadNetwork();
    return true;
  }

  // Boulevards come from the road layout (see boulevard.js): worked out
  // again whenever the roads or the track change, and never saved or sent.
  // A look that no longer suits its tile goes: a boulevard's where its
  // second road was taken up or a street now crosses, a planted median
  // where a second road was laid alongside. pay: a quarter of its price
  // back (when the player changed the roads; loads and guests just tidy up).
  _boulevards(pay = false) {
    tidyDiag(this);   // (the roads have changed: the diagonals first)
    this.blvd = findBoulevards(this, this.roads, this.blvd);
    let back = 0, gone = false;
    for (let i = 0; i < this.dress.length; i++) {
      const v = this.dress[i];
      if (!v) continue;
      let s = streetPart(v), l = lookPart(v);
      if (s && !dressFits(this, i, s)) { back += dressRefund(s); s = 0; }
      if (l && !dressFits(this, i, l)) { back += dressRefund(l); l = 0; }
      if (packDress(s, l) === v) continue;
      this.dress[i] = packDress(s, l);
      gone = true;
    }
    if (pay) this.money += back;
    if (gone) this.emit('dress');
    return back;
  }

  // ---------------------------------------------------- buried power lines
  // The street through (x, z): the straight runs of road along it, both
  // ways at a crossing.
  streetTiles(x, z) {
    if (!this.roadAt(x, z)) return [];
    const out = [[x, z]];
    for (const [dx, dz] of DIRS) for (let k = 1; this.roadAt(x + dx * k, z + dz * k); k++) out.push([x + dx * k, z + dz * k]);
    return out;
  }

  // Lay the power lines under the given road tiles (Underground Cables):
  // their poles and wires come down, and the street looks the better for it.
  buryCost(tiles) {
    return tiles.filter(([x, z]) => this.roadAt(x, z) && !this.buried[this.idx(x, z)]).length * BURY_COST;
  }

  buryLines(tiles) {
    if (!this.hasTech('cables')) return { ok: false, reason: `Research ${this.techName('cables')} first` };
    const todo = tiles.filter(([x, z]) => this.roadAt(x, z) && !this.buried[this.idx(x, z)]);
    if (!todo.length) return { ok: false, reason: 'Those lines are already underground' };
    const cost = todo.length * BURY_COST;
    if (this.money < cost) return { ok: false, reason: 'Not enough money' };
    this.money -= cost;
    for (const [x, z] of todo) this.buried[this.idx(x, z)] = 1;
    this.emit('lines');
    return { ok: true, n: todo.length, cost };
  }

  updateRoadNetwork() {
    const N = this.N;
    this._boulevards();
    this.connected.fill(0);
    const q = [];
    const e = this.idx(this.entry.x, this.entry.z);
    if (this.roads[e]) { this.connected[e] = 1; q.push(e); }
    const D = this.diag;
    while (q.length) {
      const i = q.pop();
      const x = i % N, z = (i / N) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + SIDES[k][0], nz = z + SIDES[k][1];
        if (!this.inBounds(nx, nz)) continue;
        const ni = nz * N + nx;
        // (not where a diagonal passes by, cut off from it)
        if (this.roads[ni] && !this.connected[ni] && !(D[i] & (CUT << k)) && !(D[ni] & (CUT << ((k + 2) & 3)))) { this.connected[ni] = 1; q.push(ni); }
      }
      if (D[i] & 15) for (let k = 0; k < 4; k++) {
        if (!(D[i] & (1 << k))) continue;
        const nx = x + CORNERS[k][0], nz = z + CORNERS[k][1];
        if (!this.inBounds(nx, nz)) continue;
        const ni = nz * N + nx;
        if (this.roads[ni] && !this.connected[ni] && (D[ni] & (1 << ((k + 2) & 3)))) { this.connected[ni] = 1; q.push(ni); }
      }
    }
    for (const b of this.buildings.values()) {
      let acc = this.findAccess(b.x, b.z, fw(b), fd(b));
      // facing a diagonal: one of the two road tiles it links
      const dq = this._diagOf(b);
      if (dq >= 0) { const pair = this._diagPair(b, dq); acc = acc.filter(a => pair.some(([x, z]) => x === a.x && z === a.z)); }
      const keep = b.access && acc.find(a => a.x === b.access.x && a.z === b.access.z && (a.conn || !acc[0].conn));
      const pick = keep || acc[0] || null;
      b.access = pick ? { x: pick.x, z: pick.z } : null;
      b.connected = !!(pick && pick.conn);
    }
    this.emit('roads');
    this._updateFronts();
  }

  // -------------------------------------------------------------- terrain
  checkTerraform(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    for (let tz = z - 1; tz <= z + 1; tz++) for (let tx = x - 1; tx <= x + 1; tx++) {
      if (this.inBounds(tx, tz) && this.buildingAt[this.idx(tx, tz)] >= 0) return { ok: false, reason: 'Too close to a building' };
    }
    if (this.money < TERRAFORM_COST) return { ok: false, reason: 'Not enough money' };
    return { ok: true, cost: TERRAFORM_COST };
  }

  terraform(x, z, mode) {
    const c = this.checkTerraform(x, z);
    if (!c.ok) return c;
    const t = this.terrain;
    const corners = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    if (mode === 'flatten') {
      const avg = corners.reduce((s, [cx, cz]) => s + t.ch(cx, cz), 0) / 4;
      for (const [cx, cz] of corners) t.setCh(cx, cz, avg);
    } else {
      const d = mode === 'raise' ? 0.25 : -0.25;
      for (const [cx, cz] of corners) t.setCh(cx, cz, Math.max(-1.2, Math.min(4.5, t.ch(cx, cz) + d)));
    }
    this.money -= c.cost;
    this.updateRoadNetwork();
    this.emit('terrain', { x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1 });
    return { ok: true, cost: c.cost };
  }

  // ---------------------------------------------------------------- trees
  _clearTrees(x, z) {
    const i = this.idx(x, z);
    if (!this.treeCount[i]) return 0;
    const n = this.treeCount[i];
    this.trees = this.trees.filter(tr => tr.t !== i);
    this.treeCount[i] = 0;
    return n;
  }

  // Trees growing right up against a new wall or track would poke through it.
  _clearTreesNear(x, z, w, d, margin) {
    const x0 = x - margin, x1 = x + w + margin, z0 = z - margin, z1 = z + d + margin;
    const before = this.trees.length;
    this.trees = this.trees.filter((tr) => {
      if (tr.x < x0 || tr.x > x1 || tr.z < z0 || tr.z > z1) return true;
      this.treeCount[tr.t] = Math.max(0, this.treeCount[tr.t] - 1);
      return false;
    });
    return before - this.trees.length;
  }

  addTree(x, z, k, s, r) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!this.inBounds(tx, tz)) return;
    const i = this.idx(tx, tz);
    if (this.treeCount[i] >= 250) return;
    this.trees.push({ x, z, k, s, r, t: i });
    this.treeCount[i]++;
  }

  checkPlant(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    const i = this.idx(x, z);
    if (this.terrain.isWater(x, z)) return { ok: false, reason: "Trees don't grow in water" };
    if (this.roads[i] || this.buildingAt[i] >= 0) return { ok: false, reason: 'Occupied' };
    if (this.treeCount[i] >= 4) return { ok: false, reason: 'No room for more trees' };
    if (this.money < TREE_COST) return { ok: false, reason: 'Not enough money' };
    return { ok: true, cost: TREE_COST };
  }

  plantTree(x, z) {
    const c = this.checkPlant(x, z);
    if (!c.ok) return c;
    const r = Math.random;
    const h = this.terrain.tileAvg(x, z);
    const k = h > 1.6 ? (r() < 0.7 ? TREE.PINE : TREE.ROUND) : [TREE.ROUND, TREE.ROUND, TREE.BIRCH, TREE.PINE][(r() * 4) | 0];
    this.addTree(x + 0.2 + r() * 0.6, z + 0.2 + r() * 0.6, k, 0.75 + r() * 0.5, r() * Math.PI * 2);
    this.money -= c.cost;
    this.emit('trees');
    return { ok: true, cost: c.cost };
  }

  // ---------------------------------------------------------- bulldozing
  bulldoze(x, z) {
    if (!this.inBounds(x, z)) return { ok: false };
    const b = this.buildingOn(x, z);
    if (b) { const r = this.demolishBuilding(b.id); return { ok: r.ok, what: 'building', building: b, reason: r.reason }; }
    if (this.railAt(x, z)) { this.removeRail(x, z); return { ok: true, what: 'rail' }; }
    if (this.roadAt(x, z)) {
      const r = this.removeRoad(x, z);
      if (r !== true) return { ok: false, reason: r };
      return { ok: true, what: 'road' };
    }
    const i = this.idx(x, z);
    if (this.fields[i] >= 0) { const r = this.setFields(this.fields[i], [[x, z]], false); return { ok: r.ok, what: 'fields', reason: r.reason }; }
    if (this.treeCount[i]) {
      const cost = this.treeCount[i] * CLEAR_COST;
      if (this.money < cost) return { ok: false, reason: 'Not enough money' };
      this.money -= cost;
      this._clearTrees(x, z);
      this.emit('trees');
      return { ok: true, what: 'trees', cost };
    }
    return { ok: false };
  }

  // ------------------------------------------------------------ farmland
  // A farm works fields beyond its own plot: tiles of farmland touching the
  // plot or its other fields, as many as its level allows (FIELD_MAX). Each
  // is ploughed and fenced for FIELD_COST (and any trees cleared), adds
  // FIELD_JOBS jobs (capOf), and gives a quarter back when taken out.
  fieldMax(b) { return b && hasFields(b.type) ? CONFIG.FIELD_MAX[Math.min(b.level + (BUILDINGS[b.type].fieldsFrom || 0), CONFIG.FIELD_MAX.length - 1)] : 0; }

  // Why tile (x, z) can't become a field of farm b, or null.
  _fieldBlock(b, x, z) {
    if (!this.inBounds(x, z)) return 'Out of bounds';
    const i = this.idx(x, z), f = this.fields[i];
    if (f === b.id) return 'Already one of its fields';
    if (f >= 0) return "Another farm's field";
    if (this.terrain.isWater(x, z)) return 'Water';
    if (this.roads[i]) return 'A road';
    if (this.rails[i]) return 'Railway track';
    if (this.buildingAt[i] >= 0) return 'A building';
    if (this.terrain.slope(x, z) > 0.6) return 'Too steep to plough';
    if (aheadOf(b, x, z) > 0) return 'Fields go behind and beside it, not between it and the road';
    return null;
  }

  // What adding (add) or taking out these tiles would do for farm id:
  // { tiles: [{ x, z, i, reason }], n (tiles that change), cost, refund,
  // max, have, short }. New fields must touch the farm or its fields, or
  // other new fields that do, nearest first, up to its limit.
  planFields(id, list, add = true) {
    const b = this.buildings.get(id);
    const plan = { tiles: [], n: 0, cost: 0, refund: 0, max: this.fieldMax(b), have: b ? b.fields || 0 : 0, short: null };
    if (!b || !hasFields(b.type)) { plan.short = 'Only a farm has fields'; return plan; }
    if (b.con && b.con.kind !== 'upgrade') { plan.short = 'Not until the farm is built'; return plan; }
    const seen = new Set();
    for (const [x, z] of list) {
      if (!this.inBounds(x, z)) continue;
      const i = this.idx(x, z);
      if (seen.has(i)) continue;
      seen.add(i);
      plan.tiles.push({ x, z, i, reason: null });
    }
    if (!add) {
      for (const t of plan.tiles) {
        if (this.fields[t.i] !== id) { t.reason = 'Not one of its fields'; continue; }
        plan.n++; plan.refund += Math.round(CONFIG.FIELD_COST * 0.25);
      }
      return plan;
    }
    for (const t of plan.tiles) t.reason = this._fieldBlock(b, t.x, t.z);
    const open = new Map(plan.tiles.filter(t => !t.reason).map(t => [t.i, t]));
    const near = (x, z, test) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.inBounds(x + dx, z + dz) && test(this.idx(x + dx, z + dz)));
    const queue = [...open.values()].filter(t => near(t.x, t.z, j => this.buildingAt[j] === id || this.fields[j] === id)).sort((p, q) => aheadOf(b, p.x, p.z) - aheadOf(b, q.x, q.z));
    const reached = new Set(queue.map(t => t.i)), take = [];
    const room = Math.max(0, plan.max - plan.have);
    while (queue.length && take.length < room) {
      const t = queue.shift();
      take.push(t);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!this.inBounds(t.x + dx, t.z + dz)) continue;
        const j = this.idx(t.x + dx, t.z + dz);
        if (open.has(j) && !reached.has(j)) { reached.add(j); queue.push(open.get(j)); }
      }
    }
    const taken = new Set(take.map(t => t.i));
    for (const t of plan.tiles) {
      if (t.reason || taken.has(t.i)) continue;
      t.reason = reached.has(t.i) || room === 0 ? `It can work ${plan.max} fields at most` : 'Must touch the farm or its fields';
    }
    for (const t of take) { plan.n++; plan.cost += CONFIG.FIELD_COST + this.treeCount[t.i] * CLEAR_COST; }
    if (plan.n && plan.cost > this.money) plan.short = 'Not enough money';
    return plan;
  }

  setFields(id, list, add = true) {
    const plan = this.planFields(id, list, add);
    if (plan.short) return { ok: false, reason: plan.short };
    if (!plan.n) return { ok: false, reason: (plan.tiles.find(t => t.reason) || {}).reason || 'No fields there' };
    for (const t of plan.tiles) {
      if (t.reason) continue;
      if (add) { this.fields[t.i] = id; this._clearTrees(t.x, t.z); } else this.fields[t.i] = -1;
    }
    this.money += plan.refund - plan.cost;
    this._countFields();
    if (add) this.emit('trees');
    this.emit('fields');
    return { ok: true, n: plan.n, cost: plan.cost, refund: plan.refund, skipped: plan.tiles.length - plan.n };
  }

  // What a farm grows or raises (PRODUCE; kept in b.flavor). It changes the
  // look of its plot and fields, the hands it takes and what each earns.
  setProduce(id, key) {
    const b = this.buildings.get(id);
    if (!b || !hasFields(b.type)) return { ok: false, reason: 'Only a farm grows crops or keeps livestock' };
    if (!choosesProduce(b.type)) return { ok: false, reason: 'An orchard grows fruit' };
    if (typeof key !== 'string' || !Object.hasOwn(PRODUCE, key)) return { ok: false, reason: "A farm can't do that" };
    const flavor = key === 'mixed' ? null : key;
    if ((b.flavor || null) === flavor) return { ok: false, reason: `It already does: ${PRODUCE[key].name.toLowerCase()}` };
    b.flavor = flavor;
    this.emit('building:change', b);
    this.emit('fields');
    return { ok: true, produce: key };
  }

  // Each farm's fields (b.fields, fieldTiles) from the grid; fields of a
  // building that is no farm are dropped.
  _countFields() {
    this.fieldTiles = new Map();
    for (const b of this.buildings.values()) if (hasFields(b.type)) b.fields = 0;
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      if (f < 0) continue;
      const b = this.buildings.get(f);
      if (!b || !hasFields(b.type)) { this.fields[i] = -1; continue; }
      b.fields++;
      if (!this.fieldTiles.has(f)) this.fieldTiles.set(f, []);
      this.fieldTiles.get(f).push(i);
    }
  }

  // A farm's fields must reach its plot (through its other fields), up to
  // its limit, nearest first; any others go (after a town merge, say).
  _pruneFields() {
    const keep = new Uint8Array(this.fields.length);
    for (const b of this.buildings.values()) {
      if (!hasFields(b.type)) continue;
      const max = this.fieldMax(b), q = [];
      for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) q.push([b.x + dx, b.z + dz]);
      let n = 0;
      for (let k = 0; k < q.length && n < max; k++) {
        const [x, z] = q[k];
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ox, nz = z + oz;
          if (!this.inBounds(nx, nz)) continue;
          const j = this.idx(nx, nz);
          if (this.fields[j] !== b.id || keep[j] || n >= max) continue;
          keep[j] = 1; n++; q.push([nx, nz]);
        }
      }
    }
    for (let i = 0; i < this.fields.length; i++) if (this.fields[i] >= 0 && !keep[i]) this.fields[i] = -1;
    this._countFields();
  }

  // A plot laid over farm fields takes them out of their farms.
  _unfield(tiles) {
    let any = false;
    for (const [x, z] of tiles) {
      const i = this.idx(x, z);
      if (this.fields[i] >= 0) { this.fields[i] = -1; any = true; }
    }
    if (!any) return;
    this._countFields();
    this.emit('fields');
  }

  _dropFields(b) {
    let any = false;
    for (let i = 0; i < this.fields.length; i++) if (this.fields[i] === b.id) { this.fields[i] = -1; any = true; }
    if (!any) return;
    this._countFields();
    b.fields = 0;
    this.emit('fields');
  }

  // ------------------------------------------------------------ creation
  static createNew({ N = 48, seed, name, sandbox = null }) {
    const { terrain, start, entryPath } = generateTerrain(N, seed);
    const w = new World(N, seed, terrain);
    w.townName = name || 'Kinstead';
    w.townId = newTownId();
    if (sandbox) w.setSandbox(sandbox);
    for (const [x, z] of entryPath) w.roads[w.idx(x, z)] = 1;
    const last = entryPath[entryPath.length - 1];
    w.entry = { x: last[0], z: last[1] };
    w._layFoundingStreets(start, entryPath);
    w.updateRoadNetwork();
    w.generateNature(start);
    w._placeFoundingBuildings(start, entryPath);
    w.updateRoadNetwork();
    return w;
  }

  _layFoundingStreets(start, path) {
    const t = this.terrain;
    const first = path[1] || [start.x + 1, start.z];
    const dir = [Math.sign(first[0] - start.x), Math.sign(first[1] - start.z)];
    const perp = [dir[1], dir[0]];
    const extend = (d, len) => {
      for (let k = 1; k <= len; k++) {
        const x = start.x + d[0] * k, z = start.z + d[1] * k;
        if (!this.inBounds(x, z) || t.isWater(x, z) || t.slope(x, z) > 0.6) break;
        this.roads[this.idx(x, z)] = 1;
      }
    };
    extend(perp, 4);
    extend([-perp[0], -perp[1]], 4);
    extend([-dir[0], -dir[1]], 3);
  }

  _placeFoundingBuildings(start) {
    const spots = [];
    for (let z = start.z - 7; z <= start.z + 7; z++) for (let x = start.x - 7; x <= start.x + 7; x++) {
      if (this.inBounds(x, z)) spots.push([x, z, Math.hypot(x - start.x, z - start.z)]);
    }
    spots.sort((a, b) => a[2] - b[2]);
    const opts = { free: true, ignoreMoney: true, ignoreUnlock: true, instant: true };
    const place = (type, extra = {}) => {
      for (const [x, z] of spots) {
        const r = this.placeBuilding(type, x, z, { ...opts, ...extra });
        if (r.ok) return r.building;
      }
      return null;
    };
    place('townhall');
    place('well');
    place('builder');
    place('house');
    place('house');
    place('market');
  }

  generateNature(start) {
    const N = this.N, t = this.terrain;
    const rng = new RNG(this.seed + 404);
    const nF = makeNoise2D(this.seed + 303);
    const nK = makeNoise2D(this.seed + 505);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = this.idx(x, z);
        if (this.roads[i] || this.buildingAt[i] >= 0 || t.isWater(x, z)) continue;
        const h = t.tileAvg(x, z), slope = t.slope(x, z);
        const forest = fbm(nF, x * 0.085, z * 0.085, 3);
        const dStart = start ? Math.hypot(x - start.x, z - start.z) : 99;
        const nearStart = dStart < 8;
        let p = forest > 0.12 ? 0.5 + forest : 0.035;
        if (nearStart) p *= dStart < 5 ? 0 : 0.2;
        if (rng.chance(p)) {
          const count = forest > 0.35 && !nearStart ? rng.int(2, 3) : 1;
          for (let k = 0; k < count; k++) {
            const pinePref = h > 1.6 ? 0.8 : (nK(x * 0.1, z * 0.1) > 0.2 ? 0.6 : 0.15);
            const kind = rng.chance(pinePref) ? TREE.PINE : (rng.chance(0.2) ? TREE.BIRCH : TREE.ROUND);
            this.addTree(x + rng.float(0.15, 0.85), z + rng.float(0.15, 0.85), kind, rng.float(0.7, 1.25), rng.float(0, 6.28));
          }
        } else if (!nearStart && h < 0.35 && rng.chance(0.18)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), TREE.BUSH, rng.float(0.7, 1.2), rng.float(0, 6.28));
        }
        if ((slope > 0.45 || h > 2.2) && rng.chance(0.3)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), TREE.ROCK, rng.float(0.6, 1.4), rng.float(0, 6.28));
        } else if (!nearStart && rng.chance(0.02)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), rng.chance(0.5) ? TREE.ROCK : TREE.PEBBLE, rng.float(0.5, 1), rng.float(0, 6.28));
        }
        if (!nearStart && rng.chance(0.05)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), TREE.BUSH, rng.float(0.6, 1), rng.float(0, 6.28));
        }
      }
    }
  }
}

export function bridgeDeckY() { return CONFIG.WATER_LEVEL + 0.2; }
// length of the approach ramp onto a bridge, in tiles
export const RAMP = 0.5;

// Point on the shared edge between a building's footprint and its access road.
export function doorPoint(b) {
  if (!b.access) return { x: b.x + fw(b) / 2, z: b.z + fd(b) / 2 };
  // facing a diagonal: just short of the street, towards the corner it passes
  if (b.diag) { const [cx, cz] = CORNERS[b.diag - 1]; return { x: b.x + 0.5 + cx * 0.26, z: b.z + 0.5 + cz * 0.26 }; }
  const ax = b.access.x, az = b.access.z;
  const cx = Math.min(Math.max(ax, b.x), b.x + fw(b) - 1);
  const cz = Math.min(Math.max(az, b.z), b.z + fd(b) - 1);
  return { x: (ax + cx) / 2 + 0.5, z: (az + cz) / 2 + 0.5 };
}

export function buildingCenter(b) {
  return { x: b.x + fw(b) / 2, z: b.z + fd(b) / 2 };
}

// The seat of government (the town hall, or the Capitol or Parliament it
// grew into), or null.
export function seatOf(w) {
  for (const b of w.buildings.values()) if (BUILDINGS[b.type].seat) return b;
  return null;
}
// The civic quarter round the seat: the civic buildings (def.civic) open and
// on the roads with their middle within CIVIC_QUARTER.reach of the seat's,
// nearest first, the kinds of them there, and what they add to the town's
// taxes (CIVIC_QUARTER.tax a kind). { seat, members: [{ b, d }], kinds, tax }
export function civicQuarter(w, seat = seatOf(w)) {
  const out = { seat, members: [], kinds: [], tax: 0 };
  if (!seat || !isOpen(seat)) return out;
  const s = buildingCenter(seat);
  for (const b of w.buildings.values()) {
    if (!BUILDINGS[b.type].civic || !isOpen(b) || !b.connected) continue;
    const c = buildingCenter(b), d = Math.hypot(c.x - s.x, c.z - s.z);
    if (d <= CIVIC_QUARTER.reach) out.members.push({ b, d });
  }
  out.members.sort((p, q) => p.d - q.d || p.b.id - q.b.id);
  out.kinds = [...new Set(out.members.map(m => m.b.type))];
  out.tax = out.kinds.length * CIVIC_QUARTER.tax;
  return out;
}
