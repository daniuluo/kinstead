// 3D road furniture: bridges, street lamps and railway track.
// (Road and track surfaces themselves are painted into the terrain.)

import * as THREE from 'three';
import { MAT } from './materials.js';
import { GeoBuilder } from './geo.js';
import { hash2 } from '../util/rng.js';
import { bridgeDeckY } from '../world/world.js';

export class RoadsView {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.props = new THREE.Mesh(new THREE.BufferGeometry(), MAT.building);
    this.props.castShadow = true;
    this.props.receiveShadow = true;
    scene.add(this.props);
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
        if (L >= 2 && !w.railAt(x, z)) {
          const straightNS = n.N && n.S && !n.E && !n.W, straightEW = n.E && n.W && !n.N && !n.S;
          if ((straightNS || straightEW) && hash2(x, z, 91) < 0.4) {
            const side = hash2(x, z, 92) < 0.5 ? -1 : 1;
            const lx = x + 0.5 + (straightNS ? side * 0.44 : 0);
            const lz = z + 0.5 + (straightEW ? side * 0.44 : 0);
            this._lamp(gb, lx, t.heightAt(lx, lz), lz);
          }
        }
      }
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (w.rails[w.idx(x, z)]) this._rail(gb, x, z);
    const pg = gb.build();
    this.props.geometry.dispose();
    this.props.geometry = pg || new THREE.BufferGeometry();
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
