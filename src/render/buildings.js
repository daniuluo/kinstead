// Procedural rustic building models. Every building is generated from its
// type, level and a per-building variant seed, so no two cottages match.
// Local space: origin at footprint centre, y=0 at the building's base level
// (the highest ground under its plot), +z faces the road. Yard props sit on
// the real terrain via c.gy(); structures get stone foundations on slopes.

import * as THREE from 'three';
import { GeoBuilder, shade } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS } from '../defs.js';
import { RNG, hash2 } from '../util/rng.js';

const fw = (b) => b.w ?? b.size, fd = (b) => b.d ?? b.size;

const WALLS = ['#e6d9bf', '#dccdb0', '#d8c29a', '#cdb795', '#e2d4ba', '#c9b48f', '#d6c4a8', '#bfae94', '#e0cfae', '#d2bc98', '#efe7d6'];
// painted plaster in many colours
const PAINTED = ['#c9d3b8', '#b4c6d2', '#e2b9a8', '#d9b36a', '#c99a78', '#cfc3dc', '#e6dca6', '#a9c4ae', '#e8c6c0', '#d6a77e',
  '#b9c9c0', '#e4cf8f', '#c0b3d0', '#d9c0a0', '#a8bccb', '#e3a98f', '#cbd6a8', '#f0d9b5'];
const STONE_WALLS = ['#a99f90', '#9a907f', '#b3a996', '#a39784', '#bdb3a0', '#8f8676', '#a8a294'];
const BRICK = ['#9a5640', '#8c4c38', '#a3624a', '#7e4a3a', '#b07454', '#93503e', '#a86c50'];
const CLAPBOARD = ['#7f98a3', '#8a4a3a', '#5e7a5a', '#c8b48a', '#e6e0d2', '#6f6a8a', '#a8804e', '#4f6a7a', '#b8c4a8'];
const WOOD = ['#7a5a3c', '#6e5034', '#86663f', '#755636', '#8a6a48', '#5e4630'];
const ROOF_TILE = ['#9c4a32', '#8a432e', '#a8573a', '#7d3b2a', '#94503a', '#b05a38', '#a86a40', '#8e3c30'];
const ROOF_SLATE = ['#5a5f63', '#4e5357', '#666a6b', '#55585e', '#4a5560', '#5a4e60', '#3f4a52'];
const ROOF_THATCH = ['#b8955a', '#a8854c', '#c2a064', '#9e7f4a', '#b08850'];
const ROOF_MOSS = ['#6b7a4a', '#5e6e44', '#74804f', '#3f4a3f'];
const ROOF_SHINGLE = ['#6f5a44', '#7b6247', '#665240', '#836a50', '#5c4a3c'];
const ROOF_COLOR = ['#6a7d8a', '#7a5a6a', '#4f6a5a', '#8a6a3a', '#5a6a7a'];
const ACCENT = ['#2f5a8a', '#8a2f2f', '#2f6a4a', '#c09040', '#5a3a6a', '#3f4f5a', '#6b3a2a', '#4f6a4a', '#7a6a4a', '#e8e0d0',
  '#1f4a6a', '#a04a2a', '#3a6a6a', '#7a3a5a', '#d0b060'];
const DOORS = ['#5c3d26', '#6b3a2a', '#3f4f5a', '#4a5a3a', '#6e4a2e', '#4e3828'];
const AWNING = ['#a8473a', '#3f6a8f', '#4f7a45', '#c08a3a', '#7a5a8a', '#b8653f', '#2f7a7a', '#a83a6a', '#6a8a2a'];
const FLOWER = ['#d9536b', '#e8b84a', '#e88fae', '#f2ede0', '#9c74c9', '#e8823f', '#d9363a', '#6a8ad9'];
const LEAF = ['#5f8a42', '#55803c', '#6a9448', '#4e7638'];
const CROP_TUFT = [['#7fae4f', '#8fbd5a'], ['#c9a640', '#6f9e45'], ['#c08f3e', '#a8823c'], ['#6f5a44', '#6f5a44']];
const TIMBER = '#4e3a2a';
const STONE = '#8f877a';
const STONE_D = '#756e63';
const GLASS = '#2f3a44';
const FENCE = '#7a5f42';
const WARM = [1.7, 1.2, 0.55];

const weighted = (r, table) => { let t = r.next() * table.reduce((a, b) => a + b[1], 0); for (const [k, w] of table) if ((t -= w) <= 0) return k; return table[0][0]; };

// Building styles a player can pick when upgrading (b.look overrides the
// style a building's seed would give it; everything else stays its own).
export const STYLES = [
  { id: 'timber', name: 'Timber frame' },
  { id: 'plaster', name: 'Limewash' },
  { id: 'painted', name: 'Painted' },
  { id: 'brick', name: 'Brick' },
  { id: 'stone', name: 'Stone' },
  { id: 'clapboard', name: 'Clapboard' },
];

function palette(seed, look = null) {
  const p = basePalette(seed);
  if (!look || !STYLES.some(s => s.id === look)) return p;
  const r = new RNG((seed ^ 0x2545f491) >>> 0);
  p.style = look;
  p.wall = look === 'painted' ? r.pick(PAINTED) : look === 'brick' ? p.brick : look === 'stone' ? p.stoneWall
    : look === 'clapboard' ? r.pick(['#7f98a3', '#5e7a5a', '#e6e0d2', '#6f6a8a', '#4f6a7a', '#b8c4a8', '#9fb3b8']) : r.pick(WALLS);
  p.timber = look === 'timber';
  p.stoneHouse = look === 'stone';
  if (look === 'stone' || look === 'brick') p.jetty = false;
  // models that reach for "stone" or "brick" directly get the chosen material
  p.forced = true;
  if (look !== 'stone') p.stoneWall = p.wall;
  if (look !== 'brick') p.brick = look === 'stone' ? shade(p.stoneWall, 0.9) : shade(p.wall, 0.85);
  p.lower = look === 'brick' || look === 'stone' ? p.wall : shade(p.wall, 0.88);
  if (look !== 'mixed') p.style = look;
  // ...and the architecture that goes with it, so a style changes the shape of
  // a building and where things go on it, not only its colours
  Object.assign(p, STYLE_ARCH[look](r, p));
  return p;
}

// What each style builds like: roof shape and pitch, where the door and the
// chimneys go, window size, porches, bays, jetties, dormers, and how far the
// house sits back from the street. A little variety within each style.
const STYLE_ARCH = {
  // Tudor: steep roofs (sometimes thatch), a jettied upper floor, small dark
  // leaded windows, one big central stack, the door to one side
  timber: (r, p) => {
    const thatch = r.chance(0.3);
    return { roofStyle: thatch ? 'thatch' : r.chance(0.5) ? 'crossgable' : 'gable', thatched: thatch, hip: false,
      roof: thatch ? p.thatch : r.pick(ROOF_TILE), pitch: r.float(1.22, 1.36), jetty: true, winW: r.float(0.054, 0.062), winH: 0.88,
      shutters: false, porch: false, bay: false, chimneyPos: 'center', doorPos: 'side', alongZ: false, flowerBoxes: true,
      frame: '#3a2a1f', arched: false, dormers: 0, setback: 0.16 };
  },
  // Limewashed cottage: thatch or a half-hipped roof, a stack up the gable
  // wall outside, a little porch, a deep front garden
  plaster: (r, p) => {
    const thatch = r.chance(0.65);
    return { roofStyle: thatch ? 'thatch' : 'halfhip', thatched: thatch, hip: false, roof: thatch ? p.thatch : r.pick(ROOF_TILE),
      pitch: r.float(1.08, 1.2), jetty: false, winW: r.float(0.054, 0.06), winH: 0.84, shutters: false, porch: true, bay: false,
      chimneyPos: 'outside', doorPos: 'side', alongZ: false, flowerBoxes: true, ivy: r.chance(0.4), arched: false, dormers: 0, setback: 0.21 };
  },
  // Georgian: a symmetrical front under a low hipped slate roof, a centred
  // door with a porch, tall shuttered windows, a chimney at each end
  painted: (r) => ({ roofStyle: 'hip', thatched: false, hip: true, roof: r.pick(ROOF_SLATE), pitch: r.float(0.82, 0.94), jetty: false,
    winW: r.float(0.07, 0.077), winH: 1.2, shutters: true, porch: true, bay: false, chimneyPos: 'ends', doorPos: 'center', alongZ: false,
    flowerBoxes: false, ivy: false, arched: false, dormers: 0, setback: 0.1 }),
  // Victorian brick: tile gables (some facing the street), bay windows,
  // arched window heads, paired end stacks, the door to one side
  brick: (r) => ({ roofStyle: r.chance(0.4) ? 'crossgable' : 'gable', thatched: false, hip: false, roof: r.chance(0.6) ? r.pick(ROOF_TILE) : r.pick(ROOF_SLATE),
    pitch: r.float(1.04, 1.18), jetty: false, winW: r.float(0.066, 0.074), winH: 1.14, shutters: false, porch: false, bay: true,
    chimneyPos: 'ends', doorPos: 'side', alongZ: r.chance(0.35), flowerBoxes: false, arched: true, dormers: 0, setback: 0.1 }),
  // Stone: low slate roofs (some saltbox), small deep-set arched windows,
  // a stack up the gable wall, a centred door with a porch, ivy
  stone: (r) => ({ roofStyle: r.chance(0.4) ? 'saltbox' : 'gable', thatched: false, hip: false, roof: r.pick(ROOF_SLATE),
    pitch: r.float(0.84, 0.95), jetty: false, winW: r.float(0.052, 0.058), winH: 0.84, shutters: false, porch: true, bay: false,
    chimneyPos: 'outside', doorPos: 'center', alongZ: false, ivy: r.chance(0.5), arched: true, dormers: 0, setback: 0.18 }),
  // Clapboard: a saltbox or gable under shingles, dormers, shutters, a
  // centred door with a deep porch, one central chimney
  clapboard: (r) => ({ roofStyle: r.chance(0.5) ? 'saltbox' : 'gable', thatched: false, hip: false, roof: r.pick(ROOF_SHINGLE),
    pitch: r.float(1.0, 1.12), jetty: false, winW: r.float(0.064, 0.07), winH: 1.04, shutters: true, porch: true, bay: false,
    chimneyPos: 'center', doorPos: 'center', alongZ: false, flowerBoxes: false, arched: false, dormers: 2, setback: 0.14 }),
};

function basePalette(seed) {
  const r = new RNG(seed);
  const style = weighted(r, [['plaster', 3], ['painted', 4], ['brick', 2], ['stone', 2], ['timber', 3], ['clapboard', 2], ['mixed', 3]]);
  const wall = style === 'painted' ? r.pick(PAINTED) : style === 'brick' ? r.pick(BRICK) : style === 'stone' ? r.pick(STONE_WALLS)
    : style === 'clapboard' ? r.pick(CLAPBOARD) : style === 'mixed' ? r.pick(r.chance(0.5) ? PAINTED : WALLS) : r.pick(WALLS);
  const roofStyle = weighted(r, [['gable', 5], ['hip', 2], ['thatch', 2], ['halfhip', 2], ['saltbox', 2], ['crossgable', 2]]);
  const roofSet = weighted(r, [['tile', 5], ['slate', 3], ['shingle', 3], ['moss', 1], ['color', 1]]);
  const roof = roofStyle === 'thatch' ? r.pick(ROOF_THATCH)
    : r.pick({ tile: ROOF_TILE, slate: ROOF_SLATE, shingle: ROOF_SHINGLE, moss: ROOF_MOSS, color: ROOF_COLOR }[roofSet]);
  const accent = r.pick(ACCENT);
  return {
    style,
    wall,
    lower: r.chance(0.5) ? r.pick(STONE_WALLS) : r.pick(BRICK),
    stoneWall: r.pick(STONE_WALLS),
    brick: r.pick(BRICK),
    wood: r.pick(WOOD),
    roof,
    roofStyle,
    thatch: r.pick(ROOF_THATCH),
    slate: r.pick(ROOF_SLATE),
    tile: r.pick(ROOF_TILE),
    door: r.chance(0.6) ? accent : r.pick(DOORS),
    accent,
    frame: r.chance(0.45) ? '#ece6da' : r.chance(0.5) ? '#5a4330' : accent,
    awning: r.pick(AWNING),
    awning2: r.chance(0.6) ? '#e9dfc9' : r.pick(AWNING),
    leaf: r.pick(LEAF),
    trim: r.chance(0.5) ? '#e9e0cc' : '#d8ccb4',
    timber: style === 'timber' || (style === 'mixed' && r.chance(0.4)),
    thatched: roofStyle === 'thatch',
    hip: roofStyle === 'hip',
    alongZ: r.chance(0.3),
    stoneHouse: style === 'stone',
    pitch: r.float(0.8, 1.3),
    winW: r.float(0.062, 0.09),
    winH: r.float(0.85, 1.15),
    jetty: r.chance(0.55),
    bay: r.chance(0.3),
    porch: r.chance(0.35),
    ivy: r.chance(0.25),
    extChimney: r.chance(0.3),
    chimneys: r.chance(0.3) ? 2 : 1,
    shutters: r.chance(0.45),
    flowerBoxes: r.chance(0.4),
    fence: weighted(r, [['rail', 3], ['picket', 3], ['stone', 2], ['hedge', 2], ['none', 2]]),
    tint: [r.float(-0.035, 0.035), r.float(-0.035, 0.035), r.float(-0.035, 0.035)],
  };
}

