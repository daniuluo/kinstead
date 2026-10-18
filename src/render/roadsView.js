// Road surfaces and road furniture: crisp road surfaces with edging stones,
// door paths, bridges, ramps, street lamps, power lines and railway track.
// (A soft shoulder under each road is painted into the terrain.)

import * as THREE from 'three';
import { MAT } from './materials.js';
import { GeoBuilder } from './geo.js';
import { hash2 } from '../util/rng.js';

// Road surface colours per road level, with a band of kerb / edging stones
// on cobbled and paved streets (widths and shapes are in roadShape.js).
const SURF = [null, new THREE.Color('#a3835a'), new THREE.Color('#9a9488'), new THREE.Color('#5f5d5a')];
const KERB = [null, null, new THREE.Color('#bbb3a2'), new THREE.Color('#cfc9bc')];
const CELL = 0.125, ARC = 8;
import { HALF, BAND, SIDES, roadTile, cornerFrame, shapeAt } from '../world/roadShape.js';
import { bridgeDeckY, RAMP, isOpen } from '../world/world.js';
import { plainLamp, dressSpots } from '../world/roadDress.js';
import { BUILDINGS } from '../defs.js';
import { CONFIG } from '../config.js';

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
        const n = { N: !!w.roadAt(x, z - 1), S: !!w.roadAt(x, z + 1), W: !!w.roadAt(x - 1, z), E: !!w.roadAt(x + 1, z) };
        if (t.isWater(x, z)) { this._bridge(gb, x, z, n, L); continue; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (w.roadAt(x + dx, z + dz) && w.inBounds(x + dx, z + dz) && t.isWater(x + dx, z + dz)) this._ramp(gb, x, z, dx, dz, L);
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
  // need redrawing? Dressed streets leave gaps at doors, and the first (or
  // last) working generator puts up (or takes down) the power lines.
  needsRebuild() {
    const d = this.world.dress;
    return !!(d && d.some(Boolean)) || this._wired() !== this.wired;
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
    const height = (x, z) => {
      if (w.rampHeight(x, z) != null) return null;
      return t.heightAt(x, z) + 0.018;
    };
    // one four-sided cell (corners in order round it) in one colour
    const cell = (p, L, kerb) => {
      const h = p.map(([x, z]) => height(x, z));
      if (h.some(v => v == null)) return;
      const mx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, mz = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
      c.copy(kerb ? KERB[L] : SURF[L]);
      c.multiplyScalar(1 + (hash2(Math.floor(mx * 16), Math.floor(mz * 16), 3) - 0.5) * (L === 2 ? 0.16 : 0.08));
      // keep the faces pointing up whichever way round the corners run
      let area = 0;
      for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) & 3]; area += a[0] * b[1] - b[0] * a[1]; }
      for (const k of area < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { pos.push(p[k][0], h[k], p[k][1]); col.push(c.r, c.g, c.b); }
    };
    // split lines across a piece: a grid shared by every tile, plus the kerb
    // band on edged sides
    const lines = (a, b, e0, e1, kb) => {
      const lo = a + (e0 ? kb : 0), hi = b - (e1 ? kb : 0), v = [a, b];
      if (e0 && kb) v.push(lo);
      if (e1 && kb) v.push(hi);
      for (let g = Math.ceil((lo + 0.03) / CELL); g * CELL < hi - 0.03; g++) v.push(g * CELL);
      return v.sort((p, q) => p - q);
    };
    const rect = (x0, z0, x1, z1, L, e) => {
      if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
      const kb = KERB[L] ? BAND : 0;
      const X = lines(x0, x1, e.x0, e.x1, kb), Z = lines(z0, z1, e.z0, e.z1, kb);
      for (let i = 0; i + 1 < X.length; i++) for (let j = 0; j + 1 < Z.length; j++) {
        const ax = X[i], bx = X[i + 1], az = Z[j], bz = Z[j + 1];
        if (bx - ax < 1e-4 || bz - az < 1e-4) continue;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const kerb = kb && ((e.x0 && mx < x0 + kb) || (e.x1 && mx > x1 - kb) || (e.z0 && mz < z0 + kb) || (e.z1 && mz > z1 - kb));
        cell([[ax, az], [ax, bz], [bx, bz], [bx, az]], L, kerb);
      }
    };
    // an axis-aligned piece between two points, edged on the given sides
    const box = (L, px, pz, qx, qz, edged) => {
      const e = { x0: false, x1: false, z0: false, z1: false };
      for (const [dx, dz] of edged) { if (dx < 0) e.x0 = true; if (dx > 0) e.x1 = true; if (dz < 0) e.z0 = true; if (dz > 0) e.z1 = true; }
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
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const s = roadTile(w, x, z);
      if (!s) continue;
      if (s.bend >= 0) { bend(s); continue; }
      for (let k = 0; k < 4; k++) if (s.fillets.includes(k)) fillet(s, k); else quarter(s, k);
    }
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
    const has = (x, z) => w.roadAt(x, z) && !t.isWater(x, z) && ((x + z) & 1) === 0 && up(x, z);
    // a pole stands in the verge by the tile's south-east corner, tucked
    // further into the corner where the road curves round it
    const H = 0.5, spots = new Map();
    const at = (x, z) => {
      const key = z * N + x;
      if (spots.has(key)) return spots.get(key);
      const s = roadTile(w, x, z);
      const on = (px, pz) => s && (shapeAt(s, px, pz, 0) || shapeAt(s, px - 0.035, pz) || shapeAt(s, px, pz - 0.035) || shapeAt(s, px - 0.025, pz - 0.025));
      let k = 0.31;
      while (k < 0.45 && on(x + 0.5 + k, z + 0.5 + k)) k += 0.02;
      const p = [x + 0.5 + k, t.heightAt(x + 0.5 + k, z + 0.5 + k) + H - 0.05, z + 0.5 + k];
      spots.set(key, p);
      return p;
    };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!has(x, z)) continue;
      const [px, py, pz] = at(x, z);
      const g = py - H + 0.05;
      gb.cyl(px, g - 0.02, pz, 0.011, 0.015, H + 0.02, 6, '#5e4630');
      this.poles++;
      gb.box(px, g + H - 0.06, pz, 0.15, 0.013, 0.015, '#5e4630', Math.PI / 4);
      for (const [dx, dz] of [[2, 0], [0, 2]]) {
        if (!has(x + dx, z + dz) || !w.roadAt(x + dx / 2, z + dz / 2) || !up(x + dx / 2, z + dz / 2)) continue;
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
      if (!shapes.has(key)) shapes.set(key, roadTile(w, Math.floor(px), Math.floor(pz)));
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
