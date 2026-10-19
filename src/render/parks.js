// Parks: every park model, and the pieces they are made of. Each park lays
// itself out from its own seed (b.variant), so no two greens, ponds or rose
// gardens look alike, and its layout stays put as it is upgraded and across
// reloads: ownPick and ownRng go by the seed alone, never the level.
// Everything planted follows the season (c.season, turning towards the next
// by c.seasonW): blossom, then leaves, autumn colour, bare twigs and the
// bulbs coming up again; ponds freeze and the lido is drained in winter.
// The world view rebuilds parks as the season turns (see PARK_SEASON_STEPS).
// Lamps, lanterns and glasshouses light up at night.
//
// Local frame as in buildings.js: origin at the middle of the plot, y = 0 at
// the plot's floor (parks sit at the top of their ground, so c.gy() <= 0),
// +z towards the street. MODELS in buildings.js takes PARK_MODELS.

import * as THREE from 'three';
import { shade, mix } from './geo.js';
import { RNG, hash2 } from '../util/rng.js';
import { BUILDINGS, parkOrigin, kindOf } from '../defs.js';
import {
  house, bench, lamp, bush, hedge, fence, footing, pavilion, shelter, swings, slide, seesaw, roundabout, sandpit, fort,
  stripes, goal, frontage, rowFrame, gravel, gatePiers, glassRoof, wallClock, cafeTable, tubPlant, sign, logs, ownPick,
} from './buildings.js';

// How many steps a season's turn is drawn in, for parks (the world view
// rebuilds them at each): fewer than the ground and the wild trees take,
// as a park is a whole model to build.
export const PARK_SEASON_STEPS = 4;

// ------------------------------------------------------------- colours
const STONE = '#8f877a', STONE_L = '#b8b0a2', STONE_W = '#d8d2c4', MARBLE = '#e6e1d6';
const IRON = '#2f2f33', IRON_G = '#2f4a3a', BRONZE = '#7a6a48', VERDI = '#5f8f7e', GOLD = '#d0a03a';
const GRAVEL = '#cdbf9e', GRAVEL_D = '#bfae8a', SOIL = '#5e4430', SOIL_D = '#4e3a28', BARK = '#5e432c';
const WATER = '#3f7f9f', ICE = '#c4d6de', REED = '#6f8a3a', REED_DRY = '#a8925a';
const HEDGE = ['#4c7a3a', '#477238', '#4f6e38', '#4b5f45'];   // box and yew, by season (a little duller in winter)
const LAMPGLOW = [2.2, 1.6, 0.8];
const WARM = [1.7, 1.2, 0.55];
export const PARK_PAINT = ['#2f4a3a', '#7a2a2a', '#2f4a6a', '#e8e0d0', '#3a3a3e', '#5a3a5a'];   // ironwork and woodwork

// Leaves through the year, [spring, summer, autumn, winter] (winter: the
// colour of a bare crown of twigs).
const LEAVES = {
  round: [['#6a8f45', '#5f8640', '#75974d'], ['#5b7d3e', '#4f7037', '#668546'], ['#b5682e', '#c48a3a', '#9a4a2a', '#a8923a', '#b87a34'], ['#7a6d60', '#6e6256', '#857868']],
  lime: [['#86a84e', '#7c9e48'], ['#6a8f45', '#628640'], ['#d0b040', '#c8a038', '#dcc050'], ['#80726a', '#76685e']],
  cherry: [['#f1dfe3', '#e8c6cf', '#f4d0dc'], ['#5f8a42', '#55803c'], ['#b8452e', '#c8642e', '#a83a2a'], ['#7a6460', '#6e5a56']],
  copper: [['#7a4a4e', '#6e4046'], ['#5a2e36', '#62343a'], ['#9a5a2a', '#8a4a26'], ['#7a6d60', '#6e6256']],
  willow: [['#a8c060', '#9cb858'], ['#7fa04a', '#88a852'], ['#c8b048', '#d0b850'], ['#9a8a5a', '#8a7c56']],
  birch: [['#8aa556', '#93ad5e'], ['#7f9a4f', '#738f47'], ['#d4ac3c', '#dcb94a', '#c79c34'], ['#8a7e70', '#968a7c']],
  yew: [['#33502e', '#2f4a2c'], ['#2c472a', '#304c2c'], ['#2f4a2c', '#2c462a'], ['#2c4230', '#30462f']],
  pine: [['#2f5236', '#36593b'], ['#2c4e33', '#335538'], ['#304d34', '#38573b'], ['#2f4a37', '#36523d']],
};
const BLOOMS = [
  ['#f2d040', '#e8e070', '#d9363a', '#f2ede0', '#e88fae', '#7a6ad9', '#f0a830'],   // daffodils, tulips, hyacinths
  ['#d9536b', '#e8b84a', '#e88fae', '#f2ede0', '#9c74c9', '#e8823f', '#d9363a', '#6a8ad9'],
  ['#c8702a', '#d8a030', '#8a2a3a', '#9c74c9', '#b8452e', '#e8c060'],   // chrysanthemums, asters, dahlias
  ['#7a5ab0', '#f2ede0', '#e8d050'],   // winter pansies and snowdrops
];
const ROSES = ['#c8203a', '#e05a7a', '#f2c0c8', '#f2ede0', '#e8a040', '#a01830'];

// A plain stone plinth under a garden structure (a bandstand, a fountain, a
// glasshouse, a monument) where the ground falls away below its floor (y = 0).
export function plinth(c, x, z, w, d, color = STONE) {
  let lo = 0;
  for (const [px, pz] of [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z]]) lo = Math.min(lo, c.gy(px, pz));
  if (lo > -0.015) return;
  c.gb.cbox(x, lo - 0.04, z, w + 0.02, -lo + 0.045, d + 0.02, color, 0, 0.012);
}

// ---------------------------------------------------------- the seed
// A stable random sequence for this park (the same at every level): salt
// keeps the park's different choices apart.
export function ownRng(c, salt = 0) { return new RNG(((c.variant || 0) ^ (0x51ed27 + salt * 104729)) >>> 0); }
// 0..1 for a spot in the park, the same at every level
const spotHash = (c, x, z, salt = 0) => hash2(Math.round(x * 200) + 5000, Math.round(z * 200) + 5000, ((c.variant || 0) & 0xffff) + salt * 31);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------ seasons
// How far one thing (its own hash h) has turned towards the next season:
// trees and beds turn in their own time as the season shades into the next.
function turnOf(c, h) {
  const k = Math.floor((c.seasonW || 0) * PARK_SEASON_STEPS + 1e-6) / PARK_SEASON_STEPS;
  return k <= 0 ? 0 : k >= 1 ? 1 : clamp01((k - h * 0.3) / 0.7);
}
// The season a thing shows (0 spring, 1 summer, 2 autumn, 3 winter).
export function seasonAt(c, h = 0.5) {
  const s = c.season ?? 1;
  return turnOf(c, h) >= 0.5 ? (s + 1) % 4 : s;
}
// A colour from a [spring, summer, autumn, winter] palette, blended as the
// season turns.
function seasonCol(c, pal, h) {
  const s = c.season ?? 1, n = (s + 1) % 4, k = turnOf(c, h);
  const pick = (q) => pal[q][Math.floor(h * 997) % pal[q].length];
  return k <= 0 ? pick(s) : k >= 1 ? pick(n) : mix(pick(s), pick(n), k);
}
// How bare a deciduous tree is: 1 in winter, fading in and out with the turn.
function bareOf(c, h) {
  const s = c.season ?? 1, n = (s + 1) % 4, k = turnOf(c, h);
  return (s === 3 ? 1 - k : 0) + (n === 3 ? k : 0);
}
// Ice on the water: frozen through the winter.
const frozen = (c) => seasonAt(c, 0.5) === 3;
const hedgeCol = (c) => HEDGE[seasonAt(c, 0.4)];

// ------------------------------------------------------------- trees
// A park tree: kinds round (oak, chestnut), lime, cherry (blossom in spring),
// copper (a copper beech), willow (weeping, by water), birch, poplar (tall
// and narrow), yew and pine (evergreen), cedar (spreading tiers).
export function parkTree(c, x, z, s = 1, kind = 'round') {
  const { gb } = c;
  const y = c.gy(x, z), h = spotHash(c, x, z, 7);
  if (kind === 'yew') {
    gb.cyl(x, y - 0.01, z, 0.016 * s, 0.022 * s, 0.06 * s, 6, BARK);
    gb.cone(x, y + 0.03 * s, z, 0.1 * s, 0.34 * s, 8, seasonCol(c, LEAVES.yew, h));
    return;
  }
  if (kind === 'pine') {
    gb.cyl(x, y - 0.01, z, 0.016 * s, 0.026 * s, 0.14 * s, 6, BARK);
    const col = seasonCol(c, LEAVES.pine, h);
    gb.cone(x, y + 0.1 * s, z, 0.15 * s, 0.24 * s, 8, col);
    gb.cone(x, y + 0.24 * s, z, 0.11 * s, 0.2 * s, 8, shade(col, 1.08));
    return;
  }
  if (kind === 'cedar') {
    gb.cyl(x, y - 0.01, z, 0.024 * s, 0.036 * s, 0.34 * s, 6, BARK);
    const col = seasonCol(c, LEAVES.pine, h);
    for (const [ty, r, ox] of [[0.16, 0.2, 0.02], [0.26, 0.16, -0.03], [0.35, 0.11, 0.01]]) gb.blob(x + ox * s, y + ty * s, z, r * s, 0.035 * s, r * 0.8 * s, shade(col, 0.95 + ty * 0.3), h * 6);
    return;
  }
  const bare = bareOf(c, h), k = 1 - bare * 0.3;
  const pal = LEAVES[kind] || LEAVES.round;
  const col = seasonCol(c, pal, h);
  if (kind === 'poplar') {
    gb.cyl(x, y - 0.01, z, 0.014 * s, 0.022 * s, 0.14 * s, 6, BARK);
    gb.sphere(x, y + 0.3 * s, z, 0.07 * s * k, col, 1, 3.2);
    return;
  }
  if (kind === 'willow') {
    gb.cyl(x, y - 0.01, z, 0.02 * s, 0.032 * s, 0.24 * s, 6, BARK);
    gb.sphere(x, y + 0.28 * s, z, 0.13 * s * k, col, 1, 0.75);
    // the hanging fronds, a skirt round the crown
    gb.cyl(x, y + 0.08 * s + bare * 0.06 * s, z, 0.12 * s * k, 0.17 * s * k, 0.17 * s * (1 - bare * 0.4), 9, shade(col, 0.92));
    return;
  }
  const tall = kind === 'birch' ? 1.25 : 1;
  gb.cyl(x, y - 0.01, z, 0.016 * s, 0.026 * s, 0.2 * s * tall, 6, kind === 'birch' ? '#e8e4da' : BARK);
  if (bare > 0.5) {
    // bare boughs reaching up out of the trunk
    for (let i = 0; i < 3; i++) {
      const a = h * 6.28 + i * 2.1;
      gb.boxC(x + Math.cos(a) * 0.04 * s, y + 0.24 * s * tall, z + Math.sin(a) * 0.04 * s, 0.01 * s, 0.12 * s, 0.01 * s, BARK, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
  }
  const cy = y + (0.26 + bare * 0.03) * s * tall;
  gb.sphere(x, cy, z, 0.11 * s * k, col, 1, kind === 'birch' ? 1.3 : 1);
  gb.sphere(x + 0.05 * s * k, cy + 0.05 * s, z - 0.02 * s, 0.075 * s * k, shade(col, 1.08), 1);
  gb.sphere(x - 0.05 * s * k, cy - 0.04 * s, z + 0.04 * s, 0.07 * s * k, shade(col, 0.92), 1);
}
// A shrub (rhododendron, laurel), flowering in spring or summer by its seed.
export function shrub(c, x, z, s = 1, flowering = true) {
  const { gb } = c;
  const y = c.gy(x, z), h = spotHash(c, x, z, 9), q = seasonAt(c, h);
  const col = seasonCol(c, [['#557a3c', '#4f7438'], ['#4a6e36', '#527a3c'], ['#6a6a34', '#7a6232', '#5a6a38'], ['#4a5a3c', '#46563a']], h);
  gb.sphere(x, y + 0.045 * s, z, 0.07 * s, col, 1, 0.75);
  if (s > 0.8) gb.sphere(x + 0.04 * s, y + 0.035 * s, z + 0.03 * s, 0.05 * s, shade(col, 1.08), 1, 0.8);
  if (flowering && q === (h < 0.5 ? 0 : 1)) {
    const fc = ['#d9536b', '#e88fae', '#9c74c9', '#f2ede0', '#e8823f'][Math.floor(h * 50) % 5];
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + h * 5; gb.sphere(x + Math.cos(a) * 0.05 * s, y + 0.07 * s, z + Math.sin(a) * 0.05 * s, 0.016 * s, fc); }
  }
}
// Clipped evergreen shapes: cone, ball, tiers, spiral or a peacock.
export function topiaryShape(c, x, z, s = 1, kind = 'cone') {
  const { gb } = c;
  const y = c.gy(x, z), col = hedgeCol(c);
  gb.cyl(x, y - 0.01, z, 0.012, 0.012, 0.03, 5, BARK);
  if (kind === 'ball') { gb.cyl(x, y, z, 0.008, 0.008, 0.08 * s, 5, BARK); gb.sphere(x, y + 0.11 * s, z, 0.045 * s, col, 1); gb.cyl(x, y - 0.005, z, 0.035, 0.035, 0.03, 8, '#8a6a48'); return; }
  if (kind === 'tiers') { for (const [ty, r] of [[0.04, 0.05], [0.11, 0.038], [0.17, 0.026]]) gb.sphere(x, y + ty * s, z, r * s, col, 1, 0.8); return; }
  if (kind === 'spiral') { for (let i = 0; i < 5; i++) gb.sphere(x + Math.cos(i * 1.6) * 0.012, y + (0.03 + i * 0.035) * s, z + Math.sin(i * 1.6) * 0.012, (0.042 - i * 0.006) * s, shade(col, 1 + (i % 2) * 0.08), 1, 0.7); return; }
  if (kind === 'peacock') {
    gb.cyl(x, y, z, 0.05 * s, 0.055 * s, 0.06 * s, 8, col);
    gb.sphere(x, y + 0.09 * s, z + 0.015, 0.025 * s, col, 1);
    gb.boxC(x, y + 0.11 * s, z - 0.03 * s, 0.07 * s, 0.07 * s, 0.015 * s, shade(col, 1.08), -0.5);
    return;
  }
  gb.cone(x, y + 0.02, z, 0.042 * s, 0.14 * s, 7, col);
}

// ----------------------------------------------------- flowers and beds
// Flowers of the season: bulbs in spring, bedding in summer, chrysanthemums
// in autumn, a few pansies and snowdrops in winter. pal: their own colours
// (roses, lavender) when in flower.
export function blooms(c, x, z, n = 5, spread = 0.08, pal = null, at = null, spreadZ = spread) {
  const { gb, rng } = c;
  const q = seasonAt(c, spotHash(c, x, z, 3));
  const count = Math.round(n * [0.85, 1, 0.7, 0.25][q]);
  const cols = pal && q <= 1 ? pal : BLOOMS[q];
  for (let i = 0; i < count; i++) {
    const fx = x + rng.float(-spread, spread), fz = z + rng.float(-spreadZ, spreadZ), y = at ?? c.gy(fx, fz);
    gb.box(fx, y, fz, 0.008, q === 3 ? 0.016 : 0.032, 0.008, q === 2 ? '#5a6a32' : '#4f7a3a');
    gb.sphere(fx, y + (q === 3 ? 0.02 : 0.036), fz, q === 3 ? 0.011 : 0.015, cols[rng.int(0, cols.length - 1)]);
  }
}
// A bed of soil w × d (along x, z) with an edge (box, stone, brick or
// none), planted with the season's flowers in rows; round: an oval bed.
export function bed(c, x, z, w, d, o = {}) {
  const { gb } = c;
  const y = o.y ?? c.gy(x, z), edge = o.edge || 'none';
  if (o.round) {
    const r = Math.min(w, d) / 2;
    if (edge === 'stone') gb.cyl(x, y - 0.02, z, r + 0.02, r + 0.025, 0.05, 14, STONE_L);
    gb.cyl(x, y - 0.012, z, r, r, 0.035, 14, SOIL);
  } else {
    if (edge === 'stone' || edge === 'brick') gb.cbox(x, y - 0.02, z, w + 0.03, 0.045, d + 0.03, edge === 'stone' ? STONE_L : '#9a5640', 0, 0.006);
    gb.box(x, y - 0.012, z, w, 0.032, d, SOIL);
    if (edge === 'box') { hedge(c, x, z - d / 2, w + 0.02, 0.022, 0.03); hedge(c, x, z + d / 2, w + 0.02, 0.022, 0.03); hedge(c, x - w / 2, z, 0.022, d, 0.03); hedge(c, x + w / 2, z, 0.022, d, 0.03); }
  }
  const q = seasonAt(c, spotHash(c, x, z, 3));
  const cols = o.pal && q <= 1 ? o.pal : BLOOMS[q];
  const nx = Math.max(1, Math.round(w / 0.055)), nz = Math.max(1, Math.round(d / 0.055)), keep = [0.85, 1, 0.75, 0.22][q];
  const pick = new RNG(((c.variant || 0) ^ Math.round(x * 977 + z * 613)) >>> 0);
  const band = o.bands ? pick.int(0, cols.length - 1) : -1;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    if (pick.next() > keep) continue;
    const fx = x + (i + 0.5 - nx / 2) * (w / nx) * 0.9, fz = z + (k + 0.5 - nz / 2) * (d / nz) * 0.9;
    if (o.round && Math.hypot((fx - x) / (w / 2), (fz - z) / (d / 2)) > 0.85) continue;
    const col = band >= 0 ? cols[(band + k + (o.rings ? Math.round(Math.hypot(fx - x, fz - z) / 0.05) : 0)) % cols.length] : cols[pick.int(0, cols.length - 1)];
    gb.sphere(fx, y + (q === 3 ? 0.028 : 0.04), fz, q === 3 ? 0.012 : 0.018, col);
  }
}
// A rose bush: in flower in summer (a few buds in late spring), red hips in
// autumn, pruned stems in winter.
export function roseBush(c, x, z, s = 1, col = null) {
  const { gb } = c;
  const y = c.gy(x, z), h = spotHash(c, x, z, 5), q = seasonAt(c, h);
  const rose = col || ROSES[Math.floor(h * 60) % ROSES.length];
  if (q === 3) { for (let i = 0; i < 3; i++) gb.boxC(x + (i - 1) * 0.012, y + 0.03 * s, z, 0.006, 0.06 * s, 0.006, '#5a4a3a', 0, 0, (i - 1) * 0.3); return; }
  const leaf = q === 2 ? '#5a6a32' : q === 0 ? '#5f8a42' : '#3f6a32';
  gb.sphere(x, y + 0.04 * s, z, 0.045 * s, leaf, 1, 0.9);
  const n = q === 1 ? 4 : q === 0 ? 2 : 2;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + h * 4;
    gb.sphere(x + Math.cos(a) * 0.035 * s, y + (0.06 + (i % 2) * 0.02) * s, z + Math.sin(a) * 0.035 * s, (q === 2 ? 0.008 : 0.014) * s, q === 2 ? '#b8302a' : q === 0 ? '#7aa04a' : rose);
  }
}
// A standard rose or a lavender bush, for edging walks.
export function lavender(c, x, z, s = 1) {
  const y = c.gy(x, z), q = seasonAt(c, spotHash(c, x, z, 2));
  c.gb.sphere(x, y + 0.025 * s, z, 0.035 * s, q === 3 ? '#7a8478' : '#8a9a80', 1, 0.7);
  if (q === 1) c.gb.sphere(x, y + 0.05 * s, z, 0.028 * s, '#8a6ac0', 0, 0.6);
}

// The two greens of a mown lawn's stripes through the year: fresh in
// spring, deep in summer, tired in autumn, dull and worn in winter.
const TURF = [['#82b852', '#92c460'], ['#76ac4a', '#86b956'], ['#8aa84e', '#98b25a'], ['#7a8a5e', '#86946a']];
export const turf = (c, k = 0) => TURF[seasonAt(c, 0.5)].map(col => shade(col, 1 - k * 0.04));

// ------------------------------------------------------------- paths
// A gravel walk through the points [[x, z], ...] (local), w wide.
export function walk(c, pts, w = 0.09, color = GRAVEL) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (len < 1e-4) continue;
    c.gb.box(mx, c.gy(mx, mz) - 0.008, mz, w, 0.012, len + w * 0.6, color, Math.atan2(bx - ax, bz - az));
  }
}
// A walk along a gentle curve from a to b bowing out by `bow` (sideways).
export function curve(a, b, bow, n = 8) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, s = Math.sin(t * Math.PI) * bow; out.push([a[0] + dx * t + nx * s, a[1] + dz * t + nz * s]); }
  return out;
}
// A round walk (a circle of gravel) of radius r.
export function ringWalk(c, x, z, r, w = 0.08, color = GRAVEL) {
  const n = Math.max(10, Math.round(r * 40)), pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  walk(c, pts, w, color);
}
// Somewhere visitors like to stand or sit (local): they stroll between
// these rather than anywhere on the plot (so not into the pond).
export function spot(c, x, z) {
  if (!c.spots) return;
  const v = new THREE.Vector3(x, 0, z).applyMatrix4(c.gb.M);
  c.spots.push({ x: v.x, z: v.z });
}

// --------------------------------------------------------- water
// Water in overlapping round pools [[x, z, r], ...] (local), lying level
// just under the highest ground beneath it, so none of it is lost under a
// hillside; where the ground falls away a sloping grassy bank (or a stone
// kerb) holds it up. Ice in winter. Returns the height of the water.
export function water(c, pools, o = {}) {
  const { gb } = c;
  let lo = Infinity, hi = -Infinity;
  for (const [px, pz, r] of pools) for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) {
    const y = c.gy(px + ox, pz + oz);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  const ly = hi - 0.004, rise = ly - lo;
  if (o.stone) {
    // a stone edge flush with the water, coping stones round the rim
    const stone = o.stone === true ? STONE_L : o.stone;
    for (const [px, pz, r] of pools) gb.cyl(px, lo - 0.04, pz, r + 0.03, r + 0.035, rise + 0.042, 18, stone);
    for (const [px, pz, r] of pools) {
      const n = Math.max(10, Math.round(r * 60));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, sx = px + Math.cos(a) * (r + 0.012), sz = pz + Math.sin(a) * (r + 0.012);
        if (pools.some(([qx, qz, qr]) => (qx !== px || qz !== pz) && Math.hypot(sx - qx, sz - qz) < qr)) continue;
        gb.box(sx, ly - 0.004, sz, 0.026, 0.02, (Math.PI * 2 * r) / n + 0.006, shade(stone, 1.06), -a);
      }
    }
  } else {
    const bank = seasonAt(c, 0.3) === 3 ? '#77825e' : '#6f8a4a';
    for (const [px, pz, r] of pools) gb.cyl(px, lo - 0.04, pz, r + 0.03, r + 0.05 + Math.min(rise * 1.1, 0.12), rise + 0.044, 18, bank);
  }
  const ice = frozen(c);
  for (const [px, pz, r] of pools) gb.cyl(px, ly - 0.02, pz, r, r, 0.026, 18, ice ? ICE : o.color || WATER);
  return ly + 0.006;
}
export function reeds(c, x, z, y, n = 5, spread = 0.04) {
  const { gb, rng } = c;
  const q = seasonAt(c, spotHash(c, x, z, 11)), col = q >= 2 ? REED_DRY : REED;
  for (let i = 0; i < n; i++) {
    const rx = x + rng.float(-spread, spread), rz = z + rng.float(-spread, spread), hh = rng.float(0.05, 0.09);
    gb.boxC(rx, y + hh / 2, rz, 0.005, hh, 0.005, col, rng.float(-0.15, 0.15), 0, rng.float(-0.15, 0.15));
    if (i % 2 === 0) gb.cyl(rx, y + hh - 0.012, rz, 0.006, 0.006, 0.022, 5, '#5a3a24');
  }
}
export function lilies(c, x, z, y, n = 4, spread = 0.07) {
  const { gb, rng } = c;
  const q = seasonAt(c, spotHash(c, x, z, 13));
  if (q === 3) return;
  for (let i = 0; i < (q === 2 ? n - 1 : n); i++) {
    const lx = x + rng.float(-spread, spread), lz = z + rng.float(-spread, spread);
    gb.cyl(lx, y, lz, 0.018, 0.018, 0.004, 7, q === 2 ? '#7a8a3a' : '#4f8a3a');
    if (q === 1 && i % 2 === 0) gb.sphere(lx + 0.005, y + 0.008, lz, 0.008, i % 4 ? '#f2c0d0' : '#f2ede0');
  }
}
export function duck(c, x, y, z, ry = 0, col = '#8a6a48') {
  const { gb } = c;
  gb.push(x, y, z, ry);
  gb.sphere(0, 0.008, 0, 0.018, col, 0, 0.65);
  gb.sphere(0, 0.024, 0.016, 0.009, col === '#f2ede0' ? col : '#2f6a3a');
  gb.box(0, 0.02, 0.026, 0.006, 0.004, 0.01, '#d8a030');
  gb.pop();
}
// A rowing boat, its bow along +z.
export function boat(c, x, y, z, ry = 0, col = '#7d5b3b') {
  const { gb } = c;
  gb.push(x, y, z, ry);
  gb.roof(0, -0.012, 0, 0.07, 0.17, 0.035, 0, shade(col, 0.8), 0);
  gb.box(0, -0.004, 0, 0.065, 0.024, 0.14, col);
  gb.box(0, 0.02, 0, 0.06, 0.006, 0.014, '#4a3a2c');
  gb.pop();
}
// A little arched bridge over water, along z, `len` long.
export function footbridge(c, x, z, len, ry = 0, y = null, col = '#ece6da') {
  const { gb } = c;
  const yy = y ?? c.gy(x, z);
  gb.push(x, yy, z, ry);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, z0 = -len / 2 + t0 * len, z1 = -len / 2 + t1 * len;
    const y0 = Math.sin(t0 * Math.PI) * 0.06, y1 = Math.sin(t1 * Math.PI) * 0.06;
    gb.boxC(0, (y0 + y1) / 2 + 0.012, (z0 + z1) / 2, 0.08, 0.014, len / n + 0.004, '#8a6a48', -Math.atan2(y1 - y0, len / n));
    for (const sx of [-1, 1]) gb.boxC(sx * 0.038, (y0 + y1) / 2 + 0.05, (z0 + z1) / 2, 0.008, 0.008, len / n + 0.004, col, -Math.atan2(y1 - y0, len / n));
  }
  for (const sx of [-1, 1]) for (let i = 0; i <= n; i++) { const t = i / n; gb.box(sx * 0.038, Math.sin(t * Math.PI) * 0.06 + 0.012, -len / 2 + t * len, 0.008, 0.04, 0.008, col); }
  gb.pop();
}

