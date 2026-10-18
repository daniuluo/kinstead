// What a building site looks like. A new building goes up in stages:
// pegged-out plot and piles of materials, foundations, walls rising course by
// course inside scaffolding (with a hoist on tall jobs), then the roof and a
// last tidy-up. Taking a building down for a move plays it in reverse, and
// upgrades scaffold the old building before the new one rises out of it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo.js';
import { RNG } from '../util/rng.js';

const POLE = '#8f6f48', LEDGER = '#7a5c3e', PLANK = '#b39468', ROPE = '#d9cfb4', STAKE = '#c9b48a', STRING = '#f0e8d0';
const TIMBER = ['#b8986a', '#a8855a', '#c2a274'], STONES = ['#bdb3a0', '#b3a996', '#a8a294'];
const SAND = '#d4bc88';

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

// Keep the part of a non-indexed geometry below height h, cutting the
// triangles that cross it. Night-time window glow is dropped: nobody lives
// in a half-built house.
export function clipBelow(geo, h) {
  const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, C = geo.attributes.color.array;
  const pos = [], nor = [], col = [];
  const vert = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2], C[i * 3], C[i * 3 + 1], C[i * 3 + 2]];
  const mixV = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  const emit = (v) => { pos.push(v[0], v[1], v[2]); nor.push(v[3], v[4], v[5]); col.push(v[6], v[7], v[8]); };
  const count = P.length / 3;
  for (let t = 0; t < count; t += 3) {
    const y0 = P[t * 3 + 1], y1 = P[t * 3 + 4], y2 = P[t * 3 + 7];
    if (y0 <= h && y1 <= h && y2 <= h) { emit(vert(t)); emit(vert(t + 1)); emit(vert(t + 2)); continue; }
    if (y0 > h && y1 > h && y2 > h) continue;
    const tri = [vert(t), vert(t + 1), vert(t + 2)];
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const ina = a[1] <= h, inb = b[1] <= h;
      if (ina) poly.push(a);
      if (ina !== inb) poly.push(mixV(a, b, (h - a[1]) / (b[1] - a[1])));
    }
    for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('emit', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
  return g;
}

// Footprint of the building itself (not its yard props) and its height.
export function bodyBox(geo) {
  const P = geo.attributes.position.array;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0;
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1];
    if (y > top) top = y;
    if (y < 0.14) continue;
    x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]);
    z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]);
  }
  if (!isFinite(x0)) { x0 = -0.3; x1 = 0.3; z0 = -0.3; z1 = 0.3; }
  return { x0, x1, z0, z1, top: Math.max(top, 0.05) };
}

function scaffold(gb, box, Ex, Ez, H, rng) {
  const x0 = Math.max(-Ex + 0.03, box.x0 - 0.035), x1 = Math.min(Ex - 0.03, box.x1 + 0.035);
  const z0 = Math.max(-Ez + 0.03, box.z0 - 0.035), z1 = Math.min(Ez - 0.03, box.z1 + 0.035);
  const span = (a, b) => { const n = Math.max(1, Math.round((b - a) / 0.22)); return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n); };
  const xs = span(x0, x1), zs = span(z0, z1);
  const pole = (x, z) => gb.box(x, -0.02, z, 0.014, H + 0.02, 0.014, POLE);
  for (const x of xs) { pole(x, z0); pole(x, z1); }
  for (const z of zs.slice(1, -1)) { pole(x0, z); pole(x1, z); }
  for (let y = 0.15; y < H - 0.01; y += 0.15) {
    gb.box((x0 + x1) / 2, y, z0, x1 - x0 + 0.02, 0.01, 0.01, LEDGER);
    gb.box((x0 + x1) / 2, y, z1, x1 - x0 + 0.02, 0.01, 0.01, LEDGER);
    gb.box(x0, y, (z0 + z1) / 2, 0.01, 0.01, z1 - z0 + 0.02, LEDGER);
    gb.box(x1, y, (z0 + z1) / 2, 0.01, 0.01, z1 - z0 + 0.02, LEDGER);
  }
  // walkway boards every other lift, front and sides
  for (let y = 0.3; y < H - 0.01; y += 0.3) {
    gb.box((x0 + x1) / 2, y + 0.01, z1 - 0.02, x1 - x0, 0.008, 0.035, PLANK);
    gb.box(x0 + 0.02, y + 0.01, (z0 + z1) / 2, 0.035, 0.008, z1 - z0, PLANK);
    gb.box(x1 - 0.02, y + 0.01, (z0 + z1) / 2, 0.035, 0.008, z1 - z0, PLANK);
  }
  // a diagonal brace on one side and a ladder up the front
  const side = rng.chance(0.5) ? x0 : x1;
  const L = Math.hypot(z1 - z0, H);
  gb.boxC(side, H / 2, (z0 + z1) / 2, 0.008, 0.008, L, LEDGER, -Math.atan2(H, z1 - z0));
  const lx = rng.chance(0.5) ? x0 + 0.08 : x1 - 0.08;
  for (const sx of [-1, 1]) gb.box(lx + sx * 0.02, -0.02, z1 + 0.014, 0.008, H + 0.04, 0.008, POLE);
  for (let y = 0.04; y < H; y += 0.045) gb.box(lx, y, z1 + 0.014, 0.04, 0.006, 0.006, POLE);
  return { x0, x1, z0, z1 };
}

