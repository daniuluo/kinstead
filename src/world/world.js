// World state and the rules for changing it (placing, upgrading, bulldozing).
// Rendering and simulation listen to the events emitted here.

import { CONFIG, ROAD_LEVELS, BRIDGE_MULT, TREE_COST, CLEAR_COST, TERRAFORM_COST } from '../config.js';
import { BUILDINGS, unlockOf, RAIL_COST } from '../defs.js';
import { generateTerrain } from './terrain.js';
import { RNG, hash2, makeNoise2D, fbm } from '../util/rng.js';

// rot index → direction the building faces (its door side)
export const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export const TREE = { PINE: 0, ROUND: 1, BIRCH: 2, BUSH: 3, ROCK: 4, PEBBLE: 5 };

export class World {
  constructor(N, seed, terrain) {
    this.N = N;
    this.seed = seed;
    this.terrain = terrain;
    this.roads = new Uint8Array(N * N);
    this.rails = new Uint8Array(N * N);
    this.lines = [];
    this.sandbox = { infiniteMoney: false, unlockAll: false };
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
    this.townName = 'Hearthvale';
    this.history = [];
    this.titleIdx = 0;
    this.stats = { visits: 0, visitIncome: 0, todayVisitIncome: 0, arrivals: 0, departures: 0 };
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

  // Walkable surface height (roads hover slightly, bridges float over water).
  walkHeight(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (this.inBounds(tx, tz) && this.roads[tz * this.N + tx] && this.terrain.isWater(tx, tz)) return bridgeDeckY();
    return Math.max(this.terrain.heightAt(x, z) + 0.03, CONFIG.WATER_LEVEL - 0.05);
  }

  // ------------------------------------------------------------ buildings
  findAccess(x, z, size) {
    const out = [];
    const push = (ax, az, rot) => {
      if (this.roadAt(ax, az)) out.push({ x: ax, z: az, rot, conn: this.connected[this.idx(ax, az)] });
    };
    for (let d = 0; d < size; d++) {
      push(x + d, z + size, 0);
      push(x + size, z + d, 1);
      push(x + d, z - 1, 2);
      push(x - 1, z + d, 3);
    }
    out.sort((a, b) => b.conn - a.conn);
    return out;
  }

  checkBuild(type, x, z, opts = {}) {
    const def = BUILDINGS[type];
    const size = def.size;
    const t = this.terrain;
    let reason = null;
    if (!opts.ignoreUnlock && this.unlockPop < unlockOf(type, 0)) reason = `Unlocks at ${unlockOf(type, 0)} villagers`;
    if (def.unique) for (const b of this.buildings.values()) if (b.type === type) { reason = 'Only one allowed'; break; }
    let minH = Infinity, maxH = -Infinity, trees = 0;
    for (let dz = 0; dz < size && !reason; dz++) {
      for (let dx = 0; dx < size; dx++) {
        const tx = x + dx, tz = z + dz;
        if (!this.inBounds(tx, tz)) { reason = 'Out of bounds'; break; }
        const i = this.idx(tx, tz);
        if (t.isWater(tx, tz)) { reason = "Can't build on water"; break; }
        if (this.roads[i]) { reason = 'A road is in the way'; break; }
        if (this.rails[i]) { reason = 'Railway track is in the way'; break; }
        if (this.buildingAt[i] >= 0) { reason = 'Occupied'; break; }
        minH = Math.min(minH, t.tileMin(tx, tz));
        maxH = Math.max(maxH, t.tileMax(tx, tz));
        trees += this.treeCount[i];
      }
    }
    if (!reason && maxH - minH > (size === 1 ? 0.9 : 1.1)) reason = 'Too steep here';
    const access = reason ? [] : this.findAccess(x, z, size);
    if (!reason && !def.park && !access.length) reason = 'Needs a road next to it';
    if (!reason && def.needsWater) {
      let wet = false;
      for (let d = -1; d <= size && !wet; d++) {
        for (const [ax, az] of [[x + d, z - 1], [x + d, z + size], [x - 1, z + d], [x + size, z + d]]) {
          if (this.inBounds(ax, az) && t.isWater(ax, az)) { wet = true; break; }
        }
      }
      if (!wet) reason = 'Must be next to water';
    }
    const rail = !reason && def.needsRail ? this.findRail(x, z, size) : null;
    if (!reason && def.needsRail && !rail) reason = 'Needs railway track next to it';
    const cost = def.levels[0].cost + trees * CLEAR_COST;
    if (!reason && !opts.ignoreMoney && this.money < cost) reason = 'Not enough coins';
    return { ok: !reason, reason, cost, access, minH, maxH, trees, rail };
  }

  findRail(x, z, size) {
    for (let d = 0; d < size; d++) {
      for (const [ax, az, dir] of [[x + d, z + size, 0], [x + size, z + d, 1], [x + d, z - 1, 2], [x - 1, z + d, 3]]) {
        if (this.railAt(ax, az)) return { x: ax, z: az, dir };
      }
    }
    return null;
  }

  placeBuilding(type, x, z, opts = {}) {
    const chk = this.checkBuild(type, x, z, opts);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const def = BUILDINGS[type];
    const variant = opts.variant ?? ((Math.random() * 1e9) | 0);
    const pick = chk.access.length ? chk.access[(opts.accessIndex || 0) % chk.access.length] : null;
    const b = {
      id: this.newId(), type, level: opts.level || 0, x, z, size: def.size,
      rot: pick ? pick.rot : variant % 4,
      variant,
      access: pick ? { x: pick.x, z: pick.z } : null,
      rail: chk.rail ? { x: chk.rail.x, z: chk.rail.z, dir: chk.rail.dir } : null,
      baseY: chk.maxH, minY: chk.minH,
      built: this.day,
      residents: [], workers: [],
      connected: false, happiness: 60, factors: null,
    };
    for (let dz = 0; dz < b.size; dz++) for (let dx = 0; dx < b.size; dx++) {
      const i = this.idx(x + dx, z + dz);
      this.buildingAt[i] = b.id;
      this._clearTrees(x + dx, z + dz);
    }
    if (!opts.free) this.money -= chk.cost;
    b.connected = !!(b.access && this.connected[this.idx(b.access.x, b.access.z)]);
    this.buildings.set(b.id, b);
    if (chk.trees) this.emit('trees');
    this.emit('building:add', b);
    return { ok: true, building: b, cost: chk.cost };
  }

  // Restore a building from a save without any checks.
  restoreBuilding(rec) {
    const def = BUILDINGS[rec.type];
    if (!def) return;
    const size = def.size;
    let minH = Infinity, maxH = -Infinity;
    for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
      minH = Math.min(minH, this.terrain.tileMin(rec.x + dx, rec.z + dz));
      maxH = Math.max(maxH, this.terrain.tileMax(rec.x + dx, rec.z + dz));
    }
    const b = {
      id: rec.id, type: rec.type, level: Math.min(rec.level, def.levels.length - 1), x: rec.x, z: rec.z, size,
      rot: rec.rot, variant: rec.variant, access: null, rail: null, baseY: maxH, minY: minH, built: rec.built || 1,
      residents: [], workers: [], connected: false, happiness: 60, factors: null,
    };
    for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) this.buildingAt[this.idx(rec.x + dx, rec.z + dz)] = b.id;
    this.buildings.set(b.id, b);
  }

  upgradeCheck(b) {
    const def = BUILDINGS[b.type];
    const next = def.levels[b.level + 1];
    if (!next) return { ok: false, reason: 'Fully upgraded', max: true };
    const unlock = unlockOf(b.type, b.level + 1);
    const reqs = [];
    if (unlock) reqs.push({ label: `${unlock} villagers`, met: this.unlockPop >= unlock });
    if (next.req) {
      if (next.req.happiness) reqs.push({ label: `Happiness ${next.req.happiness}%`, met: (b.happiness || 0) >= next.req.happiness });
      for (const s of ['water', 'health', 'education', 'safety', 'culture']) {
        if (next.req[s]) reqs.push({ label: `${s[0].toUpperCase() + s.slice(1)} coverage`, met: !!(b.factors && b.factors[s]) });
      }
    }
    reqs.push({ label: `${next.cost} coins`, met: this.money >= next.cost });
    const ok = reqs.every(r => r.met);
    return { ok, next, reqs, reason: ok ? null : 'Requirements not met' };
  }

  upgradeBuilding(id) {
    const b = this.buildings.get(id);
    if (!b) return { ok: false };
    const chk = this.upgradeCheck(b);
    if (!chk.ok) return chk;
    this.money -= chk.next.cost;
    b.level++;
    this.emit('building:change', b);
    return { ok: true, building: b };
  }

  removeBuilding(id, refund = 0.25) {
    const b = this.buildings.get(id);
    if (!b) return;
    for (let dz = 0; dz < b.size; dz++) for (let dx = 0; dx < b.size; dx++) this.buildingAt[this.idx(b.x + dx, b.z + dz)] = -1;
    this.buildings.delete(id);
    const def = BUILDINGS[b.type];
    let value = 0;
    for (let l = 0; l <= b.level; l++) value += def.levels[l].cost;
    this.money += Math.round(value * refund);
    this.emit('building:remove', b);
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
    if (this.rails[i]) return { ok: true, cost: 0, noop: true };
    const water = t.isWater(x, z);
    if (!water && t.slope(x, z) > 0.6) return { ok: false, reason: 'Too steep for track' };
    if (water && t.tileAvg(x, z) < -0.9) return { ok: false, reason: 'Water too deep' };
    if (this.unlockPop < 25) return { ok: false, reason: 'Railways unlock at 25 villagers' };
    let cost = RAIL_COST * (water ? BRIDGE_MULT : 1) + this.treeCount[i] * CLEAR_COST;
    return { ok: true, cost, water };
  }

  placeRails(tiles) {
    let placed = 0, spent = 0, failed = null;
    for (const [x, z] of tiles) {
      const c = this.checkRail(x, z);
      if (!c.ok) { failed ||= c.reason; continue; }
      if (c.noop) continue;
      if (this.money < c.cost) { failed = 'Not enough coins'; break; }
      this.money -= c.cost; spent += c.cost; placed++;
      this.rails[this.idx(x, z)] = 1;
      this._clearTrees(x, z);
    }
    if (placed) { this.updateRailLinks(); this.emit('trees'); }
    return { placed, spent, failed };
  }

  removeRail(x, z) {
    if (!this.railAt(x, z)) return false;
    this.rails[this.idx(x, z)] = 0;
    this.updateRailLinks();
    return true;
  }

  updateRailLinks() {
    for (const b of this.buildings.values()) {
      if (!BUILDINGS[b.type].needsRail) continue;
      const r = this.findRail(b.x, b.z, b.size);
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

  placeRoads(tiles, level) {
    let placed = 0, spent = 0, failed = null;
    for (const [x, z] of tiles) {
      const c = this.checkRoad(x, z, level);
      if (!c.ok) { failed ||= c.reason; continue; }
      if (c.noop) continue;
      if (this.money < c.cost) { failed = 'Not enough coins'; break; }
      this.money -= c.cost; spent += c.cost; placed++;
      this.roads[this.idx(x, z)] = level;
      this._clearTrees(x, z);
    }
    if (placed) { this.updateRoadNetwork(); this.emit('trees'); }
    return { placed, spent, failed };
  }

  removeRoad(x, z) {
    if (!this.roadAt(x, z)) return false;
    if (x === this.entry.x && z === this.entry.z) return 'The road to the outside world must stay';
    this.roads[this.idx(x, z)] = 0;
    this.updateRoadNetwork();
    return true;
  }

  updateRoadNetwork() {
    const N = this.N;
    this.connected.fill(0);
    const q = [];
    const e = this.idx(this.entry.x, this.entry.z);
    if (this.roads[e]) { this.connected[e] = 1; q.push(e); }
    while (q.length) {
      const i = q.pop();
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!this.inBounds(nx, nz)) continue;
        const ni = nz * N + nx;
        if (this.roads[ni] && !this.connected[ni]) { this.connected[ni] = 1; q.push(ni); }
      }
    }
    for (const b of this.buildings.values()) {
      const acc = this.findAccess(b.x, b.z, b.size);
      const keep = b.access && acc.find(a => a.x === b.access.x && a.z === b.access.z && (a.conn || !acc[0].conn));
      const pick = keep || acc[0] || null;
      b.access = pick ? { x: pick.x, z: pick.z } : null;
      b.connected = !!(pick && pick.conn);
    }
    this.emit('roads');
  }

  // -------------------------------------------------------------- terrain
  checkTerraform(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    for (let tz = z - 1; tz <= z + 1; tz++) for (let tx = x - 1; tx <= x + 1; tx++) {
      if (this.inBounds(tx, tz) && this.buildingAt[this.idx(tx, tz)] >= 0) return { ok: false, reason: 'Too close to a building' };
    }
    if (this.money < TERRAFORM_COST) return { ok: false, reason: 'Not enough coins' };
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
    if (this.money < TREE_COST) return { ok: false, reason: 'Not enough coins' };
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
    if (b) { this.removeBuilding(b.id); return { ok: true, what: 'building', building: b }; }
    if (this.railAt(x, z)) { this.removeRail(x, z); return { ok: true, what: 'rail' }; }
    if (this.roadAt(x, z)) {
      const r = this.removeRoad(x, z);
      if (r !== true) return { ok: false, reason: r };
      return { ok: true, what: 'road' };
    }
    const i = this.idx(x, z);
    if (this.treeCount[i]) {
      const cost = this.treeCount[i] * CLEAR_COST;
      if (this.money < cost) return { ok: false, reason: 'Not enough coins' };
      this.money -= cost;
      this._clearTrees(x, z);
      this.emit('trees');
      return { ok: true, what: 'trees', cost };
    }
    return { ok: false };
  }

  // ------------------------------------------------------------ creation
  static createNew({ N = 48, seed, name, sandbox = null }) {
    const { terrain, start, entryPath } = generateTerrain(N, seed);
    const w = new World(N, seed, terrain);
    w.townName = name || 'Hearthvale';
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
    const opts = { free: true, ignoreMoney: true, ignoreUnlock: true };
    const place = (type, extra = {}) => {
      for (const [x, z] of spots) {
        const r = this.placeBuilding(type, x, z, { ...opts, ...extra });
        if (r.ok) return r.building;
      }
      return null;
    };
    place('townhall');
    place('well');
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

// Point on the shared edge between a building's footprint and its access road.
export function doorPoint(b) {
  if (!b.access) return { x: b.x + b.size / 2, z: b.z + b.size / 2 };
  const ax = b.access.x, az = b.access.z;
  const cx = Math.min(Math.max(ax, b.x), b.x + b.size - 1);
  const cz = Math.min(Math.max(az, b.z), b.z + b.size - 1);
  return { x: (ax + cx) / 2 + 0.5, z: (az + cz) / 2 + 0.5 };
}

export function buildingCenter(b) {
  return { x: b.x + b.size / 2, z: b.z + b.size / 2 };
}
