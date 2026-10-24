// Transit: horse-drawn coach lines on roads, steam trains on rails, gondola
// cabins on a cable slung straight from station to station, and delivery
// carts trundling from farms and workshops to the shops.

import * as THREE from 'three';
import { BUILDINGS, TRANSIT, LINE_COLORS } from '../defs.js';
import { CONFIG } from '../config.js';
import { GeoBuilder } from '../render/geo.js';
import { MAT } from '../render/materials.js';
import { tilePolyline, smoothPolyline } from './path.js';
import { bridgeDeckY, isOpen, fw, fd } from '../world/world.js';

const WARM = [1.7, 1.2, 0.55];

// A horse's body, head and tail; its legs are separate pieces (horseLegs) so
// they can trot.
const LEGS = [[-0.025, 0.06], [0.025, 0.06], [-0.025, -0.06], [0.025, -0.06]];
const LEG_H = 0.08;
// legs swing this far either way; the gait advances with distance so that
// hooves on the ground don't slide
const LEG_SWING = 0.45, GAIT_PER_TILE = 1 / (LEG_H * LEG_SWING);
const COACH_HORSE = { z: 0.26, color: '#7a5232' }, CART_HORSE = { z: 0.22, color: '#8a6542' };

function horse(gb, x, z, color = '#7a5232') {
  gb.push(x, 0, z, 0);
  gb.box(0, 0.075, 0, 0.07, 0.07, 0.17, color);
  gb.box(0, 0.12, 0.1, 0.045, 0.07, 0.05, color, 0, -0.5);
  gb.box(0, 0.15, 0.14, 0.04, 0.035, 0.07, color);
  gb.box(0, 0.12, 0.07, 0.012, 0.06, 0.05, '#3a2a1f', 0, -0.4);
  gb.box(0, 0.09, -0.09, 0.012, 0.05, 0.012, '#3a2a1f', 0, 0.6);
  gb.pop();
}

function wheels(gb, z, w, r = 0.04, color = '#3a2a1f') {
  for (const sx of [-1, 1]) gb.cyl(sx * (w + 0.008), r, z, r, r, 0.015, 8, color, 0, 0, Math.PI / 2);
}

