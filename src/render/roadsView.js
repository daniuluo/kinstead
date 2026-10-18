// 3D road furniture: bridges, street lamps and railway track.
// (Road and track surfaces themselves are painted into the terrain.)

import * as THREE from 'three';
import { MAT } from './materials.js';
import { GeoBuilder } from './geo.js';
import { hash2 } from '../util/rng.js';

// Road surface widths (half-width) and colours per road level, with a band
// of kerb / edging stones on cobbled and paved streets.
const HALF = [0, 0.16, 0.215, 0.27];
const SURF = [null, new THREE.Color('#a3835a'), new THREE.Color('#9a9488'), new THREE.Color('#5f5d5a')];
const KERB = [null, null, new THREE.Color('#bbb3a2'), new THREE.Color('#cfc9bc')];
const BAND = 0.035, CELL = 0.125;
import { bridgeDeckY, RAMP, isOpen } from '../world/world.js';
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
    this.lamps = [];
    this.rebuild();
  }

  rebuild() {
    const w = this.world, N = w.N, t = w.terrain;
    const gb = new GeoBuilder();
    this.lamps = [];
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const L = w.roads[w.idx(x, z)];
        if (!L) continue;
        const n = { N: !!w.roadAt(x, z - 1), S: !!w.roadAt(x, z + 1), W: !!w.roadAt(x - 1, z), E: !!w.roadAt(x + 1, z) };
        if (t.isWater(x, z)) { this._bridge(gb, x, z, n, L); continue; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (w.roadAt(x + dx, z + dz) && w.inBounds(x + dx, z + dz) && t.isWater(x + dx, z + dz)) this._ramp(gb, x, z, dx, dz, L);
        }
        if (L >= 2 && !w.railAt(x, z)) {
          const straightNS = n.N && n.S && !n.E && !n.W, straightEW = n.E && n.W && !n.N && !n.S;
          if ((straightNS || straightEW) && hash2(x, z, 91) < 0.4) {
            const side = hash2(x, z, 92) < 0.5 ? -1 : 1;
            const lx = x + 0.5 + (straightNS ? side * 0.31 : 0);
            const lz = z + 0.5 + (straightEW ? side * 0.31 : 0);
            this._lamp(gb, lx, t.heightAt(lx, lz), lz);
          }
        }
      }
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (w.rails[w.idx(x, z)]) this._rail(gb, x, z);
    if ([...w.buildings.values()].some(b => BUILDINGS[b.type].generator && isOpen(b))) this._powerLines(gb);
    const pg = gb.build();
    this.props.geometry.dispose();
    this.props.geometry = pg || new THREE.BufferGeometry();
    this.surface.geometry.dispose();
    this.surface.geometry = this._surfaces();
  }

  // Each road tile is a centre square plus an arm towards every connected
  // neighbour, laid as small quads that follow the ground. Cobbled and paved
  // streets get a band of edging stones wherever the road has an edge.
  _surfaces() {
    const w = this.world, t = w.terrain, N = w.N;
    const pos = [], col = [];
    const c = new THREE.Color();
    const height = (x, z) => {
      if (w.rampHeight(x, z) != null) return null;
      return t.heightAt(x, z) + 0.018;
    };
    const rect = (x0, z0, x1, z1, L, edges, seed) => {
      // split lines: regular cells plus the kerb band on edged sides
      const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
      for (let k = 1; k * CELL < x1 - x0; k++) xs.add(x0 + k * CELL);
      for (let k = 1; k * CELL < z1 - z0; k++) zs.add(z0 + k * CELL);
      if (KERB[L]) {
        if (edges.x0) xs.add(x0 + BAND); if (edges.x1) xs.add(x1 - BAND);
        if (edges.z0) zs.add(z0 + BAND); if (edges.z1) zs.add(z1 - BAND);
      }
      const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
      for (let i = 0; i + 1 < X.length; i++) for (let j = 0; j + 1 < Z.length; j++) {
        const ax = X[i], bx = X[i + 1], az = Z[j], bz = Z[j + 1];
        if (bx - ax < 1e-4 || bz - az < 1e-4) continue;
        const h00 = height(ax, az), h01 = height(ax, bz), h10 = height(bx, az), h11 = height(bx, bz);
        if (h00 == null || h01 == null || h10 == null || h11 == null) continue;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const kerb = KERB[L] && ((edges.x0 && mx < x0 + BAND) || (edges.x1 && mx > x1 - BAND) || (edges.z0 && mz < z0 + BAND) || (edges.z1 && mz > z1 - BAND));
        c.copy(kerb ? KERB[L] : SURF[L]);
        const v = 1 + (hash2(Math.floor(mx * 16), Math.floor(mz * 16), seed) - 0.5) * (L === 2 ? 0.16 : 0.08);
        c.multiplyScalar(v);
        const tri = [[ax, h00, az], [ax, h01, bz], [bx, h10, az], [bx, h10, az], [ax, h01, bz], [bx, h11, bz]];
        for (const p of tri) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); }
      }
    };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const L = w.roads[w.idx(x, z)];
      if (!L || t.isWater(x, z)) continue;
      const hw = HALF[L], cx = x + 0.5, cz = z + 0.5;
      const nb = (dx, dz) => w.roadAt(x + dx, z + dz);
      const n = nb(0, -1), s = nb(0, 1), wv = nb(-1, 0), e = nb(1, 0);
      rect(cx - hw, cz - hw, cx + hw, cz + hw, L, { x0: !wv, x1: !e, z0: !n, z1: !s }, 3);
      // arms narrow to meet a lesser road next door
      const arm = (L2) => Math.min(hw, HALF[L2] || hw);
      if (n) { const a = arm(n); rect(cx - a, z, cx + a, cz - hw, L, { x0: true, x1: true }, 3); }
      if (s) { const a = arm(s); rect(cx - a, cz + hw, cx + a, z + 1, L, { x0: true, x1: true }, 3); }
      if (wv) { const a = arm(wv); rect(x, cz - a, cx - hw, cz + a, L, { z0: true, z1: true }, 3); }
      if (e) { const a = arm(e); rect(cx + hw, cz - a, x + 1, cz + a, L, { z0: true, z1: true }, 3); }
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
  // two tiles along when the road runs straight between them.
  _powerLines(gb) {
    const w = this.world, t = w.terrain, N = w.N;
    const has = (x, z) => w.roadAt(x, z) && !t.isWater(x, z) && ((x + z) & 1) === 0;
    const H = 0.5, at = (x, z) => [x + 0.81, t.heightAt(x + 0.81, z + 0.81) + H - 0.05, z + 0.81];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!has(x, z)) continue;
      const [px, py, pz] = at(x, z);
      const g = py - H + 0.05;
      gb.cyl(px, g - 0.02, pz, 0.011, 0.015, H + 0.02, 6, '#5e4630');
      gb.box(px, g + H - 0.06, pz, 0.15, 0.013, 0.015, '#5e4630', Math.PI / 4);
      for (const [dx, dz] of [[2, 0], [0, 2]]) {
        if (!has(x + dx, z + dz) || !w.roadAt(x + dx / 2, z + dz / 2)) continue;
        const [qx, qy, qz] = at(x + dx, z + dz);
        const len = Math.hypot(qx - px, qy - py, qz - pz), mx = (px + qx) / 2, my = (py + qy) / 2 - 0.02, mz = (pz + qz) / 2;
        for (const s of [-0.045, 0.045]) {
          if (dx) gb.boxC(mx, my, mz + s, len, 0.005, 0.005, '#2a2622', 0, 0, Math.atan2(qy - py, qx - px));
          else gb.boxC(mx + s, my, mz, 0.005, 0.005, len, '#2a2622', -Math.atan2(qy - py, qz - pz));
        }
      }
    }
  }

  _lamp(gb, x, y, z) {
    gb.cyl(x, y - 0.02, z, 0.012, 0.017, 0.36, 6, '#2f2c2a');
    gb.cbox(x, y - 0.02, z, 0.035, 0.05, 0.035, '#2f2c2a', 0, 0.006);
    gb.glow(2.2, 1.6, 0.8, 3.0);
    gb.box(x, y + 0.34, z, 0.042, 0.052, 0.042, '#ffe2a0');
    gb.noGlow();
    gb.cone(x, y + 0.392, z, 0.037, 0.036, 4, '#2f2c2a', Math.PI / 4);
    this.lamps.push({ x, y: y + 0.366, z, ground: y });
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
