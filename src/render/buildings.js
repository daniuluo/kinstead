// Procedural rustic building models. Every building is generated from its
// type, level and a per-building variant seed, so no two cottages match.
// Local space: origin at footprint centre, y=0 at the building's base level
// (the highest ground under its plot), +z faces the road. Yard props sit on
// the real terrain via c.gy(); structures get stone foundations on slopes.

import * as THREE from 'three';
import { GeoBuilder, shade } from './geo.js';
import { RNG, hash2 } from '../util/rng.js';

const WALLS = ['#e6d9bf', '#dccdb0', '#d8c29a', '#cdb795', '#e2d4ba', '#c9b48f', '#d6c4a8', '#bfae94', '#e0cfae', '#d2bc98'];
const STONE_WALLS = ['#a99f90', '#9a907f', '#b3a996', '#a39784'];
const BRICK = ['#9a5640', '#8c4c38', '#a3624a'];
const WOOD = ['#7a5a3c', '#6e5034', '#86663f', '#755636'];
const ROOF_TILE = ['#9c4a32', '#8a432e', '#a8573a', '#7d3b2a', '#94503a'];
const ROOF_SLATE = ['#5a5f63', '#4e5357', '#666a6b', '#55585e'];
const ROOF_THATCH = ['#b8955a', '#a8854c', '#c2a064', '#9e7f4a'];
const ROOF_MOSS = ['#6b7a4a', '#5e6e44', '#74804f'];
const ROOF_SHINGLE = ['#6f5a44', '#7b6247', '#665240'];
const DOORS = ['#5c3d26', '#6b3a2a', '#3f4f5a', '#4a5a3a', '#6e4a2e', '#4e3828'];
const AWNING = ['#a8473a', '#3f6a8f', '#4f7a45', '#c08a3a', '#7a5a8a', '#b8653f'];
const FLOWER = ['#d9536b', '#e8b84a', '#e88fae', '#f2ede0', '#9c74c9', '#e8823f'];
const LEAF = ['#5f8a42', '#55803c', '#6a9448', '#4e7638'];
const CROP_TUFT = [['#7fae4f', '#8fbd5a'], ['#c9a640', '#6f9e45'], ['#c08f3e', '#a8823c'], ['#6f5a44', '#6f5a44']];
const TIMBER = '#4e3a2a';
const STONE = '#8f877a';
const STONE_D = '#756e63';
const GLASS = '#2f3a44';
const FENCE = '#7a5f42';
const WARM = [1.7, 1.2, 0.55];

function palette(seed) {
  const r = new RNG(seed);
  const roofKind = r.next();
  return {
    wall: r.pick(WALLS),
    stoneWall: r.pick(STONE_WALLS),
    brick: r.pick(BRICK),
    wood: r.pick(WOOD),
    roof: roofKind < 0.45 ? r.pick(ROOF_TILE) : roofKind < 0.7 ? r.pick(ROOF_SHINGLE) : roofKind < 0.88 ? r.pick(ROOF_SLATE) : r.pick(ROOF_MOSS),
    thatch: r.pick(ROOF_THATCH),
    slate: r.pick(ROOF_SLATE),
    tile: r.pick(ROOF_TILE),
    door: r.pick(DOORS),
    awning: r.pick(AWNING),
    leaf: r.pick(LEAF),
    trim: r.chance(0.5) ? '#e9e0cc' : '#d8ccb4',
    timber: r.chance(0.45),
    thatched: r.chance(0.5),
    hip: r.chance(0.3),
    alongZ: r.chance(0.3),
    stoneHouse: r.chance(0.22),
  };
}

// ---------------------------------------------------------------- helpers

function win(c, x, y, z, w, h, face, lit = 0.75) {
  const { gb, rng } = c;
  const t = 0.018, o = 0.007;
  // wooden frame
  const fr = '#5a4330';
  if (face === 'f') gb.box(x, y - 0.012, z + 0.002, w + 0.024, h + 0.024, t, fr);
  else if (face === 'b') gb.box(x, y - 0.012, z - 0.002, w + 0.024, h + 0.024, t, fr);
  else if (face === 'r') gb.box(x + 0.002, y - 0.012, z, t, h + 0.024, w + 0.024, fr);
  else gb.box(x - 0.002, y - 0.012, z, t, h + 0.024, w + 0.024, fr);
  if (rng.chance(lit)) gb.glow(WARM[0], WARM[1], WARM[2], 1 + rng.float(0.02, 0.95)); else gb.noGlow();
  if (face === 'f') gb.box(x, y, z + o, w, h, t, GLASS);
  else if (face === 'b') gb.box(x, y, z - o, w, h, t, GLASS);
  else if (face === 'r') gb.box(x + o, y, z, t, h, w, GLASS);
  else gb.box(x - o, y, z, t, h, w, GLASS);
  gb.noGlow();
  if (c.shutters && rng.chance(0.5) && (face === 'f' || face === 'b')) {
    const sz = face === 'f' ? z + 0.012 : z - 0.012;
    gb.box(x - w / 2 - 0.022, y - 0.006, sz, 0.026, h + 0.012, 0.01, c.shutters);
    gb.box(x + w / 2 + 0.022, y - 0.006, sz, 0.026, h + 0.012, 0.01, c.shutters);
  }
  if (c.flowerBoxes && face === 'f' && rng.chance(0.55)) {
    gb.box(x, y - 0.032, z + 0.022, w + 0.01, 0.024, 0.026, '#6b4a2f');
    for (let i = -1; i <= 1; i++) gb.sphere(x + i * w * 0.32, y - 0.004, z + 0.026, 0.015, rng.pick(FLOWER));
  }
}

function door(c, x, z, w, h, color) {
  const { gb } = c;
  gb.box(x, 0, z + 0.004, w + 0.026, h + 0.018, 0.014, '#5a4330');
  gb.box(x, 0, z + 0.01, w, h, 0.014, color);
  const g = c.gy(x, z + 0.07);
  const top = 0.02;
  gb.cbox(x, Math.min(g, top) - 0.03, z + 0.06, w + 0.07, top - Math.min(g, top) + 0.03, 0.08, STONE, 0, 0.01);
}

function chimney(c, x, y0, top, z, kind = 'home', color = STONE) {
  const { gb } = c;
  gb.cbox(x, y0, z, 0.075, top - y0, 0.075, color, 0, 0.012);
  gb.cbox(x, top, z, 0.09, 0.028, 0.09, shade(color, 0.82), 0, 0.01);
  c.addSmoke(x, top + 0.04, z, kind);
}

// stone footing from the ground up to y=0 under a rectangle (only when needed)
function footing(c, x, z, w, d, color = STONE) {
  let lo = 0;
  for (const [px, pz] of [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z]]) lo = Math.min(lo, c.gy(px, pz));
  if (lo > -0.015) return;
  c.gb.cbox(x, lo - 0.04, z, w + 0.04, -lo + 0.045, d + 0.04, color, 0, 0.018);
}

function timber(c, w, d, h, floors) {
  const { gb } = c;
  const t = 0.024, o = 0.006;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * (w / 2 - t / 2 + o), 0, sz * (d / 2 - t / 2 + o), t, h, t, TIMBER);
  for (let f = 1; f <= floors; f++) {
    const y = (f * h) / floors - t;
    gb.box(0, y, d / 2 + o, w + 0.012, t, t * 0.6, TIMBER);
    gb.box(0, y, -d / 2 - o, w + 0.012, t, t * 0.6, TIMBER);
    gb.box(w / 2 + o, y, 0, t * 0.6, t, d + 0.012, TIMBER);
    gb.box(-w / 2 - o, y, 0, t * 0.6, t, d + 0.012, TIMBER);
  }
  const studs = Math.max(2, Math.round(w / 0.2));
  for (let i = 1; i < studs; i++) {
    const x = -w / 2 + (i * w) / studs;
    gb.box(x, 0, d / 2 + o, t * 0.7, h, t * 0.5, TIMBER);
  }
  // a pair of diagonal braces on the upper floor
  if (floors > 1) {
    const y0 = h / floors, fh = h / floors;
    const len = Math.hypot(w / studs, fh) * 0.95;
    const ang = Math.atan2(w / studs, fh);
    gb.boxC(-w / 2 + w / studs / 2, y0 + fh / 2, d / 2 + o, t * 0.6, len, t * 0.5, TIMBER, 0, 0, -ang);
    gb.boxC(w / 2 - w / studs / 2, y0 + fh / 2, d / 2 + o, t * 0.6, len, t * 0.5, TIMBER, 0, 0, ang);
  }
}

function thatchRoof(c, x, y, z, w, d, h, wall, color, alongZ) {
  const { gb } = c;
  gb.gable(x, y, z, w, d, h, wall, color, 0.075, alongZ, 0.065);
  // rounded ridge bundle
  gb.push(x, y + h + 0.02, z, alongZ ? Math.PI / 2 : 0);
  gb.cyl(-(alongZ ? d : w) / 2 - 0.08, 0, 0, 0.04, 0.04, (alongZ ? d : w) + 0.16, 7, shade(color, 0.88), 0, 0, -Math.PI / 2);
  gb.pop();
}

// A generic house body with roof, windows, door and optional chimney.
function house(c, o) {
  const { gb, rng, pal } = c;
  const w = o.w, d = o.d, h = o.h, floors = o.floors || 1;
  gb.push(o.x || 0, o.y || 0, o.z || 0, o.ry || 0);
  footing(c, 0, 0, w, d, o.footColor || STONE);
  if (o.plinth) gb.cbox(0, 0, 0, w + 0.035, 0.08, d + 0.035, o.plinth, 0, 0.015);
  gb.cbox(0, 0, 0, w, h, d, o.wall, 0, 0.024);
  if (o.timber) timber(c, w, d, h, floors);
  const rh = o.rh ?? 0.24;
  const alongZ = !!o.alongZ;
  if (o.roofType === 'hip') gb.hip(0, h, 0, w, d, rh, o.roof, 0.06, alongZ);
  else if (o.roofType === 'thatch') thatchRoof(c, 0, h, 0, w, d, rh, o.wall, o.roof, alongZ);
  else if (o.roofType === 'flat') {
    gb.cbox(0, h, 0, w + 0.03, 0.045, d + 0.03, o.roof, 0, 0.01);
  } else gb.gable(0, h, 0, w, d, rh, o.wall, o.roof, 0.06, alongZ, 0.035);

  const fh = h / floors;
  const hw = w / 2, hd = d / 2;
  const nF = o.nFront || Math.max(1, Math.floor(w / 0.22));
  const nS = Math.max(1, Math.floor(d / 0.24));
  const doorX = o.doorX ?? (nF % 2 === 1 && nF > 1 ? -hw + (w / nF) * 0.5 : 0);
  const ww = o.ww || 0.075;
  for (let f = 0; f < floors; f++) {
    const wh = Math.min(0.11, fh * 0.4);
    const wy = f * fh + fh * 0.38;
    for (let i = 0; i < nF; i++) {
      const u = -hw + (i + 0.5) * (w / nF);
      if (f === 0 && !o.noDoor && Math.abs(u - doorX) < 0.08) continue;
      const shop = f === 0 && o.shopWindow;
      win(c, u, wy - (shop ? 0.02 : 0), hd, shop ? ww * 1.6 : ww, shop ? wh * 1.3 : wh, 'f', o.lit);
      if (!o.noBack && rng.chance(0.7)) win(c, u, wy, -hd, ww, wh, 'b', o.lit);
    }
    for (let i = 0; i < nS; i++) {
      const u = -hd + (i + 0.5) * (d / nS);
      if (rng.chance(0.8)) win(c, hw, wy, u, ww, wh, 'r', o.lit);
      if (rng.chance(0.8)) win(c, -hw, wy, u, ww, wh, 'l', o.lit);
    }
  }
  if (alongZ && o.roofType !== 'hip' && o.roofType !== 'flat' && rh > 0.16) win(c, 0, h + rh * 0.22, hd, 0.06, 0.07, 'f', o.lit);
  if (!o.noDoor) door(c, doorX, hd, o.doorW || 0.09, Math.min(0.18, fh * 0.7), o.door || pal.door);
  if (o.chimney) {
    const side = rng.chance(0.5) ? 1 : -1;
    const cx = alongZ ? side * w * 0.22 : side * w * 0.32;
    const cz = alongZ ? -d * 0.26 : (rng.chance(0.5) ? 1 : -1) * d * 0.14;
    chimney(c, cx, h - 0.06, h + rh + 0.08, cz, o.smokeKind || 'home', o.chimneyColor || STONE);
  }
  if (o.dormers && !alongZ && o.roofType !== 'flat' && o.roofType !== 'hip') {
    const n = o.dormers;
    for (let i = 0; i < n; i++) {
      const x = -hw + (i + 0.5) * (w / n);
      const dz = hd * 0.42, dy = h + rh * 0.1;
      gb.cbox(x, dy, dz, 0.12, 0.13, 0.13, o.wall, 0, 0.012);
      gb.gable(x, dy + 0.13, dz, 0.12, 0.14, 0.075, o.wall, o.roof, 0.025, true, 0.022);
      win(c, x, dy + 0.025, dz + 0.065, 0.06, 0.07, 'f', o.lit);
    }
  }
  gb.pop();
  return { doorX };
}