function hoist(gb, s, H, cut) {
  const x = s.x0 + 0.02, z = s.z0 + 0.02, h = H + 0.2;
  gb.cyl(x, -0.02, z, 0.012, 0.016, h, 6, POLE);
  const a = Math.atan2(s.z1 - s.z0, s.x1 - s.x0);
  const reach = 0.24;
  const tx = x + Math.cos(a) * reach, tz = z + Math.sin(a) * reach;
  gb.boxC((x + tx) / 2, h - 0.02, (z + tz) / 2, 0.012, 0.012, reach, LEDGER, 0, Math.PI / 2 - a);
  const ly = Math.max(0.05, cut + 0.04);
  gb.box(tx, ly, tz, 0.004, h - 0.02 - ly, 0.004, ROPE);
  gb.cbox(tx, ly - 0.035, tz, 0.045, 0.035, 0.045, STONES[0], 0, 0.006);
}

// Materials stacked at the plot corners furthest from the building.
function piles(gb, box, Ex, Ez, amount, gy, rng) {
  if (amount <= 0.02) return;
  const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const x = sx * (Ex - 0.13), z = sz * (Ez - 0.11);
    const out = Math.max(box.x0 - x, x - box.x1, box.z0 - z, z - box.z1);
    return { x, z, out: out + (sz > 0 ? 0.05 : 0) };
  }).sort((a, b) => b.out - a.out);
  const [p, q, r] = corners;
  // timber
  const layers = Math.ceil(4 * amount);
  gb.push(p.x, gy(p.x, p.z), p.z, Math.abs(p.x) > Math.abs(p.z) ? Math.PI / 2 : 0);
  for (const sx of [-1, 1]) gb.box(sx * 0.07, 0, 0, 0.022, 0.018, 0.12, '#5e432c');
  for (let l = 0; l < layers; l++) for (let k = 0; k < 3; k++) gb.box(0, 0.018 + l * 0.017, -0.038 + k * 0.038, 0.22, 0.015, 0.034, TIMBER[(l + k) % 3]);
  gb.pop();
  // cut stone
  const n = Math.ceil(6 * amount);
  const y0 = gy(q.x, q.z);
  for (let i = 0, l = 0; l < 3 && i < n; l++) {
    const count = 3 - l;
    for (let k = 0; k < count && i < n; k++, i++) gb.cbox(q.x + (k - (count - 1) / 2) * 0.05, y0 + l * 0.036, q.z, 0.046, 0.035, 0.058, STONES[(k + l) % 3], rng.float(-0.08, 0.08), 0.006);
  }
  // sand
  if (amount > 0.35) gb.blob(r.x, gy(r.x, r.z), r.z, 0.07, 0.05 * amount, 0.065, SAND);
}

function stakes(gb, box, gy) {
  const pts = [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]];
  for (const [x, z] of pts) gb.box(x, gy(x, z) - 0.01, z, 0.012, 0.075, 0.012, STAKE);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4];
    const y = Math.max(gy(ax, az), gy(bx, bz)) + 0.05;
    gb.box((ax + bx) / 2, y, (az + bz) / 2, Math.abs(bx - ax) + 0.004, 0.004, Math.abs(bz - az) + 0.004, STRING);
  }
}

// o: { target, old, box, oldBox, kind, p, wait, Ex, Ez, gy, seed }
export function siteGeo(o) {
  const rng = new RNG((o.seed ^ 0x5bd1e995) >>> 0);
  const gb = new GeoBuilder();
  gb.vary = 0.12;
  let show = o.target, box = o.box, cut = null, scaffoldH = 0, pile = 0, peg = false;
  const top = o.box.top;

  if (o.kind === 'upgrade') {
    const p = o.p;
    if (p < 0.4) { show = o.old; box = o.oldBox; scaffoldH = (o.oldBox.top + 0.04) * lerp(0.35, 1, p / 0.4); pile = 1; }
    else if (p < 0.9) { cut = lerp(top * 0.45, top + 0.01, (p - 0.4) / 0.5); scaffoldH = Math.min(top + 0.05, cut + 0.12); pile = 1 - (p - 0.4) * 1.4; }
    else { scaffoldH = top + 0.05; pile = 0.15; }
  } else {
    // 0 = bare plot, 1 = finished
    const down = o.kind === 'dismantle' || o.kind === 'demolish';
    let q = down ? 1 - o.p : o.kind === 'merge' ? 0.3 + 0.7 * o.p : o.p;
    if (o.wait) q = 0;
    if (q < 0.12) { cut = -1; peg = o.kind === 'build'; }
    else if (q < 0.3) { cut = lerp(-0.25, 0.07, (q - 0.12) / 0.18); peg = q < 0.2 && o.kind === 'build'; }
    else if (q < 0.9) { cut = lerp(0.07, top + 0.01, (q - 0.3) / 0.6); scaffoldH = Math.min(top + 0.05, cut + 0.12); }
    else scaffoldH = top + 0.05;
    if (down) pile = 0.25 + 0.75 * o.p;
    else if (o.wait) pile = 0;
    else pile = q < 0.3 ? 1 : 1 - (q - 0.3) * 1.2;
  }

  const parts = [];
  if (cut === null) parts.push(clipBelow(show, Infinity));
  else if (cut > -0.5) parts.push(clipBelow(show, cut));
  if (peg) stakes(gb, box, o.gy);
  if (scaffoldH > 0.08) {
    const s = scaffold(gb, box, o.Ex, o.Ez, scaffoldH, rng);
    if (top > 0.62 && cut !== null && cut > 0.07) hoist(gb, s, scaffoldH, cut);
  }
  piles(gb, box, o.Ex, o.Ez, pile, o.gy, rng);
  const extra = gb.build();
  if (extra) parts.push(extra);
  if (!parts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    return g;
  }
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) for (const p of parts) p.dispose();
  geo.computeBoundingSphere();
  return geo;
}