// Roof prism whose ridge can sit off-centre (saltbox) or be clipped (half-hip).
function roofShape(w, d, h, ridge, rz = 0) {
  const hw = w / 2, hd = d / 2, hr = ridge / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
  const R1 = [-hr, h, rz], R2 = [hr, h, rz];
  const tris = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

function solidRoof(c, x, y, z, w, d, h, ridge, rz, color, alongZ, oh = 0.05) {
  const { gb } = c;
  gb.push(x, y, z, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  const W = w + oh * 2, D = d + oh * 2;
  gb.box(0, -0.012, 0, W, 0.025, D, shade(color, 0.8));
  gb.add(roofShape(W, D, h, ridge, rz), color, new THREE.Matrix4());
  gb.pop();
}

// ---------------------------------------------------------------- helpers

function win(c, x, y, z, w, h, face, lit = 0.75) {
  const { gb, rng } = c;
  const t = 0.018, o = 0.007;
  const fr = c.frame || '#5a4330';
  h *= c.winH || 1;
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
  if (c.arched && (face === 'f' || face === 'b')) {
    const az = face === 'f' ? z + 0.004 : z - 0.016;
    gb.cyl(x, y + h + 0.012, az, w / 2 + 0.012, w / 2 + 0.012, 0.016, 8, fr, 0, Math.PI / 2);
  }
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
  // remember the main (first) door so villagers can walk in and out of it
  if (!c.doorAt) {
    const p = new THREE.Vector3(x, 0, z + 0.015).applyMatrix4(gb.M), q = new THREE.Vector3(x, 0, z + 1).applyMatrix4(gb.M);
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    c.doorAt = { x: p.x, y: p.y, z: p.z, dx: (q.x - p.x) / len, dz: (q.z - p.z) / len };
  }
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

// little façade extras
function ivy(c, w, d, h) {
  const { gb, rng } = c;
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const front = rng.chance(0.6);
    const ph = rng.float(0.12, h * 0.85), pw = rng.float(0.08, 0.2);
    const col = rng.pick(['#3f6a32', '#4f7a3a', '#5a8040']);
    if (front) gb.box(rng.float(-w / 2 + pw / 2, w / 2 - pw / 2), 0, d / 2 + 0.006, pw, ph, 0.012, col);
    else { const sd = rng.chance(0.5) ? 1 : -1; gb.box(sd * (w / 2 + 0.006), 0, rng.float(-d / 2 + pw / 2, d / 2 - pw / 2), 0.012, ph, pw, col); }
  }
}

function siding(c, w, d, y0, y1, color) {
  const { gb } = c;
  const col = shade(color, 0.86);
  for (let y = y0 + 0.04; y < y1 - 0.01; y += 0.045) {
    gb.box(0, y, d / 2 + 0.004, w + 0.008, 0.007, 0.006, col);
    gb.box(0, y, -d / 2 - 0.004, w + 0.008, 0.007, 0.006, col);
    gb.box(w / 2 + 0.004, y, 0, 0.006, 0.007, d + 0.008, col);
    gb.box(-w / 2 - 0.004, y, 0, 0.006, 0.007, d + 0.008, col);
  }
}

function quoins(c, w, d, h, color) {
  const { gb } = c;
  const col = shade(color, 1.18);
  for (let y = 0, k = 0; y < h - 0.02; y += 0.05, k++) {
    const l = k % 2 ? 0.05 : 0.035;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      gb.box(sx * (w / 2 - l / 2 + 0.004), y, sz * (d / 2 + 0.004), l, 0.04, 0.008, col);
      gb.box(sx * (w / 2 + 0.004), y, sz * (d / 2 - l / 2 + 0.004), 0.008, 0.04, l, col);
    }
  }
}

function porch(c, x, z, roof) {
  const { gb } = c;
  for (const sd of [-1, 1]) gb.box(x + sd * 0.075, 0, z + 0.1, 0.014, 0.2, 0.014, c.pal.trim);
  gb.wedge(x, 0.2, z + 0.06, 0.2, 0.13, 0.05, roof, 0);
}

function bay(c, x, z, h, wall, roof) {
  const { gb } = c;
  gb.cbox(x, 0.03, z + 0.035, 0.18, h, 0.07, wall, 0, 0.008);
  gb.hip(x, 0.03 + h, z + 0.035, 0.18, 0.07, 0.05, roof, 0.015);
  gb.glow(WARM[0], WARM[1], WARM[2], 1 + c.rng.float(0.02, 0.9));
  gb.box(x, 0.03 + h * 0.3, z + 0.072, 0.13, h * 0.5, 0.008, GLASS);
  gb.noGlow();
}

// A generic house body with roof, windows, door and optional chimney.
// Style comes from the palette: material (plaster, painted, brick, stone,
// timber-frame, clapboard or a stone/brick ground floor), roof shape and
// pitch, jettied upper floors, bay windows, porches, ivy, shutters and more.
function house(c, o) {
  const { gb, rng, pal } = c;
  if (o.timber === undefined && pal.forced && pal.timber) o = { ...o, timber: true };
  const w = o.w, d = o.d, h = o.h, floors = o.floors || 1;
  const fancy = o.fancy !== false;
  const fh = h / floors;
  gb.push(o.x || 0, o.y || 0, o.z || 0, o.ry || 0);
  footing(c, 0, 0, w, d, o.footColor || STONE);
  if (o.plinth) gb.cbox(0, 0, 0, w + 0.035, 0.08, d + 0.035, o.plinth, 0, 0.015);
  const mixedLower = fancy && pal.style === 'mixed' && floors >= 2;
  const jetty = fancy && o.timber && pal.jetty && floors >= 2 ? 0.035 : 0;
  if (mixedLower) {
    gb.cbox(0, 0, 0, w, fh, d, pal.lower, 0, 0.024);
    gb.cbox(0, fh, 0, w + jetty * 2, h - fh, d + jetty * 2, o.wall, 0, 0.02);
  } else if (jetty) {
    gb.cbox(0, 0, 0, w, fh, d, o.wall, 0, 0.024);
    gb.cbox(0, fh, 0, w + jetty * 2, h - fh, d + jetty * 2, o.wall, 0, 0.02);
    gb.box(0, fh - 0.012, 0, w + jetty * 2 + 0.01, 0.024, d + jetty * 2 + 0.01, TIMBER);
  } else gb.cbox(0, 0, 0, w, h, d, o.wall, 0, 0.024);
  if (o.timber) timber(c, w + jetty * 2, d + jetty * 2, h, floors);
  if (fancy && pal.style === 'clapboard') siding(c, w, d, 0, h, o.wall);
  if (fancy && (pal.style === 'brick' || pal.style === 'stone') && !o.timber) quoins(c, w, d, h, o.wall);
  if (fancy && pal.ivy && !o.shopWindow) ivy(c, w, d, h);
  const rw = w + jetty * 2, rd = d + jetty * 2;
  const rh = (o.rh ?? 0.24) * (fancy ? pal.pitch : 1);
  const alongZ = !!o.alongZ;
  let roofType = o.roofType;
  if (fancy && roofType === 'gable' && ['halfhip', 'saltbox', 'crossgable'].includes(pal.roofStyle)) roofType = pal.roofStyle;
  if (roofType === 'hip') gb.hip(0, h, 0, rw, rd, rh, o.roof, 0.06, alongZ);
  else if (roofType === 'thatch') thatchRoof(c, 0, h, 0, rw, rd, rh, o.wall, o.roof, alongZ);
  else if (roofType === 'flat') gb.cbox(0, h, 0, rw + 0.03, 0.045, rd + 0.03, o.roof, 0, 0.01);
  else if (roofType === 'halfhip') solidRoof(c, 0, h, 0, rw, rd, rh, Math.max(0.05, (alongZ ? rd : rw) - (alongZ ? rw : rd) * 0.45), 0, o.roof, alongZ);
  else if (roofType === 'saltbox') solidRoof(c, 0, h, 0, rw, rd, rh * 1.1, alongZ ? rd : rw, (alongZ ? rw : rd) * 0.18, o.roof, alongZ);
  else {
    gb.gable(0, h, 0, rw, rd, rh, o.wall, o.roof, 0.06, alongZ, 0.035);
    if (roofType === 'crossgable' && !alongZ && rw > 0.45) {
      // a gabled bay facing the street
      const gx = (rng.chance(0.5) ? 1 : -1) * rw * 0.22, gw = Math.min(0.26, rw * 0.38);
      gb.cbox(gx, 0, rd / 2 - 0.02, gw, h, 0.09, o.wall, 0, 0.012);
      gb.gable(gx, h, rd / 2 - 0.02, gw, 0.13, rh * 0.85, o.wall, o.roof, 0.03, true, 0.03);
      win(c, gx, fh * 0.38, rd / 2 + 0.025, 0.07, 0.09, 'f', o.lit);
      if (floors > 1) win(c, gx, fh * 1.38, rd / 2 + 0.025, 0.07, 0.09, 'f', o.lit);
    }
  }

  const hw = w / 2, hd = d / 2;
  let nF = o.nFront || Math.max(1, Math.floor(w / 0.22));
  // a centred front door wants an odd number of bays so it stands in the middle
  if (!o.nFront && fancy && pal.doorPos === 'center' && nF % 2 === 0 && w / (nF + 1) >= 0.14) nF++;
  const nS = Math.max(1, Math.floor(d / 0.24));
  const doorX = o.doorX ?? (fancy && pal.doorPos === 'center' ? 0
    : (nF > 1 && (nF % 2 === 1 || (fancy && pal.doorPos === 'side'))) ? -hw + (w / nF) * 0.5 : 0);
  const ww = o.ww || (fancy ? pal.winW : 0.075);
  for (let f = 0; f < floors; f++) {
    const wh = Math.min(0.11, fh * 0.4);
    const wy = f * fh + fh * 0.38;
    const jz = f > 0 ? jetty : 0;
    for (let i = 0; i < nF; i++) {
      const u = -hw + (i + 0.5) * (w / nF);
      if (f === 0 && !o.noDoor && Math.abs(u - doorX) < 0.08) continue;
      const shop = f === 0 && o.shopWindow;
      win(c, u, wy - (shop ? 0.02 : 0), hd + jz, shop ? ww * 1.6 : ww, shop ? wh * 1.3 : wh, 'f', o.lit);
      if (!o.noBack && rng.chance(0.7)) win(c, u, wy, -hd - jz, ww, wh, 'b', o.lit);
    }
    for (let i = 0; i < nS; i++) {
      const u = -hd + (i + 0.5) * (d / nS);
      if (rng.chance(0.8)) win(c, hw + jz, wy, u, ww, wh, 'r', o.lit);
      if (rng.chance(0.8)) win(c, -hw - jz, wy, u, ww, wh, 'l', o.lit);
    }
  }
  if (alongZ && roofType !== 'hip' && roofType !== 'flat' && rh > 0.16) win(c, 0, h + rh * 0.22, rd / 2, 0.06, 0.07, 'f', o.lit);
  if (!o.noDoor) {
    door(c, doorX, hd, o.doorW || 0.09, Math.min(0.18, fh * 0.7), o.door || pal.door);
    if (fancy && pal.porch && !o.shopWindow) porch(c, doorX, hd, o.roof);
  }
  if (fancy && pal.bay && !o.shopWindow && w > 0.45) {
    const bx = doorX > 0 ? -hw * 0.5 : hw * 0.5;
    bay(c, bx, hd, Math.min(0.16, fh * 0.6), o.wall, o.roof);
  }
  if (o.chimney) {
    // Stacks stand on the ridge: one at each end, one in the middle, one at
    // an end, or built up the outside of a gable wall. The style decides; a
    // building without one goes by its own seed.
    const kind = o.smokeKind || 'home', col = o.chimneyColor || (pal.style === 'brick' ? pal.brick : STONE);
    let pos = o.chimneyPos || (fancy ? pal.chimneyPos || (pal.extChimney ? 'outside' : pal.chimneys > 1 ? 'ends' : 'side') : 'side');
    if (pos === 'outside' && alongZ) pos = 'side';
    if (pos === 'outside') {
      const ex = (rng.chance(0.5) ? 1 : -1) * (rw / 2 + 0.035);
      gb.cbox(ex, 0, 0, 0.07, h + rh + 0.06, 0.1, STONE, 0, 0.01);
      gb.cbox(ex, h + rh + 0.06, 0, 0.085, 0.03, 0.11, STONE_D, 0, 0.008);
      c.addSmoke(ex, h + rh + 0.13, 0, kind);
    } else {
      const spots = pos === 'ends' ? [-0.34, 0.34] : pos === 'center' ? [rng.float(-0.05, 0.05)] : [(rng.chance(0.5) ? 1 : -1) * 0.3];
      for (const u of spots) chimney(c, alongZ ? 0 : u * w, h - 0.06, h + rh + 0.08, alongZ ? u * d : 0, kind, col);
    }
  }
  if (o.dormers && !alongZ && roofType !== 'flat' && roofType !== 'hip') {
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

// Low boundary around a plot, in the household's chosen style.
function boundary(c, kind, x0, z0, x1, z1, gapX = 0) {
  const { gb } = c;
  if (kind === 'rail') fence(c, x0, z0, x1, z1, FENCE, { x: gapX, z: z1, w: 0.12 });
  else if (kind === 'picket') fence(c, x0, z0, x1, z1, '#ece6da', { x: gapX, z: z1, w: 0.12 });
  else if (kind === 'stone' || kind === 'hedge') {
    const col = kind === 'stone' ? '#9a9284' : '#4a7036', ht = kind === 'stone' ? 0.05 : 0.07;
    const seg = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      gb.cbox(mx, c.gy(mx, mz) - 0.01, mz, Math.abs(bx - ax) + 0.04, ht, Math.abs(bz - az) + 0.04, col, 0, 0.012);
      void len;
    };
    seg(x0, z0, x1, z0); seg(x1, z0, x1, z1); seg(x0, z0, x0, z1);
    seg(x0, z1, gapX - 0.08, z1); seg(gapX + 0.08, z1, x1, z1);
  }
}

function vegPatch(c, x, z) {
  const { gb, rng } = c;
  const y = c.gy(x, z);
  gb.box(x, y - 0.01, z, 0.2, 0.025, 0.16, '#5e4430');
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) gb.sphere(x - 0.07 + k * 0.046, y + 0.025, z - 0.05 + i * 0.05, 0.017, rng.pick(['#5f9a42', '#7fae4f', '#c9a640', '#b84a3a']), 0);
}

function washingLine(c, x, z) {
  const { gb, rng } = c;
  for (const sd of [-1, 1]) gb.box(x + sd * 0.13, c.gy(x + sd * 0.13, z), z, 0.012, 0.16, 0.012, '#5e432c');
  gb.box(x, c.gy(x, z) + 0.15, z, 0.26, 0.004, 0.004, '#d8d0c0');
  for (let i = 0; i < 3; i++) gb.box(x - 0.08 + i * 0.08, c.gy(x, z) + 0.09, z, 0.05, 0.06, 0.004, rng.pick(['#e8e0d0', '#6a8ad9', '#d9536b', '#e8b84a', '#9c74c9']));
}

function beehives(c, x, z) {
  for (let i = 0; i < 2; i++) {
    const bx = x + i * 0.07, y = c.gy(bx, z);
    c.gb.cbox(bx, y, z, 0.05, 0.06, 0.05, '#e3d8b8', 0, 0.006);
    c.gb.box(bx, y + 0.06, z, 0.06, 0.012, 0.06, '#8a6a48');
  }
}

function handcart(c, x, z) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.push(x, y, z, c.rng.float(0, Math.PI));
  gb.cbox(0, 0.04, 0, 0.12, 0.04, 0.08, '#86663f', 0, 0.006);
  for (const sd of [-1, 1]) gb.cyl(sd * 0.065, 0.035, 0, 0.035, 0.035, 0.01, 8, '#4e3a2a', 0, 0, Math.PI / 2);
  gb.box(0.1, 0.05, 0, 0.12, 0.008, 0.008, '#5e432c');
  gb.pop();
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

// Every home model by "home rank": 0 cottage, 1 family house, 2 townhouse,
// 3 manor house, 4 grand manor. Used by houses, villas and flats.
function homeModel(c, L) {
  const { gb, rng, pal } = c;
  c.flowerBoxes = L >= 1 && pal.flowerBoxes;
  const wall = pal.wall;
  let yard = null;
  if (L <= 1) {
    c.boxAware = true;
    const B = c.box, bw = B.x1 - B.x0;
    const two = L === 1;
    const w = Math.min(two ? rng.float(0.5, 0.6) : rng.float(0.44, 0.54), bw - 0.22);
    const d = two ? rng.float(0.4, 0.46) : rng.float(0.34, 0.4);
    const h = two ? rng.float(0.52, 0.58) : rng.float(0.28, 0.33);
    const jit = rng.float(0.12, 0.2);
    const front = B.z1 - (pal.setback != null ? pal.setback + (jit - 0.16) * 0.3 : jit);
    const lo = B.x0 + 0.11 + w / 2, hi = B.x1 - 0.11 - w / 2;
    const hx = Math.min(hi, Math.max(lo, (B.x0 + B.x1) / 2 + rng.float(-0.06, 0.06)));
    const thatch = pal.thatched && (!two || rng.chance(0.5));
    const r = house(c, {
      x: hx, z: front - d / 2, w, d, h, floors: two ? 2 : 1, wall, roof: thatch ? pal.thatch : pal.roof,
      roofType: thatch ? 'thatch' : (pal.hip ? 'hip' : 'gable'), rh: two ? rng.float(0.27, 0.33) : rng.float(0.2, 0.29),
      alongZ: pal.alongZ, chimney: two || rng.chance(0.8), timber: pal.timber, plinth: two && rng.chance(0.5) ? STONE : null, dormers: two ? pal.dormers || 0 : 0,
    });
    yard = { x: hx, front, d, doorX: r.doorX };
    // a lean-to on whichever side has room
    if (two && rng.chance(0.5)) {
      const ew = 0.2, ed = 0.28, ez = front - d + ed / 2 + 0.02;
      const sides = [1, -1].filter(sd => sd > 0 ? hx + w / 2 + ew + 0.08 < B.x1 : hx - w / 2 - ew - 0.08 > B.x0);
      if (sides.length) {
        const side = rng.pick(sides), ex = hx + side * (w / 2 + ew / 2 - 0.02);
        footing(c, ex, ez, ew, ed);
        gb.cbox(ex, 0, ez, ew, 0.24, ed, shade(wall, 0.96), 0, 0.016);
        gb.wedge(ex, 0.24, ez, ew + 0.05, ed + 0.05, 0.09, pal.roof, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        win(c, ex, 0.08, ez + ed / 2, 0.065, 0.085, 'f');
      }
    }
  } else if (L === 3) {
    // Manor House: a broad two-storey block with forward wings and a columned porch
    const stone = pal.stoneHouse || rng.chance(0.5);
    const mwall = stone ? pal.stoneWall : pal.wall;
    const roof = rng.chance(0.6) ? pal.slate : pal.roof;
    // hipped and classical, unless the style calls for gables (Tudor,
    // cottage, stone or clapboard manors get gabled wings facing the drive)
    const hipped = !pal.forced || pal.hip || pal.style === 'brick';
    house(c, {
      x: 0, z: -0.17, w: 0.88, d: 0.5, h: 0.6, floors: 2, wall: mwall, roof: pal.forced ? pal.roof : roof, roofType: hipped ? 'hip' : 'gable', rh: 0.3,
      chimney: true, chimneyPos: 'ends', plinth: STONE, doorX: 0, doorW: 0.11, nFront: 5, timber: !stone && pal.timber,
    });
    for (const sd of [-1, 1]) {
      footing(c, sd * 0.33, 0.15, 0.22, 0.26);
      gb.cbox(sd * 0.33, 0, 0.15, 0.22, 0.46, 0.26, mwall, 0, 0.016);
      if (hipped) gb.hip(sd * 0.33, 0.46, 0.15, 0.22, 0.26, 0.16, roof, 0.035);
      else gb.gable(sd * 0.33, 0.46, 0.15, 0.22, 0.26, 0.2, mwall, pal.roof, 0.035, true, 0.03);
      win(c, sd * 0.33, 0.08, 0.28, 0.07, 0.1, 'f');
      win(c, sd * 0.33, 0.29, 0.28, 0.07, 0.1, 'f');
    }
    for (const sd of [-1, 1]) gb.cyl(sd * 0.075, 0, 0.14, 0.014, 0.016, 0.26, 8, '#e9e2d4');
    gb.gable(0, 0.26, 0.12, 0.22, 0.11, 0.07, '#e9e2d4', roof, 0.02);
    hedge(c, -0.27, 0.44, 0.3, 0.06); hedge(c, 0.27, 0.44, 0.3, 0.06);
    smallTree(c, rng.chance(0.5) ? -0.42 : 0.42, -0.43, 1.1);
  } else if (L >= 4) {
    // Grand Manor: three-storey centre, two wings and a portico
    const mwall = pal.stoneWall, roof = pal.forced ? pal.roof : pal.slate;
    const hipped = !pal.forced || pal.hip || pal.style === 'brick' || pal.style === 'stone';
    house(c, {
      x: 0, z: -0.13, w: 0.5, d: 0.6, h: 0.88, floors: 3, wall: mwall, roof, roofType: hipped ? 'hip' : 'gable', rh: 0.32, chimney: true,
      chimneyPos: 'ends', plinth: STONE, doorX: 0, doorW: 0.12, nFront: 3,
    });
    for (const sd of [-1, 1]) {
      house(c, {
        x: sd * 0.36, z: -0.16, w: 0.22, d: 0.54, h: 0.62, floors: 2, wall: mwall, roof, roofType: hipped ? 'hip' : 'gable', rh: 0.2,
        alongZ: !hipped, noDoor: true, plinth: STONE, nFront: 1, chimney: false,
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
  if (yard) { cottageYard(c, yard); return; }
  // yard (manors have their own formal gardens): every household picks a few things
  if (L >= 3) return;
  if (pal.fence !== 'none') boundary(c, pal.fence, -0.45, -0.45, 0.45, 0.45, 0);
  const front = [[-0.33, 0.36], [0.33, 0.36]], back = [[-0.36, -0.37], [0.36, -0.37]], side = [[-0.4, -0.05], [0.4, -0.05]];
  const extras = [
    () => { const p = rng.pick(front); flowers(c, p[0], p[1], rng.int(4, 8), 0.07); },
    () => { const p = rng.pick(back); smallTree(c, p[0], p[1], rng.float(0.8, 1.15)); },
    () => { const p = rng.pick(back); vegPatch(c, p[0] * 0.9, p[1] + 0.04); },
    () => washingLine(c, rng.chance(0.5) ? -0.2 : 0.2, -0.41),
    () => { const p = rng.pick(back); beehives(c, p[0] - 0.03, p[1]); },
    () => { const p = rng.pick(side); logs(c, p[0], p[1], 3, Math.PI / 2); },
    () => barrel(c, rng.float(-0.38, 0.38), 0.41),
    () => { const p = rng.pick(front); bench(c, p[0], p[1] + 0.03, Math.PI); },
    () => { const p = rng.pick(side); handcart(c, p[0], p[1] + 0.2); },
    () => { const p = rng.pick(front); bush(c, p[0], p[1], rng.float(0.8, 1.2)); bush(c, p[0] + 0.07, p[1] - 0.04, 0.7); },
  ];
  const picks = new Set();
  const n = rng.int(2, 4);
  while (picks.size < n) picks.add(rng.int(0, extras.length - 1));
  for (const i of picks) extras[i]();
}

// Front garden with a path to the door, a back garden with whatever the
// household fancies. Laid out inside c.box, so it follows land deals.
function cottageYard(c, y) {
  const { gb, rng, pal } = c;
  const B = c.box;
  const dx = y.x + y.doorX;
  if (pal.fence !== 'none') boundary(c, pal.fence, B.x0 + 0.04, B.z0 + 0.04, B.x1 - 0.04, B.z1 - 0.04, dx);
  const pz = (y.front + B.z1 - 0.04) / 2;
  gb.box(dx, c.gy(dx, pz) - 0.008, pz, 0.07, 0.012, Math.max(0.02, B.z1 - 0.06 - y.front), '#b9a888');
  const fz = (y.front + B.z1) / 2;
  for (const x of [B.x0 + 0.14, B.x1 - 0.14]) {
    if (Math.abs(x - dx) < 0.12) continue;
    const r = rng.next();
    if (r < 0.45) flowers(c, x, fz, rng.int(4, 7), 0.06);
    else if (r < 0.75) bush(c, x, fz, rng.float(0.7, 1));
  }
  const z0 = B.z0 + 0.1, z1 = y.front - y.d - 0.06;
  if (z1 - z0 < 0.08) return;
  const bz = (z0 + z1) / 2;
  const slots = [B.x0 + 0.17, (B.x0 + B.x1) / 2, B.x1 - 0.17];
  const things = [
    (x) => vegPatch(c, x, bz),
    (x) => washingLine(c, x, bz),
    (x) => gardenShed(c, x, bz),
    (x) => smallTree(c, x, bz, rng.float(0.8, 1.1)),
    (x) => beehives(c, x - 0.035, bz),
    (x) => logs(c, x - 0.1, bz, 2, 0),
    (x) => henHouse(c, x, bz),
    (x) => bench(c, x, bz, 0),
  ];
  const order = [0, 1, 2].sort(() => rng.next() - 0.5);
  const used = new Set();
  const n = rng.int(2, 3);
  for (let k = 0; k < n; k++) {
    let t = rng.int(0, things.length - 1);
    while (used.has(t)) t = (t + 1) % things.length;
    used.add(t);
    things[t](slots[order[k]]);
  }
}

function gardenShed(c, x, z) {
  const { gb, pal } = c;
  const y = c.gy(x, z);
  gb.cbox(x, y, z, 0.14, 0.12, 0.11, pal.wood, 0, 0.008);
  gb.wedge(x, y + 0.12, z, 0.17, 0.14, 0.05, shade(pal.roof, 0.9), 0);
  gb.box(x, y, z + 0.056, 0.045, 0.09, 0.006, '#4e3828');
}

function henHouse(c, x, z) {
  const { gb } = c;
  const y = c.gy(x, z);
  for (const sx of [-1, 1]) gb.box(x + sx * 0.045, y, z - 0.03, 0.012, 0.05, 0.012, '#5e432c');
  gb.cbox(x, y + 0.05, z - 0.03, 0.12, 0.07, 0.08, '#a8804e', 0, 0.006);
  gb.wedge(x, y + 0.12, z - 0.03, 0.14, 0.1, 0.04, '#6f5a44', 0);
  gb.box(x, y + 0.015, z + 0.035, 0.03, 0.006, 0.07, '#7a5a3c', 0, -0.5);
  for (let i = 0; i < 2; i++) gb.sphere(x - 0.03 + i * 0.07, y + 0.02, z + 0.07, 0.018, i ? '#f2ede0' : '#a8653a', 0);
}

MODELS.house = (c, L) => homeModel(c, Math.min(L, 1));
MODELS.villa = (c, L) => {
  if (L === 0) { c.flowerBoxes = c.pal.flowerBoxes; villa(c); } else homeModel(c, L + 2);
};
MODELS.flats = (c, L) => {
  if (L === 0) homeModel(c, 2); else if (L === 1) tenement(c); else mansionBlock(c);
};

MODELS.market = (c, L) => {
  const { gb, rng, pal } = c;
  const awnA = pal.awning, awnB = '#e9dfc9';
  const stall = (x, z, ry, s = 1) => marketStall(c, x, z, ry, s, awnA);
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
    wall: pal.forced || rng.chance(0.5) ? pal.wall : '#e2cfa8', roof: pal.thatched ? pal.thatch : pal.tile, roofType: pal.thatched ? 'thatch' : 'gable', rh: 0.26, alongZ: false,
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

// A faint per-building colour cast, so neighbours never look copy-pasted.
// ------------------------------------------------- the two home branches

// Villa: a detached house with a glasshouse and a proper garden.
function villa(c) {
  const { gb, rng, pal } = c;
  const roof = rng.chance(0.5) ? pal.slate : pal.roof;
  const wall = pal.stoneHouse ? pal.stoneWall : pal.wall;
  const side = rng.chance(0.5) ? 1 : -1;
  house(c, {
    x: -side * 0.06, z: -0.12, w: 0.7, d: 0.52, h: 0.58, floors: 2, wall, roof, roofType: rng.chance(0.6) ? 'hip' : 'gable',
    rh: 0.26, chimney: true, plinth: STONE, doorX: 0, doorW: 0.1, nFront: 3,
  });
  // glasshouse on the side
  const gx = side * 0.38, gz = -0.1;
  footing(c, gx, gz, 0.16, 0.3);
  gb.cbox(gx, 0, gz, 0.16, 0.035, 0.3, STONE, 0, 0.006);
  gb.glow(WARM[0], WARM[1], WARM[2], 1.3);
  gb.box(gx, 0.035, gz, 0.15, 0.17, 0.29, '#9fbcc0');
  gb.noGlow();
  for (let i = 0; i < 4; i++) gb.box(gx + side * 0.076, 0.035, gz - 0.135 + i * 0.09, 0.008, 0.17, 0.008, '#e9e2d4');
  gb.box(gx, 0.2, gz, 0.155, 0.01, 0.295, '#e9e2d4');
  gb.wedge(gx, 0.205, gz, 0.17, 0.31, 0.06, '#c8dadc', side > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (let i = 0; i < 3; i++) gb.sphere(gx, 0.06, gz - 0.08 + i * 0.08, 0.03, rng.pick(LEAF), 0);
  // front garden: clipped hedges, gravel path, a tree and a bench
  hedge(c, -0.28, 0.43, 0.34, 0.06); hedge(c, 0.28, 0.43, 0.34, 0.06);
  gb.box(0, c.gy(0, 0.3) - 0.008, 0.3, 0.1, 0.014, 0.26, '#cdbf9e');
  smallTree(c, -side * 0.36, 0.28, rng.float(0.9, 1.15));
  flowers(c, side * 0.2, 0.3, 6, 0.08);
  bench(c, side * 0.36, 0.3, -side * Math.PI / 2);
  lamp(c, 0.1, 0.42, 0.28);
}

// Tenement: four storeys of flats with two stairs, iron balconies and a back yard.
function tenement(c) {
  const { gb, rng, pal } = c;
  const brick = pal.style === 'brick' || (!pal.forced && rng.chance(0.5));
  const wall = brick ? pal.brick : pal.stoneWall;
  house(c, {
    z: -0.1, w: 0.84, d: 0.6, h: 1.06, floors: 4, wall, roof: pal.slate, roofType: 'gable', rh: 0.22,
    plinth: STONE_D, doorX: -0.2, nFront: 4, fancy: false, door: pal.door,
  });
  door(c, 0.2, 0.2, 0.085, 0.17, pal.accent);
  for (const x of [-0.3, 0, 0.3]) chimney(c, x, 0.98, 1.38, -0.1, 'home', brick ? shade(pal.brick, 0.9) : STONE);
  // a string course between floors and iron balconies on the upper floors
  for (let f = 1; f < 4; f++) gb.box(0, f * 0.265 - 0.008, -0.1, 0.86, 0.014, 0.62, shade(wall, 1.15));
  for (let f = 1; f < 4; f++) for (const x of [-0.2, 0.2]) {
    const y = f * 0.265 + 0.005;
    gb.box(x, y, 0.235, 0.2, 0.012, 0.07, '#3a3a3e');
    gb.box(x, y + 0.012, 0.268, 0.2, 0.05, 0.006, '#2f2f33');
  }
  sign(c, 0.2, 0.2, 0.207, 0.1, 0.03, '#d8d0c0');
  barrel(c, -0.42, 0.36); crate(c, -0.36, 0.42); handcart(c, 0.38, 0.32);
  washingLine(c, 0, 0.42);
}

// Mansion Block: five storeys of stone with a mansard roof, dormers and a portico.
function mansionBlock(c) {
  const { gb, rng, pal } = c;
  const wall = pal.stoneWall, trim = '#e3dccd';
  house(c, {
    z: -0.08, w: 0.9, d: 0.66, h: 1.3, floors: 5, wall, roof: pal.slate, roofType: 'hip', rh: 0.34,
    plinth: STONE_D, doorX: 0, doorW: 0.13, nFront: 5, fancy: false, door: '#3a2f28',
  });
  for (let f = 1; f < 5; f++) gb.box(0, f * 0.26 - 0.008, -0.08, 0.92, 0.016, 0.68, trim);
  gb.box(0, 1.28, -0.08, 0.95, 0.03, 0.71, trim);
  for (const x of [-0.27, 0, 0.27]) {
    gb.cbox(x, 1.33, 0.13, 0.1, 0.12, 0.1, wall, 0, 0.01);
    gb.gable(x, 1.45, 0.13, 0.1, 0.12, 0.06, wall, pal.slate, 0.02, true, 0.02);
    win(c, x, 1.355, 0.18, 0.05, 0.065, 'f');
  }
  for (const f of [2, 3]) for (const x of [-0.3, 0.3]) {
    const y = f * 0.26;
    gb.box(x, y, 0.27, 0.16, 0.014, 0.06, trim);
    for (let i = 0; i < 5; i++) gb.box(x - 0.07 + i * 0.035, y + 0.014, 0.295, 0.008, 0.045, 0.008, '#2f2f33');
  }
  for (let i = 0; i < 2; i++) gb.cyl(-0.06 + i * 0.12, 0.02, 0.32, 0.016, 0.019, 0.3, 8, trim);
  gb.gable(0, 0.32, 0.29, 0.24, 0.1, 0.07, trim, pal.slate, 0.02);
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) gb.box(sx * (0.12 + i * 0.055), c.gy(sx * (0.12 + i * 0.055), 0.44), 0.44, 0.008, 0.08, 0.008, '#2f2f33');
  for (const sx of [-1, 1]) gb.box(sx * 0.27, c.gy(sx * 0.27, 0.44) + 0.07, 0.44, 0.3, 0.008, 0.008, '#2f2f33');
  lamp(c, -0.14, 0.42, 0.3); lamp(c, 0.14, 0.42, 0.3);
}

// ------------------------------------------------------- builder's yard

function plankStack(c, x, z, n = 4, ry = 0) {
  const { gb, rng } = c;
  gb.push(x, c.gy(x, z), z, ry);
  for (const sx of [-1, 1]) gb.box(sx * 0.08, 0, 0, 0.025, 0.02, 0.14, '#5e432c');
  for (let l = 0; l < n; l++) for (let k = 0; k < 3; k++) gb.box(0, 0.02 + l * 0.018, -0.042 + k * 0.042, 0.25, 0.016, 0.038, rng.pick(['#b8986a', '#a8855a', '#c2a274']));
  gb.pop();
}

function stoneStack(c, x, z, rows = 3) {
  const { gb, rng } = c;
  const y = c.gy(x, z);
  for (let l = 0; l < rows; l++) {
    const count = rows - l;
    for (let k = 0; k < count; k++) {
      gb.cbox(x + (k - (count - 1) / 2) * 0.054, y + l * 0.04, z, 0.05, 0.039, 0.064, rng.pick(['#bdb3a0', '#b3a996', '#a8a294']), rng.float(-0.06, 0.06), 0.006);
    }
  }
}

function sawhorse(c, x, z, ry = 0) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.boxC(sx * 0.06, 0.04, sz * 0.02, 0.01, 0.085, 0.01, '#6e5034', sz * 0.35, 0, 0);
  gb.box(0, 0.08, 0, 0.16, 0.014, 0.016, '#7a5a3c');
  gb.box(0.02, 0.094, 0, 0.26, 0.012, 0.05, '#c2a274', 0.2);
  gb.pop();
}

function ladder(c, x, z, h, ry = 0, lean = 0.25) {
  const { gb } = c;
  gb.pushEuler(x, c.gy(x, z), z, -lean, ry);
  for (const sx of [-1, 1]) gb.box(sx * 0.022, 0, 0, 0.01, h, 0.01, '#8a6a44');
  for (let y = 0.04; y < h - 0.01; y += 0.045) gb.box(0, y, 0, 0.044, 0.007, 0.007, '#8a6a44');
  gb.pop();
}

// A sheer-legs hoist: a tall pole, a jib and a stone hanging on its rope.
function ginPole(c, x, z, h, ry = 0) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.push(x, y, z, ry);
  gb.cyl(0, 0, 0, 0.014, 0.018, h, 6, '#7a5a3c');
  for (const a of [0.5, -0.5]) gb.boxC(Math.sin(a) * 0.08, 0.1, Math.cos(a) * -0.05, 0.01, 0.24, 0.01, '#6e5034', 0.35, a, 0);
  const jl = 0.26;
  gb.boxC(0.1, h - 0.06, 0, jl, 0.014, 0.014, '#7a5a3c', 0, 0, 0.35);
  const tx = 0.1 + Math.cos(0.35) * jl / 2, ty = h - 0.06 + Math.sin(0.35) * jl / 2;
  gb.box(tx, ty * 0.45, 0, 0.004, ty * 0.55, 0.004, '#d9cfb4');
  gb.cbox(tx, ty * 0.45 - 0.04, 0, 0.05, 0.04, 0.05, '#bdb3a0', 0, 0.006);
  gb.pop();
}

// A treadwheel crane, the medieval way of lifting stone.
function treadwheel(c, x, z, ry = 0) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.push(x, y, z, ry);
  gb.cbox(0, 0, 0, 0.28, 0.03, 0.14, '#6e5034', 0, 0.006);
  gb.cyl(0, 0.17, 0, 0.15, 0.15, 0.08, 14, '#9a7a50', 0, 0, Math.PI / 2);
  gb.cyl(0, 0.17, 0, 0.12, 0.12, 0.085, 14, '#5e432c', 0, 0, Math.PI / 2);
  for (const sz of [-1, 1]) gb.box(0, 0.03, sz * 0.055, 0.02, 0.3, 0.02, '#6e5034');
  gb.boxC(0.12, 0.42, 0, 0.5, 0.02, 0.02, '#7a5a3c', 0, 0, 0.8);
  gb.box(0.28, 0.25, 0, 0.004, 0.36, 0.004, '#d9cfb4');
  gb.cbox(0.28, 0.21, 0, 0.06, 0.045, 0.06, '#bdb3a0', 0, 0.006);
  gb.pop();
}

function shed(c, x, z, w, d, h, roof) {
  const { gb } = c;
  gb.push(x, 0, z);
  footing(c, 0, 0, w, d);
  gb.box(0, 0, -d / 2 + 0.01, w, h + 0.06, 0.02, '#7a5a3c');
  for (const sx of [-1, 1]) gb.box(sx * (w / 2 - 0.01), 0, 0, 0.02, h, d, '#86663f');
  for (let i = 0; i <= 3; i++) gb.box(-w / 2 + 0.02 + i * (w - 0.04) / 3, 0, d / 2 - 0.02, 0.022, h - 0.03, 0.022, '#5e432c');
  gb.wedge(0, h - 0.03, 0, w + 0.07, d + 0.08, 0.09, roof, 0);
  for (let i = 0; i < 4; i++) gb.box(-w / 2 + 0.06 + i * 0.05, 0.12, -d / 2 + 0.03, 0.01, 0.12, 0.01, i % 2 ? '#5a5f63' : '#7a5a3c');
  gb.pop();
}

MODELS.builder = (c, L) => {
  const { gb, rng, pal } = c;
  if (L === 0) {
    shed(c, 0.04, -0.24, 0.66, 0.34, 0.28, pal.roof);
    plankStack(c, -0.18, -0.25, 3);
    plankStack(c, -0.24, 0.2, 4, 0.1);
    stoneStack(c, 0.22, 0.18, 3);
    gb.blob(0.3, c.gy(0.3, 0.38), 0.38, 0.08, 0.05, 0.07, '#d4bc88');
    sawhorse(c, -0.02, 0.24, 0.3);
    ladder(c, 0.4, -0.12, 0.34, -Math.PI / 2, 0.3);
    handcart(c, -0.38, -0.02);
    fence(c, -0.46, -0.46, 0.46, 0.46, FENCE, { x: 0, z: 0.46, w: 0.14 });
  } else if (L === 1) {
    house(c, {
      x: -0.2, z: -0.22, w: 0.46, d: 0.38, h: 0.42, floors: 2, wall: pal.wall, roof: pal.roof, roofType: 'gable',
      rh: 0.22, chimney: true, timber: pal.timber, doorX: 0, nFront: 2, fancy: false,
    });
    sign(c, -0.2, 0.3, -0.02, 0.2, 0.05, '#5e432c');
    shed(c, 0.28, -0.22, 0.34, 0.38, 0.26, pal.roof);
    plankStack(c, 0.3, -0.22, 4, Math.PI / 2);
    plankStack(c, -0.25, 0.24, 4);
    stoneStack(c, 0.08, 0.3, 3);
    stoneStack(c, 0.3, 0.36, 2);
    sawhorse(c, 0.02, 0.1, -0.4);
    ginPole(c, 0.4, 0.12, 0.62, Math.PI);
    ladder(c, -0.43, -0.2, 0.36, Math.PI / 2, 0.3);
    boundary(c, 'stone', -0.47, -0.47, 0.47, 0.47, 0);
  } else {
    house(c, {
      x: -0.12, z: -0.24, w: 0.62, d: 0.4, h: 0.5, floors: 2, wall: pal.stoneWall, roof: pal.slate, roofType: 'gable',
      rh: 0.26, chimney: true, plinth: STONE, doorX: 0, nFront: 3, fancy: false,
    });
    sign(c, -0.12, 0.36, -0.03, 0.26, 0.05, '#3b2f2a');
    treadwheel(c, 0.3, 0.12, Math.PI / 2);
    for (const [x, z] of [[-0.3, 0.18], [-0.1, 0.34], [0.06, 0.16]]) stoneStack(c, x, z, rng.int(2, 3));
    plankStack(c, 0.33, -0.3, 4, Math.PI / 2);
    gb.blob(-0.38, c.gy(-0.38, 0.4), 0.4, 0.07, 0.05, 0.06, '#d4bc88');
    sawhorse(c, -0.32, -0.02, 0.5);
    lamp(c, 0.44, 0.44, 0.3);
    boundary(c, 'stone', -0.47, -0.47, 0.47, 0.47, 0);
  }
};

// --------------------------------------------- joined (2×1) buildings

// Merged buildings run along the longer side of their plot. On a deep plot
// (road at the short end) the row is turned so it runs back from the road.
function rowFrame(c) {
  const turned = c.Ez > c.Ex + 1e-6;
  if (turned) c.gb.push(0, 0, 0, Math.PI / 2);
  return { len: Math.max(c.Ex, c.Ez) * 2, dep: Math.min(c.Ex, c.Ez) * 2, turned };
}

// A low front-garden boundary with gaps at the doors.
function frontage(c, x0, x1, z, gaps, kind) {
  const { gb } = c;
  const cuts = gaps.slice().sort((a, b) => a - b);
  let a = x0;
  const seg = (s, e) => {
    if (e - s < 0.04) return;
    const m = (s + e) / 2, y = c.gy(m, z);
    if (kind === 'hedge') gb.cbox(m, y - 0.01, z, e - s, 0.07, 0.05, '#4a7036', 0, 0.015);
    else if (kind === 'wall') gb.cbox(m, y - 0.01, z, e - s, 0.055, 0.04, '#9a9284', 0, 0.01);
    else if (kind === 'railings') {
      gb.cbox(m, y - 0.01, z, e - s, 0.03, 0.035, STONE, 0, 0.006);
      for (let px = s + 0.02; px < e - 0.01; px += 0.03) gb.box(px, y + 0.02, z, 0.006, 0.06, 0.006, '#2f2f33');
    } else {
      for (let px = s + 0.015; px < e; px += 0.035) gb.box(px, y - 0.01, z, 0.014, 0.07, 0.01, '#ece6da');
      gb.box(m, y + 0.035, z - 0.006, e - s, 0.01, 0.006, '#ece6da');
    }
  };
  for (const g of cuts) { seg(a, g - 0.055); a = g + 0.055; }
  seg(a, x1);
}

MODELS.terrace = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const n = L === 0 ? 3 : 4;
  const floors = L + 1;
  const fh = L === 0 ? 0.33 : 0.27;
  const h = L === 0 ? fh : floors * fh;
  const W = f.len - 0.14, D = [0.46, 0.5, 0.56][L];
  const z0 = -f.dep / 2 + D / 2 + 0.06, fz = z0 + D / 2;
  const brick = L === 1 && (pal.style === 'brick' || rng.chance(0.45));
  const thatch = L === 0 && pal.thatched;
  const roof = thatch ? pal.thatch : L === 2 ? pal.slate : pal.roof;
  const walls = [];
  for (let i = 0; i < n; i++) {
    walls.push(pal.forced ? shade(pal.wall, rng.float(0.92, 1.06)) : brick ? shade(pal.brick, rng.float(0.92, 1.06)) : L === 2 ? (rng.chance(0.35) ? rng.pick(PAINTED) : '#ebe4d6') : rng.pick(PAINTED));
  }
  footing(c, 0, z0, W, D);
  const uw = W / n;
  const doors = [];
  for (let i = 0; i < n; i++) {
    const ux = -W / 2 + (i + 0.5) * uw;
    gb.cbox(ux, 0, z0, uw + 0.003, h, D, walls[i], 0, 0.008);
    const flip = i % 2 === 1;   // doors mirror in pairs
    const dx = ux + (flip ? 1 : -1) * uw * 0.24, wx = ux + (flip ? -1 : 1) * uw * 0.14;
    doors.push(dx);
    door(c, dx, fz, 0.085, Math.min(0.17, fh * 0.6), L === 2 ? rng.pick(ACCENT) : rng.pick(DOORS));
    if (L === 1 && rng.chance(0.6)) bay(c, wx, fz, 0.15, walls[i], roof);
    else win(c, wx, fh * 0.34, fz, 0.1, 0.1, 'f');
    for (let k = 1; k < floors; k++) for (const sx of [-1, 1]) win(c, ux + sx * uw * 0.2, k * fh + fh * 0.34, fz, 0.075, 0.1, 'f');
    for (let k = 0; k < floors; k++) win(c, ux, k * fh + fh * 0.36, z0 - D / 2, 0.075, 0.09, 'b');
  }
  for (const sx of [-1, 1]) for (let k = 0; k < floors; k++) win(c, sx * W / 2, k * fh + fh * 0.36, z0, 0.07, 0.09, sx > 0 ? 'r' : 'l');
  if (L === 2) {
    gb.box(0, h - 0.035, z0, W + 0.02, 0.035, D + 0.02, '#e3dccd');
    gb.box(0, fh - 0.01, fz + 0.004, W, 0.016, 0.012, '#e3dccd');
  }
  const rh = L === 0 ? 0.27 : 0.24;
  if (thatch) thatchRoof(c, 0, h, z0, W + 0.02, D, rh, walls[0], roof, false);
  else gb.gable(0, h, z0, W + 0.02, D, rh, walls[0], roof, 0.05, false, 0.035);
  for (let i = 1; i < n; i++) chimney(c, -W / 2 + i * uw, h - 0.05, h + rh + 0.07, z0, 'home', brick ? shade(pal.brick, 0.88) : STONE);
  if (L >= 1) {
    for (let i = 0; i < n; i++) {
      if (L === 1 && !rng.chance(0.5)) continue;
      const x = -W / 2 + (i + 0.5) * uw, dz = z0 + (D / 2) * 0.42, dy = h + rh * 0.1;
      gb.cbox(x, dy, dz, 0.1, 0.12, 0.12, walls[i], 0, 0.012);
      gb.gable(x, dy + 0.12, dz, 0.1, 0.13, 0.07, walls[i], roof, 0.025, true, 0.022);
      win(c, x, dy + 0.025, dz + 0.06, 0.05, 0.065, 'f');
    }
  }
  // front gardens, divided between the houses
  const edge = f.dep / 2 - 0.05;
  frontage(c, -W / 2 - 0.03, W / 2 + 0.03, edge, doors, L === 0 ? (rng.chance(0.5) ? 'picket' : 'hedge') : L === 1 ? 'wall' : 'railings');
  for (let i = 1; i < n; i++) {
    const x = -W / 2 + i * uw, mz = (fz + edge) / 2;
    gb.cbox(x, c.gy(x, mz) - 0.01, mz, 0.035, 0.05, edge - fz - 0.02, L === 2 ? STONE : '#4a7036', 0, 0.01);
  }
  for (let i = 0; i < n; i++) {
    const ux = -W / 2 + (i + 0.5) * uw, gx = ux + (doors[i] < ux ? 1 : -1) * uw * 0.2, gz = (fz + edge) / 2 + 0.02;
    const r = rng.next();
    if (r < 0.35) flowers(c, gx, gz, rng.int(4, 7), 0.06);
    else if (r < 0.55) bush(c, gx, gz, rng.float(0.7, 1));
    else if (r < 0.65 && L === 0) barrel(c, gx, gz, 0.9);
  }
  if (L === 2) { lamp(c, -W / 2 + 0.02, edge + 0.01, 0.3); lamp(c, W / 2 - 0.02, edge + 0.01, 0.3); }
  if (f.turned) gb.pop();
};

MODELS.shophouse = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const flavor = c.flavor || 'market';
  const n = L === 0 ? 2 : 3;
  const floors = L === 2 ? 3 : 2;
  const fh = 0.27, h = floors * fh;
  const W = f.len - 0.12, D = [0.54, 0.58, 0.62][L];
  const z0 = -f.dep / 2 + D / 2 + 0.05, fz = z0 + D / 2;
  const lower = L === 2 ? pal.stoneWall : pal.style === 'brick' ? pal.brick : pal.style === 'stone' ? pal.stoneWall : shade(pal.wall, 0.9);
  const upper = L === 2 ? shade(pal.stoneWall, 1.08) : pal.wall;
  const jet = pal.timber && L < 2 ? 0.03 : 0;
  const roof = L === 2 ? pal.slate : pal.roof;
  footing(c, 0, z0, W, D);
  gb.cbox(0, 0, z0, W, fh, D, lower, 0, 0.02);
  gb.cbox(0, fh, z0, W + jet * 2, h - fh, D + jet * 2, upper, 0, 0.018);
  gb.box(0, fh - 0.012, z0, W + jet * 2 + 0.012, 0.024, D + jet * 2 + 0.012, jet ? TIMBER : shade(lower, 0.85));
  const uw = W / n;
  const awnA = pal.awning, awnB = '#e9dfc9';
  for (let i = 0; i < n; i++) {
    const ux = -W / 2 + (i + 0.5) * uw;
    const shop = i < n - 1;
    if (shop) {
      // shopfront: a wide window, the shop door and a striped awning
      win(c, ux - uw * 0.1, 0.04, fz, uw * 0.48, 0.13, 'f', 0.95);
      door(c, ux + uw * 0.31, fz, 0.085, 0.17, pal.accent);
      const k = Math.max(3, Math.round(uw / 0.1));
      for (let a = 0; a < k; a++) gb.boxC(ux - uw / 2 + (a + 0.5) * (uw / k), fh - 0.03, fz + 0.065, uw / k, 0.014, 0.14, a % 2 ? awnB : awnA, 0.45);
    } else {
      // the stair door up to the homes above
      door(c, ux - uw * 0.15, fz, 0.08, 0.17, pal.door);
      win(c, ux + uw * 0.2, fh * 0.36, fz, 0.075, 0.1, 'f');
    }
    for (let k = 1; k < floors; k++) {
      for (const sx of [-1, 1]) win(c, ux + sx * uw * 0.22, k * fh + fh * 0.32, fz + jet, 0.075, 0.1, 'f');
      win(c, ux, k * fh + fh * 0.34, z0 - D / 2 - jet, 0.075, 0.09, 'b');
    }
    win(c, ux, fh * 0.36, z0 - D / 2, 0.07, 0.09, 'b');
  }
  for (const sx of [-1, 1]) for (let k = 1; k < floors; k++) win(c, sx * (W / 2 + jet), k * fh + fh * 0.34, z0, 0.07, 0.09, sx > 0 ? 'r' : 'l');
  if (pal.timber && L < 2) {
    for (let i = 0; i <= n * 2; i++) gb.box(-W / 2 - jet + i * (W + jet * 2) / (n * 2), fh, fz + jet + 0.004, 0.016, h - fh, 0.01, TIMBER);
  }
  const rh = 0.26;
  if (L === 2) {
    gb.hip(0, h, z0, W + 0.02, D + 0.02, 0.3, roof, 0.05);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * uw;
      gb.cbox(x, h + 0.02, z0 + D * 0.24, 0.1, 0.12, 0.1, upper, 0, 0.01);
      gb.gable(x, h + 0.14, z0 + D * 0.24, 0.1, 0.12, 0.06, upper, roof, 0.02, true, 0.02);
      win(c, x, h + 0.045, z0 + D * 0.24 + 0.05, 0.05, 0.06, 'f');
    }
  } else gb.gable(0, h, z0, W + jet * 2 + 0.02, D + jet * 2, rh, upper, roof, 0.05, false, 0.035);
  for (let i = 1; i < n; i++) chimney(c, -W / 2 + i * uw, h - 0.05, h + (L === 2 ? 0.34 : rh + 0.08), z0 - 0.06, 'home', STONE);
  // shop sign, lit at night once the business grows
  const sw = (n - 1) * uw * 0.7;
  const sx = -W / 2 + (n - 1) * uw / 2;
  sign(c, sx, fh + 0.015, fz + jet + 0.006, sw, 0.06, '#3b2f2a');
  if (L >= 1) { gb.glow(1.8, 1.4, 0.6, 3.1); gb.box(sx, fh + 0.03, fz + jet + 0.014, sw * 0.85, 0.03, 0.008, '#e0c070'); gb.noGlow(); }
  // the trade spills onto the pavement
  const pz = fz + 0.2;
  if (flavor === 'bakery') {
    chimney(c, -W / 2 + uw * 0.3, h - 0.1, h + rh + 0.12, z0 - 0.12, 'work', '#8f4f3a');
    const bx = -W / 2 + 0.08, by = c.gy(bx, pz);
    gb.box(bx, by, pz, 0.016, 0.3, 0.016, '#3f342c');
    gb.box(bx + 0.05, by + 0.28, pz, 0.11, 0.016, 0.016, '#3f342c');
    gb.cyl(bx + 0.08, by + 0.2, pz, 0.045, 0.045, 0.014, 12, '#c9944a', 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) gb.sphere(sx - 0.06 + i * 0.06, c.gy(sx, pz) + 0.025, pz, 0.026, '#e2d4b4', 1, 0.8);
  } else if (flavor === 'tavern') {
    const bx = -W / 2 + 0.1, by = fh + 0.06;
    gb.box(bx, by, fz + 0.05, 0.012, 0.012, 0.1, '#2f2c2a');
    sign(c, bx, by - 0.11, fz + 0.09, 0.1, 0.1, rng.pick(['#7a3a2a', '#2f4a6a', '#3f5a3a']), Math.PI / 2);
    barrel(c, sx - 0.12, pz); barrel(c, sx - 0.05, pz + 0.04, 0.9);
    bench(c, sx + 0.12, pz + 0.02, Math.PI);
    lamp(c, W / 2 - 0.05, pz + 0.06, 0.28);
  } else {
    const goods = ['#b8402f', '#d98a32', '#7aa34a', '#d9c050', '#6f4a8a'];
    for (let i = 0; i < 3; i++) {
      const x = sx - 0.12 + i * 0.12, y = c.gy(x, pz);
      gb.cbox(x, y, pz, 0.09, 0.06, 0.07, '#86613e', rng.float(-0.2, 0.2), 0.006);
      for (let k = 0; k < 3; k++) gb.sphere(x - 0.025 + k * 0.025, y + 0.075, pz, 0.015, rng.pick(goods), 1);
    }
    crate(c, sx + 0.24, pz + 0.04);
  }
  if (f.turned) gb.pop();
};

// ------------------------------------------------------------- utilities

// Which side of the plot the water is on (the lowest ground), as a local
// direction. Without terrain (thumbnails) it's the back.
function waterSide(c) {
  let best = [0, -1], lo = Infinity;
  for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
    const g = c.gy(dx * 0.62, dz * 0.62);
    if (g < lo - 1e-3) { lo = g; best = [dx, dz]; }
  }
  return best;
}