function bush(c, x, z, s = 1, color) {
  const col = color || c.rng.pick(LEAF);
  const y = c.gy(x, z);
  c.gb.sphere(x, y + 0.045 * s, z, 0.075 * s, col, 1, 0.75);
  if (s > 0.9) c.gb.sphere(x + 0.04 * s, y + 0.035 * s, z + 0.03 * s, 0.05 * s, shade(col, 1.08), 1, 0.8);
}

function smallTree(c, x, z, s = 1) {
  const { gb, rng } = c;
  const y = c.gy(x, z);
  gb.cyl(x, y - 0.01, z, 0.016 * s, 0.026 * s, 0.2 * s, 6, '#5e432c');
  const col = rng.pick(LEAF);
  gb.sphere(x, y + 0.26 * s, z, 0.11 * s, col, 1);
  gb.sphere(x + 0.05 * s, y + 0.31 * s, z - 0.02 * s, 0.075 * s, shade(col, 1.08), 1);
  gb.sphere(x - 0.05 * s, y + 0.22 * s, z + 0.04 * s, 0.07 * s, shade(col, 0.92), 1);
}

function flowers(c, x, z, n = 5, spread = 0.08) {
  const { gb, rng } = c;
  for (let i = 0; i < n; i++) {
    const fx = x + rng.float(-spread, spread), fz = z + rng.float(-spread, spread);
    const y = c.gy(fx, fz);
    gb.box(fx, y, fz, 0.008, 0.032, 0.008, '#4f7a3a');
    gb.sphere(fx, y + 0.036, fz, 0.015, rng.pick(FLOWER));
  }
}

function barrel(c, x, z, s = 1) {
  const y = c.gy(x, z);
  c.gb.cyl(x, y, z, 0.03 * s, 0.033 * s, 0.078 * s, 9, '#6e4a2c');
  c.gb.cyl(x, y + 0.02 * s, z, 0.0335 * s, 0.0335 * s, 0.006, 9, '#3f342c');
  c.gb.cyl(x, y + 0.055 * s, z, 0.0335 * s, 0.0335 * s, 0.006, 9, '#3f342c');
}

function crate(c, x, z, s = 1, color = '#94714a') {
  c.gb.cbox(x, c.gy(x, z), z, 0.065 * s, 0.06 * s, 0.065 * s, color, c.rng.float(-0.4, 0.4), 0.006);
}

function bench(c, x, z, ry = 0) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.box(0, 0.036, 0, 0.17, 0.014, 0.05, '#7a5636');
  gb.box(0, 0.05, -0.022, 0.17, 0.04, 0.01, '#7a5636');
  gb.box(-0.07, 0, 0, 0.012, 0.036, 0.045, '#3f342c');
  gb.box(0.07, 0, 0, 0.012, 0.036, 0.045, '#3f342c');
  gb.pop();
}

function lamp(c, x, z, h = 0.32) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cyl(x, y, z, 0.011, 0.016, h, 6, '#2f2c2a');
  gb.glow(2.2, 1.6, 0.8, 3.0);
  gb.box(x, y + h, z, 0.036, 0.046, 0.036, '#ffe2a0');
  gb.noGlow();
  gb.cone(x, y + h + 0.046, z, 0.032, 0.032, 4, '#2f2c2a', Math.PI / 4);
  c.addGlow(x, y + h + 0.022, z);
}

// Split-rail fence around a rectangle, leaving a gap on the front side.
function fence(c, x0, z0, x1, z1, color = FENCE, gap = null) {
  const { gb } = c;
  const segs = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  for (const [ax, az, bx, bz] of segs) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 0.16));
    const ry = Math.atan2(bx - ax, bz - az);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const inGap = gap && Math.abs(pz - gap.z) < 0.01 && Math.abs(az - bz) < 0.01 && Math.abs(px - gap.x) < gap.w;
      const y = c.gy(px, pz);
      if (!inGap) gb.box(px, y - 0.01, pz, 0.016, 0.075, 0.016, color, c.rng.float(-0.2, 0.2));
      if (prev && !inGap && !prev.gap) {
        const mx = (px + prev.x) / 2, mz = (pz + prev.z) / 2, my = (y + prev.y) / 2;
        const pitch = Math.atan2(y - prev.y, len / n);
        for (const ry2 of [0.03, 0.058]) gb.boxC(mx, my + ry2, mz, 0.01, 0.01, len / n + 0.01, color, -pitch, ry);
      }
      prev = { x: px, z: pz, y, gap: inGap };
    }
  }
}

function hedge(c, x, z, w, d, h = 0.075) {
  c.gb.cbox(x, c.gy(x, z) - 0.01, z, w, h + 0.01, d, '#4a7036', 0, 0.02);
}

function sign(c, x, y, z, w, h, color, ry = 0) {
  c.gb.box(x, y, z, w, h, 0.014, color, ry);
}

function logs(c, x, z, n = 3, ry = 0) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  for (let row = 0; row < n; row++) {
    const count = n - row;
    for (let i = 0; i < count; i++) {
      const lz = (i - (count - 1) / 2) * 0.046, ly = 0.022 + row * 0.04;
      gb.cyl(0.1, ly, lz, 0.022, 0.022, 0.2, 6, (i + row) % 2 ? '#7d5b3b' : '#6e4e31', 0, 0, Math.PI / 2);
      gb.cyl(0.104, ly, lz, 0.019, 0.019, 0.004, 6, '#cfae7c', 0, 0, Math.PI / 2);
    }
  }
  gb.pop();
}

function cropRows(c, x0, z0, x1, z1, cols) {
  // little tufts of crops following the furrows painted on the ground
  const { gb, rng } = c;
  if (!cols) return;
  for (let z = z0 + 0.1; z < z1 - 0.05; z += 0.4) {
    for (let x = x0 + 0.06; x < x1 - 0.04; x += 0.11) {
      const px = x + rng.float(-0.02, 0.02), pz = z + rng.float(-0.02, 0.02);
      const s = rng.float(0.8, 1.2);
      gb.sphere(px, c.gy(px, pz) + 0.02 * s, pz, 0.032 * s, rng.chance(0.5) ? cols[0] : cols[1], 0, 0.75);
    }
  }
}

// ---------------------------------------------------------------- models

const MODELS = {};

