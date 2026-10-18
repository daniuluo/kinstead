// Transit: horse-drawn coach lines on roads, steam trains on rails, and
// delivery carts trundling from farms and workshops to the shops.

import * as THREE from 'three';
import { BUILDINGS, TRANSIT, LINE_COLORS } from '../defs.js';
import { CONFIG } from '../config.js';
import { GeoBuilder } from '../render/geo.js';
import { MAT } from '../render/materials.js';
import { tilePolyline, smoothPolyline } from './path.js';
import { bridgeDeckY, isOpen } from '../world/world.js';

const WARM = [1.7, 1.2, 0.55];

function horse(gb, x, z, color = '#7a5232') {
  gb.push(x, 0, z, 0);
  gb.box(0, 0.075, 0, 0.07, 0.07, 0.17, color);
  gb.box(0, 0.12, 0.1, 0.045, 0.07, 0.05, color, 0, -0.5);
  gb.box(0, 0.15, 0.14, 0.04, 0.035, 0.07, color);
  gb.box(0, 0.12, 0.07, 0.012, 0.06, 0.05, '#3a2a1f', 0, -0.4);
  for (const [lx, lz] of [[-0.025, 0.06], [0.025, 0.06], [-0.025, -0.06], [0.025, -0.06]]) gb.box(lx, 0, lz, 0.018, 0.08, 0.018, color);
  gb.box(0, 0.09, -0.09, 0.012, 0.05, 0.012, '#3a2a1f', 0, 0.6);
  gb.pop();
}

function wheels(gb, z, w, r = 0.04, color = '#3a2a1f') {
  for (const sx of [-1, 1]) gb.cyl(sx * (w + 0.008), r, z, r, r, 0.015, 8, color, 0, 0, Math.PI / 2);
}

function coachModel(color) {
  const gb = new GeoBuilder();
  horse(gb, 0, 0.26);
  gb.box(0, 0.09, 0.16, 0.014, 0.014, 0.12, '#5b4231');
  gb.box(0, 0.06, -0.02, 0.2, 0.17, 0.34, color);
  gb.box(0, 0.23, -0.02, 0.22, 0.025, 0.37, '#3a3a3e');
  gb.box(0, 0.06, -0.02, 0.21, 0.025, 0.35, '#3a2a1f');
  for (const sx of [-1, 1]) for (const z of [-0.1, 0.05]) {
    gb.glow(WARM[0], WARM[1], WARM[2], 1.15);
    gb.box(sx * 0.101, 0.13, z, 0.006, 0.06, 0.09, '#34475b');
    gb.noGlow();
  }
  gb.box(0, 0.2, 0.15, 0.12, 0.012, 0.06, '#3a2a1f');
  gb.cyl(0, 0.212, 0.14, 0.022, 0.026, 0.05, 6, '#2f3640');
  gb.sphere(0, 0.275, 0.14, 0.02, '#f1c8a5');
  gb.cyl(0, 0.29, 0.14, 0.028, 0.028, 0.012, 8, '#2b1d14');
  wheels(gb, 0.08, 0.11); wheels(gb, -0.12, 0.11, 0.05);
  gb.glow(2.2, 1.6, 0.8, 3.0); gb.box(0.11, 0.16, 0.13, 0.02, 0.03, 0.02, '#ffe2a0'); gb.noGlow();
  return gb.build();
}