// A wooden utility pole with a cross-arm and insulators.
function pole(c, x, z, h = 0.5) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cyl(x, y - 0.02, z, 0.011, 0.015, h + 0.02, 6, '#5e4630');
  gb.box(x, y + h - 0.06, z, 0.16, 0.014, 0.016, '#5e4630');
  for (const s of [-1, 1]) gb.cyl(x + s * 0.06, y + h - 0.046, z, 0.008, 0.008, 0.02, 5, '#d8d0c0');
}

MODELS.watermill = (c, L) => {
  const { gb, rng, pal } = c;
  const [sx, sz] = waterSide(c);
  const w = L ? 0.54 : 0.44, d = L ? 0.44 : 0.38, h = L ? 0.5 : 0.32;
  const hx = -sx * 0.12, hz = -sz * 0.12;
  house(c, {
    x: hx, z: hz, w, d, h, floors: L ? 2 : 1, wall: L ? pal.brick : pal.wall, roof: L ? pal.slate : pal.roof, roofType: 'gable',
    rh: 0.22, timber: !L && pal.timber, nFront: 2, chimney: false, lit: 0.7, fancy: false, plinth: STONE,
  });
  // the wheel turns in the stream beside the mill
  const R = L ? 0.24 : 0.2;
  const off = (sx ? w : d) / 2 + 0.06;
  const wx = hx + sx * off, wz = hz + sz * off;
  const wy = Math.max(0.1, c.gy(wx, wz) + R * 0.55);
  const wheel = new GeoBuilder();
  wheel.vary = 0.06;
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    wheel.boxC(Math.cos(a) * R, Math.sin(a) * R, 0, 2 * R * Math.sin(Math.PI / n) + 0.01, 0.022, 0.1, '#6e5034', 0, 0, a + Math.PI / 2);
    wheel.boxC(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0, R, 0.014, 0.014, '#5e432c', 0, 0, a);
    wheel.boxC(Math.cos(a) * (R + 0.025), Math.sin(a) * (R + 0.025), 0, 0.055, 0.012, 0.1, '#86663f', 0, 0, a);
  }
  wheel.boxC(0, 0, 0, 0.05, 0.05, 0.16, '#3a2f28');
  c.spin = { geo: wheel.build(), x: wx, y: wy, z: wz, speed: 0.7, ry: sx ? Math.PI / 2 : 0 };
  // stone wheel pit and a flume bringing the water in
  gb.cbox(wx - sz * 0.0, Math.min(0, c.gy(wx, wz)) - 0.1, wz, sx ? 0.22 : 0.62, 0.1, sx ? 0.62 : 0.22, STONE_D, 0, 0.01);
  gb.box(wx - sz * 0.0 + (sx ? 0 : -0.1), wy + R + 0.04, wz + (sx ? -0.1 : 0), sx ? 0.08 : 0.3, 0.03, sx ? 0.3 : 0.08, '#6e5034');
  // dynamo shed and the line out to the town
  const dx = hx - sx * 0.02 + (sz ? 0.32 : 0), dz = hz + 0.3;
  gb.cbox(dx, c.gy(dx, dz), dz, 0.14, 0.12, 0.12, '#7a6a58', 0, 0.008);
  gb.wedge(dx, c.gy(dx, dz) + 0.12, dz, 0.16, 0.14, 0.04, pal.slate, 0);
  pole(c, 0.4, 0.42);
  if (L) pole(c, -0.4, 0.42);
  sign(c, hx, 0.24, hz + d / 2 + 0.008, 0.18, 0.04, '#3b2f2a');
  void rng;
};

MODELS.windgen = (c, L) => {
  const { gb, pal } = c;
  if (L === 0) {
    // a smock-mill tower with four canvas sails driving a dynamo
    footing(c, 0, -0.05, 0.36, 0.36);
    gb.cyl(0, 0, -0.05, 0.12, 0.17, 0.6, 8, '#a8885c');
    for (let k = 0; k < 3; k++) gb.cyl(0, 0.15 + k * 0.17, -0.05, 0.172 - k * 0.017, 0.172 - k * 0.017, 0.012, 8, '#5e4630');
    gb.cone(0, 0.6, -0.05, 0.15, 0.14, 8, pal.roof);
    door(c, 0, 0.11, 0.07, 0.14, pal.door);
    const sails = new GeoBuilder();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      sails.boxC(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0, 0.34, 0.016, 0.012, '#5e4630', 0, 0, a);
      sails.boxC(Math.cos(a) * 0.2 + Math.cos(a + Math.PI / 2) * 0.035, Math.sin(a) * 0.2 + Math.sin(a + Math.PI / 2) * 0.035, 0.004, 0.24, 0.06, 0.006, '#e8e0cc', 0, 0, a);
    }
    sails.cyl(0, 0, -0.03, 0.025, 0.025, 0.05, 6, '#3a2f28', 0, Math.PI / 2);
    c.spin = { geo: sails.build(), x: 0, y: 0.62, z: 0.1, speed: 1.3 };
    gb.cbox(0.3, c.gy(0.3, 0.25), 0.25, 0.16, 0.12, 0.14, '#7a6a58', 0, 0.008);
    gb.wedge(0.3, c.gy(0.3, 0.25) + 0.12, 0.25, 0.18, 0.16, 0.04, pal.slate, 0);
    pole(c, -0.38, 0.38);
  } else {
    // a tall wind turbine on a slim mast
    footing(c, 0, -0.05, 0.16, 0.16);
    gb.cbox(0, -0.02, -0.05, 0.16, 0.05, 0.16, STONE, 0, 0.01);
    gb.cyl(0, 0.02, -0.05, 0.022, 0.04, 1.28, 8, '#e6e4de');
    gb.cbox(0, 1.27, -0.09, 0.07, 0.07, 0.19, '#dcdad4', 0, 0.01);
    const blades = new GeoBuilder();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      blades.boxC(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0, 0.46, 0.035, 0.008, '#f0eee8', 0, 0, a);
    }
    blades.sphere(0, 0, 0.01, 0.03, '#d0cec8', 1);
    c.spin = { geo: blades.build(), x: 0, y: 1.305, z: 0.03, speed: 2.4 };
    gb.cbox(0.3, c.gy(0.3, 0.28), 0.28, 0.18, 0.14, 0.14, '#d8d2c4', 0, 0.008);
    gb.box(0.3, c.gy(0.3, 0.28) + 0.14, 0.28, 0.2, 0.02, 0.16, '#5a5f63');
    pole(c, -0.38, 0.38);
  }
};

MODELS.pump = (c, L) => {
  const { gb, pal } = c;
  const [sx, sz] = waterSide(c);
  const hx = -sx * 0.1, hz = -sz * 0.1;
  const w = L ? 0.56 : 0.42, d = L ? 0.44 : 0.36;
  house(c, {
    x: hx, z: hz, w, d, h: L ? 0.44 : 0.32, wall: pal.brick, roof: pal.slate, roofType: 'gable', rh: 0.18,
    nFront: 2, chimney: false, lit: 0.8, fancy: false, plinth: STONE,
  });
  const cx = hx - (sx ? 0 : w * 0.3) , cz = hz - (sz ? 0 : d * 0.3);
  chimney(c, cx, 0.2, L ? 1.05 : 0.8, cz, 'heavy', '#7f3f2e');
  // intake pipe down to the water
  const ex = hx + sx * ((sx ? w : d) / 2 + 0.2), ez = hz + sz * ((sx ? w : d) / 2 + 0.2);
  const mx = (hx + ex) / 2 + (sx ? 0 : 0.1), mz = (hz + ez) / 2 + (sz ? 0 : 0.1);
  gb.boxC(mx, Math.max(c.gy(mx, mz), -0.1) + 0.04, mz, sx ? 0.36 : 0.04, 0.04, sx ? 0.04 : 0.36, '#4a4a4e');
  gb.cyl(ex + (sx ? 0 : 0.1), Math.min(c.gy(ex, ez), 0) - 0.12, ez + (sz ? 0 : 0.1), 0.035, 0.035, 0.2, 8, '#4a4a4e');
  if (L) {
    // a raised tank on iron legs
    const tx = -hx * 0 + (sx ? 0 : 0.3) - sx * 0.3, tz = 0.28;
    for (const ax of [-1, 1]) for (const az of [-1, 1]) gb.box(tx + ax * 0.08, c.gy(tx, tz), tz + az * 0.08, 0.02, 0.5, 0.02, '#3a3a3e');
    gb.cyl(tx, c.gy(tx, tz) + 0.5, tz, 0.13, 0.13, 0.16, 12, '#6f7f86');
    gb.cone(tx, c.gy(tx, tz) + 0.66, tz, 0.14, 0.06, 12, '#4a5560');
  } else {
    gb.cyl(0.32, c.gy(0.32, 0.3), 0.3, 0.09, 0.1, 0.16, 12, '#6f7f86');
  }
};

MODELS.powerplant = (c, L) => {
  const { gb, pal } = c;
  const brick = pal.style === 'stone' ? pal.stoneWall : pal.brick;
  // turbine hall with tall windows
  house(c, {
    x: -0.22, z: -0.18, w: 1.1, d: 0.66, h: L ? 0.72 : 0.6, floors: 2, wall: brick, roof: pal.slate, roofType: 'gable', rh: 0.22,
    fancy: false, nFront: 6, doorX: 0, doorW: 0.14, lit: 0.85, plinth: STONE_D, chimney: false,
  });
  // boiler house and chimneys
  const bx = 0.62, bz = -0.36;
  footing(c, bx, bz, 0.5, 0.52);
  gb.cbox(bx, 0, bz, 0.5, 0.52, 0.52, shade(brick, 0.88), 0, 0.016);
  gb.hip(bx, 0.52, bz, 0.5, 0.52, 0.12, pal.slate, 0.04);
  const stacks = L ? [[0.5, -0.66], [0.78, -0.66], [0.64, -0.12]] : [[0.62, -0.68]];
  for (const [x, z] of stacks) {
    const top = L ? 1.75 : 1.5;
    gb.cyl(x, 0.3, z, 0.06, 0.085, top - 0.3, 10, '#7f3f2e');
    gb.cyl(x, top, z, 0.07, 0.07, 0.04, 10, '#5e2e22');
    c.addSmoke(x, top + 0.05, z, 'heavy');
  }
  // coal heaps and a little rail of tubs
  gb.blob(-0.55, c.gy(-0.55, 0.55) - 0.02, 0.55, 0.3, 0.13, 0.22, '#2a2826');
  gb.blob(-0.2, c.gy(-0.2, 0.62) - 0.02, 0.62, 0.18, 0.08, 0.14, '#33302d');
  for (let i = 0; i < 3; i++) gb.cbox(0.1 + i * 0.12, c.gy(0.1 + i * 0.12, 0.6), 0.6, 0.09, 0.06, 0.07, '#4a4a4e', 0, 0.006);
  // transformer yard
  for (const [x, z] of [[0.55, 0.3], [0.8, 0.3], [0.55, 0.6], [0.8, 0.6]]) pole(c, x, z, 0.46);
  gb.cbox(0.68, c.gy(0.68, 0.45), 0.45, 0.14, 0.12, 0.12, '#5a5f63', 0, 0.008);
  fence(c, 0.42, 0.18, 0.94, 0.9, '#5a5a5e', { x: 0.68, z: 0.9, w: 0.08 });
};

// ------------------------------------------------- combination buildings
// All sit on a double plot laid out along its long side (see rowFrame).

MODELS.arcade = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, D = 0.6, z0 = -f.dep / 2 + D / 2 + 0.05, fz = z0 + D / 2;
  const h = [0.42, 0.6, 0.78][L];
  const wall = L ? pal.stoneWall : pal.wall, trim = '#e3dccd';
  footing(c, 0, z0, W, D);
  gb.cbox(0, 0, z0 - 0.07, W, h, D - 0.14, wall, 0, 0.02);
  // an arcade of piers along the front, shops behind
  const n = Math.max(4, Math.round(W / 0.24));
  gb.box(0, -0.01, fz - 0.04, W, 0.02, 0.15, '#cfc6b4');
  for (let i = 0; i <= n; i++) gb.cbox(-W / 2 + (i * W) / n, 0, fz - 0.02, 0.05, h * 0.6, 0.05, trim, 0, 0.008);
  gb.box(0, h * 0.6, fz - 0.04, W + 0.04, 0.05, 0.1, trim);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + ((i + 0.5) * W) / n;
    win(c, x, 0.05, fz - 0.11, (W / n) * 0.55, 0.15, 'f', 0.95);
    gb.boxC(x, h * 0.5, fz + 0.06, W / n, 0.012, 0.12, i % 2 ? '#e9dfc9' : pal.awning, 0.45);
  }
  for (let k = 1; k < (L ? 3 : 2); k++) for (let i = 0; i < n; i++) win(c, -W / 2 + ((i + 0.5) * W) / n, h * 0.6 + 0.06 + (k - 1) * 0.18, fz - 0.06, 0.07, 0.1, 'f');
  if (L === 0) gb.gable(0, h, z0 - 0.07, W + 0.02, D - 0.1, 0.22, wall, pal.roof, 0.05, false, 0.035);
  else {
    gb.hip(0, h, z0 - 0.07, W + 0.02, D - 0.1, 0.26, pal.slate, 0.05);
    // a clock lantern on the ridge
    gb.cbox(0, h + 0.2, z0 - 0.07, 0.15, 0.16, 0.15, trim, 0, 0.01);
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, h + 0.28, z0 + 0.006, 0.045, 0.045, 0.01, 12, '#efe8da', 0, Math.PI / 2); gb.noGlow();
    gb.roof(0, h + 0.36, z0 - 0.07, 0.18, 0.18, 0.14, 0, pal.slate);
  }
  if (L >= 2) { gb.glow(1.6, 1.4, 1.0, 1.5); gb.box(0, h + 0.005, z0 - 0.07, W * 0.5, 0.03, 0.18, '#a9c4c8'); gb.noGlow(); }
  sign(c, 0, h * 0.6 + 0.03, fz + 0.012, 0.36, 0.06, '#3b2f2a');
  const goods = ['#b8402f', '#d98a32', '#7aa34a', '#d9c050', '#6f4a8a'];
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 0.2 + i * (W - 0.4) / 3, pz = fz + 0.17, y = c.gy(x, pz);
    gb.cbox(x, y, pz, 0.1, 0.06, 0.07, '#86613e', rng.float(-0.2, 0.2), 0.006);
    for (let k = 0; k < 3; k++) gb.sphere(x - 0.025 + k * 0.025, y + 0.075, pz, 0.015, rng.pick(goods), 1);
  }
  lamp(c, -W / 2 + 0.02, fz + 0.24, 0.3); lamp(c, W / 2 - 0.02, fz + 0.24, 0.3);
  if (f.turned) gb.pop();
};

MODELS.inn = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.14, D = [0.52, 0.56, 0.62][L], z0 = -f.dep / 2 + D / 2 + 0.06, fz = z0 + D / 2;
  const floors = L + 2, h = floors * 0.26;
  const wall = L === 2 ? '#ebe4d6' : pal.wall;
  // main house, with a carriage arch through to the yard behind
  house(c, {
    x: 0, z: z0, w: W, d: D, h, floors, wall, roof: L === 2 ? pal.slate : pal.roof, roofType: L === 2 ? 'hip' : 'gable', rh: 0.26,
    timber: L < 2 && pal.timber, nFront: Math.round(W / 0.2), doorX: -W * 0.3, chimney: true, lit: 0.95, fancy: false, plinth: STONE,
  });
  const ax = W * 0.18;
  gb.box(ax, 0, fz + 0.004, 0.2, 0.22, 0.012, '#3a2f28');
  gb.cyl(ax, 0.22, fz + 0.006, 0.1, 0.1, 0.012, 10, '#3a2f28', 0, Math.PI / 2);
  gb.box(ax, 0.24, fz + 0.012, 0.26, 0.03, 0.02, STONE);
  // hanging sign, lanterns, benches and barrels
  gb.box(-W / 2 + 0.06, h * 0.55, fz + 0.06, 0.012, 0.012, 0.12, '#2f2c2a');
  sign(c, -W / 2 + 0.06, h * 0.55 - 0.12, fz + 0.11, 0.11, 0.11, rng.pick(['#7a3a2a', '#2f4a6a', '#3f5a3a']), Math.PI / 2);
  for (const x of [-W * 0.1, W * 0.42]) { gb.glow(2.2, 1.6, 0.8, 3.0); gb.box(x, 0.26, fz + 0.03, 0.04, 0.05, 0.04, '#ffe2a0'); gb.noGlow(); }
  bench(c, -W * 0.1, fz + 0.12, Math.PI); barrel(c, W * 0.34, fz + 0.12); barrel(c, W * 0.4, fz + 0.16, 0.9);
  if (L === 2) {
    // a veranda and flags for the grand hotel
    for (let i = 0; i < 6; i++) gb.cyl(-W / 2 + 0.1 + i * (W - 0.2) / 5, 0, fz + 0.1, 0.012, 0.014, 0.26, 6, '#ece6da');
    gb.box(0, 0.26, fz + 0.06, W - 0.1, 0.02, 0.14, '#ece6da');
    for (const x of [-W * 0.3, W * 0.3]) { gb.box(x, h + 0.1, z0, 0.01, 0.3, 0.01, '#3a3a3e'); gb.box(x + 0.05, h + 0.32, z0, 0.1, 0.06, 0.004, rng.pick(['#a8473a', '#3f6a8f'])); }
  } else {
    // stable block at the back
    gb.cbox(-W * 0.25, 0, z0 - D / 2 - 0.0, 0.4, 0.2, 0.08, pal.wood, 0, 0.008);
  }
  if (f.turned) gb.pop();
};