MODELS.house = (c, L) => {
  const { gb, rng, pal } = c;
  c.shutters = rng.chance(0.4) ? rng.pick(['#4f6a4a', '#6b3a2a', '#3f5466', '#7a6a4a']) : null;
  c.flowerBoxes = L >= 1 && rng.chance(0.55);
  const wall = pal.stoneHouse && L < 2 ? pal.stoneWall : pal.wall;
  if (L === 0) {
    const w = rng.float(0.56, 0.68), d = rng.float(0.44, 0.54), h = rng.float(0.29, 0.34);
    house(c, {
      x: rng.float(-0.05, 0.05), z: -0.07, w, d, h, wall,
      roof: pal.thatched ? pal.thatch : pal.roof, roofType: pal.thatched ? 'thatch' : (pal.hip ? 'hip' : 'gable'), rh: rng.float(0.22, 0.29),
      alongZ: pal.alongZ, chimney: rng.chance(0.75), timber: !pal.stoneHouse && pal.timber && rng.chance(0.6),
    });
  } else if (L === 1) {
    const w = rng.float(0.68, 0.78), d = rng.float(0.52, 0.6), h = rng.float(0.52, 0.58);
    house(c, {
      x: rng.float(-0.03, 0.03), z: -0.09, w, d, h, floors: 2, wall, roof: pal.thatched && rng.chance(0.5) ? pal.thatch : pal.roof,
      roofType: pal.thatched && rng.chance(0.5) ? 'thatch' : (pal.hip ? 'hip' : 'gable'), rh: rng.float(0.27, 0.33), alongZ: pal.alongZ,
      chimney: true, timber: !pal.stoneHouse && pal.timber, plinth: rng.chance(0.5) ? STONE : null,
    });
    if (rng.chance(0.5)) {
      const side = rng.chance(0.5) ? 1 : -1;
      const ew = 0.22, ed = 0.32;
      const ex = side * (w / 2 + ew / 2 - 0.02);
      footing(c, ex, -0.14, ew, ed);
      gb.cbox(ex, 0, -0.14, ew, 0.25, ed, shade(wall, 0.96), 0, 0.016);
      gb.wedge(ex, 0.25, -0.14, ew + 0.05, ed + 0.05, 0.1, pal.roof, side > 0 ? Math.PI / 2 : -Math.PI / 2);
      win(c, ex, 0.09, -0.14 + ed / 2, 0.065, 0.085, 'f');
    }
  } else if (L === 3) {
    // Manor House: a broad two-storey block with forward wings and a columned porch
    const stone = pal.stoneHouse || rng.chance(0.5);
    const mwall = stone ? pal.stoneWall : pal.wall;
    const roof = rng.chance(0.6) ? pal.slate : pal.roof;
    house(c, {
      x: 0, z: -0.17, w: 0.88, d: 0.5, h: 0.6, floors: 2, wall: mwall, roof, roofType: 'hip', rh: 0.3, chimney: true,
      plinth: STONE, doorX: 0, doorW: 0.11, nFront: 5, timber: !stone && pal.timber,
    });
    for (const sd of [-1, 1]) {
      footing(c, sd * 0.33, 0.15, 0.22, 0.26);
      gb.cbox(sd * 0.33, 0, 0.15, 0.22, 0.46, 0.26, mwall, 0, 0.016);
      gb.hip(sd * 0.33, 0.46, 0.15, 0.22, 0.26, 0.16, roof, 0.035);
      win(c, sd * 0.33, 0.08, 0.28, 0.07, 0.1, 'f');
      win(c, sd * 0.33, 0.29, 0.28, 0.07, 0.1, 'f');
    }
    chimney(c, -0.3, 0.5, 1.0, -0.3, 'home', STONE);
    for (const sd of [-1, 1]) gb.cyl(sd * 0.075, 0, 0.14, 0.014, 0.016, 0.26, 8, '#e9e2d4');
    gb.gable(0, 0.26, 0.12, 0.22, 0.11, 0.07, '#e9e2d4', roof, 0.02);
    hedge(c, -0.27, 0.44, 0.3, 0.06); hedge(c, 0.27, 0.44, 0.3, 0.06);
    smallTree(c, rng.chance(0.5) ? -0.42 : 0.42, -0.43, 1.1);
  } else if (L >= 4) {
    // Grand Manor: three-storey centre, two wings and a portico
    const mwall = pal.stoneWall, roof = pal.slate;
    house(c, {
      x: 0, z: -0.13, w: 0.5, d: 0.6, h: 0.88, floors: 3, wall: mwall, roof, roofType: 'hip', rh: 0.32, chimney: true,
      plinth: STONE, doorX: 0, doorW: 0.12, nFront: 3,
    });
    for (const sd of [-1, 1]) {
      house(c, {
        x: sd * 0.36, z: -0.16, w: 0.22, d: 0.54, h: 0.62, floors: 2, wall: mwall, roof, roofType: 'hip', rh: 0.2,
        noDoor: true, plinth: STONE, nFront: 1, chimney: rng.chance(0.5),
      });
    }
    for (let i = 0; i < 4; i++) gb.cyl(-0.15 + i * 0.1, 0.02, 0.24, 0.016, 0.019, 0.36, 8, '#ece6da');
    gb.cbox(0, 0.38, 0.23, 0.38, 0.035, 0.1, '#ece6da', 0, 0.006);
    gb.gable(0, 0.415, 0.21, 0.38, 0.14, 0.08, '#ece6da', roof, 0.02);
    gb.cbox(0, -0.03, 0.25, 0.4, 0.05, 0.12, STONE, 0, 0.008);
    hedge(c, -0.3, 0.45, 0.32, 0.055); hedge(c, 0.3, 0.45, 0.32, 0.055);
    lamp(c, -0.21, 0.43, 0.3); lamp(c, 0.21, 0.43, 0.3);
    for (const sd of [-1, 1]) { gb.cbox(sd * 0.43, c.gy(sd * 0.43, 0.3) - 0.01, 0.3, 0.08, 0.06, 0.08, STONE, 0, 0.01); smallTree(c, sd * 0.43, 0.3, 0.7); }
  } else {
    const lshape = rng.chance(0.4);
    const w = rng.float(0.8, 0.88), d = rng.float(0.6, 0.68), h = rng.float(0.82, 0.9);
    const stone = !pal.timber && rng.chance(0.4);
    house(c, {
      x: 0, z: -0.1, w, d, h, floors: 3, wall: stone ? pal.stoneWall : pal.wall,
      roof: rng.chance(0.55) ? pal.slate : pal.roof, roofType: pal.hip ? 'hip' : 'gable', rh: rng.float(0.28, 0.34),
      alongZ: false, chimney: true, timber: pal.timber, plinth: STONE, dormers: pal.hip ? 0 : rng.int(1, 2),
    });
    if (lshape) {
      const side = rng.chance(0.5) ? 1 : -1;
      footing(c, side * 0.3, 0.14, 0.26, 0.3);
      gb.cbox(side * 0.3, 0, 0.14, 0.26, 0.5, 0.3, pal.wall, 0, 0.018);
      gb.hip(side * 0.3, 0.5, 0.14, 0.26, 0.3, 0.16, pal.roof, 0.04);
      win(c, side * 0.3, 0.09, 0.29, 0.07, 0.09, 'f');
      win(c, side * 0.3, 0.32, 0.29, 0.07, 0.09, 'f');
    } else if (rng.chance(0.5)) {
      const bz = -0.1 + d / 2;
      gb.box(0, 0.29, bz + 0.05, 0.32, 0.022, 0.1, '#5e432c');
      for (let i = -2; i <= 2; i++) gb.box(i * 0.075, 0.31, bz + 0.095, 0.01, 0.065, 0.01, '#3a2f28');
      gb.box(0, 0.375, bz + 0.095, 0.32, 0.012, 0.014, '#3a2f28');
    }
  }
  // yard (manors have their own formal gardens)
  if (L >= 3) return;
  if (rng.chance(L === 0 ? 0.55 : 0.4)) fence(c, -0.46, -0.46, 0.46, 0.46, FENCE, { x: 0, z: 0.46, w: 0.12 });
  const nb = rng.int(1, 3);
  for (let i = 0; i < nb; i++) bush(c, rng.chance(0.5) ? rng.float(-0.42, -0.32) : rng.float(0.32, 0.42), rng.float(0.2, 0.4), rng.float(0.8, 1.2));
  if (rng.chance(0.6)) flowers(c, rng.chance(0.5) ? -0.33 : 0.33, 0.36, rng.int(4, 8), 0.07);
  if (rng.chance(0.45)) smallTree(c, rng.chance(0.5) ? -0.38 : 0.38, -0.39, rng.float(0.8, 1.15));
  if (rng.chance(0.35)) logs(c, rng.chance(0.5) ? 0.4 : -0.4, -0.05, 3, Math.PI / 2);
  if (rng.chance(0.3)) barrel(c, rng.float(-0.4, 0.4), 0.42);
};

MODELS.market = (c, L) => {
  const { gb, rng, pal } = c;
  const awnA = pal.awning, awnB = '#e9dfc9';
  const stall = (x, z, ry, s = 1) => {
    gb.push(x, c.gy(x, z), z, ry, s);
    gb.cbox(0, 0, 0, 0.4, 0.13, 0.2, '#86613e', 0, 0.01);
    gb.box(0, 0.13, 0, 0.42, 0.016, 0.22, '#a07a50');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.2, 0, sz * 0.1, 0.022, sz < 0 ? 0.38 : 0.33, 0.022, '#5e432c');
    for (let i = 0; i < 5; i++) gb.boxC(-0.176 + i * 0.088, 0.36, 0.0, 0.088, 0.014, 0.31, i % 2 ? awnB : awnA, -0.2);
    const goods = ['#b8402f', '#d98a32', '#7aa34a', '#d9c050', '#6f4a8a'];
    for (let i = 0; i < 7; i++) gb.sphere(-0.16 + i * 0.054, 0.165, rng.float(-0.05, 0.05), 0.022, rng.pick(goods), 1);
    gb.pop();
  };
  if (L === 0) {
    stall(-0.14, 0.06, 0);
    stall(0.22, -0.22, -Math.PI / 2, 0.85);
    crate(c, 0.26, 0.3); crate(c, 0.35, 0.22, 0.8, '#a88458'); barrel(c, -0.4, -0.32);
    if (rng.chance(0.6)) bench(c, -0.3, -0.28, Math.PI / 2);
  } else if (L === 1) {
    house(c, {
      z: -0.09, w: 0.72, d: 0.56, h: 0.5, floors: 2, wall: pal.wall, roof: pal.roof, roofType: 'gable',
      rh: 0.28, alongZ: pal.alongZ, chimney: rng.chance(0.5), shopWindow: true, nFront: 3, doorX: 0, lit: 0.9,
      timber: pal.timber,
    });
    for (let i = 0; i < 7; i++) gb.boxC(-0.3 + i * 0.1, 0.28, 0.24, 0.1, 0.014, 0.15, i % 2 ? awnB : awnA, 0.45);
    sign(c, 0, 0.36, 0.2, 0.24, 0.065, '#5e432c');
    crate(c, -0.34, 0.36); crate(c, -0.25, 0.38, 0.9, '#a88458'); barrel(c, 0.36, 0.36);
  } else if (L >= 3) {
    // Market Hall: open arcade below, hall above, clock lantern on the roof
    footing(c, 0, -0.04, 0.9, 0.76);
    gb.cbox(0, -0.01, -0.04, 0.9, 0.05, 0.76, STONE, 0, 0.01);
    for (let i = 0; i < 5; i++) for (const z of [-0.39, 0.31]) gb.cbox(-0.4 + i * 0.2, 0.04, z, 0.055, 0.26, 0.055, '#cfc6b4', 0, 0.008);
    for (const x of [-0.4, 0.4]) for (const z of [-0.16, 0.08]) gb.cbox(x, 0.04, z, 0.055, 0.26, 0.055, '#cfc6b4', 0, 0.008);
    gb.cbox(0, 0.3, -0.04, 0.92, 0.36, 0.78, pal.brick, 0, 0.02);
    for (let i = 0; i < 5; i++) { win(c, -0.36 + i * 0.18, 0.41, 0.35, 0.08, 0.13, 'f', 0.9); win(c, -0.36 + i * 0.18, 0.41, -0.43, 0.08, 0.13, 'b', 0.9); }
    for (let i = 0; i < 3; i++) { win(c, 0.46, 0.41, -0.24 + i * 0.2, 0.08, 0.13, 'r', 0.9); win(c, -0.46, 0.41, -0.24 + i * 0.2, 0.08, 0.13, 'l', 0.9); }
    gb.hip(0, 0.66, -0.04, 0.92, 0.78, 0.26, pal.slate, 0.05);
    gb.cbox(0, 0.86, -0.04, 0.15, 0.15, 0.15, '#e9e2d4', 0, 0.01);
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, 0.935, 0.036, 0.045, 0.045, 0.01, 12, '#efe8da', 0, Math.PI / 2); gb.noGlow();
    gb.roof(0, 1.01, -0.04, 0.18, 0.18, 0.15, 0, pal.slate);
    const goods = ['#b8402f', '#d98a32', '#7aa34a', '#d9c050'];
    for (let i = 0; i < 3; i++) {
      const x = -0.25 + i * 0.25;
      gb.cbox(x, 0.04, -0.04, 0.16, 0.08, 0.1, '#86613e', 0, 0.008);
      for (let k = 0; k < 4; k++) gb.sphere(x - 0.05 + k * 0.034, 0.135, -0.04, 0.018, rng.pick(goods), 1);
    }
    lamp(c, -0.44, 0.44, 0.3); lamp(c, 0.44, 0.44, 0.3);
  } else {
    house(c, {
      z: -0.09, w: 0.88, d: 0.68, h: 0.8, floors: 3, wall: rng.chance(0.5) ? pal.stoneWall : pal.wall, roof: pal.slate,
      roofType: 'hip', rh: 0.28, chimney: true, shopWindow: true, nFront: 4, doorX: 0, lit: 0.9, plinth: STONE_D, doorW: 0.13,
    });
    for (let i = 0; i < 9; i++) gb.boxC(-0.4 + i * 0.1, 0.29, 0.3, 0.1, 0.014, 0.15, i % 2 ? awnB : awnA, 0.45);
    sign(c, 0, 0.38, 0.26, 0.4, 0.075, '#3b2f2a');
    gb.glow(1.8, 1.4, 0.6, 3.1); gb.box(0, 0.395, 0.27, 0.34, 0.035, 0.01, '#e0c070'); gb.noGlow();
    lamp(c, -0.4, 0.42, 0.3); lamp(c, 0.4, 0.42, 0.3);
    crate(c, -0.27, 0.42); barrel(c, 0.27, 0.42);
  }
};