function cartModel(cargo) {
  const gb = new GeoBuilder();
  horse(gb, 0, 0.22, '#8a6542');
  gb.box(0, 0.06, -0.04, 0.17, 0.05, 0.26, '#8a6542');
  for (const sx of [-1, 1]) gb.box(sx * 0.085, 0.11, -0.04, 0.01, 0.04, 0.26, '#7a5636');
  gb.box(0, 0.11, -0.17, 0.17, 0.04, 0.01, '#7a5636');
  if (cargo === 'logs') for (let i = 0; i < 3; i++) gb.cyl(-0.05 + i * 0.05, 0.13, -0.17, 0.022, 0.022, 0.26, 6, '#7a5636', 0, Math.PI / 2);
  else if (cargo === 'hay') gb.blob(0, 0.14, -0.04, 0.08, 0.06, 0.12, '#d9b44a');
  else if (cargo === 'fish') { gb.box(0, 0.11, -0.04, 0.14, 0.04, 0.2, '#9fb2bd'); }
  else if (cargo === 'materials') {
    // a building on the move: beams, stone blocks and a stack of roof tiles
    for (let i = 0; i < 3; i++) gb.box(-0.045 + i * 0.045, 0.11, -0.04, 0.035, 0.03, 0.3, '#a8855a');
    for (let i = 0; i < 2; i++) gb.box(0, 0.14 + i * 0.035, -0.12 + i * 0.03, 0.12, 0.035, 0.06, '#b3a996');
    gb.box(0, 0.14, 0.03, 0.1, 0.05, 0.07, '#9c4a32');
  }
  else for (let i = 0; i < 3; i++) gb.box(0, 0.11 + (i % 2) * 0.05, -0.12 + i * 0.07, 0.07, 0.05, 0.06, '#a47c4f');
  gb.box(0, 0.09, 0.12, 0.012, 0.012, 0.1, '#5b4231');
  wheels(gb, -0.04, 0.095, 0.045);
  return gb.build();
}

function engineModel() {
  const gb = new GeoBuilder();
  gb.box(0, 0.035, 0, 0.17, 0.03, 0.46, '#2c2c30');
  gb.cyl(0, 0.13, -0.1, 0.07, 0.07, 0.3, 10, '#2f5a3a', 0, Math.PI / 2);
  gb.cyl(0, 0.13, 0.181, 0.06, 0.06, 0.012, 10, '#2c2c30', 0, Math.PI / 2);
  gb.cyl(0, 0.19, 0.14, 0.022, 0.03, 0.09, 8, '#2c2c30');
  gb.cyl(0, 0.2, 0.0, 0.025, 0.025, 0.035, 8, '#c9a43a');
  gb.box(0, 0.065, -0.17, 0.18, 0.2, 0.13, '#2f5a3a');
  gb.box(0, 0.265, -0.17, 0.2, 0.02, 0.16, '#2c2c30');
  for (const sx of [-1, 1]) { gb.glow(WARM[0], WARM[1], WARM[2], 1.1); gb.box(sx * 0.091, 0.17, -0.17, 0.006, 0.05, 0.06, '#34475b'); gb.noGlow(); }
  gb.box(0, 0.035, 0.24, 0.17, 0.03, 0.03, '#b5533a');
  gb.glow(2.4, 1.9, 1.0, 3.0); gb.cyl(0, 0.12, 0.19, 0.022, 0.022, 0.01, 8, '#ffe2a0', 0, Math.PI / 2); gb.noGlow();
  for (const z of [0.13, 0.0, -0.13]) wheels(gb, z, 0.075, 0.042, '#a8432f');
  return gb.build();
}

function carriageModel(color) {
  const gb = new GeoBuilder();
  gb.box(0, 0.03, 0, 0.17, 0.03, 0.5, '#2c2c30');
  gb.box(0, 0.06, 0, 0.18, 0.17, 0.48, color);
  gb.roof(0, 0.23, 0, 0.5, 0.2, 0.04, 0.5, '#4a4a50', Math.PI / 2);
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    gb.glow(WARM[0], WARM[1], WARM[2], 1.05 + k * 0.05);
    gb.box(sx * 0.091, 0.13, -0.17 + k * 0.115, 0.006, 0.06, 0.07, '#34475b');
    gb.noGlow();
  }
  for (const z of [0.16, -0.16]) wheels(gb, z, 0.075, 0.035, '#2c2c30');
  return gb.build();
}