MODELS.parishschool = (c, L) => {
  const { gb, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12;
  const stone = L ? pal.stoneWall : (pal.style === 'brick' ? pal.brick : pal.stoneWall);
  // chapel nave on one side, schoolroom wing on the other, a bell tower between
  const nx = -W / 2 + 0.32, z0 = -f.dep / 2 + 0.36;
  footing(c, nx, z0, 0.56, 0.5);
  gb.cbox(nx, 0, z0, 0.56, 0.42, 0.5, stone, 0, 0.02);
  gb.gable(nx, 0.42, z0, 0.56, 0.5, 0.3, stone, pal.slate, 0.05, true, 0.035);
  for (let i = 0; i < 3; i++) { win(c, nx + 0.28, 0.12, z0 - 0.15 + i * 0.15, 0.06, 0.18, 'r', 0.9); win(c, nx - 0.28, 0.12, z0 - 0.15 + i * 0.15, 0.06, 0.18, 'l', 0.9); }
  gb.cyl(nx, 0.5, z0 + 0.255, 0.07, 0.07, 0.012, 12, '#9fbcc0', 0, Math.PI / 2);
  door(c, nx, z0 + 0.25, 0.09, 0.18, '#4e3424');
  const tx = nx + 0.4, tz = z0 + 0.12, th = L ? 1.1 : 0.85;
  footing(c, tx, tz, 0.18, 0.18);
  gb.cbox(tx, 0, tz, 0.18, th, 0.18, stone, 0, 0.012);
  gb.box(tx, th - 0.2, tz + 0.092, 0.08, 0.12, 0.006, '#2f2f33');
  gb.cone(tx, th, tz, 0.15, L ? 0.4 : 0.28, 4, pal.slate, Math.PI / 4);
  const sx = W / 2 - 0.36, sw = 0.66, sd = 0.46;
  house(c, { x: sx, z: z0 - 0.02, w: sw, d: sd, h: L ? 0.52 : 0.34, floors: L ? 2 : 1, wall: L ? stone : pal.wall, roof: pal.slate, roofType: 'gable', rh: 0.22, nFront: 3, doorX: 0, chimney: true, fancy: false, lit: 0.9 });
  // a playground with a fence at the front
  const pz = f.dep / 2 - 0.16;
  fence(c, sx - sw / 2, pz - 0.18, sx + sw / 2, pz + 0.08, FENCE, { x: sx, z: pz + 0.08, w: 0.1 });
  for (let i = 0; i < 2; i++) { const x = sx - 0.12 + i * 0.24; gb.box(x, c.gy(x, pz - 0.04), pz - 0.04, 0.012, 0.16, 0.012, '#5e432c'); }
  gb.box(sx, c.gy(sx, pz - 0.04) + 0.15, pz - 0.04, 0.26, 0.012, 0.012, '#5e432c');
  bush(c, nx - 0.18, f.dep / 2 - 0.1); bush(c, nx + 0.16, f.dep / 2 - 0.1);
  if (f.turned) gb.pop();
};

MODELS.almshouse = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, z0 = -f.dep / 2 + 0.28;
  const wall = L ? pal.stoneWall : pal.wall;
  // a long low row of almshouse rooms with a central gabled infirmary
  const D = 0.36, n = 5;
  footing(c, 0, z0, W, D);
  gb.cbox(0, 0, z0, W, 0.3, D, wall, 0, 0.016);
  gb.gable(0, 0.3, z0, W + 0.02, D, 0.2, wall, pal.roof, 0.05, false, 0.03);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * (W / n);
    if (i === 2) continue;
    door(c, x - 0.06, z0 + D / 2, 0.07, 0.15, rng.pick(DOORS));
    win(c, x + 0.07, 0.1, z0 + D / 2, 0.07, 0.09, 'f');
    chimney(c, x, 0.25, 0.62, z0 - 0.06, 'home', STONE);
  }
  gb.cbox(0, 0, z0 + 0.08, 0.32, L ? 0.58 : 0.46, 0.4, '#ebe4d6', 0, 0.016);
  gb.gable(0, L ? 0.58 : 0.46, z0 + 0.08, 0.32, 0.4, 0.2, '#ebe4d6', pal.roof, 0.04, true, 0.03);
  door(c, 0, z0 + 0.28, 0.1, 0.18, '#3f4f5a');
  gb.box(0, 0.3, z0 + 0.282, 0.09, 0.09, 0.008, '#c8423a');
  gb.box(0, 0.33, z0 + 0.286, 0.03, 0.03, 0.006, '#f2ede0'); gb.box(0, 0.33, z0 + 0.286, 0.006, 0.07, 0.006, '#f2ede0'); gb.box(0, 0.33, z0 + 0.286, 0.07, 0.006, 0.006, '#f2ede0');
  // a garden court with benches
  const gz = f.dep / 2 - 0.2;
  hedge(c, -W / 2 + 0.3, gz + 0.12, 0.5, 0.05); hedge(c, W / 2 - 0.3, gz + 0.12, 0.5, 0.05);
  bench(c, -0.35, gz, Math.PI); bench(c, 0.35, gz, Math.PI);
  flowers(c, -0.6, gz - 0.02, 6, 0.07); flowers(c, 0.6, gz - 0.02, 6, 0.07);
  if (f.turned) gb.pop();
};

MODELS.fountaingarden = (c, L) => {
  const { gb, rng } = c;
  const f = rowFrame(c);
  const W = f.len - 0.1, D = f.dep - 0.1;
  hedge(c, 0, -D / 2, W, 0.06); hedge(c, -W / 2, 0, 0.06, D); hedge(c, W / 2, 0, 0.06, D);
  hedge(c, -W * 0.3, D / 2, W * 0.36, 0.06); hedge(c, W * 0.3, D / 2, W * 0.36, 0.06);
  // gravel walks crossing at the fountain
  gb.box(0, c.gy(0, 0) - 0.006, 0, W - 0.12, 0.012, 0.1, '#cdbf9e');
  gb.box(0, c.gy(0, 0) - 0.006, 0, 0.1, 0.012, D - 0.1, '#cdbf9e');
  const y = c.gy(0, 0);
  gb.cyl(0, y - 0.02, 0, 0.22, 0.24, 0.07, 16, STONE);
  gb.cyl(0, y + 0.04, 0, 0.2, 0.2, 0.01, 16, '#3f7f9f');
  gb.cyl(0, y + 0.04, 0, 0.04, 0.05, L ? 0.26 : 0.18, 8, STONE);
  gb.cyl(0, y + (L ? 0.22 : 0.15), 0, 0.09, 0.07, 0.03, 10, STONE);
  c.fountain = [0, y + (L ? 0.3 : 0.22), 0];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * W * 0.3, z = sz * D * 0.25;
    flowers(c, x, z, 8, 0.1);
    if (L) smallTree(c, sx * W * 0.42, sz * D * 0.3, 0.8);
  }
  // the old well-house in one corner
  const wx = -W / 2 + 0.16, wz = -D / 2 + 0.16, wy = c.gy(wx, wz);
  gb.cyl(wx, wy - 0.02, wz, 0.08, 0.09, 0.1, 10, STONE);
  for (const s of [-1, 1]) gb.box(wx + s * 0.07, wy + 0.06, wz, 0.016, 0.18, 0.016, '#4e3a2a');
  gb.gable(wx, wy + 0.24, wz, 0.2, 0.14, 0.07, '#6e4a2c', '#8a432e', 0.02);
  bench(c, W * 0.2, D / 2 - 0.12, Math.PI); bench(c, -W * 0.2, -D / 2 + 0.12, 0);
  lamp(c, W / 2 - 0.08, D / 2 - 0.08, 0.28);
  void rng;
  if (f.turned) gb.pop();
};

MODELS.joinery = (c, L) => {
  const { gb, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, z0 = -f.dep / 2 + 0.3;
  house(c, { x: -W / 2 + 0.36, z: z0, w: 0.62, d: 0.48, h: L ? 0.5 : 0.36, floors: L ? 2 : 1, wall: L ? pal.brick : pal.wood, roof: pal.slate, roofType: 'gable', rh: 0.2, nFront: 3, doorX: 0, chimney: false, fancy: false, lit: 0.8 });
  chimney(c, -W / 2 + 0.16, 0.2, L ? 0.95 : 0.75, z0 - 0.15, 'work', '#7f3f2e');
  // an open timber shed with racks of planks
  shed(c, W / 2 - 0.36, z0, 0.6, 0.42, 0.3, pal.roof);
  plankStack(c, W / 2 - 0.36, z0, 4, 0);
  plankStack(c, 0.1, f.dep / 2 - 0.18, 3, 0);
  logs(c, W / 2 - 0.5, f.dep / 2 - 0.16, 3, 0);
  sawhorse(c, -0.1, f.dep / 2 - 0.16, 0.3);
  if (L) { for (let i = 0; i < 3; i++) gb.cbox(-0.05 + i * 0.12, c.gy(0, -0.05), -0.05, 0.09, 0.08, 0.06, '#a8804e', 0.2 * i, 0.006); }
  sign(c, -W / 2 + 0.36, 0.26, z0 + 0.25, 0.26, 0.05, '#3b2f2a');
  if (f.turned) gb.pop();
};

// A brewhouse: the brewing tower with a louvred ventilator on its ridge (the
// steam off the coppers escapes there), the copper house across the back of
// the yard, and the taproom on the street with its sign, benches and casks.
// The Brewery is brick and a storey taller, with a square works stack and a
// horse dray loading in the yard.
MODELS.brewhouse = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, back = -f.dep / 2, front = f.dep / 2;
  const wall = L ? pal.brick : pal.stoneWall;
  // the taproom first: its door is the one customers use
  const pw = 0.7, px = W / 2 - pw / 2 - 0.02, pd = 0.5, pz = back + 0.36, ph = L ? 0.58 : 0.52;
  house(c, {
    x: px, z: pz, w: pw, d: pd, h: ph, floors: 2, wall: pal.wall, roof: L ? pal.slate : pal.roof, roofType: 'gable', rh: 0.26,
    timber: L ? false : pal.timber, chimney: true, lit: 0.95, plinth: STONE, doorX: -pw * 0.2,
  });
  // the brewing tower at the other end, with a loading door and hoist beam
  const tw = 0.46, td = 0.44, tx = -W / 2 + tw / 2 + 0.04, tz = back + 0.3, th = L ? 0.86 : 0.62, trh = 0.22;
  house(c, { x: tx, z: tz, w: tw, d: td, h: th, floors: L ? 3 : 2, wall, roof: pal.slate, roofType: 'gable', rh: trh, nFront: 2, noDoor: true, chimney: false, fancy: false, lit: 0.7 });
  gb.box(tx, th - 0.21, tz + td / 2 + 0.006, 0.09, 0.14, 0.012, '#4e3828');
  gb.box(tx, th - 0.04, tz + td / 2 + 0.06, 0.016, 0.016, 0.12, '#3a2f28');
  gb.box(tx, th - 0.17, tz + td / 2 + 0.11, 0.004, 0.13, 0.004, '#2a2620');
  // louvred ventilator on the ridge
  const vy = th + trh - 0.03;
  gb.cbox(tx, vy, tz, 0.14, 0.1, 0.12, pal.wood, 0, 0.006);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) gb.box(tx, vy + 0.02 + i * 0.026, tz + s * 0.062, 0.12, 0.008, 0.008, '#3a2f28');
  gb.gable(tx, vy + 0.1, tz, 0.18, 0.16, 0.06, pal.wood, pal.slate, 0.02);
  if (!L) c.addSmoke(tx, vy + 0.18, tz, 'home');
  // the copper house between them, across the back of the yard
  const cx = (tx + tw / 2 + px - pw / 2) / 2, cw = px - pw / 2 - (tx + tw / 2) - 0.04, cz = back + 0.2;
  worksShed(c, cx, cz, cw, 0.32, 0.34, 1, wall, pal.slate, 0.16, (u) => Math.abs(u - cx) < 0.1);
  plainDoor(c, cx, cz + 0.16, 0.13, 0.2, '#4e3828');
  if (L) {
    // a square works stack through the copper house roof, and a sign on the tower
    const sx = cx + cw / 2 - 0.08, sz = cz - 0.04;
    gb.cbox(sx, 0, sz, 0.1, 1.15, 0.1, '#7f3f2e', 0, 0.01);
    gb.cbox(sx, 1.15, sz, 0.125, 0.04, 0.125, '#5f3022', 0, 0.008);
    c.addSmoke(sx, 1.22, sz, 'work');
    sign(c, tx, th * 0.5, tz + td / 2 + 0.012, 0.36, 0.07, '#2f3a2a');
  }
  // the yard: casks stacked by the copper house, sacks of malt, a dray
  const yz = cz + 0.24;
  for (let i = 0; i < 4; i++) barrel(c, cx - cw / 2 + 0.07 + i * 0.07, yz);
  for (let i = 0; i < 3; i++) barrel(c, cx - cw / 2 + 0.1 + i * 0.07, yz + 0.07, 0.95);
  for (let i = 0; i < 2; i++) gb.blob(cx + cw / 2 - 0.08 + i * 0.05, c.gy(cx + cw / 2 - 0.08, yz) + 0.02, yz + 0.02, 0.03, 0.035, 0.025, '#d4bc88');
  const dx = cx - 0.02, dz = front - 0.2;
  if (L) {
    // a horse dray with casks aboard, the horse towards the tower end
    gb.push(dx, c.gy(dx, dz), dz, -Math.PI / 2);
    gb.cbox(0, 0.06, 0, 0.18, 0.025, 0.3, '#6e5034', 0, 0.006);
    for (const sx of [-1, 1]) for (const wz of [-0.09, 0.09]) gb.cyl(sx * 0.1, 0.05, wz, 0.05, 0.05, 0.012, 8, '#3a2a1f', 0, 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) gb.cyl(0, 0.1, -0.09 + i * 0.09, 0.034, 0.034, 0.075, 9, '#6e4a2c', 0, 0, Math.PI / 2);
    gb.pop();
    horse(c, dx - 0.27, dz, -Math.PI / 2);
  } else handcart(c, dx, dz);
  // out front of the taproom: a hanging sign, benches and a cask table
  const fz = pz + pd / 2;
  const sx2 = px + pw * 0.38, sz2 = front - 0.08, sy = c.gy(sx2, sz2);
  gb.box(sx2, sy, sz2, 0.018, 0.4, 0.018, '#3a2f28');
  gb.box(sx2 - 0.06, sy + 0.38, sz2, 0.14, 0.018, 0.018, '#3a2f28');
  sign(c, sx2 - 0.08, sy + 0.27, sz2, 0.11, 0.09, rng.pick(['#5a3a1e', '#2f4a3a', '#6a2a2a']));
  gb.cyl(sx2 - 0.08, sy + 0.31, sz2 + 0.01, 0.022, 0.022, 0.012, 8, '#d9b04a', 0, Math.PI / 2);
  bench(c, px - pw * 0.25, fz + 0.12, Math.PI); bench(c, px + pw * 0.1, fz + 0.12, Math.PI);
  barrel(c, px - pw * 0.08, fz + 0.24); barrel(c, px + pw * 0.26, fz + 0.22, 0.9);
  lamp(c, px - pw / 2 - 0.02, front - 0.06, 0.28);
  if (f.turned) gb.pop();
};

// A fish market: an open-sided market roof over slabs of the catch, an ice
// house behind, nets drying and a boat drawn up on trestles. The Fish Hall
// walls the market in with tall arched openings under a glazed roof, and the
// ice house becomes a smokehouse with its stack.
MODELS.fishmarket = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, back = -f.dep / 2, front = f.dep / 2;
  const FISH = ['#b8c4cc', '#9fb0b8', '#c9d2d6', '#d98a7a', '#8a9aa6', '#a9b8a0'];
  const slab = (x, z) => {
    const y = c.gy(x, z);
    for (const sx of [-1, 1]) gb.box(x + sx * 0.1, y, z, 0.02, 0.1, 0.1, STONE_D);
    gb.cbox(x, y + 0.1, z, 0.26, 0.02, 0.13, '#d8d2c6', 0, 0.004);
    for (let i = 0; i < 6; i++) gb.box(x - 0.09 + (i % 3) * 0.09, y + 0.12, z - 0.03 + Math.floor(i / 3) * 0.06, 0.07, 0.014, 0.024, rng.pick(FISH), rng.float(-0.4, 0.4));
  };
  // the market: open at L0, a hall with a glazed roof at L1
  const mx = 0.24, mw = 1.32, md = 0.66, mz = 0;
  if (L) {
    const h = 0.44, hw = pal.brick;
    door(c, mx, md / 2, 0.16, 0.24, '#3f4f5a');
    footing(c, mx, mz, mw, md);
    gb.cbox(mx, 0, mz, mw, h, md, hw, 0, 0.02);
    for (let i = 0; i < 4; i++) {
      const x = mx - mw / 2 + (i + 0.5) * (mw / 4);
      if (Math.abs(x - mx) < 0.12) continue;
      win(c, x, 0.07, md / 2, 0.15, 0.22, 'f', 0.95);
      gb.cyl(x, 0.07 + 0.22 * (c.winH || 1) + 0.012, md / 2 + 0.004, 0.087, 0.087, 0.016, 10, '#e3dccd', 0, Math.PI / 2);
    }
    // a fanlight over the doors (its lower half sits behind the door frame)
    gb.glow(WARM[0], WARM[1], WARM[2], 1.3); gb.cyl(mx, 0.26, md / 2 + 0.001, 0.09, 0.09, 0.008, 10, '#e3dccd', 0, Math.PI / 2); gb.noGlow();
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) win(c, mx + s * mw / 2, 0.12, -0.14 + i * 0.28, 0.12, 0.18, s > 0 ? 'r' : 'l', 0.8);
    gb.gable(mx, h, mz, mw + 0.02, md, 0.24, hw, pal.slate, 0.05, false, 0.035);
    glassRoof(c, mx, h, mz, mw * 0.55, md, 0.24, false, 5);
    sign(c, mx, h - 0.09, md / 2 + 0.012, 0.42, 0.06, '#2f4a5a');
    // a louvred lantern on the ridge with a fish for a vane
    gb.cbox(mx, h + 0.2, mz, 0.12, 0.08, 0.12, '#e3dccd', 0, 0.006);
    gb.hip(mx, h + 0.28, mz, 0.16, 0.16, 0.07, pal.slate, 0.02);
    gb.box(mx, h + 0.35, mz, 0.008, 0.08, 0.008, '#2f2c2a');
    gb.box(mx, h + 0.42, mz, 0.1, 0.03, 0.006, '#c9a640');
  } else {
    // posts carrying a long roof, open all round
    const eave = 0.3;
    for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) {
      const x = mx - mw / 2 + 0.03 + (i * (mw - 0.06)) / 4, z = mz + s * (md / 2 - 0.03);
      gb.box(x, c.gy(x, z) - 0.01, z, 0.026, eave + 0.01 - c.gy(x, z), 0.026, '#5e432c');
    }
    gb.box(mx, eave - 0.02, mz + md / 2 - 0.03, mw, 0.03, 0.03, '#5e432c');
    gb.box(mx, eave - 0.02, mz - md / 2 + 0.03, mw, 0.03, 0.03, '#5e432c');
    gb.gable(mx, eave, mz, mw + 0.04, md + 0.06, 0.18, pal.wood, pal.roof, 0.04, false, 0.03);
    for (const x of [mx - 0.42, mx, mx + 0.42]) for (const z of [mz - 0.13, mz + 0.13]) slab(x, z);
    sign(c, mx, eave - 0.07, mz + md / 2 + 0.012, 0.4, 0.06, '#2f4a5a');
  }
  // ice by the front, and baskets of the catch
  for (let i = 0; i < 3; i++) crate(c, mx - 0.5 + i * 0.09, front - 0.1, 0.9, '#dfeaf0');
  for (let i = 0; i < 2; i++) { const x = mx + 0.4 + i * 0.1, z = front - 0.09; gb.cyl(x, c.gy(x, z), z, 0.035, 0.03, 0.05, 8, '#a8804e'); gb.box(x, c.gy(x, z) + 0.05, z, 0.04, 0.008, 0.03, rng.pick(FISH)); }
  // the ice house (a smokehouse at the Fish Hall) at the back of one end
  const ix = -W / 2 + 0.22, iz = back + 0.24, iw = 0.38, id = 0.36, ih = L ? 0.46 : 0.3;
  house(c, { x: ix, z: iz, w: iw, d: id, h: ih, floors: L ? 2 : 1, wall: L ? pal.brick : pal.stoneWall, roof: pal.slate, roofType: 'hip', rh: 0.14, nFront: 1, noDoor: true, chimney: false, fancy: false, lit: 0.4 });
  plainDoor(c, ix, iz + id / 2, 0.08, 0.16, '#3f4f5a');
  if (L) chimney(c, ix, ih + 0.02, ih + 0.3, iz - 0.06, 'work', STONE_D);
  // nets drying on a frame, and a boat on trestles
  const nz = iz + id / 2 + 0.16, ny = c.gy(ix, nz);
  for (const s of [-1, 1]) gb.box(ix + s * 0.15, ny, nz, 0.016, 0.2, 0.016, '#4e3a2a');
  gb.box(ix, ny + 0.19, nz, 0.33, 0.012, 0.012, '#4e3a2a');
  for (let i = 0; i < 5; i++) gb.box(ix - 0.12 + i * 0.06, ny + 0.11, nz, 0.045, 0.075, 0.006, '#93a6b0');
  const bx = ix, bz = front - 0.13;
  gb.push(bx, c.gy(bx, bz), bz, Math.PI / 2);
  for (const s of [-1, 1]) gb.box(0, 0, s * 0.09, 0.1, 0.05, 0.014, '#5e432c');
  gb.roof(0, 0.05, 0, 0.13, 0.32, 0.065, 0, '#6e4a2c', 0);
  gb.box(0, 0.05, 0, 0.11, 0.035, 0.24, '#7d5b3b');
  gb.pop();
  lamp(c, mx + mw / 2 - 0.02, front - 0.05, 0.28);
  if (f.turned) gb.pop();
};

// A watch house: the station on the street with a blue lamp over the door, a
// watch tower at its end, and a walled yard with the cells along the back.
// The Police Station is brick, three storeys, with a porch, a clock in the
// tower and the police wagon in the yard.
MODELS.watchhouse = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, back = -f.dep / 2, front = f.dep / 2;
  const wall = L ? pal.brick : pal.stoneWall;
  // the station
  const hw = 0.84, hd = 0.48, hx = -W / 2 + hw / 2 + 0.02, hz = back + 0.3, floors = L ? 3 : 2, h = L ? 0.78 : 0.52;
  house(c, { x: hx, z: hz, w: hw, d: hd, h, floors, wall, roof: pal.slate, roofType: 'hip', rh: 0.2, nFront: L ? 5 : 4, doorX: 0, chimney: true, fancy: false, lit: 0.9, plinth: STONE });
  const hf = hz + hd / 2;
  gb.glow(1.0, 1.4, 2.2, 3.0); gb.box(hx, 0.21, hf + 0.03, 0.04, 0.05, 0.03, '#b8d0ff'); gb.noGlow();
  gb.box(hx, 0.2, hf + 0.012, 0.012, 0.012, 0.04, '#2f2c2a');
  sign(c, hx, h / floors + 0.01, hf + 0.012, 0.34, 0.05, '#2f3e5a');
  if (L) portico(c, hx, hf, 0.24, 0.2, 2, pal.slate);
  // the watch tower beside it (a clock in it at the Police Station)
  const s = L ? 1 : 0.9, tx = hx + hw / 2 + 0.13, tz = back + 0.2, H = L ? 1.25 : 0.95;
  footing(c, tx, tz, 0.26 * s, 0.26 * s);
  gb.cbox(tx, 0, tz, 0.26 * s, H, 0.26 * s, wall, 0, 0.02);
  gb.cbox(tx, H, tz, 0.32 * s, 0.045, 0.32 * s, STONE_D, 0, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cbox(tx + sx * 0.125 * s, H + 0.045, tz + sz * 0.125 * s, 0.07 * s, 0.07, 0.07 * s, wall, 0, 0.01);
  gb.roof(tx, H + 0.11, tz, 0.3 * s, 0.3 * s, 0.24, 0, pal.slate);
  gb.box(tx, H + 0.33, tz, 0.011, 0.22, 0.011, '#2f2c2a');
  gb.box(tx + 0.055, H + 0.47, tz, 0.11, 0.065, 0.004, rng.pick(['#2f3e5a', '#a8473a', '#3f6a8f']));
  for (let k = 0; k < 2; k++) win(c, tx, H * (0.3 + k * 0.3), tz + 0.13 * s, 0.05, 0.08, 'f', 0.9);
  if (L) {
    gb.cyl(tx, H * 0.84, tz + 0.132, 0.065, 0.065, 0.012, 14, STONE_D, 0, Math.PI / 2);
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(tx, H * 0.84, tz + 0.138, 0.055, 0.055, 0.01, 14, '#efe8da', 0, Math.PI / 2); gb.noGlow();
  }
  c.addGlow(tx, H * 0.6 + 0.04, tz + 0.15 * s);
  // the cells along the back of the yard, barred windows facing in
  const yx0 = tx + 0.15, yx1 = W / 2, cx = (yx0 + yx1) / 2, cl = yx1 - yx0 - 0.02, cz = back + 0.16;
  footing(c, cx, cz, cl, 0.26);
  gb.cbox(cx, 0, cz, cl, 0.26, 0.26, wall, 0, 0.014);
  gb.gable(cx, 0.26, cz, cl + 0.02, 0.26, 0.12, wall, pal.slate, 0.04, false, 0.03);
  const n = Math.max(3, Math.round(cl / 0.16));
  for (let i = 0; i < n; i++) {
    const x = cx - cl / 2 + (i + 0.5) * (cl / n);
    gb.box(x, 0.13, cz + 0.132, 0.05, 0.05, 0.008, '#2a2a2e');
    for (let k = -1; k <= 1; k++) gb.box(x + k * 0.016, 0.13, cz + 0.137, 0.005, 0.05, 0.005, '#6a6a6e');
  }
  plainDoor(c, cx - cl / 2 + 0.08, cz + 0.13, 0.07, 0.16, '#3a3a3e');
  // a high yard wall round the front, with gate piers
  const wz = front - 0.06, wy = 0.12, wc = '#9a9284';
  const seg = (ax, az, bx, bz) => { const mx = (ax + bx) / 2, mz = (az + bz) / 2; gb.cbox(mx, c.gy(mx, mz) - 0.01, mz, Math.abs(bx - ax) + 0.04, wy, Math.abs(bz - az) + 0.04, wc, 0, 0.012); };
  const gx = cx + 0.08;
  seg(yx0, wz, gx - 0.11, wz); seg(gx + 0.11, wz, yx1 - 0.02, wz);
  seg(yx1 - 0.02, cz + 0.13, yx1 - 0.02, wz);
  seg(yx0, tz + 0.13 * s + 0.02, yx0, wz);
  gatePiers(c, gx, wz, 0.22);
  if (L) coach(c, cx, cz + 0.36, Math.PI / 2, '#22304a', false);
  else { handcart(c, cx + 0.1, cz + 0.32); barrel(c, yx1 - 0.1, cz + 0.24); }
  lamp(c, hx + hw / 2 - 0.06, front - 0.06, 0.3); lamp(c, hx - hw / 2 + 0.06, front - 0.06, 0.3);
  if (f.turned) gb.pop();
};

MODELS.park = (c, L) => {
  const { gb, rng } = c;
  const f = rowFrame(c);
  const W = f.len - 0.08, D = f.dep - 0.08;
  // winding walk, a pond and a bandstand among trees
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = -W / 2 + 0.08 + t * (W - 0.16), z = Math.sin(t * Math.PI * 2) * D * 0.22;
    gb.box(x, c.gy(x, z) - 0.006, z, 0.14, 0.012, 0.09, '#cdbf9e', Math.cos(t * Math.PI * 2) * 0.6);
  }
  const px = W * 0.22, pz = -D * 0.12, py = c.gy(px, pz);
  gb.cyl(px, py - 0.03, pz, 0.2, 0.22, 0.04, 14, '#9a9284');
  gb.cyl(px, py + 0.005, pz, 0.18, 0.18, 0.006, 14, '#3f7f9f');
  for (let i = 0; i < 2; i++) gb.sphere(px - 0.05 + i * 0.08, py + 0.02, pz + 0.03, 0.018, '#f2ede0', 0);
  const bx = -W * 0.22, bz = D * 0.1, by = c.gy(bx, bz);
  gb.cyl(bx, by - 0.01, bz, 0.13, 0.14, 0.05, 8, STONE);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; gb.cyl(bx + Math.cos(a) * 0.11, by + 0.04, bz + Math.sin(a) * 0.11, 0.008, 0.008, 0.18, 5, '#ece6da'); }
  gb.cone(bx, by + 0.22, bz, 0.16, 0.1, 8, L ? '#2f6a4a' : '#8a432e');
  for (let i = 0; i < (L ? 9 : 6); i++) smallTree(c, rng.float(-W / 2 + 0.1, W / 2 - 0.1), rng.chance(0.5) ? -D / 2 + 0.1 : D / 2 - 0.1, rng.float(0.8, 1.2));
  for (const x of [-W * 0.4, W * 0.42]) flowers(c, x, 0, 8, 0.09);
  bench(c, 0, D / 2 - 0.14, Math.PI); bench(c, W * 0.05, -D / 2 + 0.14, 0);
  if (L) { lamp(c, -W / 2 + 0.06, 0, 0.3); lamp(c, W / 2 - 0.06, 0, 0.3); }
  if (f.turned) gb.pop();
};