// ------------------------------------------------------- park buildings
// The bandstand: an octagon on a plinth, slim iron columns, railings and a
// roof flaring out to the eaves, a finial on top; lanterns round the eaves
// at night. r: its radius; roof colour and ironwork from the park's seed.
export function bandstand(c, x, z, r = 0.16, o = {}) {
  const { gb } = c;
  const y = c.gy(x, z), iron = o.iron || IRON_G, roof = o.roof || '#3f5a46', h = r * 1.15;
  plinth(c, x, z, r * 2, r * 2);
  gb.cyl(x, Math.min(0, y) - 0.02, z, r + 0.02, r + 0.03, 0.07 - Math.min(0, y), 8, o.base || STONE_L, Math.PI / 8);
  gb.cyl(x, 0.05, z, r + 0.01, r + 0.01, 0.012, 8, '#8a6a48', Math.PI / 8);
  // steps up at the front
  gb.cbox(x, Math.min(0, y) - 0.01, z + r + 0.02, 0.07, 0.035 - Math.min(0, y), 0.05, o.base || STONE_L, 0, 0.004);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, px = x + Math.cos(a) * r * 0.92, pz = z + Math.sin(a) * r * 0.92;
    gb.box(px, 0.06, pz, 0.01, h, 0.01, iron);
    // railings between the columns, open at the steps
    const b = a + Math.PI / 4, qx = x + Math.cos(b) * r * 0.92, qz = z + Math.sin(b) * r * 0.92;
    if (Math.abs(Math.sin((a + b) / 2) - 1) > 0.05) gb.boxC((px + qx) / 2, 0.1, (pz + qz) / 2, 0.006, 0.006, Math.hypot(qx - px, qz - pz), iron, 0, Math.atan2(qx - px, qz - pz));
  }
  // music stands and chairs for the band
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 0.7; gb.box(x + Math.cos(a) * r * 0.45, 0.06, z + Math.sin(a) * r * 0.45, 0.006, 0.05, 0.006, IRON); }
  const ey = 0.06 + h;
  gb.cyl(x, ey, z, r + 0.035, r + 0.035, 0.016, 8, o.trim || '#ece6da', Math.PI / 8);
  // the roof: a flare at the eaves, then the ogee rising to the finial
  gb.cyl(x, ey + 0.016, z, r * 0.8, r + 0.05, r * 0.25, 8, roof, Math.PI / 8);
  gb.cyl(x, ey + 0.016 + r * 0.25, z, r * 0.12, r * 0.8, r * 0.55, 8, shade(roof, 1.06), Math.PI / 8);
  gb.cyl(x, ey + 0.016 + r * 0.8, z, 0.006, 0.012, 0.06, 5, GOLD);
  gb.sphere(x, ey + 0.016 + r * 0.8 + 0.065, z, 0.012, GOLD);
  // lanterns round the eaves
  gb.glow(LAMPGLOW[0], LAMPGLOW[1], LAMPGLOW[2], 3.0);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; gb.sphere(x + Math.cos(a) * (r + 0.02), ey - 0.008, z + Math.sin(a) * (r + 0.02), 0.009, '#ffe2a0'); }
  gb.noGlow();
  c.addGlow(x, ey, z);
}
// A rose arch or pergola over a walk: posts and beams, the climbing roses
// along them following the season. Along x, len long.
export function arbour(c, x, z, len, w = 0.12, ry = 0, o = {}) {
  const { gb } = c;
  const y = c.gy(x, z), post = o.post || '#ece6da', n = Math.max(2, Math.round(len / 0.12) + 1), q = seasonAt(c, spotHash(c, x, z, 17));
  gb.push(x, y, z, ry);
  for (let i = 0; i < n; i++) {
    const px = -len / 2 + (i * len) / (n - 1);
    for (const s of [-1, 1]) gb.box(px, -0.01, (s * w) / 2, 0.012, 0.17, 0.012, post);
    gb.box(px, 0.16, 0, 0.012, 0.012, w + 0.04, post);
  }
  for (const s of [-1, 1]) gb.box(0, 0.168, (s * w) / 3, len + 0.03, 0.008, 0.008, post);
  // the climbers
  const leaf = q === 3 ? null : q === 2 ? '#6a6a34' : '#3f6a32', rose = o.rose || ROSES[Math.floor(spotHash(c, x, z, 19) * 60) % ROSES.length];
  if (leaf) for (let i = 0; i < n * 2; i++) {
    const px = -len / 2 + (i / (n * 2 - 1)) * len, s = i % 2 ? 1 : -1;
    gb.sphere(px, 0.12 + (i % 3) * 0.015, (s * w) / 2, 0.028, leaf, 0, 0.9);
    gb.sphere(px + 0.02, 0.17, (s * w) / 4, 0.026, shade(leaf, 1.06), 0, 0.6);
    if (q === 1 || (q === 0 && i % 3 === 0)) gb.sphere(px, 0.14 + (i % 2) * 0.03, (s * w) / 2 + s * 0.012, 0.012, q === 0 ? '#9ab858' : rose);
  } else for (let i = 0; i < n; i++) gb.boxC(-len / 2 + (i * len) / (n - 1), 0.1, 0, 0.006, 0.12, 0.006, '#5a4a3a', 0.4);
  gb.pop();
}
// A sundial on a stone pillar.
export function sundial(c, x, z) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cbox(x, y - 0.01, z, 0.07, 0.025, 0.07, STONE_L, 0, 0.006);
  gb.cyl(x, y + 0.015, z, 0.018, 0.024, 0.07, 8, STONE_W);
  gb.cyl(x, y + 0.085, z, 0.032, 0.03, 0.01, 10, BRONZE);
  gb.boxC(x, y + 0.1, z, 0.004, 0.02, 0.026, BRONZE, 0.6);
}
export function birdbath(c, x, z) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cyl(x, y - 0.01, z, 0.016, 0.022, 0.07, 8, STONE_W);
  gb.cyl(x, y + 0.06, z, 0.045, 0.02, 0.02, 10, STONE_W);
  gb.cyl(x, y + 0.074, z, 0.036, 0.036, 0.01, 10, frozen(c) ? ICE : WATER);
}
// A stone urn on a pedestal, planted with the season's flowers.
export function urn(c, x, z, s = 1) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cbox(x, y - 0.01, z, 0.05 * s, 0.06 * s, 0.05 * s, STONE_L, 0, 0.006);
  gb.cyl(x, y + 0.05 * s, z, 0.03 * s, 0.014 * s, 0.04 * s, 8, STONE_W);
  blooms(c, x, z, 4, 0.016 * s);
}
// A drinking fountain: a little stone pillar with a basin and a cup.
export function drinkingFountain(c, x, z) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cyl(x, y - 0.01, z, 0.022, 0.028, 0.1, 8, STONE_L);
  gb.cyl(x, y + 0.09, z, 0.034, 0.024, 0.022, 8, STONE_W);
  gb.sphere(x, y + 0.13, z, 0.016, BRONZE);
}
// A park keeper's hut or a tea kiosk: a little timber house, facing +z.
export function kiosk(c, x, z, w, d, wall, roof, o = {}) {
  const { gb } = c;
  house(c, { x, z, w, d, h: 0.2, floors: 1, wall, roof, roofType: o.hip ? 'hip' : 'gable', rh: 0.11, nFront: 1, doorX: 0, chimney: !!o.chimney, fancy: false, lit: 0.7, noBack: true });
  if (o.awning) {
    for (let i = 0; i < 4; i++) gb.boxC(x - w / 2 + 0.03 + i * ((w - 0.06) / 3), 0.17, z + d / 2 + 0.035, (w - 0.06) / 3, 0.008, 0.07, i % 2 ? '#e9dfc9' : o.awning, -0.35);
    cafeTable(c, x - w * 0.3, z + d / 2 + 0.13, null);
    cafeTable(c, x + w * 0.3, z + d / 2 + 0.13, o.awning);
  }
}
// A greenhouse (lean-to or span): a dwarf brick wall, white glazing bars,
// glass that glows a little at night. Along x.
export function greenhouse(c, x, z, w, d, o = {}) {
  const { gb } = c;
  const brick = o.brick || '#9a5640', frame = o.frame || '#ece6da', h = o.h || 0.13;
  plinth(c, x, z, w, d);
  gb.cbox(x, 0, z, w, 0.04, d, brick, 0, 0.006);
  gb.glow(1.2, 1.25, 0.95, 1.3);
  gb.box(x, 0.04, z, w - 0.01, h - 0.04, d - 0.01, '#a9c4c8');
  gb.noGlow();
  const n = Math.max(2, Math.round(w / 0.07));
  for (let i = 0; i <= n; i++) gb.box(x - w / 2 + (i * w) / n, 0.04, z + d / 2 - 0.004, 0.006, h - 0.04, 0.008, frame);
  glassRoof(c, x, h, z, w, d, d * 0.45, false, n, 0.004);
  gb.box(x, h + d * 0.45, z, w + 0.01, 0.01, 0.012, frame);
  // the plants inside
  for (let i = 0; i < n; i++) gb.sphere(x - w / 2 + (i + 0.5) * (w / n), 0.07, z, 0.022, i % 2 ? '#4f7a3a' : '#6a9448', 0, 0.8);
}
// A garden shed: planks, a felt roof, a door and a window.
export function gardenShed(c, x, z, ry = 0, col = '#6e5034') {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.cbox(0, 0, 0, 0.11, 0.1, 0.08, col, 0, 0.006);
  gb.wedge(0, 0.1, 0, 0.13, 0.1, 0.03, '#3a3a3e', 0);
  gb.box(0.02, 0, 0.041, 0.035, 0.08, 0.006, shade(col, 0.75));
  gb.box(-0.03, 0.05, 0.041, 0.025, 0.025, 0.006, '#2f3a44');
  gb.pop();
}
export function waterButt(c, x, z) {
  const y = c.gy(x, z);
  c.gb.cyl(x, y, z, 0.022, 0.022, 0.05, 8, '#3f5a3a');
  c.gb.cyl(x, y + 0.05, z, 0.024, 0.024, 0.006, 8, '#2f4a2f');
}
export function wheelbarrowAt(c, x, z, ry = 0) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.boxC(0, 0.035, 0, 0.05, 0.022, 0.07, '#7a5a3c', 0.15);
  gb.cyl(0, 0.014, 0.045, 0.014, 0.014, 0.008, 8, '#3a3a3e', 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) gb.box(s * 0.02, 0, -0.03, 0.006, 0.03, 0.006, '#5e432c');
  gb.pop();
}
// A deck chair (striped canvas), out in summer.
export function deckchair(c, x, z, ry = 0, col = '#c8423a') {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.boxC(0, 0.03, 0.006, 0.04, 0.005, 0.07, '#86663f', 0.6);
  gb.boxC(0, 0.034, 0.002, 0.034, 0.006, 0.064, col, 0.6);
  gb.box(0, 0, 0.03, 0.04, 0.02, 0.006, '#86663f');
  gb.pop();
}
// Iron park railings round a rectangle, a gap for the gate at x = gateX on
// the +z side; the top rail follows the ground.
export function railings(c, x0, z0, x1, z1, gateX = null, col = IRON) {
  const { gb } = c, G = 0.08;
  const side = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.02) return;
    const n = Math.max(1, Math.round(len / 0.035)), ry = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= n; i++) { const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t; gb.box(px, c.gy(px, pz) - 0.005, pz, 0.006, 0.07, 0.006, col); }
    const m = Math.max(1, Math.round(len / 0.2));
    for (let i = 0; i < m; i++) { const t = (i + 0.5) / m, px = ax + (bx - ax) * t, pz = az + (bz - az) * t; gb.boxC(px, c.gy(px, pz) + 0.058, pz, 0.006, 0.006, len / m + 0.004, col, 0, ry); }
  };
  side(x0, z0, x1, z0); side(x1, z0, x1, z1); side(x0, z1, x0, z0);
  if (gateX == null) side(x0, z1, x1, z1);
  else { side(x0, z1, gateX - G, z1); side(gateX + G, z1, x1, z1); }
}

// ------------------------------------------------------------ monuments
// A monument on a stepped plinth: figure, rider, obelisk, column, cross,
// angel or urn. mat: bronze or marble.
export function monument(c, x, z, kind, s = 1, mat = BRONZE) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.push(x, Math.min(0, y), z, 0, s);
  plinth(c, 0, 0, 0.3, 0.3);
  gb.cbox(0, -0.02, 0, 0.28, 0.07 - Math.min(0, y) / s, 0.28, STONE, 0, 0.012);
  if (kind === 'obelisk') {
    gb.cbox(0, 0.05, 0, 0.16, 0.06, 0.16, STONE_L, 0, 0.008);
    gb.cyl(0, 0.11, 0, 0.042, 0.062, 0.42, 4, MARBLE, Math.PI / 4);
    gb.cone(0, 0.53, 0, 0.044, 0.05, 4, GOLD, Math.PI / 4);
  } else if (kind === 'column') {
    gb.cbox(0, 0.05, 0, 0.15, 0.08, 0.15, STONE_L, 0, 0.008);
    gb.cyl(0, 0.13, 0, 0.032, 0.036, 0.36, 10, MARBLE);
    gb.cbox(0, 0.49, 0, 0.085, 0.025, 0.085, MARBLE, 0, 0.004);
    gb.cyl(0, 0.515, 0, 0.026, 0.016, 0.05, 8, mat);
    gb.sphere(0, 0.575, 0, 0.022, mat, 0);
  } else if (kind === 'cross') {
    for (const [ty, w] of [[0.05, 0.22], [0.09, 0.16], [0.13, 0.1]]) gb.cbox(0, ty, 0, w, 0.04, w, STONE_L, 0, 0.006);
    gb.box(0, 0.17, 0, 0.04, 0.32, 0.04, STONE_W);
    gb.box(0, 0.4, 0, 0.14, 0.035, 0.04, STONE_W);
    // a wreath of poppies at its foot
    gb.cyl(0, 0.17, 0.06, 0.03, 0.03, 0.01, 10, '#3f6a32', 0, Math.PI / 2.5);
    for (let i = 0; i < 5; i++) gb.sphere(Math.cos(i * 1.26) * 0.026, 0.17 + Math.sin(i * 1.26) * 0.012, 0.066, 0.008, '#c8203a');
  } else if (kind === 'rider') {
    // a rider on a horse, side on to the street
    gb.cbox(0, 0.05, 0, 0.12, 0.14, 0.22, STONE_L, 0, 0.01);
    gb.push(0, 0.19, 0, 0, 0.85);
    gb.box(0, 0.075, 0, 0.07, 0.07, 0.17, mat);
    gb.box(0, 0.12, 0.1, 0.045, 0.07, 0.05, mat, 0, -0.5);
    gb.box(0, 0.15, 0.14, 0.04, 0.035, 0.07, mat);
    gb.box(0, 0.09, -0.09, 0.012, 0.05, 0.012, mat, 0, 0.6);
    for (const [lx, lz, a] of [[-0.025, 0.06, -0.5], [0.025, 0.06, 0], [-0.025, -0.06, 0], [0.025, -0.06, 0.2]]) gb.box(lx, 0, lz, 0.018, 0.08, 0.018, mat, 0, a);
    gb.cyl(0, 0.145, -0.01, 0.018, 0.024, 0.08, 6, mat);
    gb.sphere(0, 0.245, -0.01, 0.017, mat);
    gb.box(0.03, 0.17, 0.02, 0.012, 0.07, 0.012, mat, 0, 0, -0.7);
    gb.pop();
  } else if (kind === 'angel') {
    gb.cbox(0, 0.05, 0, 0.17, 0.2, 0.17, STONE_L, 0, 0.01);
    gb.cyl(0, 0.25, 0, 0.03, 0.05, 0.16, 8, MARBLE);
    gb.sphere(0, 0.44, 0, 0.026, MARBLE);
    for (const sx of [-1, 1]) gb.boxC(sx * 0.05, 0.38, -0.02, 0.07, 0.14, 0.012, MARBLE, -0.2, 0, sx * 0.35);
    gb.box(0.03, 0.4, 0.01, 0.01, 0.1, 0.01, MARBLE, 0, 0, -0.3);
  } else if (kind === 'urn') {
    gb.cbox(0, 0.05, 0, 0.15, 0.22, 0.15, STONE_L, 0, 0.01);
    gb.cyl(0, 0.27, 0, 0.05, 0.03, 0.03, 10, MARBLE);
    gb.sphere(0, 0.35, 0, 0.06, MARBLE, 1, 1.1);
    gb.cyl(0, 0.4, 0, 0.034, 0.05, 0.03, 10, MARBLE);
    gb.cone(0, 0.43, 0, 0.02, 0.05, 8, MARBLE);
  } else {
    // a figure on a pedestal, one arm raised
    gb.cbox(0, 0.05, 0, 0.19, 0.24, 0.19, STONE_L, 0, 0.012);
    gb.cbox(0, 0.29, 0, 0.23, 0.035, 0.23, STONE, 0, 0.008);
    gb.box(-0.026, 0.325, 0, 0.032, 0.13, 0.042, mat);
    gb.box(0.026, 0.325, 0, 0.032, 0.13, 0.042, mat);
    gb.cyl(0, 0.45, 0, 0.042, 0.053, 0.15, 8, mat);
    gb.sphere(0, 0.64, 0, 0.037, mat, 1);
    gb.box(0.052, 0.55, 0, 0.024, 0.14, 0.024, mat, 0, 0, -0.5);
    gb.box(-0.058, 0.49, 0, 0.024, 0.11, 0.024, mat, 0, 0, 0.2);
  }
  gb.pop();
}
// A fountain: a basin (round or quatrefoil) with a tiered centre, an
// obelisk or a figure in the middle; the jet's spray (c.fountain) at its top.
export function fountain(c, x, z, r, kind = 'tiers', stone = STONE_L) {
  const { gb } = c;
  const y = c.gy(x, z), ice = frozen(c);
  plinth(c, x, z, r * 2, r * 2);
  const base = Math.min(0, y) - 0.02;
  if (kind === 'quatre') for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    gb.cyl(x + ox * r * 0.45, base, z + oz * r * 0.45, r * 0.6, r * 0.62, 0.08 - base, 14, stone);
    gb.cyl(x + ox * r * 0.45, 0.05, z + oz * r * 0.45, r * 0.55, r * 0.55, 0.036, 14, ice ? ICE : WATER);
  } else {
    gb.cyl(x, base, z, r, r + 0.01, 0.08 - base, 18, stone);
    gb.cyl(x, 0.05, z, r - 0.02, r - 0.02, 0.036, 18, ice ? ICE : WATER);
  }
  let top;
  if (kind === 'obelisk') {
    gb.cbox(x, 0.05, z, 0.07, 0.06, 0.07, stone, 0, 0.006);
    gb.cyl(x, 0.11, z, 0.02, 0.03, 0.22, 4, MARBLE, Math.PI / 4);
    gb.cone(x, 0.33, z, 0.022, 0.03, 4, GOLD, Math.PI / 4);
    top = 0.2;
  } else if (kind === 'figure') {
    gb.cyl(x, 0.05, z, 0.04, 0.05, 0.12, 8, stone);
    gb.cyl(x, 0.17, z, 0.02, 0.026, 0.08, 6, BRONZE);
    gb.sphere(x, 0.27, z, 0.02, BRONZE);
    gb.box(x + 0.02, 0.22, z, 0.01, 0.07, 0.01, BRONZE, 0, 0, -0.7);
    top = 0.32;
  } else {
    gb.cyl(x, 0.05, z, r * 0.16, r * 0.22, r * 0.9, 8, stone);
    gb.cyl(x, 0.05 + r * 0.9, z, r * 0.5, r * 0.18, r * 0.16, 12, stone);
    gb.cyl(x, 0.05 + r * 1.06, z, r * 0.42, r * 0.42, 0.006, 12, ice ? ICE : '#5aa0c4');
    gb.cyl(x, 0.05 + r * 1.06, z, r * 0.08, r * 0.1, r * 0.4, 6, stone);
    gb.cyl(x, 0.05 + r * 1.46, z, r * 0.24, r * 0.08, r * 0.08, 10, stone);
    top = 0.05 + r * 1.6;
  }
  if (!ice) c.fountain = [x, top + 0.04, z];
}

// --------------------------------------------------------- the maze
// A hedge maze in a w × d rectangle of cols × rows cells, a different maze
// for every park (its own seed), with the way in on the +z side and a
// lookout in the middle. Returns the middle cell's centre.
export function maze(c, x, z, w, d, cols, rows, o = {}) {
  const r = ownRng(c, 41);
  const N = cols * rows, seen = new Uint8Array(N), walls = new Set();
  for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++) { walls.add(`v${i},${k}`); walls.add(`h${i},${k}`); }
  // carve with a random walk from the middle (a perfect maze: one way to the middle)
  const mid = Math.floor(rows / 2) * cols + Math.floor(cols / 2), stack = [mid];
  seen[mid] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1], ci = cur % cols, ck = (cur / cols) | 0, next = [];
    if (ci > 0 && !seen[cur - 1]) next.push([cur - 1, `v${ci},${ck}`]);
    if (ci < cols - 1 && !seen[cur + 1]) next.push([cur + 1, `v${ci + 1},${ck}`]);
    if (ck > 0 && !seen[cur - cols]) next.push([cur - cols, `h${ci},${ck}`]);
    if (ck < rows - 1 && !seen[cur + cols]) next.push([cur + cols, `h${ci},${ck + 1}`]);
    if (!next.length) { stack.pop(); continue; }
    const [n, wall] = next[r.int(0, next.length - 1)];
    walls.delete(wall); seen[n] = 1; stack.push(n);
  }
  const cw = w / cols, cd = d / rows, x0 = x - w / 2, z0 = z - d / 2, hh = o.h || 0.07, t = o.t || 0.035;
  const gate = r.int(0, cols - 1);
  const wall = (ax, az, bx, bz) => hedge(c, (ax + bx) / 2, (az + bz) / 2, Math.abs(bx - ax) + t, Math.abs(bz - az) + t, hh);
  // inside walls (merged into runs where they line up)
  for (let i = 1; i < cols; i++) { let run = null; for (let k = 0; k <= rows; k++) { const on = k < rows && walls.has(`v${i},${k}`); if (on && run === null) run = k; if (!on && run !== null) { wall(x0 + i * cw, z0 + run * cd, x0 + i * cw, z0 + k * cd); run = null; } } }
  for (let k = 1; k < rows; k++) { let run = null; for (let i = 0; i <= cols; i++) { const on = i < cols && walls.has(`h${i},${k}`); if (on && run === null) run = i; if (!on && run !== null) { wall(x0 + run * cw, z0 + k * cd, x0 + i * cw, z0 + k * cd); run = null; } } }
  // the outside, with the way in at the front
  wall(x0, z0, x0 + w, z0); wall(x0, z0, x0, z0 + d); wall(x0 + w, z0, x0 + w, z0 + d);
  if (gate > 0) wall(x0, z0 + d, x0 + gate * cw, z0 + d);
  if (gate < cols - 1) wall(x0 + (gate + 1) * cw, z0 + d, x0 + w, z0 + d);
  // gravel between the hedges
  c.gb.box(x, c.gy(x, z) - 0.009, z, w - 0.02, 0.01, d - 0.02, o.floor || '#c8b894');
  return { x: x0 + (Math.floor(cols / 2) + 0.5) * cw, z: z0 + (Math.floor(rows / 2) + 0.5) * cd, gate: x0 + (gate + 0.5) * cw };
}

// ------------------------------------------------------- allotments
// One allotment plot (w × d, rows along x): the season's crops, a bean
// wigwam or a row of sunflowers by its seed.
export function allotPlot(c, x, z, w, d, k = 0) {
  const { gb } = c;
  const y = c.gy(x, z), q = seasonAt(c, spotHash(c, x, z, 23));
  gb.box(x, y - 0.01, z, w, 0.026, d, k % 2 ? SOIL : SOIL_D);
  const rows = Math.max(2, Math.round(d / 0.06)), crop = k % 4;
  for (let i = 0; i < rows; i++) {
    const rz = z - d / 2 + (i + 0.5) * (d / rows);
    // a row of the season's crop along each furrow (seedlings in spring;
    // in winter only the leeks are left)
    if (q === 3) {
      if (crop === 1 && i % 2 === 0) for (let j = 0; j < 4; j++) gb.box(x - w * 0.36 + j * w * 0.24, y + 0.01, rz, 0.01, 0.04, 0.01, '#6f8a5a');
      continue;
    }
    const s = q === 0 ? 0.5 : q === 2 && crop === 0 ? 0.7 : 1;
    const col = crop === 0 ? '#4f8a3a' : crop === 1 ? '#6a9a4a' : crop === 2 ? '#7aa04a' : '#5f9a42';
    gb.cbox(x, y + 0.008, rz, w - 0.05, 0.022 * s, 0.026 * s, col, 0, 0.008);
    const n = Math.max(2, Math.round(w / 0.09));
    for (let j = 0; j < n; j++) {
      const px = x - w / 2 + (j + 0.5) * (w / n);
      gb.sphere(px, y + 0.026 * s, rz, 0.018 * s, shade(col, 1.08), 0, 0.8);
      if (q === 2 && crop === 3 && (i + j) % 2 === 0) gb.sphere(px + 0.02, y + 0.018, rz + 0.012, 0.02, '#d97a2a', 0, 0.8);   // pumpkins
    }
  }
  // canes for the beans, or sunflowers, in summer
  if (q === 1 || q === 0) {
    if (k % 3 === 0) {
      const bx = x + w * 0.3, bz = z;
      for (let i = 0; i < 4; i++) { const a = i * 1.57; gb.boxC(bx + Math.cos(a) * 0.02, y + 0.06, bz + Math.sin(a) * 0.02, 0.004, 0.13, 0.004, '#a8925a', Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
      if (q === 1) gb.cone(bx, y + 0.02, bz, 0.035, 0.1, 6, '#4f7a3a');
    } else if (k % 3 === 1 && q === 1) {
      for (let i = 0; i < 3; i++) { const sx = x - w * 0.3 + i * 0.035; gb.box(sx, y, z - d / 2 + 0.02, 0.006, 0.12, 0.006, '#4f7a3a'); gb.cyl(sx, y + 0.12, z - d / 2 + 0.024, 0.018, 0.018, 0.006, 8, '#e8b830', 0, Math.PI / 2); }
    }
  }
}
// A scarecrow in a battered hat.
export function scarecrow(c, x, z) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.box(x, y, z, 0.008, 0.13, 0.008, '#6e5034');
  gb.box(x, y + 0.09, z, 0.1, 0.008, 0.008, '#6e5034');
  gb.box(x, y + 0.06, z, 0.04, 0.05, 0.02, '#7a5a8a');
  gb.sphere(x, y + 0.125, z, 0.016, '#d9be6a');
  gb.cyl(x, y + 0.135, z, 0.026, 0.026, 0.004, 8, '#4a3a2a');
  gb.cyl(x, y + 0.139, z, 0.014, 0.016, 0.018, 8, '#4a3a2a');
}
export function beehive(c, x, z) {
  const y = c.gy(x, z);
  c.gb.cbox(x, y, z, 0.04, 0.025, 0.04, '#e3d8b8', 0, 0.004);
  c.gb.cbox(x, y + 0.025, z, 0.036, 0.022, 0.036, '#e3d8b8', 0, 0.004);
  c.gb.hip(x, y + 0.047, z, 0.044, 0.044, 0.018, '#8a6a48', 0.004);
}

// A clipped hedge in the season's green (a little duller in winter).
export function phedge(c, x, z, w, d, h = 0.075) {
  c.gb.cbox(x, c.gy(x, z) - 0.01, z, w, h + 0.01, d, hedgeCol(c), 0, 0.02);
}
// Hedges round a rectangle, a gap of `gap` at x = gateX on the +z side.
export function hedgeRound(c, x0, z0, x1, z1, gateX = 0, gap = 0.14, h = 0.06) {
  const t = 0.045;
  phedge(c, (x0 + x1) / 2, z0, x1 - x0, t, h);
  phedge(c, x0, (z0 + z1) / 2, t, z1 - z0, h);
  phedge(c, x1, (z0 + z1) / 2, t, z1 - z0, h);
  if (gateX - gap / 2 > x0 + 0.02) phedge(c, (x0 + gateX - gap / 2) / 2, z1, gateX - gap / 2 - x0, t, h);
  if (x1 > gateX + gap / 2 + 0.02) phedge(c, (gateX + gap / 2 + x1) / 2, z1, x1 - gateX - gap / 2, t, h);
}

// ================================================================ models
export const PARK_MODELS = {};
const M = PARK_MODELS;

// Green Space. Each green has its own great tree, pump, maypole or pair of
// yews in one corner (where it stays as the green grows); the Garden lays
// out beds round it in its own way (quarters round a birdbath, long
// borders, a round bed with a sundial, or a pergola walk), and the Park adds
// its own centrepiece in the far corner: a pond, a gazebo, a fountain, a
// glasshouse or a tea kiosk, with lamps.
M.garden = (c, L) => {
  const { gb, rng } = c;
  c.work = [-0.4, -0.4, 0.4, 0.4];
  const r = ownRng(c, 1);
  const sx = r.chance(0.5) ? 1 : -1, sz = r.chance(0.6) ? -1 : 1;   // the anchor's corner (mostly at the back)
  const ax = sx * 0.24, az = sz * 0.24, cx = -ax, cz = -az;
  const anchor = ownPick(c, ['oak', 'oak', 'cherry', 'copper', 'pump', 'maypole', 'yews', 'lime'], 2);
  const style = ownPick(c, ['quarters', 'borders', 'round', 'pergola'], 3);
  const centre = ownPick(c, ['pond', 'gazebo', 'fountain', 'glasshouse', 'kiosk'], 4);
  const paint = ownPick(c, PARK_PAINT, 5);
  // the anchor
  if (anchor === 'pump') {
    const y = c.gy(ax, az);
    gb.cbox(ax, y - 0.01, az + 0.05, 0.14, 0.05, 0.07, STONE_L, 0, 0.008);
    gb.box(ax, y + 0.03, az + 0.05, 0.12, 0.012, 0.05, frozen(c) ? ICE : WATER);
    gb.cbox(ax, y - 0.01, az - 0.03, 0.05, 0.16, 0.05, paint === '#e8e0d0' ? '#2f4a3a' : paint, 0, 0.006);
    gb.box(ax, y + 0.12, az - 0.01, 0.012, 0.012, 0.06, IRON);
    gb.boxC(ax + 0.03, y + 0.15, az - 0.03, 0.07, 0.008, 0.008, IRON, 0, 0, -0.4);
    parkTree(c, ax + sx * 0.12, az - sz * 0.15, 0.9, 'lime');
  } else if (anchor === 'maypole') {
    const y = c.gy(ax, az), q = seasonAt(c, 0.5);
    gb.cyl(ax, y - 0.01, az, 0.008, 0.012, 0.36, 6, '#ece6da');
    gb.sphere(ax, y + 0.36, az, 0.014, GOLD);
    // ribbons and a garland in spring and summer
    if (q <= 1) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; gb.boxC(ax + Math.cos(a) * 0.06, y + 0.2, az + Math.sin(a) * 0.06, 0.004, 0.3, 0.004, ['#c8423a', '#3f6a8f', '#e8b84a', '#e88fae', '#4f7a45', '#f2ede0'][i], Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38); }
    gb.cyl(ax, y + 0.3, az, 0.026, 0.026, 0.012, 8, q <= 1 ? '#4f7a3a' : '#6a5a3a');
  } else if (anchor === 'yews') {
    for (const s of [-1, 1]) parkTree(c, ax + s * 0.09, az, 1.1, 'yew');
    bench(c, ax, az - sz * 0.11, sz < 0 ? 0 : Math.PI);
  } else parkTree(c, ax, az, L ? 1.45 : 1.3, anchor === 'oak' ? 'round' : anchor);
  // a seat round the tree, or a bench beside the anchor, facing the green
  if (anchor !== 'yews' && anchor !== 'maypole' && anchor !== 'pump' && L >= 1) {
    const y = c.gy(ax, az);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; gb.boxC(ax + Math.cos(a) * 0.075, y + 0.04, az + Math.sin(a) * 0.075, 0.07, 0.012, 0.035, '#7a5636', 0, -a + Math.PI / 2); }
  } else if (anchor !== 'yews') bench(c, ax - sx * 0.16, az - sz * 0.02, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  spot(c, ax - sx * 0.14, az - sz * 0.12);
  // the open green: bushes and flowers on the other corners
  if (L === 0) {
    bush(c, -ax, az, 1.1); shrub(c, ax, -az, 0.9);
    blooms(c, cx, cz, 6, 0.08);
    bench(c, 0, 0.36, Math.PI);
    spot(c, 0, 0.2); spot(c, cx, cz);
    return;
  }
  // the Garden's beds
  const ox = -ax, oz = az, px = ax, pz = -az;   // the two side corners
  if (style === 'quarters') {
    walk(c, [[-0.42, 0], [0.42, 0]], 0.08); walk(c, [[0, -0.42], [0, 0.44]], 0.08);
    bed(c, ox, oz, 0.22, 0.22, { edge: 'box' });
    bed(c, px, pz, 0.22, 0.22, { edge: 'box' });
    birdbath(c, 0, 0);
    if (L === 1) bed(c, cx, cz, 0.22, 0.22, { edge: 'box' });
  } else if (style === 'borders') {
    // a long border across the back, a lawn walk down the middle
    const bz = -0.38;
    bed(c, 0, bz, 0.78, 0.1, { edge: 'none' });
    for (let i = 0; i < 4; i++) shrub(c, -0.3 + i * 0.2, bz - 0.02, 0.6);
    walk(c, [[0, bz + 0.1], [0, 0.44]], 0.1, GRAVEL_D);
    bed(c, ox * 1.1, oz > 0 ? 0.26 : -0.05, 0.12, 0.3, {});
    if (L === 1) bed(c, cx * 1.1, cz > 0 ? 0.26 : -0.05, 0.12, 0.3, {});
  } else if (style === 'round') {
    bed(c, 0, 0.04, 0.3, 0.3, { round: true, edge: 'stone', bands: true, rings: true });
    sundial(c, 0, 0.04);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; roseBush(c, Math.cos(a) * 0.21, 0.04 + Math.sin(a) * 0.21, 0.8); }
    ringWalk(c, 0, 0.04, 0.28, 0.06);
  } else {
    // a pergola walk along one side, borders beside it
    const wx = ox * 1.15;
    walk(c, [[wx, -0.42], [wx, 0.44]], 0.09);
    arbour(c, wx, -0.05, 0.5, 0.12, Math.PI / 2, { post: shade(paint, 1.4) });
    bed(c, wx - Math.sign(wx) * 0.13, -0.05, 0.08, 0.5, {});
    bench(c, 0, 0.3, Math.PI);
  }
  if (L === 1) { bench(c, cx * 0.4, 0.36, Math.PI); spot(c, 0, 0.25); spot(c, cx * 0.6, cz * 0.6); return; }
  // the Park's centrepiece in the far corner, lamps, and a hedge round it
  if (centre === 'pond') {
    const ly = water(c, [[cx, cz, 0.15], [cx - sx * 0.06, cz - 0.07 * sz, 0.1]]);
    reeds(c, cx - sx * 0.12, cz + sz * 0.06, ly, 5); lilies(c, cx, cz, ly, 3, 0.06);
    duck(c, cx + 0.04, ly, cz - 0.03, rng.float(0, 6)); duck(c, cx - 0.05, ly, cz + 0.02, rng.float(0, 6), '#f2ede0');
  } else if (centre === 'gazebo') {
    const gy = c.gy(cx, cz);
    gb.cyl(cx, gy - 0.02, cz, 0.15, 0.16, 0.05, 6, '#ddd2bc');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; gb.box(cx + Math.cos(a) * 0.13, gy + 0.03, cz + Math.sin(a) * 0.13, 0.018, 0.17, 0.018, '#ece4d4'); }
    gb.cone(cx, gy + 0.2, cz, 0.18, 0.12, 6, ownPick(c, ['#8a432e', '#3f5a46', '#5a5f63', '#6a4a6a'], 6));
    gb.sphere(cx, gy + 0.33, cz, 0.012, GOLD);
  } else if (centre === 'fountain') {
    fountain(c, cx, cz, 0.13, ownPick(c, ['tiers', 'figure', 'obelisk'], 7));
  } else if (centre === 'glasshouse') {
    gb.push(cx, 0, cz, sz < 0 ? 0 : Math.PI);
    greenhouse(c, 0, 0, 0.3, 0.16, {});
    gb.pop();
  } else {
    gb.push(cx, 0, cz, cz < 0 ? 0 : Math.PI);
    kiosk(c, 0, 0, 0.2, 0.14, ownPick(c, ['#ece6da', '#c9d3b8', '#e2b9a8'], 8), ownPick(c, ['#3f5a46', '#8a432e', '#5a5f63'], 9), { awning: ownPick(c, ['#a8473a', '#3f6a8f', '#4f7a45'], 10) });
    gb.pop();
  }
  lamp(c, cx * 0.2 + 0.02, 0.4, 0.3);
  if (ownPick(c, [0, 1], 11)) lamp(c, -0.4, ax > 0 ? -0.05 : 0.05, 0.28);
  bench(c, -cx * 0.3, 0.38, Math.PI);
  spot(c, 0, 0.28); spot(c, -cx * 0.3, 0.26);
};