MODELS.bakery = (c, L) => {
  const { gb, rng, pal } = c;
  const H = [0.34, 0.52, 0.62][Math.min(L, 2)];
  house(c, {
    z: -0.07, w: [0.64, 0.76, 0.88][Math.min(L, 2)], d: [0.52, 0.58, 0.64][Math.min(L, 2)], h: H, floors: L ? 2 : 1,
    wall: rng.chance(0.5) ? pal.wall : '#e2cfa8', roof: pal.thatched ? pal.thatch : pal.tile, roofType: pal.thatched ? 'thatch' : 'gable', rh: 0.26, alongZ: false,
    shopWindow: true, nFront: 3, doorX: 0, lit: 0.85, timber: pal.timber,
  });
  chimney(c, 0.2, 0.1, H + 0.36, -0.24, 'work', '#8f4f3a');
  // bread sign on a post
  const sx = 0.36, sz = 0.36, sy = c.gy(sx, sz);
  gb.box(sx, sy, sz, 0.016, 0.32, 0.016, '#3f342c');
  gb.box(sx, sy + 0.3, sz, 0.016, 0.016, 0.11, '#3f342c');
  gb.cyl(sx, sy + 0.22, sz + 0.05, 0.05, 0.05, 0.014, 12, '#c9944a', 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) gb.sphere(-0.36 + i * 0.05, c.gy(-0.36 + i * 0.05, 0.4) + 0.025, 0.4, 0.028, '#e2d4b4', 1, 0.8);
  if (L) {
    for (let i = 0; i < 6; i++) gb.boxC(-0.25 + i * 0.1, 0.28, 0.27, 0.1, 0.014, 0.13, i % 2 ? '#e9dfc9' : pal.awning, 0.45);
    const tx = -0.34, tz = 0.36, ty = c.gy(tx, tz);
    gb.cyl(tx, ty, tz, 0.055, 0.055, 0.065, 10, '#e9dfc9');
    gb.cyl(tx, ty + 0.065, tz, 0.006, 0.006, 0.13, 4, '#3f342c');
    gb.cone(tx, ty + 0.18, tz, 0.11, 0.05, 8, pal.awning);
  }
  if (L >= 2) {
    chimney(c, -0.24, 0.1, H + 0.32, -0.26, 'work', '#8f4f3a');
    sign(c, 0, H - 0.08, 0.26, 0.34, 0.07, '#5e432c');
    gb.glow(1.8, 1.4, 0.6, 3.1); gb.box(0, H - 0.065, 0.268, 0.28, 0.035, 0.01, '#e0c070'); gb.noGlow();
    lamp(c, 0.42, 0.44, 0.3);
  }
};

MODELS.tavern = (c, L) => {
  const { gb, rng, pal } = c;
  if (L === 0) {
    house(c, {
      z: -0.09, w: 0.74, d: 0.56, h: 0.58, floors: 2, wall: pal.wall, roof: pal.thatched ? pal.thatch : pal.tile,
      roofType: pal.thatched ? 'thatch' : 'gable', rh: 0.3, timber: true, chimney: true, lit: 0.95, plinth: STONE,
    });
  } else if (L >= 2) {
    // Coaching Inn: tall inn, a stable wing with a carriage arch, and a coach waiting outside
    house(c, {
      x: -0.17, z: -0.12, w: 0.6, d: 0.66, h: 0.86, floors: 3, wall: pal.wall, roof: pal.slate,
      roofType: 'gable', rh: 0.32, timber: true, chimney: true, lit: 0.95, plinth: STONE, dormers: 1, nFront: 3,
    });
    footing(c, 0.3, -0.12, 0.34, 0.66);
    gb.cbox(0.3, 0, -0.12, 0.34, 0.5, 0.66, pal.wall, 0, 0.016);
    gb.gable(0.3, 0.5, -0.12, 0.34, 0.66, 0.22, pal.wall, pal.slate, 0.04, true, 0.03);
    gb.box(0.3, 0, 0.205, 0.18, 0.24, 0.012, '#2a2018');
    gb.cyl(0.3, 0.24, 0.205, 0.09, 0.09, 0.012, 10, '#2a2018', 0, Math.PI / 2);
    for (let i = 0; i < 2; i++) win(c, 0.22 + i * 0.16, 0.33, 0.21, 0.07, 0.1, 'f', 0.95);
    const cx = 0.1, cz = 0.4, cy = c.gy(cx, cz);
    gb.push(cx, cy, cz, Math.PI / 2);
    gb.cbox(0, 0.05, 0, 0.12, 0.1, 0.2, '#3f5466', 0, 0.01);
    gb.box(0, 0.15, 0, 0.13, 0.015, 0.22, '#2a2826');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl(sx * 0.068, 0.035, sz * 0.07, 0.035, 0.035, 0.01, 8, '#2a2018', 0, 0, Math.PI / 2);
    gb.pop();
  } else {
    house(c, {
      x: -0.07, z: -0.1, w: 0.8, d: 0.62, h: 0.84, floors: 3, wall: pal.wall, roof: pal.slate,
      roofType: 'gable', rh: 0.32, timber: true, chimney: true, lit: 0.95, plinth: STONE, dormers: 2,
    });
    footing(c, 0.4, -0.14, 0.18, 0.44);
    gb.cbox(0.4, 0, -0.14, 0.18, 0.27, 0.44, pal.wood, 0, 0.012);
    gb.wedge(0.4, 0.27, -0.14, 0.23, 0.48, 0.09, '#5e4a36', Math.PI / 2);
    gb.box(0.4, 0, 0.081, 0.12, 0.17, 0.012, '#2f241b');
  }
  // hanging sign
  const px = 0.36, pz = 0.38, py = c.gy(px, pz);
  gb.box(px, py, pz, 0.018, 0.4, 0.018, '#3a2f28');
  gb.box(px - 0.06, py + 0.38, pz, 0.14, 0.018, 0.018, '#3a2f28');
  sign(c, px - 0.08, py + 0.27, pz, 0.11, 0.09, '#3f4f5a');
  gb.cyl(px - 0.08, py + 0.31, pz + 0.01, 0.022, 0.022, 0.012, 8, '#d0a03a', 0, Math.PI / 2);
  barrel(c, -0.4, 0.34); barrel(c, -0.33, 0.4, 0.9);
  const tx = -0.1, tz = 0.38, ty = c.gy(tx, tz);
  gb.box(tx, ty, tz, 0.016, 0.065, 0.016, '#3f342c');
  gb.cyl(tx, ty + 0.065, tz, 0.055, 0.055, 0.01, 8, '#7a5636');
  lamp(c, 0.14, 0.42, 0.26);
};

MODELS.farm = (c, L) => {
  const { gb, rng, pal } = c;
  // farmhouse + barn at the back, fields at the front
  house(c, {
    x: -0.5, z: -0.54, w: 0.6, d: 0.46, h: L >= 3 ? 0.52 : 0.32, floors: L >= 3 ? 2 : 1, wall: L >= 3 ? pal.stoneWall : pal.wall,
    roof: L >= 3 ? pal.slate : pal.thatched ? pal.thatch : pal.roof,
    roofType: L >= 3 ? 'hip' : pal.thatched ? 'thatch' : 'gable', rh: 0.24, chimney: true, timber: L < 3 && pal.timber,
  });
  const barnCol = rng.pick(['#8f3e2c', '#83402e', '#7a5a3c', '#9a4a34']);
  footing(c, 0.44, -0.52, 0.66, 0.54);
  gb.cbox(0.44, 0, -0.52, 0.66, 0.4, 0.54, barnCol, 0, 0.02);
  gb.gable(0.44, 0.4, -0.52, 0.66, 0.54, 0.3, barnCol, '#4e463e', 0.05, true, 0.035);
  gb.box(0.44, 0, -0.245, 0.24, 0.27, 0.012, '#d8ccb4');
  gb.box(0.44, 0, -0.238, 0.2, 0.25, 0.012, shade(barnCol, 0.7));
  gb.box(0.44, 0.0, -0.232, 0.25, 0.012, 0.01, '#d8ccb4', 0, 0, 0.84);
  // fields (painted furrows + crop tufts)
  const fx0 = -0.92, fx1 = 0.92, fz0 = L >= 1 ? -0.12 : 0.04, fz1 = 0.92;
  c.work = [fx0 + 0.04, fz0 + 0.04, fx1 - 0.04, fz1 - 0.04];
  cropRows(c, fx0, fz0, fx1, fz1, CROP_TUFT[c.season]);
  fence(c, -0.96, fz0 - 0.03, 0.96, 0.96, FENCE, { x: 0, z: 0.96, w: 0.12 });
  if (L >= 1) {
    const sx = -0.03, sz = -0.66, sy = c.gy(sx, sz);
    gb.cyl(sx, sy - 0.02, sz, 0.13, 0.14, 0.66, 12, '#b8b0a0');
    gb.sphere(sx, sy + 0.64, sz, 0.135, '#6f7f8a', 1, 0.6);
    for (let i = 0; i < 2; i++) {
      const hx = -0.86 + i * 0.17, hz = -0.2, hy = c.gy(hx, hz);
      gb.cyl(hx, hy - 0.01, hz, 0.065, 0.075, 0.08, 9, '#cfa944');
      gb.sphere(hx, hy + 0.07, hz, 0.068, '#c9a240', 1, 0.7);
    }
    const tx = -0.16, tz = -0.24;
    gb.cbox(tx, c.gy(tx, tz), tz, 0.22, 0.05, 0.07, '#6b4a2f', 0, 0.008);
  }
  if (L >= 2) {
    const mx = 0.84, mz = -0.86, my = c.gy(mx, mz);
    gb.cyl(mx, my - 0.03, mz, 0.1, 0.17, 0.8, 9, '#ddd2bc');
    gb.cone(mx, my + 0.77, mz, 0.13, 0.18, 9, '#5e4a36');
    gb.glow(WARM[0], WARM[1], WARM[2], 1.3); gb.box(mx, my + 0.32, mz + 0.125, 0.04, 0.06, 0.02, GLASS); gb.noGlow();
    const blades = new GeoBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      blades.boxC(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0, 0.36, 0.014, 0.014, '#4e3a2a', 0, 0, a);
      blades.boxC(Math.cos(a) * 0.22 + Math.cos(a + Math.PI / 2) * 0.04, Math.sin(a) * 0.22 + Math.sin(a + Math.PI / 2) * 0.04, 0, 0.27, 0.065, 0.006, '#e3d8c2', 0, 0, a);
    }
    blades.cyl(0, 0, -0.02, 0.028, 0.028, 0.05, 6, '#3a2f28', 0, Math.PI / 2);
    c.spin = { geo: blades.build(), x: mx, y: my + 0.72, z: mz + 0.19, speed: 1.2 };
  }
  if (L >= 3) {
    // orchard along the front fence and a dovecote
    for (let i = 0; i < 6; i++) smallTree(c, -0.8 + i * 0.32, 0.86, 0.75);
    const dx = -0.86, dz = -0.86, dy = c.gy(dx, dz);
    gb.cyl(dx, dy - 0.02, dz, 0.06, 0.07, 0.32, 8, '#e3dccb');
    gb.cone(dx, dy + 0.3, dz, 0.09, 0.1, 8, '#4e463e');
  }
};