MODELS.mansion = (c, L) => {
  const { gb, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.14;
  const wall = pal.stoneHouse || L ? pal.stoneWall : pal.wall, roof = pal.slate, trim = '#ece6da';
  const z0 = -f.dep / 2 + 0.32;
  // centre block with two wings and a portico, formal garden in front
  house(c, { x: 0, z: z0, w: 0.7, d: 0.5, h: L ? 0.9 : 0.62, floors: L ? 3 : 2, wall, roof, roofType: 'hip', rh: 0.3, plinth: STONE, doorX: 0, doorW: 0.12, nFront: 3, chimney: true });
  for (const s of [-1, 1]) house(c, { x: s * (W / 2 - 0.26), z: z0 + 0.04, w: 0.44, d: 0.42, h: L ? 0.62 : 0.46, floors: 2, wall, roof, roofType: 'hip', rh: 0.22, noDoor: true, plinth: STONE, nFront: 2, chimney: true });
  for (let i = 0; i < 4; i++) gb.cyl(-0.15 + i * 0.1, 0.02, z0 + 0.32, 0.016, 0.019, 0.36, 8, trim);
  gb.gable(0, 0.38, z0 + 0.3, 0.4, 0.14, 0.09, trim, roof, 0.02);
  const gz = f.dep / 2 - 0.2;
  gb.box(0, c.gy(0, gz) - 0.006, gz, 0.12, 0.012, 0.3, '#cdbf9e');
  for (const s of [-1, 1]) { hedge(c, s * 0.42, gz, 0.5, 0.05); flowers(c, s * 0.25, gz - 0.06, 6, 0.06); smallTree(c, s * (W / 2 - 0.08), gz, 0.9); }
  if (L) { gb.cyl(0, c.gy(0, gz + 0.04), gz + 0.04, 0.09, 0.1, 0.05, 12, STONE); c.fountain = [0, c.gy(0, gz + 0.04) + 0.08, gz + 0.04]; }
  lamp(c, -0.12, f.dep / 2 - 0.06, 0.3); lamp(c, 0.12, f.dep / 2 - 0.06, 0.3);
  if (f.turned) gb.pop();
};

MODELS.apartments = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, D = 0.62, z0 = -f.dep / 2 + D / 2 + 0.06, fz = z0 + D / 2;
  const floors = L ? 6 : 4, h = floors * 0.25;
  const wall = pal.style === 'brick' || (!pal.forced && rng.chance(0.5)) ? pal.brick : pal.stoneWall, trim = '#e3dccd';
  house(c, { x: 0, z: z0, w: W, d: D, h, floors, wall, roof: pal.slate, roofType: L ? 'flat' : 'hip', rh: 0.26, plinth: STONE_D, doorX: 0, doorW: 0.14, nFront: Math.round(W / 0.16), fancy: false, door: '#3a2f28' });
  for (let k = 1; k < floors; k++) gb.box(0, k * 0.25 - 0.008, z0, W + 0.02, 0.014, D + 0.02, trim);
  // stacked balconies either side of the entrance
  for (let k = 1; k < floors; k++) for (const s of [-1, 1]) {
    const x = s * W * 0.28, y = k * 0.25;
    gb.box(x, y, fz + 0.035, 0.24, 0.012, 0.07, trim);
    gb.box(x, y + 0.012, fz + 0.068, 0.24, 0.045, 0.006, '#2f2f33');
  }
  gb.gable(0, 0.3, fz + 0.04, 0.26, 0.1, 0.08, trim, pal.slate, 0.02);
  if (L) { for (const x of [-W * 0.3, 0, W * 0.3]) { gb.cbox(x, h + 0.04, z0, 0.16, 0.12, 0.14, wall, 0, 0.01); } gb.box(0, h + 0.045, z0, W + 0.03, 0.03, D + 0.03, trim); }
  for (const x of [-W * 0.42, W * 0.42]) chimney(c, x, h - 0.1, h + (L ? 0.3 : 0.38), z0 - 0.12, 'home', STONE);
  lamp(c, -0.2, fz + 0.18, 0.3); lamp(c, 0.2, fz + 0.18, 0.3);
  if (f.turned) gb.pop();
};

// --------------------------------------------------- schools by stage

MODELS.middleschool = (c, L) => {
  const { gb, rng, pal } = c;
  const wall = L ? pal.brick : rng.pick(['#b8704a', '#cfae86', '#a8573a']);
  const H = L ? 0.62 : 0.48;
  house(c, { z: -0.14, w: L ? 0.88 : 0.8, d: 0.5, h: H, floors: 2, wall, roof: pal.slate, roofType: 'hip', rh: 0.22, doorX: 0, doorW: 0.12, nFront: 4, lit: 0.6, plinth: STONE, fancy: false, chimney: true });
  // bell cote and a clock on the front
  gb.cbox(0, H + 0.12, -0.14, 0.14, 0.16, 0.14, '#e9e0cc', 0, 0.01);
  gb.roof(0, H + 0.28, -0.14, 0.18, 0.18, 0.12, 0, pal.slate);
  gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, H - 0.1, 0.115, 0.045, 0.045, 0.01, 12, '#efe8da', 0, Math.PI / 2); gb.noGlow();
  // playground: hopscotch, a climbing frame, a fence
  const py = c.gy(-0.3, 0.32);
  gb.box(-0.3, py - 0.004, 0.32, 0.22, 0.01, 0.14, '#9a9284');
  for (const x of [0.18, 0.36]) gb.box(x, c.gy(x, 0.32), 0.32, 0.014, 0.16, 0.014, '#5e432c');
  gb.box(0.27, c.gy(0.27, 0.32) + 0.15, 0.32, 0.2, 0.014, 0.014, '#5e432c');
  fence(c, -0.47, 0.18, 0.47, 0.47, FENCE, { x: 0, z: 0.47, w: 0.12 });
};

MODELS.highschool = (c, L) => {
  const { gb, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.14, D = 0.56, z0 = -f.dep / 2 + D / 2 + 0.06, fz = z0 + D / 2;
  const floors = L ? 3 : 2, h = floors * 0.26;
  house(c, { x: 0, z: z0, w: W, d: D, h, floors, wall: pal.brick, roof: pal.slate, roofType: 'hip', rh: 0.26, plinth: STONE, doorX: 0, doorW: 0.14, nFront: Math.round(W / 0.17), fancy: false, chimney: true, lit: 0.7 });
  // central tower with a clock and flag
  gb.cbox(0, 0, fz - 0.05, 0.22, h + 0.32, 0.16, pal.stoneWall, 0, 0.014);
  gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, h + 0.16, fz + 0.035, 0.06, 0.06, 0.01, 12, '#efe8da', 0, Math.PI / 2); gb.noGlow();
  gb.roof(0, h + 0.32, fz - 0.05, 0.24, 0.18, 0.22, 0, pal.slate);
  gb.box(0, h + 0.54, fz - 0.05, 0.01, 0.22, 0.01, '#3a3a3e'); gb.box(0.05, h + 0.7, fz - 0.05, 0.1, 0.06, 0.004, '#3f6a8f');
  door(c, 0, fz + 0.03, 0.1, 0.18, '#3f2f28');
  // a sports field in front
  const sz = f.dep / 2 - 0.18;
  gb.box(0, c.gy(0, sz) - 0.006, sz, W * 0.7, 0.012, 0.24, '#7fae4f');
  for (const s of [-1, 1]) { gb.box(s * W * 0.33, c.gy(s * W * 0.33, sz), sz, 0.01, 0.12, 0.01, '#f2ede0'); gb.box(s * W * 0.33, c.gy(s * W * 0.33, sz) + 0.11, sz, 0.01, 0.01, 0.12, '#f2ede0'); }
  if (f.turned) gb.pop();
};

MODELS.college = (c, L) => {
  const { gb, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, z0 = -f.dep / 2 + 0.34;
  const stone = pal.stoneWall, h = L ? 0.84 : 0.66;
  // a gothic hall with corner towers, pointed windows and a quad
  house(c, { x: 0, z: z0, w: W * 0.62, d: 0.52, h, floors: L ? 3 : 2, wall: stone, roof: pal.slate, roofType: 'gable', rh: 0.34, plinth: STONE_D, doorX: 0, doorW: 0.12, nFront: 5, fancy: false, lit: 0.85 });
  for (const s of [-1, 1]) {
    const tx = s * (W / 2 - 0.16);
    footing(c, tx, z0, 0.26, 0.26);
    gb.cbox(tx, 0, z0, 0.26, h + 0.2, 0.26, stone, 0, 0.014);
    for (const a of [-1, 1]) for (const b2 of [-1, 1]) gb.cone(tx + a * 0.1, h + 0.2, z0 + b2 * 0.1, 0.035, 0.16, 6, pal.slate);
    for (let k = 0; k < 3; k++) win(c, tx, 0.12 + k * 0.22, z0 + 0.131, 0.06, 0.12, 'f', 0.8);
  }
  // the quad: lawn and paths
  const qz = f.dep / 2 - 0.22;
  gb.box(0, c.gy(0, qz) - 0.006, qz, W * 0.7, 0.012, 0.3, '#7fae4f');
  gb.box(0, c.gy(0, qz) - 0.002, qz, 0.08, 0.012, 0.3, '#cdbf9e');
  gb.box(0, c.gy(0, qz) - 0.002, qz, W * 0.7, 0.012, 0.06, '#cdbf9e');
  smallTree(c, -W * 0.25, qz, 0.9); smallTree(c, W * 0.25, qz, 0.9);
  lamp(c, -0.1, f.dep / 2 - 0.06, 0.3); lamp(c, 0.1, f.dep / 2 - 0.06, 0.3);
  if (f.turned) gb.pop();
};

MODELS.university = (c, L) => {
  const { gb, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.12, z0 = -f.dep / 2 + 0.34, trim = '#ece6da';
  // a domed main hall with a portico, wings, and an observatory
  house(c, { x: 0, z: z0, w: 0.62, d: 0.52, h: 0.74, floors: 3, wall: trim, roof: pal.slate, roofType: 'flat', plinth: STONE_D, doorX: 0, doorW: 0.14, nFront: 3, fancy: false, lit: 0.9 });
  gb.cyl(0, 0.76, z0, 0.2, 0.22, 0.12, 14, trim);
  gb.sphere(0, 0.88, z0, 0.2, '#5f7f86', 1, 0.8);
  gb.cyl(0, 1.04, z0, 0.03, 0.04, 0.1, 8, trim);
  for (let i = 0; i < 6; i++) gb.cyl(-0.2 + i * 0.08, 0.02, z0 + 0.32, 0.016, 0.018, 0.44, 8, trim);
  gb.gable(0, 0.46, z0 + 0.3, 0.52, 0.14, 0.1, trim, pal.slate, 0.02);
  for (const s of [-1, 1]) house(c, { x: s * (W / 2 - 0.25), z: z0 + 0.04, w: 0.42, d: 0.42, h: 0.54, floors: 2, wall: pal.stoneWall, roof: pal.slate, roofType: 'hip', rh: 0.2, noDoor: true, nFront: 2, fancy: false, lit: 0.85 });
  // observatory dome on one wing
  const ox = W / 2 - 0.25;
  gb.cyl(ox, 0.74, z0 + 0.04, 0.12, 0.12, 0.06, 12, trim);
  gb.sphere(ox, 0.8, z0 + 0.04, 0.12, '#c8cfd2', 1, 0.9);
  gb.box(ox + 0.03, 0.8, z0 + 0.04, 0.03, 0.14, 0.03, '#3a3a3e', 0, 0, -0.5);
  const qz = f.dep / 2 - 0.2;
  gb.box(0, c.gy(0, qz) - 0.006, qz, W * 0.75, 0.012, 0.28, '#7fae4f');
  gb.box(0, c.gy(0, qz) - 0.002, qz, 0.1, 0.012, 0.28, '#cdbf9e');
  for (const s of [-1, 1]) { smallTree(c, s * W * 0.3, qz, 1); bench(c, s * 0.14, qz, Math.PI); }
  if (f.turned) gb.pop();
};

// ----------------------------------------------------------- 2×2 estates
// A double-plot building grown onto the two plots beside it can be rebuilt
// as one of these. Each lays itself out over the whole 2×2 plot (rowFrame:
// the street at +z, the plot ±1 round the centre), in the building's
// palette and style.

const GRAVEL = '#cdbf9e', LAWN_G = '#7fae4f', IRON = '#2f2f33', GLASS_ROOF = '#a9c4c8', POOL = '#3f7f9f';

function gravel(c, x, z, w, d, color = GRAVEL) {
  c.gb.box(x, c.gy(x, z) - 0.008, z, w, 0.012, d, color);
}

// A door frame and leaf on any face of a wall (door() registers the one
// villagers use, and only faces the street).
function plainDoor(c, x, z, w, h, color, face = 'f') {
  const { gb } = c;
  const oz = face === 'f' ? 1 : face === 'b' ? -1 : 0, ox = face === 'r' ? 1 : face === 'l' ? -1 : 0, side = ox !== 0;
  gb.box(x + ox * 0.004, 0, z + oz * 0.004, side ? 0.014 : w + 0.024, h + 0.016, side ? w + 0.024 : 0.014, '#5a4330');
  gb.box(x + ox * 0.01, 0, z + oz * 0.01, side ? 0.014 : w, h, side ? w : 0.014, color);
}

// A tall window of coloured glass, glowing at night (ry turns one on a
// front or back face, to follow a curved wall).
function stainedGlass(c, x, y, z, w, h, k, face, ry = 0) {
  const s = [[1.4, 0.5, 0.5], [0.5, 0.7, 1.6], [1.4, 1.1, 0.4]][k % 3];
  c.gb.glow(s[0], s[1], s[2], 1.05 + c.rng.float(0, 0.2));
  if (face === 'r' || face === 'l') c.gb.box(x, y, z, 0.016, h, w, '#3f4a6e');
  else c.gb.box(x, y, z, w, h, 0.016, '#3f4a6e', ry);
  c.gb.noGlow();
}

// A round window (rose or wheel) in a wall facing +z (dir 0) or ±x (dir ±1).
function roseWindow(c, x, y, z, r, dir = 0) {
  const { gb } = c;
  const rx = dir ? 0 : Math.PI / 2, rz = dir > 0 ? -Math.PI / 2 : dir < 0 ? Math.PI / 2 : 0;
  gb.cyl(x, y, z, r + 0.018, r + 0.018, 0.01, 14, STONE_D, 0, rx, rz);
  gb.glow(1.6, 0.8, 1.6, 1.04);
  gb.cyl(x + dir * 0.004, y, z + (dir ? 0 : 0.004), r, r, 0.012, 14, '#5a4a8a', 0, rx, rz);
  gb.noGlow();
}

// Classical columns carrying an entablature and a pediment, in front of a
// wall face at z: w wide, columns h tall.
function portico(c, x, z, w, h, n, roof, trim = '#ece6da') {
  const { gb } = c;
  footing(c, x, z + 0.07, w + 0.06, 0.16);
  gb.cbox(x, -0.03, z + 0.07, w + 0.06, 0.05, 0.16, STONE, 0, 0.008);
  for (let i = 0; i < n; i++) gb.cyl(x - w / 2 + 0.025 + (i * (w - 0.05)) / (n - 1), 0.02, z + 0.11, 0.015, 0.018, h, 8, trim);
  gb.cbox(x, 0.02 + h, z + 0.07, w + 0.02, 0.035, 0.15, trim, 0, 0.006);
  gb.gable(x, 0.055 + h, z + 0.07, w + 0.02, 0.15, Math.min(0.1, w * 0.2), trim, roof, 0.02);
}

// A crenellated parapet along a wall top: len long, centred on (x, y, z),
// running along x (or z).
function battlements(c, x, y, z, len, alongZ, color) {
  const { gb } = c;
  const n = Math.max(3, 2 * Math.round(len / 0.12) + 1), s = len / n;
  gb.box(x, y, z, alongZ ? 0.04 : len, 0.022, alongZ ? len : 0.04, color);
  for (let i = 0; i < n; i += 2) {
    const u = -len / 2 + (i + 0.5) * s;
    gb.box(alongZ ? x : x + u, y + 0.022, alongZ ? z + u : z, alongZ ? 0.04 : s, 0.026, alongZ ? s : 0.04, color);
  }
}
function parapet(c, x, y, z, w, d, color) {
  battlements(c, x, y, z + d / 2 - 0.02, w, false, color);
  battlements(c, x, y, z - d / 2 + 0.02, w, false, color);
  battlements(c, x + w / 2 - 0.02, y, z, d - 0.08, true, color);
  battlements(c, x - w / 2 + 0.02, y, z, d - 0.08, true, color);
}

// Gate piers with ball finials either side of a gap at (x, z).
function gatePiers(c, x, z, gap, color = STONE) {
  for (const s of [-1, 1]) {
    const px = x + (s * gap) / 2, y = c.gy(px, z);
    c.gb.cbox(px, y - 0.01, z, 0.06, 0.17, 0.06, color, 0, 0.008);
    c.gb.sphere(px, y + 0.19, z, 0.025, shade(color, 1.1), 0);
  }
}

function topiary(c, x, z, s = 1) {
  const y = c.gy(x, z);
  c.gb.cyl(x, y - 0.01, z, 0.014, 0.014, 0.03, 5, '#5e432c');
  c.gb.cone(x, y + 0.02, z, 0.04 * s, 0.13 * s, 7, '#3f6a32');
}

// A formal bed: low clipped hedges round a rectangle with a cross through
// it, flowers in its quarters and a clipped cone at each corner.
function parterre(c, x, z, w, d) {
  const h = 0.035;
  hedge(c, x, z - d / 2, w, 0.03, h); hedge(c, x, z + d / 2, w, 0.03, h);
  hedge(c, x - w / 2, z, 0.03, d, h); hedge(c, x + w / 2, z, 0.03, d, h);
  hedge(c, x, z, w - 0.06, 0.025, h * 0.8); hedge(c, x, z, 0.025, d - 0.06, h * 0.8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    flowers(c, x + (sx * w) / 4, z + (sz * d) / 4, 4, Math.min(w, d) * 0.12);
    topiary(c, x + (sx * w) / 2, z + (sz * d) / 2, 0.8);
  }
}

// A round stone basin with a jet in the middle (fountain particles at it).
function basin(c, x, z, r, jet = 0.12) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cyl(x, y - 0.02, z, r, r + 0.01, 0.07, 14, STONE);
  gb.cyl(x, y + 0.045, z, r - 0.015, r - 0.015, 0.008, 14, POOL);
  gb.cyl(x, y + 0.04, z, 0.018, 0.024, jet, 8, STONE);
  c.fountain = [x, y + jet + 0.06, z];
}

// Glazed panes over a gable roof's slopes (iron ribs show between them),
// lit from within at night. Same frame as GeoBuilder.gable.
function glassRoof(c, x, y, z, w, d, h, alongZ, n = 6) {
  const { gb } = c;
  gb.push(x, y, z, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  const hd = d / 2, a = Math.atan2(h, hd), L = Math.hypot(hd, h), lift = 0.03;
  const cz = hd / 2 + Math.sin(a) * lift, cy = h / 2 + Math.cos(a) * lift, pw = w / n;
  gb.glow(1.6, 1.4, 1.0, 1.5);
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) gb.boxC(-w / 2 + (i + 0.5) * pw, cy, s * cz, pw - 0.022, 0.01, L - 0.03, GLASS_ROOF, s * a);
  gb.noGlow();
  gb.pop();
}

// A plain works building: walls, a gable roof and windows on every face,
// leaving out the ground-floor front windows where skip(x) says.
function worksShed(c, x, z, w, d, h, floors, wall, roof, rh, skip = () => false) {
  const { gb, rng } = c;
  footing(c, x, z, w, d);
  gb.cbox(x, 0, z, w, h, d, wall, 0, 0.02);
  gb.gable(x, h, z, w, d, rh, wall, roof, 0.05, false, 0.035);
  const fh = h / floors, nF = Math.max(1, Math.round(w / 0.2)), nS = Math.max(1, Math.round(d / 0.24)), wh = Math.min(0.11, fh * 0.4);
  for (let k = 0; k < floors; k++) {
    const y = k * fh + fh * 0.36;
    for (let i = 0; i < nF; i++) {
      const u = x - w / 2 + (i + 0.5) * (w / nF);
      if (k || !skip(u)) win(c, u, y, z + d / 2, 0.075, wh, 'f', 0.8);
      if (rng.chance(0.7)) win(c, u, y, z - d / 2, 0.075, wh, 'b', 0.8);
    }
    for (let i = 0; i < nS; i++) {
      const v = z - d / 2 + (i + 0.5) * (d / nS);
      win(c, x + w / 2, y, v, 0.075, wh, 'r', 0.8);
      win(c, x - w / 2, y, v, 0.075, wh, 'l', 0.8);
    }
  }
}

// One range of rooms round a court: walls and a gable roof along its length
// (alongZ: it runs along z), windows down both long sides and, on the side
// facing the court (dir: ±1 across the range, 0 for none), a door to each
// ground-floor room. A stack in the middle of the ridge if asked for.
function courtRange(c, x, z, len, dep, h, floors, wall, roof, alongZ, dir, rooms, stack = false, rh = 0.2) {
  const { gb, rng } = c;
  const w = alongZ ? dep : len, d = alongZ ? len : dep;
  footing(c, x, z, w, d);
  gb.cbox(x, 0, z, w, h, d, wall, 0, 0.016);
  if (rh > 0) gb.gable(x, h, z, w, d, rh, wall, roof, 0.05, alongZ, 0.03);
  const at = (u, s) => (alongZ ? [x + (s * dep) / 2, z + u] : [x + u, z + (s * dep) / 2]);
  const face = (s) => (alongZ ? (s > 0 ? 'r' : 'l') : s > 0 ? 'f' : 'b');
  const fh = h / floors, wh = Math.min(0.1, fh * 0.36);
  for (let i = 0; i < rooms; i++) {
    const u = -len / 2 + (i + 0.5) * (len / rooms);
    for (let k = 0; k < floors; k++) for (const s of [-1, 1]) {
      const y = k * fh + fh * 0.34;
      if (k === 0 && s === dir) {
        const [dx, dz] = at(u - 0.05, s), [wx, wz] = at(u + 0.06, s);
        plainDoor(c, dx, dz, 0.065, Math.min(0.16, fh * 0.6), rng.pick(DOORS), face(s));
        win(c, wx, y, wz, 0.065, wh, face(s));
      } else if (s === dir || rng.chance(0.8)) {
        const [wx, wz] = at(u, s);
        win(c, wx, y, wz, 0.07, wh, face(s));
      }
    }
  }
  if (stack) chimney(c, x, h - 0.05, h + rh + 0.08, z, 'home', stackColor(c));
}
const stackColor = (c) => (c.pal.style === 'brick' ? c.pal.brick : STONE);

// A standing horse, the size of the ones that pull the coaches (Transit):
// facing +z, its head at z ≈ 0.17.
function horse(c, x, z, ry, color = '#7a5232') {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.box(0, 0.075, 0, 0.07, 0.07, 0.17, color);
  gb.box(0, 0.12, 0.1, 0.045, 0.07, 0.05, color, 0, -0.5);
  gb.box(0, 0.15, 0.14, 0.04, 0.035, 0.07, color);
  gb.box(0, 0.12, 0.07, 0.012, 0.06, 0.05, '#3a2a1f', 0, -0.4);
  gb.box(0, 0.09, -0.09, 0.012, 0.05, 0.012, '#3a2a1f', 0, 0.6);
  for (const [lx, lz] of [[-0.025, 0.06], [0.025, 0.06], [-0.025, -0.06], [0.025, -0.06]]) gb.box(lx, 0, lz, 0.018, 0.08, 0.018, shade(color, 0.85));
  gb.pop();
}

// A stage coach the size of the ones on the coach lines, facing +z; with its
// horse in the shafts if asked for.
function coach(c, x, z, ry, body = '#3f5466', withHorse = false) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.box(0, 0.06, -0.02, 0.2, 0.17, 0.34, body);
  gb.box(0, 0.23, -0.02, 0.22, 0.025, 0.37, '#3a3a3e');
  gb.box(0, 0.06, -0.02, 0.21, 0.025, 0.35, '#3a2a1f');
  for (const sx of [-1, 1]) for (const wz of [-0.1, 0.05]) gb.box(sx * 0.101, 0.13, wz, 0.006, 0.06, 0.09, '#34475b');
  gb.box(0, 0.2, 0.15, 0.12, 0.012, 0.06, '#3a2a1f');
  for (const [wz, r] of [[0.08, 0.04], [-0.12, 0.05]]) for (const sx of [-1, 1]) gb.cyl(sx * 0.118, r, wz, r, r, 0.015, 8, '#3a2a1f', 0, 0, Math.PI / 2);
  gb.box(0, 0.09, 0.2, 0.014, 0.014, 0.12, '#5b4231');
  gb.pop();
  if (withHorse) horse(c, x + Math.sin(ry) * 0.26, z + Math.cos(ry) * 0.26, ry);
}

function hayBale(c, x, z, ry = 0) {
  c.gb.cyl(x, c.gy(x, z) + 0.03, z, 0.03, 0.03, 0.07, 8, '#d9be6a', ry, 0, Math.PI / 2);
}

// The market's trestle stall under a striped awning.
function marketStall(c, x, z, ry, s, awnA) {
  const { gb, rng } = c;
  const awnB = '#e9dfc9';
  gb.push(x, c.gy(x, z), z, ry, s);
  gb.cbox(0, 0, 0, 0.4, 0.13, 0.2, '#86613e', 0, 0.01);
  gb.box(0, 0.13, 0, 0.42, 0.016, 0.22, '#a07a50');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.2, 0, sz * 0.1, 0.022, sz < 0 ? 0.38 : 0.33, 0.022, '#5e432c');
  for (let i = 0; i < 5; i++) gb.boxC(-0.176 + i * 0.088, 0.36, 0.0, 0.088, 0.014, 0.31, i % 2 ? awnB : awnA, -0.2);
  const goods = ['#b8402f', '#d98a32', '#7aa34a', '#d9c050', '#6f4a8a'];
  for (let i = 0; i < 7; i++) gb.sphere(-0.16 + i * 0.054, 0.165, rng.float(-0.05, 0.05), 0.022, rng.pick(goods), 1);
  gb.pop();
}

// Manor Estate: the great house across the back of a forecourt, wings
// reaching forward either side, a drive between formal gardens, and the
// stables and kitchen garden (an orangery at the Ducal Seat) behind.
MODELS.manor = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const wall = !pal.forced && (L > 0 || pal.stoneHouse || rng.chance(0.5)) ? pal.stoneWall : pal.wall;
  const roof = pal.forced ? pal.roof : pal.slate, trim = '#ece6da';
  // classical and hipped, unless the style calls for gables
  const hipped = !pal.forced || pal.hip || pal.style === 'brick' || pal.style === 'stone';
  const H = L ? 0.88 : 0.62, D = 0.46, z0 = -0.39, front = z0 + D / 2;
  house(c, {
    x: 0, z: z0, w: 0.96, d: D, h: H, floors: L ? 3 : 2, wall, roof, roofType: hipped ? 'hip' : 'gable', rh: 0.3,
    plinth: STONE, doorX: 0, doorW: 0.12, nFront: L ? 7 : 5, chimney: true, chimneyPos: 'ends',
  });
  portico(c, 0, front, L ? 0.42 : 0.34, L ? 0.5 : 0.36, L ? 6 : 4, roof, trim);
  const wh = L ? 0.62 : 0.46;
  for (const s of [-1, 1]) {
    house(c, {
      x: s * 0.64, z: -0.13, ry: (-s * Math.PI) / 2, w: 0.74, d: 0.32, h: wh, floors: 2, wall, roof, roofType: hipped ? 'hip' : 'gable', rh: 0.2,
      noDoor: true, plinth: STONE, nFront: 3, chimney: false,
    });
  }
  if (L) {
    // a cupola with a flag over the middle of the house
    const top = H + 0.3 * pal.pitch;
    gb.cbox(0, top - 0.05, z0, 0.13, 0.12, 0.13, trim, 0, 0.01);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.2); gb.box(0, top + 0.0, z0 + 0.066, 0.05, 0.05, 0.006, GLASS); gb.noGlow();
    gb.sphere(0, top + 0.08, z0, 0.075, '#5f7f86', 1, 0.8);
    gb.box(0, top + 0.13, z0, 0.01, 0.2, 0.01, '#3a3a3e');
    gb.box(0.045, top + 0.27, z0, 0.09, 0.055, 0.004, rng.pick(['#a8473a', '#3f6a8f', '#4f7a45']));
  }
  // the forecourt: gravel round a lawn with a statue (a fountain later)
  gravel(c, 0, 0.12, 0.92, 0.26);
  const cy = c.gy(0, 0.13);
  gb.cyl(0, cy - 0.004, 0.13, 0.1, 0.1, 0.012, 16, LAWN_G);
  if (L) basin(c, 0, 0.13, 0.08, 0.1);
  else {
    gb.cbox(0, cy, 0.13, 0.05, 0.08, 0.05, STONE, 0, 0.008);
    gb.cyl(0, cy + 0.08, 0.13, 0.014, 0.02, 0.09, 6, '#8a8478');
    gb.sphere(0, cy + 0.185, 0.13, 0.02, '#8a8478', 0);
  }
  // the drive in from the gates, between formal gardens
  gravel(c, 0, 0.61, 0.14, 0.7);
  for (const s of [-1, 1]) parterre(c, s * 0.53, 0.6, 0.56, 0.46);
  frontage(c, -0.97, 0.97, 0.95, [0], L ? 'railings' : 'wall');
  gatePiers(c, 0, 0.95, 0.15);
  for (const s of [-1, 1]) {
    hedge(c, s * 0.94, 0.62, 0.04, 0.6);
    smallTree(c, s * 0.89, -0.32, 0.7); smallTree(c, s * 0.89, 0.02, 0.65);
    if (L) { lamp(c, s * 0.11, 0.42, 0.3); lamp(c, s * 0.11, 0.8, 0.3); }
  }
  // behind the house: a stable range with a clock, and the kitchen garden
  const side = rng.chance(0.5) ? 1 : -1, sx = side * 0.68, sz = -0.8;
  footing(c, sx, sz, 0.52, 0.26);
  gb.cbox(sx, 0, sz, 0.52, 0.26, 0.26, wall, 0, 0.014);
  gb.gable(sx, 0.26, sz, 0.52, 0.26, 0.13, wall, roof, 0.04, false, 0.03);
  for (let i = 0; i < 3; i++) {
    const x = sx - 0.16 + i * 0.16;
    plainDoor(c, x, sz + 0.13, 0.06, 0.13, '#5e432c');
    gb.box(x, 0.065, sz + 0.142, 0.064, 0.008, 0.006, '#3f342c');
  }
  gb.cbox(sx, 0.33, sz, 0.08, 0.08, 0.08, trim, 0, 0.006);
  gb.roof(sx, 0.41, sz, 0.1, 0.1, 0.07, 0, roof);
  gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(sx, 0.355, sz + 0.04, 0.026, 0.026, 0.006, 10, '#efe8da', 0, Math.PI / 2); gb.noGlow();
  if (L) {
    // the orangery: a long glasshouse on a stone base
    const ox = -side * 0.66, oz = -0.8;
    footing(c, ox, oz, 0.5, 0.22);
    gb.cbox(ox, 0, oz, 0.5, 0.05, 0.22, STONE, 0, 0.008);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.3);
    gb.box(ox, 0.05, oz, 0.48, 0.18, 0.2, '#9fbcc0');
    gb.noGlow();
    for (let i = 0; i < 6; i++) gb.box(ox - 0.24 + i * 0.096, 0.05, oz + 0.101, 0.008, 0.18, 0.008, trim);
    gb.box(ox, 0.23, oz, 0.5, 0.012, 0.22, trim);
    gb.gable(ox, 0.235, oz, 0.5, 0.22, 0.07, '#c8dadc', '#c8dadc', 0.02, false, 0.012);
    for (let i = 0; i < 4; i++) gb.sphere(ox - 0.18 + i * 0.12, 0.09, oz, 0.03, rng.pick(LEAF), 0);
  } else {
    vegPatch(c, -side * 0.56, -0.8); vegPatch(c, -side * 0.8, -0.8);
    beehives(c, -side * 0.68, -0.64);
  }
  smallTree(c, -0.22, -0.84, 1); smallTree(c, 0.2, -0.86, 0.9);
  bench(c, 0, -0.72, 0);
  if (f.turned) gb.pop();
};