// Pond: one round pool, a bean of two or a long one; reeds, ducks, a willow
// or a bench by the water. The Lily Pond has water lilies, a stone edge or
// a little bridge over a narrows, an island with a duck house and a lamp.
M.pond = (c, L) => {
  const { gb } = c;
  const shape = ownPick(c, ['round', 'bean', 'long'], 1), r = ownRng(c, 2);
  const mx = r.float(-0.04, 0.04), mz = -0.05 + r.float(-0.03, 0.02), side = r.chance(0.5) ? 1 : -1;
  const pools = shape === 'round' ? [[mx, mz, 0.3]] : shape === 'bean' ? [[mx - side * 0.12, mz + 0.02, 0.23], [mx + side * 0.13, mz - 0.04, 0.2]] : [[mx - 0.17, mz, 0.18], [mx, mz - 0.02, 0.2], [mx + 0.17, mz + 0.01, 0.17]];
  const formal = L >= 1 && ownPick(c, [false, true], 3);
  const ly = water(c, pools, { stone: formal });
  const [bx, bz, br] = pools[0];
  reeds(c, bx - side * br * 0.7, bz - br * 0.5, ly, 6);
  if (!formal) reeds(c, pools[pools.length - 1][0] + side * 0.1, pools[pools.length - 1][1] - 0.1, ly, 4);
  // the ducks (fewer in winter, sat on the ice)
  const ducks = seasonAt(c, 0.5) === 3 ? 1 : 3;
  for (let i = 0; i < ducks; i++) { const [px, pz] = pools[i % pools.length]; duck(c, px + r.float(-0.06, 0.06), ly, pz + r.float(-0.05, 0.05), r.float(0, 6.28), i === 2 ? '#f2ede0' : '#8a6a48'); }
  // by the water: a willow or a tree, a bench facing the pond
  const tx = -side * 0.33, tz = -0.33;
  parkTree(c, tx, tz, 0.85, ownPick(c, ['willow', 'willow', 'round', 'birch'], 4));
  bench(c, side * 0.2, 0.36, Math.PI);
  spot(c, side * 0.2, 0.28); spot(c, -side * 0.15, 0.3);
  if (L >= 1) {
    lilies(c, bx + side * 0.02, bz + 0.03, ly, 5, 0.08);
    if (shape === 'round' || !ownPick(c, [false, true], 5)) {
      // an island with a duck house
      const ix = bx + side * 0.06, iz = bz - 0.04;
      gb.cyl(ix, ly - 0.03, iz, 0.06, 0.07, 0.045, 10, '#6f8a4a');
      gb.cbox(ix, ly + 0.012, iz, 0.05, 0.035, 0.04, '#86663f', 0.4, 0.004);
      gb.roof(ix, ly + 0.047, iz, 0.06, 0.05, 0.025, 0.06, '#8a432e', 0.4);
    } else {
      // a little bridge over the narrows between the pools
      const [ax, az] = pools[0], [qx, qz] = pools[1], m = [(ax + qx) / 2, (az + qz) / 2];
      footbridge(c, m[0], m[1], 0.2, Math.atan2(qx - ax, qz - az) + Math.PI / 2, ly, ownPick(c, ['#ece6da', '#8a3a2a'], 6));
    }
    lamp(c, -side * 0.12, 0.42, 0.28);
    shrub(c, side * 0.38, -0.36, 0.9);
  } else bush(c, side * 0.38, -0.36, 1);
};

// Rose Garden: roses round a sundial in a ring, four square beds round an
// urn, or an avenue of roses to a seat at the back, all inside a clipped
// hedge with a gap to the street. The Rose Arbour puts arches of climbing
// roses over the walks and a seat in an arbour.
M.rosegarden = (c, L) => {
  const { gb } = c;
  const plan = ownPick(c, ['ring', 'quarters', 'avenue'], 1);
  const pal = [ownPick(c, ROSES, 2), ownPick(c, ROSES, 3)];
  const rose = (x, z, s = 1, i = 0) => roseBush(c, x, z, s, pal[Math.abs(Math.round(i)) % 2]);
  hedgeRound(c, -0.44, -0.44, 0.44, 0.44, 0, 0.14, L ? 0.07 : 0.05);
  if (plan === 'ring') {
    ringWalk(c, 0, 0, 0.26, 0.07);
    walk(c, [[0, 0.26], [0, 0.44]], 0.08);
    sundial(c, 0, 0);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rose(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.85, i); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; if (Math.abs(Math.cos(a)) < 0.25 && Math.sin(a) > 0) continue; rose(Math.cos(a) * 0.37, Math.sin(a) * 0.37, 0.8, i + 1); }
    spot(c, 0.2, 0.2); spot(c, -0.2, -0.2);
  } else if (plan === 'quarters') {
    walk(c, [[-0.4, 0], [0.4, 0]], 0.08); walk(c, [[0, -0.4], [0, 0.44]], 0.08);
    urn(c, 0, 0, 1.1);
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
      const x = qx * 0.21, z = qz * 0.21;
      gb.box(x, c.gy(x, z) - 0.01, z, 0.27, 0.025, 0.27, SOIL);
      phedge(c, x, z + qz * 0.13, 0.27, 0.02, 0.025);
      for (const [dx, dz] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07], [0, 0]]) rose(x + dx, z + dz, 0.8, qx + qz + (dx > 0 ? 1 : 0));
    }
    spot(c, 0.08, 0.3); spot(c, -0.08, -0.3);
  } else {
    // an avenue of roses to a seat at the back
    walk(c, [[0, 0.44], [0, -0.3]], 0.1);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) rose(s * 0.1, 0.32 - i * 0.16, 0.85, i + s);
    for (const s of [-1, 1]) bed(c, s * 0.3, 0, 0.16, 0.6, { pal });
    bench(c, 0, -0.36, 0);
    spot(c, 0, -0.26); spot(c, 0, 0.2);
  }
  if (L >= 1) {
    if (plan === 'avenue') arbour(c, 0, 0.1, 0.36, 0.14, Math.PI / 2, { rose: pal[0] });
    else if (plan === 'ring') for (const a of [Math.PI / 2, 0, Math.PI]) arbour(c, Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.1, 0.1, a + Math.PI / 2, { rose: pal[1] });
    else { arbour(c, 0, 0.3, 0.12, 0.1, Math.PI / 2, { rose: pal[0] }); arbour(c, 0, -0.3, 0.12, 0.1, Math.PI / 2, { rose: pal[1] }); }
    // a seat in an arbour in a back corner
    const s = ownPick(c, [-1, 1], 4), ax = s * 0.33, az = -0.33;
    if (plan !== 'avenue') {
      arbour(c, ax, az, 0.16, 0.1, 0, { rose: pal[1] });
      bench(c, ax, az, 0);
    }
    lamp(c, 0.12, 0.42, 0.28);
  } else bench(c, ownPick(c, [-0.28, 0.28], 5), 0.36, Math.PI);
};

// Bandstand: the stand itself (its ironwork, roof and plinth in the park's
// own colours) at the back of a lawn, deck chairs out in summer, trees and
// a bench. The Band Pavilion is a bigger, grander stand behind railings,
// with chairs set out in rows and lamps.
M.bandstand = (c, L) => {
  const { rng } = c;
  const iron = ownPick(c, [IRON_G, '#2f3a5a', '#e8e0d0', '#5a2a2a'], 1), roof = ownPick(c, ['#3f5a46', '#8a432e', '#2f4a6a', '#6a4a6a', '#5a5f63'], 2);
  const side = ownPick(c, [-1, 0, 1], 3), bx = side * 0.12, bz = -0.14, R = L ? 0.2 : 0.17;
  bandstand(c, bx, bz, R, { iron, roof, trim: iron === '#e8e0d0' ? '#2f4a3a' : '#ece6da', base: L ? '#9a5640' : STONE_L });
  // the audience: deck chairs on the lawn in summer, benches the rest of the year
  const q = seasonAt(c, 0.5), chairs = ownPick(c, ['#c8423a', '#3f6a8f', '#4f7a45', '#d8a630'], 4);
  if (q === 1 || (L && q === 0)) {
    const rows = L ? [[0.2, 4], [0.32, 5]] : [[0.24, 4]];
    for (const [z, n] of rows) for (let i = 0; i < n; i++) deckchair(c, bx + (i - (n - 1) / 2) * 0.09 + rng.float(-0.01, 0.01), z, Math.PI + rng.float(-0.2, 0.2), i % 2 ? '#e9dfc9' : chairs);
  } else { bench(c, bx - 0.12, 0.3, Math.PI); bench(c, bx + 0.12, 0.3, Math.PI); }
  for (const s of [-1, 1]) if (Math.abs(s * 0.33 - bx) > 0.25) parkTree(c, s * 0.33, -0.32, 1.05, ownPick(c, ['round', 'lime', 'copper'], 5 + s));
  spot(c, bx - 0.2, 0.36); spot(c, bx + 0.2, 0.36); spot(c, -side * 0.32, 0.12);
  if (L) {
    if (!c.inner) railings(c, -0.44, -0.44, 0.44, 0.44, 0, iron === '#e8e0d0' ? '#2f2f33' : iron);
    lamp(c, -0.36, 0.38, 0.3); lamp(c, 0.36, 0.38, 0.3);
    bed(c, side ? -side * 0.32 : 0.32, 0.05, 0.12, 0.3, {});
  } else { shrub(c, side ? -side * 0.34 : -0.34, 0.1, 0.9); lamp(c, side ? -side * 0.36 : 0.36, 0.36, 0.28); }
};

// Allotments: plots of the season's vegetables either side of a grass path,
// sheds, water butts, a scarecrow and a wheelbarrow, a rail fence round
// with a gate. Allotment Gardens have more plots and sheds, a greenhouse
// and beehives.
M.allotment = (c, L) => {
  const { gb, rng } = c;
  const along = ownPick(c, [true, false], 1), r = ownRng(c, 2);
  fence(c, -0.45, -0.45, 0.45, 0.45, '#7a5f42', { x: 0, z: 0.45, w: 0.08 });
  walk(c, [[0, 0.44], [0, -0.42]], 0.06, '#8a9a5a');
  // the plots, in two columns either side of the path (or two rows across it)
  const nz = L ? 3 : 2, pw = 0.36, pd = (0.8 - (nz - 1) * 0.04) / nz;
  gb.push(0, 0, 0, along ? 0 : Math.PI / 2);
  let k = r.int(0, 3);
  for (let i = 0; i < nz; i++) for (const s of [-1, 1]) {
    const z = -0.4 + pd / 2 + i * (pd + 0.04);
    allotPlot(c, s * 0.22, z + (i === 0 ? 0.04 : 0), pw, pd - (i === 0 ? 0.08 : 0), k++);
  }
  gb.pop();
  const sheds = ['#6e5034', '#4f6a7a', '#5e7a5a', '#8a4a3a', '#7a6a4a'];
  gardenShed(c, -0.34, -0.38, 0, ownPick(c, sheds, 3));
  waterButt(c, -0.25, -0.4);
  if (L) {
    gardenShed(c, 0.34, -0.38, 0, ownPick(c, sheds, 4));
    gb.push(0.3, 0, 0.36, Math.PI);
    greenhouse(c, 0, 0, 0.16, 0.1, {});
    gb.pop();
    beehive(c, -0.38, 0.32); beehive(c, -0.32, 0.36);
    waterButt(c, 0.25, -0.4);
  }
  scarecrow(c, ownPick(c, [-0.2, 0.2], 5), ownPick(c, [-0.05, 0.12], 6));
  wheelbarrowAt(c, 0.06, ownPick(c, [-0.1, 0.2], 7), rng.float(0, 6));
  for (const z of [-0.2, 0.15]) spot(c, 0, z);
  spot(c, -0.22, 0.05); spot(c, 0.22, -0.1);
};

// Herb Garden: labelled order beds round a sundial, a well or a statue of
// the founding physician, inside a low hedge. The Physic Garden is walled
// in brick, with more beds, a potting shed, a little glasshouse and a
// specimen tree.
M.physic = (c, L) => {
  const { gb } = c;
  const centre = ownPick(c, ['sundial', 'well', 'statue'], 1), r = ownRng(c, 2);
  const HERBS = [['#7a9a6a', '#8aa878'], ['#5f8a4a', '#6a9a52'], ['#9aa890', '#a8b4a0'], ['#4f7a3a', '#5a8a44']];
  if (L) {
    // a brick wall round, with a gate in it
    const wall = ownPick(c, ['#9a5640', '#a3624a', '#8c4c38'], 3);
    for (const [x, z, w, d] of [[0, -0.45, 0.9, 0.04], [-0.45, 0, 0.04, 0.9], [0.45, 0, 0.04, 0.9], [-0.27, 0.45, 0.36, 0.04], [0.27, 0.45, 0.36, 0.04]]) gb.cbox(x, c.gy(x, z) - 0.01, z, w, 0.1, d, wall, 0, 0.006);
    gatePiers(c, 0, 0.45, 0.16, wall);
  } else hedgeRound(c, -0.44, -0.44, 0.44, 0.44, 0, 0.14, 0.045);
  walk(c, [[-0.4, 0.02], [0.4, 0.02]], 0.07, GRAVEL_D); walk(c, [[0, -0.4], [0, 0.44]], 0.07, GRAVEL_D);
  // the order beds: each herb in its own block, with a white label
  const beds = L ? [[-0.27, -0.27], [-0.12, -0.27], [0.12, -0.27], [0.27, -0.27], [-0.27, 0.27], [-0.12, 0.27], [0.12, 0.27], [0.27, 0.27], [-0.27, -0.12], [0.27, -0.12], [-0.27, 0.15], [0.27, 0.15]]
    : [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.25], [0.22, 0.25], [-0.22, -0.02], [0.22, -0.02]];
  const q = seasonAt(c, 0.5), shift = r.int(0, 3);
  beds.forEach(([x, z], i) => {
    const y = c.gy(x, z), w = L ? 0.11 : 0.2, d = L ? 0.11 : 0.15;
    gb.cbox(x, y - 0.01, z, w, 0.035, d, '#8a6a48', 0, 0.004);
    gb.box(x, y + 0.02, z, w - 0.02, 0.006, d - 0.02, SOIL);
    const herb = HERBS[(i + shift) % 4];
    const n = q === 3 ? 1 : L ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const hx = x + (k - (n - 1) / 2) * (w / n), tall = (i + k) % 5 === 0;
      gb.sphere(hx, y + 0.04, z, (tall ? 0.022 : 0.026) * (q === 0 ? 0.75 : 1), q === 3 ? '#6a7466' : herb[k % 2], 0, tall ? 1.8 : 0.8);
      if (q === 1 && (i + k) % 3 === 0) gb.sphere(hx, y + (tall ? 0.085 : 0.065), z, 0.012, ['#8a6ac0', '#f2ede0', '#e8c040', '#d9536b'][(i + k) % 4]);
    }
    gb.box(x + w / 2 - 0.012, y + 0.02, z + d / 2 - 0.006, 0.014, 0.03, 0.004, '#f2ede0');
  });
  if (centre === 'sundial') sundial(c, 0, 0.02);
  else if (centre === 'well') {
    const y = c.gy(0, 0.02);
    gb.cyl(0, y - 0.02, 0.02, 0.06, 0.065, 0.07, 10, STONE_L);
    for (const s of [-1, 1]) gb.box(s * 0.05, y + 0.04, 0.02, 0.012, 0.13, 0.012, '#4e3a2a');
    gb.gable(0, y + 0.17, 0.02, 0.14, 0.1, 0.05, '#6e4a2c', '#8a432e', 0.015);
  } else monument(c, 0, 0.02, 'figure', 0.55, BRONZE);
  if (L) {
    gardenShed(c, -0.34, -0.38, 0, '#5e7a5a');
    gb.push(0.28, 0, -0.38, 0);
    greenhouse(c, 0, 0, 0.24, 0.1, {});
    gb.pop();
    parkTree(c, ownPick(c, [-0.36, 0.36], 4), 0.36, 0.9, ownPick(c, ['copper', 'birch', 'cherry'], 5));
  } else bench(c, ownPick(c, [-0.3, 0.3], 6), 0.38, Math.PI);
  spot(c, 0.05, 0.3); spot(c, -0.05, -0.25); spot(c, 0.3, 0.05);
};

// ----------------------------------------------------- play and games
const PAINT = ['#c8423a', '#3f6a8f', '#4f7a45', '#d8a630', '#7a5a8a'];
const LINE = '#f2efe6';

// A pirate ship to climb: a hull on the sand, a mast with a crow's nest and
// a sail in summer, a plank and a slide off the stern, bow along +x.
function playShip(c, x, z, ry, paint) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.box(0, 0, 0, 0.3, 0.012, 0.14, '#e0cf9a');
  gb.roof(0.02, 0.012, 0, 0.26, 0.12, 0.05, 0.14, '#86663f');
  gb.box(0.02, 0.012, 0, 0.24, 0.06, 0.1, '#7d5b3b');
  gb.box(0.0, 0.07, 0, 0.26, 0.012, 0.12, '#a07a50');
  gb.wedge(0.14, 0.07, 0, 0.06, 0.12, 0.05, '#7d5b3b', -Math.PI / 2);
  for (const s of [-1, 1]) gb.box(0, 0.082, s * 0.058, 0.24, 0.025, 0.008, paint);
  gb.box(0.02, 0.082, 0, 0.012, 0.3, 0.012, '#5e432c');
  gb.cyl(0.02, 0.3, 0, 0.03, 0.026, 0.03, 8, '#7d5b3b');
  if (seasonAt(c, 0.5) <= 1) gb.boxC(0.02, 0.21, 0.004, 0.006, 0.12, 0.1, '#f2ede0', 0, Math.PI / 2, 0);
  gb.box(0.02, 0.36, 0, 0.004, 0.03, 0.03, '#2a2a2e');
  slide(c, -0.18, 0, -Math.PI / 2, '#d8a630');
  gb.pop();
}
// A tyre swing hanging from a low bough.
function tyreSwing(c, x, z) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.boxC(x, y + 0.24, z, 0.14, 0.012, 0.012, BARK, 0, 0, 0.2);
  gb.box(x + 0.04, y + 0.06, z, 0.003, 0.18, 0.003, '#c8b088');
  gb.cyl(x + 0.04, y + 0.06, z, 0.025, 0.025, 0.012, 10, '#2a2a2e', 0, Math.PI / 2);
}
// A spring rocking horse.
function springer(c, x, z, ry, col) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.cyl(0, 0, 0, 0.006, 0.006, 0.03, 5, '#8a8a84');
  gb.box(0, 0.03, 0, 0.022, 0.025, 0.06, col);
  gb.box(0, 0.055, 0.03, 0.016, 0.03, 0.016, col);
  gb.pop();
}

// Swing Green: a pair of swings on a green, a see-saw or a tyre swing from
// a tree, a bench. The Playground has a sandpit, a slide, a roundabout or
// spring horses and railings round it; the Adventure Playground a wooden
// fort or a pirate ship to climb, big swings and a shelter for the parents.
// Which way round, and the paint, by the park's seed.
M.playground = (c, L) => {
  const { pal } = c;
  c.work = [-0.4, -0.4, 0.4, 0.4];
  const m = ownPick(c, [-1, 1], 1), paint = [ownPick(c, PAINT, 2), ownPick(c, PAINT, 3)];
  const climb = ownPick(c, ['fort', 'ship'], 4), green = ownPick(c, ['seesaw', 'tyre'], 5);
  spot(c, 0, 0.3); spot(c, m * -0.25, 0); spot(c, m * 0.2, 0.1);
  if (L === 0) {
    swings(c, m * -0.12, -0.1, 0.2 * m);
    parkTree(c, m * 0.3, -0.3, 1.25, ownPick(c, ['round', 'lime', 'copper'], 6));
    if (green === 'tyre') tyreSwing(c, m * 0.22, -0.3);
    else seesaw(c, m * 0.2, 0.2, 0.6 * m, paint[0]);
    bench(c, m * -0.28, 0.3, Math.PI + 0.3 * m);
    blooms(c, m * 0.34, 0.36, 4, 0.05);
    return;
  }
  sandpit(c, m * -0.22, 0.2, 0.26, 0.2);
  if (L === 1) {
    swings(c, m * -0.12, -0.24, 0, 3, '#3a3a3e');
    slide(c, m * 0.24, -0.1, 0, paint[0]);
    if (green === 'tyre') { springer(c, m * 0.16, 0.24, 0.4, paint[1]); springer(c, m * 0.28, 0.2, -0.3, paint[0]); }
    else roundabout(c, m * 0.2, 0.26, paint[1]);
    seesaw(c, m * -0.32, -0.02, Math.PI / 2, paint[1]);
    lamp(c, m * 0.4, 0.42, 0.28);
  } else {
    if (climb === 'ship') playShip(c, m * 0.08, -0.16, m > 0 ? 0 : Math.PI, paint[0]);
    else fort(c, m * 0.06, -0.18, pal.roof);
    swings(c, m * -0.28, -0.28, Math.PI / 2, 2, '#3a3a3e');
    roundabout(c, m * 0.22, 0.24, paint[1]);
    shelter(c, m * 0.32, -0.32, 0.18, 0.14, pal.slate, -m * Math.PI / 2);
    lamp(c, m * -0.42, 0.42, 0.28);
    shrub(c, m * -0.37, -0.04, 0.8);
  }
  fence(c, -0.46, -0.46, 0.46, 0.46, ownPick(c, ['#3a3a3e', '#2f4a3a', '#5a2a2a'], 7), { x: 0, z: 0.46, w: 0.1 });
  bench(c, 0.02, 0.36, Math.PI);
};