function coachModel(color) {
  const gb = new GeoBuilder();
  horse(gb, 0, COACH_HORSE.z, COACH_HORSE.color);
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
  horse(gb, 0, CART_HORSE.z, CART_HORSE.color);
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

// A gondola cabin, hung from its grip on the cable (the origin): a little
// box with windows all round on an arm down from the grip, its floor G_HANG
// below the cable.
// A cabin holds six villagers standing, two across and three deep (each about
// 0.07 round, a grown-up 0.15 tall), and passes the pylons' masts and a cabin
// on the other cable (2 G_OFF over) with room between: H high, W across, D
// long, its panels up to SILL, walls T thick.
const CABIN = { H: 0.19, W: 0.16, D: 0.24, SILL: 0.065, T: 0.008 };
function cabinModel(color) {
  const gb = new GeoBuilder();
  const F = -G_HANG, { H, W, D, SILL, T } = CABIN;
  gb.box(0, -0.012, 0, 0.026, 0.03, 0.06, '#2b2b2e');
  gb.box(0, F + H + 0.015, 0, 0.012, -0.012 - (F + H + 0.015), 0.012, '#4a5055');
  gb.box(0, F + H + 0.012, 0, 0.05, 0.012, 0.03, '#4a5055');
  // the floor, panels in the line's colour up to the sills, a post at each
  // corner and a rail along the tops of the windows (their glass is
  // cabinGlass), and the roof over it all
  gb.box(0, F - 0.008, 0, W, 0.014, D, '#2b2b2e');
  for (const s of [-1, 1]) {
    gb.box(0, F, s * (D / 2 - T / 2), W, SILL, T, color);
    gb.box(s * (W / 2 - T / 2), F, 0, T, SILL, D, color);
    gb.box(0, F + H - 0.02, s * (D / 2 - T / 2), W, 0.02, T, color);
    gb.box(s * (W / 2 - T / 2), F + H - 0.02, 0, T, 0.02, D, color);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * (W / 2 - 0.008), F, sz * (D / 2 - 0.008), 0.016, H, 0.016, color);
  // and a post in the middle of each long side
  for (const s of [-1, 1]) gb.box(s * (W / 2 - T / 2), F, 0, T + 0.004, H, 0.012, color);
  gb.cbox(0, F + H, 0, W + 0.01, 0.018, D + 0.01, '#e8e2d4', 0, 0.008);
  // a lamp under the roof, lit at night
  gb.glow(WARM[0], WARM[1], WARM[2], 1.6);
  gb.box(0, F + H - 0.012, 0, 0.034, 0.01, 0.034, '#ffe2a0');
  gb.noGlow();
  return gb.build();
}

// A cabin's windows: a pane of clear glass in each side between the sills,
// the corner posts and the rail, drawn see-through (MAT.glass) so the riders
// show through it.
function cabinGlass() {
  const gb = new GeoBuilder();
  const F = -G_HANG, { H, W, D, SILL, T } = CABIN, y0 = F + SILL, h = H - SILL - 0.02;
  for (const s of [-1, 1]) {
    gb.box(0, y0, s * (D / 2 - T / 2), W - 0.03, h, 0.003, '#ffffff');
    gb.box(s * (W / 2 - T / 2), y0, 0, 0.003, h, D - 0.03, '#ffffff');
  }
  return gb.build();
}

// A pylon under a gondola line: a tapering steel mast on a concrete footing,
// with a crossarm at the top and a train of sheaves under each cable. p: where
// it stands (x, z, the ground g), the cable's height there (h) and the line's
// heading (ry).
const STEEL = '#848d92', STEEL_D = '#626a6f', SHEAVE = '#2b2b2e';
function pylon(gb, p) {
  const H = p.h - p.g;
  gb.push(p.x, p.g, p.z, p.ry);
  gb.box(0, -0.1, 0, 0.17, 0.13, 0.17, '#a8a094');
  gb.cyl(0, 0, 0, 0.035, 0.085, H - 0.04, 4, STEEL, Math.PI / 4);
  for (let y = 0.28; y < H - 0.2; y += 0.28) {
    const r = 0.085 - (0.05 * y) / H;
    gb.cyl(0, y, 0, r + 0.008, r + 0.008, 0.016, 4, STEEL_D, Math.PI / 4);
  }
  gb.box(0, H - 0.07, 0, 2 * G_OFF + 0.1, 0.035, 0.045, STEEL);
  for (const s of [-1, 1]) gb.box(s * G_OFF, H - 0.035, 0, 0.026, 0.03, 0.14, SHEAVE);
  gb.pop();
}
const CABLE_MAT = new THREE.LineBasicMaterial({ color: '#26282b' });

const CARGO = { farm: 'hay', lumber: 'logs', fishery: 'fish', workshop: 'crates' };
const CAR_SPACING = 0.56;   // distance between train car centres along the track
const STEP = [[0, 1], [1, 0], [0, -1], [-1, 0]];
// Gondolas: the two cables run G_OFF either side of the line, G_CABLE above a
// station's floor (its deck is level with a cabin's floor, G_HANG lower; see
// MODELS.gondola), or up to G_LIFT higher where a station stands taller to
// clear its neighbours (b.lift). Pylons stand about G_SPAN apart, never more
// than G_MAXH tall, and hold the cable G_GROUND above the ground and G_ROOF
// above the roofs it passes over, so the cabins clear them; between them
// it sags a little (sagOf a span's length).
const G_OFF = 0.14, G_CABLE = 1.05, G_HANG = 0.27, G_LIFT = 3.5, G_SPAN = 6, G_MAXH = 6, G_GROUND = 1.05, G_ROOF = 0.42;
const sagOf = (len) => Math.min(0.12, len * 0.006);
// Why a gondola line can't run (route.blocked: what is in the cable's way).
export const blockedReason = (bl) => `The cable can't clear ${bl.by ? `the ${BUILDINGS[bl.by.type].levels[bl.by.level].name}` : 'the ground'}: move a station, or put one nearer it`;

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
    this.cables = new Map();   // gondola line id → its drawn cable, pylons and bullwheels
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
    if (w.money < cfg.vehicleCost) return { ok: false, reason: 'Not enough money' };
    const used = new Set(w.lines.map(l => l.color));
    const color = LINE_COLORS.find(c => !used.has(c)) || LINE_COLORS[w.lines.length % LINE_COLORS.length];
    const n = w.lines.filter(l => l.mode === mode).length + 1;
    const line = { id: w.newId(), mode, name: `${cfg.lineName} ${n}`, color, stops: stops.slice(), vehicles: 1 };
    const route = this._route(line);
    if (!route) return { ok: false, reason: mode === 'rail' ? "Trains can't reverse: join the stations with a loop of track" : mode === 'gondola' ? 'Pick gondola stations' : 'Stops are not connected by road' };
    if (route.blocked) return { ok: false, reason: blockedReason(route.blocked) };
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
    n = Math.max(1, Math.min(TRANSIT[line.mode].maxVehicles, n));
    if (n === line.vehicles) return { ok: false, reason: null };
    if (n > line.vehicles) {
      const cost = TRANSIT[line.mode].vehicleCost;
      if (w.money < cost) return { ok: false, reason: 'Not enough money' };
      w.money -= cost;
    }
    line.vehicles = n;
    w.emit('lines');
    return { ok: true };
  }

  // ------------------------------------------------------------ routing
  _stopTile(b, mode) { return mode === 'rail' ? b.rail : b.access; }

  // lifts: for a gondola line, how much taller each station stands (see
  // _cableRoute); without them its stations are free to rise.
  _route(line, lifts = null) {
    const w = this.world, paths = this.game.paths;
    const stops = line.stops.map(id => w.buildings.get(id)).filter(Boolean);
    if (stops.length < 2) return null;
    if (line.mode === 'gondola') return stops.every(b => b.type === 'gondola') ? this._cableRoute(stops, lifts) : null;
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

  // ------------------------------------------------------------ gondolas
  // A gondola line runs out along its stations on one cable and back on the
  // other, G_OFF either side of the straight line from station to station,
  // round a bullwheel at each end station (and round the outside of any
  // station where the line doubles back). pts: the path of a cabin's grip;
  // ys: the cable's height along it, level through the stations and slung
  // from pylon to pylon between them.
  // lifts: how much taller than usual each station stands (by id), so the
  // cable clears what is round it. Without them the stations are free to
  // rise as far as G_LIFT, and the route says how far each must (lifts);
  // with them they are held there. blocked: what the cable still can't
  // clear, if anything.
  _cableRoute(stops, lifts = null) {
    const n = stops.length;
    const P = stops.map(b => [b.x + 0.5, b.z + 0.5]);
    // a station's height, shared by the spans either side of it (and by
    // every visit to it, should a line come back through it)
    const ref = new Map();
    for (const b of stops) if (!ref.has(b.id)) {
      const h = (b.baseY || 0) + G_CABLE + (lifts ? lifts.get(b.id) || 0 : 0);
      ref.set(b.id, { h, base: (b.baseY || 0) + G_CABLE, max: lifts ? h : h + G_LIFT, station: true });
    }
    const legs = [];
    for (let i = 0; i < n - 1; i++) legs.push(this._span(P[i], P[i + 1], stops[i], stops[i + 1], ref.get(stops[i].id), ref.get(stops[i + 1].id)));
    const blocked = this._solve(legs);
    // a station rises in steps of a quarter tile (the cable only goes higher)
    const lift = new Map();
    for (const [id, s] of ref) if (!lifts) { const k = Math.ceil((s.h - s.base) / 0.25 - 1e-6) * 0.25; s.h = s.base + k; if (k > 0) lift.set(id, k); }
    const H = stops.map(b => ref.get(b.id).h);
    // the stations in the order a cabin calls at them: out, then back
    const seq = [];
    for (let i = 0; i < n; i++) seq.push(i);
    for (let i = n - 2; i >= 1; i--) seq.push(i);
    const m = seq.length;
    const dir = (i, j) => { const dx = P[j][0] - P[i][0], dz = P[j][1] - P[i][1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; };
    const wheels = [];
    // how the cable gets through each station: a mitre where it bends a
    // little, round a wheel where it turns back
    const joins = seq.map((si, k) => {
      const din = dir(seq[(k - 1 + m) % m], si), dout = dir(si, seq[(k + 1) % m]);
      const r1 = [-din[1], din[0]], r2 = [-dout[1], dout[0]], V = P[si];
      const dot = r1[0] * r2[0] + r1[1] * r2[1];
      if (1 + dot > 0.5) return { pts: [[V[0] + ((r1[0] + r2[0]) * G_OFF) / (1 + dot), V[1] + ((r1[1] + r2[1]) * G_OFF) / (1 + dot)]], mid: 0, si };
      // a sharp bend towards the other cable: straight across
      if (din[0] * dout[1] - din[1] * dout[0] > 1e-9) return { pts: [[V[0] + r1[0] * G_OFF, V[1] + r1[1] * G_OFF], [V[0] + r2[0] * G_OFF, V[1] + r2[1] * G_OFF]], mid: 0, si };
      let phi = Math.atan2(r2[0] * din[0] + r2[1] * din[1], dot);
      if (phi < 0) phi += Math.PI * 2;
      const steps = Math.max(2, Math.ceil(phi / (Math.PI / 10))), pts = [];
      for (let j = 0; j <= steps; j++) {
        const t = (phi * j) / steps, c = Math.cos(t), s = Math.sin(t);
        pts.push([V[0] + (r1[0] * c + din[0] * s) * G_OFF, V[1] + (r1[1] * c + din[1] * s) * G_OFF]);
      }
      if (!wheels.some(wh => wh.x === V[0] && wh.z === V[1])) wheels.push({ x: V[0], z: V[1], y: H[si] });
      return { pts, mid: steps >> 1, si };
    });
    const pts = [], ys = [], markIdx = [];
    const add = (x, z, y) => {
      const q = pts[pts.length - 1];
      if (q && Math.hypot(q[0] - x, q[1] - z) < 1e-4) return;
      pts.push([x, z]); ys.push(y);
    };
    for (let k = 0; k < m; k++) {
      const J = joins[k];
      J.pts.forEach((p, j) => { add(p[0], p[1], H[J.si]); if (j === J.mid) markIdx.push(pts.length - 1); });
      // then straight on to the next station, sagging between the pylons
      const N = joins[(k + 1) % m], a = J.pts[J.pts.length - 1], b = N.pts[0];
      const leg = legs[Math.min(J.si, N.si)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(len / 0.2));
      for (let j = 1; j < steps; j++) {
        const x = a[0] + ((b[0] - a[0]) * j) / steps, z = a[1] + ((b[1] - a[1]) * j) / steps;
        add(x, z, leg.prof((x - leg.a[0]) * leg.ux + (z - leg.a[1]) * leg.uz));
      }
    }
    pts.push([...pts[0]]); ys.push(ys[0]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const marks = joins.map((J, k) => ({ stop: stops[J.si].id, s: cum[markIdx[k]] }));
    // what the drawing depends on: it is redrawn only when this changes
    const sig = P.map((p, i) => `${p[0]},${p[1]},${H[i].toFixed(3)}`).join(';') + '|' + legs.map(l => l.pylons.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.h.toFixed(2)}`).join(';')).join('|');
    return { pts, ys, cum, length: cum[cum.length - 1], marks, mode: 'gondola', legs, wheels, sig, lifts: lift, blocked };
  }

  // One span of a gondola line, from station centre a to station centre b
  // (A and B the stations, s0 and s1 their heights): what the cable must
  // clear along it, where its pylons stand, and prof(u), the cable's height
  // u along it once _solve has set the heights. A pylon goes up every
  // G_SPAN or so, wherever along that stretch there is room for one (best
  // on open ground, then in a field or a park, then on a road's verge).
  _span(a, b, A, B, s0, s1) {
    const w = this.world, t = w.terrain;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / L, uz = dz / L;
    const at = (u) => [a[0] + ux * u, a[1] + uz * u];
    // the least height the cable may run at, every quarter tile along, and
    // what sets it there (by: a building, or null for the ground)
    const NS = Math.max(1, Math.ceil(L / 0.25)), req = [], by = [];
    for (let k = 0; k <= NS; k++) {
      const [x0, z0] = at((L * k) / NS);
      let need = -Infinity, what = null;
      for (const o of [-0.24, 0, 0.24]) {
        const x = x0 - uz * o, z = z0 + ux * o, tx = Math.floor(x), tz = Math.floor(z);
        if (!w.inBounds(tx, tz)) continue;
        need = Math.max(need, Math.max(t.heightAt(x, z), CONFIG.WATER_LEVEL) + G_GROUND);
        const ob = w.buildingOn(tx, tz);
        if (ob && ob !== A && ob !== B) { const h = this._topOf(ob) + G_ROOF; if (h > need) { need = h; what = ob; } }
      }
      req.push(need); by.push(what);
    }
    const pylons = [];
    const n = Math.max(0, Math.ceil(L / G_SPAN) - 1);
    for (let j = 1; j <= n; j++) {
      const u0 = (L * j) / (n + 1);
      let best = null;
      for (let u = Math.max(1, u0 - G_SPAN / 2); u <= Math.min(L - 1, u0 + G_SPAN / 2); u += 0.1) {
        if (pylons.some(p => Math.abs(p.u - u) < 1.5)) continue;
        const [x, z] = at(u), kind = this._pylonSpot(x, z);
        if (kind < 0) continue;
        const score = kind * 2 + Math.abs(u - u0);
        if (!best || score < best.score) best = { u, x, z, score };
      }
      if (!best) continue;
      const g = t.heightAt(best.x, best.z), need = req[Math.round((best.u / L) * NS)];
      pylons.push({ u: best.u, x: best.x, z: best.z, g, h: Math.min(g + G_MAXH, Math.max(g + 1.3, need)), max: g + G_MAXH, ry: Math.atan2(ux, uz) });
    }
    pylons.sort((p, q) => p.u - q.u);
    const sup = [{ u: 0, s: s0 }, ...pylons.map(p => ({ u: p.u, s: p })), { u: L, s: s1 }];
    const prof = (u) => {
      u = Math.min(L, Math.max(0, u));
      let i = 0;
      while (i < sup.length - 2 && sup[i + 1].u < u) i++;
      const p0 = sup[i], p1 = sup[i + 1], len = p1.u - p0.u || 1e-6, f = Math.min(1, Math.max(0, (u - p0.u) / len));
      return p0.s.h + (p1.s.h - p0.s.h) * f - sagOf(len) * 4 * f * (1 - f);
    };
    return { a, ux, uz, L, NS, req, by, sup, prof, pylons, at };
  }

  // Set the heights of a line's pylons and stations so the cable clears
  // everything under every span: where it runs too low, the pylons either
  // side rise first (the nearer one more), and a station only when they are
  // as tall as they go, or there are none. Then each pylon is made at least
  // nearly as tall as the lower of its neighbours, so the cable never dips
  // to one for nothing. Returns what still stands in the way, if anything.
  _solve(legs) {
    const raise = (s, d) => { const h0 = s.h; s.h = Math.min(s.max, s.h + d); return s.h - h0; };
    for (let pass = 0; pass < 16; pass++) {
      let moved = false;
      for (const leg of legs) for (let i = 0; i < leg.sup.length - 1; i++) {
        const p0 = leg.sup[i], p1 = leg.sup[i + 1], len = p1.u - p0.u, S = sagOf(len);
        for (let k = 0; k <= leg.NS; k++) {
          const u = (leg.L * k) / leg.NS;
          if (u <= p0.u || u >= p1.u) continue;
          const f = (u - p0.u) / len;
          let left = leg.req[k] - (p0.s.h + (p1.s.h - p0.s.h) * f - S * 4 * f * (1 - f));
          if (left <= 1e-3) continue;
          const ends = [[p0.s, 1 - f], [p1.s, f]].sort((a, b) => (!!a[0].station - !!b[0].station) || b[1] - a[1]);
          for (const [s, wt] of ends) if (left > 1e-4 && wt > 1e-3) { const got = raise(s, left / wt) * wt; left -= got; if (got > 1e-4) moved = true; }
        }
      }
      if (!moved) break;
    }
    for (const leg of legs) for (let i = 1; i < leg.sup.length - 1; i++) {
      const p = leg.sup[i].s;
      p.h = Math.min(p.max, Math.max(p.h, Math.min(leg.sup[i - 1].s.h, leg.sup[i + 1].s.h) - 0.25));
    }
    for (const leg of legs) for (let k = 0; k <= leg.NS; k++) {
      const u = (leg.L * k) / leg.NS;
      if (leg.req[k] - leg.prof(u) > 0.02) { const [x, z] = leg.at(u); return { by: leg.by[k], x, z }; }
    }
    return null;
  }

  // Stand each gondola station as tall as its lines need (b.lift, worked
  // out afresh every time, never saved), redrawing those that change.
  // Returns whether any did.
  _lift(lifts) {
    let changed = false;
    for (const b of this.world.buildings.values()) {
      if (b.type !== 'gondola') continue;
      const k = lifts.get(b.id) || 0;
      if (k === (b.lift || 0)) continue;
      if (k) b.lift = k; else delete b.lift;
      this.world.emit('building:refit', b);
      changed = true;
    }
    return changed;
  }

  // The headings each gondola station's cables leave it on, to the next
  // station along each of its lines and back (b.cables, worked out afresh,
  // never saved), so its way up stands clear of the cabins coming and
  // going; redrawing those that change.
  _exits() {
    const w = this.world, out = new Map();
    for (const line of w.lines) {
      if (line.mode !== 'gondola') continue;
      const st = line.stops.map(id => w.buildings.get(id)).filter(Boolean);
      for (let i = 0; i + 1 < st.length; i++) {
        const a = st[i], b = st[i + 1], h = Math.atan2(b.x - a.x, b.z - a.z);
        for (const [s, k] of [[a, h], [b, h + Math.PI]]) {
          const l = out.get(s.id) || [];
          const r = Math.round(Math.atan2(Math.sin(k), Math.cos(k)) * 100) / 100;
          if (!l.includes(r)) l.push(r);
          out.set(s.id, l);
        }
      }
    }
    for (const b of w.buildings.values()) {
      if (b.type !== 'gondola') continue;
      const l = (out.get(b.id) || []).sort((x, y) => x - y);
      if (l.join() === (b.cables || []).join()) continue;
      if (l.length) b.cables = l; else delete b.cables;
      w.emit('building:refit', b);
    }
  }

  // Can a pylon stand at (x, z), and how good a spot is it: 0 open ground,
  // 1 a field or a park, 2 the verge of a road (near the edge of its tile);
  // -1 not at all (on a building, in the road, on track or in water).
  _pylonSpot(x, z) {
    const w = this.world, tx = Math.floor(x), tz = Math.floor(z);
    if (!w.inBounds(tx, tz)) return -1;
    const i = w.idx(tx, tz);
    if (w.rails[i] || w.terrain.isWater(tx, tz)) return -1;
    const b = w.buildingOn(tx, tz);
    if (b) return BUILDINGS[b.type].park ? 1 : -1;
    if (w.roadAt(tx, tz)) return Math.max(Math.abs(x - tx - 0.5), Math.abs(z - tz - 0.5)) > 0.38 ? 2 : -1;
    return w.fields && w.fields[i] >= 0 ? 1 : 0;
  }

  // How high a building reaches: the top of its model as drawn, or a fair
  // guess (headless, or before it is drawn).
  _topOf(b) {
    const it = this.game.view && this.game.view.items && this.game.view.items.get(b.id);
    const g = it && (it.site ? it.site.target : it.mesh && it.mesh.geometry);
    if (g && g.attributes && g.attributes.position) {
      if (!g.boundingBox) g.computeBoundingBox();
      return (b.baseY || 0) + g.boundingBox.max.y;
    }
    const def = BUILDINGS[b.type];
    return (b.baseY || 0) + (def.park ? 0.35 : 0.55 + 0.2 * (b.level + 1) * Math.sqrt(fw(b) * fd(b)));
  }

  // Each gondola line's cables, pylons and bullwheels, drawn again only when
  // its route or what it has to clear changes.
  _drawCables() {
    const keep = new Set();
    for (const line of this.world.lines) {
      const r = this.routes.get(line.id);
      if (line.mode !== 'gondola' || !r) continue;
      keep.add(line.id);
      const old = this.cables.get(line.id);
      if (old && old.sig === r.sig) continue;
      if (old) this._dropCable(old);
      this.cables.set(line.id, this._cableMeshes(r));
    }
    for (const [id, c] of this.cables) if (!keep.has(id)) { this._dropCable(c); this.cables.delete(id); }
  }

  _cableMeshes(r) {
    const gb = new GeoBuilder(), seen = new Set();
    for (const leg of r.legs) for (const p of leg.pylons) {
      const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pylon(gb, p);
    }
    for (const wh of r.wheels) {
      gb.cyl(wh.x, wh.y - 0.014, wh.z, G_OFF + 0.012, G_OFF + 0.012, 0.028, 16, '#3a3f44');
      gb.cyl(wh.x, wh.y + 0.014, wh.z, 0.03, 0.03, 0.06, 8, SHEAVE);
    }
    // the cable, thick enough to see close up...
    const pos = new Float32Array((r.pts.length - 1) * 6);
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1], y0 = r.ys[i], y1 = r.ys[i + 1];
      const hz = Math.hypot(x1 - x0, z1 - z0);
      gb.boxC((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0.009, 0.009, Math.hypot(hz, y1 - y0) + 0.004, '#2b2b2e', -Math.atan2(y1 - y0, hz), Math.atan2(x1 - x0, z1 - z0));
      pos.set([x0, y0, z0, x1, y1, z1], i * 6);
    }
    const mesh = new THREE.Mesh(gb.build(), MAT.building);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // ...and a line a pixel wide, so far off it never breaks up
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const wire = new THREE.LineSegments(lg, CABLE_MAT);
    this.group.add(mesh, wire);
    return { sig: r.sig, mesh, wire };
  }

  _dropCable(c) {
    this.group.remove(c.mesh, c.wire);
    c.mesh.geometry.dispose();
    c.wire.geometry.dispose();
  }

  _sample(route, s) {
    const { pts, cum, length } = route;
    s = ((s % length) + length) % length;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const L = cum[hi] - cum[lo] || 1;
    const t = (s - cum[lo]) / L;
    const y = route.ys ? route.ys[lo] + (route.ys[hi] - route.ys[lo]) * t : 0;
    return { x: a[0] + (b[0] - a[0]) * t, y, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }

  // A route's path in 3D (for the overlay): along the ground, or the cable.
  routePoints(route) {
    if (route.ys) return route.pts.map(([x, z], i) => [x, route.ys[i] - 0.12, z]);
    return route.pts.map(([x, z]) => [x, this._height(route.mode, x, z), z]);
  }

  _height(mode, x, z) {
    const w = this.world;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (w.inBounds(tx, tz) && w.terrain.isWater(tx, tz)) return bridgeDeckY() + (mode === 'rail' ? 0.045 : 0);
    if (mode !== 'rail') { const r = w.rampHeight(x, z); if (r != null) return r + 0.02; }
    return w.terrain.heightAt(x, z) + (mode === 'rail' ? 0.06 : 0.03);
  }

  // Four legs hung from the hips of the horse pulling this mesh.
  _horseLegs(mesh, h) {
    const geo = this._geo('leg' + h.color, () => { const gb = new GeoBuilder(); gb.box(0, -LEG_H, 0, 0.018, LEG_H, 0.018, h.color); return gb.build(); });
    return LEGS.map(([lx, lz]) => {
      const leg = new THREE.Mesh(geo, MAT.building);
      leg.position.set(lx, LEG_H, h.z + lz);
      leg.castShadow = true;
      mesh.add(leg);
      return leg;
    });
  }

  // A trot: diagonal pairs of legs swing together; standing still, they settle.
  _poseLegs(legs, gait, moving, dt) {
    const a = Math.sin(gait) * LEG_SWING;
    legs.forEach((leg, i) => {
      const want = moving ? (i === 0 || i === 3 ? a : -a) : 0;
      leg.rotation.x = moving ? want : leg.rotation.x * Math.max(0, 1 - dt * 8);
    });
  }

  _geo(key, fn) {
    let g = this.geoCache.get(key);
    if (!g) { g = fn(); this.geoCache.set(key, g); }
    return g;
  }

  rebuild() {
    this.dirty = false;
    const w = this.world;
    // how tall each gondola station must stand, for the tallest of its lines
    // (once more if that changes a station another line passes over)
    let lifts;
    for (let again = 0; again < 2; again++) {
      lifts = new Map();
      for (const line of w.lines) {
        const r = line.mode === 'gondola' ? this._route(line) : null;
        if (r) for (const [id, k] of r.lifts) lifts.set(id, Math.max(lifts.get(id) || 0, k));
      }
      if (!this._lift(lifts)) break;
    }
    this._exits();
    this.routes.clear();
    for (const line of w.lines) {
      // (a gondola line with its stations held at those heights; it doesn't
      // run while something stands in the cable's way)
      const r = this._route(line, lifts);
      line.broken = !r || !!r.blocked;
      if (r && r.blocked) line.blocked = blockedReason(r.blocked); else delete line.blocked;
      if (r && !r.blocked) this.routes.set(line.id, r);
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
    this._drawCables();
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
    } else if (line.mode === 'gondola') {
      const m = new THREE.Mesh(this._geo('cabin' + line.color, () => cabinModel(line.color)), MAT.building);
      m.rotation.order = 'YXZ';   // it swings fore and aft on its grip
      // its windows, glass you see the riders through, swinging with it
      m.add(new THREE.Mesh(this._geo('cabinGlass', cabinGlass), MAT.glass));
      meshes.push(m);
    } else {
      meshes.push(new THREE.Mesh(this._geo('coach' + line.color, () => coachModel(line.color)), MAT.building));
    }
    for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    const legs = line.mode === 'rail' ? null : this._horseLegs(meshes[0], COACH_HORSE);
    const v = { line, route, s, meshes, legs, gait: 0, state: 'move', dwell: 0, next: this._nextMark(route, s), passengers: [], smokeAcc: 0, swing: s * 1.7 };
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
      // the stops nearest each end...
      let sA = null, sB = null, dA = Infinity, dB = Infinity;
      for (const m of route.marks) {
        const st = w.buildings.get(m.stop);
        if (!st || !st.access) continue;
        const da = man(A, st), db = man(B, st);
        if (da < dA) { dA = da; sA = m.stop; }
        if (db < dB) { dB = db; sB = m.stop; }
      }
      if (sA == null || sB == null || sA === sB || dA > 7 || dB > 7) continue;
      // ...and the shortest ride between them: a gondola calls at a station
      // between its ends on the way out and on the way back, so board going
      // the right way (at: the call to board at)
      let ride = Infinity, at = 0;
      route.marks.forEach((a, i) => {
        if (a.stop !== sA) return;
        for (const b of route.marks) if (b.stop === sB) { const d = ((b.s - a.s) + route.length) % route.length; if (d < ride) { ride = d; at = i; } }
      });
      const cfg = TRANSIT[line.mode];
      // the wait for a cabin: half the time between them (they come often)
      const wait = line.mode === 'gondola' ? ((route.length / Math.max(1, line.vehicles) / 2) * CONFIG.WALK_SPEED) / cfg.speed : 3;
      const cost = dA + dB + (ride * CONFIG.WALK_SPEED) / cfg.speed + wait;
      if (cost < walkLen * 0.85 && (!best || cost < best.cost)) {
        best = { line, board: w.buildings.get(sA), alight: w.buildings.get(sB), at, cost };
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

  // A passenger off at stop (at: where a gondola cabin stands there, to
  // step out of it), or home if the line is gone. Returns how long stepping
  // out takes.
  _dropOff(p, stop, at = null) {
    this.riders.delete(p.r.id);
    if (!this.world.residents.has(p.r.id)) return 0;
    if (stop) return this.game.agents.alight(p.r, stop, p.dest, at) || 0;
    if (p.r.walk) this.game.agents._drop(p.r.walk);
    p.r.loc = 'in'; p.r.at = p.r.home;
    return 0;
  }

  // How high a gondola cabin's floor stands (its riders stand on it).
  cabinFloor(v) { return v.meshes[0].position.y - G_HANG + 0.006; }

  // Where on a gondola station's deck a villager waits: round its middle,
  // clear of the way the cabins of every line through it pass (world
  // [x, z] spots, at the deck's height).
  deckSpots(stop) {
    const d = stop.deck;
    if (!d) return null;
    const segs = [];
    for (const line of this.world.lines) {
      const r = line.mode === 'gondola' && line.stops.includes(stop.id) ? this.routes.get(line.id) : null;
      if (!r) continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        if (Math.hypot((a[0] + b[0]) / 2 - d.x, (a[1] + b[1]) / 2 - d.z) < 0.7) segs.push([a, b]);
      }
    }
    const away = (x, z, [a, b]) => {
      const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
      return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
    };
    const all = [];
    for (let k = 0; k < 16; k++) {
      const ang = (k * Math.PI) / 8;
      for (const rad of [0.27, 0.23, 0.18]) {
        const x = d.x + Math.sin(ang) * rad, z = d.z + Math.cos(ang) * rad;
        all.push([x, z, Math.min(Infinity, ...segs.map(sg => away(x, z, sg)))]);
      }
    }
    // (on a busy deck, where nowhere is quite clear, the spots furthest from
    // the cabins' way)
    const clear = all.filter(p => p[2] > CABIN.W / 2 + 0.045);
    return (clear.length ? clear : all.sort((a, b) => b[2] - a[2]).slice(0, 3)).map(p => [p[0], p[1]]);
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
    const w = this.world, route = v.route;
    const stop = w.buildings.get(mark.stop);
    if (!stop) return;
    // a gondola cabin stands here, its riders step out and in (and it waits
    // for them); the waiting board only once up on the deck
    const cable = v.line.mode === 'gondola', at = cable ? this._sample(route, mark.s) : null;
    if (at) at.v = v;
    let wait = 0;
    const keep = [];
    for (const p of v.passengers) {
      if (p.alight === mark.stop) wait = Math.max(wait, this._dropOff(p, stop, at));
      else keep.push(p);
    }
    v.passengers = keep;
    const list = this.waiting.get(mark.stop) || [];
    const cap = TRANSIT[v.line.mode].capacity;
    const remain = [];
    let fares = 0;
    for (const q of list) {
      if (q.plan.line === v.line && (q.plan.at == null || q.plan.at === v.next || route.marks[q.plan.at]?.stop !== mark.stop) && v.passengers.length < cap && this.world.residents.has(q.r.id) && this.game.agents.onDeck(q.r)) {
        wait = Math.max(wait, this.game.agents.board(q.r, at && { ...at, seat: v.passengers.length }) || 0);
        v.passengers.push({ r: q.r, alight: q.plan.alight.id, dest: q.dest });
        this.riders.set(q.r.id, v);
        fares += this.game.sim.recordVisit(stop, TRANSIT[v.line.mode].fare);
      } else remain.push(q);
    }
    this.waiting.set(mark.stop, remain);
    if (wait) v.dwell = Math.max(v.dwell, wait);
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
      const rail = v.line.mode === 'rail', cable = v.line.mode === 'gondola';
      if (v.state === 'dwell') {
        v.dwell -= dt * speed;
        if (v.dwell <= 0) { v.state = 'move'; v.next = (v.next + 1) % route.marks.length; }
      } else if (speed) {
        const mark = route.marks[v.next];
        let dist = mark.s - v.s;
        if (dist < 0) dist += route.length;
        let step = dt * speed * cfg.speed;
        if (rail || cable) {
          // pull away gently and brake into the platform; a cabin lets go of
          // the cable in a station and creeps through it
          const prevMark = route.marks[(v.next - 1 + route.marks.length) % route.marks.length];
          let since = v.s - prevMark.s;
          if (since < 0) since += route.length;
          step *= rail ? Math.min(1, 0.25 + Math.min(dist, since) * 0.6) : Math.min(1, 0.3 + Math.min(dist, since) * 1.6);
        }
        if (v.legs) v.gait += Math.min(step, dist) * GAIT_PER_TILE;
        if (step >= dist) {
          v.s = mark.s;
          v.state = 'dwell';
          v.dwell = rail ? 2.6 : cable ? 1 : 1.4;
          this._atStop(v, mark);
        } else v.s = (v.s + step) % route.length;
      }
      if (cable) {
        // a cabin hangs from the cable, swinging a little on its grip
        const p = this._sample(route, v.s), m = v.meshes[0];
        m.position.set(p.x, p.y, p.z);
        m.rotation.y = p.heading;
        v.swing += dt * speed * 2.2;
        m.rotation.x = Math.sin(v.swing) * (v.state === 'move' ? 0.05 : 0.015);
        continue;
      }
      // place meshes: trains are centred on their position (engine in front)
      for (let k = 0; k < v.meshes.length; k++) {
        const off = rail ? (1 - k) * CAR_SPACING : -k * 0.6;
        const p = this._sample(route, v.s + off);
        const m = v.meshes[k];
        m.position.set(p.x, this._height(v.line.mode, p.x, p.z), p.z);
        m.rotation.y = p.heading;
      }
      if (v.legs) this._poseLegs(v.legs, v.gait, v.state === 'move' && speed > 0, dt * speed);
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
    this.carts.push({ route: { pts, cum, length: cum[cum.length - 1] }, s: 0, mesh, legs: this._horseLegs(mesh, CART_HORSE), gait: 0, to: B.id, cb: onArrive });
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
        this.carts.push({ route: { pts, cum, length: cum[cum.length - 1] }, s: 0, mesh, legs: this._horseLegs(mesh, CART_HORSE), gait: 0, to: B.id });
      }
    }
    for (let i = this.carts.length - 1; i >= 0; i--) {
      const c = this.carts[i];
      const step = dt * speed * CONFIG.CART_SPEED;
      c.s += step;
      c.gait += step * GAIT_PER_TILE;
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
      this._poseLegs(c.legs, c.gait, speed > 0, dt * speed);
    }
  }

  routeRibbons() {
    const out = [];
    for (const line of this.world.lines) {
      const r = this.routes.get(line.id);
      if (!r) continue;
      out.push({ points: this.routePoints(r), color: line.color });
    }
    return out;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.geoCache.values()) g.dispose();
    for (const c of this.cables.values()) this._dropCable(c);
  }
}