// Mansion Quadrangle: four ranges of flats round a garden court, the way in
// through the middle of the street range.
MODELS.quadrangle = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const floors = L ? 6 : 4, fh = 0.25, h = floors * fh;
  const wall = pal.style === 'brick' || (!pal.forced && rng.chance(0.5)) ? pal.brick : pal.stoneWall, trim = '#e3dccd';
  const RD = 0.42, fz = 0.6, W = 1.84, sl = 2 * fz - RD, ff = fz + RD / 2;
  const roofType = L ? 'flat' : 'hip', base = { h, floors, wall, roof: pal.slate, roofType, rh: 0.26, plinth: STONE_D, fancy: false };
  house(c, { ...base, x: 0, z: fz, w: W, d: RD, doorX: 0, doorW: 0.14, nFront: 11, door: '#3a2f28', chimney: true, chimneyPos: 'ends' });
  house(c, { ...base, x: 0, z: -fz, w: W, d: RD, noDoor: true, nFront: 11, chimney: true, chimneyPos: 'ends' });
  for (const s of [-1, 1]) house(c, { ...base, x: s * (W / 2 - RD / 2), z: 0, ry: (-s * Math.PI) / 2, w: sl, d: RD, noDoor: true, nFront: 4, chimney: false });
  // string courses all round, and iron balconies on the street
  for (let k = 1; k < floors; k++) {
    const y = k * fh - 0.008;
    for (const z of [fz, -fz]) gb.box(0, y, z, W + 0.02, 0.014, RD + 0.02, trim);
    for (const s of [-1, 1]) gb.box(s * (W / 2 - RD / 2), y, 0, RD + 0.02, 0.014, sl, trim);
    for (const x of [-0.62, -0.28, 0.28, 0.62]) {
      gb.box(x, k * fh, ff + 0.035, 0.2, 0.012, 0.07, trim);
      gb.box(x, k * fh + 0.012, ff + 0.068, 0.2, 0.045, 0.006, IRON);
    }
  }
  // a canopy on columns over the entrance
  for (const s of [-1, 1]) gb.cyl(s * 0.1, 0.02, ff + 0.08, 0.012, 0.014, 0.24, 8, trim);
  gb.gable(0, 0.26, ff + 0.05, 0.26, 0.11, 0.07, trim, pal.slate, 0.02);
  if (L) {
    // a cornice, attic windows and a pavilion roof at each corner
    for (const z of [fz, -fz]) gb.box(0, h + 0.045, z, W + 0.03, 0.03, RD + 0.03, trim);
    for (const s of [-1, 1]) gb.box(s * (W / 2 - RD / 2), h + 0.045, 0, RD + 0.03, 0.03, sl, trim);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) for (const z of [fz, -fz]) {
      gb.cbox(x, h + 0.04, z, 0.12, 0.1, 0.12, wall, 0, 0.01);
      win(c, x, h + 0.06, z + Math.sign(z) * 0.06, 0.05, 0.06, z > 0 ? 'f' : 'b');
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 0.73, z = sz * 0.62;
      gb.cbox(x, h, z, 0.3, 0.2, 0.3, wall, 0, 0.012);
      gb.box(x, h + 0.2, z, 0.32, 0.02, 0.32, trim);
      gb.roof(x, h + 0.22, z, 0.32, 0.32, 0.2, 0, pal.slate);
      win(c, x, h + 0.05, z + sz * 0.15, 0.06, 0.09, sz > 0 ? 'f' : 'b');
      win(c, x + sx * 0.15, h + 0.05, z, 0.06, 0.09, sx > 0 ? 'r' : 'l');
    }
  }
  // the garden court: a lawn, gravel walks and trees (a fountain later)
  const cw = W - 2 * RD - 0.04, cd = sl - 0.04, gy = c.gy(0, 0);
  gb.box(0, gy - 0.008, 0, cw, 0.012, cd, LAWN_G);
  gb.box(0, gy - 0.004, 0, cw, 0.012, 0.07, GRAVEL);
  gb.box(0, gy - 0.004, 0, 0.07, 0.012, cd, GRAVEL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) smallTree(c, sx * 0.25, sz * 0.2, 0.85);
  if (L) basin(c, 0, 0, 0.09, 0.1);
  else {
    gb.cyl(0, gy - 0.01, 0, 0.07, 0.07, 0.02, 12, '#5e432c');
    flowers(c, 0, 0, 8, 0.05);
    washingLine(c, 0.32, -0.33);
  }
  bench(c, -0.12, 0.3, Math.PI); bench(c, 0.12, -0.3, 0);
  frontage(c, -0.94, 0.94, 0.94, [0], 'railings');
  lamp(c, -0.2, 0.92, 0.3); lamp(c, 0.2, 0.92, 0.3);
  if (f.turned) gb.pop();
};

// Market Halls: a stone Corn Exchange behind a portico, an iron-and-glass
// Covered Market Hall, and the Grand Galleria (see galleria).
MODELS.markethall = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const trim = '#e3dccd';
  if (L >= 2) galleria(c);
  else if (L === 0) {
    // the Corn Exchange: a stone hall under one long roof, a portico on the street
    const wall = pal.stoneWall, roof = pal.slate, hz = -0.24, hw = 1.16, hd = 1.12, h = 0.5, fz = hz + hd / 2;
    footing(c, 0, hz, hw, hd);
    gb.cbox(0, 0, hz, hw, h, hd, wall, 0, 0.02);
    gb.push(0, 0, hz); quoins(c, hw, hd, h, wall); gb.pop();
    gb.gable(0, h, hz, hw, hd, 0.34, wall, roof, 0.05, true, 0.035);
    door(c, 0, fz, 0.14, 0.22, '#4e3424');
    portico(c, 0, fz, 0.78, 0.4, 6, roof, trim);
    for (const s of [-1, 1]) win(c, s * 0.46, 0.12, fz, 0.09, 0.2, 'f', 0.9);
    for (let i = 0; i < 4; i++) {
      const z = hz - hd / 2 + (i + 0.5) * (hd / 4);
      win(c, hw / 2, 0.3, z, 0.08, 0.14, 'r', 0.9); win(c, -hw / 2, 0.3, z, 0.08, 0.14, 'l', 0.9);
    }
    for (const x of [-0.3, 0.3]) win(c, x, 0.14, hz - hd / 2, 0.09, 0.2, 'b', 0.9);
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, 0.66, fz + 0.004, 0.06, 0.06, 0.01, 12, '#efe8da', 0, Math.PI / 2); gb.noGlow();
    // a cupola on the ridge with a wheatsheaf vane
    const top = h + 0.34;
    gb.cbox(0, top - 0.05, hz, 0.14, 0.14, 0.14, trim, 0, 0.01);
    gb.roof(0, top + 0.09, hz, 0.17, 0.17, 0.12, 0, roof);
    gb.box(0, top + 0.21, hz, 0.01, 0.08, 0.01, '#c9a43a');
    gb.sphere(0, top + 0.3, hz, 0.022, '#d9b84a', 0);
    // lean-to shops along both sides, their awnings out over the pavement
    for (const s of [-1, 1]) {
      const x = s * (hw / 2 + 0.14), sz = hz + 0.02, sd = hd - 0.3, ox = s * (hw / 2 + 0.28);
      footing(c, x, sz, 0.28, sd);
      gb.cbox(x, 0, sz, 0.28, 0.26, sd, shade(wall, 0.95), 0, 0.012);
      gb.wedge(x, 0.26, sz, sd + 0.04, 0.32, 0.08, pal.roof, (s * Math.PI) / 2);
      for (let i = 0; i < 3; i++) {
        const z = sz - sd / 2 + (i + 0.5) * (sd / 3);
        plainDoor(c, ox, z - 0.07, 0.08, 0.17, rng.pick(DOORS), s > 0 ? 'r' : 'l');
        win(c, ox, 0.05, z + 0.05, 0.1, 0.12, s > 0 ? 'r' : 'l', 0.95);
        gb.boxC(ox + s * 0.055, 0.21, z, 0.11, 0.012, sd / 3 - 0.03, i % 2 ? '#e9dfc9' : pal.awning, 0, 0, -s * 0.45);
      }
    }
    // market day out front: stalls, sacks of grain, a cart
    marketStall(c, -0.58, 0.74, 0.15, 0.85, pal.awning);
    marketStall(c, 0.6, 0.72, -0.2, 0.85, pal.awning2);
    for (let i = 0; i < 4; i++) { const x = -0.2 + (i % 2) * 0.06, z = 0.82 + Math.floor(i / 2) * 0.05; gb.blob(x, c.gy(x, z) + 0.025, z, 0.03, 0.035, 0.026, '#d8c8a0'); }
    handcart(c, 0.28, 0.86); barrel(c, -0.36, 0.9); crate(c, 0.38, 0.62);
    lamp(c, -0.34, 0.58, 0.3); lamp(c, 0.34, 0.58, 0.3);
    crate(c, -0.3, -0.9); crate(c, -0.22, -0.88, 0.9, '#a88458'); barrel(c, 0.3, -0.9);
  } else {
    // the Covered Market Hall: a glazed nave between brick gable walls, lower
    // aisles either side with shops round the outside
    const brick = pal.brick, roof = pal.slate, hz = -0.12, hd = 1.56, nw = 0.8, nh = 0.7, rh = 0.32, aw = 0.36, ah = 0.44, fz = hz + hd / 2;
    footing(c, 0, hz, nw + 2 * aw, hd);
    gb.cbox(0, 0, hz, nw, ah, hd, brick, 0, 0.012);
    gb.glow(1.6, 1.4, 1.0, 1.5); gb.box(0, ah, hz, nw - 0.02, nh - ah, hd - 0.04, GLASS_ROOF); gb.noGlow();
    for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) gb.box(s * (nw / 2 - 0.004), ah, hz - hd / 2 + 0.02 + (i * (hd - 0.04)) / 8, 0.014, nh - ah, 0.014, IRON);
    gb.gable(0, nh, hz, nw + 0.02, hd - 0.02, rh, '#5a6268', '#4a5258', 0.03, true, 0.016);
    glassRoof(c, 0, nh, hz, nw + 0.02, hd - 0.02, rh, true, 8);
    // a louvred lantern along the middle of the ridge lets the air out
    gb.cbox(0, nh + rh - 0.03, hz, 0.12, 0.09, 0.6, '#5a6268', 0, 0.006);
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) gb.box(s * 0.062, nh + rh + 0.0, hz - 0.25 + i * 0.1, 0.006, 0.045, 0.06, '#3a4248');
    gb.gable(0, nh + rh + 0.06, hz, 0.16, 0.64, 0.06, '#5a6268', '#4a5258', 0.02, true, 0.014);
    for (const s of [-1, 1]) {
      const ax = s * (nw / 2 + aw / 2), ox = s * (nw / 2 + aw);
      gb.cbox(ax, 0, hz, aw, ah, hd - 0.06, brick, 0, 0.014);
      gb.wedge(ax, ah, hz, hd - 0.02, aw + 0.06, 0.12, roof, (s * Math.PI) / 2);
      for (let i = 0; i < 5; i++) {
        const z = hz - hd / 2 + 0.2 + i * ((hd - 0.4) / 4);
        plainDoor(c, ox, z - 0.07, 0.08, 0.17, rng.pick(DOORS), s > 0 ? 'r' : 'l');
        win(c, ox, 0.05, z + 0.06, 0.1, 0.14, s > 0 ? 'r' : 'l', 0.95);
        win(c, ox, 0.28, z, 0.07, 0.08, s > 0 ? 'r' : 'l', 0.8);
        gb.boxC(ox + s * 0.055, 0.23, z, 0.11, 0.012, (hd - 0.4) / 4 - 0.04, i % 2 ? '#e9dfc9' : pal.awning, 0, 0, -s * 0.45);
      }
    }
    // the brick gable ends, each with a wheel window, the street one with a clock
    for (const e of [1, -1]) {
      const z = hz + e * (hd / 2 + 0.02);
      gb.cbox(0, 0, z, nw + 2 * aw + 0.04, ah + 0.04, 0.06, shade(brick, 0.95), 0, 0.01);
      gb.cbox(0, 0, z, nw + 0.06, nh, 0.06, brick, 0, 0.01);
      gb.roof(0, nh, z, 0.06, nw + 0.06, rh, 0.06, brick, Math.PI / 2);
      gb.push(0, 0, z, e > 0 ? 0 : Math.PI);
      gb.cyl(0, nh - 0.04, 0.03, 0.18, 0.18, 0.008, 16, trim, 0, Math.PI / 2);
      gb.glow(1.6, 1.4, 1.0, 1.5); gb.cyl(0, nh - 0.04, 0.034, 0.16, 0.16, 0.008, 16, GLASS_ROOF, 0, Math.PI / 2); gb.noGlow();
      for (let k = 0; k < 4; k++) gb.boxC(0, nh - 0.04, 0.044, 0.32, 0.012, 0.006, IRON, 0, 0, (k * Math.PI) / 4);
      gb.pop();
    }
    door(c, 0, fz + 0.05, 0.2, 0.26, '#3a3230');
    gb.cyl(0, 0.26, fz + 0.054, 0.1, 0.1, 0.012, 12, '#3a3230', 0, Math.PI / 2);
    sign(c, 0, ah - 0.06, fz + 0.06, 0.5, 0.06, '#3b2f2a');
    gb.glow(1.8, 1.4, 0.6, 3.1); gb.box(0, ah - 0.045, fz + 0.068, 0.42, 0.03, 0.008, '#e0c070'); gb.noGlow();
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, nh + 0.22, fz + 0.054, 0.045, 0.045, 0.01, 12, '#efe8da', 0, Math.PI / 2); gb.noGlow();
    // flower and fruit stalls on the pavement
    marketStall(c, -0.6, 0.84, 0, 0.85, pal.awning);
    marketStall(c, 0.6, 0.84, 0, 0.85, pal.awning2);
    lamp(c, -0.3, 0.86, 0.3); lamp(c, 0.3, 0.86, 0.3);
  }
  if (f.turned) gb.pop();
};

// Grand Galleria: four three-storey blocks of shops round a cross of glazed
// arcades, a glass dome over the crossing and a triumphal arch on the street.
function galleria(c) {
  const { gb, rng, pal } = c;
  const wall = pal.stoneWall, trim = '#e3dccd', roof = pal.slate, A = 0.25, H = 0.78;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    house(c, {
      x: sx * 0.6, z: sz * 0.6, w: 0.64, d: 0.62, h: H, floors: 3, wall, roof, roofType: 'hip', rh: 0.2, plinth: STONE_D, noDoor: true,
      nFront: 3, fancy: false, chimney: true, chimneyPos: 'center', shopWindow: true, lit: 0.9,
    });
    for (let k = 1; k < 3; k++) gb.box(sx * 0.6, k * 0.26 - 0.008, sz * 0.6, 0.66, 0.014, 0.64, trim);
  }
  // the glazed arcades and the dome where they cross
  gb.box(0, 0, 0, 2 * A, 0.01, 1.9, '#d8d0c0');
  gb.box(0, 0, 0, 1.9, 0.01, 2 * A, '#d8d0c0');
  for (const along of [true, false]) {
    const w = along ? 2 * A : 1.86, d = along ? 1.86 : 2 * A;
    gb.gable(0, H, 0, w, d, 0.22, '#5a6268', '#4a5258', 0.02, along, 0.014);
    glassRoof(c, 0, H, 0, w, d, 0.22, along, 10);
  }
  gb.cyl(0, H + 0.12, 0, 0.3, 0.3, 0.14, 16, trim);
  gb.glow(1.6, 1.4, 1.0, 1.5); gb.sphere(0, H + 0.26, 0, 0.29, GLASS_ROOF, 1, 0.8); gb.noGlow();
  // iron ribs up the dome, each lying along its curve halfway up
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, r = 0.29 * Math.SQRT1_2 * 1.04;
    gb.boxC(Math.cos(a) * r, H + 0.26 + 0.29 * 0.8 * Math.SQRT1_2 * 1.04, Math.sin(a) * r, 0.012, 0.012, 0.2, IRON, -0.675, Math.atan2(-Math.cos(a), -Math.sin(a)));
  }
  gb.cyl(0, H + 0.48, 0, 0.05, 0.05, 0.08, 8, trim);
  gb.cone(0, H + 0.56, 0, 0.06, 0.08, 8, '#5f7f86');
  // a triumphal arch on the street, smaller glazed screens at the other ends
  const fz = 0.82;
  gb.cbox(0, 0, fz, 2 * A + 0.14, H + 0.2, 0.08, trim, 0, 0.012);
  door(c, 0, fz + 0.04, 0.22, 0.3, '#2a2422');
  gb.cyl(0, 0.3, fz + 0.044, 0.11, 0.11, 0.012, 12, '#2a2422', 0, Math.PI / 2);
  gb.glow(1.6, 1.4, 1.0, 1.5); gb.cyl(0, 0.3, fz + 0.05, 0.085, 0.085, 0.008, 12, GLASS_ROOF, 0, Math.PI / 2); gb.noGlow();
  for (const s of [-1, 1]) gb.cyl(s * 0.19, 0.02, fz + 0.06, 0.018, 0.02, H - 0.05, 8, '#f2ede0');
  gb.box(0, H + 0.03, fz + 0.045, 2 * A + 0.1, 0.06, 0.012, '#3b2f2a');
  gb.glow(1.8, 1.4, 0.6, 3.1); gb.box(0, H + 0.045, fz + 0.053, 2 * A, 0.03, 0.006, '#e0c070'); gb.noGlow();
  for (const [x, z, ry] of [[0, -0.9, Math.PI], [0.9, 0, Math.PI / 2], [-0.9, 0, -Math.PI / 2]]) {
    gb.push(x, 0, z, ry);
    gb.cbox(0, 0, 0, 2 * A + 0.06, H, 0.05, trim, 0, 0.01);
    gb.box(0, 0, 0.026, 0.18, 0.26, 0.01, '#2a2422');
    gb.glow(1.6, 1.4, 1.0, 1.5); gb.box(0, 0.32, 0.026, 2 * A - 0.08, H - 0.4, 0.01, GLASS_ROOF); gb.noGlow();
    gb.pop();
  }
  // flags on the dome, lamps and flower stalls in front
  for (const s of [-1, 1]) { gb.box(s * 0.36, H + 0.2, 0.36, 0.01, 0.3, 0.01, '#3a3a3e'); gb.box(s * 0.36 + 0.05, H + 0.42, 0.36, 0.1, 0.06, 0.004, rng.pick(['#a8473a', '#3f6a8f', '#d9b84a'])); }
  lamp(c, -0.3, 0.92, 0.32); lamp(c, 0.3, 0.92, 0.32);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) flowers(c, s * (0.4 + i * 0.14), 0.95, 3, 0.02);
}

// Coaching House: the inn on the street with a carriage arch through to a
// cobbled yard, stables down both sides and the coach house across the back.
MODELS.coachinginn = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const floors = L + 2, fh = 0.26, h = floors * fh, D = 0.46, W = 1.76, fz = 0.6, ff = fz + D / 2, bf = fz - D / 2;
  const grand = L === 2, wall = grand ? '#ebe4d6' : pal.wall, roof = grand ? pal.slate : pal.roof;
  // the carriage arch is wide and high enough for a coach (see coach)
  const ax = (rng.chance(0.5) ? 1 : -1) * 0.46, aw = 0.24, ah = 0.3, dx = -Math.sign(ax) * 0.12;
  const jet = !grand && pal.timber && pal.jetty ? 0.03 : 0;
  footing(c, 0, fz, W, D);
  gb.cbox(0, 0, fz, W, fh, D, wall, 0, 0.02);
  gb.cbox(0, fh, fz, W + jet * 2, h - fh, D + jet * 2, wall, 0, 0.018);
  if (jet) gb.box(0, fh - 0.012, fz, W + jet * 2 + 0.01, 0.024, D + jet * 2 + 0.01, TIMBER);
  if (!grand && pal.timber) { gb.push(0, 0, fz); timber(c, W + jet * 2, D + jet * 2, h, floors); gb.pop(); }
  door(c, dx, ff, 0.1, 0.18, pal.door);
  // the carriage arch, right through to the yard
  for (const [z, e] of [[ff, 1], [bf, -1]]) {
    gb.cyl(ax, ah - aw / 2, z + (e > 0 ? 0.002 : -0.012), aw / 2 + 0.025, aw / 2 + 0.025, 0.01, 12, STONE, 0, Math.PI / 2);
    gb.box(ax, 0, z + e * 0.008, aw + 0.05, ah - aw / 2, 0.01, STONE);
    gb.box(ax, 0, z + e * 0.012, aw, ah - aw / 2, 0.012, '#2a2018');
    gb.cyl(ax, ah - aw / 2, z + (e > 0 ? 0.006 : -0.018), aw / 2, aw / 2, 0.012, 12, '#2a2018', 0, Math.PI / 2);
  }
  const n = 9, bw = W / n;
  for (let k = 0; k < floors; k++) for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * bw, y = k * fh + fh * 0.36, jz = k ? jet : 0;
    const hole = k === 0 && Math.abs(x - ax) < aw / 2 + 0.07;
    if (!hole && !(k === 0 && Math.abs(x - dx) < 0.12)) win(c, x, y, ff + jz, 0.075, 0.1, 'f', 0.95);
    if (!hole && rng.chance(0.75)) win(c, x, y, bf - jz, 0.075, 0.1, 'b', 0.9);
  }
  for (const s of [-1, 1]) for (let k = 0; k < floors; k++) win(c, s * (W / 2 + (k ? jet : 0)), k * fh + fh * 0.36, fz, 0.07, 0.1, s > 0 ? 'r' : 'l', 0.9);
  const rh = 0.28;
  if (grand) gb.hip(0, h, fz, W + 0.02, D + 0.02, 0.3, roof, 0.05);
  else gb.gable(0, h, fz, W + jet * 2 + 0.02, D + jet * 2, rh, wall, roof, 0.05, false, 0.035);
  for (const s of [-1, 1]) chimney(c, s * W * 0.36, h - 0.05, h + (grand ? 0.38 : rh + 0.08), fz, 'home', stackColor(c));
  if (L >= 1) {
    for (const x of [-0.5, 0, 0.5]) {
      const dz = fz + (D / 2) * 0.42, dy = h + (grand ? 0.3 : rh) * 0.1;
      gb.cbox(x, dy, dz, 0.1, 0.12, 0.12, wall, 0, 0.012);
      gb.gable(x, dy + 0.12, dz, 0.1, 0.13, 0.07, wall, roof, 0.025, true, 0.022);
      win(c, x, dy + 0.025, dz + 0.06, 0.05, 0.065, 'f');
    }
  }
  // the hanging sign, lanterns by the arch, benches and barrels outside
  const sx = -Math.sign(ax) * 0.84;
  gb.box(sx, h * 0.5, ff + 0.06, 0.012, 0.012, 0.12, '#2f2c2a');
  sign(c, sx, h * 0.5 - 0.12, ff + 0.11, 0.11, 0.11, rng.pick(['#7a3a2a', '#2f4a6a', '#3f5a3a']), Math.PI / 2);
  for (const s of [-1, 1]) { gb.glow(2.2, 1.6, 0.8, 3.0); gb.box(ax + s * 0.18, 0.24, ff + 0.03, 0.04, 0.05, 0.04, '#ffe2a0'); gb.noGlow(); }
  bench(c, dx - Math.sign(ax) * 0.26, ff + 0.1, Math.PI);
  barrel(c, -Math.sign(ax) * 0.62, ff + 0.07); barrel(c, -Math.sign(ax) * 0.68, ff + 0.1, 0.9);
  if (grand) {
    // a veranda along the street, and flags on the roof
    for (let i = 0; i < 8; i++) gb.cyl(-W / 2 + 0.1 + (i * (W - 0.2)) / 7, 0, ff + 0.1, 0.012, 0.014, 0.26, 6, '#ece6da');
    gb.box(0, 0.26, ff + 0.06, W - 0.1, 0.02, 0.14, '#ece6da');
    for (const x of [-0.3, 0.3]) { gb.box(x, h + 0.12, fz, 0.01, 0.3, 0.01, '#3a3a3e'); gb.box(x + 0.05, h + 0.34, fz, 0.1, 0.06, 0.004, rng.pick(['#a8473a', '#3f6a8f'])); }
    lamp(c, -0.7, 0.95, 0.3); lamp(c, 0.7, 0.95, 0.3);
  }
  // the yard: stables down both sides...
  const cz = -0.76, cd = 0.32, ch = L ? 0.4 : 0.34;
  const yz0 = cz + cd / 2, sh = L ? 0.46 : 0.28, sd = bf - yz0 - 0.06, szc = (bf + yz0) / 2 - 0.03, timberSide = L ? shade(wall, 0.95) : pal.wood;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.15), w = 0.3, inner = x - (s * w) / 2, face = s > 0 ? 'l' : 'r';
    footing(c, x, szc, w, sd);
    gb.cbox(x, 0, szc, w, sh, sd, timberSide, 0, 0.012);
    gb.gable(x, sh, szc, w, sd, 0.16, timberSide, pal.roof, 0.04, true, 0.03);
    for (let i = 0; i < 4; i++) {
      const z = szc - sd / 2 + (i + 0.5) * (sd / 4);
      plainDoor(c, inner, z, 0.09, 0.17, '#5e432c', face);
      gb.box(inner - s * 0.012, 0.085, z, 0.008, 0.008, 0.095, '#3f342c');
      if (L) win(c, inner, 0.3, z, 0.06, 0.08, face, 0.7);
      else win(c, x + (s * w) / 2, 0.08, z, 0.05, 0.06, s > 0 ? 'r' : 'l', 0.4);
    }
  }
  // ...and the coach house across the back, open to the yard
  footing(c, 0, cz, W, cd);
  gb.box(0, 0, cz - cd / 2 + 0.01, W, ch, 0.02, timberSide);
  for (const s of [-1, 1]) gb.box(s * (W / 2 - 0.01), 0, cz, 0.02, ch, cd, timberSide);
  for (let i = 0; i <= 4; i++) gb.box(-W / 2 + 0.02 + (i * (W - 0.04)) / 4, 0, cz + cd / 2 - 0.02, 0.03, ch, 0.03, '#5e432c');
  gb.box(0, 0.002, cz, W - 0.04, 0.01, cd - 0.04, '#3a3230');
  gb.gable(0, ch, cz, W + 0.02, cd + 0.02, 0.16, timberSide, pal.roof, 0.04, false, 0.03);
  coach(c, -0.215, cz + 0.02, Math.PI / 2, rng.pick(['#3f5466', '#5a2a2a', '#2f4a3a']));
  const e = Math.sign(ax);
  if (L) {
    // a clock turret over the coach house, and a coach ready to leave
    gb.cbox(0, ch + 0.08, cz, 0.1, 0.12, 0.1, '#ece6da', 0, 0.008);
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, ch + 0.14, cz + 0.051, 0.032, 0.032, 0.006, 10, '#efe8da', 0, Math.PI / 2); gb.noGlow();
    gb.roof(0, ch + 0.2, cz, 0.12, 0.12, 0.1, 0, pal.slate);
    gb.box(0, ch + 0.3, cz, 0.008, 0.06, 0.008, '#c9a43a');
    coach(c, -e * 0.04, -0.33, (e * Math.PI) / 2, '#3f5466', true);
  }
  // in the yard: a trough and pump, a horse drinking, hay and barrels
  const tx = -e * 0.45, ty = c.gy(tx, 0.12);
  gb.cbox(tx, ty - 0.01, 0.12, 0.06, 0.05, 0.16, STONE, 0, 0.008);
  gb.box(tx, ty + 0.035, 0.12, 0.045, 0.008, 0.14, POOL);
  gb.cyl(tx, ty, 0.24, 0.014, 0.016, 0.14, 6, '#3a3a3e');
  gb.box(tx + e * 0.02, ty + 0.12, 0.24, 0.05, 0.008, 0.008, '#3a3a3e');
  horse(c, -e * 0.27, 0.12, (-e * Math.PI) / 2, rng.pick(['#7a5232', '#4a3a30', '#c8b8a0']));
  for (let i = 0; i < 3; i++) hayBale(c, e * 0.5, 0.18 - i * 0.08, 0);
  barrel(c, e * 0.52, 0.27); barrel(c, e * 0.46, 0.3, 0.9);
  if (f.turned) gb.pop();
};