// Bowling Green: a level lawn mown in stripes inside a low hedge, bowls and
// the jack on the grass, a little hut for the woods. The Croquet Lawn has
// hoops and a peg and a pavilion with a veranda; the Tennis Courts a court
// (grass, clay or asphalt) with its net and lines inside a wire fence, a
// clubhouse and an umpire's chair. Which side the hut stands, the stripes
// and the colours by the park's seed.
M.courts = (c, L) => {
  const { gb, rng, pal } = c;
  c.work = [-0.4, -0.4, 0.4, 0.4];
  const m = ownPick(c, [-1, 1], 1), wall = ownPick(c, ['hedge', 'hedge', 'wall'], 2);
  spot(c, m * 0.28, -0.32); spot(c, -m * 0.2, 0.3); spot(c, 0, 0.1);
  if (L < 2) {
    const z0 = 0.12, w = 0.8, d = 0.6;
    const along = ownPick(c, [false, true], 3);
    stripes(c, 0, z0, w, d, L ? 6 : 8, L ? '#6fa848' : '#7fb04f', L ? '#82b85a' : '#90c060', along);
    const edge = (x, z, ew, ed) => (wall === 'hedge' ? phedge(c, x, z, ew, ed, 0.05) : gb.cbox(x, c.gy(x, z) - 0.01, z, ew, 0.045, ed, STONE_L, 0, 0.006));
    edge(0, z0 - d / 2 - 0.02, w + 0.04, 0.04);
    for (const s of [-1, 1]) edge(s * (w / 2 + 0.02), z0, 0.04, d);
    for (const s of [-1, 1]) edge(s * 0.26, z0 + d / 2 + 0.02, 0.32, 0.04);
    if (L === 0) {
      for (let i = 0; i < 6; i++) { const x = rng.float(-0.3, 0.3), z = rng.float(-0.2, 0.3); gb.sphere(x, c.gy(x, z) + 0.012, z, 0.013, i % 2 ? '#2a2420' : '#5a2a22', 0); }
      gb.sphere(0.02, c.gy(0.02, 0.1) + 0.007, 0.1, 0.007, '#f2ede0', 0);
      const hx = m * -0.3, hz = -0.36;
      gb.cbox(hx, c.gy(hx, hz), hz, 0.16, 0.13, 0.12, pal.wood, 0, 0.008);
      gb.wedge(hx, c.gy(hx, hz) + 0.13, hz, 0.19, 0.15, 0.05, pal.roof, 0);
      bench(c, m * 0.2, -0.36, 0);
    } else {
      for (const [x, z] of [[-0.25, -0.08], [0.25, -0.08], [-0.25, 0.32], [0.25, 0.32], [0, 0.04], [0, 0.2]]) {
        const y = c.gy(x, z);
        for (const s of [-1, 1]) gb.box(x + s * 0.012, y, z, 0.004, 0.026, 0.004, LINE);
        gb.box(x, y + 0.024, z, 0.028, 0.004, 0.004, LINE);
      }
      gb.cyl(0, c.gy(0, 0.12), 0.12, 0.006, 0.006, 0.05, 5, '#c8423a');
      for (let i = 0; i < 4; i++) { const x = rng.float(-0.25, 0.25), z = rng.float(-0.06, 0.32); gb.sphere(x, c.gy(x, z) + 0.01, z, 0.01, PAINT[i], 0); }
      pavilion(c, m * 0.02, -0.37, 0.4, 0.1, ownPick(c, ['#ece6da', '#ece6da', pal.wall, '#c9d3b8'], 4), ownPick(c, [pal.roof, pal.slate, '#3f5a46'], 5));
      for (const x of [-0.33, 0.33]) {
        const z = -0.3, y = c.gy(x, z);
        gb.boxC(x, y + 0.03, z, 0.04, 0.004, 0.06, '#d8c8a0', -0.5);
        gb.boxC(x, y + 0.04, z + 0.004, 0.036, 0.05, 0.003, ownPick(c, ['#3f6a8f', '#c8423a', '#4f7a45'], 6), -0.3);
      }
    }
    return;
  }
  // the court, its lines, the net, and a wire fence round it
  const cx = 0, cz = 0.1, cw = 0.74, cd = 0.56;
  gb.box(cx, c.gy(cx, cz) - 0.006, cz, cw, 0.01, cd, ownPick(c, ['#6fa848', '#b8673e', '#3f6a5a'], 7));
  const ly = c.gy(cx, cz) + 0.004, iw = cw - 0.14, id = cd - 0.1;
  for (const s of [-1, 1]) { gb.box(cx + s * iw / 2, ly, cz, 0.008, 0.003, id, LINE); gb.box(cx, ly, cz + s * id / 2, iw, 0.003, 0.008, LINE); gb.box(cx + s * iw * 0.36, ly, cz, 0.006, 0.003, id, LINE); }
  gb.box(cx, ly, cz, 0.006, 0.003, id * 0.5, LINE);
  for (const s of [-1, 1]) gb.box(cx, ly, cz + s * id / 4, iw * 0.72, 0.003, 0.006, LINE);
  for (const s of [-1, 1]) gb.box(cx + s * (iw / 2 + 0.03), ly - 0.004, cz, 0.012, 0.06, 0.012, '#3a3a3e');
  gb.box(cx, ly + 0.012, cz, iw + 0.05, 0.035, 0.004, '#4a4a4e');
  gb.box(cx, ly + 0.047, cz, iw + 0.05, 0.007, 0.006, LINE);
  const fx = cw / 2 + 0.03, fz0 = cz - cd / 2 - 0.03, fz1 = cz + cd / 2 + 0.03, fh = 0.2, wire = ownPick(c, ['#2f3a2f', '#2f3a2f', '#3a3a44'], 8);
  const post = (x, z) => gb.box(x, c.gy(x, z) - 0.01, z, 0.01, fh + 0.01, 0.01, wire);
  for (let i = 0; i <= 6; i++) { const x = -fx + (i * 2 * fx) / 6; post(x, fz0); post(x, fz1); }
  for (let i = 1; i < 5; i++) { const z = fz0 + (i * (fz1 - fz0)) / 5; post(-fx, z); post(fx, z); }
  for (const y of [0.06, 0.13, fh - 0.006]) {
    gb.box(0, y, fz0, 2 * fx, 0.004, 0.004, '#3a463a'); gb.box(0, y, fz1, 2 * fx, 0.004, 0.004, '#3a463a');
    gb.box(-fx, y, (fz0 + fz1) / 2, 0.004, 0.004, fz1 - fz0, '#3a463a'); gb.box(fx, y, (fz0 + fz1) / 2, 0.004, 0.004, fz1 - fz0, '#3a463a');
  }
  // the umpire's chair, and the clubhouse behind
  const ux = cx + m * (iw / 2 + 0.06), uy = c.gy(ux, cz);
  for (const s of [-1, 1]) gb.box(ux, uy, cz + s * 0.015, 0.008, 0.11, 0.008, '#ece6da');
  gb.box(ux, uy + 0.11, cz, 0.03, 0.008, 0.04, '#ece6da');
  pavilion(c, m * -0.08, -0.37, 0.5, 0.1, ownPick(c, [pal.wall, '#ece6da', '#e2b9a8'], 9), pal.slate, true);
  bed(c, m * 0.34, -0.36, 0.1, 0.1, { edge: 'brick' });
};

// ------------------------------------------------- joined (2×1) parks
// Something to give a park its character, in a space about r across: a
// little lake, a bandstand, a ring of roses round a sundial, a monument, a
// fountain, carpet bedding, a glasshouse or a tea kiosk.
function feature(c, kind, x, z, r, o = {}) {
  const { gb } = c;
  if (kind === 'pond' || kind === 'lake') {
    const ly = water(c, [[x, z, r * 0.8], [x + r * 0.35, z + r * 0.2, r * 0.55], [x - r * 0.3, z - r * 0.25, r * 0.5]]);
    reeds(c, x - r * 0.75, z + r * 0.2, ly, 6); lilies(c, x + r * 0.2, z - r * 0.1, ly, 4, r * 0.4);
    const ducks = seasonAt(c, 0.5) === 3 ? 1 : 3;
    for (let i = 0; i < ducks; i++) duck(c, x + (i - 1) * r * 0.35, ly, z + (i % 2 ? 0.05 : -0.04), i * 2.1, i === 1 ? '#f2ede0' : '#8a6a48');
    spot(c, x, z + r * 1.05);
  } else if (kind === 'bandstand') {
    bandstand(c, x, z, Math.min(0.18, r * 0.7), { iron: o.iron, roof: o.roof });
    spot(c, x - r * 0.6, z + r); spot(c, x + r * 0.6, z + r);
  } else if (kind === 'rosegarden') {
    ringWalk(c, x, z, r * 0.65, 0.06);
    sundial(c, x, z);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; roseBush(c, x + Math.cos(a) * r * 0.35, z + Math.sin(a) * r * 0.35, 0.8, o.rose); roseBush(c, x + Math.cos(a + 0.4) * r * 0.92, z + Math.sin(a + 0.4) * r * 0.92, 0.75); }
    spot(c, x + r * 0.65, z); spot(c, x - r * 0.65, z);
  } else if (kind === 'statue') {
    ringWalk(c, x, z, r * 0.55, 0.07);
    monument(c, x, z, o.monument || 'figure', 0.8, o.mat || BRONZE);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; topiaryShape(c, x + Math.cos(a) * r * 0.85, z + Math.sin(a) * r * 0.85, 1.1, 'cone'); }
    spot(c, x, z + r * 0.55);
  } else if (kind === 'fountain') {
    fountain(c, x, z, Math.min(0.16, r * 0.55), o.fountain || 'tiers');
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; bed(c, x + Math.cos(a) * r * 0.8, z + Math.sin(a) * r * 0.8, 0.12, 0.12, { round: true }); }
    spot(c, x, z + r * 0.75);
  } else if (kind === 'flowers') {
    bed(c, x, z, r * 1.4, r * 1.1, { round: true, edge: 'stone', bands: true, rings: true });
    urn(c, x, z);
    spot(c, x, z + r * 0.8);
  } else if (kind === 'physic') {
    for (let i = 0; i < 4; i++) bed(c, x + ((i % 2) - 0.5) * r * 0.8, z + ((i >> 1) - 0.5) * r * 0.8, r * 0.6, r * 0.5, { edge: 'box' });
    sundial(c, x, z);
  } else if (kind === 'glasshouse') {
    gb.push(x, 0, z, o.ry || 0);
    greenhouse(c, 0, 0, r * 1.5, r * 0.7, { h: 0.15 });
    gb.pop();
    spot(c, x, z + r * 0.6);
  } else if (kind === 'kiosk') {
    gb.push(x, 0, z, o.ry || 0);
    kiosk(c, 0, 0, 0.22, 0.14, o.wall || '#ece6da', o.roof || '#3f5a46', { awning: o.awning || '#a8473a' });
    gb.pop();
    spot(c, x, z + 0.24);
  }
}
const PARK_TREES = ['round', 'round', 'lime', 'copper', 'cherry', 'birch', 'yew', 'poplar'];

// Town Park: walks among lawns and trees, laid out round what it was
// joined from (a pond, a bandstand, roses, a monument or flowers; two
// gardens make room for a lake or a fountain), with a second feature at the
// other end, by the park's seed. The walks wind, loop or cross by its seed.
// The Pleasure Gardens add lamps, beds along the walks and a tea kiosk or
// a glasshouse.
M.park = (c, L) => {
  const { gb, rng } = c;
  const f = rowFrame(c);
  const W = f.len - 0.08, D = f.dep - 0.08;
  const m = ownPick(c, [-1, 1], 1), paths = ownPick(c, ['wind', 'loop', 'cross'], 2);
  const main = c.flavor || ownPick(c, ['lake', 'lake', 'fountain', 'bandstand', 'flowers'], 3);
  const second = ownPick(c, ['bandstand', 'lake', 'rosegarden', 'statue', 'fountain'].filter(k => k !== main && !(main === 'pond' && k === 'lake')), 4);
  const iron = ownPick(c, [IRON_G, '#2f3a5a', '#5a2a2a'], 5), roof = ownPick(c, ['#3f5a46', '#8a432e', '#2f4a6a'], 6);
  const ax = m * W * 0.24, bx = -m * W * 0.26;
  // the walks
  if (paths === 'wind') {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([-W / 2 + 0.06 + t * (W - 0.12), Math.sin(t * Math.PI * 2 + (m > 0 ? 0 : Math.PI)) * D * 0.18 + D * 0.06]); }
    walk(c, pts, 0.09);
  } else if (paths === 'loop') {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([Math.cos(a) * W * 0.42, Math.sin(a) * D * 0.36]); }
    walk(c, pts, 0.08);
    walk(c, [[0, D * 0.36], [0, D / 2]], 0.08);
  } else {
    walk(c, [[-W / 2 + 0.04, 0.02], [W / 2 - 0.04, 0.02]], 0.09);
    walk(c, [[ax, 0.02], [ax, D / 2]], 0.08); walk(c, [[bx, 0.02], [bx, D / 2]], 0.08);
  }
  feature(c, main, ax, -D * 0.1, 0.28, { iron, roof, monument: ownPick(c, ['figure', 'obelisk', 'column', 'angel'], 7), fountain: ownPick(c, ['tiers', 'figure', 'quatre'], 8) });
  feature(c, second, bx, -D * 0.12, 0.24, { iron, roof, monument: ownPick(c, ['figure', 'urn', 'cross'], 9), fountain: 'tiers' });
  // trees round the edges, of the park's own kinds
  const kinds = [ownPick(c, PARK_TREES, 10), ownPick(c, PARK_TREES, 11)], r = ownRng(c, 12);
  for (let i = 0; i < (L ? 9 : 6); i++) {
    const x = -W / 2 + 0.12 + ((i + r.float(0, 0.6)) / (L ? 9 : 6)) * (W - 0.24), z = i % 2 ? -D / 2 + 0.12 : D / 2 - 0.12;
    if (z > 0 && Math.abs(x - (paths === 'cross' ? ax : 0)) < 0.12) continue;
    parkTree(c, x, z, r.float(0.85, 1.1), kinds[i % 2]);
  }
  bench(c, 0, D / 2 - 0.14, Math.PI); bench(c, W * 0.05 * m, -D / 2 + 0.14, 0);
  spot(c, 0, D * 0.12); spot(c, -W * 0.4, 0); spot(c, W * 0.4, 0);
  if (L) {
    lamp(c, -W / 2 + 0.06, 0, 0.3); lamp(c, W / 2 - 0.06, 0, 0.3); lamp(c, 0, D / 2 - 0.05, 0.3);
    for (const x of [-W * 0.08, W * 0.08]) bed(c, x, -D * 0.32, 0.12, 0.08, {});
    if (ownPick(c, [0, 1], 13)) feature(c, 'kiosk', m * W * 0.02, -D / 2 + 0.14, 0.2, { wall: ownPick(c, ['#ece6da', '#c9d3b8'], 14), roof, awning: ownPick(c, ['#a8473a', '#3f6a8f'], 15) });
    else for (const s of [-1, 1]) shrub(c, s * W * 0.06, -D / 2 + 0.12, 0.9);
  } else blooms(c, m * -W * 0.42, D * 0.1, 7, 0.08);
  void gb; void rng;
  if (f.turned) gb.pop();
};

// Fountain Garden: a walled garden round a fountain (tiered, a quatrefoil
// basin, a figure or an obelisk, by the park's seed) where gravel walks
// cross, beds in its quarters or a ring, the old well-house in a corner.
// The Water Garden adds trees, a rill and lamps.
M.fountaingarden = (c, L) => {
  const { gb } = c;
  const f = rowFrame(c);
  const W = f.len - 0.1, D = f.dep - 0.1, m = ownPick(c, [-1, 1], 1);
  const kind = ownPick(c, ['tiers', 'quatre', 'figure', 'obelisk'], 2), beds = ownPick(c, ['quarters', 'ring'], 3), edge = ownPick(c, ['hedge', 'hedge', 'railings'], 4);
  if (edge === 'hedge') { phedge(c, 0, -D / 2, W, 0.06); phedge(c, -W / 2, 0, 0.06, D); phedge(c, W / 2, 0, 0.06, D); phedge(c, -W * 0.3, D / 2, W * 0.36, 0.06); phedge(c, W * 0.3, D / 2, W * 0.36, 0.06); }
  else railings(c, -W / 2, -D / 2, W / 2, D / 2, 0);
  gravel(c, 0, 0, W - 0.12, 0.1); gravel(c, 0, 0, 0.1, D - 0.1);
  fountain(c, 0, 0, 0.22, kind, ownPick(c, [STONE_L, STONE, '#c8bca4'], 5));
  if (beds === 'quarters') for (const sx of [-1, 1]) for (const sz of [-1, 1]) bed(c, sx * W * 0.3, sz * D * 0.26, W * 0.22, D * 0.22, { edge: 'box', bands: true });
  else for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; bed(c, Math.cos(a) * 0.48, Math.sin(a) * 0.3, 0.1, 0.1, { round: true }); }
  if (L) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parkTree(c, sx * W * 0.42, sz * D * 0.32, 0.8, ownPick(c, ['cherry', 'round', 'yew'], 6));
    // a rill running from the fountain to the gate
    gb.box(0, c.gy(0, 0.25) - 0.004, 0.25, 0.04, 0.008, 0.26, frozen(c) ? ICE : WATER);
    lamp(c, W / 2 - 0.08, D / 2 - 0.08, 0.28); lamp(c, -W / 2 + 0.08, D / 2 - 0.08, 0.28);
  }
  // the old well-house in one corner
  const wx = m * (-W / 2 + 0.16), wz = -D / 2 + 0.16, wy = c.gy(wx, wz);
  gb.cyl(wx, wy - 0.02, wz, 0.08, 0.09, 0.1, 10, STONE);
  for (const s of [-1, 1]) gb.box(wx + s * 0.07, wy + 0.06, wz, 0.016, 0.18, 0.016, '#4e3a2a');
  gb.gable(wx, wy + 0.24, wz, 0.2, 0.14, 0.07, '#6e4a2c', ownPick(c, ['#8a432e', '#5a5f63', '#b8955a'], 7), 0.02);
  bench(c, W * 0.2, D / 2 - 0.12, Math.PI); bench(c, -W * 0.2 * m, -D / 2 + 0.12, 0);
  spot(c, 0.3, 0.2); spot(c, -0.3, 0.2); spot(c, 0.3, -0.2);
  if (f.turned) gb.pop();
};

// Recreation Ground: a playground at one end, a lawn with goalposts at the
// other (which end by the park's seed), a shelter between them and railings
// round. The People's Park adds a paddling pool, a drinking fountain,
// flower beds and lamps.
M.recground = (c, L) => {
  const { gb, pal } = c;
  const f = rowFrame(c);
  const W = f.len - 0.1, D = f.dep - 0.1, x0 = -W / 2, x1 = W / 2;
  const m = ownPick(c, [-1, 1], 1), paint = [ownPick(c, PAINT, 2), ownPick(c, PAINT, 3)];
  // the play end
  const px = m * (x0 + 0.34);
  sandpit(c, px - m * 0.08, 0.2, 0.26, 0.18);
  swings(c, px - m * 0.1, -0.24, 0, 2, '#3a3a3e');
  slide(c, px + m * 0.22, -0.06, 0, paint[0]);
  if (ownPick(c, [0, 1], 4)) roundabout(c, px + m * 0.22, 0.26, paint[1]);
  else { springer(c, px + m * 0.18, 0.24, 0.3, paint[1]); springer(c, px + m * 0.28, 0.2, -0.2, paint[0]); }
  // the games end
  const gx = m * (x1 - 0.42);
  stripes(c, gx, 0.02, 0.7, D - 0.1, 6, '#7fb04f', '#8cbc58', true);
  for (const s of [-1, 1]) goal(c, gx + s * 0.3, 0.02, s > 0 ? -Math.PI / 2 : Math.PI / 2, false);
  // the shelter between, and a path across
  gb.box(0.02, c.gy(0.02, 0) - 0.006, 0, 0.12, 0.012, D - 0.04, '#c8b894');
  if (L) {
    // an octagonal shelter, a paddling pool, a drinking fountain, beds and lamps
    const sx = 0.02, sz = -0.26, sy = c.gy(sx, sz), sroof = ownPick(c, [pal.slate, '#3f5a46', '#8a432e'], 5);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gb.box(sx + Math.cos(a) * 0.1, sy, sz + Math.sin(a) * 0.1, 0.014, 0.18, 0.014, '#ece6da'); }
    gb.cyl(sx, sy + 0.18, sz, 0.13, 0.13, 0.02, 8, '#ece6da');
    gb.cone(sx, sy + 0.2, sz, 0.14, 0.1, 8, sroof, Math.PI / 8);
    const py = c.gy(0.02, 0.26), q = seasonAt(c, 0.5);
    gb.cyl(0.02, py - 0.01, 0.26, 0.14, 0.15, 0.03, 12, STONE);
    // the paddling pool is emptied for the winter
    gb.cyl(0.02, py + (q === 3 ? -0.005 : 0.02), 0.26, 0.125, 0.125, 0.004, 12, q === 3 ? '#a8b4b8' : '#3f7f9f');
    drinkingFountain(c, -0.2 * m, -0.36);
    blooms(c, 0.2, 0.32, 6, 0.06); blooms(c, -0.16, 0.34, 6, 0.06);
    lamp(c, 0.12, 0.42, 0.28); lamp(c, -0.1, -0.42, 0.28);
  } else {
    shelter(c, 0.02, -0.28, 0.22, 0.16, pal.roof);
    bench(c, 0.02, 0.3, Math.PI);
  }
  fence(c, x0, -D / 2 - 0.02, x1, D / 2 + 0.02, ownPick(c, ['#3a3a3e', '#2f4a3a'], 6), { x: 0.02, z: D / 2 + 0.02, w: 0.1 });
  spot(c, gx, 0.1); spot(c, px, 0.05); spot(c, 0.02, 0.15);
  if (f.turned) gb.pop();
};

// Lake Garden: a little lake (its shape and which end it lies at by the
// park's seed) with reeds, ducks and swans, an island with a tree or a
// bridge over a narrows, and a walk round the water; at the other end what
// it was joined from (a bandstand, roses, a monument) or a lawn of trees.
// The Boating Lake has rowing boats for hire at a landing stage by a
// boathouse (pulled up on the bank for the winter), and lamps.
M.lakepark = (c, L) => {
  const { gb } = c;
  const f = rowFrame(c);
  const W = f.len - 0.08, D = f.dep - 0.08, m = ownPick(c, [-1, 1], 1), r = ownRng(c, 2);
  const lx = m * W * 0.14, lz = -D * 0.08;
  const pools = [[lx, lz, 0.3], [lx + m * 0.26, lz + 0.05, 0.22], [lx - m * 0.24, lz - 0.06, 0.2], [lx + m * 0.08, lz - 0.16, 0.18]];
  const ly = water(c, pools);
  const isle = ownPick(c, ['island', 'bridge', 'island'], 3);
  if (isle === 'island') {
    const ix = lx + m * 0.06, iz = lz - 0.04;
    gb.cyl(ix, ly - 0.035, iz, 0.08, 0.1, 0.05, 12, '#6f8a4a');
    parkTree(c, ix, iz, 0.8, ownPick(c, ['willow', 'round', 'pine'], 4));
  } else footbridge(c, lx - m * 0.12, lz - 0.02, 0.36, 0, ly, ownPick(c, ['#ece6da', '#8a3a2a', '#2f4a3a'], 5));
  reeds(c, lx - m * 0.4, lz + 0.12, ly, 7); reeds(c, lx + m * 0.4, lz - 0.14, ly, 6);
  lilies(c, lx + m * 0.25, lz + 0.06, ly, 4, 0.08);
  const q = seasonAt(c, 0.5), birds = q === 3 ? 1 : 3;
  for (let i = 0; i < birds; i++) duck(c, lx + r.float(-0.3, 0.3), ly, lz + r.float(-0.08, 0.1), r.float(0, 6.28), '#8a6a48');
  if (q !== 3) for (let i = 0; i < 2; i++) { const sx = lx + m * (0.2 - i * 0.08), sz = lz + 0.1 + i * 0.03; gb.push(sx, ly, sz, r.float(0, 6)); gb.sphere(0, 0.012, 0, 0.026, '#f2ede0', 0, 0.6); gb.boxC(0, 0.04, 0.02, 0.008, 0.05, 0.008, '#f2ede0', -0.3); gb.box(0, 0.06, 0.03, 0.008, 0.006, 0.014, '#e07a2a'); gb.pop(); }
  // the walk round the water
  const pts = [];
  for (let i = 0; i <= 22; i++) { const a = (i / 22) * Math.PI * 2; pts.push([lx + Math.cos(a) * 0.62, lz + Math.sin(a) * 0.36]); }
  walk(c, pts.filter(([x, z]) => Math.abs(x) < W / 2 - 0.05 && Math.abs(z) < D / 2 - 0.04), 0.07);
  // at the other end: what it was joined from, or trees on a lawn
  const ox = -m * W * 0.38;
  if (c.flavor && c.flavor !== 'pond') feature(c, c.flavor === 'garden' ? 'flowers' : c.flavor, ox, 0.0, 0.2, { roof: ownPick(c, ['#3f5a46', '#8a432e'], 6), iron: IRON_G, monument: ownPick(c, ['obelisk', 'figure', 'urn'], 7) });
  else { parkTree(c, ox, -0.12, 1.2, ownPick(c, ['willow', 'copper', 'round'], 8)); bench(c, ox, 0.16, Math.PI); }
  const kinds = [ownPick(c, PARK_TREES, 9), 'willow'];
  for (const [x, z, k] of [[m * (W / 2 - 0.16), -D / 2 + 0.16, 0], [lx, -D / 2 + 0.15, 1], [-m * W * 0.1, D / 2 - 0.16, 0]]) parkTree(c, x, z, r.float(0.85, 1.05), kinds[k]);
  bench(c, lx, D / 2 - 0.12, Math.PI);
  spot(c, lx, D * 0.36); spot(c, lx - 0.4 * m, D * 0.3); spot(c, ox, 0.24);
  if (L) {
    // the boathouse on the far bank, a landing stage, boats for hire
    const hx = lx + m * 0.46, hz = -D / 2 + 0.18;
    gb.push(hx, 0, hz, m > 0 ? -0.3 : 0.3);
    house(c, { x: 0, z: 0, w: 0.22, d: 0.14, h: 0.17, floors: 1, wall: ownPick(c, ['#7d5b3b', '#4f6a7a', '#ece6da'], 10), roof: ownPick(c, ['#8a432e', '#3f5a46'], 11), roofType: 'gable', rh: 0.1, nFront: 1, doorX: 0, chimney: false, fancy: false, lit: 0.6, noBack: true });
    gb.pop();
    const jx = lx + m * 0.18, jz = lz + 0.26;
    gb.box(jx, ly + 0.004, jz, 0.18, 0.012, 0.06, '#8a6a48');
    for (const s of [-1, 1]) gb.box(jx + s * 0.08, ly - 0.03, jz, 0.012, 0.04, 0.012, BARK);
    const boats = ['#7d5b3b', '#4f6a7a', '#a8473a', '#2f6a4a'];
    if (q === 3) for (let i = 0; i < 3; i++) boat(c, -m * W * 0.1 + i * 0.09, c.gy(-m * W * 0.1, D / 2 - 0.16) + 0.02, D / 2 - 0.16, Math.PI / 2 + 0.1, boats[i]);
    else for (let i = 0; i < 3; i++) boat(c, lx + r.float(-0.3, 0.3), ly + 0.012, lz + r.float(-0.12, 0.08), r.float(0, 6.28), boats[i]);
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) lamp(c, x, D / 2 - 0.08, 0.3);
    lamp(c, jx - m * 0.12, jz + 0.06, 0.28);
  }
  if (f.turned) gb.pop();
};