const CARGO = { farm: 'hay', lumber: 'logs', fishery: 'fish', workshop: 'crates' };
const CAR_SPACING = 0.56;   // distance between train car centres along the track
const STEP = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export class Transit {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = game.renderer.scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.vehicles = [];
    this.carts = [];
    this.routes = new Map();
    this.waiting = new Map();
    this.riders = new Map();
    this.cartPlan = [];
    this.dirty = true;
    this.geoCache = new Map();
    const mark = () => { this.dirty = true; };
    for (const e of ['roads', 'rails', 'lines', 'building:remove', 'building:add', 'building:change']) this.world.on(e, mark);
    this.stats = {};
  }

  // ----------------------------------------------------------- line admin
  stopsOfMode(mode) {
    const type = TRANSIT[mode].stopType;
    return [...this.world.buildings.values()].filter(b => b.type === type);
  }

  createLine(mode, stops) {
    const w = this.world;
    const cfg = TRANSIT[mode];
    if (stops.length < 2) return { ok: false, reason: 'A line needs at least two stops' };
    const site = stops.map(id => w.buildings.get(id)).find(b => b && !isOpen(b));
    if (site) return { ok: false, reason: `The ${BUILDINGS[site.type].levels[site.level].name.toLowerCase()} is still being built` };
    if (w.money < cfg.vehicleCost) return { ok: false, reason: 'Not enough coins' };
    const used = new Set(w.lines.map(l => l.color));
    const color = LINE_COLORS.find(c => !used.has(c)) || LINE_COLORS[w.lines.length % LINE_COLORS.length];
    const n = w.lines.filter(l => l.mode === mode).length + 1;
    const line = { id: w.newId(), mode, name: `${mode === 'rail' ? 'Rail' : 'Coach'} Line ${n}`, color, stops: stops.slice(), vehicles: 1 };
    const route = this._route(line);
    if (!route) return { ok: false, reason: mode === 'rail' ? "Trains can't reverse: join the stations with a loop of track" : 'Stops are not connected by road' };
    w.money -= cfg.vehicleCost;
    w.lines.push(line);
    w.emit('lines');
    return { ok: true, line };
  }

  deleteLine(id) {
    const w = this.world;
    const line = w.lines.find(l => l.id === id);
    if (!line) return;
    w.lines = w.lines.filter(l => l !== line);
    for (const v of this.vehicles.filter(v => v.line === line)) this._removeVehicle(v);
    for (const [stop, list] of this.waiting) this.waiting.set(stop, list.filter(q => { if (q.plan.line === line) { this._giveUp(q); return false; } return true; }));
    w.emit('lines');
  }

  setVehicles(id, n) {
    const w = this.world;
    const line = w.lines.find(l => l.id === id);
    if (!line) return { ok: false };
    n = Math.max(1, Math.min(line.mode === 'rail' ? 3 : 5, n));
    if (n === line.vehicles) return { ok: false, reason: null };
    if (n > line.vehicles) {
      const cost = TRANSIT[line.mode].vehicleCost;
      if (w.money < cost) return { ok: false, reason: 'Not enough coins' };
      w.money -= cost;
    }
    line.vehicles = n;
    w.emit('lines');
    return { ok: true };
  }

  // ------------------------------------------------------------ routing
  _stopTile(b, mode) { return mode === 'rail' ? b.rail : b.access; }

  _route(line) {
    const w = this.world, paths = this.game.paths;
    const stops = line.stops.map(id => w.buildings.get(id)).filter(Boolean);
    if (stops.length < 2) return null;
    const stopTiles = stops.map(b => this._stopTile(b, line.mode));
    if (stopTiles.some(t => !t)) return null;
    let tiles = [];
    let stopIdx = [];
    if (line.mode === 'rail') {
      const loop = this._railLoop(stopTiles);
      if (!loop) return null;
      ({ tiles, stopIdx } = loop);
    } else {
      for (let i = 0; i < stops.length; i++) {
        const a = stopTiles[i], b = stopTiles[(i + 1) % stops.length];
        const leg = paths.road(a.x, a.z, b.x, b.z);
        if (!leg) return null;
        stopIdx.push(tiles.length ? tiles.length - 1 : 0);
        tiles = tiles.length ? tiles.concat(leg.slice(1)) : leg.slice();
      }
    }
    const rail = line.mode === 'rail';
    let pts = tilePolyline(tiles, rail ? 0 : 0.17);
    pts = smoothPolyline(pts, rail ? 0.5 : 0.3, rail ? 6 : 4);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const length = cum[cum.length - 1];
    if (length < 0.5) return null;
    // locate each stop along the polyline, in order
    const marks = [];
    let from = 0;
    for (let i = 0; i < stops.length; i++) {
      const tl = tiles[stopIdx[i]];
      const cx = tl[0] + 0.5, cz = tl[1] + 0.5;
      let best = from, bd = Infinity;
      for (let k = from; k < pts.length; k++) {
        const d = Math.hypot(pts[k][0] - cx, pts[k][1] - cz);
        if (d < bd) { bd = d; best = k; }
        if (d > bd + 3) break;
      }
      marks.push({ stop: stops[i].id, s: cum[best] });
      from = best;
    }
    return { pts, cum, length, marks, mode: line.mode };
  }

  // A closed route through every station (in order) that a train can drive
  // without ever reversing: a search over (tile, direction of travel) that
  // never allows a U-turn, and that must come back into the first station
  // heading the same way it set off. Null if the track has no such loop.
  _railLoop(stopTiles) {
    const w = this.world, N = w.N;
    let best = null;
    for (let d0 = 0; d0 < 4; d0++) {
      const s0 = stopTiles[0];
      let cur = { i: s0.z * N + s0.x, d: d0 };
      let tiles = [[s0.x, s0.z]];
      const stopIdx = [0];
      let ok = true;
      for (let k = 1; k <= stopTiles.length; k++) {
        const g = stopTiles[k % stopTiles.length];
        const leg = this._railLeg(cur, g.z * N + g.x, k === stopTiles.length ? d0 : -1);
        if (!leg) { ok = false; break; }
        tiles = tiles.concat(leg.tiles.slice(1));
        if (k < stopTiles.length) stopIdx.push(tiles.length - 1);
        cur = { i: g.z * N + g.x, d: leg.dir };
      }
      if (ok && (!best || tiles.length < best.tiles.length)) best = { tiles, stopIdx };
    }
    return best;
  }

  _railLeg(start, goal, goalDir) {
    const w = this.world, N = w.N, rails = w.rails;
    const n4 = N * N * 4;
    if (!this._prev || this._prev.length !== n4) { this._prev = new Int32Array(n4); this._seen = new Uint32Array(n4); this._stamp = 0; }
    const prev = this._prev, seen = this._seen, stamp = ++this._stamp;
    const s0 = start.i * 4 + start.d;
    seen[s0] = stamp; prev[s0] = -1;
    const q = [s0];
    for (let qi = 0; qi < q.length; qi++) {
      const st = q[qi], i = st >> 2, d = st & 3;
      const x = i % N, z = (i / N) | 0;
      for (let m = 0; m < 4; m++) {
        if (m === ((d + 2) & 3)) continue;           // no reversing
        const nx = x + STEP[m][0], nz = z + STEP[m][1];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx;
        if (!rails[ni]) continue;
        const ns = ni * 4 + m;
        if (seen[ns] === stamp) continue;
        seen[ns] = stamp; prev[ns] = st;
        if (ni === goal && (goalDir < 0 || m === goalDir)) {
          const out = [];
          for (let k = ns; k !== -1; k = prev[k]) { const ti = k >> 2; out.push([ti % N, (ti / N) | 0]); }
          return { tiles: out.reverse(), dir: m };
        }
        q.push(ns);
      }
    }
    return null;
  }

  _sample(route, s) {
    const { pts, cum, length } = route;
    s = ((s % length) + length) % length;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const L = cum[hi] - cum[lo] || 1;
    const t = (s - cum[lo]) / L;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }

  _height(mode, x, z) {
    const w = this.world;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (w.inBounds(tx, tz) && w.terrain.isWater(tx, tz)) return bridgeDeckY() + (mode === 'rail' ? 0.045 : 0);
    if (mode !== 'rail') { const r = w.rampHeight(x, z); if (r != null) return r + 0.02; }
    return w.terrain.heightAt(x, z) + (mode === 'rail' ? 0.06 : 0.03);
  }

  _geo(key, fn) {
    let g = this.geoCache.get(key);
    if (!g) { g = fn(); this.geoCache.set(key, g); }
    return g;
  }

  rebuild() {
    this.dirty = false;
    const w = this.world;
    this.routes.clear();
    for (const line of w.lines) {
      const r = this._route(line);
      line.broken = !r;
      if (r) this.routes.set(line.id, r);
    }
    // sync vehicles
    for (const v of [...this.vehicles]) {
      const r = this.routes.get(v.line.id);
      if (!w.lines.includes(v.line) || !r) { this._removeVehicle(v); continue; }
      v.route = r;
      v.s = Math.min(v.s, r.length);
      v.next = this._nextMark(r, v.s);
    }
    for (const line of w.lines) {
      const r = this.routes.get(line.id);
      if (!r) continue;
      const mine = this.vehicles.filter(v => v.line === line);
      while (mine.length > line.vehicles) this._removeVehicle(mine.pop());
      for (let k = mine.length; k < line.vehicles; k++) mine.push(this._spawnVehicle(line, r, (r.length * k) / line.vehicles));
    }
    this.game.emit('transit:routes');
  }

  _nextMark(route, s) {
    for (let i = 0; i < route.marks.length; i++) if (route.marks[i].s > s + 1e-3) return i;
    return 0;
  }

  _spawnVehicle(line, route, s) {
    const meshes = [];
    if (line.mode === 'rail') {
      meshes.push(new THREE.Mesh(this._geo('engine', engineModel), MAT.building));
      for (let k = 0; k < 2; k++) meshes.push(new THREE.Mesh(this._geo('car' + line.color, () => carriageModel(line.color)), MAT.building));
    } else {
      meshes.push(new THREE.Mesh(this._geo('coach' + line.color, () => coachModel(line.color)), MAT.building));
    }
    for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    const v = { line, route, s, meshes, state: 'move', dwell: 0, next: this._nextMark(route, s), passengers: [], smokeAcc: 0 };
    this.vehicles.push(v);
    return v;
  }

  _removeVehicle(v) {
    for (const m of v.meshes) this.group.remove(m);
    for (const p of v.passengers) this._dropOff(p, null);
    this.vehicles = this.vehicles.filter(x => x !== v);
  }

  // --------------------------------------------------------- passengers
  plan(A, B, walkLen) {
    if (walkLen < 9 || !this.world.lines.length) return null;
    const w = this.world;
    let best = null;
    const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    for (const line of w.lines) {
      const route = this.routes.get(line.id);
      if (!route || line.broken) continue;
      let sA = null, sB = null, dA = Infinity, dB = Infinity;
      for (const m of route.marks) {
        const st = w.buildings.get(m.stop);
        if (!st || !st.access) continue;
        const da = man(A, st), db = man(B, st);
        if (da < dA) { dA = da; sA = m; }
        if (db < dB) { dB = db; sB = m; }
      }
      if (!sA || !sB || sA === sB || dA > 7 || dB > 7) continue;
      const ride = ((sB.s - sA.s) + route.length) % route.length;
      const cfg = TRANSIT[line.mode];
      const cost = dA + dB + (ride * CONFIG.WALK_SPEED) / cfg.speed + 3;
      if (cost < walkLen * 0.85 && (!best || cost < best.cost)) {
        best = { line, board: w.buildings.get(sA.stop), alight: w.buildings.get(sB.stop), cost };
      }
    }
    return best;
  }

  wait(r, plan, destId) {
    if (!this.world.buildings.get(plan.board.id) || !this.world.lines.includes(plan.line)) {
      this.game.agents._arrive(r, plan.board.id);
      return;
    }
    const list = this.waiting.get(plan.board.id) || [];
    list.push({ r, plan, dest: destId, since: this.world.day * 24 + this.world.hours });
    this.waiting.set(plan.board.id, list);
    this.game.agents.waitAt(r, plan.board);
  }

  _giveUp(q) {
    const r = q.r;
    r.skipTransit = true;
    r.loc = 'in';
    r.at = q.plan.board.id;
    if (r.walk) this.game.agents._drop(r.walk);
    this.game.agents.go(r, q.dest);
  }

  _dropOff(p, stop) {
    this.riders.delete(p.r.id);
    if (!this.world.residents.has(p.r.id)) return;
    if (stop) this.game.agents.alight(p.r, stop, p.dest);
    else { p.r.loc = 'in'; p.r.at = p.r.home; }
  }

  forget(r) {
    for (const [k, list] of this.waiting) this.waiting.set(k, list.filter(q => q.r !== r));
    for (const v of this.vehicles) v.passengers = v.passengers.filter(p => p.r !== r);
    this.riders.delete(r.id);
  }

  vehicleOf(r) {
    const v = this.riders.get(r.id);
    if (!v) return null;
    const m = v.meshes[0];
    return { x: m.position.x, y: m.position.y, z: m.position.z };
  }

  lineNameOf(r) { const v = this.riders.get(r.id); return v ? v.line.name : null; }

  _atStop(v, mark) {
    const w = this.world;
    const stop = w.buildings.get(mark.stop);
    if (!stop) return;
    const keep = [];
    for (const p of v.passengers) {
      if (p.alight === mark.stop) this._dropOff(p, stop);
      else keep.push(p);
    }
    v.passengers = keep;
    const list = this.waiting.get(mark.stop) || [];
    const cap = TRANSIT[v.line.mode].capacity;
    const remain = [];
    let fares = 0;
    for (const q of list) {
      if (q.plan.line === v.line && v.passengers.length < cap && this.world.residents.has(q.r.id)) {
        this.game.agents.board(q.r);
        v.passengers.push({ r: q.r, alight: q.plan.alight.id, dest: q.dest });
        this.riders.set(q.r.id, v);
        fares += this.game.sim.recordVisit(stop, TRANSIT[v.line.mode].fare);
      } else remain.push(q);
    }
    this.waiting.set(mark.stop, remain);
    if (fares) {
      const p = v.meshes[0].position;
      this.game.emit('coins', { x: p.x, y: p.y + 0.4, z: p.z, v: fares });
      const st = (this.stats[v.line.id] ||= { riders: 0, fares: 0 });
      st.riders += fares / TRANSIT[v.line.mode].fare; st.fares += fares;
    }
  }

  // --------------------------------------------------------------- update
  update(dt) {
    if (this.dirty) this.rebuild();
    const speed = this.game.speed;
    const w = this.world;
    const now = w.day * 24 + w.hours;
    // impatient passengers walk instead
    for (const [k, list] of this.waiting) {
      if (!list.length) continue;
      const keep = [];
      for (const q of list) { if (now - q.since > 3.5) this._giveUp(q); else keep.push(q); }
      this.waiting.set(k, keep);
    }
    for (const v of this.vehicles) {
      const cfg = TRANSIT[v.line.mode];
      const route = v.route;
      const rail = v.line.mode === 'rail';
      if (v.state === 'dwell') {
        v.dwell -= dt * speed;
        if (v.dwell <= 0) { v.state = 'move'; v.next = (v.next + 1) % route.marks.length; }
      } else if (speed) {
        const mark = route.marks[v.next];
        let dist = mark.s - v.s;
        if (dist < 0) dist += route.length;
        let step = dt * speed * cfg.speed;
        if (rail) {
          // pull away gently and brake into the platform
          const prevMark = route.marks[(v.next - 1 + route.marks.length) % route.marks.length];
          let since = v.s - prevMark.s;
          if (since < 0) since += route.length;
          step *= Math.min(1, 0.25 + Math.min(dist, since) * 0.6);
        }
        if (step >= dist) {
          v.s = mark.s;
          v.state = 'dwell';
          v.dwell = rail ? 2.6 : 1.4;
          this._atStop(v, mark);
        } else v.s = (v.s + step) % route.length;
      }
      // place meshes: trains are centred on their position (engine in front)
      for (let k = 0; k < v.meshes.length; k++) {
        const off = rail ? (1 - k) * CAR_SPACING : -k * 0.6;
        const p = this._sample(route, v.s + off);
        const m = v.meshes[k];
        m.position.set(p.x, this._height(v.line.mode, p.x, p.z), p.z);
        m.rotation.y = p.heading;
      }
      if (rail && speed) {
        v.smokeAcc += dt * (v.state === 'move' ? 6 : 1.5);
        const m = v.meshes[0];
        while (v.smokeAcc > 1) {
          v.smokeAcc -= 1;
          const fx = m.position.x + Math.sin(m.rotation.y) * 0.14, fz = m.position.z + Math.cos(m.rotation.y) * 0.14;
          this.game.view.smoke.emit({
            x: fx, y: m.position.y + 0.3, z: fz, vx: (Math.random() - 0.5) * 0.05, vy: 0.3, vz: (Math.random() - 0.5) * 0.05,
            drag: 0.8, life: 2.5, size: 0.08, size1: 0.4, r: 0.92, g: 0.92, b: 0.95, alpha: 0.55, alpha1: 0, fadeIn: 0.05,
          });
        }
      }
    }
    this._updateCarts(dt);
  }

  // ---------------------------------------------------------------- carts
  planCarts() {
    const w = this.world;
    const shops = [...w.buildings.values()].filter(b => BUILDINGS[b.type].shop && b.connected && b.access && isOpen(b));
    if (!shops.length) return;
    for (const b of w.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (def.cat !== 'industry' || !b.connected || !b.access || !b.workers.length) continue;
      const trips = 1 + Math.floor(b.level / 1);
      for (let k = 0; k < trips; k++) {
        const to = shops[(Math.random() * shops.length) | 0];
        this.cartPlan.push({ day: w.day, t: 8 + Math.random() * 9, from: b.id, to: to.id });
      }
    }
  }

  // A cart of building materials for a building being moved. Calls back on
  // arrival; returns false if there is no road between the two plots.
  haul(A, B, onArrive) {
    if (!A.access || !B.access) return false;
    const tiles = this.game.paths.road(A.access.x, A.access.z, B.access.x, B.access.z);
    if (!tiles || tiles.length < 2) return false;
    const pts = smoothPolyline(tilePolyline(tiles, 0.17), 0.3, 3);
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const mesh = new THREE.Mesh(this._geo('cartmaterials', () => cartModel('materials')), MAT.building);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.carts.push({ route: { pts, cum, length: cum[cum.length - 1] }, s: 0, mesh, to: B.id, cb: onArrive });
    return true;
  }

  _updateCarts(dt) {
    const w = this.world, speed = this.game.speed;
    for (let i = this.cartPlan.length - 1; i >= 0; i--) {
      const c = this.cartPlan[i];
      if (c.day < w.day) { this.cartPlan.splice(i, 1); continue; }
      if (c.day === w.day && w.hours >= c.t) {
        this.cartPlan.splice(i, 1);
        const A = w.buildings.get(c.from), B = w.buildings.get(c.to);
        if (!A || !B || !A.access || !B.access || this.carts.length > 30) continue;
        const tiles = this.game.paths.road(A.access.x, A.access.z, B.access.x, B.access.z);
        if (!tiles || tiles.length < 2) continue;
        const pts = smoothPolyline(tilePolyline(tiles, 0.17), 0.3, 3);
        const cum = [0];
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
        const cargo = CARGO[A.type] || 'crates';
        const mesh = new THREE.Mesh(this._geo('cart' + cargo, () => cartModel(cargo)), MAT.building);
        mesh.castShadow = true;
        this.group.add(mesh);
        this.carts.push({ route: { pts, cum, length: cum[cum.length - 1] }, s: 0, mesh, to: B.id });
      }
    }
    for (let i = this.carts.length - 1; i >= 0; i--) {
      const c = this.carts[i];
      c.s += dt * speed * CONFIG.CART_SPEED;
      if (c.s >= c.route.length) {
        this.group.remove(c.mesh);
        this.carts.splice(i, 1);
        if (c.cb) { c.cb(); continue; }
        const B = w.buildings.get(c.to);
        if (B) {
          const v = this.game.sim.recordVisit(B, 4);
          const p = c.mesh.position;
          if (v) this.game.emit('coins', { x: p.x, y: p.y + 0.35, z: p.z, v });
        }
        continue;
      }
      const p = this._sample(c.route, Math.min(c.s, c.route.length - 1e-3));
      c.mesh.position.set(p.x, this._height('coach', p.x, p.z), p.z);
      c.mesh.rotation.y = p.heading;
    }
  }

  routeRibbons() {
    const out = [];
    for (const line of this.world.lines) {
      const r = this.routes.get(line.id);
      if (!r) continue;
      const pts = r.pts.map(([x, z]) => [x, this._height(line.mode, x, z), z]);
      out.push({ points: pts, color: line.color });
    }
    return out;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.geoCache.values()) g.dispose();
  }
}