// Timber Works: the counting house at the gate, a sawmill (with an engine
// house and a tall stack at Steam Sawmills), drying sheds of planks and a
// yard of logs with a crane.
MODELS.timberworks = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  house(c, {
    x: 0.63, z: 0.67, w: 0.42, d: 0.3, h: 0.3, floors: 1, wall: L ? pal.brick : pal.wall, roof: pal.slate, roofType: 'gable', rh: 0.16,
    nFront: 2, doorX: -0.08, chimney: true, chimneyPos: 'center', fancy: false, lit: 0.8,
  });
  sign(c, 0.63, 0.2, 0.825, 0.24, 0.05, '#3b2f2a');
  // the sawmill, its big doors open to the yard and a louvre on the ridge
  const mx = -0.42, mz = -0.5, mw = 0.96, md = 0.66, mh = L ? 0.6 : 0.46, mf = mz + md / 2;
  worksShed(c, mx, mz, mw, md, mh, 2, L ? pal.brick : pal.wood, pal.slate, 0.24, (u) => Math.abs(u - mx) < 0.2);
  gb.box(mx, 0, mf + 0.004, 0.25, 0.21, 0.01, '#2a2018');
  gb.box(mx + 0.2, 0, mf + 0.012, 0.13, 0.22, 0.01, '#6e5034');
  gb.box(mx + 0.06, 0.225, mf + 0.016, 0.44, 0.012, 0.01, IRON);
  gb.cbox(mx, mh + 0.2, mz, 0.34, 0.06, 0.12, pal.wood, 0, 0.008);
  gb.gable(mx, mh + 0.26, mz, 0.38, 0.14, 0.05, pal.wood, pal.slate, 0.02, false, 0.02);
  if (!L) chimney(c, mx - mw * 0.36, mh - 0.06, mh + 0.34, mz, 'work', '#7f3f2e');
  else {
    // the engine house and its tall stack
    const ex = 0.2, ez = -0.66;
    footing(c, ex, ez, 0.28, 0.36);
    gb.cbox(ex, 0, ez, 0.28, 0.46, 0.36, pal.brick, 0, 0.014);
    gb.hip(ex, 0.46, ez, 0.28, 0.36, 0.12, pal.slate, 0.03);
    for (const z of [ez - 0.08, ez + 0.08]) { win(c, ex + 0.14, 0.14, z, 0.06, 0.18, 'r', 0.9); win(c, ex - 0.14, 0.14, z, 0.06, 0.18, 'l', 0.9); }
    win(c, ex, 0.14, ez + 0.18, 0.08, 0.18, 'f', 0.9);
    gb.cyl(ex, 0, -0.88, 0.05, 0.075, 1.45, 10, '#7f3f2e');
    gb.cyl(ex, 1.45, -0.88, 0.062, 0.062, 0.04, 10, '#5e2e22');
    c.addSmoke(ex, 1.52, -0.88, 'heavy');
  }
  // the drying sheds, open-fronted and stacked with planks
  shed(c, 0.66, -0.5, 0.56, 0.68, 0.36, pal.roof);
  for (const [x, z] of [[0.52, -0.62], [0.8, -0.62], [0.52, -0.38], [0.8, -0.38]]) plankStack(c, x, z, rng.int(3, 5), Math.PI / 2);
  // the yard: logs waiting for the saw, stacks of sawn timber, sawdust
  logs(c, -0.86, 0.06, 4, 0); logs(c, -0.86, 0.34, 3, 0); logs(c, -0.56, 0.2, 4, 0.08);
  for (const [x, z, n] of [[0.0, 0.08, 5], [0.22, 0.08, 4], [0.0, 0.4, 3]]) plankStack(c, x, z, n, Math.PI / 2);
  gb.blob(-0.08, c.gy(-0.08, -0.08), -0.08, 0.1, 0.05, 0.08, '#d4bc88');
  gb.blob(0.32, c.gy(0.32, 0.36), 0.36, 0.06, 0.03, 0.05, '#d4bc88');
  sawhorse(c, -0.3, 0.52, 0.4); sawhorse(c, 0.36, -0.08, -0.2);
  const by = c.gy(0.4, 0.42);
  gb.cbox(0.4, by, 0.42, 0.18, 0.06, 0.08, '#7a5a3c', 0, 0.006);
  gb.cyl(0.4, by + 0.06, 0.42, 0.04, 0.04, 0.006, 12, '#b8b8bc', 0, 0, Math.PI / 2);
  if (L) {
    // a gantry crane over the log pile
    for (const x of [-0.9, -0.36]) {
      const y = c.gy(x, 0.2);
      for (const a of [-0.25, 0.25]) gb.boxC(x, y + 0.31, 0.2, 0.016, 0.64, 0.016, '#5e432c', a, 0, 0);
    }
    gb.box(-0.63, c.gy(-0.63, 0.2) + 0.6, 0.2, 0.62, 0.03, 0.03, '#3a3a3e');
    gb.box(-0.6, c.gy(-0.6, 0.2) + 0.58, 0.2, 0.06, 0.03, 0.05, '#c09040');
    gb.box(-0.6, c.gy(-0.6, 0.2) + 0.36, 0.2, 0.004, 0.22, 0.004, '#d9cfb4');
    gb.cyl(-0.7, c.gy(-0.6, 0.2) + 0.33, 0.2, 0.024, 0.024, 0.2, 6, '#7d5b3b', 0, 0, Math.PI / 2);
    lamp(c, 0.12, 0.88, 0.3); lamp(c, 0.38, 0.88, 0.3);
  } else ginPole(c, -0.66, 0.5, 0.62, Math.PI / 2);
  // a timber wagon by the gate, the size of the carts on the roads
  const wx = 0.04, wz = 0.72, wy = c.gy(wx, wz);
  gb.push(wx, wy, wz, 0.1);
  gb.cbox(0, 0.045, 0, 0.16, 0.035, 0.34, '#86663f', 0, 0.006);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl(sx * 0.09, 0.045, sz * 0.11, 0.045, 0.045, 0.015, 8, '#4e3a2a', 0, 0, Math.PI / 2);
  for (const sx of [-0.045, 0, 0.045]) gb.cyl(sx, 0.1, -0.16, 0.022, 0.022, 0.32, 6, '#7d5b3b', 0, Math.PI / 2);
  gb.box(0, 0.08, 0.2, 0.014, 0.014, 0.1, '#5b4231');
  gb.pop();
  fence(c, -0.95, -0.95, 0.95, 0.95, FENCE, { x: 0.25, z: 0.95, w: 0.14 });
  if (f.turned) gb.pop();
};

// Cathedral Close: the cathedral down one side of the plot, its west front
// and towers on the street, and the school and deanery round a green close.
MODELS.cathedralclose = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const stone = pal.stoneWall, roof = pal.slate, dark = shade(stone, 0.8);
  const side = rng.chance(0.5) ? 1 : -1, cx = -side * 0.46;
  const nw = 0.4, nh = L ? 0.62 : 0.52, nd = 1.08, nz = -0.1, wz = nz + nd / 2, zc = nz - nd / 2 + 0.3;
  // the west door first: it is the way in
  door(c, cx, wz, 0.12, 0.22, '#4e3424');
  footing(c, cx, nz, nw + 0.24, nd);
  gb.cbox(cx, 0, nz, nw, nh, nd, stone, 0, 0.02);
  gb.gable(cx, nh, nz, nw, nd, 0.32, stone, roof, 0.05, true, 0.035);
  // aisles under lean-to roofs, coloured glass and buttresses down the sides
  for (const s of [-1, 1]) {
    const ax = cx + s * (nw / 2 + 0.06), ah = nh * 0.55;
    gb.cbox(ax, 0, nz + 0.02, 0.12, ah, nd - 0.16, stone, 0, 0.012);
    gb.wedge(ax, ah, nz + 0.02, nd - 0.12, 0.16, 0.08, roof, (s * Math.PI) / 2);
    for (let i = 0; i < 5; i++) {
      const z = nz - nd / 2 + 0.16 + (i * (nd - 0.3)) / 4;
      if (Math.abs(z - zc) < 0.16) continue;
      stainedGlass(c, ax + s * 0.062, 0.08, z, 0.05, ah * 0.6, i + (s > 0 ? 0 : 1), 'r');
      stainedGlass(c, cx + s * (nw / 2 + 0.007), ah + 0.07, z, 0.05, (nh - ah) * 0.6, i + 2, 'r');
      gb.cbox(ax + s * 0.07, 0, z + 0.1, 0.04, ah * 0.85, 0.05, dark, 0, 0.008);
    }
  }
  // the transepts and the crossing tower (a spire on the Cathedral Close)
  const tw = 0.84;
  footing(c, cx, zc, tw, 0.32);
  gb.cbox(cx, 0, zc, tw, nh, 0.32, stone, 0, 0.016);
  gb.gable(cx, nh, zc, tw, 0.32, 0.3, stone, roof, 0.05, false, 0.035);
  for (const s of [-1, 1]) roseWindow(c, cx + s * (tw / 2 + 0.002), nh * 0.62, zc, 0.07, s);
  const ct = nh + (L ? 0.62 : 0.36);
  gb.cbox(cx, nh, zc, 0.26, ct - nh, 0.26, stone, 0, 0.012);
  for (const [fx, fz] of [[0, 0.131], [0.131, 0], [-0.131, 0], [0, -0.131]]) gb.box(cx + fx, ct - 0.2, zc + fz, Math.abs(fz) ? 0.06 : 0.01, 0.13, Math.abs(fx) ? 0.06 : 0.01, '#2a2826');
  parapet(c, cx, ct, zc, 0.26, 0.26, stone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cone(cx + sx * 0.11, ct + 0.02, zc + sz * 0.11, 0.025, 0.14, 6, roof);
  if (L) { gb.cone(cx, ct, zc, 0.12, 0.62, 8, roof, Math.PI / 8); gb.box(cx, ct + 0.62, zc, 0.01, 0.07, 0.01, '#c9a43a'); }
  // the choir and its round apse at the east end
  gb.cbox(cx, 0, -0.7, 0.34, nh * 0.9, 0.18, stone, 0, 0.012);
  gb.gable(cx, nh * 0.9, -0.7, 0.34, 0.18, 0.24, stone, roof, 0.04, true, 0.03);
  gb.cyl(cx, 0, -0.79, 0.16, 0.16, nh * 0.85, 10, stone);
  gb.cone(cx, nh * 0.85, -0.79, 0.18, 0.2, 10, roof);
  for (const a of [-0.7, 0, 0.7]) stainedGlass(c, cx + Math.sin(a) * 0.165, 0.12, -0.79 - Math.cos(a) * 0.165, 0.04, nh * 0.42, 1, 'b', -a);
  // the west front: two towers, a rose window over the door
  const th = L ? 1.3 : 1.06;
  for (const s of [-1, 1]) {
    const tx = cx + s * 0.19, tz = wz - 0.04;
    footing(c, tx, tz, 0.17, 0.17);
    gb.cbox(tx, 0, tz, 0.17, th, 0.17, stone, 0, 0.014);
    gb.box(tx, th * 0.7, tz + 0.086, 0.05, 0.13, 0.012, '#2a2826');
    gb.box(tx + s * 0.086, th * 0.7, tz, 0.012, 0.13, 0.05, '#2a2826');
    if (L) gb.cone(tx, th, tz, 0.12, 0.42, 8, roof, Math.PI / 8);
    else { parapet(c, tx, th, tz, 0.17, 0.17, stone); for (const a of [-1, 1]) for (const b2 of [-1, 1]) gb.cone(tx + a * 0.07, th + 0.02, tz + b2 * 0.07, 0.022, 0.12, 6, roof); }
  }
  roseWindow(c, cx, nh * 0.66, wz, 0.08);
  gb.box(cx, 0.22, wz + 0.006, 0.16, 0.05, 0.012, dark);
  // the school down the far side of the close, a bellcote on its roof
  const sx = side * 0.76, sh = L ? 0.78 : 0.52;
  house(c, {
    x: sx, z: -0.1, ry: (-side * Math.PI) / 2, w: 0.96, d: 0.32, h: sh, floors: L ? 3 : 2, wall: stone, roof, roofType: 'gable', rh: 0.22,
    nFront: 5, doorX: 0, doorW: 0.1, chimney: true, chimneyPos: 'ends', plinth: STONE, fancy: false, lit: 0.85,
  });
  gb.cbox(sx, sh + 0.12, -0.1, 0.08, 0.12, 0.08, stone, 0, 0.006);
  gb.roof(sx, sh + 0.24, -0.1, 0.11, 0.11, 0.08, 0, roof);
  gb.box(sx, sh + 0.15, -0.1, 0.03, 0.04, 0.09, '#c9a43a');
  // the deanery across the back
  house(c, { x: side * 0.32, z: -0.76, w: 0.44, d: 0.3, h: 0.46, floors: 2, wall: pal.wall, roof: pal.roof, roofType: 'gable', rh: 0.22, nFront: 3, doorX: 0, chimney: true, chimneyPos: 'ends', plinth: STONE });
  // the green: lawn, paths, trees, the old graves by the church
  const gx = side * 0.3;
  gb.box(gx, c.gy(gx, 0.15) - 0.008, 0.15, 0.56, 0.012, 1.4, LAWN_G);
  gravel(c, gx, 0.62, 0.56, 0.08);
  gravel(c, gx, 0.79, 0.08, 0.34);
  gravel(c, side * 0.5, 0.2, 0.08, 0.84);
  gravel(c, cx, 0.75, 0.42, 0.4, '#b8b0a2');
  smallTree(c, side * 0.18, 0.3, 1.1); smallTree(c, side * 0.4, -0.38, 1);
  for (let i = 0; i < 6; i++) { const x = side * (0.06 + (i % 2) * 0.08), z = -0.42 + Math.floor(i / 2) * 0.16; gb.cbox(x, c.gy(x, z) - 0.01, z, 0.05, 0.07, 0.016, '#a39e94', 0, 0.006); }
  bench(c, side * 0.32, 0.5, Math.PI); bench(c, side * 0.12, -0.1, side > 0 ? -Math.PI / 2 : Math.PI / 2);
  frontage(c, side > 0 ? 0.0 : -0.95, side > 0 ? 0.95 : 0.0, 0.95, [gx], L ? 'railings' : 'wall');
  if (L) {
    // a covered walk along the cathedral where it faces the close
    const px = cx + side * 0.4;
    for (let i = 0; i < 6; i++) gb.box(px, 0, nz - 0.4 + i * 0.16, 0.014, 0.2, 0.014, '#cfc6b4');
    gb.wedge(px - side * 0.04, 0.2, nz, 0.9, 0.12, 0.05, roof, (side * Math.PI) / 2);
    lamp(c, cx - 0.2, 0.92, 0.3); lamp(c, cx + 0.2, 0.92, 0.3);
  }
  if (f.turned) gb.pop();
};

// Infirmary Court: a gatehouse under a red cross, rooms round a garden court,
// the ward block and its chapel across the back.
MODELS.infirmary = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  const wall = L ? pal.stoneWall : pal.wall, roof = L ? pal.slate : pal.roof, RD = 0.32, fh = 0.28, floors = L ? 2 : 1, h = floors * fh;
  const W = 1.84, fz = 0.66, gw = 0.34, gd = RD + 0.08, gh = h + 0.26, gf = fz + gd / 2;
  const wz = -0.72, wf = wz + 0.18, sz0 = fz - RD / 2;   // the ward block's court face, the street range's
  footing(c, 0, fz, gw, gd);
  gb.cbox(0, 0, fz, gw, gh, gd, '#ebe4d6', 0, 0.016);
  gb.hip(0, gh, fz, gw, gd, 0.16, roof, 0.04);
  door(c, 0, gf, 0.11, 0.19, '#3f4f5a');
  plainDoor(c, 0, fz - gd / 2, 0.11, 0.19, '#3f4f5a', 'b');
  gb.box(0, 0.25, gf + 0.002, 0.09, 0.09, 0.008, '#c8423a');
  gb.box(0, 0.28, gf + 0.006, 0.006, 0.07, 0.006, '#f2ede0'); gb.box(0, 0.31, gf + 0.006, 0.07, 0.006, 0.006, '#f2ede0');
  for (const s of [-1, 1]) win(c, s * 0.09, gh - 0.17, gf, 0.065, 0.09, 'f', 0.9);
  if (L) {
    gb.cbox(0, gh + 0.12, fz, 0.1, 0.1, 0.1, '#ebe4d6', 0, 0.008);
    gb.glow(1.2, 1.1, 0.8, 1.02); gb.cyl(0, gh + 0.17, fz + 0.051, 0.03, 0.03, 0.006, 10, '#efe8da', 0, Math.PI / 2); gb.noGlow();
    gb.roof(0, gh + 0.22, fz, 0.12, 0.12, 0.09, 0, pal.slate);
  }
  // rooms on the street either side of the gate, and down both sides
  for (const s of [-1, 1]) {
    const len = W / 2 - gw / 2;
    courtRange(c, s * (gw / 2 + len / 2), fz, len, RD, h, floors, wall, roof, false, -1, 3, true);
    courtRange(c, s * (W / 2 - RD / 2), (wf + sz0) / 2, sz0 - wf, RD, h, floors, wall, roof, true, -s, 4, true);
  }
  // the ward block across the back, its chapel reaching into the court
  house(c, {
    x: 0, z: wz, w: W, d: 0.36, h: L ? 0.84 : 0.56, floors: L ? 3 : 2, wall: L ? pal.stoneWall : '#ebe4d6', roof, roofType: 'hip', rh: 0.22,
    noDoor: true, nFront: 9, fancy: false, chimney: true, chimneyPos: 'ends', plinth: STONE, lit: 0.85,
  });
  const chz = -0.44, chh = L ? 0.5 : 0.42;
  gb.cbox(0, 0, chz, 0.24, chh, 0.2, '#ebe4d6', 0, 0.012);
  gb.gable(0, chh, chz, 0.24, 0.2, 0.18, '#ebe4d6', roof, 0.04, true, 0.03);
  stainedGlass(c, 0, 0.12, chz + 0.102, 0.05, chh * 0.5, 0, 'f');
  for (const s of [-1, 1]) stainedGlass(c, s * 0.122, 0.12, chz, 0.04, chh * 0.4, 1, 'r');
  gb.cbox(0, chh + 0.1, chz + 0.06, 0.06, 0.08, 0.04, '#ebe4d6', 0, 0.006);
  gb.box(0, chh + 0.18, chz + 0.06, 0.008, 0.06, 0.008, '#c9a43a');
  // the garden court: lawn and walks, beds, benches, a well (a fountain later)
  const gy = c.gy(0, 0.0), cd = sz0 - wf - 0.04;
  gb.box(0, gy - 0.008, (wf + sz0) / 2, 1.16, 0.012, cd, LAWN_G);
  gb.box(0, gy - 0.004, (wf + sz0) / 2, 0.08, 0.012, cd, GRAVEL);
  gb.box(0, gy - 0.004, 0.1, 1.16, 0.012, 0.08, GRAVEL);
  if (L) basin(c, 0, 0.1, 0.08, 0.1);
  else {
    gb.cyl(0, gy - 0.02, 0.1, 0.06, 0.07, 0.08, 10, STONE);
    for (const s of [-1, 1]) gb.box(s * 0.05, gy + 0.06, 0.1, 0.012, 0.14, 0.012, '#4e3a2a');
    gb.gable(0, gy + 0.2, 0.1, 0.14, 0.12, 0.05, '#6e4a2c', '#8a432e', 0.02);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) flowers(c, sx * 0.3, 0.1 + sz * 0.26, 6, 0.08);
  smallTree(c, -0.42, -0.2, 0.9); smallTree(c, 0.42, 0.4, 0.85);
  vegPatch(c, 0.38, -0.22);
  bench(c, -0.18, 0.42, Math.PI); bench(c, 0.18, -0.22, 0);
  if (L) {
    lamp(c, -0.24, 0.96, 0.3); lamp(c, 0.24, 0.96, 0.3);
  }
  if (f.turned) gb.pop();
};

// College Quad: a gate tower on the street, battlemented ranges round a
// lawned quadrangle, the chapel down one side, the library down the other
// and the great hall across the back.
MODELS.collegequad = (c, L) => {
  const { gb, rng, pal } = c;
  const f = rowFrame(c);
  c.arched = true;
  const stone = pal.stoneWall, roof = pal.slate, dark = shade(stone, 0.85);
  const floors = L ? 3 : 2, fh = 0.26, h = floors * fh, RD = 0.32, W = 1.84, fz = 0.64;
  // the gate tower, its arch the way into the quad
  const gw = 0.36, gd = RD + 0.1, gh = h + (L ? 0.48 : 0.34), gf = fz + gd / 2;
  footing(c, 0, fz, gw, gd);
  gb.cbox(0, 0, fz, gw, gh, gd, stone, 0, 0.016);
  gb.cyl(0, 0.2, gf + 0.002, 0.1, 0.1, 0.01, 12, dark, 0, Math.PI / 2);
  door(c, 0, gf, 0.14, 0.2, '#4e3424');
  plainDoor(c, 0, fz - gd / 2, 0.14, 0.2, '#4e3424', 'b');
  gb.cbox(0, 0.32, gf + 0.03, 0.16, 0.16, 0.06, stone, 0, 0.008);
  gb.glow(WARM[0], WARM[1], WARM[2], 1.3); gb.box(0, 0.35, gf + 0.062, 0.12, 0.1, 0.006, GLASS); gb.noGlow();
  for (let k = 1; k < floors + 1; k++) win(c, 0, k * fh + 0.1, gf, 0.07, 0.1, 'f', 0.85);
  parapet(c, 0, gh, fz, gw, gd, stone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (gw / 2), z = fz + sz * (gd / 2);
    gb.cyl(x, 0, z, 0.05, 0.055, gh + 0.12, 8, stone);
    gb.cone(x, gh + 0.12, z, 0.06, 0.14, 8, roof);
  }
  if (L) {
    // a lantern and an ogee dome over the gate (the Great Quadrangle's tower)
    gb.cyl(0, gh, fz, 0.12, 0.12, 0.2, 8, stone);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; gb.glow(WARM[0], WARM[1], WARM[2], 1.2); gb.box(Math.cos(a) * 0.115, gh + 0.06, fz + Math.sin(a) * 0.115, 0.03, 0.09, 0.03, GLASS, -a); gb.noGlow(); }
    gb.sphere(0, gh + 0.24, fz, 0.13, roof, 1, 1.15);
    gb.cone(0, gh + 0.36, fz, 0.05, 0.14, 8, roof);
    gb.sphere(0, gh + 0.51, fz, 0.018, '#d9b84a', 0);
  }
  // the ranges on the street, either side of the gate
  for (const s of [-1, 1]) {
    const len = W / 2 - gw / 2, x = s * (gw / 2 + len / 2);
    courtRange(c, x, fz, len, RD, h, floors, stone, roof, false, 0, 4, false, 0.14);
    battlements(c, x, h, fz + RD / 2 - 0.02, len, false, stone);
    battlements(c, x, h, fz - RD / 2 + 0.02, len, false, stone);
  }
  // the chapel down one side: tall coloured windows, buttresses, a slender spire
  const side = rng.chance(0.5) ? 1 : -1, qz0 = -0.56, qz1 = fz - RD / 2, sl = qz1 - qz0, szc = (qz0 + qz1) / 2;
  const chx = side * (W / 2 - RD / 2), chh = L ? 0.74 : 0.62;
  footing(c, chx, szc, RD, sl);
  gb.cbox(chx, 0, szc, RD, chh, sl, stone, 0, 0.016);
  gb.gable(chx, chh, szc, RD, sl, 0.3, stone, roof, 0.05, true, 0.035);
  for (let i = 0; i < 5; i++) {
    const z = szc - sl / 2 + (i + 0.5) * (sl / 5);
    for (const s of [-1, 1]) {
      stainedGlass(c, chx + s * (RD / 2 + 0.007), 0.14, z, 0.05, chh * 0.6, i + (s > 0 ? 0 : 1), 'r');
      if (i < 4) gb.cbox(chx + s * (RD / 2 + 0.02), 0, z + sl / 10, 0.04, chh * 0.8, 0.05, dark, 0, 0.008);
    }
  }
  gb.cbox(chx, chh + 0.24, szc, 0.06, 0.1, 0.06, stone, 0, 0.006);
  gb.cone(chx, chh + 0.34, szc, 0.05, 0.3, 6, roof);
  // the library down the other side
  courtRange(c, -side * (W / 2 - RD / 2), szc, sl, RD, h, floors, stone, roof, true, 0, 5, false, 0.14);
  for (const s of [-1, 1]) battlements(c, -side * (W / 2 - RD / 2) + s * (RD / 2 - 0.02), h, szc, sl, true, stone);
  // the great hall across the back, a louvre on its ridge and an oriel at the dais
  const hz = -0.74, hd = 0.36, hh = L ? 0.86 : 0.7, hw = 1.24, hx = side * 0.3;
  footing(c, hx, hz, hw, hd);
  gb.cbox(hx, 0, hz, hw, hh, hd, stone, 0, 0.018);
  gb.gable(hx, hh, hz, hw, hd, 0.32, stone, roof, 0.05, false, 0.035);
  for (let i = 0; i < 6; i++) {
    const x = hx - hw / 2 + (i + 0.5) * (hw / 6);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.2 + rng.float(0, 0.5));
    gb.box(x, 0.2, hz + hd / 2 + 0.006, 0.06, hh * 0.55, 0.014, GLASS);
    gb.box(x, 0.2, hz - hd / 2 - 0.006, 0.06, hh * 0.55, 0.014, GLASS);
    gb.noGlow();
    if (i < 5) gb.cbox(x + hw / 12, 0, hz + hd / 2 + 0.02, 0.05, hh * 0.85, 0.04, dark, 0, 0.008);
  }
  gb.cbox(hx, hh + 0.24, hz, 0.12, 0.1, 0.12, stone, 0, 0.008);
  gb.roof(hx, hh + 0.34, hz, 0.15, 0.15, 0.12, 0, roof);
  gb.cbox(hx - side * (hw / 2 - 0.1), 0.18, hz + hd / 2 + 0.05, 0.14, 0.34, 0.1, stone, 0, 0.008);
  gb.glow(WARM[0], WARM[1], WARM[2], 1.4); gb.box(hx - side * (hw / 2 - 0.1), 0.22, hz + hd / 2 + 0.102, 0.1, 0.26, 0.006, GLASS); gb.noGlow();
  // the master's lodge in the last corner, a stack in the middle of its ridge
  house(c, {
    x: -side * 0.74, z: hz, w: 0.34, d: hd, h: L ? 0.72 : 0.52, floors: L ? 3 : 2, wall: stone, roof, roofType: 'gable', rh: 0.22, alongZ: true,
    noDoor: true, nFront: 1, chimney: true, chimneyPos: 'center', fancy: false, lit: 0.85,
  });
  // the quad: a lawn not to be walked on, paths round it and across
  const qw = W - 2 * RD - 0.06, qd = sl - 0.06, qzc = szc + 0.02, gy = c.gy(0, qzc);
  gb.box(0, gy - 0.008, qzc, qw, 0.012, qd, LAWN_G);
  gb.box(0, gy - 0.004, qzc, qw, 0.012, 0.06, GRAVEL);
  gb.box(0, gy - 0.004, qzc, 0.06, 0.012, qd, GRAVEL);
  if (L) basin(c, 0, qzc, 0.1, 0.12);
  else {
    gb.cbox(0, gy - 0.01, qzc, 0.06, 0.12, 0.06, STONE, 0, 0.008);
    gb.cyl(0, gy + 0.11, qzc, 0.04, 0.04, 0.008, 10, '#c9a43a');
  }
  bench(c, -0.32, qzc - 0.4, 0); bench(c, 0.32, qzc + 0.4, Math.PI);
  lamp(c, -0.3, 0.96, 0.3); lamp(c, 0.3, 0.96, 0.3);
  if (f.turned) gb.pop();
};