// Botanic Garden: order beds in rows with labels, specimen trees from far
// away (a cedar, a monkey puzzle, palms in tubs), a pond for water plants
// when it was joined from one, and a lecture hut; the Glasshouse Garden
// adds a long glasshouse along the back. Which end what stands by its seed.
M.botanic = (c, L) => {
  const { gb } = c;
  const f = rowFrame(c);
  const W = f.len - 0.1, D = f.dep - 0.1, m = ownPick(c, [-1, 1], 1), r = ownRng(c, 2);
  hedgeRound(c, -W / 2, -D / 2, W / 2, D / 2, 0, 0.16, 0.05);
  walk(c, [[0, -D / 2 + 0.05], [0, D / 2]], 0.08, GRAVEL_D); walk(c, [[-W / 2 + 0.05, 0.08], [W / 2 - 0.05, 0.08]], 0.08, GRAVEL_D);
  // order beds in two blocks
  const HERB = ['#7a9a6a', '#5f8a4a', '#9aa890', '#4f7a3a', '#6a8a5a', '#8a7a9a'];
  const q = seasonAt(c, 0.5);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) {
    const x = s * (0.18 + i * 0.16), z = (k ? 0.28 : -0.1), y = c.gy(x, z);
    if (L && z < 0 && s === m) continue;
    gb.cbox(x, y - 0.01, z, 0.12, 0.03, 0.12, '#8a6a48', 0, 0.004);
    gb.box(x, y + 0.016, z, 0.1, 0.006, 0.1, SOIL);
    for (let j = 0; j < (q === 3 ? 1 : 3); j++) gb.sphere(x + (j - 1) * 0.03, y + 0.035, z + ((j % 2) - 0.5) * 0.03, 0.022, q === 3 ? '#6a7466' : HERB[(i + k * 3 + j + r.int(0, 5)) % HERB.length], 0, (i + j) % 3 ? 0.8 : 1.6);
    gb.box(x + 0.05, y + 0.016, z + 0.055, 0.012, 0.026, 0.004, '#f2ede0');
  }
  // specimen trees
  parkTree(c, -m * (W / 2 - 0.2), -D / 2 + 0.22, 1.0, 'cedar');
  parkTree(c, m * 0.04, -D / 2 + 0.12, 0.9, ownPick(c, ['pine', 'birch', 'copper'], 3));
  tubPlant(c, -0.07, 0.4, true); tubPlant(c, 0.07, 0.4, true);
  if (c.flavor === 'pond') {
    const px = -m * W * 0.3, ly = water(c, [[px, 0.25, 0.14], [px + 0.1, 0.22, 0.1]], { stone: true });
    lilies(c, px, 0.25, ly, 4, 0.08);
  } else feature(c, c.flavor === 'rosegarden' ? 'rosegarden' : 'physic', -m * W * 0.3, 0.26, 0.18, {});
  if (L) {
    gb.push(m * W * 0.25, 0, -D / 2 + 0.17, 0);
    greenhouse(c, 0, 0, 0.62, 0.2, { h: 0.17 });
    gb.pop();
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) lamp(c, x, D / 2 - 0.08, 0.28);
  } else {
    // the lecture hut
    gb.push(m * W * 0.3, 0, -D / 2 + 0.14, 0);
    kiosk(c, 0, 0, 0.24, 0.15, ownPick(c, ['#ece6da', '#c9d3b8'], 4), '#5a5f63', {});
    gb.pop();
  }
  bench(c, m * 0.3, D / 2 - 0.12, Math.PI);
  spot(c, 0.1, 0.12); spot(c, -0.4, 0.12); spot(c, 0.4, 0.12);
  if (f.turned) gb.pop();
};

// ------------------------------------------------------------ 2×2 parks
// Public Square: a kerbed square round a monument (a fountain from the
// Fountain Square on), its trees in corner planters, in two avenues or in a
// ring, benches and lamps; the Grand Square adds a bandstand and market
// umbrellas, on whichever side its seed says.
M.plaza = (c, L) => {
  const { gb } = c;
  c.work = [-0.85, -0.85, 0.85, 0.85];
  const trees = ownPick(c, ['corners', 'avenues', 'ring'], 1), m = ownPick(c, [-1, 1], 2);
  for (const [x, z, w, d] of [[0, -0.93, 1.86, 0.05], [0, 0.93, 1.86, 0.05], [-0.93, 0, 0.05, 1.86], [0.93, 0, 0.05, 1.86]]) gb.cbox(x, c.gy(x, z) - 0.02, z, w, 0.045, d, '#9a9284', 0, 0.01);
  if (L === 0) monument(c, 0, 0, ownPick(c, ['figure', 'obelisk', 'column', 'cross', 'rider'], 3), 1.2, ownPick(c, [BRONZE, VERDI], 4));
  else fountain(c, 0, 0, L >= 2 ? 0.5 : 0.42, ownPick(c, ['tiers', 'tiers', 'figure', 'obelisk'], 5), STONE);
  const kind = ownPick(c, ['round', 'lime', 'round', 'poplar'], 6);
  const planter = (x, z) => { gb.cbox(x, c.gy(x, z) - 0.01, z, 0.2, 0.08, 0.2, STONE, 0, 0.012); parkTree(c, x, z, 1.15, kind); };
  if (trees === 'corners') for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) planter(x, z);
  else if (trees === 'avenues') for (const x of [-0.78, 0.78]) for (const z of [-0.6, -0.2, 0.2, 0.6]) planter(x, z);
  else for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; planter(Math.cos(a) * 0.74, Math.sin(a) * 0.74); }
  for (const [x, z, ry] of [[0, 0.7, Math.PI], [0, -0.7, 0], [0.7, 0, -Math.PI / 2], [-0.7, 0, Math.PI / 2]]) if (!(trees === 'avenues' && Math.abs(x) > 0.5)) bench(c, x, z, ry);
  for (const [x, z] of [[-0.36, 0.84], [0.36, 0.84], [-0.36, -0.84], [0.36, -0.84]]) lamp(c, x, z, 0.33);
  if (L) for (const [x, z] of [[-0.86, 0], [0.86, 0]]) if (trees !== 'avenues') { gb.cbox(x, c.gy(x, z) - 0.01, z, 0.12, 0.07, 0.3, '#6b4a2f', 0, 0.01); blooms(c, x, z, 8, 0.1); }
  if (L >= 2) {
    // a bandstand and market umbrellas round the fountain
    bandstand(c, m * 0.58, 0, 0.2, { roof: ownPick(c, ['#3f5a46', '#8a432e', '#2f4a6a'], 7) });
    for (const [ux, uz, col] of [[-0.5, 0.35, '#a8473a'], [-0.5, -0.35, '#3f6a8f'], [-0.25, 0.55, '#c08a3a']]) {
      const x = ux * m, uy = c.gy(x, uz);
      gb.cbox(x, uy, uz, 0.14, 0.07, 0.09, '#86613e', 0, 0.006);
      gb.cyl(x, uy + 0.07, uz, 0.006, 0.006, 0.14, 4, '#3f342c');
      gb.cone(x, uy + 0.2, uz, 0.12, 0.05, 8, col);
    }
  }
  spot(c, 0, 0.55); spot(c, 0.5, 0); spot(c, -0.5, 0); spot(c, 0, -0.55);
};

// Playing Field: a big field mown in stripes, goalposts at each end, a hut
// to change in and trees round the edge. The Cricket Ground has a wicket,
// sightscreens, a boundary rope, a scoreboard and a white pavilion with a
// clock; the Football Ground a marked pitch with netted goals, a covered
// grandstand along the back, terracing at one end, and a turnstile gate on
// the street. Which side what stands, and the trees, by the park's seed.
M.sportsground = (c, L) => {
  const { gb, rng, pal } = c;
  c.work = [-0.85, -0.85, 0.85, 0.85];
  const m = ownPick(c, [-1, 1], 1), kind = ownPick(c, ['round', 'lime', 'poplar', 'copper'], 2);
  spot(c, 0, 0.75); spot(c, -0.7 * m, 0.1); spot(c, 0.4, -0.6);
  if (L === 0) {
    stripes(c, 0, 0.06, 1.6, 1.5, 10, ...turf(c), true);
    for (const s of [-1, 1]) goal(c, s * 0.72, 0.06, s > 0 ? -Math.PI / 2 : Math.PI / 2, false);
    const hx = m * -0.7, hz = -0.82;
    gb.cbox(hx, c.gy(hx, hz), hz, 0.26, 0.15, 0.14, pal.wood, 0, 0.008);
    gb.gable(hx, c.gy(hx, hz) + 0.15, hz, 0.26, 0.14, 0.07, pal.wood, pal.roof, 0.03);
    for (const [x, z] of [[0.8, -0.8], [0.45, -0.82], [-0.82, 0.45], [0.82, 0.55], [-0.25, -0.84]]) parkTree(c, x * m, z, rng.float(1.05, 1.2), kind);
    bench(c, 0.1 * m, -0.84, 0); bench(c, -0.4 * m, 0.88, Math.PI);
  } else if (L === 1) {
    stripes(c, 0, 0.04, 1.7, 1.66, 12, ...turf(c, 1), true);
    const wy = c.gy(0, 0.04);
    gb.box(0, wy - 0.003, 0.04, 0.08, 0.008, 0.46, '#c8b27a');
    for (const s of [-1, 1]) { for (const k of [-1, 0, 1]) gb.box(k * 0.01, wy, 0.04 + s * 0.2, 0.004, 0.035, 0.004, LINE); gb.box(0, wy + 0.035, 0.04 + s * 0.2, 0.026, 0.004, 0.004, '#d8b060'); }
    for (const s of [-1, 1]) gb.box(0, wy + 0.005, 0.04 + s * 0.16, 0.08, 0.002, 0.004, LINE);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * 0.8, z = 0.04 + Math.sin(a) * 0.76; gb.box(x, c.gy(x, z), z, 0.012, 0.008, 0.012, LINE); }
    for (const s of [-1, 1]) { const z = 0.04 + s * 0.88 - (s > 0 ? 0.03 : 0); const y = c.gy(0, z); for (const x of [-0.1, 0.1]) gb.box(x, y, z, 0.012, 0.08, 0.012, BARK); gb.box(0, y + 0.03, z, 0.26, 0.12, 0.012, LINE); }
    const px = m * -0.55;
    pavilion(c, px, -0.82, 0.5, 0.18, '#ece6da', pal.slate, true);
    gb.box(px - 0.21, 0.3, -0.82, 0.008, 0.18, 0.008, IRON);
    gb.box(px - 0.165, 0.43, -0.82, 0.09, 0.05, 0.004, ownPick(c, ['#3f6a8f', '#a8473a', '#2f6a4a'], 3));
    const sx = m * 0.62, sz = -0.86, sy = c.gy(sx, sz);
    for (const s of [-1, 1]) gb.box(sx + s * 0.1, sy, sz, 0.014, 0.12, 0.014, BARK);
    gb.box(sx, sy + 0.1, sz, 0.26, 0.12, 0.02, '#2a2a30');
    for (let i = 0; i < 4; i++) gb.box(sx - 0.09 + i * 0.06, sy + 0.14, sz + 0.012, 0.035, 0.045, 0.003, LINE);
    for (const [x, z, ry] of [[0.32, -0.86, 0], [-0.88, 0.2, Math.PI / 2], [0.88, 0.3, -Math.PI / 2], [0.4, 0.88, Math.PI]]) bench(c, x * m, z, m > 0 ? ry : -ry);
    for (const [x, z] of [[0.82, -0.82], [-0.82, 0.8], [0.82, 0.8]]) parkTree(c, x * m, z, 1.15, kind);
  } else {
    const px = 0, pz = 0.16, pw = 1.56, pd = 0.98;
    stripes(c, px, pz, pw + 0.1, pd + 0.1, 12, ...turf(c, 2), true);
    const ly = c.gy(px, pz) + 0.001;
    for (const s of [-1, 1]) { gb.box(px, ly, pz + s * pd / 2, pw, 0.003, 0.01, LINE); gb.box(px + s * pw / 2, ly, pz, 0.01, 0.003, pd, LINE); }
    gb.box(px, ly, pz, 0.01, 0.003, pd, LINE);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; gb.box(px + Math.cos(a) * 0.13, ly, pz + Math.sin(a) * 0.13, 0.05, 0.003, 0.01, LINE, -a + Math.PI / 2); }
    for (const s of [-1, 1]) {
      const ex = px + s * pw / 2, bx = ex - s * 0.12;
      gb.box(bx, ly, pz, 0.01, 0.003, 0.44, LINE);
      for (const k of [-1, 1]) gb.box((ex + bx) / 2, ly, pz + k * 0.22, 0.24, 0.003, 0.01, LINE);
      goal(c, ex, pz, s > 0 ? -Math.PI / 2 : Math.PI / 2, true);
    }
    const gx = 0.1 * m, gz = -0.78, gw = 1.3, gd = 0.3;
    footing(c, gx, gz, gw, gd);
    for (let k = 0; k < 4; k++) gb.box(gx, 0, gz - gd / 2 + 0.04 + k * 0.06, gw, 0.06 * (4 - k), 0.06, k % 2 ? '#8a7a62' : '#7a6a52');
    gb.box(gx, 0, gz - gd / 2 + 0.01, gw + 0.02, 0.36, 0.02, pal.brick);
    for (const s of [-1, 1]) gb.box(gx + s * (gw / 2), 0, gz, 0.02, 0.32, gd, pal.brick);
    for (let i = 0; i <= 6; i++) gb.box(gx - gw / 2 + (i * gw) / 6, 0, gz + gd / 2 - 0.01, 0.012, 0.32, 0.012, '#2f3a4a');
    gb.wedge(gx, 0.32, gz, gw + 0.06, gd + 0.08, 0.08, pal.slate, 0);
    gb.cbox(gx, 0.36, gz - 0.02, 0.24, 0.1, 0.12, pal.brick, 0, 0.006);
    gb.gable(gx, 0.46, gz - 0.02, 0.26, 0.12, 0.08, pal.brick, pal.slate, 0.02, true);
    wallClock(c, gx, 0.42, gz + 0.042, 0.03);
    for (const s of [-1, 1]) { gb.box(gx + s * 0.6, 0.4, gz, 0.008, 0.2, 0.008, IRON); gb.box(gx + s * 0.6 + 0.045, 0.54, gz, 0.08, 0.05, 0.004, rng.pick(['#a8473a', '#3f6a8f', '#e8e0d0'])); }
    const tx = -0.84 * m;
    for (let k = 0; k < 3; k++) gb.box(tx + m * (0.05 - k * 0.045), 0, -0.32, 0.05, 0.03 * (k + 1), 0.58, STONE);
    const fz = 0.86;
    if (!c.inner) { frontage(c, -0.95, -0.12, fz, [], 'railings'); frontage(c, 0.12, 0.95, fz, [], 'railings'); }
    gb.cbox(0, c.gy(0, fz), fz, 0.2, 0.18, 0.08, pal.brick, 0, 0.006);
    gb.box(0, c.gy(0, fz), fz + 0.041, 0.07, 0.12, 0.004, '#3a2f28');
    gb.gable(0, c.gy(0, fz) + 0.18, fz, 0.22, 0.1, 0.05, pal.brick, pal.slate, 0.015);
    lamp(c, -0.2, fz + 0.04, 0.3); lamp(c, 0.2, fz + 0.04, 0.3);
    // along the street side: a row of trees, a covered enclosure, or the club's flags
    const near = ownPick(c, ['trees', 'enclosure', 'flags'], 3);
    if (near === 'trees') for (const tx2 of [-0.72, -0.46, 0.46, 0.72]) parkTree(c, tx2, 0.76, 0.85, kind);
    else if (near === 'enclosure') {
      const ex = m * 0.56;
      for (let k = 0; k < 2; k++) gb.box(ex, 0, 0.73 + k * 0.04, 0.6, 0.03 * (k + 1), 0.05, STONE);
      gb.wedge(ex, 0.15, 0.76, 0.64, 0.14, 0.04, pal.slate, Math.PI);
      for (const tx2 of [-0.27, 0, 0.27]) gb.box(ex + tx2, 0, 0.7, 0.01, 0.15, 0.01, IRON);
    } else for (const [tx2, col] of [[-0.56, ownPick(c, ['#a8473a', '#3f6a8f', '#2f6a4a'], 4)], [0.56, '#e8e0d0']]) { gb.box(tx2, c.gy(tx2, 0.76), 0.76, 0.008, 0.3, 0.008, IRON); gb.box(tx2 + 0.035, c.gy(tx2, 0.76) + 0.24, 0.76, 0.07, 0.05, 0.004, col); }
  }
};

// A folly on the rise: a domed temple, an obelisk, a gothic ruin or a
// pagoda, by the park's seed.
function folly(c, x, z, kind, s = 1) {
  const { gb } = c;
  const y = c.gy(x, z);
  if (kind === 'obelisk') { monument(c, x, z, 'obelisk', 1.1 * s); return; }
  if (kind === 'ruin') {
    // a broken gothic arcade, ivy on the stones
    gb.cbox(x, y - 0.02, z, 0.36 * s, 0.04, 0.12 * s, STONE, 0, 0.008);
    for (let i = 0; i < 3; i++) {
      const px = x + (i - 1) * 0.13 * s, hh = [0.3, 0.38, 0.22][i] * s;
      gb.cbox(px, y, z, 0.05 * s, hh, 0.06 * s, '#a8a090', 0, 0.006);
      if (i < 2) gb.arch(px + 0.065 * s, y + Math.min(hh, [0.3, 0.38, 0.22][i + 1] * s) - 0.06 * s, z - 0.03 * s, 0.05 * s, 0.06 * s, 8, '#a8a090');
      gb.sphere(px + 0.02, y + hh * 0.6, z + 0.03 * s, 0.03 * s, '#3f6a32', 0, 1.6);
    }
    gb.cbox(x + 0.2 * s, y - 0.01, z + 0.1 * s, 0.06 * s, 0.05 * s, 0.05 * s, '#a8a090', 0.6, 0.006);
    return;
  }
  if (kind === 'pagoda') {
    gb.cbox(x, y - 0.02, z, 0.18 * s, 0.05, 0.18 * s, STONE_L, 0, 0.008);
    for (let k = 0; k < 4; k++) {
      const ty = y + 0.03 + k * 0.1 * s, w = (0.14 - k * 0.025) * s;
      gb.cbox(x, ty, z, w, 0.07 * s, w, '#c8423a', 0, 0.004);
      gb.roof(x, ty + 0.07 * s, z, w + 0.06 * s, w + 0.06 * s, 0.035 * s, 0, '#2f4a3a', Math.PI / 4);
    }
    gb.cyl(x, y + 0.45 * s, z, 0.004, 0.006, 0.08 * s, 5, GOLD);
    return;
  }
  // a round temple of columns under a dome
  gb.cyl(x, y - 0.03, z, 0.17 * s, 0.19 * s, 0.07, 12, STONE);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; gb.cyl(x + Math.cos(a) * 0.13 * s, y + 0.04, z + Math.sin(a) * 0.13 * s, 0.013 * s, 0.016 * s, 0.3 * s, 6, '#ece6da'); }
  gb.cyl(x, y + 0.04 + 0.3 * s, z, 0.16 * s, 0.16 * s, 0.035 * s, 12, '#ece6da');
  gb.sphere(x, y + 0.075 + 0.3 * s, z, 0.15 * s, '#8fa89a', 1, 0.6);
  gb.cyl(x, y + 0.16 + 0.3 * s, z, 0.012, 0.012, 0.05 * s, 6, '#ece6da');
  gb.cbox(x, y + 0.04, z, 0.05, 0.05, 0.05, STONE, 0, 0.006);
  gb.cyl(x, y + 0.09, z, 0.016, 0.022, 0.1, 6, STONE_W);
  gb.sphere(x, y + 0.205, z, 0.018, STONE_W, 0);
}

// Landscape Park: rolling lawns round a lake, an avenue of trees from the
// gate up to a folly on the rise (a temple, an obelisk, a ruin or a pagoda),
// a jetty with a rowing boat, a winding walk, clumps of trees; which side
// the lake lies, the folly and the trees by the park's seed, and a corner
// for what the park was joined from (roses, a bandstand, a monument). The
// Royal Park adds a fountain in the lake, statues along the avenue, a
// bandstand and a palm house, and railings.
M.landscapepark = (c, L) => {
  const { gb, rng } = c;
  const f = rowFrame(c);
  const side = ownPick(c, [1, -1], 1), r = ownRng(c, 2);
  const fol = ownPick(c, ['temple', 'temple', 'obelisk', 'ruin', 'pagoda'], 3), trees = [ownPick(c, PARK_TREES, 4), ownPick(c, ['round', 'lime', 'cedar', 'copper'], 5)];
  const lx = side * 0.36, lz = -0.3;
  const pools = [[lx, lz, 0.3], [lx + side * 0.22, lz + 0.14, 0.2], [lx - side * 0.2, lz - 0.12, 0.19], [lx + side * 0.06, lz - 0.3, 0.17]];
  const ly = water(c, pools);
  // an island with a willow
  gb.blob(lx - side * 0.04, ly - 0.01, lz - 0.02, 0.07, 0.035, 0.06, '#6f8a4a');
  parkTree(c, lx - side * 0.04, lz - 0.02, 0.7, ownPick(c, ['willow', 'pine', 'round'], 6));
  reeds(c, lx + side * 0.36, lz + 0.18, ly, 7); lilies(c, lx - side * 0.15, lz + 0.12, ly, 4, 0.08);
  const q = seasonAt(c, 0.5);
  for (let i = 0; i < (q === 3 ? 1 : 3); i++) duck(c, lx + r.float(-0.25, 0.25), ly, lz + r.float(-0.2, 0.15), r.float(0, 6.28), i === 1 ? '#f2ede0' : '#8a6a48');
  // a jetty and a rowing boat on the near shore
  const jz = lz + 0.28, jy = ly + 0.002;
  gb.box(lx + side * 0.04, jy, jz, 0.09, 0.012, 0.2, '#8a6a48');
  for (const s of [-1, 1]) gb.box(lx + side * 0.04 + s * 0.04, jy - 0.04, jz - 0.08, 0.014, 0.05, 0.014, BARK);
  boat(c, lx + side * 0.17, q === 3 ? jy + 0.012 : jy + 0.004, jz - 0.04, 0.3);
  if (L && q !== 3) { c.fountain = [lx, ly + 0.08, lz]; gb.cyl(lx, ly - 0.01, lz, 0.03, 0.04, 0.04, 8, STONE); }
  // the avenue from the gate up to the folly on the rise
  const ax = -side * 0.52;
  gravel(c, ax, 0.28, 0.1, 1.36);
  const pairs = L ? [0.78, 0.5, 0.22, -0.06] : [0.72, 0.4, 0.08];
  for (const z of pairs) for (const s of [-1, 1]) parkTree(c, ax + s * 0.15, z, r.float(0.95, 1.15), trees[1]);
  if (L) for (const z of [0.64, 0.36]) for (const s of [-1, 1]) { const x = ax + s * 0.1, y = c.gy(x, z); gb.cbox(x, y - 0.01, z, 0.04, 0.06, 0.04, STONE, 0, 0.006); gb.cyl(x, y + 0.05, z, 0.01, 0.014, 0.07, 6, '#d8d2c4'); }
  folly(c, ax, -0.58, fol);
  spot(c, ax + side * 0.12, -0.36); spot(c, ax, 0.2);
  // a winding walk from the avenue round the near side of the lake
  const walkPts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; walkPts.push([ax + side * (0.12 + t * 0.9), 0.3 + Math.sin(t * Math.PI) * 0.12 - t * 0.12]); }
  walk(c, walkPts, 0.08);
  for (const [x, z, ry] of [[lx - side * 0.1, 0.12, Math.PI], [lx + side * 0.3, 0.2, Math.PI], [ax + side * 0.1, -0.3, (-side * Math.PI) / 2]]) bench(c, x, z, ry);
  spot(c, lx - side * 0.1, 0.22); spot(c, lx + side * 0.3, 0.3);
  // clumps of trees round the edge, a shrub beside each
  const clumps = [[side * 0.74, -0.76, 1], [side * 0.04, -0.8, 1.1], [-side * 0.78, -0.82, 1], [-side * 0.08, 0.8, 1], [side * 0.78, 0.12, 1]];
  if (!L && !c.flavor) clumps.push([side * 0.76, 0.5, 1.2], [side * 0.56, 0.76, 1.1]);
  clumps.forEach(([x, z, s]) => {
    parkTree(c, x, z, s * r.float(0.95, 1.08), trees[0]);
    shrub(c, x - Math.sign(x) * 0.13, z - Math.sign(z) * 0.08, r.float(0.8, 1.1));
  });
  blooms(c, ax + side * 0.2, 0.82, 7, 0.07); blooms(c, ax - side * 0.2, 0.84, 6, 0.06);
  // what it was joined from, in the near corner by the lake
  if (c.flavor && !L) feature(c, c.flavor, side * 0.66, 0.62, 0.22, { roof: '#3f5a46', monument: ownPick(c, ['figure', 'urn', 'angel'], 7) });
  if (L) {
    // a bandstand on the lawn and a palm house in the corner by the lake
    bandstand(c, side * 0.15, 0.6, 0.15, { roof: ownPick(c, ['#3f5a46', '#2f4a6a', '#8a432e'], 8) });
    const px = side * 0.78, pz = 0.64, py = c.gy(px, pz);
    gb.cbox(px, py - 0.01, pz, 0.2, 0.04, 0.4, STONE, 0, 0.008);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.3); gb.box(px, py + 0.03, pz, 0.18, 0.14, 0.38, '#9fbcc0'); gb.noGlow();
    gb.cyl(px, py + 0.17, pz - 0.19, 0.09, 0.09, 0.38, 10, '#c8dadc', 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) gb.sphere(px, py + 0.1, pz - 0.12 + i * 0.12, 0.04, '#4f7a3a', 0);
    parkTree(c, side * 0.5, 0.82, 0.9, trees[0]);
    for (const z of [0.9, 0.08]) for (const s of [-1, 1]) lamp(c, ax + s * 0.08, z, 0.3);
  }
  // a hedge round the park (railings for the Royal Park), gate piers at the avenue
  if (!c.inner) {
    frontage(c, -0.96, 0.96, 0.95, [ax], L ? 'railings' : 'hedge');
    gatePiers(c, ax, 0.95, 0.16);
    phedge(c, 0, -0.95, 1.9, 0.05); phedge(c, -0.95, 0, 0.05, 1.86); phedge(c, 0.95, 0, 0.05, 1.86);
  }
  void rng;
  if (f.turned) gb.pop();
};

// Hedge Maze: a maze of clipped yew (a different one in every park) round a
// lookout in the middle (a little temple, a fountain, a statue or a tree),
// the way in from the lawn, where there's topiary and a seat. The Great
// Maze is bigger and taller, with a viewing mound and pavilion at its
// heart, a tea kiosk and lamps. Where the maze lies by the park's seed.
M.maze = (c, L) => {
  const { gb } = c;
  const f = rowFrame(c);
  const m = ownPick(c, [-1, 1], 1), heart = ownPick(c, ['temple', 'fountain', 'statue', 'tree'], 2);
  const w = L ? 1.6 : 1.3, d = L ? 1.36 : 1.1, cols = L ? 9 : 7, rows = L ? 7 : 5;
  const mx = L ? 0.12 * -m : m * 0.25, mz = -0.92 + d / 2;
  const mid = maze(c, mx, mz, w, d, cols, rows, { h: L ? 0.09 : 0.07 });
  // the heart of the maze
  if (L) {
    const y = c.gy(mid.x, mid.z);
    gb.cyl(mid.x, y - 0.02, mid.z, 0.08, 0.1, 0.06, 10, '#6f8a4a');
    folly(c, mid.x, mid.z, 'temple', 0.45);
  } else if (heart === 'temple') folly(c, mid.x, mid.z, 'temple', 0.4);
  else if (heart === 'fountain') fountain(c, mid.x, mid.z, 0.06, 'tiers');
  else if (heart === 'statue') monument(c, mid.x, mid.z, ownPick(c, ['figure', 'urn', 'angel'], 3), 0.45, BRONZE);
  else parkTree(c, mid.x, mid.z, 0.8, 'round');
  // the lawn in front, with topiary, a seat and the way in
  walk(c, [[mid.gate, mz + d / 2], [mid.gate, 0.94]], 0.09);
  const tz = 0.68 + (L ? 0.1 : 0);
  const shapes = ['peacock', 'spiral', 'ball', 'tiers', 'cone'];
  for (let i = 0; i < 4; i++) { const x = -0.8 + i * 0.22 + (m > 0 ? 0 : 0.88); if (Math.abs(x - mid.gate) > 0.12) topiaryShape(c, x, tz, 1.2, shapes[(i + (c.variant & 3)) % shapes.length]); }
  if (!L) {
    // a side lawn with a seat and a tree beside the maze
    const sx = -m * 0.78;
    parkTree(c, sx + m * 0.04, -0.5, 1.0, ownPick(c, ['cedar', 'round', 'copper'], 4));
    bench(c, sx, -0.1, -m * Math.PI / 2);
    bed(c, sx, 0.3, 0.2, 0.3, {});
    spot(c, sx + m * 0.08, -0.1);
  } else {
    feature(c, 'kiosk', m * 0.66, 0.66, 0.2, { wall: '#ece6da', roof: '#2f4a3a', awning: '#3f6a8f' });
    for (const x of [-0.9, 0.9]) lamp(c, x, 0.9, 0.3);
  }
  bench(c, mid.gate + (mid.gate > 0 ? -0.2 : 0.2), 0.86, Math.PI);
  spot(c, mid.gate + 0.16, 0.7); spot(c, mid.gate - 0.16, 0.7); spot(c, mid.x + 0.06, mid.z + 0.06);
  if (!c.inner) phedge(c, 0, 0.95, 1.9, 0.04, 0.05);
  if (f.turned) gb.pop();
};