MODELS.lumber = (c, L) => {
  const { gb, rng, pal } = c;
  house(c, {
    x: -0.12, z: -0.18, w: 0.52, d: 0.42, h: 0.3, wall: pal.wood, roof: rng.pick(ROOF_SHINGLE), roofType: 'gable', rh: 0.2,
    chimney: rng.chance(0.6), lit: 0.6,
  });
  // log-cabin texture: horizontal logs on the front wall
  for (let k = 0; k < 4; k++) gb.cyl(-0.12 - 0.27, 0.04 + k * 0.07, -0.18 + 0.215, 0.018, 0.018, 0.54, 6, '#6e4e31', 0, 0, -Math.PI / 2);
  logs(c, 0.32, -0.05, 4, 0);
  logs(c, 0.26, 0.32, 3, Math.PI / 2);
  const bx = -0.28, bz = 0.28, by = c.gy(bx, bz);
  gb.cyl(bx, by, bz, 0.045, 0.05, 0.065, 9, '#6e4e31');
  gb.box(bx, by + 0.065, bz, 0.008, 0.065, 0.008, '#4a3a2c', 0, 0.4);
  for (let i = 0; i < 6; i++) { const px = -0.1 + rng.float(-0.12, 0.12), pz = 0.3 + rng.float(-0.06, 0.06); gb.box(px, c.gy(px, pz), pz, 0.045, 0.012, 0.016, '#c29b64', rng.float(0, 3)); }
  if (L >= 1) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const px = 0.2 + sx * 0.21, pz = 0.2 + sz * 0.15; gb.box(px, c.gy(px, pz) - 0.01, pz, 0.026, 0.28, 0.026, '#4e3a2a'); }
    gb.gable(0.2, 0.27, 0.2, 0.5, 0.38, 0.13, '#6e5034', rng.pick(ROOF_SHINGLE), 0.04);
    gb.cbox(0.2, c.gy(0.2, 0.2), 0.2, 0.32, 0.075, 0.09, '#86663f', 0, 0.008);
    gb.cyl(0.2, c.gy(0.2, 0.2) + 0.075, 0.2, 0.055, 0.055, 0.01, 12, '#a8acb2', 0, Math.PI / 2);
    for (let k = 0; k < 4; k++) gb.box(-0.36, c.gy(-0.36, 0.0) + k * 0.018, 0.0, 0.09, 0.016, 0.3, '#c9a46a');
  } else smallTree(c, 0.4, -0.4, 0.95);
  if (L >= 2) {
    // a timber crane and more stacked planks
    const kx = 0.38, kz = -0.36, ky = c.gy(kx, kz);
    gb.box(kx, ky - 0.01, kz, 0.03, 0.55, 0.03, '#4e3a2a');
    gb.box(kx - 0.12, ky + 0.52, kz, 0.3, 0.025, 0.025, '#4e3a2a');
    gb.box(kx - 0.24, ky + 0.3, kz, 0.004, 0.22, 0.004, '#2a2620');
    gb.box(kx - 0.24, ky + 0.26, kz, 0.16, 0.04, 0.04, '#7d5b3b');
    for (let k = 0; k < 5; k++) gb.box(-0.12, c.gy(-0.12, -0.42) + k * 0.018, -0.42, 0.28, 0.016, 0.09, k % 2 ? '#c9a46a' : '#b8925a');
  }
};

MODELS.fishery = (c, L) => {
  const { gb, rng } = c;
  const hutCol = rng.pick(['#6f8a95', '#7f989c', '#8f7a5e', '#6f8a7a']);
  house(c, {
    x: -0.1, z: -0.16, w: L ? 0.6 : 0.48, d: L ? 0.48 : 0.4, h: L ? 0.36 : 0.28, wall: hutCol, roof: rng.pick(ROOF_SHINGLE),
    roofType: 'gable', rh: 0.2, chimney: L >= 1, smokeKind: 'work', lit: 0.6,
  });
  const rx = 0.3, rz = 0.18, ry = c.gy(rx, rz);
  for (const sx of [-1, 1]) gb.box(rx + sx * 0.12, ry, rz, 0.016, 0.2, 0.016, '#4e3a2a');
  gb.box(rx, ry + 0.19, rz, 0.27, 0.012, 0.012, '#4e3a2a');
  for (let i = 0; i < 4; i++) gb.box(rx - 0.08 + i * 0.055, ry + 0.11, rz, 0.022, 0.065, 0.008, '#93a6b0');
  const boat = (x, z, rot) => {
    gb.push(x, c.gy(x, z), z, rot);
    gb.roof(0, 0.0, 0, 0.13, 0.32, 0.065, 0, '#6e4a2c', 0);
    gb.box(0, 0.0, 0, 0.11, 0.035, 0.24, '#7d5b3b');
    gb.box(0, 0.035, 0, 0.1, 0.008, 0.022, '#4a3a2c');
    gb.pop();
  };
  boat(-0.32, 0.32, 0.3);
  if (L) boat(0.34, 0.4, -0.2);
  barrel(c, 0.4, -0.34); crate(c, 0.33, -0.22);
  if (L >= 2) {
    // smokehouse and a cargo crane
    const hx = 0.32, hz = -0.3;
    footing(c, hx, hz, 0.2, 0.2);
    gb.cbox(hx, 0, hz, 0.2, 0.32, 0.2, '#7a6a58', 0, 0.012);
    gb.roof(hx, 0.32, hz, 0.24, 0.24, 0.12, 0, '#4e463e');
    c.addSmoke(hx, 0.48, hz, 'work');
    const kx = -0.42, kz = -0.38, ky = c.gy(kx, kz);
    gb.box(kx, ky, kz, 0.026, 0.42, 0.026, '#4e3a2a');
    gb.box(kx + 0.1, ky + 0.4, kz, 0.24, 0.022, 0.022, '#4e3a2a');
    gb.box(kx + 0.2, ky + 0.2, kz, 0.004, 0.2, 0.004, '#2a2620');
    gb.cbox(kx + 0.2, ky + 0.14, kz, 0.07, 0.06, 0.07, '#a88458', 0, 0.006);
    crate(c, 0.1, 0.42); crate(c, 0.17, 0.4, 0.85);
  }
};

MODELS.workshop = (c, L) => {
  const { gb, rng, pal } = c;
  if (L === 0) {
    house(c, {
      z: -0.1, w: 0.64, d: 0.5, h: 0.36, wall: pal.stoneWall, roof: pal.slate, roofType: 'gable', rh: 0.22,
      chimney: true, smokeKind: 'work', lit: 0.6,
    });
    crate(c, 0.34, 0.32); crate(c, 0.4, 0.24, 0.8); crate(c, 0.36, 0.28, 0.6, '#7a5a3c');
    const wx = -0.34, wz = 0.32;
    gb.cyl(wx, c.gy(wx, wz) + 0.075, wz, 0.075, 0.075, 0.014, 10, '#5e432c', 0.4, Math.PI / 2, 0);
  } else if (L === 1) {
    house(c, {
      z: -0.17, w: 0.66, d: 0.42, h: 0.38, wall: pal.stoneWall, roof: pal.slate, roofType: 'gable', rh: 0.2, lit: 0.5,
      noDoor: true,
    });
    for (const sx of [-1, 1]) gb.box(sx * 0.3, c.gy(sx * 0.3, 0.2) - 0.01, 0.2, 0.026, 0.3, 0.026, '#4e3a2a');
    gb.wedge(0, 0.28, 0.12, 0.68, 0.24, 0.09, '#4e5357');
    gb.cbox(-0.12, 0, 0.06, 0.2, 0.13, 0.13, STONE_D, 0, 0.012);
    gb.glow(2.6, 0.9, 0.2, 2.0); gb.box(-0.12, 0.13, 0.06, 0.13, 0.02, 0.085, '#ff7a2a'); gb.noGlow();
    const ax = 0.13, az = 0.18, ay = c.gy(ax, az);
    gb.box(ax, ay, az, 0.05, 0.055, 0.04, '#34322f');
    gb.box(ax, ay + 0.055, az, 0.1, 0.03, 0.05, '#45423e');
    chimney(c, -0.12, 0.2, 0.7, -0.06, 'heavy', STONE_D);
    c.addGlow(-0.12, 0.16, 0.06, 'forge');
  } else {
    footing(c, 0, -0.08, 0.9, 0.7);
    gb.cbox(0, 0, -0.08, 0.9, 0.52, 0.7, pal.brick, 0, 0.022);
    for (let i = 0; i < 3; i++) gb.wedge(-0.3 + i * 0.3, 0.52, -0.08, 0.3, 0.72, 0.17, '#4e5357', Math.PI / 2);
    for (let f = 0; f < 2; f++) for (let i = 0; i < 4; i++) {
      win(c, -0.33 + i * 0.22, 0.09 + f * 0.22, 0.27, 0.11, 0.11, 'f', 0.9);
      win(c, -0.33 + i * 0.22, 0.09 + f * 0.22, -0.43, 0.11, 0.11, 'b', 0.9);
    }
    door(c, 0, 0.27, 0.15, 0.2, '#2f241b');
    const cx = 0.34, cz = -0.32;
    gb.cyl(cx, 0, cz, 0.065, 0.085, 1.15, 8, '#7f3f2e');
    gb.cyl(cx, 1.15, cz, 0.075, 0.075, 0.045, 8, '#5f3022');
    c.addSmoke(cx, 1.22, cz, 'heavy');
    crate(c, -0.4, 0.4); crate(c, -0.31, 0.42, 0.8); barrel(c, 0.4, 0.4);
  }
};

MODELS.well = (c, L) => {
  const { gb, pal } = c;
  if (L === 0) {
    footing(c, 0, 0, 0.3, 0.3);
    gb.cyl(0, -0.02, 0, 0.14, 0.155, 0.14, 12, STONE);
    gb.cyl(0, 0.115, 0, 0.125, 0.125, 0.004, 12, '#2f5468');
    for (const sx of [-1, 1]) gb.box(sx * 0.13, 0.08, 0, 0.024, 0.27, 0.024, '#4e3a2a');
    gb.gable(0, 0.34, 0, 0.36, 0.24, 0.11, '#6e4a2c', pal.thatched ? pal.thatch : pal.roof, 0.03);
    gb.cyl(0.13, 0.28, 0, 0.013, 0.013, 0.26, 6, '#4e3a2a', 0, 0, Math.PI / 2);
    gb.cyl(0.03, 0.19, 0, 0.024, 0.02, 0.04, 7, '#6e4a2c');
    bench(c, 0, 0.36, 0);
    flowers(c, -0.32, -0.32, 6, 0.07);
    bush(c, 0.34, -0.32);
  } else if (L >= 2) {
    // Waterworks: brick pump house with an engine chimney and a big round cistern
    house(c, { x: -0.18, z: -0.12, w: 0.5, d: 0.5, h: 0.4, wall: pal.brick, roof: pal.slate, roofType: 'gable', rh: 0.18, lit: 0.8, plinth: STONE, nFront: 2 });
    chimney(c, -0.36, 0.3, 0.95, -0.3, 'heavy', '#7f3f2e');
    const tx = 0.27, tz = 0.12, ty = c.gy(tx, tz);
    footing(c, tx, tz, 0.4, 0.4);
    gb.cyl(tx, ty - 0.02, tz, 0.19, 0.2, 0.24, 16, STONE);
    gb.cyl(tx, ty + 0.2, tz, 0.17, 0.17, 0.02, 16, '#3f7f9f');
    gb.cyl(tx, ty + 0.21, tz, 0.2, 0.2, 0.025, 16, '#8a8275');
    for (let k = 0; k < 4; k++) gb.box(tx - 0.2 + k * 0.13, ty + 0.235, tz + 0.2, 0.01, 0.06, 0.01, '#3a3a3e');
  } else {
    const H = 0.66;
    footing(c, 0, 0, 0.46, 0.46);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.19, 0, sz * 0.19, 0.032, H, 0.032, '#5e432c', 0, -sz * 0.08, sx * 0.08);
    gb.box(0, 0.3, 0.16, 0.32, 0.022, 0.022, '#5e432c');
    gb.box(0, 0.3, -0.16, 0.32, 0.022, 0.022, '#5e432c');
    gb.cyl(0, H, 0, 0.23, 0.23, 0.28, 14, '#86663f');
    for (let k = 0; k < 3; k++) gb.cyl(0, H + 0.04 + k * 0.085, 0, 0.235, 0.235, 0.013, 14, '#3f3d3a');
    gb.cone(0, H + 0.28, 0, 0.26, 0.15, 14, pal.roof);
    house(c, { x: -0.32, z: 0.28, w: 0.2, d: 0.18, h: 0.15, wall: pal.stoneWall, roof: pal.slate, roofType: 'gable', rh: 0.08, noDoor: true, noBack: true, lit: 0 });
  }
};