// Landscape Park: a lake with an island and a boat, an avenue of trees up to
// a temple on the rise, a winding walk, clumps of trees round the edge (a
// bandstand, a palm house and a fountain in the lake at the Royal Park).
MODELS.landscapepark = (c, L) => {
  const { gb, rng } = c;
  const f = rowFrame(c);
  const side = rng.chance(0.5) ? 1 : -1;
  // the lake: overlapping pools, their water as low as the ground under them
  const lx = side * 0.36, lz = -0.3;
  const pools = [[0, 0, 0.3], [side * 0.22, 0.14, 0.2], [-side * 0.2, -0.12, 0.19], [side * 0.06, -0.3, 0.17]];
  let ly = Infinity;
  for (const [px, pz, r] of pools) for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) ly = Math.min(ly, c.gy(lx + px + ox, lz + pz + oz));
  for (const [px, pz, r] of pools) gb.cyl(lx + px, ly - 0.05, lz + pz, r + 0.03, r + 0.035, 0.05, 16, '#6f8a4a');
  for (const [px, pz, r] of pools) gb.cyl(lx + px, ly - 0.03, lz + pz, r, r, 0.035, 16, POOL);
  gb.blob(lx - side * 0.04, ly - 0.01, lz - 0.02, 0.07, 0.035, 0.06, '#6f8a4a');
  gb.cyl(lx - side * 0.04, ly, lz - 0.02, 0.012, 0.016, 0.14, 5, '#5e432c');
  gb.sphere(lx - side * 0.04, ly + 0.17, lz - 0.02, 0.07, rng.pick(LEAF), 1);
  // a jetty and a rowing boat on the near shore
  const jz = lz + 0.28, jy = ly + 0.008;
  gb.box(lx + side * 0.04, jy, jz, 0.09, 0.012, 0.2, '#8a6a48');
  for (const s of [-1, 1]) gb.box(lx + side * 0.04 + s * 0.04, jy - 0.04, jz - 0.08, 0.014, 0.05, 0.014, '#5e432c');
  gb.push(lx + side * 0.17, jy - 0.004, jz - 0.04, 0.3);
  gb.roof(0, 0, 0, 0.1, 0.26, 0.05, 0, '#6e4a2c', 0);
  gb.box(0, 0, 0, 0.09, 0.03, 0.2, '#7d5b3b');
  gb.box(0, 0.03, 0, 0.08, 0.008, 0.02, '#4a3a2c');
  gb.pop();
  if (L) { c.fountain = [lx, ly + 0.08, lz]; gb.cyl(lx, ly - 0.01, lz, 0.03, 0.04, 0.04, 8, STONE); }
  // the avenue from the gate up to the temple on the rise
  const ax = -side * 0.52;
  gravel(c, ax, 0.28, 0.1, 1.36);
  const pairs = L ? [0.78, 0.5, 0.22, -0.06] : [0.72, 0.4, 0.08];
  for (const z of pairs) for (const s of [-1, 1]) smallTree(c, ax + s * 0.15, z, rng.float(0.95, 1.15));
  if (L) for (const z of [0.64, 0.36]) for (const s of [-1, 1]) { const x = ax + s * 0.1, y = c.gy(x, z); gb.cbox(x, y - 0.01, z, 0.04, 0.06, 0.04, STONE, 0, 0.006); gb.cyl(x, y + 0.05, z, 0.01, 0.014, 0.07, 6, '#d8d2c4'); }
  const tx = ax, tz = -0.58, ty = c.gy(tx, tz);
  gb.cyl(tx, ty - 0.03, tz, 0.17, 0.19, 0.07, 12, STONE);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; gb.cyl(tx + Math.cos(a) * 0.13, ty + 0.04, tz + Math.sin(a) * 0.13, 0.013, 0.016, 0.3, 6, '#ece6da'); }
  gb.cyl(tx, ty + 0.34, tz, 0.16, 0.16, 0.035, 12, '#ece6da');
  gb.sphere(tx, ty + 0.375, tz, 0.15, '#8fa89a', 1, 0.6);
  gb.cyl(tx, ty + 0.46, tz, 0.012, 0.012, 0.05, 6, '#ece6da');
  gb.cbox(tx, ty + 0.04, tz, 0.05, 0.05, 0.05, STONE, 0, 0.006);
  gb.cyl(tx, ty + 0.09, tz, 0.016, 0.022, 0.1, 6, '#d8d2c4');
  gb.sphere(tx, ty + 0.205, tz, 0.018, '#d8d2c4', 0);
  // a winding walk from the avenue round the near side of the lake
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = ax + side * (0.12 + t * 0.9), z = 0.3 + Math.sin(t * Math.PI) * 0.12 - t * 0.12;
    const dz = 0.12 * Math.PI * Math.cos(t * Math.PI) - 0.12;
    gb.box(x, c.gy(x, z) - 0.006, z, 0.14, 0.012, 0.08, GRAVEL, Math.atan2(-dz, 0.9 * side));
  }
  for (const [x, z, ry] of [[lx - side * 0.1, 0.12, Math.PI], [lx + side * 0.3, 0.2, Math.PI], [ax + side * 0.1, -0.3, (-side * Math.PI) / 2]]) bench(c, x, z, ry);
  // clumps of trees round the edge, a shrub beside each
  const clumps = [[side * 0.74, -0.76, 1], [side * 0.04, -0.8, 1.1], [-side * 0.78, -0.82, 1], [-side * 0.08, 0.8, 1], [side * 0.78, 0.12, 1]];
  if (!L) clumps.push([side * 0.76, 0.5, 1.2], [side * 0.56, 0.76, 1.1]);
  for (const [x, z, s] of clumps) {
    smallTree(c, x, z, s * rng.float(0.95, 1.1));
    bush(c, x - Math.sign(x) * 0.13, z - Math.sign(z) * 0.08, rng.float(0.8, 1.1));
  }
  flowers(c, ax + side * 0.2, 0.82, 7, 0.07); flowers(c, ax - side * 0.2, 0.84, 6, 0.06);
  if (L) {
    // a bandstand on the lawn and a palm house in the corner by the lake
    const bx = side * 0.15, bz = 0.6, by = c.gy(bx, bz);
    gb.cyl(bx, by - 0.01, bz, 0.13, 0.14, 0.05, 8, STONE);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; gb.box(bx + Math.cos(a) * 0.11, by + 0.04, bz + Math.sin(a) * 0.11, 0.01, 0.16, 0.01, '#ece4d4'); }
    gb.cone(bx, by + 0.2, bz, 0.16, 0.1, 8, '#3f5a46');
    const px = side * 0.78, pz = 0.64, py = c.gy(px, pz);
    gb.cbox(px, py - 0.01, pz, 0.2, 0.04, 0.4, STONE, 0, 0.008);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.3); gb.box(px, py + 0.03, pz, 0.18, 0.14, 0.38, '#9fbcc0'); gb.noGlow();
    gb.cyl(px, py + 0.17, pz - 0.19, 0.09, 0.09, 0.38, 10, '#c8dadc', 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) gb.sphere(px, py + 0.1, pz - 0.12 + i * 0.12, 0.04, rng.pick(LEAF), 0);
    smallTree(c, side * 0.5, 0.82, 0.9);
    for (const z of [0.9, 0.08]) for (const s of [-1, 1]) lamp(c, ax + s * 0.08, z, 0.3);
  }
  // a hedge round the park, gate piers at the avenue
  frontage(c, -0.96, 0.96, 0.95, [ax], L ? 'railings' : 'hedge');
  gatePiers(c, ax, 0.95, 0.16);
  hedge(c, 0, -0.95, 1.9, 0.05); hedge(c, -0.95, 0, 0.05, 1.86); hedge(c, 0.95, 0, 0.05, 1.86);
  if (f.turned) gb.pop();
};

// ------------------------------------------------- side-branch buildings

MODELS.foundry = (c, L) => {
  const { gb, pal } = c;
  // a tall brick casting shed, a cupola furnace and stacks of iron
  house(c, { x: -0.08, z: -0.14, w: 0.7, d: 0.52, h: L ? 0.6 : 0.48, wall: L ? '#6a4a3a' : pal.brick, roof: '#3f3f44', roofType: 'gable', rh: 0.2, nFront: 3, doorX: 0, doorW: 0.16, chimney: false, fancy: false, lit: 1 });
  const stacks = L ? [[-0.34, -0.36], [0.3, -0.36]] : [[-0.34, -0.36]];
  for (const [x, z] of stacks) { gb.cyl(x, 0.2, z, 0.05, 0.07, (L ? 1.3 : 1.05) - 0.2, 10, '#5e2e22'); c.addSmoke(x, L ? 1.35 : 1.1, z, 'heavy'); }
  gb.cyl(0.36, 0, 0.1, 0.1, 0.12, 0.4, 10, '#4a4a4e');
  gb.glow(2.4, 1.2, 0.3, 2.0); gb.box(0.36, 0.06, 0.2, 0.08, 0.08, 0.02, '#ff9a40'); gb.noGlow();
  c.addGlow(0.36, 0.1, 0.22, 'forge');
  for (let i = 0; i < 3; i++) gb.box(-0.3 + i * 0.12, c.gy(-0.3 + i * 0.12, 0.38), 0.38, 0.1, 0.03 + i * 0.01, 0.06, '#5a5a5e');
  gb.blob(0.1, c.gy(0.1, 0.4), 0.4, 0.12, 0.05, 0.08, '#2a2826');
};

MODELS.orchard = (c, L) => {
  const { gb, rng, pal } = c;
  // rows of fruit trees, a cider mill with a press, and barrels
  house(c, { x: 0.44, z: -0.5, w: 0.62, d: 0.46, h: L ? 0.48 : 0.36, floors: L ? 2 : 1, wall: pal.wall, roof: pal.thatched ? pal.thatch : pal.roof, roofType: pal.thatched ? 'thatch' : 'gable', rh: 0.24, nFront: 2, doorX: 0, chimney: true, timber: pal.timber });
  const fruit = rng.pick(['#c8402f', '#e0b030', '#9ab830']);
  for (let row = 0; row < 4; row++) for (let i = 0; i < (row < 2 ? 3 : 5); i++) {
    const x = -0.82 + i * (row < 2 ? 0.28 : 0.38), z = -0.75 + row * 0.42;
    if (row < 2 && x > -0.05) continue;
    const y = c.gy(x, z);
    gb.cyl(x, y, z, 0.014, 0.018, 0.12, 5, '#6e5034');
    gb.blob(x, y + 0.1, z, 0.1, 0.08, 0.1, rng.pick(LEAF));
    for (let k = 0; k < 3; k++) gb.sphere(x + rng.float(-0.06, 0.06), y + 0.14 + rng.float(-0.02, 0.03), z + rng.float(-0.06, 0.06), 0.014, fruit, 0);
  }
  for (let i = 0; i < (L ? 6 : 3); i++) barrel(c, 0.2 + (i % 3) * 0.08, -0.18 + Math.floor(i / 3) * 0.08);
  gb.box(0.72, c.gy(0.72, -0.18), -0.18, 0.12, 0.14, 0.12, '#7a5a3c');
  gb.cyl(0.72, c.gy(0.72, -0.18) + 0.14, -0.18, 0.012, 0.012, 0.1, 6, '#3a2f28');
  fence(c, -0.96, -0.96, 0.96, 0.96, FENCE, { x: 0, z: 0.96, w: 0.12 });
  c.work = [-0.88, -0.88, 0.0, 0.88];
};

MODELS.papermill = (c, L) => {
  const { gb, pal } = c;
  // a long mill with a water wheel and drying lofts
  house(c, { x: -0.04, z: -0.12, w: 0.76, d: 0.48, h: L ? 0.62 : 0.5, floors: 2, wall: L ? pal.brick : pal.wall, roof: pal.slate, roofType: 'gable', rh: 0.22, nFront: 4, doorX: 0, chimney: false, fancy: false, lit: 0.9 });
  chimney(c, -0.3, 0.4, 0.95, -0.28, 'work', '#7f3f2e');
  for (let i = 0; i < 4; i++) gb.box(-0.3 + i * 0.2, L ? 0.62 : 0.5, 0.13, 0.12, 0.05, 0.015, '#e8e0cc');
  const wheel = new GeoBuilder();
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; wheel.boxC(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0, 0.12, 0.02, 0.07, '#6e5034', 0, 0, a + Math.PI / 2); wheel.boxC(Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0, 0.15, 0.012, 0.012, '#5e432c', 0, 0, a); }
  c.spin = { geo: wheel.build(), x: 0.42, y: 0.15, z: -0.1, speed: 0.6, ry: Math.PI / 2 };
  for (let i = 0; i < 3; i++) crate(c, -0.36 + i * 0.09, 0.4, 0.9, '#e8e0cc');
  sign(c, -0.04, 0.3, 0.125, 0.24, 0.05, '#3b2f2a');
};

MODELS.musichall = (c, L) => {
  const { gb, rng, pal } = c;
  const wall = L ? '#ebe4d6' : pal.wall, trim = '#e3dccd';
  // a gaily painted hall with a lit marquee and posters
  house(c, { z: -0.12, w: 0.82, d: 0.56, h: L ? 0.7 : 0.54, floors: 2, wall, roof: pal.slate, roofType: L ? 'hip' : 'gable', rh: 0.24, nFront: 3, doorX: 0, doorW: 0.16, chimney: false, fancy: false, lit: 1 });
  gb.box(0, 0.26, 0.2, 0.6, 0.03, 0.14, '#3a2f28');
  gb.glow(2.2, 1.6, 0.6, 3.0);
  for (let i = 0; i < 9; i++) gb.sphere(-0.28 + i * 0.07, 0.285, 0.27, 0.012, '#ffe2a0', 0);
  gb.noGlow();
  gb.box(0, 0.32, 0.17, 0.5, 0.08, 0.012, rng.pick(['#7a2a5a', '#2a3a7a', '#7a2a2a']));
  gb.glow(1.8, 1.4, 0.6, 3.1); gb.box(0, 0.335, 0.18, 0.4, 0.04, 0.006, '#e0c070'); gb.noGlow();
  for (const x of [-0.36, 0.36]) gb.box(x, 0.06, 0.165, 0.1, 0.14, 0.008, rng.pick(['#d8a630', '#c8423a', '#3f6a8f']));
  if (L) { gb.cbox(0, 0.7, -0.12, 0.3, 0.12, 0.3, trim, 0, 0.01); gb.sphere(0, 0.84, -0.12, 0.14, '#5f7f86', 1, 0.7); }
  lamp(c, -0.42, 0.42, 0.3); lamp(c, 0.42, 0.42, 0.3);
};

MODELS.firestation = (c, L) => {
  const { gb, pal } = c;
  // red-brick engine house with big doors and a hose-drying tower
  const wall = '#9a3a2a';
  house(c, { x: -0.06, z: -0.12, w: 0.7, d: 0.54, h: L ? 0.6 : 0.46, floors: 2, wall, roof: pal.slate, roofType: 'gable', rh: 0.2, nFront: 3, noDoor: true, chimney: true, fancy: false, lit: 0.9 });
  for (const x of L ? [-0.24, 0, 0.24] : [-0.14, 0.14]) {
    gb.box(x, 0, 0.152, 0.18, 0.22, 0.012, '#e3dccd');
    gb.box(x, 0, 0.158, 0.15, 0.19, 0.012, '#c8423a');
    gb.box(x, 0.09, 0.166, 0.15, 0.008, 0.006, '#e3dccd');
  }
  const tx = 0.38, tz = -0.24;
  footing(c, tx, tz, 0.16, 0.16);
  gb.cbox(tx, 0, tz, 0.16, L ? 1.0 : 0.8, 0.16, wall, 0, 0.01);
  gb.roof(tx, L ? 1.0 : 0.8, tz, 0.2, 0.2, 0.14, 0, pal.slate);
  gb.cyl(tx, (L ? 1.0 : 0.8) - 0.14, tz + 0.085, 0.03, 0.03, 0.012, 8, '#d8a630', 0, Math.PI / 2);
  // the engine itself, waiting outside
  const ex = -0.06, ez = 0.36, ey = c.gy(ex, ez);
  gb.box(ex, ey + 0.03, ez, 0.12, 0.07, 0.26, '#c8423a');
  for (const s of [-1, 1]) for (const z of [-0.08, 0.08]) gb.cyl(ex + s * 0.065, ey + 0.035, ez + z, 0.035, 0.035, 0.012, 8, '#3a2f28', 0, 0, Math.PI / 2);
  gb.cyl(ex, ey + 0.11, ez - 0.04, 0.03, 0.03, 0.08, 8, '#d8a630', 0, Math.PI / 2);
};

function tint(geo, t) {
  const c = geo.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * (1 + t[0]), c.getY(i) * (1 + t[1]), c.getZ(i) * (1 + t[2]));
  c.needsUpdate = true;
}

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

const hasExt = (b) => !!(b.ext && (b.ext.x0 || b.ext.x1 || b.ext.z0 || b.ext.z1));

// The part of the world a building may use, in its own local frame: its plot,
// grown or shrunk by any garden land bought from or sold to a neighbour.
function plotBox(b, Ex, Ez) {
  const box = landBox(b, Ex, Ez);
  // the front may come forward into the street's verge (b.front, set by the world)
  if (b.front) box.z1 += b.front;
  return box;
}

function landBox(b, Ex, Ez) {
  if (!hasExt(b)) return { x0: -Ex, x1: Ex, z0: -Ez, z1: Ez };
  const e = b.ext, W = fw(b) / 2, D = fd(b) / 2;
  const th = (b.rot * Math.PI) / 2, co = Math.cos(th), si = Math.sin(th);
  const pts = [[-W - e.x0, -D - e.z0], [W + e.x1, -D - e.z0], [W + e.x1, D + e.z1], [-W - e.x0, D + e.z1]]
    .map(([dx, dz]) => [dx * co - dz * si, dx * si + dz * co]);
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return {
    x0: r(Math.min(...pts.map(p => p[0]))), x1: r(Math.max(...pts.map(p => p[0]))),
    z0: r(Math.min(...pts.map(p => p[1]))), z1: r(Math.max(...pts.map(p => p[1]))),
  };
}

// Small per-building yaw and offset so streets don't look ruled with a pencil.
export function jitterOf(b) {
  if (b.size > 1 || b.type === 'plaza' || b.type === 'station' || hasExt(b)) return { yaw: 0, ox: 0, oz: 0 };
  const h1 = hash2(b.variant & 0xffff, b.variant >>> 16, 31), h2 = hash2(b.variant & 0xffff, b.variant >>> 16, 32), h3 = hash2(b.variant & 0xffff, b.variant >>> 16, 33);
  return { yaw: (h1 - 0.5) * 0.12, ox: (h2 - 0.5) * 0.04, oz: (h3 - 0.5) * 0.04 };
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
  const cx = b.x + fw(b) / 2 + j.ox, cz = b.z + fd(b) / 2 + j.oz;
  const pts = [[r[0], r[1]], [r[2], r[3]]].map(([lx, lz]) => [cx + lx * co + lz * si, cz - lx * si + lz * co]);
  return [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
}

export function buildModel(b, opts = {}) {
  const gb = new GeoBuilder();
  gb.vary = 0.09;
  const pal = palette(b.variant, b.look);
  const rng = new RNG((b.variant ^ (b.level * 0x9E3779B1)) >>> 0);
  const E = b.size / 2;
  // half-extents of the plot in the model's own (rotated) frame
  const odd = (b.rot & 1) === 1;
  const Ex = (odd ? fd(b) : fw(b)) / 2, Ez = (odd ? fw(b) : fd(b)) / 2;
  const jit = opts.flat ? { yaw: 0, ox: 0, oz: 0 } : jitterOf(b);
  const th = (b.rot * Math.PI) / 2 + jit.yaw, co = Math.cos(th), si = Math.sin(th);
  const cx = b.x + fw(b) / 2 + jit.ox, cz = b.z + fd(b) / 2 + jit.oz;
  const ground = opts.ground;
  const makeCtx = (gb, rng) => {
  const c = {
    gb, rng, pal, E, Ex, Ez, box: plotBox(b, Ex, Ez), boxAware: false, level: b.level, flavor: b.flavor || null, shutters: pal.shutters ? pal.accent : null, flowerBoxes: false,
    frame: pal.frame, winH: pal.winH, arched: (pal.arched ?? pal.style === 'stone') && b.type !== 'farm',
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
  return c;
  };
  const c = makeCtx(gb, rng);
  // on a plot bigger than its own footprint the building keeps its usual size
  // and an annex takes the rest (see annexPlan)
  const def = BUILDINGS[b.type];
  const annex = def && !opts.noAnnex ? annexPlan(def, b, Ex, Ez, c.box) : null;
  if (annex) { c.box = annex.main; c.Ex = annex.Ex; c.Ez = annex.Ez; }
  MODELS[b.type](c, b.level);
  let geo = gb.build();
  if (geo) { weather(geo); tint(geo, pal.tint); }
  // Never poke into the neighbours: shrink the model sideways if, after its
  // small random offset and turn, any part would leave its own plot.
  // Models that don't lay themselves out in c.box are centred in it.
  if (geo) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox, B = c.box;
    const bcx = (B.x0 + B.x1) / 2, bcz = (B.z0 + B.z1) / 2, hx = (B.x1 - B.x0) / 2, hz = (B.z1 - B.z0) / 2;
    const tx = c.boxAware ? 0 : bcx, tz = c.boxAware ? 0 : bcz;
    const ex = Math.max(bcx - bb.min.x - tx, bb.max.x + tx - bcx), ez = Math.max(bcz - bb.min.z - tz, bb.max.z + tz - bcz);
    const ya = Math.abs(jit.yaw), cy = Math.cos(ya), sy = Math.sin(ya);
    const m = 0.02 + Math.abs(jit.ox) + Math.abs(jit.oz);
    const k = Math.min(1, (hx - m) / (ex * cy + ez * sy), (hz - m) / (ex * sy + ez * cy));
    if (k < 1 || tx || tz) {
      geo.translate(tx - bcx, 0, tz - bcz);
      geo.scale(k, 1, k);
      geo.translate(bcx, 0, bcz);
      geo.computeBoundingSphere();
      const sc = (p) => { p.x = (p.x + tx - bcx) * k + bcx; p.z = (p.z + tz - bcz) * k + bcz; };
      c.smoke.forEach(sc); c.glows.forEach(sc);
      if (c.fountain) { const p = { x: c.fountain[0], z: c.fountain[2] }; sc(p); c.fountain[0] = p.x; c.fountain[2] = p.z; }
      if (c.spin) { sc(c.spin); c.spin.geo.scale(k, k, k); }
      if (c.doorAt) sc(c.doorAt);
    }
  }
  if (annex && geo) {
    geo.computeBoundingBox();
    const gb2 = new GeoBuilder();
    gb2.vary = 0.09;
    const c2 = makeCtx(gb2, new RNG((b.variant * 2654435761 + 7) >>> 0));
    c2.smoke = c.smoke; c2.glows = c.glows;
    c2.doorAt = c.doorAt || { x: 0, y: 0, z: 0, dx: 0, dz: 1 };   // the building's own door stays the way in
    for (const A of annex.areas) buildAnnex(c2, def, A, geo.boundingBox.max.y, !!b.spare);
    const g2 = gb2.build();
    if (g2) { weather(g2); tint(g2, pal.tint); geo = mergeGeometries([geo, g2], false); geo.computeBoundingSphere(); }
  }
  return { geo, smoke: c.smoke, glows: c.glows, spin: c.spin, work: c.work, fountain: c.fountain, jitter: jit, door: c.doorAt || null };
}

// --------------------------------------------------------------- annexes
// A plot that has grown past the building's own footprint (a 1×1 building on
// a 2×1 or 1×2 plot, anything on a 2×2 estate) keeps the building at its
// usual size at the front, on one side, and puts an annex in the same style on
// the new land: a wing for homes, shops and services, a work shed with goods
// for industry, a tank or transformer house for utilities, more garden for
// parks. Returns null when the plot is the building's usual size.
function annexPlan(def, b, Ex, Ez, B) {
  const bw = def.merged ? 2 : def.size, bd = def.merged ? 1 : def.size;
  if (4 * Ex * Ez <= bw * bd + 0.01) return null;
  // the base footprint as it lies on this plot (a row building may be turned)
  const [lw, ld] = Ez > Ex + 1e-6 && bw !== bd ? [bd, bw] : [bw, bd];
  const extraW = 2 * Ex - lw, extraD = 2 * Ez - ld;
  if (extraW < 0.5 && extraD < 0.5) return null;
  const side = (b.variant >>> 4) & 1 ? 1 : -1;     // which end the building itself keeps
  const main = { x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 };
  const areas = [];
  if (extraW >= 0.5) {
    if (side < 0) { main.x1 = B.x1 - extraW; areas.push({ x0: main.x1, x1: B.x1, z0: B.z0, z1: B.z1, where: 'beside' }); }
    else { main.x0 = B.x0 + extraW; areas.push({ x0: B.x0, x1: main.x0, z0: B.z0, z1: B.z1, where: 'beside' }); }
  }
  if (extraD >= 0.5) { main.z0 = B.z0 + extraD; areas.push({ x0: main.x0, x1: main.x1, z0: B.z0, z1: main.z0, where: 'behind' }); }
  return { main, areas, Ex: lw / 2, Ez: ld / 2 };
}

// One annex in area A (local frame, street side at +z). `top` is how tall the
// main building stands, so a wing can match it a storey lower. spare: land
// taken but not built on yet, kept as a garden.
function buildAnnex(c, def, A, top, spare = false) {
  const { gb, rng, pal } = c;
  const aw = A.x1 - A.x0, ad = A.z1 - A.z0, cx = (A.x0 + A.x1) / 2;
  const beside = A.where === 'beside';
  const L = def.levels[c.level] || def.levels[0];
  if (def.park || spare) {
    // more garden: a gravel walk, trees, beds and a bench, inside a hedge
    hedge(c, cx, A.z0 + 0.06, aw - 0.12, 0.05);
    gb.box(cx, c.gy(cx, (A.z0 + A.z1) / 2) - 0.008, (A.z0 + A.z1) / 2, 0.09, 0.012, ad - 0.2, '#c8b894');
    for (const sx of [-1, 1]) {
      smallTree(c, cx + sx * aw * 0.28, A.z0 + ad * 0.3, rng.float(0.9, 1.2));
      flowers(c, cx + sx * aw * 0.25, A.z0 + ad * 0.72, rng.int(5, 8), 0.08);
    }
    bench(c, cx + aw * 0.16, (A.z0 + A.z1) / 2, -Math.PI / 2);
    return;
  }
  if (def.cat === 'industry') {
    // a work shed of planks with a big door, and goods stacked in the yard
    const w = Math.min(0.78, aw - 0.24), d = Math.min(0.48, ad - 0.36);
    if (w < 0.25 || d < 0.2) return;
    const z = beside ? A.z1 - 0.3 - d / 2 : A.z0 + 0.1 + d / 2;
    house(c, { x: cx, z, w, d, h: 0.3, floors: 1, wall: pal.wood, roof: pal.slate, roofType: 'gable', rh: 0.14, chimney: false, noDoor: true, noBack: true, fancy: false, nFront: 2, lit: 0.5 });
    gb.box(cx, 0, z + d / 2 + 0.006, Math.min(0.22, w * 0.4), 0.21, 0.012, '#4e3828');
    const yz = z + d / 2 + 0.11;
    if (yz < A.z1 - 0.04) {
      crate(c, cx - w * 0.38, yz); crate(c, cx - w * 0.38 + 0.07, yz + 0.02, 0.9); barrel(c, cx + w * 0.36, yz);
      logs(c, cx + w * 0.12, yz + 0.03, 2, 0);
    }
    return;
  }
  if (def.cat === 'utilities') {
    if (L.kw) {
      // a transformer house with insulators, behind a low fence
      const z = (A.z0 + A.z1) / 2;
      gb.cbox(cx, 0, z, 0.3, 0.26, 0.24, pal.brick, 0, 0.012);
      gb.hip(cx, 0.26, z, 0.3, 0.24, 0.1, pal.slate, 0.03);
      for (const sx of [-1, 0, 1]) { gb.cyl(cx + sx * 0.08, 0.36, z, 0.012, 0.016, 0.06, 6, '#e8e2d4'); }
      fence(c, cx - 0.24, z - 0.2, cx + 0.24, z + 0.2, '#6a6a70', { x: cx, z: z + 0.2, w: 0.06 });
    } else {
      // a round water tank on legs and a little pump hut
      const z = (A.z0 + A.z1) / 2;
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.box(cx + lx * 0.09, 0, z + lz * 0.09, 0.025, 0.3, 0.025, '#5e432c');
      gb.cyl(cx, 0.3, z, 0.15, 0.15, 0.2, 12, pal.wood);
      gb.cone(cx, 0.5, z, 0.16, 0.08, 12, pal.slate);
      house(c, { x: cx + Math.min(0.28, aw * 0.3), z: z + 0.16, w: 0.2, d: 0.18, h: 0.2, floors: 1, wall: pal.stoneWall, roof: pal.slate, roofType: 'gable', rh: 0.1, chimney: false, fancy: false, nFront: 1 });
    }
    return;
  }
  // homes, shops and services: a wing in the same materials, a storey lower
  // than the building if it's tall, level with the street front when it's
  // beside the building and tucked up behind it otherwise
  const floors = top > 0.75 ? 2 : 1;
  const w = Math.min(0.86, aw - 0.24), d = Math.min(beside ? 0.5 : 0.54, ad - 0.3);
  if (w < 0.25 || d < 0.2) return;
  const z = beside ? A.z1 - 0.22 - d / 2 : A.z1 - 0.1 - d / 2;
  const thatch = pal.thatched && floors === 1;
  house(c, {
    x: cx, z, w, d, h: floors * 0.27, floors, wall: pal.wall, roof: thatch ? pal.thatch : pal.roof,
    roofType: thatch ? 'thatch' : pal.hip ? 'hip' : 'gable', rh: 0.2, timber: pal.timber,
    chimney: def.cat === 'residential' && rng.chance(0.6), noDoor: !beside,
    shopWindow: def.cat === 'commercial' && beside, plinth: def.cat === 'services' ? STONE : null,
  });
  if (beside && def.cat === 'residential') {
    const fz = z + d / 2 + 0.1;
    if (fz < A.z1 - 0.04) { bush(c, cx - w * 0.3, fz, 0.8); flowers(c, cx + w * 0.25, fz, 5, 0.06); }
  } else if (!beside) {
    const gz = A.z0 + 0.12;
    if (gz < z - d / 2 - 0.08) { smallTree(c, cx - aw * 0.3, gz + 0.02, 0.9); bench(c, cx + aw * 0.15, gz, 0); }
  }
}

