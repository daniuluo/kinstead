// Road surfaces and road furniture: crisp road surfaces with edging stones,
// door paths, bridges, ramps, street lamps, power lines and railway track,
// and the medians of boulevards with what stands on them.
// (A soft shoulder under each road is painted into the terrain.)

import * as THREE from 'three';
import { MAT } from './materials.js';
import { GeoBuilder } from './geo.js';
import { hash2, RNG } from '../util/rng.js';

// Road surface colours per road level, with a band of kerb / edging stones
// on cobbled and paved streets (widths and shapes are in roadShape.js), and
// on a boulevard's lanes a band of setts inside the kerb along the median.
const SURF = [null, new THREE.Color('#a3835a'), new THREE.Color('#9a9488'), new THREE.Color('#5f5d5a')];
const KERB = [null, null, new THREE.Color('#bbb3a2'), new THREE.Color('#cfc9bc')];
const SETT = [null, null, new THREE.Color('#857e72'), new THREE.Color('#7b7873')];
const SETT_W = 0.04;
const CELL = 0.125, ARC = 8;
// a boulevard median laid with stone for its look: tram reservations with
// flags, promenades with cobbles (the others are grass)
const FILL = { btram: ['#9d978b', '#938d81', '#a49e92'], bprom: ['#a49a88', '#978d7c', '#aba291', '#8e8574'] };
const STATUES = ['figure', 'rider', 'column', 'obelisk', 'urn', 'angel'];
import { HALF, BAND, SIDES, CORNERS, roadTile, spillTile, shapeOf, cornerFrame, shapeAt, fieldAt, linked, diagRun } from '../world/roadShape.js';
import { bridgeDeckY, RAMP, isOpen } from '../world/world.js';
import { plainLamp, dressSpots, poleCorner } from '../world/roadDress.js';
import { medianSegs, medianPoints, boulevardSpots } from '../world/boulevard.js';
import { bench } from './buildings.js';
import { fountain, monument } from './parks.js';
import { BUILDINGS } from '../defs.js';
import { CONFIG, DRESSINGS, streetPart, lookPart } from '../config.js';