MODELS.clinic = (c, L) => {
  const { gb, rng, pal } = c;
  if (L === 0) {
    house(c, {
      z: -0.12, w: 0.58, d: 0.46, h: 0.31, wall: pal.wall, roof: rng.pick(ROOF_MOSS), roofType: 'thatch', rh: 0.23,
      chimney: true, timber: pal.timber,
    });
    for (let i = 0; i < 3; i++) {
      const bx = -0.3 + i * 0.3, bz = 0.34;
      gb.cbox(bx, c.gy(bx, bz) - 0.01, bz, 0.22, 0.05, 0.12, '#5e432c', 0, 0.008);
      for (let k = 0; k < 4; k++) gb.sphere(bx - 0.075 + k * 0.05, c.gy(bx, bz) + 0.055, bz, 0.024, i === 1 ? '#8f74b8' : '#5f8a42', 1);
    }
    const sx = 0.36, sz = 0.1;
    sign(c, sx, 0.2, sz, 0.1, 0.1, '#e9e0cc');
    gb.box(sx, 0.225, sz + 0.009, 0.06, 0.018, 0.006, '#4f7a45');
    gb.box(sx, 0.204, sz + 0.009, 0.018, 0.06, 0.006, '#4f7a45');
  } else if (L >= 2) {
    // Hospital: three storeys with two wings and a canopied entrance
    house(c, {
      z: -0.12, w: 0.56, d: 0.62, h: 0.84, floors: 3, wall: '#ece4d4', roof: pal.slate, roofType: 'hip', rh: 0.26,
      chimney: true, plinth: STONE, doorX: 0, doorW: 0.13, lit: 0.95, nFront: 3,
    });
    for (const sd of [-1, 1]) house(c, { x: sd * 0.37, z: -0.16, w: 0.2, d: 0.56, h: 0.58, floors: 2, wall: '#ece4d4', roof: pal.slate, roofType: 'hip', rh: 0.16, noDoor: true, plinth: STONE, nFront: 1, lit: 0.95 });
    gb.box(0, 0.24, 0.24, 0.26, 0.02, 0.12, pal.slate);
    for (const sd of [-1, 1]) gb.cyl(sd * 0.11, 0, 0.29, 0.012, 0.012, 0.24, 6, '#e9e2d4');
    sign(c, 0, 0.6, 0.198, 0.14, 0.14, '#f5f0e6');
    gb.glow(1.6, 0.3, 0.3, 3.0);
    gb.box(0, 0.655, 0.206, 0.09, 0.028, 0.008, '#b83a32');
    gb.box(0, 0.624, 0.206, 0.028, 0.09, 0.008, '#b83a32');
    gb.noGlow();
    bench(c, -0.33, 0.42); bench(c, 0.33, 0.42); lamp(c, 0.2, 0.44, 0.3); lamp(c, -0.2, 0.44, 0.3);
  } else {
    house(c, {
      z: -0.1, w: 0.8, d: 0.6, h: 0.56, floors: 2, wall: '#ece4d4', roof: pal.tile, roofType: 'hip', rh: 0.26,
      chimney: true, plinth: STONE, doorX: 0, doorW: 0.12, lit: 0.9,
    });
    sign(c, 0, 0.3, 0.21, 0.13, 0.13, '#f5f0e6');
    gb.glow(1.6, 0.3, 0.3, 3.0);
    gb.box(0, 0.355, 0.218, 0.085, 0.026, 0.008, '#b83a32');
    gb.box(0, 0.325, 0.218, 0.026, 0.085, 0.008, '#b83a32');
    gb.noGlow();
    bench(c, -0.3, 0.38); lamp(c, 0.36, 0.4, 0.3);
    bush(c, 0.22, 0.38); bush(c, -0.42, 0.22);
  }
};

MODELS.school = (c, L) => {
  const { gb, rng, pal } = c;
  const wall = rng.pick(['#a8573a', '#b8704a', '#d8b878', '#cfae86']);
  const H = [0.36, 0.52, 0.74][Math.min(L, 2)];
  house(c, {
    z: -0.15, w: [0.72, 0.84, 0.9][Math.min(L, 2)], d: L >= 2 ? 0.56 : 0.48, h: H, floors: L >= 2 ? 3 : L ? 2 : 1, wall: L >= 2 ? pal.stoneWall : wall,
    roof: pal.slate, roofType: L >= 2 ? 'hip' : 'gable', rh: 0.24, doorX: 0, doorW: 0.11, lit: 0.6, plinth: STONE,
  });
  if (L >= 2) {
    // Academy: a clock tower with a spire over the entrance
    gb.cbox(0, 0, 0.12, 0.2, H + 0.42, 0.14, pal.stoneWall, 0, 0.014);
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, H + 0.24, 0.19, 0.055, 0.055, 0.01, 12, '#efe8da', 0, Math.PI / 2); gb.noGlow();
    gb.roof(0, H + 0.42, 0.12, 0.22, 0.16, 0.34, 0, pal.slate);
    door(c, 0, 0.19, 0.08, 0.17, '#4e3424');
  } else {
    gb.cbox(0, H + 0.09, -0.15, 0.13, 0.17, 0.13, '#e9e0cc', 0, 0.01);
    gb.box(0, H + 0.26, -0.15, 0.14, 0.012, 0.14, '#4e3a2a');
    gb.cyl(0, H + 0.18, -0.15, 0.026, 0.037, 0.045, 7, '#c08a3a');
    gb.roof(0, H + 0.27, -0.15, 0.17, 0.17, 0.13, 0, pal.slate);
  }
  const fx = 0.4, fz = 0.36, fy = c.gy(fx, fz);
  gb.box(fx, fy, fz, 0.011, 0.44, 0.011, '#cfcfcf');
  gb.box(fx + 0.045, fy + 0.36, fz, 0.085, 0.055, 0.004, rng.pick(AWNING));
  if (L) {
    const px = -0.32, pz = 0.08, py = c.gy(px, pz);
    gb.box(px - 0.1, py, pz, 0.022, 0.15, 0.022, '#5e432c');
    gb.box(px + 0.1, py, pz, 0.022, 0.15, 0.022, '#5e432c');
    gb.box(px, py + 0.14, pz, 0.24, 0.016, 0.016, '#5e432c');
    gb.box(px - 0.04, py + 0.05, pz, 0.05, 0.008, 0.03, '#a8473a');
    gb.box(px + 0.04, py + 0.05, pz, 0.05, 0.008, 0.03, '#3f6a8f');
  }
  fence(c, -0.47, 0.2, 0.47, 0.47, FENCE, { x: 0, z: 0.47, w: 0.12 });
};

MODELS.watch = (c, L) => {
  const { gb, rng, pal } = c;
  const tower = (x, z, H, s) => {
    footing(c, x, z, 0.3 * s, 0.3 * s);
    gb.cbox(x, 0, z, 0.3 * s, H, 0.3 * s, pal.stoneWall, 0, 0.02);
    gb.cbox(x, H, z, 0.36 * s, 0.045, 0.36 * s, STONE_D, 0, 0.012);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cbox(x + sx * 0.14 * s, H + 0.045, z + sz * 0.14 * s, 0.075 * s, 0.075, 0.075 * s, pal.stoneWall, 0, 0.01);
    gb.roof(x, H + 0.12, z, 0.34 * s, 0.34 * s, 0.25, 0, pal.roof);
    gb.box(x, H + 0.35, z, 0.011, 0.22, 0.011, '#2f2c2a');
    gb.box(x + 0.055, H + 0.49, z, 0.11, 0.065, 0.004, rng.pick(['#a8473a', '#3f6a8f', '#c08a3a']));
    win(c, x, H * 0.6, z + 0.15 * s, 0.055, 0.085, 'f', 0.9);
    win(c, x + 0.15 * s, H * 0.6, z, 0.055, 0.085, 'r', 0.9);
    c.addGlow(x, H * 0.6 + 0.045, z + 0.17 * s);
  };
  if (L === 0) {
    tower(0, -0.05, 0.82, 1.05);
    door(c, 0, 0.108, 0.075, 0.14, '#2f241b');
    barrel(c, 0.33, 0.33); crate(c, -0.33, 0.33);
  } else if (L >= 2) {
    // Constabulary: two-storey brick station with a tall bell tower
    house(c, {
      x: -0.12, z: -0.1, w: 0.68, d: 0.56, h: 0.58, floors: 2, wall: pal.brick, roof: pal.slate, roofType: 'hip', rh: 0.22,
      chimney: true, lit: 0.9, plinth: STONE, doorX: 0,
    });
    tower(0.33, -0.3, 1.2, 0.9);
    sign(c, -0.12, 0.42, 0.185, 0.3, 0.06, '#2f3e5a');
    gb.glow(1.0, 1.4, 2.2, 3.0); gb.box(-0.12, 0.6, 0.19, 0.04, 0.05, 0.03, '#b8d0ff'); gb.noGlow();
    lamp(c, 0.36, 0.4, 0.3); lamp(c, -0.42, 0.4, 0.3);
  } else {
    house(c, {
      x: -0.1, z: -0.1, w: 0.64, d: 0.5, h: 0.38, wall: pal.stoneWall, roof: pal.slate, roofType: 'hip', rh: 0.2,
      chimney: true, lit: 0.8,
    });
    tower(0.32, -0.3, 1.0, 0.95);
    lamp(c, 0.36, 0.38, 0.3);
  }
};

MODELS.chapel = (c, L) => {
  const { gb, rng, pal } = c;
  if (L >= 2) { minster(c); return; }
  const wall = L ? pal.stoneWall : '#ece4d4';
  const w = L ? 0.52 : 0.42, d = L ? 0.8 : 0.64, h = L ? 0.52 : 0.4;
  const z0 = -0.12;
  footing(c, 0, z0, w, d);
  gb.cbox(0, 0, z0, w, h, d, wall, 0, 0.022);
  gb.gable(0, h, z0, w, d, L ? 0.34 : 0.28, wall, L ? pal.slate : pal.roof, 0.05, true, 0.035);
  const stained = [[1.4, 0.5, 0.5], [0.5, 0.7, 1.6], [1.4, 1.1, 0.4]];
  for (let i = 0; i < 3; i++) {
    const zz = z0 - d / 2 + (i + 0.5) * (d / 3);
    for (const side of [1, -1]) {
      const s = stained[(i + (side > 0 ? 0 : 1)) % 3];
      gb.glow(s[0], s[1], s[2], 1.05 + rng.float(0, 0.2));
      gb.box(side * (w / 2 + 0.007), h * 0.3, zz, 0.016, h * 0.45, 0.065, '#3f4a6e');
      gb.noGlow();
      if (L) gb.cbox(side * (w / 2 + 0.022), 0, zz + d / 6, 0.045, h * 0.7, 0.055, STONE_D, 0, 0.01);
    }
  }
  const tw = L ? 0.22 : 0.17, th = L ? 1.05 : 0.68;
  const tz = z0 + d / 2 - tw / 2 + 0.03;
  gb.cbox(0, 0, tz, tw, th, tw, wall, 0, 0.016);
  gb.roof(0, th, tz, tw + 0.03, tw + 0.03, L ? 0.5 : 0.34, 0, L ? pal.slate : pal.roof);
  gb.box(0, th + (L ? 0.5 : 0.34), tz, 0.011, 0.09, 0.011, '#c9a43a');
  gb.box(0, th + (L ? 0.545 : 0.385), tz, 0.055, 0.011, 0.011, '#c9a43a');
  gb.box(0, th * 0.62, tz + tw / 2 + 0.004, 0.055, 0.09, 0.011, '#2a2826');
  if (L) {
    gb.cyl(0, th * 0.8, tz + tw / 2 + 0.006, 0.055, 0.055, 0.011, 12, '#efe8da', 0, Math.PI / 2);
    gb.box(0, th * 0.8, tz + tw / 2 + 0.013, 0.004, 0.038, 0.004, '#2a2826');
  }
  door(c, 0, tz + tw / 2, 0.075, 0.16, '#4e3424');
  for (let i = 0; i < (L ? 4 : 3); i++) {
    const gx = 0.36 * (i % 2 ? 1 : -1), gz = -0.4 + Math.floor(i / 2) * 0.17;
    gb.cbox(gx, c.gy(gx, gz) - 0.01, gz, 0.055, 0.075, 0.017, '#a39e94', 0, 0.006);
  }
  bush(c, -0.38, 0.32); bush(c, 0.38, 0.32);
  if (L) lamp(c, 0.27, 0.42, 0.3);
};