// Lido: a swimming pool with a tiled surround, changing cabins along one
// side, a sun terrace with deck chairs and parasols, a diving board, and
// the way in from the street through a white entrance house. The Lido
// proper has a diving stage, a fountain cascade, a café terrace and a
// clock over its gate. Swimmers in summer; drained and quiet in winter.
M.lido = (c, L) => {
  const { gb, rng } = c;
  const f = rowFrame(c);
  const m = ownPick(c, [-1, 1], 1), tile = ownPick(c, ['#e8e2d4', '#dfe8e8', '#ece0c8'], 2), cabin = ownPick(c, ['#3f6a8f', '#c8423a', '#2f7a7a', '#e8b84a'], 3);
  const q = seasonAt(c, 0.5), px = -m * 0.12, pz = -0.18, pw = L ? 1.2 : 1.05, pd = L ? 0.72 : 0.62;
  // the surround and the pool
  plinth(c, px, pz, pw + 0.3, pd + 0.3);
  // (raised a little, so the pool can be sunk into the surround)
  const base = Math.min(0, c.gy(px, pz), c.gy(px - pw / 2, pz - pd / 2), c.gy(px + pw / 2, pz + pd / 2)) - 0.02, top = 0.09, fl = 0.02;
  for (const [sx, sz, sw, sd] of [[0, -(pd + 0.15) / 2, pw + 0.3, 0.15], [0, (pd + 0.15) / 2, pw + 0.3, 0.15], [-(pw + 0.15) / 2, 0, 0.15, pd], [(pw + 0.15) / 2, 0, 0.15, pd]]) gb.cbox(px + sx, base, pz + sz, sw, top - base, sd, tile, 0, 0.006);
  // the pool: tiled walls and floor; water in it but in winter, when it is drained
  gb.box(px, base, pz, pw, fl - base, pd, '#9ab8c4');
  for (const s of [-1, 1]) { gb.box(px, fl, pz + s * (pd / 2 - 0.004), pw, top - fl, 0.008, '#7fb0c4'); gb.box(px + s * (pw / 2 - 0.004), fl, pz, 0.008, top - fl, pd, '#7fb0c4'); }
  if (q !== 3) {
    gb.box(px, fl, pz, pw - 0.01, top - 0.018 - fl, pd - 0.01, '#3f8fb0');
    gb.box(px, top - 0.02, pz, pw - 0.02, 0.003, pd - 0.02, '#4fa8c8');
    for (let i = 1; i < 4; i++) gb.box(px, top - 0.016, pz - pd / 2 + (i * pd) / 4, pw - 0.04, 0.004, 0.006, i === 2 ? '#c8423a' : '#e8e0d0');
  } else for (let i = 0; i < 5; i++) gb.box(px + rng.float(-pw / 2.5, pw / 2.5), fl, pz + rng.float(-pd / 2.5, pd / 2.5), 0.02, 0.003, 0.016, '#8a6a3a');
  // swimmers in summer
  if (q === 1) for (let i = 0; i < 6; i++) { const sx = px + rng.float(-pw / 2.4, pw / 2.4), sz = pz + rng.float(-pd / 2.4, pd / 2.4); gb.sphere(sx, top - 0.014, sz, 0.012, ['#e8c8a8', '#c89a78', '#a87858'][i % 3]); gb.sphere(sx, top - 0.008, sz, 0.011, ['#c8423a', '#3f6a8f', '#e8e0d0', '#2f2f33'][i % 4], 0, 0.6); }
  // the diving board at the far end
  const dx = px + m * (pw / 2 - 0.02), dz = pz;
  gb.box(dx + m * 0.07, 0.09, dz, 0.04, 0.05, 0.06, tile);
  gb.boxC(dx - m * 0.03, 0.15, dz, 0.16, 0.01, 0.04, '#e8e0d0');
  if (L) {
    // the diving stage: a concrete tower with two boards
    gb.box(dx + m * 0.08, 0.05, dz + 0.15, 0.03, 0.34, 0.03, tile);
    gb.box(dx + m * 0.08, 0.05, dz + 0.23, 0.03, 0.34, 0.03, tile);
    for (const h of [0.22, 0.38]) gb.boxC(dx - m * 0.02, h, dz + 0.19, 0.18, 0.012, 0.07, tile);
  }
  // the changing cabins along one side
  const cx = px - m * (pw / 2 + 0.2);
  for (let i = 0; i < 5; i++) {
    const z = pz - pd / 2 + 0.06 + i * ((pd - 0.12) / 4), y = c.gy(cx, z);
    gb.cbox(cx, Math.min(0, y), z, 0.12, 0.14 - Math.min(0, y), 0.1, '#ece6da', 0, 0.006);
    gb.box(cx + m * 0.061, 0.01, z, 0.004, 0.1, 0.06, i % 2 ? cabin : '#e9dfc9');
    gb.wedge(cx, 0.14, z, 0.14, 0.12, 0.025, cabin, m > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // the sun terrace on the other side, deck chairs and parasols in summer
  const tx = px + m * (pw / 2 + 0.22);
  if (Math.abs(tx) < 0.86) {
    gb.box(tx, c.gy(tx, pz) - 0.005, pz, 0.3, 0.012, pd + 0.2, '#d8ccb0');
    if (q <= 1) for (let i = 0; i < 4; i++) { deckchair(c, tx + (i % 2 ? 0.06 : -0.06), pz - 0.25 + i * 0.16, -m * Math.PI / 2, i % 2 ? cabin : '#e9dfc9'); if (i % 2) cafeTable(c, tx, pz - 0.18 + i * 0.16, cabin); }
  }
  // the entrance house on the street, and a wall round
  const ez = 0.74;
  house(c, { x: 0, z: ez, w: L ? 0.56 : 0.44, d: 0.24, h: L ? 0.26 : 0.2, floors: 1, wall: '#ece6da', roof: L ? '#ece6da' : ownPick(c, ['#3f6a8f', '#2f4a3a', '#8a432e'], 4), roofType: L ? 'flat' : 'hip', rh: 0.08, nFront: 2, doorX: 0, chimney: false, fancy: false, lit: 0.8, noBack: true });
  if (L) {
    gb.cbox(0, 0.26, ez, 0.16, 0.12, 0.12, '#ece6da', 0, 0.006);
    wallClock(c, 0, 0.32, ez + 0.062, 0.035);
    sign(c, 0, 0.21, ez + 0.125, 0.3, 0.035, cabin);
    // the cascade fountain and the café terrace
    fountain(c, m * 0.66, 0.5, 0.11, 'tiers', tile);
    for (let i = 0; i < 3; i++) cafeTable(c, -m * (0.45 + i * 0.13), 0.52, i % 2 ? '#e9dfc9' : cabin);
  }
  for (const s of [-1, 1]) {
    const x0 = s * (L ? 0.3 : 0.24), x1 = s * 0.95;
    gb.cbox((x0 + x1) / 2, c.gy((x0 + x1) / 2, 0.92) - 0.01, 0.92, Math.abs(x1 - x0), 0.12, 0.04, '#ece6da', 0, 0.006);
  }
  for (const [x, z, w, d] of [[0, -0.94, 1.9, 0.04], [-0.94, 0, 0.04, 1.86], [0.94, 0, 0.04, 1.86]]) gb.cbox(x, c.gy(x, z) - 0.01, z, w, 0.12, d, '#ece6da', 0, 0.006);
  lamp(c, -0.3, 0.86, 0.3); lamp(c, 0.3, 0.86, 0.3);
  parkTree(c, m * 0.76, -0.78, 1, 'poplar'); parkTree(c, -m * 0.8, 0.5, 1, 'poplar');
  spot(c, tx, pz - 0.1); spot(c, tx, pz + 0.15); spot(c, px - m * 0.3, pz + pd / 2 + 0.08); spot(c, px + m * 0.3, pz + pd / 2 + 0.08);
  if (f.turned) gb.pop();
};

// A palm house: a glazed rotunda under a dome with a wing either side,
// white ironwork, palms showing through, glowing at night. Along x.
function palmHouse(c, x, z, len, s = 1) {
  const { gb } = c;
  const d = 0.34 * s, h = 0.16 * s, glass = '#a9c4c8', frame = '#ece6da';
  plinth(c, x, z, len, d);
  gb.cbox(x, 0, z, len, 0.035, d, STONE_L, 0, 0.006);
  // the wings: glass walls under barrel roofs
  for (const sd of [-1, 1]) {
    const wx = x + sd * (len / 4 + 0.05 * s), ww = len / 2 - 0.12 * s;
    gb.glow(1.2, 1.3, 1.0, 1.3);
    gb.box(wx, 0.035, z, ww, h, d - 0.02, glass);
    gb.cyl(wx - ww / 2, 0.035 + h, z, d / 2 - 0.01, d / 2 - 0.01, ww, 12, '#b8d0d4', 0, 0, -Math.PI / 2);
    gb.noGlow();
    for (let i = 0; i <= 6; i++) gb.box(wx - ww / 2 + (i * ww) / 6, 0.035, z + d / 2 - 0.012, 0.006, h + 0.01, 0.006, frame);
  }
  // the rotunda and its dome, a lantern on top
  gb.glow(1.2, 1.3, 1.0, 1.3);
  gb.cyl(x, 0.035, z, d * 0.62, d * 0.62, h * 1.5, 14, glass);
  gb.sphere(x, 0.035 + h * 1.5, z, d * 0.62, '#b8d0d4', 1, 0.9);
  gb.noGlow();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; gb.box(x + Math.cos(a) * d * 0.62, 0.035, z + Math.sin(a) * d * 0.62, 0.006, h * 1.5, 0.006, frame); }
  gb.cyl(x, 0.035 + h * 1.5 + d * 0.55, z, 0.03 * s, 0.035 * s, 0.05 * s, 8, frame);
  gb.cone(x, 0.035 + h * 1.5 + d * 0.55 + 0.05 * s, z, 0.03 * s, 0.04 * s, 8, frame);
  // palms reaching up inside
  for (const ox of [-len * 0.32, len * 0.32, 0]) {
    gb.cyl(x + ox, 0.035, z, 0.008, 0.01, h * (ox ? 0.8 : 1.6), 5, '#6e5034');
    for (let k = 0; k < 5; k++) gb.boxC(x + ox + Math.cos(k * 1.26) * 0.03, 0.035 + h * (ox ? 0.8 : 1.6), z + Math.sin(k * 1.26) * 0.03, 0.07, 0.006, 0.02, '#4f7a3a', 0, -k * 1.26, -0.4);
  }
}

// Palm House: a great glass palm house along the back among botanic beds,
// a lily pond in front of it, specimen trees and walks. Royal Botanic
// Gardens: a bigger house, a temperate house beside it, a fountain and
// lamps. Which side what lies by the park's seed.
M.palmhouse = (c, L) => {
  const { gb } = c;
  const f = rowFrame(c);
  const m = ownPick(c, [-1, 1], 1), r = ownRng(c, 2);
  palmHouse(c, L ? -m * 0.12 : 0, -0.62, L ? 1.3 : 1.15, L ? 1.15 : 1);
  if (L) {
    gb.push(m * 0.72, 0, -0.6, Math.PI / 2);
    greenhouse(c, 0, 0, 0.5, 0.2, { h: 0.16 });
    gb.pop();
  }
  // the lily pond in front, its walks and beds
  const ly = water(c, [[0, -0.12, 0.24], [m * 0.16, -0.08, 0.16]], { stone: true });
  lilies(c, 0, -0.12, ly, 6, 0.16);
  // giant water lilies: big round pads
  if (seasonAt(c, 0.5) === 1) for (let i = 0; i < 3; i++) gb.cyl(r.float(-0.12, 0.12), ly + 0.002, -0.12 + r.float(-0.1, 0.1), 0.045, 0.045, 0.006, 12, '#5a8a3a');
  if (L && seasonAt(c, 0.5) !== 3) { c.fountain = [0, ly + 0.08, -0.12]; gb.cyl(0, ly - 0.01, -0.12, 0.02, 0.03, 0.04, 8, STONE); }
  walk(c, [[0, 0.14], [0, 0.94]], 0.1, GRAVEL_D);
  ringWalk(c, 0, -0.12, 0.34, 0.07, GRAVEL_D);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) bed(c, s * (0.36 + i * 0.18), 0.32, 0.13, 0.22, { edge: 'box', bands: true });
  for (const s of [-1, 1]) bed(c, s * 0.55, -0.12, 0.3, 0.12, {});
  parkTree(c, -m * 0.72, 0.7, 1.1, 'cedar');
  parkTree(c, m * 0.82, 0.74, 1.0, ownPick(c, ['copper', 'cherry', 'birch'], 3));
  tubPlant(c, -0.1, 0.7, true); tubPlant(c, 0.1, 0.7, true);
  for (const s of [-1, 1]) lamp(c, s * 0.14, 0.86, 0.3);
  if (L) for (const s of [-1, 1]) lamp(c, s * 0.42, 0.14, 0.3);
  if (!c.inner) {
    frontage(c, -0.96, 0.96, 0.95, [0], 'railings');
    gatePiers(c, 0, 0.95, 0.18, STONE_L);
    phedge(c, 0, -0.95, 1.9, 0.05); phedge(c, -0.95, 0, 0.05, 1.86); phedge(c, 0.95, 0, 0.05, 1.86);
  }
  spot(c, 0.2, 0.2); spot(c, -0.2, 0.2); spot(c, 0.4, -0.3); spot(c, -0.4, -0.3); spot(c, 0, 0.55);
  if (f.turned) gb.pop();
};

// ---------------------------------------------------------------- zoo
function elephant(c, x, z, ry, s = 1) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry, s);
  const g = '#8a8580';
  gb.blob(0, 0.1, 0, 0.07, 0.06, 0.1, g);
  for (const [lx, lz] of [[-0.04, 0.06], [0.04, 0.06], [-0.04, -0.06], [0.04, -0.06]]) gb.cyl(lx, 0, lz, 0.02, 0.022, 0.08, 6, shade(g, 0.92));
  gb.sphere(0, 0.13, 0.11, 0.048, g);
  for (const sd of [-1, 1]) gb.boxC(sd * 0.045, 0.13, 0.1, 0.012, 0.06, 0.05, shade(g, 0.88), 0, sd * 0.4);
  gb.boxC(0, 0.07, 0.15, 0.018, 0.09, 0.018, g, 0.25);
  gb.pop();
}
function giraffe(c, x, z, ry, s = 1) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry, s);
  const y = '#d8a848', sp = '#8a5a2a';
  gb.box(0, 0.09, 0, 0.045, 0.045, 0.1, y);
  for (const [lx, lz] of [[-0.016, 0.04], [0.016, 0.04], [-0.016, -0.04], [0.016, -0.04]]) gb.box(lx, 0, lz, 0.01, 0.09, 0.01, y);
  gb.boxC(0, 0.2, 0.05, 0.016, 0.18, 0.016, y, 0.35);
  gb.box(0, 0.28, 0.08, 0.02, 0.022, 0.045, y);
  for (const [px, py, pz] of [[0.023, 0.11, 0.02], [-0.023, 0.1, -0.03], [0.023, 0.12, -0.02], [0.01, 0.2, 0.06]]) gb.box(px, py, pz, 0.004, 0.014, 0.014, sp);
  gb.pop();
}
function bear(c, x, z, ry) {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.blob(0, 0.04, 0, 0.04, 0.032, 0.055, '#5a3a24');
  gb.sphere(0, 0.06, 0.05, 0.025, '#5a3a24');
  gb.sphere(0, 0.055, 0.073, 0.01, '#3a2414');
  gb.pop();
}
function penguin(c, x, y, z, ry) {
  const { gb } = c;
  gb.push(x, y, z, ry);
  gb.cyl(0, 0, 0, 0.008, 0.011, 0.03, 6, '#1f1f24');
  gb.box(0, 0.006, 0.006, 0.01, 0.018, 0.004, '#f2ede0');
  gb.sphere(0, 0.034, 0, 0.008, '#1f1f24');
  gb.pop();
}
function flamingo(c, x, y, z, ry) {
  const { gb } = c;
  gb.push(x, y, z, ry);
  gb.box(0, 0, 0, 0.003, 0.04, 0.003, '#d87a8a');
  gb.sphere(0, 0.045, 0, 0.012, '#f08a9a', 0, 0.7);
  gb.boxC(0, 0.065, 0.008, 0.004, 0.03, 0.004, '#f08a9a', 0.3);
  gb.pop();
}
// A wire aviary dome with birds of every colour inside.
function aviary(c, x, z, r) {
  const { gb, rng } = c;
  const y = c.gy(x, z);
  plinth(c, x, z, r * 2, r * 2);
  gb.cyl(x, Math.min(0, y) - 0.01, z, r, r + 0.01, 0.04 - Math.min(0, y), 12, STONE_L);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const t0 = (k / 4) * Math.PI / 2, t1 = ((k + 1) / 4) * Math.PI / 2;
      const p0 = [x + Math.cos(a) * r * Math.cos(t0), 0.03 + r * Math.sin(t0) * 1.2, z + Math.sin(a) * r * Math.cos(t0)];
      const p1 = [x + Math.cos(a) * r * Math.cos(t1), 0.03 + r * Math.sin(t1) * 1.2, z + Math.sin(a) * r * Math.cos(t1)];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      gb.boxC((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, 0.005, len, 0.005, '#2f3a3a', Math.atan2(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), p1[1] - p0[1]), Math.atan2(p1[0] - p0[0], p1[2] - p0[2]), 0);
    }
  }
  // the wire mesh as a faint dome, rings round it
  for (const t of [0.35, 0.7, 1.0]) gb.cyl(x, 0.03 + r * Math.sin(t * Math.PI / 2) * 1.2, z, r * Math.cos(t * Math.PI / 2) + 0.006, r * Math.cos(t * Math.PI / 2) + 0.006, 0.006, 14, '#2f3a3a');
  gb.sphere(x, 0.03 + r * 1.2, z, 0.02, GOLD);
  parkTree(c, x, z, 0.6, 'round');
  for (let i = 0; i < 7; i++) { const a = rng.float(0, 6.28), d = rng.float(0.2, 0.7) * r; gb.sphere(x + Math.cos(a) * d, 0.08 + rng.float(0, r * 0.6), z + Math.sin(a) * d, 0.012, ['#d8363a', '#3f8ad8', '#e8c040', '#4fb04a', '#f2ede0'][i % 5]); }
}
// Zoo: a gate on the street with a ticket kiosk; the elephant house and
// its paddock, a giraffe paddock, a bear pit, a penguin pool and an aviary,
// arranged round the walks by the park's seed. The Zoological Gardens add a
// monkey house with a clock tower, a flamingo pool, more of everything and
// lamps.
M.zoo = (c, L) => {
  const { gb } = c;
  const f = rowFrame(c);
  const order = [['elephants', 'aviary', 'bears', 'giraffes'], ['aviary', 'elephants', 'giraffes', 'bears'], ['giraffes', 'elephants', 'aviary', 'penguins'], ['elephants', 'giraffes', 'penguins', 'aviary']][(c.variant >>> 3) % 4];
  const brick = ownPick(c, ['#9a5640', '#a3624a', '#b07454'], 1), roof = ownPick(c, ['#5a5f63', '#3f5a46', '#8a432e'], 2);
  // the walks: a cross from the gate
  walk(c, [[0, 0.94], [0, -0.85]], 0.1, GRAVEL_D); walk(c, [[-0.85, 0.05], [0.85, 0.05]], 0.1, GRAVEL_D);
  const Q = [[-0.48, -0.46], [0.48, -0.46], [-0.48, 0.5], [0.48, 0.5]];
  const paddock = (x, z, w, d, ground = '#a8925a') => {
    gb.box(x, c.gy(x, z) - 0.006, z, w, 0.01, d, ground);
    fence(c, x - w / 2, z - d / 2, x + w / 2, z + d / 2, '#6e5034');
  };
  order.forEach((kind, i) => {
    const [x, z] = Q[i];
    if (kind === 'elephants') {
      paddock(x, z + (z < 0 ? 0.08 : -0.06), 0.6, 0.42);
      // the elephant house: brick with a domed roof
      const hx = x + (x < 0 ? -0.12 : 0.12), hz = z + (z < 0 ? -0.22 : 0.24);
      gb.cbox(hx, 0, hz, 0.3, 0.16, 0.14, brick, 0, 0.01);
      gb.sphere(hx, 0.16, hz, 0.09, roof, 1, 0.7);
      for (const s of [-1, 1]) gb.sphere(hx + s * 0.11, 0.16, hz, 0.04, roof, 1, 0.8);
      gb.box(hx, 0, hz + (z < 0 ? 0.071 : -0.071), 0.08, 0.11, 0.006, '#3a2f28');
      elephant(c, x - 0.1, z + 0.05, 0.6); elephant(c, x + 0.12, z + 0.1, -2.2, 0.75);
    } else if (kind === 'giraffes') {
      paddock(x, z, 0.62, 0.5, '#b8a46a');
      giraffe(c, x - 0.12, z, 0.4); giraffe(c, x + 0.1, z - 0.08, 2.6, 0.85);
      parkTree(c, x + 0.2, z + 0.14, 1.1, 'round');
      gb.cbox(x - 0.22, c.gy(x - 0.22, z - 0.18), z - 0.18, 0.12, 0.2, 0.1, '#7d5b3b', 0, 0.006);
      gb.wedge(x - 0.22, c.gy(x - 0.22, z - 0.18) + 0.2, z - 0.18, 0.14, 0.12, 0.03, roof, 0);
    } else if (kind === 'bears') {
      // a sunken pit with a climbing pole
      const y = c.gy(x, z);
      gb.cyl(x, y - 0.02, z, 0.24, 0.25, 0.08, 14, STONE);
      gb.cyl(x, y + 0.02, z, 0.21, 0.21, 0.04, 14, '#8a7a62');
      gb.box(x, y + 0.06, z, 0.016, 0.22, 0.016, '#5e432c');
      bear(c, x - 0.08, z + 0.05, 1.2); bear(c, x + 0.06, z - 0.06, -0.8);
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; gb.box(x + Math.cos(a) * 0.25, y + 0.06, z + Math.sin(a) * 0.25, 0.006, 0.06, 0.006, IRON); }
    } else if (kind === 'penguins') {
      const ly = water(c, [[x, z, 0.2], [x + 0.08, z - 0.05, 0.14]], { stone: true, color: '#4f9fbf' });
      gb.cbox(x - 0.1, ly - 0.01, z + 0.06, 0.12, 0.04, 0.1, '#e8e2d4', 0.4, 0.01);
      for (let i = 0; i < 5; i++) penguin(c, x - 0.12 + i * 0.03, ly + 0.03, z + 0.05 + (i % 2) * 0.03, i);
      railings(c, x - 0.27, z - 0.24, x + 0.27, z + 0.24, null);
    } else aviary(c, x, z, 0.24);
  });
  if (L) {
    // the monkey house with its clock tower, and a flamingo pool
    const mx = ownPick(c, [-1, 1], 3) * 0.78;
    gb.cbox(mx, 0, -0.84, 0.3, 0.18, 0.18, brick, 0, 0.01);
    gb.hip(mx, 0.18, -0.84, 0.3, 0.18, 0.08, roof, 0.03);
    gb.cbox(mx, 0.18, -0.84, 0.08, 0.2, 0.08, brick, 0, 0.006);
    wallClock(c, mx, 0.32, -0.799, 0.025);
    gb.roof(mx, 0.38, -0.84, 0.1, 0.1, 0.07, 0, roof);
    const fx = -mx * 0.9, fz = 0.82;
    const ly = water(c, [[fx, fz, 0.1], [fx + 0.08, fz, 0.07]]);
    for (let i = 0; i < 4; i++) flamingo(c, fx - 0.05 + i * 0.04, ly, fz + (i % 2) * 0.03 - 0.01, i);
    for (const s of [-1, 1]) lamp(c, s * 0.14, 0.3, 0.3);
  }
  // the gate on the street, a ticket kiosk beside it
  gatePiers(c, 0, 0.94, 0.2, brick);
  gb.boxC(0, 0.3, 0.94, 0.26, 0.04, 0.03, '#2f2f33');
  sign(c, 0, 0.32, 0.96, 0.2, 0.03, ownPick(c, ['#2f4a3a', '#5a2a2a', '#2f3a5a'], 4));
  gb.push(0.26, 0, 0.84, Math.PI);
  kiosk(c, 0, 0, 0.14, 0.1, '#ece6da', roof, {});
  gb.pop();
  frontage(c, -0.96, -0.12, 0.95, [], 'railings'); frontage(c, 0.12, 0.96, 0.95, [], 'railings');
  for (const [x, z, w, d] of [[0, -0.95, 1.9, 0.04], [-0.95, 0, 0.04, 1.86], [0.95, 0, 0.04, 1.86]]) gb.cbox(x, c.gy(x, z) - 0.01, z, w, 0.09, d, brick, 0, 0.006);
  const tm = L ? Math.sign(ownPick(c, [-1, 1], 3)) : 1;
  parkTree(c, L ? 0.8 * tm : -0.8, 0.8, 1, 'lime'); if (!L) parkTree(c, 0.8, -0.8, 1, ownPick(c, ['round', 'pine'], 5));
  spot(c, 0.12, 0.2); spot(c, -0.12, -0.2); spot(c, 0.4, 0.12); spot(c, -0.4, 0.12); spot(c, 0.12, -0.5);
  if (f.turned) gb.pop();
};

// ------------------------------------------------- grand and city parks
// The grounds a 2×2 park grew into (a Grand Park, 3×3) and those grown
// again (a City Park, 4×4): the park it was still stands in the corner it
// stood in (b.flavor, see parkOrigin), now inside the bigger grounds, and
// the land it took (an L of plots round two sides of it) is laid out as
// garden rooms along a walk: a lodge at the gate on the street, a
// playground, and by the park's seed rose gardens, a bandstand lawn, a
// pond, tennis courts, flower walks, a monument, a glasshouse, a grove of
// trees from round the world or a tea room. Railings round the whole park.
// The second level (Pleasure Grounds, Central Park) lights the walks and
// fills the rooms out a level further.
const CORES = { 3: ['landscapepark', 'landscapepark', 'maze', 'palmhouse', 'lido', 'sportsground', 'zoo'], 4: ['grandpark'] };
const ROOMS = ['meadow', 'rosegarden', 'bandstand', 'pond', 'meadow', 'courts', 'grove', 'statue', 'glasshouse', 'tearoom', 'flowers', 'garden', 'fountain'];
const topLevel = (t) => BUILDINGS[t].levels.length - 1;