export class RoadsView {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.props = new THREE.Mesh(new THREE.BufferGeometry(), MAT.building);
    this.props.castShadow = true;
    this.props.receiveShadow = true;
    scene.add(this.props);
    this.surface = new THREE.Mesh(new THREE.BufferGeometry(), MAT.road);
    this.surface.receiveShadow = true;
    scene.add(this.surface);
    // the paths from front doors to the street, kept apart so a building
    // changing redraws just them (see rebuildDoors)
    this.doors = new THREE.Mesh(new THREE.BufferGeometry(), MAT.road);
    this.doors.receiveShadow = true;
    scene.add(this.doors);
    this.lamps = [];
    // street lamps are electric: lit(x, z) says whether one has power
    this.lit = () => false;
    // the season, for the fountains on boulevards (frozen in winter)
    this.season = 1;
    this.seasonW = 0;
    this.rebuild();
  }

  rebuild() {
    const w = this.world, N = w.N, t = w.terrain;
    const gb = new GeoBuilder();
    this.lamps = [];
    this.darkLamps = 0;
    this.poles = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const L = w.roads[w.idx(x, z)];
        if (!L) continue;
        // (a boulevard's lanes keep apart across the median: twin bridges, and
        // no ramp sideways onto the other lane's)
        const n = { N: linked(w, x, z, 0), S: linked(w, x, z, 2), W: linked(w, x, z, 3), E: linked(w, x, z, 1) };
        if (t.isWater(x, z)) { this._bridge(gb, x, z, n, L); continue; }
        for (const [dx, dz, on] of [[1, 0, n.E], [-1, 0, n.W], [0, 1, n.S], [0, -1, n.N]]) {
          if (on && w.inBounds(x + dx, z + dz) && t.isWater(x + dx, z + dz)) this._ramp(gb, x, z, dx, dz, L);
        }
        const lamp = plainLamp(w, x, z);
        if (lamp) this._lamp(gb, lamp.x, t.heightAt(lamp.x, lamp.z), lamp.z);
      }
    }
    // lamp-lit streets and planted medians (their trees and hedges grow in
    // NatureView)
    const dressed = dressSpots(w);
    for (const l of dressed.lamps) this._lamp(gb, l.x, t.heightAt(l.x, l.z), l.z);
    for (const m of dressed.medians) this._median(gb, m);
    // boulevards: what stands on their medians (the trees, hedges and
    // flowers grow in NatureView)
    this.segs = medianSegs(w);
    this.fountains = 0;
    if (this.segs.length) this._boulevards(gb, boulevardSpots(w, this.segs));
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (w.rails[w.idx(x, z)]) this._rail(gb, x, z);
    this.wired = this._wired();
    if (this.wired) this._powerLines(gb);
    const pg = gb.build();
    this.props.geometry.dispose();
    this.props.geometry = pg || new THREE.BufferGeometry();
    this.surface.geometry.dispose();
    this.surface.geometry = this._surfaces();
    this.rebuildDoors();
  }

  // Power lines go up once the town has a working generator.
  _wired() { return [...this.world.buildings.values()].some(b => BUILDINGS[b.type].generator && isOpen(b)); }

  // After a building has come, gone or changed: does more than its door path
  // need redrawing? Dressed streets leave gaps at doors (a boulevard's
  // median doesn't), and the first (or last) working generator puts up (or
  // takes down) the power lines.
  needsRebuild() {
    const d = this.world.dress;
    return !!(d && d.some(v => streetPart(v))) || this._wired() !== this.wired;
  }

  // The season (and how far it has turned): the fountains on boulevards
  // freeze over for the winter. Says whether the roads need drawing again.
  setSeason(s, sw = 0) {
    const frozen = (q, k) => ((k >= 0.5 ? (q + 1) % 4 : q) === 3);
    const was = frozen(this.season, this.seasonW);
    this.season = s;
    this.seasonW = sw;
    return this.fountains > 0 && was !== frozen(s, sw);
  }

  rebuildDoors() {
    const pos = [], col = [];
    this._doorPaths(pos, col);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    this.doors.geometry.dispose();
    this.doors.geometry = g;
  }

  // Each road tile is laid as small cells that follow the ground (see
  // roadShape.js for the shapes): a centre square plus an arm towards every
  // linked neighbour, a quarter ring where the road turns a corner, and a
  // curved fillet in the inside corner where two arms meet. Cobbled and paved
  // streets get a band of edging stones wherever the road has an edge.
  _surfaces() {
    const w = this.world, t = w.terrain, N = w.N;
    const pos = [], col = [];
    const c = new THREE.Color();
    // (only a road tile beside a bridge has a ramp up to it)
    const rampy = new Uint8Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!w.roads[z * N + x] || t.isWater(x, z)) continue;
      for (const [dx, dz] of SIDES) if (w.roadAt(x + dx, z + dz) && t.isWater(x + dx, z + dz)) rampy[z * N + x] = 1;
    }
    const height = (x, z) => {
      const tx = Math.floor(x), tz = Math.floor(z);
      if (tx >= 0 && tz >= 0 && tx < N && tz < N && rampy[tz * N + tx] && w.rampHeight(x, z) != null) return null;
      return t.heightAt(x, z) + 0.018;
    };
    // one four-sided cell (corners in order round it) in one colour (kerb:
    // 1 for edging stones, 2 for the setts along a boulevard's median)
    const cell = (p, L, kerb) => {
      const h = p.map(([x, z]) => height(x, z));
      if (h.some(v => v == null)) return;
      const mx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, mz = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
      c.copy(kerb === 2 ? SETT[L] : kerb ? KERB[L] : SURF[L]);
      c.multiplyScalar(1 + (hash2(Math.floor(mx * 16), Math.floor(mz * 16), 3) - 0.5) * (L === 2 || kerb === 2 ? 0.16 : 0.08));
      // keep the faces pointing up whichever way round the corners run
      let area = 0;
      for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) & 3]; area += a[0] * b[1] - b[0] * a[1]; }
      for (const k of area < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { pos.push(p[k][0], h[k], p[k][1]); col.push(c.r, c.g, c.b); }
    };
    // split lines across a piece: a grid shared by every tile, plus the kerb
    // band on edged sides (and the setts inside it along a median: m0, m1)
    const lines = (a, b, e0, e1, kb, m0, m1) => {
      const lo = a + (e0 ? kb : 0), hi = b - (e1 ? kb : 0), v = [a, b];
      if (e0 && kb) v.push(lo);
      if (e1 && kb) v.push(hi);
      if (m0 && kb && lo + SETT_W < hi) v.push(lo + SETT_W);
      if (m1 && kb && hi - SETT_W > lo) v.push(hi - SETT_W);
      for (let g = Math.ceil((lo + 0.03) / CELL); g * CELL < hi - 0.03; g++) v.push(g * CELL);
      return v.sort((p, q) => p - q);
    };
    const rect = (x0, z0, x1, z1, L, e) => {
      if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
      const kb = KERB[L] ? BAND : 0, sb = kb + SETT_W;
      const X = lines(x0, x1, e.x0, e.x1, kb, e.mx0, e.mx1), Z = lines(z0, z1, e.z0, e.z1, kb, e.mz0, e.mz1);
      for (let i = 0; i + 1 < X.length; i++) for (let j = 0; j + 1 < Z.length; j++) {
        const ax = X[i], bx = X[i + 1], az = Z[j], bz = Z[j + 1];
        if (bx - ax < 1e-4 || bz - az < 1e-4) continue;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const kerb = kb && ((e.x0 && mx < x0 + kb) || (e.x1 && mx > x1 - kb) || (e.z0 && mz < z0 + kb) || (e.z1 && mz > z1 - kb));
        const sett = kb && !kerb && ((e.mx0 && mx < x0 + sb) || (e.mx1 && mx > x1 - sb) || (e.mz0 && mz < z0 + sb) || (e.mz1 && mz > z1 - sb));
        cell([[ax, az], [ax, bz], [bx, bz], [bx, az]], L, kerb ? 1 : sett ? 2 : 0);
      }
    };
    // an axis-aligned piece between two points, edged on the given sides (an
    // edge towards a side of the tile with a median across it gets setts)
    let med = 0;
    const box = (L, px, pz, qx, qz, edged) => {
      const e = { x0: false, x1: false, z0: false, z1: false, mx0: false, mx1: false, mz0: false, mz1: false };
      for (const [dx, dz] of edged) {
        const m = !!(med & (dz < 0 ? 1 : dx > 0 ? 2 : dz > 0 ? 4 : 8));
        if (dx < 0) { e.x0 = true; e.mx0 = m; }
        if (dx > 0) { e.x1 = true; e.mx1 = m; }
        if (dz < 0) { e.z0 = true; e.mz0 = m; }
        if (dz > 0) { e.z1 = true; e.mz1 = m; }
      }
      rect(Math.min(px, qx), Math.min(pz, qz), Math.max(px, qx), Math.max(pz, qz), L, e);
    };
    // the quarter of a tile round corner k with no fillet: a quarter of the
    // centre square and the near half of each arm (arms narrow to meet a
    // lesser road next door)
    const quarter = (s, k) => {
      const { x, z, L, hw, arms } = s, k2 = (k + 1) & 3;
      const [ax, az] = SIDES[k], [bx, bz] = SIDES[k2], cx = x + 0.5, cz = z + 0.5;
      box(L, cx, cz, cx + (ax + bx) * hw, cz + (az + bz) * hw, [arms[k] ? null : SIDES[k], arms[k2] ? null : SIDES[k2]].filter(Boolean));
      if (arms[k]) box(L, cx + ax * hw, cz + az * hw, cx + ax * 0.5 + bx * arms[k], cz + az * 0.5 + bz * arms[k], [SIDES[k2]]);
      if (arms[k2]) box(L, cx + bx * hw, cz + bz * hw, cx + bx * 0.5 + ax * arms[k2], cz + bz * 0.5 + az * arms[k2], [SIDES[k]]);
    };
    // the quarter of a tile round corner k where two arms meet: all road but
    // a quarter ellipse of grass in the corner, edged along the curve. Cells
    // fan out along rays from the corner to the arms' centre lines.
    const fillet = (s, k) => {
      const { x, z, L, arms } = s, f = cornerFrame(x, z, k);
      const ru = 0.5 - arms[k], rv = 0.5 - arms[(k + 1) & 3];
      const kb = KERB[L] ? BAND : 0;
      const th = [Math.atan2(ru, rv)];
      for (let i = 0; i <= ARC; i++) th.push((i / ARC) * Math.PI / 2);
      th.sort((p, q) => p - q);
      const rays = th.map((a) => {
        const eu = ru * Math.cos(a), ev = rv * Math.sin(a), r = Math.hypot(eu, ev);
        const tmax = Math.min(eu > 1e-9 ? 0.5 / eu : Infinity, ev > 1e-9 ? 0.5 / ev : Infinity);
        const ts = kb ? [1, 1 + kb / r] : [1];
        const t0 = ts[ts.length - 1];
        for (let i = 1; i < 3; i++) ts.push(t0 + ((tmax - t0) * i) / 3);
        ts.push(tmax);
        return ts.map(q => [f.Kx + eu * q * f.ux + ev * q * f.vx, f.Kz + eu * q * f.uz + ev * q * f.vz]);
      });
      for (let i = 0; i + 1 < rays.length; i++) {
        if (th[i + 1] - th[i] < 1e-6) continue;
        const A = rays[i], B = rays[i + 1];
        for (let j = 0; j + 1 < A.length; j++) cell([A[j], A[j + 1], B[j + 1], B[j]], L, kb && j === 0);
      }
    };
    // a road turning a corner: a quarter ring round the inside tile corner,
    // edged on both sides, widening or narrowing smoothly to meet each arm
    const bend = (s) => {
      const { x, z, L, arms } = s, k = s.bend, f = cornerFrame(x, z, k);
      const a = arms[k], b = arms[(k + 1) & 3];
      const kb = KERB[L] ? BAND : 0;
      const n = Math.max(1, Math.round((2 * Math.max(a, b) - 2 * kb) / CELL));
      const rays = [];
      for (let i = 0; i <= ARC; i++) {
        const th = ((i / ARC) * Math.PI) / 2, co = Math.cos(th), si = Math.sin(th);
        const width = 2 * (a + ((b - a) * i) / ARC);
        const q0 = kb / width, q1 = 1 - kb / width;
        const qs = kb ? [0, q0] : [0];
        for (let j = 1; j < n; j++) qs.push((kb ? q0 : 0) + (((kb ? q1 : 1) - (kb ? q0 : 0)) * j) / n);
        if (kb) qs.push(q1);
        qs.push(1);
        rays.push(qs.map((q) => {
          const u = co * (0.5 - a + 2 * a * q), v = si * (0.5 - b + 2 * b * q);
          return [f.Kx + u * f.ux + v * f.vx, f.Kz + u * f.uz + v * f.vz];
        }));
      }
      for (let i = 0; i < ARC; i++) {
        const A = rays[i], B = rays[i + 1];
        for (let j = 0; j + 1 < A.length; j++) cell([A[j], A[j + 1], B[j + 1], B[j]], L, kb && (j === 0 || j === A.length - 2));
      }
    };
    // a tile a diagonal touches (see roadShape.js) is laid from the field,
    // in cells an eighth of a tile across, as the grid's are, in the same
    // colours. The field is a distance, so a cell whose corners are all
    // further than its half-diagonal off the road (or onto it) is wholly off
    // (or on). Where the road's edge crosses a cell it is cut in two along
    // the diagonal the edge runs nearer, each half clipped to the roadway and
    // to the band of edging stones along its edge (where the field is within
    // BAND of it); where the edge curves within it (the field isn't flat
    // across it), it is split in four first.
    const G = 16, gs = 1 / G, F = new Float32Array((G + 1) * (G + 1)), kc = new THREE.Color(), REACH = 0.09;
    const clip = (poly, t, above) => {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ia = above ? a[2] >= t : a[2] <= t, ib = above ? b[2] >= t : b[2] <= t;
        if (ia) out.push(a);
        if (ia !== ib) { const k = (t - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, t]); }
      }
      return out;
    };
    const fan = (poly, color) => {
      if (poly.length < 3) return;
      const h = poly.map(([px, pz]) => height(px, pz));
      if (h.some(v => v == null)) return;
      for (let i = 1; i + 1 < poly.length; i++) {
        const a = poly[0], b = poly[i], d = poly[i + 1];
        // keep the faces pointing up whichever way round they run
        const turn = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
        const vs = turn < 0 ? [[a, h[0]], [b, h[i]], [d, h[i + 1]]] : [[a, h[0]], [d, h[i + 1]], [b, h[i]]];
        for (const [p, y] of vs) { pos.push(p[0], y, p[1]); col.push(color.r, color.g, color.b); }
      }
    };
    // one cell (corners i0, j0 to i1, j1 in sixteenths) clipped from the samples in F
    const clipCell = (x, z, i0, j0, i1, j1, kb) => {
      const f00 = at(i0, j0), f10 = at(i1, j0), f01 = at(i0, j1), f11 = at(i1, j1);
      if (f00 > 0 && f10 > 0 && f01 > 0 && f11 > 0) return;
      const x0 = x + i0 * gs, z0 = z + j0 * gs, x1 = x + i1 * gs, z1 = z + j1 * gs;
      const halves = Math.abs(f00 - f11) < Math.abs(f10 - f01)
        ? [[[x0, z0, f00], [x1, z0, f10], [x1, z1, f11]], [[x0, z0, f00], [x1, z1, f11], [x0, z1, f01]]]
        : [[[x0, z0, f00], [x1, z0, f10], [x0, z1, f01]], [[x1, z0, f10], [x1, z1, f11], [x0, z1, f01]]];
      for (const t of halves) {
        fan(clip(t, -kb, false), c);
        if (kb) fan(clip(clip(t, 0, false), -kb, true), kc);
      }
    };
    const at = (i, j) => F[j * (G + 1) + i];
    const fieldTile = (s) => {
      const { x, z, prims } = s, put = (i, j) => { F[j * (G + 1) + i] = fieldAt(prims, x + i * gs, z + j * gs)[0]; };
      for (let j = 0; j <= G; j += 2) for (let i = 0; i <= G; i += 2) put(i, j);
      for (let J = 0; J < G; J += 2) for (let I = 0; I < G; I += 2) {
        const c00 = at(I, J), c20 = at(I + 2, J), c02 = at(I, J + 2), c22 = at(I + 2, J + 2);
        if (Math.min(c00, c20, c02, c22) > REACH) continue;
        const L = s.L || fieldAt(prims, x + (I + 1) * gs, z + (J + 1) * gs)[1];
        if (!L) continue;
        const kb = KERB[L] ? BAND : 0, n = hash2(x * G + I + 1, z * G + J + 1, 3) - 0.5;
        const solid = () => cell([[x + I * gs, z + J * gs], [x + I * gs, z + (J + 2) * gs], [x + (I + 2) * gs, z + (J + 2) * gs], [x + (I + 2) * gs, z + J * gs]], L, 0);
        if (Math.max(c00, c20, c02, c22) < -kb - REACH) { solid(); continue; }
        put(I + 1, J); put(I, J + 1); put(I + 1, J + 1); put(I + 2, J + 1); put(I + 1, J + 2);
        let lo = 9, hi = -9;
        for (let j = J; j <= J + 2; j++) for (let i = I; i <= I + 2; i++) { const f = at(i, j); if (f < lo) lo = f; if (f > hi) hi = f; }
        if (lo > 0) continue;
        if (hi <= -kb) { solid(); continue; }
        c.copy(SURF[L]).multiplyScalar(1 + n * (L === 2 ? 0.16 : 0.08));
        if (kb) kc.copy(KERB[L]).multiplyScalar(1 + n * 0.08);
        // flat across the cell (a straight edge): one cell; curving: four
        const flat = Math.abs(at(I + 1, J) - (c00 + c20) / 2) < 0.002 && Math.abs(at(I + 1, J + 2) - (c02 + c22) / 2) < 0.002
          && Math.abs(at(I, J + 1) - (c00 + c02) / 2) < 0.002 && Math.abs(at(I + 2, J + 1) - (c20 + c22) / 2) < 0.002
          && Math.abs(at(I + 1, J + 1) - (c00 + c20 + c02 + c22) / 4) < 0.002;
        if (flat) { clipCell(x, z, I, J, I + 2, J + 2, kb); continue; }
        for (let j = J; j < J + 2; j++) for (let i = I; i < I + 2; i++) clipCell(x, z, i, j, i + 1, j + 1, kb);
      }
    };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const s = w.roads[z * N + x] ? roadTile(w, x, z) : w.diagN ? spillTile(w, x, z) : null;
      if (!s) continue;
      med = w.blvd ? w.blvd[z * N + x] : 0;
      if (s.sdf) { fieldTile(s); continue; }
      if (s.bend >= 0) { bend(s); continue; }
      for (let k = 0; k < 4; k++) if (s.fillets.includes(k)) fillet(s, k); else quarter(s, k);
    }
    this._medianFill(pos, col);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  // Once the town makes electricity, poles and wires follow the streets:
  // a pole on every other road tile (near its corner), wired to the next pole
  // two tiles along when the road runs straight between them. Streets whose
  // lines have been buried (w.buried) have neither.
  _powerLines(gb) {
    const w = this.world, t = w.terrain, N = w.N;
    const up = (x, z) => !(w.buried && w.buried[w.idx(x, z)]);
    // a diagonal (see roadShape.js diagRun): a pole on every other tile by x,
    // on its verge off to one side, wired to the next one two tiles down it;
    // none where diagonals meet anything
    const onDiag = (x, z) => !!w.diagN && w.inBounds(x, z) && !!(w.diag[w.idx(x, z)] & 15);
    const run = (x, z) => (onDiag(x, z) ? diagRun(roadTile(w, x, z)) : -1);
    const has = (x, z) => w.roadAt(x, z) && !t.isWater(x, z) && up(x, z) && (onDiag(x, z) ? run(x, z) >= 0 && (x & 1) === 0 : ((x + z) & 1) === 0);
    // a pole stands in the verge by the tile's south-east corner (on a
    // boulevard, by the lane's outer verge), tucked further into the corner
    // where the road curves round it
    const H = 0.5, spots = new Map();
    const at = (x, z) => {
      const key = z * N + x;
      if (spots.has(key)) return spots.get(key);
      const r = run(x, z);
      if (r >= 0) {
        const [sx, sz] = CORNERS[1 - r], k = 0.3 / Math.SQRT2;
        const p = [x + 0.5 + sx * k, t.heightAt(x + 0.5 + sx * k, z + 0.5 + sz * k) + H - 0.05, z + 0.5 + sz * k];
        spots.set(key, p);
        return p;
      }
      const s = roadTile(w, x, z), [sx, sz] = poleCorner(w, x, z);
      const on = (px, pz) => s && (shapeAt(s, px, pz, 0) || shapeAt(s, px - sx * 0.035, pz) || shapeAt(s, px, pz - sz * 0.035) || shapeAt(s, px - sx * 0.025, pz - sz * 0.025));
      let k = 0.31;
      while (k < 0.45 && on(x + 0.5 + sx * k, z + 0.5 + sz * k)) k += 0.02;
      const p = [x + 0.5 + sx * k, t.heightAt(x + 0.5 + sx * k, z + 0.5 + sz * k) + H - 0.05, z + 0.5 + sz * k];
      spots.set(key, p);
      return p;
    };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!has(x, z)) continue;
      const [px, py, pz] = at(x, z);
      const g = py - H + 0.05;
      gb.cyl(px, g - 0.02, pz, 0.011, 0.015, H + 0.02, 6, '#5e4630');
      this.poles++;
      const r = run(x, z);
      gb.box(px, g + H - 0.06, pz, 0.15, 0.013, 0.015, '#5e4630', r >= 0 ? 0 : Math.PI / 4);
      if (r >= 0) {
        const [dx, dz] = CORNERS[r === 0 ? 2 : 1];
        if (!has(x + 2 * dx, z + 2 * dz) || run(x + 2 * dx, z + 2 * dz) !== r || run(x + dx, z + dz) !== r || !up(x + dx, z + dz)) continue;
        const [qx, qy, qz] = at(x + 2 * dx, z + 2 * dz);
        const flat = Math.hypot(qx - px, qz - pz), len = Math.hypot(flat, qy - py), mx = (px + qx) / 2, my = (py + qy) / 2 - 0.02, mz = (pz + qz) / 2;
        const ry = Math.atan2(qx - px, qz - pz), ox = Math.cos(ry) * 0.045, oz = -Math.sin(ry) * 0.045;
        for (const s of [-1, 1]) gb.boxC(mx + ox * s, my, mz + oz * s, 0.005, 0.005, len, '#2a2622', -Math.atan2(qy - py, flat), ry);
        continue;
      }
      for (const [dx, dz] of [[2, 0], [0, 2]]) {
        if (!has(x + dx, z + dz) || !linked(w, x, z, dx ? 1 : 2) || !linked(w, x + dx / 2, z + dz / 2, dx ? 1 : 2) || !up(x + dx / 2, z + dz / 2)) continue;
        const [qx, qy, qz] = at(x + dx, z + dz);
        const len = Math.hypot(qx - px, qy - py, qz - pz), mx = (px + qx) / 2, my = (py + qy) / 2 - 0.02, mz = (pz + qz) / 2;
        for (const s of [-0.045, 0.045]) {
          if (dx) gb.boxC(mx, my, mz + s, len, 0.005, 0.005, '#2a2622', 0, 0, Math.atan2(qy - py, qx - px));
          else gb.boxC(mx + s, my, mz, 0.005, 0.005, len, '#2a2622', -Math.atan2(qy - py, qz - pz));
        }
      }
    }
  }

  // A planted median: a low strip of edging stones down the middle of a
  // paved street, filled with soil and grass, laid in short pieces that
  // follow the ground and narrowed to a nose where it ends.
  _median(gb, m) {
    const t = this.world.terrain;
    const alongX = Math.abs(m.x1 - m.x0) > Math.abs(m.z1 - m.z0);
    const len = Math.hypot(m.x1 - m.x0, m.z1 - m.z0), n = Math.max(1, Math.round(len / 0.125));
    const end = (v) => Math.abs(v - Math.round(v)) > 0.05;   // not at a tile edge: the median stops here
    const nose0 = end(alongX ? m.x0 : m.z0), nose1 = end(alongX ? m.x1 : m.z1);
    const P = (a) => [m.x0 + (m.x1 - m.x0) * a, m.z0 + (m.z1 - m.z0) * a];
    for (let k = 0; k < n; k++) {
      const seg = len / n + 0.002;
      const [mx, mz] = P((k + 0.5) / n);
      const y = t.heightAt(mx, mz) + 0.012;
      const wide = (k === 0 && nose0) || (k === n - 1 && nose1) ? 0.075 : 0.11;
      gb.box(mx, y, mz, alongX ? seg : wide, 0.03, alongX ? wide : seg, '#cfc9bc');
      // the planted bed inside, stopping short of the stones at a nose
      const i0 = k === 0 && nose0 ? 0.015 / len : 0, i1 = k === n - 1 && nose1 ? 0.015 / len : 0;
      const [gx, gz] = P((k + 0.5) / n + (i0 - i1) / 2), inner = seg - (i0 + i1) * len;
      gb.box(gx, y, gz, alongX ? inner : wide - 0.03, 0.036, alongX ? wide - 0.03 : inner, k % 2 ? '#6c8744' : '#66803f');
    }
  }

  // A boulevard's median paved with flags (a tram reservation) or cobbled
  // (a promenade): small cells over the ground between the lanes, and into
  // the curved corners of the road round a point where the median ends in a
  // nose or turns a corner. They lie a little under the road surface and
  // reach in under its edge, so the road's own crisp edge and kerb stones
  // bound them. (Grass medians are the ground itself.)
  _medianFill(pos, col) {
    const w = this.world, t = w.terrain, N = w.N, M = N + 1;
    const segs = this.segs || medianSegs(w);
    if (!segs.some(s => FILL[s.look])) return;
    const pts = medianPoints(w, segs);
    const todo = new Set();
    for (const s of segs) if (FILL[s.look]) { todo.add(s.a); todo.add(s.b); }
    for (const [k, look] of pts) {
      if (!FILL[look]) continue;
      const px = k % M, pz = (k / M) | 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (w.roadAt(px + dx, pz + dz)) todo.add((pz + dz) * N + px + dx);
    }
    // corner k of a tile (as in cornerFrame) as a lattice point offset
    const CK = [[1, 0], [1, 1], [0, 1], [0, 0]];
    const ell = (u, v, ru, rv) => (u / ru) * (u / ru) + (v / rv) * (v / rv);
    const G = 16, step = 1 / G, c = new THREE.Color();
    for (const i of todo) {
      const x = i % N, z = (i / N) | 0, s = roadTile(w, x, z);
      if (!s) continue;
      const m = w.blvd[i], D = DRESSINGS[lookPart(w.dress[i])];
      const own = m && D && D.blvd ? D.key : null;
      // the strips along this lane's median sides (not towards a bridge)
      let strips = 0;
      for (let k = 0; k < 4; k++) if (m & (1 << k)) { const [dx, dz] = SIDES[k]; if (!t.isWater(x + dx, z + dz)) strips |= 1 << k; }
      const corner = CK.map(([cx, cz]) => pts.get((z + cz) * M + x + cx) ?? null);
      // the look of the median at a point of this tile, or null (road or verge)
      const at = (px, pz) => {
        if (shapeAt(s, px, pz, 0)) return null;
        const inCorner = (k) => {
          const f = cornerFrame(x, z, k), dx = px - f.Kx, dz = pz - f.Kz;
          const u = dx * f.ux + dz * f.uz, v = dx * f.vx + dz * f.vz;
          return u >= 0 && v >= 0 && u <= 0.5 && v <= 0.5 && ell(u, v, 0.5 - s.arms[k], 0.5 - s.arms[(k + 1) & 3]) < 1;
        };
        if (s.bend >= 0) return inCorner(s.bend) ? corner[s.bend] : strips ? own : null;
        for (const k of s.fillets) if (inCorner(k)) return corner[k];
        const lx = px - x - 0.5, lz = pz - z - 0.5, hw = s.hw;
        return ((strips & 1) && lz < -hw) || ((strips & 4) && lz > hw) || ((strips & 2) && lx > hw) || ((strips & 8) && lx < -hw) ? own : null;
      };
      for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) {
        const x0 = x + a * step, z0 = z + b * step, x1 = x0 + step, z1 = z0 + step;
        // any part of the cell on the median (the rest lies under the road)
        let look = at(x0 + step / 2, z0 + step / 2);
        if (!look) for (const [px, pz] of [[x0 + 0.003, z0 + 0.003], [x1 - 0.003, z0 + 0.003], [x0 + 0.003, z1 - 0.003], [x1 - 0.003, z1 - 0.003]]) if ((look = at(px, pz))) break;
        const pal = FILL[look];
        if (!pal) continue;
        const gx = x * G + a, gz = z * G + b;
        // flags two cells square in courses for the tram's paving; cobbles cell by cell
        const hh = look === 'btram' ? hash2(gx >> 1, (gz >> 1) + (((gx >> 1) & 1) ? 7 : 0), 31) : hash2(gx, gz, 33);
        c.set(pal[Math.floor(hh * pal.length)]).multiplyScalar(0.95 + hash2(gx, gz, 35) * 0.1);
        const p = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
        const h = p.map(([px, pz]) => t.heightAt(px, pz) + 0.012);
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(p[k][0], h[k], p[k][1]); col.push(c.r, c.g, c.b); }
      }
    }
  }

  // What stands on boulevards' medians (positions from boulevard.js):
  // lamps, benches, fountains (frozen over in winter) and statues on
  // promenades, tram rails with their wires, poles and shelters, and the
  // beds the flowers grow in.
  _boulevards(gb, sp) {
    const t = this.world.terrain, gy = (x, z) => t.heightAt(x, z);
    const c = { gb, gy, rng: new RNG(1), season: this.season, seasonW: this.seasonW, addGlow() {} };
    // a park piece built round its own spot, its ground level at 0
    const at = (x, z, ry, fn) => {
      const y = gy(x, z);
      gb.push(x, y, z, ry);
      fn({ ...c, gy: (lx, lz) => { const co = Math.cos(ry), si = Math.sin(ry); return gy(x + lx * co + lz * si, z - lx * si + lz * co) - y; }, rng: new RNG(Math.floor(x * 131 + z * 977)), variant: Math.floor(x * 31 + z * 17) });
      gb.pop();
    };
    for (const l of sp.lamps) this._lamp(gb, l.x, gy(l.x, l.z), l.z);
    for (const b of sp.benches) bench(c, b.x, b.z, b.ry);
    for (const f of sp.fountains) {
      at(f.x, f.z, 0, (cc) => fountain(cc, 0, 0, f.r, f.h < 0.5 ? 'tiers' : 'figure'));
      this.fountains++;
    }
    for (const s of sp.statues) at(s.x, s.z, s.ry, (cc) => monument(cc, 0, 0, STATUES[Math.floor(s.h * STATUES.length)], 0.55));
    // flower beds: soil within a low stone edge (the flowers are NatureView's)
    for (const b of sp.beds) {
      const y = gy(b.x, b.z), lx = b.alongX ? b.len : b.wid, lz = b.alongX ? b.wid : b.len;
      gb.cbox(b.x, y - 0.02, b.z, lx + 0.03, 0.04, lz + 0.03, '#b8b0a2', 0, 0.012);
      gb.cbox(b.x, y - 0.02, b.z, lx, 0.047, lz, b.h < 0.5 ? '#5e4430' : '#56402c', 0, 0.01);
    }
    // tram rails let into the paving, and the wire above them
    const along = (s, n, fn) => {
      for (let k = 0; k < n; k++) {
        const a = k / n, e = (k + 1) / n;
        const ax = s.x0 + (s.x1 - s.x0) * a, az = s.z0 + (s.z1 - s.z0) * a, bx = s.x0 + (s.x1 - s.x0) * e, bz = s.z0 + (s.z1 - s.z0) * e;
        fn((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az), Math.atan2(bx - ax, bz - az), gy(bx, bz) - gy(ax, az));
      }
    };
    for (const r of sp.rails) along(r, 4, (mx, mz, len, ry, dh) => gb.boxC(mx, gy(mx, mz) + 0.017, mz, 0.014, 0.009, Math.hypot(len, dh) + 0.004, '#55595f', -Math.atan2(dh, len), ry));
    for (const r of sp.wires) along(r, 2, (mx, mz, len, ry, dh) => gb.boxC(mx, gy(mx, mz) + 0.445, mz, 0.004, 0.004, Math.hypot(len, dh) + 0.01, '#2a2622', -Math.atan2(dh, len), ry));
    // the poles carrying the wire, an arm out over the rails and a lantern
    // hung from it
    for (const p of sp.poles) {
      const y = gy(p.x, p.z), reach = 0.2;
      gb.cyl(p.x, y - 0.02, p.z, 0.011, 0.016, 0.49, 6, '#3a4440');
      gb.boxC(p.x + p.ax * reach / 2, y + 0.45, p.z + p.az * reach / 2, p.az ? 0.012 : reach, 0.012, p.ax ? 0.012 : reach, '#3a4440');
      this._lantern(gb, p.x + p.ax * reach * 0.35, y + 0.4, p.z + p.az * reach * 0.35, y);
    }
    // a tram shelter: a canopy on two posts, a glazed back and a bench
    for (const s of sp.shelters) {
      gb.push(s.x, gy(s.x, s.z), s.z, s.ry);
      for (const ox of [-0.1, 0.1]) gb.box(ox, -0.01, -0.035, 0.014, 0.23, 0.014, '#2f4a3a');
      gb.box(0, 0.01, -0.04, 0.2, 0.17, 0.006, '#a8c0c6');
      gb.box(0, 0.215, -0.005, 0.25, 0.016, 0.1, '#3a4a44');
      gb.box(0, 0.035, -0.015, 0.16, 0.012, 0.04, '#7a5636');
      for (const ox of [-0.065, 0.065]) gb.box(ox, 0, -0.015, 0.01, 0.035, 0.035, '#3f342c');
      gb.pop();
    }
  }

  // A lantern hung from a pole's arm: lit at night when the town has power.
  _lantern(gb, x, y, z, ground) {
    const on = this.lit(x, z);
    gb.box(x, y + 0.035, z, 0.004, 0.012, 0.004, '#2f2c2a');
    if (on) gb.glow(2.2, 1.6, 0.8, 3.0);
    gb.box(x, y - 0.005, z, 0.03, 0.04, 0.03, on ? '#ffe2a0' : '#9a958a');
    gb.noGlow();
    gb.cone(x, y + 0.035, z, 0.026, 0.02, 4, '#2f2c2a', Math.PI / 4);
    if (on) this.lamps.push({ x, y: y + 0.015, z, ground }); else this.darkLamps++;
  }

  _lamp(gb, x, y, z) {
    const on = this.lit(x, z);
    gb.cyl(x, y - 0.02, z, 0.012, 0.017, 0.36, 6, '#2f2c2a');
    gb.cbox(x, y - 0.02, z, 0.035, 0.05, 0.035, '#2f2c2a', 0, 0.006);
    if (on) gb.glow(2.2, 1.6, 0.8, 3.0);
    gb.box(x, y + 0.34, z, 0.042, 0.052, 0.042, on ? '#ffe2a0' : '#9a958a');
    gb.noGlow();
    gb.cone(x, y + 0.392, z, 0.037, 0.036, 4, '#2f2c2a', Math.PI / 4);
    if (on) this.lamps.push({ x, y: y + 0.366, z, ground: y }); else this.darkLamps++;
  }

  _bridge(gb, x, z, n, L) {
    const y = bridgeDeckY();
    const cx = x + 0.5, cz = z + 0.5;
    const alongX = (n.E || n.W) && !(n.N || n.S);
    const alongZ = (n.N || n.S) && !(n.E || n.W);
    const wood = L >= 2 ? '#8a8276' : '#7d5b3b', wood2 = L >= 2 ? '#7a7368' : '#6e4e31';
    const deck = (ry) => {
      gb.push(cx, 0, cz, ry);
      for (let k = 0; k < 8; k++) gb.box((hash2(x * 8 + k, z, 4) - 0.5) * 0.02, y - 0.05, -0.5 + (k + 0.5) / 8, 0.64, 0.05, 1 / 8 - 0.01, k % 2 ? wood : wood2);
      gb.box(0, y - 0.075, 0, 0.6, 0.03, 1.0, '#4a3a2c');
      for (const s of [-1, 1]) {
        for (const pz of [-0.4, 0, 0.4]) gb.box(s * 0.31, y, pz, 0.028, 0.13, 0.028, '#4e3a2a');
        gb.box(s * 0.31, y + 0.11, 0, 0.022, 0.022, 1.0, '#5e432c');
        for (const pz of [-0.45, 0.45]) gb.cyl(s * 0.26, -0.9, pz, 0.03, 0.035, y - 0.05 + 0.9, 7, '#3f3126');
      }
      gb.pop();
    };
    if (alongX) deck(Math.PI / 2);
    else if (alongZ) deck(0);
    else {
      gb.box(cx, y - 0.05, cz, 0.64, 0.05, 0.64, wood);
      for (const [dx, dz, key] of [[0, -1, 'N'], [0, 1, 'S'], [-1, 0, 'W'], [1, 0, 'E']]) {
        if (n[key]) gb.box(cx + dx * 0.41, y - 0.05, cz + dz * 0.41, dx ? 0.2 : 0.64, 0.05, dz ? 0.2 : 0.64, wood2);
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.cyl(cx + sx * 0.26, -0.9, cz + sz * 0.26, 0.03, 0.035, y - 0.05 + 0.9, 7, '#3f3126');
    }
  }

  // A little path from every front door straight out to the street: stone
  // flags beside cobbled and paved streets, a worn earth path by dirt roads.
  // It runs until it meets the roadway (further where the street curves away
  // round a corner) and flares out in a curve where it joins it.
  _doorPaths(pos, col) {
    const w = this.world, t = w.terrain, N = w.N;
    const c = new THREE.Color();
    const shapes = new Map();
    const onRoad = (px, pz) => {
      const key = Math.floor(pz) * N + Math.floor(px);
      if (!shapes.has(key)) shapes.set(key, shapeOf(w, Math.floor(px), Math.floor(pz)));
      const s = shapes.get(key);
      return s ? shapeAt(s, px, pz, 0) : 0;
    };
    const R = 0.06;
    const flare = (d) => (d >= R ? 0 : d <= 0 ? R : R - Math.sqrt(R * R - (R - d) * (R - d)));
    // a stretch of path from a to b, half0 / half1 wide either side at its ends
    const quad = (ax, az, bx, bz, half0, half1, nx, nz, color) => {
      const p = [[ax - nx * half0, az - nz * half0], [ax + nx * half0, az + nz * half0], [bx + nx * half1, bz + nz * half1], [bx - nx * half1, bz - nz * half1]];
      const h = p.map(([x, z]) => t.heightAt(x, z) + 0.016);
      const tri = [0, 1, 2, 0, 2, 3];
      // keep the faces pointing up whichever way the path runs
      const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
      const order = cross > 0 ? [0, 2, 1, 0, 3, 2] : tri;
      for (const k of order) { pos.push(p[k][0], h[k], p[k][1]); col.push(color.r, color.g, color.b); }
    };
    for (const b of w.buildings.values()) {
      const d = b.door;
      if (!d || !b.access || BUILDINGS[b.type].park) continue;
      const L = w.roadAt(b.access.x, b.access.z);
      if (!L || t.isWater(b.access.x, b.access.z)) continue;
      const cx = b.access.x + 0.5, cz = b.access.z + 0.5;
      const sx = d.x + d.dx * 0.03, sz = d.z + d.dz * 0.03;
      // run out along the door's facing until the edge of the roadway
      const along = (cx - sx) * d.dx + (cz - sz) * d.dz;
      let reach = along - HALF[L];
      for (let s = 0; s <= along + 0.05; s += 0.01) if (onRoad(sx + d.dx * s, sz + d.dz * s)) { reach = s; break; }
      const len = reach + 0.03;
      if (len < 0.03 || len > 1.6) continue;
      const nx = -d.dz, nz = d.dx;
      // one piece of path, split finer where it flares into the street
      const piece = (a, e, half, color) => {
        const n = e > reach - R ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const s0 = a + ((e - a) * i) / n, s1 = a + ((e - a) * (i + 1)) / n;
          quad(sx + d.dx * s0, sz + d.dz * s0, sx + d.dx * s1, sz + d.dz * s1, half + flare(reach - s0), half + flare(reach - s1), nx, nz, color);
        }
      };
      if (L === 1) {
        c.set('#9a805c');
        const n = Math.ceil(len / 0.08);
        for (let i = 0; i < n; i++) piece((i / n) * len, ((i + 1) / n) * len, 0.036 + 0.006 * Math.sin(i * 2.1), c);
      } else {
        for (let a = 0, i = 0; a < len - 0.02; a += 0.068, i++) {
          const e = Math.min(len, a + 0.056);
          c.set(i % 2 ? '#d6ccb4' : '#c4b89c').multiplyScalar(0.95 + hash2(b.id, i, 7) * 0.1);
          piece(a, e, 0.05, c);
        }
      }
    }
  }

  // Approach from the bank up (or down) to a bridge deck: a sloped deck on a
  // stone embankment, with an abutment wall where it meets the bridge.
  _ramp(gb, x, z, dx, dz, L) {
    const w = this.world, t = w.terrain;
    const n = 5, step = RAMP / n;
    const wood = L >= 2 ? '#8a8276' : '#7d5b3b', wood2 = L >= 2 ? '#7a7368' : '#6e4e31', stone = '#8f877a';
    const ex = x + 0.5 + dx * 0.5, ez = z + 0.5 + dz * 0.5;   // middle of the shared edge
    const ry = Math.atan2(-dx, -dz);                           // local +z runs from the edge into the land
    const at = (d) => w.rampHeight(ex - dx * (d + 1e-4), ez - dz * (d + 1e-4));
    for (let k = 0; k < n; k++) {
      const d0 = k * step, d1 = (k + 1) * step;
      const y0 = at(d0), y1 = at(Math.min(d1, RAMP - 1e-3));
      if (y0 == null || y1 == null) continue;
      const mx = ex - dx * (d0 + d1) / 2, mz = ez - dz * (d0 + d1) / 2, my = (y0 + y1) / 2;
      gb.push(mx, 0, mz, ry);
      gb.boxC(0, my - 0.025, 0, 0.64, 0.05, Math.hypot(step, y1 - y0) + 0.012, k % 2 ? wood : wood2, -Math.atan2(y1 - y0, step));
      const g = t.heightAt(mx, mz);
      const lo = Math.min(g, my) - 0.04;
      if (my - 0.05 - lo > 0.015) gb.box(0, lo, 0, 0.6, my - 0.05 - lo, step + 0.004, stone);
      if (L >= 2) for (const s of [-1, 1]) gb.boxC(s * 0.31, my + 0.01, 0, 0.03, 0.03, step + 0.01, '#9a9284', -Math.atan2(y1 - y0, step));
      gb.pop();
    }
    const base = Math.min(t.heightAt(ex, ez), CONFIG.WATER_LEVEL) - 0.35;
    gb.push(ex, 0, ez, ry);
    gb.box(0, base, 0.035, 0.74, bridgeDeckY() - 0.055 - base, 0.07, stone);
    gb.pop();
  }

  _rail(gb, x, z) {
    const w = this.world, t = w.terrain;
    const cx = x + 0.5, cz = z + 0.5;
    const water = t.isWater(x, z);
    const yAt = (px, pz) => (water ? bridgeDeckY() : t.heightAt(px, pz) + 0.012);
    const arms = [];
    for (const [dx, dz, ry] of [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]]) {
      if (w.railAt(x + dx, z + dz)) arms.push([dx, dz, ry]);
    }
    if (arms.length === 0) arms.push([0, 1, 0], [0, -1, Math.PI]);
    if (arms.length === 1) arms.push([-arms[0][0], -arms[0][1], arms[0][2] + Math.PI]);
    // a single bend: lay the track on a quarter-circle so trains corner smoothly
    const arc = railArc(x, z, arms);
    if (arc) {
      const pts = arc.map(([px, pz]) => [px, yAt(px, pz), pz]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az), dh = by - ay;
        gb.pushEuler(ax, ay, az, -Math.atan2(dh, len), Math.atan2(bx - ax, bz - az));
        const L = Math.hypot(len, dh);
        if (water) gb.box(0, -0.035, L / 2, 0.36, 0.045, L + 0.02, '#5e4a38');
        if (i % 2 === 0) gb.box(0, -0.004, L / 2, 0.3, 0.022, 0.055, '#5e432c');
        for (const sd of [-1, 1]) gb.box(sd * 0.075, 0.016, L / 2, 0.02, 0.026, L + 0.02, '#7d8187');
        gb.pop();
      }
      if (water) gb.cyl(cx, -0.9, cz, 0.032, 0.036, bridgeDeckY() - 0.05 + 0.9, 7, '#3f3126');
      return;
    }
    const hc = yAt(cx, cz);
    for (const [dx, dz, ry] of arms) {
      const ex = cx + dx * 0.5, ez = cz + dz * 0.5;
      const he = yAt(ex - dx * 0.001, ez - dz * 0.001);
      const dh = he - hc;
      const len = Math.hypot(0.5, dh);
      gb.pushEuler(cx, hc, cz, -Math.atan2(dh, 0.5), ry);
      if (water) gb.box(0, -0.035, len / 2, 0.36, 0.045, len + 0.02, '#5e4a38');
      for (let k = 0; k < 3; k++) gb.box((hash2(x * 3 + k, z, 7) - 0.5) * 0.02, -0.004, (len * (k + 0.5)) / 3, 0.3, 0.022, 0.055, '#5e432c');
      for (const s of [-1, 1]) gb.box(s * 0.075, 0.016, len / 2, 0.02, 0.026, len + 0.012, '#7d8187');
      gb.pop();
      if (water) gb.cyl(ex - dx * 0.25, -0.9, ez - dz * 0.25, 0.032, 0.036, bridgeDeckY() - 0.05 + 0.9, 7, '#3f3126');
    }
  }

  dispose() {
    this.surface.geometry.dispose(); this.scene.remove(this.surface);
    this.doors.geometry.dispose(); this.scene.remove(this.doors);
    this.scene.remove(this.props);
    this.props.geometry.dispose();
  }
}

// For a track tile with exactly two perpendicular arms, the quarter-circle
// (radius 0.5, centred on the shared tile corner) joining the two edge
// midpoints; otherwise null. arms: [[dx, dz], ...]
export function railArc(x, z, arms, steps = 8) {
  if (arms.length !== 2) return null;
  const [a, b] = arms;
  if (a[0] * b[0] + a[1] * b[1] !== 0) return null;
  const cx = x + 0.5, cz = z + 0.5;
  const ox = cx + (a[0] + b[0]) * 0.5, oz = cz + (a[1] + b[1]) * 0.5;
  const a0 = Math.atan2(cz + a[1] * 0.5 - oz, cx + a[0] * 0.5 - ox);
  let a1 = Math.atan2(cz + b[1] * 0.5 - oz, cx + b[0] * 0.5 - ox);
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (d * i) / steps;
    pts.push([ox + Math.cos(t) * 0.5, oz + Math.sin(t) * 0.5]);
  }
  return pts;
}