// Minster: a big stone church with twin west towers and a rose window
function minster(c) {
  const { gb, pal } = c;
  const wall = pal.stoneWall, roof = pal.slate;
  const w = 0.5, d = 0.86, h = 0.62, z0 = -0.08;
  footing(c, 0, z0, w + 0.1, d);
  gb.cbox(0, 0, z0, w, h, d, wall, 0, 0.02);
  gb.gable(0, h, z0, w, d, 0.36, wall, roof, 0.05, true, 0.035);
  for (const sd of [-1, 1]) {
    gb.cbox(sd * (w / 2 + 0.05), 0, z0 - 0.08, 0.1, h * 0.55, d - 0.24, wall, 0, 0.012);
    gb.wedge(sd * (w / 2 + 0.05), h * 0.55, z0 - 0.08, 0.14, d - 0.2, 0.07, roof, sd > 0 ? -Math.PI / 2 : Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      gb.glow([1.4, 0.5, 1.4][i % 3], [0.5, 0.7, 1.1][i % 3], [0.5, 1.6, 0.4][i % 3], 1.08);
      gb.box(sd * (w / 2 + 0.006), h * 0.6, z0 - d / 2 + 0.15 + i * 0.18, 0.016, h * 0.3, 0.06, '#3f4a6e');
      gb.noGlow();
    }
  }
  const tz = z0 + d / 2 - 0.06;
  for (const sd of [-1, 1]) {
    gb.cbox(sd * 0.17, 0, tz, 0.16, 1.15, 0.16, wall, 0, 0.014);
    gb.roof(sd * 0.17, 1.15, tz, 0.19, 0.19, 0.4, 0, roof);
    gb.box(sd * 0.17, 0.75, tz + 0.081, 0.05, 0.12, 0.012, '#2a2826');
  }
  gb.glow(1.6, 0.8, 1.6, 1.04);
  gb.cyl(0, 0.46, tz + 0.06, 0.07, 0.07, 0.012, 14, '#5a4a8a', 0, Math.PI / 2);
  gb.noGlow();
  door(c, 0, tz + 0.06, 0.1, 0.2, '#4e3424');
  for (let i = 0; i < 4; i++) { const gx = 0.4 * (i % 2 ? 1 : -1), gz = -0.42 + Math.floor(i / 2) * 0.2; gb.cbox(gx, c.gy(gx, gz) - 0.01, gz, 0.055, 0.075, 0.017, '#a39e94', 0, 0.006); }
  lamp(c, 0.36, 0.44, 0.3); lamp(c, -0.36, 0.44, 0.3);
}

MODELS.townhall = (c, L) => {
  const { gb, pal } = c;
  const wall = pal.wall;
  const H = 0.66 + L * 0.06;
  const W = 1.2 + (L >= 2 ? 0.2 : 0), D = 0.8;
  c.shutters = '#3f5466';
  house(c, {
    z: -0.3, w: W, d: D, h: H, floors: 2, wall, roof: pal.slate, roofType: 'hip', rh: 0.34, plinth: STONE, doorX: 0,
    doorW: 0.15, lit: 0.85, nFront: 6, chimney: true, timber: pal.timber,
  });
  if (L >= 1) {
    for (const sx of [-1, 1]) {
      house(c, {
        x: sx * 0.76, z: -0.22, w: 0.36, d: 0.66, h: H * 0.75, floors: 2, wall, roof: pal.slate, roofType: 'hip', rh: 0.22,
        plinth: STONE, noDoor: true, lit: 0.85,
      });
    }
  }
  const tz = -0.3, th = H + 0.55 + L * 0.12;
  gb.cbox(0, H, tz, 0.3, th - H, 0.3, wall, 0, 0.016);
  gb.cbox(0, th, tz, 0.35, 0.035, 0.35, STONE, 0, 0.01);
  for (const [fx, fz, ry] of [[0, 0.155, 0], [0.155, 0, Math.PI / 2]]) {
    gb.glow(1.2, 1.1, 0.8, 1.02);
    gb.cyl(fx, th - 0.17, tz + fz, 0.08, 0.08, 0.012, 14, '#efe8da', ry, Math.PI / 2);
    gb.noGlow();
  }
  if (L >= 2) {
    gb.cyl(0, th + 0.035, tz, 0.16, 0.16, 0.065, 12, wall);
    gb.sphere(0, th + 0.1, tz, 0.16, '#b8963a', 1, 0.9);
    gb.box(0, th + 0.24, tz, 0.013, 0.13, 0.013, '#b8963a');
  } else gb.roof(0, th + 0.035, tz, 0.35, 0.35, 0.36, 0, pal.slate);
  if (L >= 2) {
    for (let i = 0; i < 6; i++) gb.cyl(-0.32 + i * 0.128, 0.07, 0.15, 0.024, 0.028, H * 0.6, 8, '#e9e2d4');
    gb.cbox(0, 0.07 + H * 0.6, 0.15, 0.8, 0.045, 0.13, '#e9e2d4', 0, 0.01);
    gb.gable(0, 0.115 + H * 0.6, 0.13, 0.8, 0.19, 0.11, '#e9e2d4', pal.slate, 0.02);
  }
  for (const sx of [-1, 1]) {
    const fx = sx * 0.64, fz = 0.56, fy = c.gy(fx, fz);
    gb.box(fx, fy, fz, 0.013, 0.6, 0.013, '#cfcfcf');
    gb.box(fx + 0.065, fy + 0.5, fz, 0.13, 0.085, 0.004, sx > 0 ? '#a8473a' : '#3f6a8f');
    lamp(c, sx * 0.32, 0.62, 0.32);
    bench(c, sx * 0.42, 0.84, Math.PI);
    bush(c, sx * 0.86, 0.86, 1.2);
  }
  flowers(c, -0.16, 0.86, 7, 0.09);
  flowers(c, 0.16, 0.86, 7, 0.09);
};

MODELS.garden = (c, L) => {
  const { gb, rng } = c;
  c.work = [-0.4, -0.4, 0.4, 0.4];
  if (L === 0) {
    bench(c, 0, 0.12, rng.float(-0.3, 0.3));
    smallTree(c, rng.float(-0.32, -0.2), rng.float(-0.32, -0.2), 1.25);
    bush(c, 0.32, -0.3, 1.2); bush(c, -0.34, 0.34);
    flowers(c, 0.26, 0.26, 5, 0.07);
  } else if (L === 1) {
    for (const [x, z, w, d] of [[-0.3, -0.44, 0.34, 0.08], [0.3, -0.44, 0.34, 0.08], [-0.44, -0.3, 0.08, 0.34], [0.44, -0.3, 0.08, 0.34], [-0.44, 0.3, 0.08, 0.34], [0.44, 0.3, 0.08, 0.34]]) hedge(c, x, z, w, d);
    for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
      gb.cbox(x, c.gy(x, z) - 0.01, z, 0.22, 0.04, 0.22, '#5e432c', 0, 0.01);
      flowers(c, x, z, 7, 0.08);
    }
    const y = c.gy(0, 0);
    gb.cyl(0, y - 0.01, 0, 0.05, 0.065, 0.09, 8, STONE);
    gb.cyl(0, y + 0.08, 0, 0.085, 0.05, 0.03, 8, STONE);
    bench(c, 0.26, 0.42, Math.PI);
  } else {
    const py = c.gy(-0.18, 0.18);
    gb.cyl(-0.18, py - 0.01, 0.18, 0.21, 0.22, 0.02, 14, '#c9b99a');
    gb.cyl(-0.18, py + 0.0, 0.18, 0.18, 0.18, 0.016, 14, '#4b8fb0');
    for (let i = 0; i < 4; i++) gb.box(-0.33 + i * 0.03, py, 0.33 - i * 0.02, 0.006, 0.075, 0.006, '#5d7f3a');
    const gx = 0.2, gz = -0.2, gy = c.gy(gx, gz);
    gb.cyl(gx, gy - 0.02, gz, 0.18, 0.19, 0.05, 6, '#ddd2bc');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      gb.box(gx + Math.cos(a) * 0.15, gy + 0.03, gz + Math.sin(a) * 0.15, 0.02, 0.19, 0.02, '#ece4d4');
    }
    gb.cone(gx, gy + 0.22, gz, 0.21, 0.13, 6, '#8a432e');
    smallTree(c, -0.36, -0.3, 1.35);
    smallTree(c, 0.36, 0.32, 1.15);
    lamp(c, 0.02, 0.4, 0.3);
    bench(c, -0.05, -0.4, 0);
    flowers(c, 0.34, 0.05, 6, 0.06);
  }
};

MODELS.plaza = (c, L) => {
  const { gb, rng } = c;
  c.work = [-0.85, -0.85, 0.85, 0.85];
  // low stone kerb around the paved square (paving itself is painted on the ground)
  for (const [x, z, w, d] of [[0, -0.93, 1.86, 0.05], [0, 0.93, 1.86, 0.05], [-0.93, 0, 0.05, 1.86], [0.93, 0, 0.05, 1.86]]) {
    gb.cbox(x, c.gy(x, z) - 0.02, z, w, 0.045, d, '#9a9284', 0, 0.01);
  }
  if (L === 0) {
    footing(c, 0, 0, 0.3, 0.3);
    gb.cbox(0, 0, 0, 0.28, 0.13, 0.28, STONE, 0, 0.015);
    gb.cbox(0, 0.13, 0, 0.2, 0.2, 0.2, '#b8b0a2', 0, 0.015);
    gb.cyl(0, 0.33, 0, 0.055, 0.075, 0.13, 8, '#7a6a48');
    gb.sphere(0, 0.49, 0, 0.045, '#7a6a48', 1);
  } else {
    footing(c, 0, 0, 1.0, 1.0);
    gb.cyl(0, -0.02, 0, 0.5, 0.53, 0.12, 18, STONE);
    gb.cyl(0, 0.04, 0, 0.45, 0.45, 0.07, 18, '#4b8fb0');
    gb.cyl(0, 0, 0, 0.065, 0.085, 0.38, 8, '#b8b0a2');
    gb.cyl(0, 0.38, 0, 0.21, 0.085, 0.065, 12, '#b8b0a2');
    gb.cyl(0, 0.4, 0, 0.18, 0.18, 0.03, 12, '#5aa0c4');
    gb.cyl(0, 0.44, 0, 0.032, 0.042, 0.13, 6, '#b8b0a2');
    c.fountain = [0, 0.58, 0];
  }
  for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
    gb.cbox(x, c.gy(x, z) - 0.01, z, 0.22, 0.09, 0.22, STONE, 0, 0.012);
    smallTree(c, x, z, 1.15);
  }
  for (const [x, z, ry] of [[0, 0.7, Math.PI], [0, -0.7, 0], [0.7, 0, -Math.PI / 2], [-0.7, 0, Math.PI / 2]]) bench(c, x, z, ry);
  for (const [x, z] of [[-0.36, 0.84], [0.36, 0.84], [-0.36, -0.84], [0.36, -0.84]]) lamp(c, x, z, 0.33);
  if (L) for (const [x, z] of [[-0.86, 0], [0.86, 0]]) { gb.cbox(x, c.gy(x, z) - 0.01, z, 0.12, 0.07, 0.3, '#6b4a2f', 0, 0.01); flowers(c, x, z, 8, 0.1); }
  if (L >= 2) {
    // a bandstand and market umbrellas around the fountain
    const bx = 0.55, bz = 0.0;
    gb.cyl(bx, c.gy(bx, bz) - 0.01, bz, 0.2, 0.21, 0.06, 8, STONE);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gb.box(bx + Math.cos(a) * 0.17, c.gy(bx, bz) + 0.05, bz + Math.sin(a) * 0.17, 0.014, 0.2, 0.014, '#ece4d4'); }
    gb.cone(bx, c.gy(bx, bz) + 0.25, bz, 0.23, 0.14, 8, '#3f5a46');
    for (const [ux, uz, col] of [[-0.5, 0.35, '#a8473a'], [-0.5, -0.35, '#3f6a8f'], [-0.25, 0.55, '#c08a3a']]) {
      const uy = c.gy(ux, uz);
      gb.cbox(ux, uy, uz, 0.14, 0.07, 0.09, '#86613e', 0, 0.006);
      gb.cyl(ux, uy + 0.07, uz, 0.006, 0.006, 0.14, 4, '#3f342c');
      gb.cone(ux, uy + 0.2, uz, 0.12, 0.05, 8, col);
    }
  }
  void rng;
};