// A one-plot room of the grounds, its front (+z) turned to the walk.
function room(c, kind, x, z, ry, L, salt, o = {}) {
  const { gb } = c;
  const keep = { variant: c.variant, flavor: c.flavor, work: c.work, Ex: c.Ex, Ez: c.Ez, inner: c.inner };
  c.variant = (Math.imul((c.variant || 0) ^ 0x5bd1e995, 31 + salt * 2) + salt * 7919) >>> 0;
  c.flavor = null; c.Ex = c.Ez = 0.5; c.inner = true;
  gb.push(x, 0, z, ry);
  if (PARK_MODELS[kind]) PARK_MODELS[kind](c, Math.min(kind === 'garden' ? 2 : L + 1, topLevel(kind)));
  else if (kind === 'glasshouse') {
    greenhouse(c, 0, -0.18, 0.62, 0.22, { h: 0.17 });
    for (const s of [-1, 1]) bed(c, s * 0.24, 0.16, 0.3, 0.16, { edge: 'box' });
    walk(c, [[0, 0.46], [0, -0.05]], 0.09);
    spot(c, 0.1, 0.1);
  } else if (kind === 'meadow') {
    // open lawn under a few great trees, somewhere to sit out or spread a picnic
    const r = ownRng(c, 6), big = ['round', 'lime', 'copper', 'cedar', 'round'];
    for (let i = 0; i < 2; i++) { const k = big[r.int(0, big.length - 1)]; parkTree(c, (i ? 1 : -1) * r.float(0.18, 0.24), -0.2 + r.float(-0.06, 0.04) + i * 0.08, k === 'cedar' ? 1.0 : r.float(1.1, 1.3), k); }
    const q = seasonAt(c, 0.5);
    if (q === 1) {
      // a picnic rug and a hamper
      const px = r.float(-0.15, 0.15), pz = r.float(0.08, 0.2);
      c.gb.box(px, c.gy(px, pz) - 0.004, pz, 0.1, 0.006, 0.08, ownPick(c, ['#c8423a', '#3f6a8f', '#d8a630'], 7), r.float(0, 1));
      c.gb.cbox(px + 0.03, c.gy(px, pz), pz - 0.01, 0.03, 0.022, 0.02, '#a07a50', 0, 0.004);
      deckchair(c, px - 0.12, pz + 0.05, Math.PI + 0.4, '#e9dfc9');
    } else bench(c, r.float(-0.1, 0.1), 0.24, Math.PI);
    shrub(c, r.chance(0.5) ? 0.36 : -0.36, 0.3, 0.8);
    spot(c, 0, 0.12); spot(c, -0.2, 0.05); spot(c, 0.2, 0.1);
  } else if (kind === 'grove') {
    // trees from round the world
    const kinds = ['copper', 'birch', 'pine', 'cherry', 'lime', 'poplar', 'yew'], r = ownRng(c, 5);
    parkTree(c, 0, -0.06, 1.0, r.chance(0.5) ? 'cedar' : 'copper');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r.float(0, 1), d = r.float(0.24, 0.3);
      parkTree(c, Math.cos(a) * d, Math.sin(a) * d - 0.02, r.float(0.8, 1.0), kinds[(i + r.int(0, 6)) % kinds.length]);
    }
    walk(c, curve([0, 0.46], [0, -0.42], 0.16), 0.07);
    bench(c, 0.14, 0.3, Math.PI);
    spot(c, 0.1, 0.2); spot(c, -0.05, -0.2);
  } else if (kind === 'tearoom') {
    kiosk(c, 0, -0.2, 0.34, 0.2, ownPick(c, ['#ece6da', '#c9d3b8', '#e2b9a8'], 1), ownPick(c, ['#3f5a46', '#8a432e', '#5a5f63'], 2), { awning: ownPick(c, ['#a8473a', '#3f6a8f', '#4f7a45'], 3), chimney: true });
    for (let i = 0; i < 4; i++) cafeTable(c, -0.24 + i * 0.16, 0.2 + (i % 2) * 0.1, i % 2 ? null : ownPick(c, ['#a8473a', '#e9dfc9'], 4));
    for (const s of [-1, 1]) tubPlant(c, s * 0.38, 0.0, false);
    spot(c, 0.16, 0.28); spot(c, -0.16, 0.24);
  } else if (kind === 'fountain') {
    ringWalk(c, 0, 0, 0.3, 0.08);
    fountain(c, 0, 0, 0.18, ownPick(c, ['tiers', 'quatre', 'figure'], 1));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      bed(c, Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.1, 0.1, { round: true });
      const b = a + Math.PI / 4;
      bench(c, Math.cos(b) * 0.41, Math.sin(b) * 0.41, Math.atan2(-Math.cos(b), -Math.sin(b)));
    }
    spot(c, 0, 0.3); spot(c, 0.3, 0);
  } else if (kind === 'lodge') {
    // the keeper's lodge by the gate, beds either side of the way in
    const left = o.left || ownPick(c, [-1, 1], 1);
    house(c, { x: left * 0.26, z: -0.08, w: 0.3, d: 0.24, h: 0.24, floors: 1, wall: ownPick(c, ['#ece6da', '#d8c29a', '#cdb795', '#9a5640'], 2), roof: ownPick(c, ['#5a5f63', '#8a432e', '#b8955a'], 3), roofType: 'gable', rh: 0.16, nFront: 2, chimney: true, fancy: true, lit: 0.8 });
    bed(c, -left * 0.26, 0.24, 0.26, 0.12, { edge: 'box', bands: true });
    bed(c, -left * 0.26, -0.24, 0.26, 0.12, { edge: 'box' });
    shrub(c, left * 0.36, 0.32, 0.9);
    spot(c, 0, 0.2);
  }
  gb.pop();
  Object.assign(c, keep);
}

function grounds(c, L, n) {
  const { gb } = c;
  const H = n / 2, o = parkOrigin(c.flavor), inner = !!c.inner;
  // the park it grew from, and the corner it stands in
  const core = o && CORES[n].includes(o.type) ? o : { type: ownPick(c, CORES[n], 21), level: L, sx: null, sz: null, inner: null };
  const sx = core.sx || ownPick(c, [-1, 1], 22), sz = core.sz || ownPick(c, [-1, 1], 23);
  const keep = { flavor: c.flavor, inner: c.inner, Ex: c.Ex, Ez: c.Ez };
  gb.push(sx * 0.5, 0, sz * 0.5);
  c.flavor = core.inner; c.inner = true; c.Ex = c.Ez = (n - 1) / 2;
  PARK_MODELS[core.type](c, Math.min(core.level ?? L, topLevel(core.type)));
  gb.pop();
  Object.assign(c, keep);
  c.work = [-H + 0.1, -H + 0.1, H - 0.1, H - 0.1];
  // the new land: a column of plots on the far side in x and a row on the
  // far side in z, each turned to face into the park
  const colX = -sx * (H - 0.5), rowZ = -sz * (H - 0.5), cells = [];
  for (let k = 0; k < n; k++) cells.push({ x: colX, z: -H + 0.5 + k, ry: sx > 0 ? Math.PI / 2 : -Math.PI / 2, col: true });
  for (let i = 0; i < n; i++) { const x = -H + 0.5 + i; if (Math.abs(x - colX) > 0.1) cells.push({ x, z: rowZ, ry: sz > 0 ? 0 : Math.PI }); }
  // the corner plot, where the column meets the row, faces along the walk
  const corner = cells.find(p => Math.abs(p.x - colX) < 0.1 && Math.abs(p.z - rowZ) < 0.1);
  corner.ry = sz > 0 ? 0 : Math.PI; corner.col = false;
  // the gate: on the street (+z), at the new land's plot nearest the middle
  const front = inner ? null : cells.filter(p => p.z > H - 1).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
  if (front) { front.kind = 'lodge'; front.ry = 0; }
  // a playground for the children, then the rooms in the park's own order
  const r = ownRng(c, 24), pool = ROOMS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = r.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const rest = cells.filter(p => !p.kind);
  rest[r.int(0, rest.length - 1)].kind = 'playground';
  if (!corner.kind) corner.kind = r.chance(0.5) ? 'bandstand' : 'fountain';
  let pi = 0;
  for (const p of cells) if (!p.kind) { while (pool[pi % pool.length] === corner.kind) pi++; p.kind = pool[pi++ % pool.length]; }
  cells.forEach((p, i) => room(c, p.kind, p.x, p.z, p.ry, L, i + 1, p === front && front.col ? { left: -sx } : {}));
  // the walk along the inside of the new land, round two sides of the old park
  const ix = -sx * (H - 1), iz = -sz * (H - 1);
  walk(c, [[ix, sz * (H - 0.1)], [ix, iz], [sx * (H - 0.1), iz]], 0.11);
  // and in from the gate
  if (front && !front.col) walk(c, [[front.x, H - 0.08], [front.x, iz]], 0.11);
  else if (front) walk(c, [[front.x, H - 0.08], [front.x, H - 0.5], [ix, H - 0.5]], 0.1);
  for (const [x, z] of [[ix, iz], [ix, (iz + sz * H) / 2], [(ix + sx * H) / 2, iz]]) spot(c, x, z);
  // lamps along the walk at the second level, between the rooms
  if (L) {
    for (let k = 1; k < n; k++) lamp(c, ix - sx * 0.06, -H + k, 0.32);
    for (let k = 1; k < n; k++) if (Math.abs(-H + k - ix) > 0.2) lamp(c, -H + k, iz - sz * 0.06, 0.32);
  }
  // railings round the whole park, and the gate on the street
  if (!inner) {
    railings(c, -H + 0.03, -H + 0.03, H - 0.03, H - 0.03, front.x, ownPick(c, [IRON, IRON_G, '#2f3a5a'], 27));
    gatePiers(c, front.x, H - 0.05, 0.18, ownPick(c, [STONE_L, '#9a5640', STONE], 28));
    gb.boxC(front.x, c.gy(front.x, H - 0.05) + 0.24, H - 0.05, 0.2, 0.012, 0.012, IRON);
    lamp(c, front.x - 0.15, H - 0.1, 0.32); lamp(c, front.x + 0.15, H - 0.1, 0.32);
  }
}
M.grandpark = (c, L) => grounds(c, L, 3);
M.citypark = (c, L) => grounds(c, L, 4);

// ============================================================ plantings
// A Planting is one of the kinds in PLANTINGS (its b.flavor, or one by its
// seed: kindOf), drawn more elaborately at each level: a Flower Bed, an
// Ornamental Garden, a Show Garden. Each kind follows the seasons in its own
// way (bulbs in spring, the cottage border in summer, wild flowers gone to
// seed in autumn...). Laid out by the planting's own seed, the same at every
// level; kept within the plot (±0.44).

// A clipped box hedge from (x0, z0) to (x1, z1), at any angle.
function hedgeLine(c, x0, z0, x1, z1, h = 0.04, t = 0.026) {
  const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  c.gb.cbox(mx, c.gy(mx, mz) - 0.01, mz, t, h + 0.01, len + t * 0.5, hedgeCol(c), Math.atan2(x1 - x0, z1 - z0), 0.008);
}
// A ring of clipped hedge of radius r.
function hedgeRing(c, x, z, r, h = 0.04, n = 16) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    hedgeLine(c, x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, h);
  }
}
// Tall flower spikes (hollyhocks, foxgloves, lupins, delphiniums) for a
// border: in flower in summer, lower and green in spring, a few dahlias
// and asters in autumn, cut-back stems in winter.
function spikes(c, x, z, n, spread, cols) {
  const { gb, rng } = c;
  const q = seasonAt(c, spotHash(c, x, z, 29));
  for (let i = 0; i < n; i++) {
    const fx = x + rng.float(-spread, spread), fz = z + rng.float(-spread * 0.5, spread * 0.5), y = c.gy(fx, fz);
    const h = rng.float(0.07, 0.15) * (q === 0 ? 0.55 : q === 3 ? 0.4 : 1);
    gb.box(fx, y, fz, 0.008, h, 0.008, q === 3 ? '#6a5a42' : q === 2 ? '#5a6a32' : '#4f7a3a');
    if (q === 3) continue;
    gb.sphere(fx, y + 0.02, fz, 0.022, q === 2 ? '#6a7034' : '#4f7a3a', 0, 0.8);
    if (q === 1) for (let k = 0; k < 3; k++) gb.sphere(fx, y + h * (0.55 + k * 0.17), fz, 0.014 - k * 0.003, cols[(i + k) % cols.length]);
    else if (q === 2 && i % 2) gb.sphere(fx, y + h * 0.8, fz, 0.017, ['#c8702a', '#8a2a3a', '#9c74c9'][i % 3]);
  }
}
// Carpet bedding: dwarf plants set out like a carpet in a pattern (a star,
// a chequer, a wheel or a crest), w × d. Spring and summer the bedding;
// autumn the late bedding in bronze and gold; winter low silvery foliage.
function carpet(c, x, z, w, d, pattern, y = null) {
  const { gb } = c;
  const q = seasonAt(c, spotHash(c, x, z, 31));
  const cols = q === 3 ? ['#8a9a8a', '#6a7a6a', '#a8b0a0'] : q === 2 ? ['#c8702a', '#d8a030', '#8a2a3a', '#6a7a3a'] : q === 0 ? ['#f2d040', '#d9363a', '#f2ede0', '#7a6ad9'] : ['#d9363a', '#f2ede0', '#3f6a8f', '#e8b84a', '#5f8a42'];
  const nx = Math.round(w / 0.04), nz = Math.round(d / 0.04);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const u = (i + 0.5) / nx - 0.5, v = (k + 0.5) / nz - 0.5, r = Math.hypot(u, v), a = Math.atan2(v, u);
    if (r > 0.5) continue;
    let ci;
    if (pattern === 'star') ci = r < 0.09 ? 0 : Math.cos(a * 5) > 0.3 - r ? 1 : r > 0.42 ? 3 : 2;
    else if (pattern === 'chequer') ci = (Math.floor((u + 0.5) * 5) + Math.floor((v + 0.5) * 5)) % 2 ? 1 : r > 0.42 ? 3 : 2;
    else if (pattern === 'wheel') ci = r < 0.1 ? 0 : Math.abs(Math.sin(a * 4)) < 0.25 ? 1 : r > 0.38 ? 3 : 2;
    else ci = r < 0.16 ? (Math.abs(u) < 0.05 || Math.abs(v) < 0.05 ? 1 : 0) : r > 0.4 ? 3 : Math.abs(u) > Math.abs(v) ? 2 : 1;
    const px = x + u * w, pz = z + v * d;
    gb.box(px, (y ?? c.gy(px, pz)) + 0.012, pz, w / nx + 0.002, 0.016, d / nz + 0.002, cols[ci % cols.length]);
  }
}
// Alpine cushions on a rockery: pink, purple, white and yellow in spring and
// summer, green mats the rest of the year.
function alpines(c, x, z, y, n, spread) {
  const { gb, rng } = c;
  const q = seasonAt(c, spotHash(c, x, z, 37));
  for (let i = 0; i < n; i++) {
    const ax = x + rng.float(-spread, spread), az = z + rng.float(-spread, spread);
    gb.sphere(ax, y + rng.float(0, 0.03), az, rng.float(0.018, 0.028), q <= 1 ? ['#e88fae', '#9c74c9', '#f2ede0', '#e8d050', '#d9536b'][i % 5] : q === 3 ? '#7a8478' : '#6a8a4a', 0, 0.55);
  }
}
// A rough heap of weathered stones.
function stones(c, x, z, r, n, h = 0.06) {
  const { gb, rng } = c;
  const y = c.gy(x, z);
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, 6.28), d = rng.float(0, r), s = rng.float(0.035, 0.07);
    gb.blob(x + Math.cos(a) * d, y + h * (1 - d / r) * 0.8, z + Math.sin(a) * d, s, s * 0.7, s * 0.85, ['#a8a090', '#9a9284', '#b4ac9c', '#8f877a'][i % 4], rng.float(0, 6));
  }
}
// Long grass with wild flowers: poppies, cornflowers, ox-eye daisies in
// summer, cowslips in spring, seed heads in autumn, brown stalks in winter.
function meadow(c, x, z, w, d, n) {
  const { gb, rng } = c;
  const q = seasonAt(c, spotHash(c, x, z, 41));
  const grass = ['#8aa850', '#7a9a48', '#a8a050', '#8a7a58'][q];
  for (let i = 0; i < Math.round(n / 7); i++) { const tx = x + rng.float(-w / 2.6, w / 2.6), tz = z + rng.float(-d / 2.6, d / 2.6); gb.sphere(tx, c.gy(tx, tz) + 0.006, tz, rng.float(0.04, 0.07), shade(grass, rng.float(0.88, 1.05)), 0, 0.42); }
  for (let i = 0; i < n; i++) {
    const fx = x + rng.float(-w / 2, w / 2), fz = z + rng.float(-d / 2, d / 2), y = c.gy(fx, fz), h = rng.float(0.03, 0.06);
    gb.boxC(fx, y + h / 2, fz, 0.006, h, 0.006, grass, rng.float(-0.2, 0.2), 0, rng.float(-0.2, 0.2));
    if (i % 3 === 0) {
      const col = q === 1 ? ['#d9363a', '#3f6ad8', '#f2ede0', '#d9363a'][i % 4] : q === 0 ? '#e8d050' : q === 2 ? '#8a6a3a' : null;
      if (col) gb.sphere(fx, y + h, fz, q === 2 ? 0.008 : 0.012, col);
    }
  }
}
// A box of pansies or geraniums, a trough or a tub, with the season's flowers.
function trough(c, x, z, w, ry = 0, col = '#6b4a2f') {
  const { gb } = c;
  gb.push(x, c.gy(x, z), z, ry);
  gb.cbox(0, 0, 0, w, 0.05, 0.06, col, 0, 0.006);
  gb.box(0, 0.044, 0, w - 0.012, 0.008, 0.05, SOIL);
  gb.pop();
  c.gb.push(x, 0, z, ry);
  blooms(c, 0, 0, Math.round(w / 0.03), w * 0.4, null, c.gy(x, z) + 0.05, 0.018);
  c.gb.pop();
}
// A lamp post with a hanging basket either side.
function basketPost(c, x, z) {
  lamp(c, x, z, 0.3);
  const y = c.gy(x, z), q = seasonAt(c, spotHash(c, x, z, 43));
  for (const s of [-1, 1]) {
    c.gb.box(x + s * 0.03, y + 0.22, z, 0.06, 0.004, 0.004, '#2f2c2a');
    c.gb.sphere(x + s * 0.055, y + 0.17, z, 0.024, '#4f7a3a', 0, 0.8);
    if (q <= 2) for (let k = 0; k < 3; k++) c.gb.sphere(x + s * 0.055 + (k - 1) * 0.015, y + 0.15 + (k % 2) * 0.02, z + 0.012, 0.01, ['#d9363a', '#e88fae', '#f2ede0', '#9c74c9'][(k + (s > 0 ? 1 : 0)) % 4]);
  }
}
// A clipped bay or box ball on a clear stem, in a stone urn or a tub.
function standard(c, x, z, s = 1, pot = STONE_L) {
  const { gb } = c;
  const y = c.gy(x, z);
  gb.cyl(x, y, z, 0.032 * s, 0.024 * s, 0.05 * s, 8, pot);
  gb.cyl(x, y + 0.05 * s, z, 0.006, 0.006, 0.09 * s, 5, BARK);
  gb.sphere(x, y + 0.16 * s, z, 0.045 * s, hedgeCol(c), 1);
}

const PLANT = {};
PLANT.bedding = (c, L) => {
  const { gb } = c;
  if (L === 0) {
    const n = ownPick(c, [2, 3], 3);
    for (let b = 0; b < n; b++) bed(c, 0, -0.3 + (b + 0.5) * (0.6 / n) * 1.2 - 0.06, 0.72, 0.15, { edge: 'brick', bands: true });
    bush(c, 0.4, 0.4, 0.85); bush(c, -0.4, -0.4, 0.85);
    return;
  }
  if (L === 1) {
    // a round bed in tiers round a clipped centre, little beds in the corners
    const y = c.gy(0, 0);
    gb.cyl(0, y - 0.02, 0, 0.3, 0.32, 0.07, 14, STONE);
    gb.cyl(0, y - 0.01, 0, 0.27, 0.27, 0.07, 14, SOIL_D);
    gb.cyl(0, y + 0.02, 0, 0.16, 0.18, 0.06, 12, SOIL);
    bed(c, 0, 0, 0.52, 0.52, { round: true, bands: true, rings: true });
    topiaryShape(c, 0, 0, 0.9, ownPick(c, ['cone', 'ball', 'tiers'], 2));
    for (const [x, z] of [[-0.37, -0.37], [0.37, -0.37], [-0.37, 0.37], [0.37, 0.37]]) bed(c, x, z, 0.12, 0.12, { round: true });
    return;
  }
  // carpet bedding in a pattern, a stone kerb and urns at its corners
  const pattern = ownPick(c, ['star', 'chequer', 'wheel', 'crest'], 4), y = c.gy(0, 0);
  gb.cbox(0, y - 0.02, 0, 0.74, 0.05, 0.74, STONE_L, 0, 0.01);
  carpet(c, 0, 0, 0.68, 0.68, pattern, y + 0.012);
  for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) urn(c, x, z, 0.9);
  gravel(c, 0, 0.42, 0.5, 0.05);
};
PLANT.cottage = (c, L) => {
  const { gb } = c;
  const cols = [ownPick(c, ['#e88fae', '#d9536b', '#f2ede0'], 2), ownPick(c, ['#9c74c9', '#6a8ad9', '#f2d040'], 3), '#f2ede0'];
  // a picket fence across the back, the border in front of it
  frontage(c, -0.42, 0.42, -0.4, [], 'picket');
  for (let i = 0; i < 7; i++) shrub(c, -0.36 + i * 0.12, -0.3 + (i % 2) * 0.05, 0.62, true);
  spikes(c, 0, -0.24, L ? 16 : 13, 0.38, cols);
  blooms(c, 0, -0.14, 18, 0.36, null, null, 0.1);
  if (L === 0) { bush(c, -0.36, 0.3, 0.9); blooms(c, 0.2, 0.25, 8, 0.12); return; }
  // a brick path to a little gate at the street, borders either side
  gb.box(0, c.gy(0, 0.15) - 0.006, 0.15, 0.1, 0.012, 0.6, '#a8644a');
  for (const s of [-1, 1]) { shrub(c, s * 0.3, 0.12, 0.6, true); spikes(c, s * 0.28, 0.16, 8, 0.1, cols); blooms(c, s * 0.18, 0.2, 10, 0.06); }
  arbour(c, 0, 0.36, 0.1, 0.12, Math.PI / 2, { rose: cols[0] });
  if (L === 2) {
    bench(c, -0.3, -0.06, 0);
    birdbath(c, 0.28, 0.0);
    beehive(c, 0.38, -0.12);
    lamp(c, 0.38, 0.4, 0.26);
  }
};
PLANT.bulbs = (c, L) => {
  const { gb } = c;
  const q = seasonAt(c, 0.5);
  if (L === 0) {
    // a drift of daffodils and crocuses under a little tree
    parkTree(c, ownPick(c, [-0.24, 0.24], 2), -0.22, 0.9, ownPick(c, ['cherry', 'birch'], 3));
    const pal = q === 0 ? ['#f2d040', '#f2ede0', '#9c74c9', '#e8e070'] : null;
    for (let i = 0; i < 4; i++) blooms(c, -0.25 + i * 0.17, 0.12 + (i % 2) * 0.12, 9, 0.08, pal);
    return;
  }
  // tulips in blocks of colour (lilies and alliums once they are over)
  const T = ['#d9363a', '#f2d040', '#e88fae', '#f2ede0', '#7a3a8a', '#e8823f'];
  const rows = L === 2 ? [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]] : [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
  rows.forEach(([x, z], i) => {
    const pal = q === 0 ? [T[(i + (c.variant & 3)) % T.length]] : q === 1 ? [i % 2 ? '#f2ede0' : '#e8823f', '#9c74c9'] : null;
    bed(c, x, z, L === 2 ? 0.26 : 0.3, L === 2 ? 0.26 : 0.3, { edge: L === 2 ? 'stone' : 'box', pal });
  });
  if (L === 1) { gravel(c, 0, 0, 0.08, 0.8); gravel(c, 0, 0, 0.8, 0.08); urn(c, 0, 0, 0.9); return; }
  // the bulb garden: the beds round a little fountain, lamps at the corners
  fountain(c, 0, 0, 0.1, 'tiers');
  for (const [x, z] of [[-0.42, 0.42], [0.42, -0.42]]) lamp(c, x, z, 0.28);
  gravel(c, 0, 0.42, 0.12, 0.06);
};
PLANT.planters = (c, L) => {
  const { gb } = c;
  // along the street side: troughs and tubs, a lawn and a shrub behind
  const tc = ownPick(c, ['#6b4a2f', '#4f6a7a', '#5e7a5a', '#8a4a3a'], 2);
  if (L >= 2) gb.box(0, c.gy(0, 0.34) - 0.006, 0.34, 0.86, 0.012, 0.18, '#b8b0a2');
  trough(c, -0.24, 0.36, 0.3, 0, tc); trough(c, 0.24, 0.36, 0.3, 0, tc);
  if (L === 0) { trough(c, 0, -0.1, 0.24, 0.6, tc); shrub(c, -0.3, -0.3, 0.9); tubPlant(c, 0.3, -0.2, false); return; }
  for (const x of [-0.36, 0.36]) basketPost(c, x, 0.3);
  bench(c, 0, 0.26, Math.PI);
  if (L === 1) { trough(c, -0.3, 0, 0.24, Math.PI / 2, tc); trough(c, 0.3, 0, 0.24, Math.PI / 2, tc); shrub(c, 0, -0.3, 1); return; }
  // stone urns of clipped bays, and planters down the sides
  for (const x of [-0.12, 0.12]) standard(c, x, 0.42, 0.9);
  for (const z of [-0.3, 0.0]) for (const s of [-1, 1]) trough(c, s * 0.36, z, 0.22, Math.PI / 2, STONE_L);
  bed(c, 0, -0.2, 0.4, 0.26, { edge: 'stone', bands: true });
};
PLANT.wild = (c, L) => {
  const { gb } = c;
  meadow(c, 0, 0, 0.76, 0.76, L ? 110 : 80);
  if (L === 0) { shrub(c, ownPick(c, [-0.34, 0.34], 2), -0.34, 0.9, false); return; }
  // a path mown through it, a seat, hives
  const p = curve([ownPick(c, [-0.2, 0.2], 3), 0.39], [ownPick(c, [-0.2, 0.2], 4), -0.37], ownPick(c, [-0.15, 0.15], 5));
  walk(c, p, 0.08, '#7aa04a');
  const bs = p[4][0] > 0 ? -1 : 1;
  bench(c, p[4][0] + bs * 0.12, p[4][1], bs > 0 ? -Math.PI / 2 : Math.PI / 2);
  beehive(c, -0.36, -0.36); beehive(c, -0.3, -0.38);
  spot(c, p[3][0], p[3][1]); spot(c, p[6][0], p[6][1]);
  if (L === 2) {
    // an old tree, a log pile for the beetles and a bird box on a post
    parkTree(c, 0.3, -0.3, 1.1, ownPick(c, ['round', 'birch', 'lime'], 6));
    logs(c, 0.2, 0.3, 2, 0.6);
    const y = c.gy(-0.36, 0.2);
    gb.box(-0.36, y, 0.2, 0.01, 0.18, 0.01, BARK);
    gb.cbox(-0.36, y + 0.16, 0.2, 0.04, 0.05, 0.04, '#86663f', 0, 0.004);
    gb.wedge(-0.36, y + 0.21, 0.2, 0.05, 0.05, 0.015, '#5e432c', 0);
  }
};
PLANT.rockery = (c, L) => {
  const { gb } = c;
  const r = L === 0 ? 0.27 : 0.33, h = L === 0 ? 0.12 : 0.15, y = c.gy(0, -0.04);
  // a low mound of earth, stones bedded in it, alpines between
  gb.sphere(0, y - h * 0.6, -0.04, r, '#6f7a4a', 1, (h * 1.4) / r);
  stones(c, 0, -0.04, r * 0.9, L === 0 ? 9 : 15, h);
  alpines(c, 0, -0.04, y + h * 0.3, L === 0 ? 10 : 16, r * 0.8);
  if (L === 0) { bush(c, 0.36, 0.34, 0.8); return; }
  // dwarf conifers, and stepping stones up to the top
  for (const [x, z] of [[-0.18, -0.22], [0.2, -0.16], [-0.06, 0.12]]) parkTree(c, x, z, 0.55, ownPick(c, ['yew', 'pine'], Math.round(x * 10)));
  for (let i = 0; i < 4; i++) gb.cyl(0.24 - i * 0.07, c.gy(0.24 - i * 0.07, 0.36 - i * 0.08) - 0.004, 0.36 - i * 0.08, 0.026, 0.028, 0.01, 7, '#b4ac9c');
  if (L === 2) {
    // a little cascade down into a pool at its foot
    const ly = water(c, [[-0.24, 0.26, 0.12], [-0.14, 0.32, 0.08]], {});
    gb.boxC(-0.2, (ly + y + h) / 2, 0.08, 0.04, Math.max(0.02, y + h - ly), 0.02, frozen(c) ? ICE : '#6aa8c8', 0.5);
    if (!frozen(c)) c.fountain = [-0.22, ly + 0.03, 0.2];
    reeds(c, -0.32, 0.32, ly, 4); lilies(c, -0.22, 0.28, ly, 2, 0.05);
    lamp(c, 0.38, 0.4, 0.26);
  }
};
PLANT.topiary = (c, L) => {
  const shapes = ['cone', 'ball', 'tiers', 'spiral'], r = ownRng(c, 2);
  if (L === 0) {
    for (const [x, z] of [[-0.24, -0.1], [0.04, -0.2], [0.26, 0.04]]) topiaryShape(c, x, z, r.float(1.1, 1.5), shapes[r.int(0, 2)]);
    bush(c, -0.32, 0.32, 0.8);
    return;
  }
  // a gravel square in a low box hedge, clipped shapes round it
  gravel(c, 0, 0.04, 0.5, 0.5);
  hedgeRound(c, -0.3, -0.26, 0.3, 0.34, 0, 0.12, 0.035);
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.4], [0.36, 0.4]]) topiaryShape(c, x, z, 1.3, L === 2 ? 'spiral' : shapes[r.int(0, 3)]);
  if (L === 1) { for (const x of [-0.12, 0.12]) topiaryShape(c, x, -0.08, 1.1, 'ball'); return; }
  // the peacock in the middle, tiers either side, a clipped yew arch at the gate
  topiaryShape(c, 0, 0.02, 1.8, 'peacock');
  for (const x of [-0.2, 0.2]) topiaryShape(c, x, -0.14, 1.2, 'tiers');
  const y = c.gy(0, 0.38);
  for (const s of [-1, 1]) c.gb.cbox(s * 0.08, y - 0.01, 0.38, 0.05, 0.16, 0.05, hedgeCol(c), 0, 0.012);
  c.gb.cbox(0, y + 0.14, 0.38, 0.21, 0.05, 0.05, hedgeCol(c), 0, 0.012);
  bench(c, 0, -0.26, 0);
};
PLANT.roses = (c, L) => {
  const pal = [ownPick(c, ROSES, 2), ownPick(c, ROSES, 3)];
  if (L === 0) {
    gravel(c, 0, 0.1, 0.1, 0.6);
    arbour(c, 0, 0.14, 0.1, 0.13, Math.PI / 2, { rose: pal[0] });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) roseBush(c, s * 0.18, -0.12 + i * 0.16, 0.85, pal[(i + (s > 0 ? 1 : 0)) % 2]);
    return;
  }
  if (L === 1) {
    // a walk of arches, standard roses beside it
    gravel(c, 0, 0, 0.1, 0.84);
    arbour(c, 0, 0.02, 0.6, 0.13, Math.PI / 2, { rose: pal[0] });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const z = -0.3 + i * 0.3; standard(c, s * 0.26, z, 0.8, '#8a6a48'); roseBush(c, s * 0.38, z + 0.12, 0.8, pal[1]); }
    return;
  }
  // a rose pergola round a seat, rose beds in the corners, lamps
  const post = ownPick(c, ['#ece6da', '#2f4a3a', '#86663f'], 4);
  arbour(c, 0, -0.2, 0.5, 0.12, 0, { rose: pal[0], post }); arbour(c, -0.22, 0.04, 0.4, 0.12, Math.PI / 2, { rose: pal[1], post }); arbour(c, 0.22, 0.04, 0.4, 0.12, Math.PI / 2, { rose: pal[1], post });
  bench(c, 0, -0.08, 0);
  sundial(c, 0, 0.12);
  for (const [x, z] of [[-0.38, 0.36], [0.38, 0.36], [-0.38, -0.38], [0.38, -0.38]]) roseBush(c, x, z, 0.9, pal[0]);
  for (const x of [-0.12, 0.12]) lamp(c, x, 0.42, 0.26);
};
PLANT.knot = (c, L) => {
  const HERBS = ['#7a9a6a', '#9aa890', '#5f8a4a', '#8a7aa0'];
  const q = seasonAt(c, 0.5);
  const herb = (x, z, i) => { const y = c.gy(x, z); c.gb.sphere(x, y + 0.02, z, 0.024, q === 3 ? '#6a7466' : HERBS[i % 4], 0, 0.7); if (q === 1 && i % 3 === 0) c.gb.sphere(x, y + 0.035, z, 0.01, '#8a6ac0'); };
  // a knot: a square of box with its diagonals and a ring woven through
  const knot = (x, z, s) => {
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1], [-1, -1, 1, 1], [1, -1, -1, 1]]) hedgeLine(c, x + ax * s, z + az * s, x + bx * s, z + bz * s, 0.035);
    hedgeRing(c, x, z, s * 0.62, 0.035, 14);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; herb(x + Math.cos(a) * s * 0.4, z + Math.sin(a) * s * 0.4, i); herb(x + Math.cos(a + Math.PI / 4) * s * 0.82, z + Math.sin(a + Math.PI / 4) * s * 0.82, i + 1); }
  };
  if (L < 2) {
    gravel(c, 0, 0, 0.86, 0.86, GRAVEL_D);
    knot(0, 0, L ? 0.36 : 0.28);
    if (L === 1) sundial(c, 0, 0); else herb(0, 0, 2);
    if (L === 0) for (const [x, z] of [[-0.4, 0.4], [0.4, -0.4]]) bush(c, x, z, 0.7);
    return;
  }
  // four knots round a sundial, clipped bays at the corners
  gravel(c, 0, 0, 0.88, 0.88, GRAVEL_D);
  for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) knot(x, z, 0.16);
  sundial(c, 0, 0);
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) standard(c, x, z, 0.8);
};
PLANT.tree = (c, L) => {
  const { gb } = c;
  const kind = ownPick(c, ['cherry', 'cherry', 'copper', 'birch', 'lime'], 2), stone = ownPick(c, [STONE_L, '#b8a890', '#9a5640'], 3);
  const y = c.gy(0, -0.02);
  const r = L === 0 ? 0.2 : L === 1 ? 0.27 : 0.3, sides = L === 1 ? 4 : 8, top = Math.min(0, y) + 0.1;
  gb.cyl(0, Math.min(0, y) - 0.02, -0.02, r, r + 0.01, top - Math.min(0, y) + 0.02, sides, stone, Math.PI / sides);
  gb.cyl(0, top, -0.02, r - 0.025, r - 0.025, 0.012, sides, SOIL, Math.PI / sides);
  parkTree(c, 0, -0.02, L === 0 ? 1.05 : L === 1 ? 1.25 : 1.4, kind);
  // bulbs or bedding round the trunk
  blooms(c, 0, -0.02, L ? 12 : 8, r * 0.6, seasonAt(c, 0.5) === 0 ? ['#f2d040', '#f2ede0', '#9c74c9'] : null, top + 0.01);
  if (L === 0) { bench(c, 0, 0.34, Math.PI); return; }
  // a seat round the bed (the stone ledge), and lamps at the second level
  for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2 + Math.PI / sides; gb.boxC(Math.cos(a) * (r + 0.03), top - 0.03, -0.02 + Math.sin(a) * (r + 0.03), 0.06, 0.012, r * 0.9, '#7a5636', 0, -a); }
  if (L === 2) {
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) lamp(c, x, z, 0.3);
    for (const [x, z] of [[0, 0.42], [0, -0.44], [-0.42, 0], [0.42, 0]]) bed(c, x, z, x ? 0.06 : 0.26, x ? 0.26 : 0.06, {});
  }
  spot(c, 0.3, 0.3); spot(c, -0.3, 0.3);
};