MODELS.flowers = (c) => {
  const { gb, rng } = c;
  const n = rng.int(1, 3);
  if (n === 1) {
    const y = c.gy(0, 0);
    gb.cyl(0, y - 0.02, 0, 0.33, 0.35, 0.07, 14, STONE);
    gb.cyl(0, y - 0.01, 0, 0.3, 0.3, 0.07, 14, '#4e3a28');
    for (let ring = 0; ring < 3; ring++) {
      const col = rng.pick(FLOWER);
      const r = 0.06 + ring * 0.09, k = 5 + ring * 6;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        gb.sphere(Math.cos(a) * r, y + 0.085, Math.sin(a) * r, 0.026, col, 1);
      }
    }
  } else {
    for (let b = 0; b < n; b++) {
      const z = -0.3 + (b + 0.5) * (0.6 / n) * 1.2 - 0.06;
      const y = c.gy(0, z);
      gb.cbox(0, y - 0.02, z, 0.76, 0.07, 0.19, '#6b4a2f', 0, 0.01);
      gb.box(0, y - 0.01, z, 0.72, 0.065, 0.16, '#4e3a28');
      const col = rng.pick(FLOWER), col2 = rng.pick(FLOWER);
      for (let i = 0; i < 12; i++) gb.sphere(-0.33 + i * 0.06, y + 0.075, z + (i % 2 ? 0.035 : -0.035), 0.025, i % 3 ? col : col2, 1);
    }
  }
  bush(c, 0.4, 0.4, 0.85); bush(c, -0.4, -0.4, 0.85);
};

MODELS.statue = (c) => {
  const { gb, rng } = c;
  const mat = rng.chance(0.5) ? '#7a6a48' : '#cfc8ba';
  footing(c, 0, 0, 0.3, 0.3);
  gb.cbox(0, 0, 0, 0.28, 0.07, 0.28, STONE, 0, 0.012);
  gb.cbox(0, 0.07, 0, 0.19, 0.24, 0.19, '#b8b0a2', 0, 0.012);
  gb.cbox(0, 0.31, 0, 0.23, 0.035, 0.23, STONE, 0, 0.008);
  gb.box(-0.026, 0.345, 0, 0.032, 0.13, 0.042, mat);
  gb.box(0.026, 0.345, 0, 0.032, 0.13, 0.042, mat);
  gb.cyl(0, 0.47, 0, 0.042, 0.053, 0.15, 8, mat);
  gb.sphere(0, 0.66, 0, 0.037, mat, 1);
  gb.box(0.052, 0.57, 0, 0.024, 0.14, 0.024, mat, 0, 0, -0.5);
  gb.box(-0.058, 0.51, 0, 0.024, 0.11, 0.024, mat, 0, 0, 0.2);
  for (const [x, z] of [[-0.38, 0.38], [0.38, -0.38]]) bush(c, x, z, 1.2);
  lamp(c, 0.38, 0.38, 0.3);
  lamp(c, -0.38, -0.38, 0.3);
  bench(c, -0.3, 0.42, Math.PI);
};

MODELS.coachstop = (c) => {
  const { gb, pal } = c;
  const z = 0.22;
  footing(c, 0, z - 0.03, 0.5, 0.2);
  gb.cbox(0, 0, z - 0.11, 0.46, 0.24, 0.025, pal.wood, 0, 0.006);
  for (const sx of [-1, 1]) {
    gb.cbox(sx * 0.22, 0, z - 0.04, 0.025, 0.24, 0.16, pal.wood, 0, 0.006);
    gb.box(sx * 0.22, 0, z + 0.08, 0.024, 0.26, 0.024, '#3f342c');
  }
  gb.wedge(0, 0.24, z - 0.02, 0.54, 0.27, 0.055, pal.thatched ? pal.thatch : pal.roof);
  bench(c, 0, z - 0.05, 0);
  const px = 0.34, pz = z + 0.15, py = c.gy(px, pz);
  gb.box(px, py, pz, 0.016, 0.32, 0.016, '#2f2c2a');
  gb.cyl(px, py + 0.32, pz, 0.045, 0.045, 0.013, 10, '#c9a040', 0, Math.PI / 2);
  gb.cyl(px, py + 0.32, pz + 0.013, 0.028, 0.028, 0.004, 10, '#2f4858', 0, Math.PI / 2);
  lamp(c, -0.34, z + 0.15, 0.3);
  smallTree(c, -0.32, -0.32, 1.15);
  bush(c, 0.32, -0.34);
  flowers(c, 0.05, -0.32, 6, 0.08);
};

MODELS.station = (c, L) => {
  const { gb, pal } = c;
  const k = c.railK ?? 2;
  const rk = (4 - k) % 4;
  gb.push(0, 0, 0, (k * Math.PI) / 2);
  footing(c, 0, 0.37, 0.96, 0.22);
  gb.cbox(0, 0, 0.37, 0.96, 0.075, 0.22, '#b8b0a2', 0, 0.01);
  gb.box(0, 0.075, 0.468, 0.96, 0.006, 0.03, '#d9c050');
  for (const px of [-0.32, 0, 0.32]) gb.box(px, 0.075, 0.33, 0.024, 0.26, 0.024, '#3f4a56');
  gb.wedge(0, 0.33, 0.37, 0.94, 0.28, 0.055, L ? pal.slate : '#6e5034', Math.PI);
  bench(c, -0.16, 0.32, Math.PI); bench(c, 0.18, 0.32, Math.PI);
  lamp(c, -0.45, 0.42, 0.32); lamp(c, 0.45, 0.42, 0.32);
  house(c, {
    x: 0, z: -0.15, w: L ? 0.76 : 0.62, d: 0.38, h: L ? 0.48 : 0.33, floors: L ? 2 : 1, wall: L ? pal.brick : pal.wall,
    roof: pal.slate, roofType: 'hip', rh: 0.18, chimney: true, ry: (rk * Math.PI) / 2, lit: 0.9, plinth: STONE,
  });
  gb.box(0, (L ? 0.48 : 0.33) - 0.02, 0.045, 0.32, 0.065, 0.012, '#2f4858');
  if (L) {
    gb.cyl(0, 0.39, 0.055, 0.055, 0.055, 0.011, 12, '#efe8da', 0, Math.PI / 2);
    gb.box(0, 0.39, 0.065, 0.004, 0.038, 0.004, '#2a2826');
  }
  gb.pop();
};

// Grime: surfaces darken toward the ground, like real weathered buildings.
function weather(geo) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = y < 0 ? 0.8 : 0.8 + 0.2 * Math.min(1, y / 0.28);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
}

// ---------------------------------------------------------------- entry

// Small per-building yaw and offset so streets don't look ruled with a pencil.
export function jitterOf(b) {
  if (b.size > 1 || b.type === 'plaza' || b.type === 'station') return { yaw: 0, ox: 0, oz: 0 };
  const h1 = hash2(b.variant & 0xffff, b.variant >>> 16, 31), h2 = hash2(b.variant & 0xffff, b.variant >>> 16, 32), h3 = hash2(b.variant & 0xffff, b.variant >>> 16, 33);
  return { yaw: (h1 - 0.5) * 0.16, ox: (h2 - 0.5) * 0.06, oz: (h3 - 0.5) * 0.06 };
}

// Outdoor area (fields, lawns, squares) in world coordinates, or null.
// Must match the c.work rectangles set by the models above.
export function workArea(b) {
  let r = null;
  if (b.type === 'farm') r = [-0.88, b.level >= 1 ? -0.08 : 0.08, 0.88, 0.88];
  else if (b.type === 'garden') r = [-0.4, -0.4, 0.4, 0.4];
  else if (b.type === 'plaza') r = [-0.85, -0.85, 0.85, 0.85];
  if (!r) return null;
  const E = b.size / 2, j = jitterOf(b);
  const th = (b.rot * Math.PI) / 2 + j.yaw, co = Math.cos(th), si = Math.sin(th);
  const cx = b.x + E + j.ox, cz = b.z + E + j.oz;
  const pts = [[r[0], r[1]], [r[2], r[3]]].map(([lx, lz]) => [cx + lx * co + lz * si, cz - lx * si + lz * co]);
  return [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
}

export function buildModel(b, opts = {}) {
  const gb = new GeoBuilder();
  gb.vary = 0.09;
  const pal = palette(b.variant);
  const rng = new RNG((b.variant ^ (b.level * 0x9E3779B1)) >>> 0);
  const E = b.size / 2;
  const jit = opts.flat ? { yaw: 0, ox: 0, oz: 0 } : jitterOf(b);
  const th = (b.rot * Math.PI) / 2 + jit.yaw, co = Math.cos(th), si = Math.sin(th);
  const cx = b.x + E + jit.ox, cz = b.z + E + jit.oz;
  const ground = opts.ground;
  const c = {
    gb, rng, pal, E, level: b.level, shutters: null, flowerBoxes: false,
    smoke: [], glows: [], spin: null, work: null, fountain: null,
    season: opts.season ?? 1,
    railK: b.rail ? ((b.rail.dir - b.rot + 4) % 4) : 2,
    // ground height (relative to the current frame) under local point (x, z)
    gy(x, z) {
      if (!ground) return 0;
      const e = gb.M.elements;
      const lx = e[0] * x + e[8] * z + e[12], lz = e[2] * x + e[10] * z + e[14];
      const wx = cx + lx * co + lz * si, wz = cz - lx * si + lz * co;
      return ground(wx, wz) - b.baseY - e[13];
    },
    addSmoke(x, y, z, kind = 'home') { const v = new THREE.Vector3(x, y, z).applyMatrix4(gb.M); c.smoke.push({ x: v.x, y: v.y, z: v.z, kind }); },
    addGlow(x, y, z, kind = 'lamp') { const v = new THREE.Vector3(x, y, z).applyMatrix4(gb.M); c.glows.push({ x: v.x, y: v.y, z: v.z, kind }); },
  };
  MODELS[b.type](c, b.level);
  const geo = gb.build();
  if (geo) weather(geo);
  return { geo, smoke: c.smoke, glows: c.glows, spin: c.spin, work: c.work, fountain: c.fountain, jitter: jit };
}