// Planting: the kind (b.flavor or its seed), at its level.
M.flowers = (c, L) => {
  const kind = kindOf({ type: 'flowers', flavor: c.flavor, variant: c.variant });
  PLANT[kind](c, Math.min(L, 2));
};

// ============================================================ monuments
// A Monument is one of the kinds in MONUMENTS, at three levels: the work on
// its plinth in a setting of lamps, yews, bushes or flowers; a Civic
// Monument on paving with a kerb and railings, beds and lamps; a Grand
// Monument, a bigger work on steps, floodlit at night. Its stone and its
// bronze, marble or green-bronze by the monument's own seed.

// Floodlights in the grass, lit at night, turned up at the work.
function floodlights(c, r, n = 4) {
  const { gb } = c;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n, x = Math.cos(a) * r, z = Math.sin(a) * r, y = c.gy(x, z);
    gb.box(x, y, z, 0.03, 0.02, 0.03, '#2f2c2a');
    gb.glow(2.4, 2.0, 1.4, 3.0);
    gb.box(x, y + 0.02, z, 0.024, 0.008, 0.024, '#fff2c0');
    gb.noGlow();
    c.addGlow(x * 0.6, y + 0.12, z * 0.6);
  }
}
// The work itself, s: its grandness (0, 1, 2), standing on y = base.
function work(c, kind, s, mat, stone) {
  const { gb } = c;
  const big = 1 + s * 0.22;
  const ped = (w, h, y = 0) => { gb.cbox(0, y, 0, w, h, w, stone, 0, 0.01); gb.cbox(0, y + h, 0, w + 0.03, 0.025, w + 0.03, shade(stone, 0.92), 0, 0.006); return y + h + 0.025; };
  const figure = (y, sc = 1, m = mat, arm = true) => {
    gb.push(0, y, 0, 0, sc);
    gb.box(-0.022, 0, 0, 0.028, 0.11, 0.036, m); gb.box(0.022, 0, 0, 0.028, 0.11, 0.036, m);
    gb.cyl(0, 0.11, 0, 0.036, 0.046, 0.13, 8, m);
    gb.sphere(0, 0.27, 0, 0.032, m, 1);
    if (arm) gb.box(0.046, 0.19, 0, 0.02, 0.12, 0.02, m, 0, 0, -0.5); else gb.box(0.046, 0.12, 0, 0.02, 0.11, 0.02, m, 0, 0, 0.15);
    gb.box(-0.05, 0.13, 0, 0.02, 0.1, 0.02, m, 0, 0, 0.2);
    gb.pop();
  };
  if (kind === 'founder') {
    const top = ped(0.17 * big, 0.22 + s * 0.08, 0.04);
    figure(top, big);
    if (s >= 1) for (const sd of [-1, 1]) gb.box(0, 0.12, sd * 0.087 * big, 0.1, 0.07, 0.006, shade(mat, 1.1));
    if (s === 2) for (const sd of [-1, 1]) { gb.cbox(sd * 0.17, 0.04, 0.12, 0.08, 0.06, 0.08, stone, 0, 0.006); gb.push(sd * 0.17, 0.1, 0.12, 0, 0.6); gb.cyl(0, 0, 0, 0.04, 0.05, 0.08, 8, mat); gb.sphere(0, 0.12, 0, 0.03, mat); gb.pop(); }
  } else if (kind === 'obelisk') {
    const top = ped(0.15 + s * 0.03, 0.06 + s * 0.04, 0.04);
    const h = 0.38 + s * 0.14;
    gb.cyl(0, top, 0, 0.038 + s * 0.006, 0.058 + s * 0.01, h, 4, MARBLE, Math.PI / 4);
    gb.cone(0, top + h, 0, 0.04 + s * 0.006, 0.05, 4, GOLD, Math.PI / 4);
    if (s >= 1) for (const sd of [-1, 1]) gb.box(0, top + 0.03, sd * (0.05 + s * 0.008), 0.05, 0.06, 0.006, BRONZE);
    if (s === 2) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { gb.cbox(x * 0.16, 0.04, z * 0.16, 0.06, 0.05, 0.06, stone, 0, 0.006); gb.blob(x * 0.16, 0.12, z * 0.16, 0.028, 0.03, 0.04, mat); gb.sphere(x * 0.16, 0.15, z * 0.16 + 0.03, 0.018, mat); }
  } else if (kind === 'cross') {
    // steps, a shaft and its head; the grandest stands under a roofed buttercross
    for (let k = 0; k < 3 + s; k++) gb.cyl(0, 0.04 + k * 0.035, 0, 0.17 - k * 0.035, 0.17 - k * 0.035, 0.035, 8, stone, Math.PI / 8);
    const y = 0.04 + (3 + s) * 0.035;
    gb.cyl(0, y, 0, 0.018, 0.026, 0.26 + s * 0.06, 8, STONE_W);
    gb.box(0, y + 0.24 + s * 0.06, 0, 0.08, 0.02, 0.02, STONE_W); gb.box(0, y + 0.21 + s * 0.06, 0, 0.02, 0.09, 0.02, STONE_W);
    if (s === 2) {
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; gb.cyl(Math.cos(a) * 0.17, 0.04, Math.sin(a) * 0.17, 0.014, 0.018, 0.36, 6, stone); }
      gb.cyl(0, 0.4, 0, 0.21, 0.21, 0.025, 6, shade(stone, 0.9));
      gb.cone(0, 0.425, 0, 0.22, 0.14, 6, '#5a5f63');
      gb.sphere(0, 0.57, 0, 0.018, GOLD);
    } else if (s === 1) gb.sphere(0, y + 0.31, 0, 0.02, GOLD);
  } else if (kind === 'memorial') {
    for (let k = 0; k < 2 + s; k++) gb.cbox(0, 0.04 + k * 0.03, 0, 0.26 - k * 0.05, 0.03, 0.2 - k * 0.04, stone, 0, 0.006);
    const y = 0.04 + (2 + s) * 0.03;
    if (s === 0) { gb.box(0, y, 0, 0.04, 0.3, 0.04, STONE_W); gb.box(0, y + 0.21, 0, 0.14, 0.035, 0.04, STONE_W); }
    else {
      // a cenotaph, the names cut round it; a soldier on the top of the grandest
      gb.cbox(0, y, 0, 0.12, 0.3 + s * 0.06, 0.08, STONE_W, 0, 0.006);
      for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) gb.box(0, y + 0.06 + k * 0.035, sd * 0.041, 0.07, 0.006, 0.003, '#7a7468');
      if (s === 2) figure(y + 0.42, 0.7, mat, false);
      for (const sd of [-1, 1]) { gb.box(sd * 0.2, 0.04, -0.12, 0.008, 0.42, 0.008, '#ece6da'); gb.box(sd * 0.2 + 0.03, 0.4, -0.12, 0.06, 0.04, 0.003, sd > 0 ? '#c8203a' : '#2f3a6a'); }
    }
    // wreaths of poppies at its foot
    for (const sd of [-1, 0, 1]) { const x = sd * 0.07; gb.cyl(x, 0.08, 0.11, 0.026, 0.026, 0.01, 10, '#3f6a32', 0, Math.PI / 2.4); for (let i = 0; i < 4; i++) gb.sphere(x + Math.cos(i * 1.57) * 0.022, 0.08 + Math.sin(i * 1.57) * 0.01, 0.116, 0.008, '#c8203a'); }
  } else if (kind === 'angel') {
    // the grandest stands on a column, a winged victory
    let top;
    if (s === 2) { const t0 = ped(0.17, 0.12, 0.04); gb.cyl(0, t0, 0, 0.03, 0.036, 0.26, 10, MARBLE); gb.cbox(0, t0 + 0.26, 0, 0.07, 0.02, 0.07, MARBLE, 0, 0.004); top = t0 + 0.28; }
    else top = ped(0.16, 0.18 + s * 0.06, 0.04);
    gb.push(0, top, 0, 0, big * 0.9);
    gb.cyl(0, 0, 0, 0.026, 0.045, 0.16, 8, MARBLE);
    gb.sphere(0, 0.19, 0, 0.024, MARBLE);
    for (const sd of [-1, 1]) gb.boxC(sd * 0.045, 0.14, -0.018, 0.06, 0.13, 0.01, MARBLE, -0.2, 0, sd * 0.35);
    gb.box(0.026, 0.16, 0.01, 0.01, 0.09, 0.01, s === 2 ? GOLD : MARBLE, 0, 0, -0.3);
    gb.pop();
  } else if (kind === 'urn') {
    const top = ped(0.14, 0.2 + s * 0.04, 0.04);
    gb.cyl(0, top, 0, 0.044, 0.028, 0.03, 10, MARBLE);
    gb.sphere(0, top + 0.08, 0, 0.056, MARBLE, 1, 1.1);
    gb.cyl(0, top + 0.13, 0, 0.032, 0.046, 0.03, 10, MARBLE);
    gb.cone(0, top + 0.16, 0, 0.02, 0.05, 8, MARBLE);
    if (s >= 1) gb.cyl(0, top + 0.06, 0, 0.059, 0.059, 0.012, 12, '#3f6a32');
    if (s === 2) {
      // under a little domed rotunda
      gb.cyl(0, 0.04, 0, 0.21, 0.21, 0.025, 12, stone);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; gb.cyl(Math.cos(a) * 0.18, 0.065, Math.sin(a) * 0.18, 0.013, 0.015, 0.42, 6, '#ece6da'); }
      gb.cyl(0, 0.485, 0, 0.21, 0.21, 0.03, 12, '#ece6da');
      gb.sphere(0, 0.515, 0, 0.19, '#8fa89a', 1, 0.5);
      gb.sphere(0, 0.62, 0, 0.018, GOLD);
    }
  } else if (kind === 'rider') {
    gb.cbox(0, 0.04, 0, 0.13 + s * 0.02, 0.15 + s * 0.06, 0.24 + s * 0.04, stone, 0, 0.01);
    if (s >= 1) for (const sd of [-1, 1]) gb.box(sd * (0.066 + s * 0.01), 0.09, 0, 0.004, 0.06, 0.16, shade(mat, 1.1));
    gb.push(0, 0.2 + s * 0.06, 0, 0, 0.85 + s * 0.12);
    const rear = s === 2 ? -0.35 : 0;
    gb.pushEuler(0, 0.04, 0, rear, 0, 0);
    gb.box(0, 0.035, 0, 0.07, 0.07, 0.17, mat);
    gb.box(0, 0.08, 0.1, 0.045, 0.07, 0.05, mat, 0, -0.5);
    gb.box(0, 0.11, 0.14, 0.04, 0.035, 0.07, mat);
    gb.box(0, 0.05, -0.09, 0.012, 0.05, 0.012, mat, 0, 0.6);
    for (const [lx, lz, a] of [[-0.025, 0.06, -0.5], [0.025, 0.06, s === 2 ? -1.1 : 0], [-0.025, -0.06, 0], [0.025, -0.06, 0.2]]) gb.box(lx, -0.04, lz, 0.018, 0.08, 0.018, mat, 0, a);
    gb.cyl(0, 0.105, -0.01, 0.018, 0.024, 0.08, 6, mat);
    gb.sphere(0, 0.205, -0.01, 0.017, mat);
    gb.box(0.03, 0.13, 0.02, 0.012, 0.07, 0.012, mat, 0, 0, -0.7);
    gb.pop(); gb.pop();
  } else if (kind === 'column') {
    const top = ped(0.15 + s * 0.02, 0.07 + s * 0.02, 0.04), h = 0.32 + s * 0.12;
    gb.cyl(0, top, 0, 0.03 + s * 0.004, 0.034 + s * 0.004, h, 12, MARBLE);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; gb.box(Math.cos(a) * 0.031, top + 0.02, Math.sin(a) * 0.031, 0.004, h - 0.04, 0.004, shade(MARBLE, 0.9)); }
    gb.cbox(0, top + h, 0, 0.08, 0.025, 0.08, MARBLE, 0, 0.004);
    if (s === 0) { gb.cyl(0, top + h + 0.025, 0, 0.024, 0.015, 0.045, 8, mat); gb.sphere(0, top + h + 0.08, 0, 0.022, mat); }
    else figure(top + h + 0.025, 0.55, mat);
    if (s === 2) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { gb.cbox(x * 0.16, 0.04, z * 0.16, 0.07, 0.04, 0.09, stone, 0, 0.006); gb.blob(x * 0.16, 0.1, z * 0.16, 0.026, 0.03, 0.045, mat); gb.sphere(x * 0.16, 0.13, z * 0.16 + 0.035, 0.02, mat); }
  } else if (kind === 'fountain') {
    const r = 0.2 + s * 0.04, ice = frozen(c);
    gb.cyl(0, 0.02, 0, r, r + 0.01, 0.07, 18, stone);
    gb.cyl(0, 0.05, 0, r - 0.02, r - 0.02, 0.036, 18, ice ? ICE : WATER);
    gb.cyl(0, 0.05, 0, 0.05, 0.06, 0.1 + s * 0.06, 8, stone);
    const y = 0.15 + s * 0.06;
    if (s === 2) { gb.cyl(0, y, 0, 0.1, 0.05, 0.03, 12, stone); gb.cyl(0, y + 0.03, 0, 0.09, 0.09, 0.004, 12, ice ? ICE : '#5aa0c4'); }
    figure(y + (s === 2 ? 0.03 : 0), 0.65, mat);
    const n = s === 0 ? 0 : s === 1 ? 3 : 4;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.4; gb.push(Math.cos(a) * (r - 0.06), 0.06, Math.sin(a) * (r - 0.06), -a); gb.blob(0, 0.03, 0, 0.026, 0.03, 0.04, mat); gb.sphere(0, 0.07, 0.02, 0.016, mat); gb.pop(); }
    if (!ice) c.fountain = [0, y + 0.22, 0];
  } else if (kind === 'clock') {
    if (s === 0) {
      // a street clock on an iron pillar, its faces lit
      gb.cyl(0, 0.03, 0, 0.022, 0.03, 0.34, 8, IRON_G);
      gb.cbox(0, 0.36, 0, 0.09, 0.09, 0.09, IRON_G, 0, 0.006);
      gb.glow(2.0, 1.8, 1.3, 3.0);
      for (const [x, z, ry] of [[0, 0.047, 0], [0, -0.047, 0], [0.047, 0, Math.PI / 2], [-0.047, 0, Math.PI / 2]]) gb.cyl(x, 0.405, z, 0.034, 0.034, 0.006, 12, '#f8f0d8', ry, Math.PI / 2);
      gb.noGlow();
      gb.cone(0, 0.45, 0, 0.06, 0.06, 8, IRON_G);
      c.addGlow(0, 0.4, 0);
    } else {
      // a tower of stone with four faces, lit at night, a spire on the grandest
      const w = 0.16 + s * 0.03, h = 0.42 + s * 0.22;
      plinth(c, 0, 0, w + 0.04, w + 0.04);
      gb.cbox(0, 0, 0, w + 0.04, 0.06, w + 0.04, shade(stone, 0.9), 0, 0.008);
      gb.cbox(0, 0.06, 0, w, h, w, stone, 0, 0.01);
      gb.box(0, 0.06, w / 2 + 0.002, 0.05, 0.11, 0.008, '#4e3828');
      // corner pilasters and a string course; on the grandest, louvred belfry openings below the faces
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.box(px * (w / 2 - 0.008), 0.06, pz * (w / 2 - 0.008), 0.022, h, 0.022, shade(stone, 1.08));
      gb.box(0, 0.06 + h * 0.55, 0, w + 0.016, 0.02, w + 0.016, shade(stone, 0.9));
      if (s === 2) for (const [x, z, ry] of [[0, w / 2 + 0.003, 0], [0, -w / 2 - 0.003, 0], [w / 2 + 0.003, 0, Math.PI / 2], [-w / 2 - 0.003, 0, Math.PI / 2]]) { gb.box(x, 0.06 + h * 0.6, z, 0.06, 0.1, 0.006, '#3a3430', ry); for (let k = 0; k < 3; k++) gb.box(x, 0.06 + h * 0.6 + 0.02 + k * 0.03, z, 0.064, 0.006, 0.01, shade(stone, 0.95), ry); }
      gb.glow(2.0, 1.8, 1.3, 3.0);
      const fy = 0.06 + h - 0.08;
      for (const [x, z, ry] of [[0, w / 2 + 0.004, 0], [0, -w / 2 - 0.004, 0], [w / 2 + 0.004, 0, Math.PI / 2], [-w / 2 - 0.004, 0, Math.PI / 2]]) gb.cyl(x, fy, z, w * 0.34, w * 0.34, 0.006, 14, '#f8f0d8', ry, Math.PI / 2);
      gb.noGlow();
      gb.box(0, fy - 0.004, w / 2 + 0.008, 0.006, w * 0.26, 0.004, IRON); gb.boxC(w * 0.08, fy, w / 2 + 0.009, w * 0.2, 0.006, 0.004, IRON);
      gb.cbox(0, 0.06 + h, 0, w + 0.03, 0.03, w + 0.03, shade(stone, 0.9), 0, 0.006);
      if (s === 2) { gb.roof(0, 0.09 + h, 0, w + 0.02, w + 0.02, 0.24, 0, '#5a5f63'); gb.sphere(0, 0.34 + h, 0, 0.016, GOLD); }
      else gb.roof(0, 0.09 + h, 0, w + 0.02, w + 0.02, 0.1, 0, '#5a5f63');
      c.addGlow(0, fy, w / 2 + 0.05);
    }
  } else if (kind === 'arch') {
    // a gateway arch; then a triumphal arch; then one with three openings and a chariot on the top
    const w = s === 0 ? 0.36 : s === 1 ? 0.5 : 0.7, d = 0.14 + s * 0.04, h = 0.34 + s * 0.12, open = s === 0 ? 0.12 : 0.16;
    plinth(c, 0, 0, w + 0.04, d + 0.04);
    for (const sd of [-1, 1]) gb.cbox(sd * (w / 2 - (w - open) / 4), 0, 0, (w - open) / 2, h, d, stone, 0, 0.008);
    if (s === 2) for (const sd of [-1, 1]) gb.cbox(sd * w * 0.29, 0, 0, 0.06, h * 0.55, d + 0.004, shade(stone, 0.85), 0, 0.004);
    gb.cbox(0, h, 0, w, 0.1 + s * 0.03, d, stone, 0, 0.008);
    gb.arch(0, h - open / 2 - 0.004, -d / 2 - 0.001, open / 2, d + 0.002, 10, shade(stone, 0.78));
    for (const sd of [-1, 1]) for (const fz of [-1, 1]) gb.cyl(sd * (open / 2 + 0.04), 0, fz * (d / 2 + 0.012), 0.014, 0.016, h, 8, MARBLE);
    gb.box(0, h + 0.03, d / 2 + 0.004, w * 0.6, 0.04, 0.004, shade(mat, 1.1));
    if (s === 2) {
      // the chariot and its horses
      gb.push(0, h + 0.13 + s * 0.03, 0, 0, 0.7);
      gb.box(0, 0, -0.04, 0.12, 0.06, 0.06, mat);
      for (const sd of [-1, 1]) gb.cyl(sd * 0.065, 0.03, -0.04, 0.03, 0.03, 0.01, 8, mat, 0, 0, Math.PI / 2);
      for (const sx of [-0.06, 0.06]) { gb.box(sx, 0.03, 0.08, 0.04, 0.05, 0.12, mat); gb.box(sx, 0.07, 0.15, 0.03, 0.06, 0.03, mat, 0, -0.5); }
      figure(0.04, 0.6, mat);
      gb.pop();
    }
  }
}

// The setting, by level: grass and its own choice of lamps, yews, bushes or
// flowers; then paving with a kerb, railings and beds; then steps, railings
// with gilded tips and floodlights.
M.statue = (c, L) => {
  const { gb } = c;
  const kind = kindOf({ type: 'statue', flavor: c.flavor, variant: c.variant });
  const mat = ownPick(c, [BRONZE, BRONZE, VERDI, MARBLE], 2), stone = ownPick(c, [STONE_L, '#c8bca4', '#a8a090', '#b4ac9c'], 3);
  const s = Math.min(L, 2), y = c.gy(0, 0);
  plinth(c, 0, 0, 0.36, 0.36);
  if (L >= 1) {
    // paving under it and a kerb round
    gb.cbox(0, Math.min(0, y) - 0.02, 0, 0.62, 0.04 - Math.min(0, y), 0.62, '#b8b0a2', 0, 0.008);
    if (L === 2) for (let k = 0; k < 2; k++) gb.cbox(0, 0.02 + k * 0.022, 0, 0.42 - k * 0.1, 0.022, 0.42 - k * 0.1, stone, 0, 0.006);
  }
  gb.push(0, L === 2 ? 0.064 : L === 1 ? 0.02 : 0, 0);
  gb.cbox(0, L ? -0.02 : Math.min(0, y) - 0.02, 0, 0.26, L ? 0.06 : 0.06 - Math.min(0, y), 0.26, STONE, 0, 0.01);
  work(c, kind, s, mat, stone);
  gb.pop();
  const set = ownPick(c, ['lamps', 'yews', 'bushes', 'flowers'], 4);
  if (L === 0) {
    if (set === 'lamps') { lamp(c, 0.36, 0.36, 0.3); lamp(c, -0.36, -0.36, 0.3); bush(c, -0.38, 0.38, 1.1); bush(c, 0.38, -0.38, 1.1); }
    else if (set === 'yews') for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) topiaryShape(c, x, z, 1.4, 'cone');
    else if (set === 'bushes') { for (const [x, z] of [[-0.34, -0.3], [0.36, -0.28]]) shrub(c, x, z, 1); lamp(c, 0.36, 0.38, 0.3); }
    else { for (const [x, z] of [[0, -0.34], [-0.34, 0], [0.34, 0]]) bed(c, x, z, x ? 0.1 : 0.4, x ? 0.4 : 0.1, { bands: true }); lamp(c, -0.38, 0.38, 0.3); }
    bench(c, ownPick(c, [-0.3, 0.3], 5), 0.42, Math.PI);
  } else {
    // railings round the paving (gilded tips at the grand level), beds and lamps
    const R = L === 2 ? 0.33 : 0.28;
    railings(c, -R, -R, R, R, 0, L === 2 ? '#2f2f33' : IRON_G);
    if (L === 2) for (const [x, z] of [[-R, -R], [R, -R], [-R, R], [R, R]]) gb.sphere(x, c.gy(x, z) + 0.075, z, 0.012, GOLD);
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42]]) set === 'yews' ? topiaryShape(c, x, z, 1.1, 'cone') : bed(c, x, z, 0.1, 0.1, { round: true });
    for (const [x, z] of [[-0.4, 0.4], [0.4, 0.4]]) lamp(c, x, z, L === 2 ? 0.34 : 0.3);
    if (L === 2) floodlights(c, 0.24);
    bench(c, 0, 0.41, Math.PI);
  }
  spot(c, 0.2, 0.36); spot(c, -0.2, 0.36);
};
