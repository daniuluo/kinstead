// The seat of government and the civic buildings round it: the town hall in
// each of its styles (SEAT_STYLES: what crowns it and how its front is
// dressed), the Capitol and the Parliament it grows into across 3×3 and 4×4
// grounds, and the law courts, museum and opera house of a civic quarter.
// A seat with no style chosen has a clock tower, and a dome from the Civic
// Palace up (seatStyle), as the town hall always had.
//
// Local frame as in buildings.js: origin at the middle of the plot, y = 0 at
// the floor, +z towards the street. Grounds follow the seasons (the world
// view redraws the seat as the season turns); lamps, clock faces and
// floodlit fronts light up at night.

import { seatStyle } from '../defs.js';
import { shade } from './geo.js';
import { house, footing, lamp, bench, bush, win, door, gatePiers, stainedGlass, roseWindow, ownPick, coach } from './buildings.js';
import { planOf, tower } from './forms.js';
import { parkTree, bed, blooms, fountain, monument, plinth, topiaryShape, turf } from './parks.js';

export const CIVIC_MODELS = {};
const C = CIVIC_MODELS;

const STONE = '#8f877a', STONE_D = '#756e63', STONE_L = '#b8b0a2', TRIM = '#e9e2d4', MARBLE = '#e6e1d6', ASHLAR = '#e3dccb';
const GOLD = '#c9a640', COPPER = '#5f8f7e', LEAD = '#6f787c', BRONZE = '#6f6250', IRON = '#2f2c2a', GLASS = '#2f3a44';
const PAVING = '#c9c1b0', PAVING_D = '#b5ad9c', LAWN = '#7fae4f';
const WARM = [1.7, 1.2, 0.55];
const FLAGS = ['#a8473a', '#3f6a8f', '#2f6a4a', '#c9a640', '#5a3a6a', '#e8e0d0'];

// The style a seat is drawn in (its b.flavor, or the clock tower / dome).
const styleOf = (c, type, L) => seatStyle({ type, level: L, flavor: c.flavor });

// ------------------------------------------------------------ the pieces

// Four lit clock faces round a square shaft (half: half its width) at y.
function clockFaces(c, x, y, z, half, r) {
  const { gb } = c;
  for (const [fx, fz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
    const px = x + fx * half, pz = z + fz * half;
    gb.cyl(px, y, pz, r + 0.012, r + 0.012, 0.01, 14, STONE_D, ry, Math.PI / 2);
    gb.glow(1.25, 1.15, 0.8, 3.0);
    gb.cyl(px + fx * 0.004, y, pz + fz * 0.004, r, r, 0.012, 14, '#efe8da', ry, Math.PI / 2);
    gb.noGlow();
    // the hands, at ten past ten
    const hx = px + fx * 0.017, hz = pz + fz * 0.017, side = fx !== 0;
    gb.boxC(hx, y + r * 0.3, hz, side ? 0.004 : r * 0.08, r * 0.62, side ? r * 0.08 : 0.004, IRON, side ? 0.5 : 0, 0, side ? 0 : 0.5);
    gb.boxC(hx, y + r * 0.18, hz, side ? 0.004 : r * 0.08, r * 0.42, side ? r * 0.08 : 0.004, IRON, side ? -0.6 : 0, 0, side ? 0 : -0.6);
  }
}

// A clock tower from y0 to top (w square) with four lit faces near the top,
// crowned as the seat grows grander (g): a pyramid roof (0–1), a gilded
// cupola (2), a belfry and slated spire (3), and from 4 an open belfry on
// columns with urns at its corners, a copper cupola and a lantern.
function clockTower(c, x, y0, z, w, top, g, wall, roof) {
  const { gb } = c, k = w / 0.3;
  gb.cbox(x, y0, z, w, top - y0, w, wall, 0, 0.016);
  if (g >= 4) for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(x + sx * (w / 2 - 0.011 * k), y0, z + sz * (w / 2 - 0.011 * k), 0.028 * k, top - y0, 0.028 * k, shade(wall, 1.1));
  gb.cbox(x, top, z, w + 0.05 * k, 0.035 * k, w + 0.05 * k, STONE, 0, 0.01);
  clockFaces(c, x, top - 0.17 * k, z, w / 2, 0.08 * k);
  const t = top + 0.035 * k;
  if (g >= 4) {
    const bw = w * 0.8, bh = 0.22 * k;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl(x + (sx * bw) / 2, t, z + (sz * bw) / 2, 0.016 * k, 0.019 * k, bh, 8, TRIM);
    gb.cbox(x, t, z, bw * 0.56, bh * 0.92, bw * 0.56, shade(wall, 0.5), 0, 0.006);
    gb.cyl(x, t + bh * 0.3, z, 0.035 * k, 0.05 * k, 0.07 * k, 8, BRONZE);
    gb.cbox(x, t + bh, z, bw + 0.05 * k, 0.03 * k, bw + 0.05 * k, TRIM, 0, 0.006);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      gb.cyl(x + (sx * bw) / 2, t + bh + 0.03 * k, z + (sz * bw) / 2, 0.012 * k, 0.018 * k, 0.03 * k, 8, STONE_L);
      gb.sphere(x + (sx * bw) / 2, t + bh + 0.075 * k, z + (sz * bw) / 2, 0.02 * k, STONE_L, 0);
    }
    const d = t + bh + 0.03 * k;
    gb.cyl(x, d, z, bw * 0.34, bw * 0.38, 0.08 * k, 10, wall);
    gb.sphere(x, d + 0.08 * k, z, bw * 0.36, COPPER, 1, 0.95);
    gb.cyl(x, d + 0.08 * k + bw * 0.32, z, 0.024 * k, 0.03 * k, 0.07 * k, 8, TRIM);
    gb.cone(x, d + 0.15 * k + bw * 0.32, z, 0.034 * k, 0.07 * k, 8, COPPER);
    gb.sphere(x, d + 0.23 * k + bw * 0.32, z, 0.018 * k, GOLD, 0);
  } else if (g >= 3) {
    gb.cbox(x, t, z, 0.24 * k, 0.12 * k, 0.24 * k, wall, 0, 0.01);
    gb.cone(x, t + 0.12 * k, z, 0.19 * k, 0.42 * k, 4, roof, Math.PI / 4);
    gb.box(x, t + 0.535 * k, z, 0.012 * k, 0.12 * k, 0.012 * k, GOLD);
  } else if (g >= 2) {
    gb.cyl(x, t, z, 0.16 * k, 0.16 * k, 0.065 * k, 12, wall);
    gb.sphere(x, t + 0.065 * k, z, 0.16 * k, '#b8963a', 1, 0.9);
    gb.box(x, t + 0.205 * k, z, 0.013 * k, 0.13 * k, 0.013 * k, '#b8963a');
  } else gb.roof(x, t, z, 0.35 * k, 0.35 * k, 0.36 * k, 0, roof);
}

// A Gothic tower from y0 to top (w square): buttresses stepping in up its
// corners, tall louvred openings near the top, lit clock faces under them
// (from grade 2), a pinnacle at each corner of the parapet and a slated
// spire, little gables round its foot from grade 3, a gilded figure on the
// tip from 4.
function gothicTower(c, x, y0, z, w, top, g, wall, roof) {
  const { gb } = c, k = w / 0.3, dark = shade(wall, 0.8), H = top - y0;
  gb.cbox(x, y0, z, w, H, w, wall, 0, 0.014);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = x + (sx * w) / 2, bz = z + (sz * w) / 2;
    gb.box(bx, y0, bz, 0.04 * k, H * 0.62, 0.04 * k, dark);
    gb.box(bx, y0 + H * 0.62, bz, 0.03 * k, H * 0.36, 0.03 * k, dark);
  }
  const lh = 0.17 * k, ly = top - lh - 0.05 * k;
  for (const s of [-1, 1]) for (const u of [-0.055, 0.055]) {
    gb.box(x + u * k, ly, z + (s * w) / 2 + s * 0.004, 0.038 * k, lh, 0.012, IRON);
    gb.arch(x + u * k, ly + lh, z + (s > 0 ? w / 2 - 0.004 : -w / 2 - 0.008), 0.019 * k, 0.012, 6, IRON);
    gb.box(x + (s * w) / 2 + s * 0.004, ly, z + u * k, 0.012, lh + 0.012 * k, 0.038 * k, IRON);
  }
  if (g >= 2) clockFaces(c, x, ly - 0.1 * k, z, w / 2, 0.065 * k);
  gb.cbox(x, top, z, w + 0.03 * k, 0.03 * k, w + 0.03 * k, STONE, 0, 0.008);
  const ph = (0.16 + 0.02 * g) * k;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    gb.cbox(x + (sx * w) / 2, top + 0.03 * k, z + (sz * w) / 2, 0.04 * k, 0.05 * k, 0.04 * k, wall, 0, 0.004);
    gb.cone(x + (sx * w) / 2, top + 0.08 * k, z + (sz * w) / 2, 0.026 * k, ph, 4, roof, Math.PI / 4);
  }
  const s0 = top + 0.03 * k, sh = (0.5 + 0.07 * g) * k * Math.min(1.25, 0.8 + H / 2.5);
  if (g >= 3) for (const along of [false, true]) gb.gable(x, s0, z, along ? w * 0.5 : w * 0.96, along ? w * 0.96 : w * 0.5, 0.12 * k, wall, roof, 0.01, along, 0.02);
  gb.cone(x, s0, z, w * 0.42, sh, 8, roof, Math.PI / 8);
  if (g >= 4) {
    gb.cyl(x, s0 + sh - 0.01, z, 0.01 * k, 0.014 * k, 0.05 * k, 6, GOLD);
    gb.sphere(x, s0 + sh + 0.06 * k, z, 0.014 * k, GOLD, 0);
    gb.box(x + 0.012 * k, s0 + sh + 0.02 * k, z, 0.006 * k, 0.06 * k, 0.006 * k, GOLD, 0, 0, -0.5);
  } else gb.box(x, s0 + sh - 0.02, z, 0.01 * k, 0.09 * k, 0.01 * k, GOLD);
}

// A slender spirelet astride a roof ridge at y: a little open stage on
// posts and a tall leaded spire.
function fleche(c, x, y, z, k = 1) {
  const { gb } = c;
  gb.cbox(x, y - 0.06 * k, z, 0.09 * k, 0.1 * k, 0.09 * k, LEAD, 0, 0.006);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(x + sx * 0.032 * k, y + 0.04 * k, z + sz * 0.032 * k, 0.012 * k, 0.08 * k, 0.012 * k, LEAD);
  gb.cyl(x, y + 0.05 * k, z, 0.02 * k, 0.02 * k, 0.05 * k, 6, '#c9b06a');
  gb.cone(x, y + 0.12 * k, z, 0.055 * k, 0.32 * k, 8, LEAD, Math.PI / 8);
  gb.box(x, y + 0.43 * k, z, 0.008 * k, 0.07 * k, 0.008 * k, GOLD);
}

// A little cupola astride a roof ridge at y: a square base over the ridge,
// an eight-sided drum open on every side and a dome (lead, or copper for a
// bigger one) with a gilded finial.
function cupola(c, x, y, z, r, color, wall) {
  const { gb } = c;
  gb.cbox(x, y - 0.07, z, r * 2.3, 0.1, r * 2.3, wall, 0, 0.008);
  gb.cyl(x, y + 0.03, z, r, r * 1.04, r * 1.2, 8, wall);
  for (let i = 0; i < 8; i += 2) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; gb.box(x + Math.sin(a) * r * 0.97, y + 0.03 + r * 0.25, z + Math.cos(a) * r * 0.97, r * 0.42, r * 0.66, 0.01, IRON, a); }
  gb.cyl(x, y + 0.03 + r * 1.2, z, r * 1.12, r * 1.12, 0.014, 8, STONE_L);
  gb.sphere(x, y + 0.045 + r * 1.2, z, r * 1.02, color, 1, 0.92);
  gb.box(x, y + 0.03 + r * 2.1, z, 0.01, r * 0.9, 0.01, GOLD);
  gb.sphere(x, y + 0.03 + r * 3.0, z, 0.012, GOLD, 0);
}

// A dome on a drum ringed with lit windows, rising from y: radius r (0.3 for
// the Civic Palace's). On the grandest (grade 5 up) a colonnade stands round
// the drum. A lantern on top, a gilded ball and a flag from grade 4.
function bigDome(c, x, y, z, r, g, wall) {
  const { gb } = c, k = r / 0.3, dh = r * 0.8;
  gb.cyl(x, y, z, r, r, dh, 18, wall);
  const n = g >= 4 ? 10 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    gb.glow(WARM[0], WARM[1], WARM[2], 1.1);
    gb.box(x + Math.sin(a) * (r + 0.002), y + 0.08 * k, z + Math.cos(a) * (r + 0.002), 0.05 * k, 0.1 * k, 0.012, GLASS, a);
    gb.noGlow();
  }
  if (g >= 5) {
    const m = 16, R = r * 1.2;
    for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2; gb.cyl(x + Math.sin(a) * R, y, z + Math.cos(a) * R, 0.016 * k, 0.019 * k, dh, 8, TRIM); }
    gb.cyl(x, y + dh, z, R + 0.03 * k, R + 0.03 * k, 0.035 * k, 18, TRIM);
    gb.cyl(x, y + dh + 0.035 * k, z, r * 1.06, R + 0.01 * k, 0.03 * k, 18, STONE_L);
  } else gb.cyl(x, y + dh, z, r * 1.1, r * 1.1, 0.035 * k, 18, STONE);
  let top = y + dh + (g >= 5 ? 0.065 : 0.03) * k;
  if (g >= 6) {
    // an attic drum over the colonnade, lifting the dome higher
    const ah = r * 0.32;
    gb.cyl(x, top, z, r * 0.94, r * 0.98, ah, 18, wall);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; gb.box(x + Math.sin(a) * r * 0.95, top + ah * 0.25, z + Math.cos(a) * r * 0.95, 0.03 * k, ah * 0.5, 0.01, shade(wall, 0.8), a); }
    gb.cyl(x, top + ah, z, r * 1.0, r * 1.0, 0.025 * k, 18, TRIM);
    top += ah + 0.025 * k;
  }
  gb.sphere(x, top, z, r * 1.033, COPPER, 1, 0.82);
  const ly = top + r * 0.83;
  gb.cyl(x, ly, z, r * 0.2, r * 0.2, r * 0.4, 10, TRIM);
  gb.glow(WARM[0], WARM[1], WARM[2], 1.15);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; gb.box(x + Math.sin(a) * r * 0.2, ly + r * 0.1, z + Math.cos(a) * r * 0.2, r * 0.08, r * 0.2, 0.008, GLASS, a); }
  gb.noGlow();
  gb.cone(x, ly + r * 0.4, z, r * 0.27, r * 0.27, 10, COPPER);
  gb.sphere(x, ly + r * 0.73, z, r * 0.117, GOLD, 1, 1);
  if (g >= 4) {
    gb.box(x, ly + r * 0.83, z, 0.012 * k, 0.16 * k, 0.012 * k, '#cfcfcf');
    gb.box(x + 0.06 * k, ly + r * 0.83 + 0.09 * k, z, 0.11 * k, 0.07 * k, 0.004, ownPick(c, FLAGS, 7));
  }
}

// A balustrade along a wall top at y (len long, along x or z), urns on its
// piers every so often when urns is set.
function balustrade(c, x, y, z, len, alongZ, color = TRIM, urns = 0) {
  const { gb } = c;
  gb.box(x, y, z, alongZ ? 0.03 : len, 0.012, alongZ ? len : 0.03, color);
  gb.box(x, y + 0.042, z, alongZ ? 0.036 : len + 0.01, 0.012, alongZ ? len + 0.01 : 0.036, color);
  const n = Math.max(2, Math.round(len / 0.045));
  for (let i = 0; i <= n; i++) {
    const u = -len / 2 + (i * len) / n;
    const [ox, oz] = alongZ ? [0, u] : [u, 0];
    gb.box(x + ox, y + 0.012, z + oz, 0.009, 0.03, 0.009, color);
  }
  if (urns) for (let i = 0; i <= urns; i++) {
    const u = -len / 2 + (i * len) / urns, [ox, oz] = alongZ ? [0, u] : [u, 0];
    gb.cbox(x + ox, y + 0.054, z + oz, 0.03, 0.02, 0.03, color, 0, 0.004);
    gb.sphere(x + ox, y + 0.09, z + oz, 0.017, STONE_L, 0, 1.2);
  }
}

// A figure on the skyline (or on a plinth): a draped stone figure on a
// little base at (x, y, z), s times the size.
function skyFigure(c, x, y, z, s = 1, mat = STONE_L) {
  const { gb } = c;
  gb.cbox(x, y, z, 0.034 * s, 0.018 * s, 0.034 * s, mat, 0, 0.004);
  gb.cyl(x, y + 0.018 * s, z, 0.012 * s, 0.018 * s, 0.07 * s, 6, mat);
  gb.sphere(x, y + 0.098 * s, z, 0.012 * s, mat, 0);
  gb.box(x + 0.012 * s, y + 0.06 * s, z, 0.006 * s, 0.04 * s, 0.006 * s, mat, 0, 0, -0.6);
}

// A chariot drawn by four horses, in bronze, on a pediment's apex at y.
function quadriga(c, x, y, z, s = 1) {
  const { gb } = c;
  gb.push(x, y, z, 0, s);
  gb.box(0, 0, -0.01, 0.08, 0.012, 0.06, BRONZE);
  for (let i = 0; i < 4; i++) {
    const hx = -0.03 + i * 0.02;
    gb.box(hx, 0.012, 0.03, 0.012, 0.03, 0.05, BRONZE);
    gb.box(hx, 0.042, 0.05, 0.01, 0.025, 0.014, BRONZE, 0, -0.5);
  }
  gb.cyl(0, 0.012, -0.03, 0.022, 0.022, 0.03, 8, BRONZE, 0, 0, Math.PI / 2);
  gb.cyl(0, 0.012, -0.02, 0.009, 0.012, 0.05, 6, BRONZE);
  gb.sphere(0, 0.07, -0.02, 0.011, BRONZE, 0);
  gb.box(0.012, 0.075, -0.02, 0.005, 0.05, 0.005, BRONZE, 0, 0, -0.4);
  gb.pop();
}

// A temple front against the front face of a wall at z: three steps up to n
// columns h tall across w, an entablature and a pediment facing the street
// with the roof's colour over it. From grade 3 figures in the pediment and
// on its corners and apex, from 4 a chariot on the apex instead.
function templeFront(c, x, z, w, h, n, g, roof, trim = TRIM) {
  const { gb } = c, dz = 0.2, cz = z + dz / 2;
  footing(c, x, cz, w + 0.08, dz + 0.04);
  gb.cbox(x, -0.04, cz, w + 0.08, 0.06, dz + 0.04, STONE_L, 0, 0.008);
  for (let s = 0; s < 3; s++) gb.box(x, -0.04 + s * 0.02, z + dz + 0.06 - s * 0.025, w + 0.14 - s * 0.02, 0.02, 0.05, STONE_L);
  const cr = Math.min(0.032, (w / n) * 0.24);
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + cr + 0.01 + (i * (w - 2 * cr - 0.02)) / (n - 1), pz = z + dz - cr - 0.012;
    gb.box(px, 0.02, pz, cr * 2.3, 0.02, cr * 2.3, trim);
    gb.cyl(px, 0.04, pz, cr * 0.82, cr, h - 0.06, 10, trim);
    gb.box(px, h - 0.02, pz, cr * 2.3, 0.022, cr * 2.3, trim);
  }
  gb.cbox(x, h, cz, w + 0.04, 0.06, dz + 0.03, trim, 0, 0.006);
  gb.box(x, h + 0.02, z + dz + 0.017, w + 0.03, 0.014, 0.004, shade(trim, 0.85));
  const ph = Math.min(0.2, w * 0.17), py = h + 0.06;
  gb.gable(x, py, cz, w + 0.04, dz + 0.03, ph, trim, roof, 0.02, true);
  if (g >= 3) {
    // a relief of figures in the pediment
    for (let i = -2; i <= 2; i++) gb.box(x + i * w * 0.09, py + 0.008, z + dz + 0.016, 0.022, (ph - Math.abs(i) * ph * 0.3) * 0.62, 0.012, shade(trim, 0.88));
    for (const s of [-1, 1]) skyFigure(c, x + (s * (w + 0.02)) / 2, py, cz + 0.06, 1.1);
    if (g >= 4) quadriga(c, x, py + ph + 0.01, cz, 1.4); else skyFigure(c, x, py + ph + 0.005, cz, 1.2);
  }
  return py + ph;
}

// A Gothic porch: a deep pointed archway with a steep gable over it and a
// pinnacle either side, against a wall at z.
function gothicPorch(c, x, z, w, h, wall, roof) {
  const { gb } = c, d = 0.14;
  gb.cbox(x, 0, z + d / 2, w, h, d, wall, 0, 0.01);
  gb.gable(x, h, z + d / 2, w, d + 0.02, w * 0.6, wall, roof, 0.02, true);
  for (const s of [-1, 1]) {
    gb.box(x + (s * w) / 2, 0, z + d, 0.03, h + 0.04, 0.03, shade(wall, 0.85));
    gb.cone(x + (s * w) / 2, h + 0.04, z + d, 0.02, 0.12, 4, roof, Math.PI / 4);
  }
}

// Gothic trim on a block w × d at z whose walls stand H tall under a steep
// roof rising rise: a pinnacle on each corner, little gabled dormers along
// the front slope (n of them).
function gothicTrim(c, x, z, w, d, H, rise, n, wall, roof) {
  const { gb } = c;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = x + (sx * w) / 2, pz = z + (sz * d) / 2;
    gb.box(px, 0, pz, 0.035, H + 0.04, 0.035, shade(wall, 0.85));
    gb.cone(px, H + 0.04, pz, 0.024, 0.15, 4, roof, Math.PI / 4);
  }
  for (let i = 0; i < n; i++) {
    const u = x - w / 2 + ((i + 0.5) * w) / n;
    gb.cbox(u, H - 0.02, z + d / 2 - 0.05, 0.1, 0.12, 0.1, wall, 0, 0.006);
    gb.gable(u, H + 0.1, z + d / 2 - 0.05, 0.1, 0.12, rise * 0.32, wall, roof, 0.015, true, 0.02);
    win(c, u, H + 0.0, z + d / 2 + 0.002, 0.04, 0.07, 'f', 0.7);
  }
}

// A flagpole at (x, z), h tall, flying `col`.
function flagpole(c, x, z, h, col) {
  const { gb } = c, y = c.gy(x, z);
  gb.cyl(x, y - 0.01, z, 0.022, 0.028, 0.03, 8, STONE_L);
  gb.box(x, y, z, 0.013, h, 0.013, '#cfcfcf');
  gb.sphere(x, y + h + 0.01, z, 0.012, GOLD, 0);
  gb.box(x + 0.065, y + h - 0.1, z, 0.13, 0.085, 0.004, col);
}

// A lamp standard with two lanterns on a scrolled arm, at (x, z).
function lampStandard(c, x, z, h = 0.36, along = 'x') {
  const { gb } = c, y = c.gy(x, z);
  gb.cyl(x, y - 0.01, z, 0.022, 0.026, 0.04, 8, STONE);
  gb.cyl(x, y + 0.03, z, 0.01, 0.015, h - 0.03, 6, IRON);
  const [ax, az] = along === 'x' ? [0.05, 0] : [0, 0.05];
  gb.box(x, y + h - 0.01, z, along === 'x' ? 0.11 : 0.008, 0.008, along === 'x' ? 0.008 : 0.11, IRON);
  for (const s of [-1, 1]) {
    gb.glow(2.2, 1.6, 0.8, 3.0);
    gb.box(x + s * ax, y + h - 0.045, z + s * az, 0.03, 0.04, 0.03, '#ffe2a0');
    gb.noGlow();
    gb.cone(x + s * ax, y + h - 0.005, z + s * az, 0.026, 0.026, 4, IRON, Math.PI / 4);
    c.addGlow(x + s * ax, y + h - 0.025, z + s * az);
  }
}

// A statue on a pedestal at (x, z), s times the size, of bronze or marble.
function statue(c, x, z, s = 1, mat = BRONZE) {
  const { gb } = c, y = c.gy(x, z);
  plinth(c, x, z, 0.1 * s, 0.1 * s);
  gb.cbox(x, Math.min(0, y) - 0.01, z, 0.1 * s, 0.12 * s - Math.min(0, y), 0.1 * s, '#e3dccb', 0, 0.01);
  gb.cyl(x, y + 0.11 * s, z, 0.026 * s, 0.03 * s, 0.1 * s, 8, mat);
  gb.sphere(x, y + 0.23 * s, z, 0.028 * s, mat, 1, 1);
  gb.box(x + 0.03 * s, y + 0.17 * s, z, 0.012 * s, 0.07 * s, 0.012 * s, mat, 0, 0, -0.5);
}

// Floodlights in the ground pointing at a front (lit all night), at (x, z).
function floodlight(c, x, z) {
  const { gb } = c, y = c.gy(x, z);
  gb.box(x, y - 0.005, z, 0.04, 0.02, 0.03, IRON);
  gb.glow(2.4, 2.0, 1.4, 3.0);
  gb.box(x, y + 0.015, z - 0.012, 0.03, 0.016, 0.006, '#fff0c8');
  gb.noGlow();
}

// --------------------------------------------------------- the town hall
// The town hall at each level, in its style. Its body grows the same in
// every style: a hall of two storeys, wings from the Guild Hall, wider from
// the Grand Hall, and from the City Hall a storey taller in stone. The
// style crowns it and dresses its front:
//   tower: a clock tower over the middle (a pyramid roof, a gilded cupola, a
//     spire, then an open belfry), a columned portico from the Grand Hall;
//   dome: a little cupola on the ridge, then a dome on a ring of windows
//     over a portico;
//   gothic: a flèche on the steep roof, then a tower before the front with
//     the door at its foot and a spire, pinnacles and dormer gables;
//   classical: a bell-cote and a pedimented door, then a temple front of
//     columns and a pediment under a balustraded flat roof, figures on the
//     skyline and at last a chariot.
// From the City Hall a fountain stands in the forecourt; the Civic Palace
// has statues either side of the steps.
// Within its style each hall has its own plan (planOf): the clock tower
// over the middle or standing up at one end of the front, the hall under a
// mansard; the Gothic tower before the middle or at one end; wings hipped,
// or with pedimented gables (or steep Gothic gables) to the street; a
// cupola, a lantern or a clock turret on the little halls' roofs.
C.townhall = (c, L) => {
  const { gb, pal } = c;
  const style = styleOf(c, 'townhall', L), goth = style === 'gothic', clas = style === 'classical';
  const plan = planOf(c, 3), side = c.form ? c.form.side : 1;
  const wall = goth ? (L ? ownPick(c, [pal.stoneWall, pal.brick, '#b9ab92'], 5) : pal.wall) : clas ? (L ? ASHLAR : pal.wall) : L >= 3 ? pal.stoneWall : pal.wall;
  const floors = L >= 3 ? 3 : 2;
  const H = L >= 3 ? 0.96 + (L - 3) * 0.08 : 0.66 + L * 0.06;
  const W = 1.2 + (L >= 2 ? 0.2 : 0), D = 0.8, tz = -0.3, fz = tz + D / 2;
  const roofT = goth ? 'gable' : clas && L >= 2 ? 'flat' : style === 'tower' && plan === 2 && L >= 1 ? 'mansard' : 'hip', rh = goth ? 0.48 + L * 0.03 : clas ? 0.22 : L >= 3 ? 0.4 : 0.34;
  const rise = rh * pal.pitch;
  const timbered = L < 3 && pal.timber && !clas && (L < 1 || !goth);
  c.shutters = '#3f5466';
  if (goth || clas) c.arched = true;
  // the Gothic tower stands before the front, the door at its foot (drawn
  // first: the door villagers use)
  const gw = 0.24 + 0.02 * L, gz = fz + gw / 2 - 0.05, gx = goth && plan === 1 ? side * (W / 2 - gw / 2 - 0.08) : 0;
  if (goth && L >= 1) { footing(c, gx, gz, gw, gw); door(c, gx, gz + gw / 2, 0.1, 0.19, '#4e3424'); }
  house(c, {
    z: tz, w: W, d: D, h: H, floors, wall, roof: pal.slate, roofType: roofT, rh, plinth: STONE, doorX: 0, dormers: roofT === 'mansard' ? 5 : undefined,
    doorW: 0.15, lit: 0.85, nFront: L >= 3 ? 7 : 6, chimney: L < 4 && !clas && !(goth && L >= 2), timber: timbered, noDoor: goth && L >= 1, form: false,
  });
  if (L >= 1) {
    // the wings: hipped, or (plan 2) with gables to the street, pedimented
    const gabled = goth || plan === 2;
    for (const sx of [-1, 1]) {
      house(c, {
        x: sx * 0.76, z: -0.22, w: 0.36, d: 0.66, h: H * 0.75, floors, wall, roof: pal.slate, roofType: gabled ? 'gable' : 'hip', alongZ: gabled, rh: goth ? 0.36 : gabled ? 0.26 : 0.22,
        plinth: STONE, noDoor: true, lit: 0.85, form: false,
      });
      if (goth) gb.cone(sx * 0.76, H * 0.75 + 0.36 * pal.pitch, 0.11, 0.02, 0.12, 4, pal.slate, Math.PI / 4);
      else if (gabled) gb.gable(sx * 0.76, H * 0.75 + 0.005, 0.11, 0.38, 0.03, 0.26 * pal.pitch, TRIM, TRIM, 0.01, true);
    }
  }
  if (style === 'tower') {
    if (L >= 4) clockTower(c, 0, H, tz, 0.32, H + 1.0, 4, wall, pal.slate);
    else if (plan === 1) {
      // the clock tower standing up from the ground at one end of the front
      const tw = 0.28, tx = side * (W / 2 - tw / 2 - 0.06);
      footing(c, tx, fz - tw / 2 + 0.04, tw, tw);
      clockTower(c, tx, 0, fz - tw / 2 + 0.04, tw, H + 0.6 + Math.min(L, 2) * 0.12 + (L >= 3 ? 0.1 : 0), L, wall, pal.slate);
    } else clockTower(c, 0, H, tz, 0.3, H + 0.55 + Math.min(L, 2) * 0.12 + (L >= 3 ? 0.1 : 0), L, wall, pal.slate);
  } else if (style === 'dome') {
    // (the drum stands up out of the roof, so the windows round it show)
    if (L >= 2) bigDome(c, 0, H + rise * (L >= 4 ? 0.3 : 0.45), tz, [0.21, 0.26, 0.3][L - 2], L, wall);
    else if (plan === 1) tower(c, 'lantern', 0, tz, L ? 0.2 : 0.16, H + rise + 0.06, wall, COPPER, { clock: true });
    else cupola(c, 0, H + rise, tz, L ? 0.095 : 0.075, L ? COPPER : LEAD, wall);
  } else if (goth) {
    if (L >= 1) {
      gothicTower(c, gx, 0, gz, gw, H + 0.3 + 0.14 * L, L, wall, pal.slate);
      gb.arch(gx, 0.19, gz + gw / 2 - 0.004, 0.06, 0.012, 8, shade(wall, 0.8));
      win(c, gx, 0.36, gz + gw / 2, 0.06, 0.14, 'f', 0.8);
      if (L >= 2) gothicTrim(c, 0, tz, W, D, H, rise, 4, wall, pal.slate);
      if (gx) fleche(c, 0, H + rise, tz);
    } else if (plan === 1) {
      // a bell-cote on the front gable instead of the flèche
      for (const s2 of [-1, 1]) gb.box(s2 * 0.04, H + rise * 0.7, fz - 0.03, 0.03, 0.2, 0.05, wall);
      gb.cyl(0, H + rise * 0.7 + 0.06, fz - 0.03, 0.02, 0.03, 0.05, 7, BRONZE);
      gb.gable(0, H + rise * 0.7 + 0.2, fz - 0.03, 0.13, 0.07, 0.06, wall, pal.slate, 0.015, true);
    } else fleche(c, 0, H + rise, tz);
  } else {
    // the temple front
    if (L >= 2) {
      const tw = [0.7, 0.92, 1.24][L - 2], tn = [6, 6, 8][L - 2];
      templeFront(c, 0, fz, tw, H - 0.02, tn, L, pal.slate, TRIM);
      gb.hip(0, H + 0.045, tz - 0.04, W - 0.16, D - 0.2, 0.14, pal.slate, 0);
      for (const s of [-1, 1]) balustrade(c, (s * (W / 2 + tw / 2 + 0.02)) / 2, H + 0.045, fz - 0.02, W / 2 - tw / 2 - 0.02, false, TRIM, L >= 3 ? 2 : 0);
      for (const s of [-1, 1]) balustrade(c, (s * W) / 2 - s * 0.02, H + 0.045, tz, D - 0.04, true, TRIM);
      if (L >= 3) for (const s of [-1, 1]) for (const u of [0.3, 0.62]) skyFigure(c, s * (tw / 2 + u * (W / 2 - tw / 2)), H + 0.1, fz - 0.02);
    } else {
      // a pedimented door, and a portico from the Guild Hall; a bell-cote on the roof
      if (L >= 1) templeFront(c, 0, fz, 0.42, H * 0.45, 4, 1, pal.slate, TRIM);
      else {
        for (const s of [-1, 1]) gb.box(s * 0.1, 0, fz + 0.012, 0.03, 0.2, 0.02, TRIM);
        gb.gable(0, 0.2, fz + 0.02, 0.26, 0.03, 0.07, TRIM, TRIM, 0.01, true);
      }
      if (plan === 1) cupola(c, 0, H + rise, tz, 0.08, LEAD, wall);
      else {
        const by = H + rise * 0.55;
        for (const s of [-1, 1]) gb.box(s * 0.05, by - 0.06, fz - 0.16, 0.03, 0.2, 0.05, wall);
        gb.gable(0, by + 0.14, fz - 0.16, 0.14, 0.06, 0.06, wall, pal.slate, 0.015, true);
        gb.cyl(0, by + 0.04, fz - 0.16, 0.02, 0.03, 0.04, 8, BRONZE);
      }
    }
  }
  if (L >= 2 && (style === 'tower' || style === 'dome')) {
    // a columned portico over the door (wider on the palace)
    const n = L >= 4 ? 8 : 6, span = L >= 4 ? 0.98 : 0.64, ph = Math.min(H * 0.6, 0.56);
    for (let i = 0; i < n; i++) gb.cyl(-span / 2 + (i * span) / (n - 1), 0.07, 0.15, 0.024, 0.028, ph, 8, TRIM);
    gb.cbox(0, 0.07 + ph, 0.15, span + 0.16, 0.045, 0.13, TRIM, 0, 0.01);
    gb.gable(0, 0.115 + ph, 0.13, span + 0.16, 0.19, 0.11, TRIM, pal.slate, 0.02);
    gb.cbox(0, 0, 0.2, span + 0.2, 0.07, 0.16, STONE, 0, 0.01);
  }
  for (const sx of [-1, 1]) {
    const fx = sx * 0.64, ffz = 0.56, fy = c.gy(fx, ffz);
    gb.box(fx, fy, ffz, 0.013, 0.6, 0.013, '#cfcfcf');
    gb.box(fx + 0.065, fy + 0.5, ffz, 0.13, 0.085, 0.004, sx > 0 ? '#a8473a' : '#3f6a8f');
    lamp(c, sx * 0.32, 0.62, 0.32);
    bench(c, sx * 0.42, 0.84, Math.PI);
    bush(c, sx * 0.86, 0.86, 1.2);
  }
  if (L >= 3) {
    // a fountain in the forecourt
    const y = c.gy(0, 0.66);
    gb.cyl(0, y - 0.02, 0.66, 0.17, 0.18, 0.06, 16, STONE);
    gb.cyl(0, y + 0.03, 0.66, 0.15, 0.15, 0.01, 16, '#3f7f9f');
    gb.cyl(0, y + 0.03, 0.66, 0.03, 0.04, 0.16, 8, STONE);
    gb.cyl(0, y + 0.17, 0.66, 0.07, 0.05, 0.025, 10, STONE);
    c.fountain = [0, y + 0.24, 0.66];
  } else {
    blooms(c, -0.16, 0.86, 7, 0.09);
    blooms(c, 0.16, 0.86, 7, 0.09);
  }
  if (L >= 4) {
    // statues on plinths either side of the steps
    for (const sx of [-1, 1]) {
      const x = sx * 0.52, z = 0.42, y = c.gy(x, z);
      gb.cbox(x, y - 0.01, z, 0.1, 0.12, 0.1, '#e3dccb', 0, 0.01);
      gb.cyl(x, y + 0.11, z, 0.026, 0.03, 0.1, 8, BRONZE);
      gb.sphere(x, y + 0.23, z, 0.028, BRONZE, 1, 1);
    }
  }
};

// -------------------------------------------------------- the grounds

// Paving laid over the ground from (x0, z0) to (x1, z1), in slabs that
// follow it.
function pave(c, x0, z0, x1, z1, color = PAVING, cell = 0.5) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell - 1e-6)), nz = Math.max(1, Math.ceil((z1 - z0) / cell - 1e-6));
  const w = (x1 - x0) / nx, d = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = x0 + (i + 0.5) * w, z = z0 + (k + 0.5) * d;
    c.gb.box(x, c.gy(x, z) - 0.006, z, w + 0.002, 0.012, d + 0.002, color);
  }
}
// A lawn (the season's green) inside a stone kerb, the same way.
function lawn(c, x0, z0, x1, z1, cell = 0.5) {
  const col = turf(c)[0];
  pave(c, x0 - 0.02, z0 - 0.02, x1 + 0.02, z1 + 0.02, STONE_L, cell);
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell - 1e-6)), nz = Math.max(1, Math.ceil((z1 - z0) / cell - 1e-6));
  const w = (x1 - x0) / nx, d = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = x0 + (i + 0.5) * w, z = z0 + (k + 0.5) * d;
    c.gb.box(x, c.gy(x, z) - 0.003, z, w + 0.002, 0.012, d + 0.002, col);
  }
}

// Railings along the street from x0 to x1 at z: a stone kerb, iron rails,
// a pier at each end.
function frontRail(c, x0, x1, z) {
  const { gb } = c, a = Math.min(x0, x1), b = Math.max(x0, x1), n = Math.max(1, Math.round((b - a) / 0.5)), s = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const m = a + (i + 0.5) * s, y = c.gy(m, z);
    gb.cbox(m, y - 0.01, z, s + 0.002, 0.035, 0.04, STONE_L, 0, 0.006);
    for (let px = m - s / 2 + 0.015; px < m + s / 2 - 0.005; px += 0.032) gb.box(px, y + 0.025, z, 0.006, 0.065, 0.006, IRON);
    gb.box(m, y + 0.08, z, s, 0.008, 0.008, IRON);
  }
  for (const px of [a, b]) gb.cbox(px, c.gy(px, z) - 0.01, z, 0.05, 0.12, 0.05, STONE_L, 0, 0.006);
}

// A range of the seat (the main front, a wing, a pavilion) in its style:
// hipped in slate under a cornice (tower and dome), steep-roofed with
// pinnacles and dormer gables (gothic), or flat behind a balustrade with a
// low roof behind it (classical). o: x, z, w, d, h, floors, wall, rise
// (of the roof), alongZ (a wing running back from the street), nFront,
// dormers (gothic), urns (classical).
function seatBlock(c, style, o) {
  const { gb, pal } = c, goth = style === 'gothic', clas = style === 'classical';
  const rise = goth ? o.rise * 1.7 : clas ? 0 : o.rise;
  house(c, {
    x: o.x || 0, z: o.z, w: o.w, d: o.d, h: o.h, floors: o.floors, wall: o.wall, roof: pal.slate, alongZ: !!o.alongZ,
    roofType: goth ? 'gable' : clas ? 'flat' : 'hip', rh: rise, plinth: STONE, fancy: false, noDoor: true, lit: 0.85, nFront: o.nFront, chimney: false,
  });
  const x = o.x || 0, top = o.h + 0.045;
  if (clas) {
    gb.hip(x, top, o.z, o.w - 0.14, o.d - 0.14, 0.12, pal.slate, 0, !!o.alongZ);
    balustrade(c, x, top, o.z + o.d / 2 - 0.015, o.w - 0.02, false, TRIM, o.urns || 0);
    balustrade(c, x, top, o.z - o.d / 2 + 0.015, o.w - 0.02, false, TRIM);
    for (const s of [-1, 1]) balustrade(c, x + s * (o.w / 2 - 0.015), top, o.z, o.d - 0.05, true, TRIM, o.urns ? Math.max(1, Math.round((o.urns * o.d) / o.w)) : 0);
  } else if (goth) gothicTrim(c, x, o.z, o.w, o.d, o.h, rise, o.alongZ ? 0 : o.dormers ?? Math.round(o.w / 0.36), o.wall, pal.slate);
  else gb.box(x, o.h - 0.03, o.z, o.w + 0.03, 0.03, o.d + 0.03, TRIM);
}

// A raised attic over the middle of a classical seat (behind its temple
// front): a storey of blind panels between pilasters under a balustrade,
// figures at its corners and a chariot over the middle on the grander.
function classicalAttic(c, x, h, z, w, d, L) {
  const { gb, pal } = c, ah = 0.26;
  gb.cbox(x, h + 0.04, z, w, ah, d, ASHLAR, 0, 0.01);
  for (let i = 0; i <= 6; i++) gb.box(x - w / 2 + (i * w) / 6, h + 0.04, z + d / 2 + 0.004, 0.03, ah, 0.012, TRIM);
  for (let i = 0; i < 6; i++) gb.box(x - w / 2 + ((i + 0.5) * w) / 6, h + 0.1, z + d / 2 + 0.003, 0.08, 0.12, 0.008, shade(ASHLAR, 0.9));
  gb.box(x, h + 0.04 + ah, z, w + 0.04, 0.03, d + 0.04, TRIM);
  gb.hip(x, h + 0.07 + ah, z, w - 0.08, d - 0.08, 0.1, pal.slate, 0);
  balustrade(c, x, h + 0.07 + ah, z + d / 2 - 0.015, w - 0.02, false, TRIM);
  for (const s of [-1, 1]) skyFigure(c, x + (s * (w - 0.04)) / 2, h + 0.07 + ah, z + d / 2 - 0.02, 1.3);
  if (L) quadriga(c, x, h + 0.1 + ah, z + d / 2 - 0.08, 1.8);
}

// What crowns the seat's main range (its middle at x, z, the walls h
// tall): a clock tower w wide up to top, or a dome of radius w (the Gothic
// tower stands before the doors, and a temple front needs no crown).
function seatCrown(c, style, x, h, z, w, top, g, wall) {
  if (style === 'tower') clockTower(c, x, h, z, w, top, g, wall, c.pal.slate);
  else if (style === 'dome') bigDome(c, x, h - 0.05, z, w, g, wall);
}

// The doors of a grand front at z (drawn first: the way in), dressed in
// the style: a tower before them with the door at its foot (gothic: tw
// wide, up to ttop), a temple front of cn columns cw wide, the walls' full
// height (classical), or a portico of pn columns pw wide and ph tall.
// Returns how far forward of the front it reaches.
function seatFront(c, style, x, z, o) {
  const { gb, pal } = c;
  if (style === 'gothic') {
    const gw = o.tw, gz = z + gw / 2 - 0.06;
    footing(c, x, gz, gw, gw);
    door(c, x, gz + gw / 2, 0.12, 0.24, '#4e3424');
    gothicTower(c, x, 0, gz, gw, o.ttop, o.g, o.wall, pal.slate);
    gb.arch(x, 0.24, gz + gw / 2 - 0.004, 0.075, 0.012, 8, shade(o.wall, 0.8));
    for (let k = 1; k <= 2; k++) win(c, x, 0.2 + k * 0.28, gz + gw / 2, 0.07, 0.16, 'f', 0.85);
    return gz + gw / 2;
  }
  door(c, x, z, 0.16, 0.24, '#3a2f28');
  if (style === 'classical') templeFront(c, x, z, o.cw, o.h - 0.02, o.cn, o.g, pal.slate);
  else templeFront(c, x, z, o.pw, o.ph, o.pn, Math.min(o.g, 3), pal.slate);
  return z + 0.32;
}

// The Capitol: the seat on 3×3 grounds. The main range across the back is
// crowned in its style (a clock tower with an open belfry, a dome on a
// colonnaded drum, a spired Gothic tower before the doors, or a temple
// front with a chariot on it under a balustrade of figures), and two long
// wings come forward either side of a forecourt: paved, a fountain in the
// middle, lawns with beds and clipped yews, lamp standards along the walk,
// flags before the doors, statues before the wings' ends, and railings
// along the street with a gate. The Capitol stands a storey taller, its
// dome or tower grander, porticos on the wings' ends, riders on the
// plinths and floodlights before the doors at night.
C.capitol = (c, L) => {
  const { gb, pal } = c;
  const style = styleOf(c, 'capitol', L), goth = style === 'gothic', clas = style === 'classical', g = 5 + L;
  const wall = goth ? ownPick(c, [pal.stoneWall, pal.brick, '#b9ab92'], 5) : clas ? ASHLAR : pal.stoneWall;
  const H = L ? 1.24 : 1.1, W = 1.72, D = 0.96, tz = -0.86, fz = tz + D / 2;
  const wx = 1.08, ww = 0.54, wz0 = -1.24, wz1 = 0.46, wh = L ? 0.96 : 0.84;
  c.shutters = null; c.arched = true;
  const front = seatFront(c, style, 0, fz, { tw: 0.38, ttop: H + 0.95 + L * 0.25, g, wall, h: H, cw: L ? 1.3 : 1.04, cn: L ? 10 : 8, pw: 0.86, ph: 0.68, pn: 6 });
  seatBlock(c, style, { z: tz, w: W, d: D, h: H, floors: 3, wall, rise: 0.36, nFront: 9, dormers: 4, urns: L ? 6 : 0 });
  for (const sx of [-1, 1]) {
    seatBlock(c, style, { x: sx * wx, z: (wz0 + wz1) / 2, w: ww, d: wz1 - wz0, h: wh, floors: 3, wall, rise: 0.26, alongZ: true, urns: L ? 3 : 0 });
    if (L && !goth) templeFront(c, sx * wx, wz1, 0.42, wh - 0.02, 4, 3, pal.slate);
    else if (!goth) gb.gable(sx * wx, wh + 0.045, wz1 - 0.06, ww + 0.02, 0.12, 0.12, TRIM, pal.slate, 0.02, true);
    else gothicPorch(c, sx * wx, wz1, 0.22, 0.3, wall, pal.slate);
  }
  seatCrown(c, style, 0, H, tz, style === 'dome' ? (L ? 0.46 : 0.42) : 0.4, H + 1.15 + L * 0.2, g, wall);
  if (clas) {
    for (const s of [-1, 1]) for (const u of [0.66, 0.8]) skyFigure(c, s * u, H + 0.1, fz - 0.015, 1.2);
    classicalAttic(c, 0, H, tz - 0.06, 0.84, 0.6, L);
  }
  // the forecourt between the wings
  const fx = wx - ww / 2 - 0.04, fz0 = front + 0.02, fz1 = 1.42;
  pave(c, -fx, fz0, fx, fz1, PAVING);
  pave(c, -0.17, fz0, 0.17, fz1, PAVING_D);
  gb.cyl(0, c.gy(0, 0.7) - 0.008, 0.7, 0.4, 0.4, 0.013, 20, PAVING_D);
  fountain(c, 0, 0.7, 0.25, L ? 'figure' : 'tiers');
  for (const s of [-1, 1]) {
    const lx0 = s > 0 ? 0.44 : -fx + 0.05, lx1 = s > 0 ? fx - 0.05 : -0.44, lz0 = fz0 + 0.1, lz1 = 1.18;
    lawn(c, lx0, lz0, lx1, lz1, 0.45);
    const lc = (lx0 + lx1) / 2;
    bed(c, lc, (lz0 + lz1) / 2, 0.12, Math.max(0.12, lz1 - lz0 - 0.36), { edge: 'box' });
    for (const zz of [lz0 + 0.08, lz1 - 0.08]) for (const xx of [lx0 + 0.05, lx1 - 0.05]) topiaryShape(c, xx, zz, 1.1, 'cone');
    for (const zz of [fz0 + 0.1, 1.24]) lampStandard(c, s * 0.25, zz, 0.36, 'z');
    flagpole(c, s * 0.4, fz0 + 0.02, L ? 0.82 : 0.7, ownPick(c, FLAGS, 11 + s));
    if (L) { flagpole(c, s * 0.74, fz0 + 0.02, 0.72, ownPick(c, FLAGS, 13 + s)); for (const u of [0.3, 0.6]) floodlight(c, s * u, fz0 + 0.06); }
    // before the wing's end: a statue among beds
    const ex = s * wx, ez0 = wz1 + (L ? 0.34 : 0.1);
    pave(c, ex - 0.3, ez0, ex + 0.3, 1.42, PAVING);
    if (L) monument(c, ex, 1.0, 'rider', 0.85); else statue(c, ex, 1.0, 1.3, BRONZE);
    for (const t of [-1, 1]) bed(c, ex + t * 0.2, 1.26, 0.12, 0.2, { edge: 'stone' });
  }
  // railings along the street, gate piers and lamps at the gate
  for (const s of [-1, 1]) frontRail(c, s * 0.26, s * 1.46, 1.44);
  gatePiers(c, 0, 1.44, 0.5, STONE_L);
  gb.boxC(0, c.gy(0, 1.44) + 0.25, 1.44, 0.46, 0.014, 0.014, IRON);
  gb.sphere(0, c.gy(0, 1.44) + 0.28, 1.44, 0.025, GOLD, 0);
};

// The Parliament: the seat on 4×4 grounds, the town as the capital of the
// land. A long range across the back with a chamber at either end coming
// forward (great windows down their sides), and the central hall taller
// between them under the style's crown (the Gothic tower or a temple front
// before the doors). The square before it: a processional way from the gate
// to the doors lined with lamp standards and statues, fountains in lawns
// either side, an avenue of limes down each side, flags along the front and
// railings on the street. The Houses of Parliament add a tower at each end
// of the range (a clock tower and a great square tower on the Gothic one,
// clock towers or cupolas, chariots on the classical), more flags and
// floodlights.
C.parliament = (c, L) => {
  const { gb, pal } = c;
  const style = styleOf(c, 'parliament', L), goth = style === 'gothic', clas = style === 'classical', g = 7 + L;
  const wall = goth ? ownPick(c, [pal.stoneWall, '#c9b48a', '#b9ab92'], 5) : clas ? ASHLAR : pal.stoneWall;
  const H = L ? 1.16 : 1.06, rz = -1.46, RD = 0.84, RW = 3.6;
  const px = 1.36, pw = 0.78, pz0 = -1.72, pz1 = -0.5, ph = H + 0.16;
  const cw = 1.1, cz0 = -1.86, cz1 = -0.64, chh = H + 0.3, cz = (cz0 + cz1) / 2;
  c.shutters = null; c.arched = true;
  const front = seatFront(c, style, 0, cz1, { tw: 0.46, ttop: chh + 1.25 + L * 0.25, g, wall, h: chh, cw: 1.36, cn: 10, pw: 0.96, ph: 0.74, pn: 8 });
  seatBlock(c, style, { z: rz, w: RW, d: RD, h: H, floors: 3, wall, rise: 0.34, nFront: 15, dormers: 8, urns: 10 });
  seatBlock(c, style, { z: cz, w: cw, d: cz1 - cz0, h: chh, floors: 4, wall, rise: 0.4, nFront: 5, dormers: 3, urns: 4 });
  for (const s of [-1, 1]) {
    seatBlock(c, style, { x: s * px, z: (pz0 + pz1) / 2, w: pw, d: pz1 - pz0, h: ph, floors: 3, wall, rise: 0.42, alongZ: true, urns: 3 });
    if (!goth) templeFront(c, s * px, pz1, 0.56, ph - 0.02, 6, clas ? 4 : 3, pal.slate);
    else gothicPorch(c, s * px, pz1, 0.3, 0.42, wall, pal.slate);
    // the chamber's great windows down its outer side
    for (let i = 0; i < 4; i++) stainedGlass(c, s * (px + pw / 2 + 0.006), ph * 0.38, pz0 + 0.22 + i * 0.26, 0.07, ph * 0.4, i, 'r');
  }
  seatCrown(c, style, 0, chh, cz, style === 'dome' ? (L ? 0.56 : 0.52) : 0.5, chh + 1.4 + L * 0.2, g, wall);
  if (clas) classicalAttic(c, 0, chh, cz - 0.08, 0.9, 0.7, L);
  if (goth) {
    // a lantern spire over the central hall
    gb.cyl(0, chh + 0.3, cz - 0.15, 0.16, 0.18, 0.3, 8, wall);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gb.box(Math.sin(a) * 0.165, chh + 0.37, cz - 0.15 + Math.cos(a) * 0.165, 0.04, 0.16, 0.01, IRON, a); }
    gb.cone(0, chh + 0.6, cz - 0.15, 0.19, 0.9, 8, pal.slate, Math.PI / 8);
    gb.box(0, chh + 1.48, cz - 0.15, 0.012, 0.1, 0.012, GOLD);
  }
  if (L) {
    // a tower at each end of the range
    for (const s of [-1, 1]) {
      const tx = s * (RW / 2 - 0.22), tzz = rz - 0.08;
      if (style === 'tower') clockTower(c, tx, H, tzz, 0.32, H + 0.9, 4, wall, pal.slate);
      else if (style === 'dome') cupola(c, tx, H + 0.34, tzz, 0.12, COPPER, wall);
      else if (clas) quadriga(c, s * px, ph + 0.06 + 0.2, pz1 + 0.1, 1.5);
      else if (s > 0) gothicTower(c, tx, H, tzz, 0.3, H + 1.25, 8, wall, pal.slate);
      else {
        // the great square tower, a turret at each corner and a flag
        const tw = 0.44, top = H + 1.0;
        footing(c, tx, tzz, tw, tw);
        gb.cbox(tx, 0, tzz, tw, top, tw, wall, 0, 0.014);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          gb.cyl(tx + (sx * tw) / 2, 0, tzz + (sz * tw) / 2, 0.04, 0.045, top + 0.12, 8, shade(wall, 0.9));
          gb.cone(tx + (sx * tw) / 2, top + 0.12, tzz + (sz * tw) / 2, 0.05, 0.16, 8, pal.slate);
        }
        for (let k = 0; k < 3; k++) win(c, tx, 0.5 + k * 0.4, tzz + tw / 2, 0.08, 0.2, 'f', 0.8);
        gb.box(tx, top, tzz, 0.016, 0.42, 0.016, '#cfcfcf');
        gb.box(tx + 0.09, top + 0.3, tzz, 0.17, 0.11, 0.004, ownPick(c, FLAGS, 17));
      }
    }
  }
  // the square
  const sq0 = front + 0.02, sq1 = 1.94;
  pave(c, -1.94, sq0, 1.94, sq1, PAVING);
  pave(c, -0.26, sq0, 0.26, sq1, PAVING_D);
  for (const s of [-1, 1]) {
    // a lawn with a fountain, beds at its corners, an avenue of limes down the side
    lawn(c, s > 0 ? 0.62 : -1.42, -0.16, s > 0 ? 1.42 : -0.62, 1.5, 0.45);
    gb.cyl(s * 1.02, c.gy(s * 1.02, 0.67) - 0.004, 0.67, 0.4, 0.4, 0.014, 20, PAVING_D);
    fountain(c, s * 1.02, 0.67, 0.28, s > 0 ? 'tiers' : L ? 'figure' : 'obelisk');
    for (const zz of [0.0, 1.34]) for (const xx of [0.76, 1.28]) bed(c, s * xx, zz, 0.16, 0.12, { edge: 'box' });
    for (const zz of [-0.25, 0.4, 1.05, 1.7]) parkTree(c, s * 1.72, zz, 1.15, 'lime');
    for (const zz of [0.1, 0.9, 1.6]) lampStandard(c, s * 0.38, zz, 0.38, 'z');
    for (const zz of [0.5, 1.25]) statue(c, s * 0.42, zz, 1.15, L ? BRONZE : MARBLE);
    for (const u of L ? [0.62, 0.92, 1.22, 1.52] : [0.75, 1.25]) flagpole(c, s * u, sq0 + 0.06, 0.8, ownPick(c, FLAGS, 20 + Math.round(u * 10) + s));
    if (L) for (const u of [0.32, 0.78, 1.6]) floodlight(c, s * u, sq0 + 0.14);
  }
  for (const s of [-1, 1]) frontRail(c, s * 0.32, s * 1.96, 1.95);
  gatePiers(c, 0, 1.95, 0.62, STONE_L);
  gb.boxC(0, c.gy(0, 1.95) + 0.27, 1.95, 0.58, 0.016, 0.016, IRON);
  gb.sphere(0, c.gy(0, 1.95) + 0.3, 1.95, 0.03, GOLD, 0);
  for (const s of [-1, 1]) lampStandard(c, s * 0.42, 1.84, 0.38, 'x');
};

// --------------------------------------------------- the civic quarter

// Justice on a pediment's apex at y: a gilded figure holding up her scales,
// a sword in her other hand.
function justice(c, x, y, z, s = 1) {
  const { gb } = c;
  gb.push(x, y, z, 0, s);
  gb.cbox(0, 0, 0, 0.05, 0.02, 0.05, STONE_L, 0, 0.004);
  gb.cyl(0, 0.02, 0, 0.016, 0.026, 0.1, 8, GOLD);
  gb.sphere(0, 0.135, 0, 0.016, GOLD, 0);
  gb.box(-0.03, 0.1, 0, 0.008, 0.06, 0.008, GOLD, 0, 0, 0.9);
  gb.box(-0.06, 0.125, 0, 0.04, 0.004, 0.004, GOLD);
  for (const u of [-0.078, -0.042]) gb.cyl(u, 0.1, 0, 0.012, 0.012, 0.004, 8, GOLD);
  gb.box(0.026, 0.09, 0, 0.007, 0.11, 0.007, '#cfcfcf', 0, 0, -0.15);
  gb.pop();
}

// A couchant lion on a plinth, its head to the street (+z), at (x, z).
function lion(c, x, z, mat = STONE_L) {
  const { gb } = c, y = c.gy(x, z);
  plinth(c, x, z, 0.16, 0.24);
  gb.cbox(x, Math.min(0, y) - 0.01, z, 0.14, 0.08 - Math.min(0, y), 0.24, STONE, 0, 0.008);
  gb.push(x, y + 0.07, z, 0);
  gb.box(0, 0, -0.01, 0.07, 0.04, 0.15, mat);
  gb.sphere(0, 0.05, 0.05, 0.04, mat, 1, 1.05);
  gb.box(0, 0.04, 0.085, 0.034, 0.03, 0.03, mat);
  for (const s of [-1, 1]) gb.box(s * 0.022, 0, 0.085, 0.018, 0.012, 0.05, mat);
  gb.box(0.03, 0.01, -0.09, 0.01, 0.01, 0.06, mat, 0.4);
  gb.pop();
}

// Glazing over a gable roof's slopes, as glassRoof in buildings.js lays it,
// but only softly lit of an evening: the galleries under it close at night.
function skylight(c, x, y, z, w, d, h, alongZ, n = 6, lift = 0.03) {
  const { gb } = c;
  gb.push(x, y, z, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  const hd = d / 2, a = Math.atan2(h, hd), L = Math.hypot(hd, h);
  const cz = hd / 2 + Math.sin(a) * lift, cy = h / 2 + Math.cos(a) * lift, pw = w / n;
  gb.glow(0.55, 0.5, 0.4, 1.12);
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) gb.boxC(-w / 2 + (i + 0.5) * pw, cy, s * cz, pw - 0.022, 0.01, L - 0.03, '#a9c4c8', s * a);
  gb.noGlow();
  gb.pop();
}

// A banner hanging down a wall facing the street at z: w × h, its top at y.
function banner(c, x, y, z, w, h, col) {
  const { gb } = c;
  gb.box(x, y - 0.005, z + 0.01, w + 0.03, 0.008, 0.008, IRON);
  gb.box(x, y - h, z + 0.012, w, h, 0.005, col);
  gb.box(x, y - h * 0.3, z + 0.016, w * 0.6, h * 0.06, 0.003, '#efe6c8');
}

// The Law Courts. The Assize Courts: a stone hall of justice behind a
// portico, Justice gilded on its pediment, a courtroom pavilion either
// side and the cells' yard behind a wall. The Royal Courts of Justice: a
// long Gothic front, a great arched doorway between two spired turrets, a
// clock tower at one end and the steep roof of the Great Hall behind.
C.lawcourts = (c, L) => {
  const { gb, pal } = c;
  c.arched = true; c.shutters = null;
  if (L) {
    const wall = ownPick(c, ['#c9b48a', pal.stoneWall, '#b9ab92'], 4), roof = pal.slate;
    const W = 1.72, D = 0.62, H = 0.84, tz = -0.36, fz = tz + D / 2;
    // the great doorway first (the way in)
    door(c, 0, fz + 0.1, 0.14, 0.24, '#4e3424');
    house(c, { z: tz, w: W, d: D, h: H, floors: 3, wall, roof, roofType: 'gable', rh: 0.4, plinth: STONE, fancy: false, noDoor: true, lit: 0.8, nFront: 9, chimney: false });
    gothicTrim(c, 0, tz, W, D, H, 0.4, 6, wall, roof);
    // the entrance bay, its turrets, and a rose window over the arch
    footing(c, 0, fz + 0.05, 0.4, 0.12);
    gb.cbox(0, 0, fz + 0.05, 0.4, H + 0.14, 0.12, wall, 0, 0.008);
    gb.gable(0, H + 0.14, fz + 0.05, 0.4, 0.14, 0.26, wall, roof, 0.02, true);
    gb.arch(0, 0.24, fz + 0.108, 0.09, 0.012, 10, shade(wall, 0.72));
    gb.box(0, 0.24, fz + 0.106, 0.18, 0.01, 0.012, shade(wall, 0.72));
    roseWindow(c, 0, H * 0.72, fz + 0.112, 0.07);
    for (const s of [-1, 1]) {
      gb.cyl(s * 0.22, 0, fz + 0.1, 0.05, 0.055, H + 0.36, 8, shade(wall, 0.92));
      gb.cone(s * 0.22, H + 0.36, fz + 0.1, 0.065, 0.28, 8, roof, Math.PI / 8);
      gb.box(s * 0.22, H + 0.63, fz + 0.1, 0.008, 0.06, 0.008, GOLD);
    }
    // the clock tower at one end, a little forward of the front
    const side = ownPick(c, [-1, 1], 6);
    footing(c, side * 0.66, fz - 0.06, 0.26, 0.26);
    gothicTower(c, side * 0.66, 0, fz - 0.06, 0.26, H + 0.62, 3, wall, roof);
    // the Great Hall behind, its roof running back, a flèche on its ridge
    house(c, { z: -0.72, w: 0.56, d: 0.36, h: H + 0.06, floors: 2, wall, roof, roofType: 'gable', alongZ: true, rh: 0.36, plinth: STONE, fancy: false, noDoor: true, noBack: true, lit: 0.7, chimney: false });
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) stainedGlass(c, s * 0.286, 0.2, -0.82 + i * 0.1, 0.05, 0.42, i, 'r');
    fleche(c, 0, H + 0.06 + 0.36, -0.72, 1.1);
    // the street front: railings, lamps either side of the steps
    for (const s of [-1, 1]) frontRail(c, s * 0.16, s * 0.94, 0.9);
    for (const s of [-1, 1]) { lampStandard(c, s * 0.26, 0.7, 0.34, 'x'); bench(c, s * 0.6, 0.66, Math.PI); }
    for (const s of [-1, 1]) parkTree(c, -side * 0.8, 0.55 + s * 0.17, 0.85, 'lime');
    return;
  }
  const wall = ownPick(c, [ASHLAR, pal.stoneWall, '#d8cfbc'], 3), roof = pal.slate;
  const W = 1.04, D = 0.76, H = 0.74, tz = -0.28, fz = tz + D / 2;
  door(c, 0, fz, 0.14, 0.24, '#3a2f28');
  house(c, { z: tz, w: W, d: D, h: H, floors: 2, wall, roof, roofType: 'hip', rh: 0.2, plinth: STONE, fancy: false, noDoor: true, lit: 0.8, nFront: 5, chimney: false });
  gb.box(0, H - 0.03, tz, W + 0.03, 0.03, D + 0.03, TRIM);
  const apex = templeFront(c, 0, fz, 0.56, H - 0.02, 6, 2, roof);
  justice(c, 0, apex - 0.01, fz + 0.1, 1.2);
  // (its own plan: a dome over the hall behind the portico, or the
  // pavilions' gables to the street under pediments)
  const plan = planOf(c, 3);
  if (plan === 1) {
    gb.cyl(0, H + 0.1, tz - 0.06, 0.2, 0.21, 0.12, 12, wall);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gb.glow(WARM[0], WARM[1], WARM[2], 1.1); gb.box(Math.sin(a) * 0.205, H + 0.13, tz - 0.06 + Math.cos(a) * 0.205, 0.04, 0.06, 0.01, GLASS, a); gb.noGlow(); }
    gb.sphere(0, H + 0.22, tz - 0.06, 0.2, COPPER, 1, 0.8);
    gb.cyl(0, H + 0.38, tz - 0.06, 0.025, 0.03, 0.06, 8, TRIM);
  }
  // a courtroom pavilion either side, lit by a lantern in its roof
  for (const s of [-1, 1]) {
    const x = s * 0.7;
    house(c, { x, z: -0.3, w: 0.36, d: 0.66, h: H - 0.08, floors: 2, wall, roof, roofType: plan === 2 ? 'gable' : 'hip', alongZ: plan === 2, rh: 0.18, plinth: STONE, fancy: false, noDoor: true, lit: 0.75, nFront: 1, chimney: false });
    if (plan === 2) { gb.gable(x, H - 0.075, 0.035, 0.4, 0.03, 0.18, TRIM, TRIM, 0.01, true); continue; }
    gb.box(x, H - 0.11, -0.3, 0.39, 0.03, 0.69, TRIM);
    gb.cbox(x, H - 0.08 + 0.14, -0.3, 0.12, 0.08, 0.12, TRIM, 0, 0.006);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.2);
    gb.box(x, H - 0.08 + 0.16, -0.3, 0.13, 0.04, 0.13, GLASS);
    gb.noGlow();
    gb.hip(x, H - 0.08 + 0.22, -0.3, 0.13, 0.13, 0.05, roof, 0.01);
  }
  // the cells' yard behind a wall at the back
  gb.cbox(0, 0, -0.86, 1.6, 0.14, 0.03, STONE, 0, 0.006);
  // railings along the street, lamps by the steps, bay trees in tubs
  for (const s of [-1, 1]) frontRail(c, s * 0.18, s * 0.94, 0.9);
  for (const s of [-1, 1]) { lampStandard(c, s * 0.38, 0.62, 0.34, 'x'); topiaryShape(c, s * 0.7, 0.5, 1.1, 'ball'); bench(c, s * 0.7, 0.74, Math.PI); }
};

// The Museum: a columned temple front up a flight of steps, a lion either
// side of them, banners for what is on, and the galleries lit from a glass
// roof behind; trees and benches in front. The Museum & Art Gallery is
// rebuilt in terracotta: twin towers either side of a great round arch,
// banded buff and grey, picture galleries either side under glass roofs,
// the lions kept.
C.museum = (c, L) => {
  const { gb, pal } = c;
  c.arched = true; c.shutters = null;
  const roof = pal.slate;
  if (L) {
    const buff = ownPick(c, ['#d9c8a0', '#d6c19a', '#cdbb94'], 4), band = ownPick(c, ['#8f9aa0', '#7f8b8f', '#a08a70'], 5);
    const W = 1.12, D = 0.7, H = 0.84, tz = -0.36, fz = tz + D / 2;
    door(c, 0, fz + 0.08, 0.16, 0.24, '#4e3424');
    house(c, { z: tz, w: W, d: D, h: H, floors: 3, wall: buff, roof, roofType: 'gable', rh: 0.3, plinth: STONE, fancy: false, noDoor: true, lit: 0.8, nFront: 5, chimney: false });
    for (let k = 1; k <= 4; k++) gb.box(0, (k * H) / 5, tz, W + 0.012, 0.02, D + 0.012, band);
    // the great arch, deep in a projecting bay, and the towers either side
    footing(c, 0, fz + 0.05, 0.36, 0.1);
    gb.cbox(0, 0, fz + 0.05, 0.36, H + 0.1, 0.1, buff, 0, 0.008);
    gb.gable(0, H + 0.1, fz + 0.05, 0.36, 0.12, 0.16, buff, roof, 0.02, true);
    gb.arch(0, 0.26, fz + 0.104, 0.1, 0.012, 10, shade(buff, 0.6));
    gb.box(0, 0.0, fz + 0.104, 0.2, 0.26, 0.012, shade(buff, 0.6));
    for (const s of [-1, 1]) {
      const tx = s * 0.3, tzz = fz - 0.02, tw = 0.2, th = H + 0.62;
      footing(c, tx, tzz, tw, tw);
      gb.cbox(tx, 0, tzz, tw, th, tw, buff, 0, 0.01);
      for (let k = 1; k <= 7; k++) gb.box(tx, (k * th) / 8, tzz, tw + 0.01, 0.018, tw + 0.01, band);
      for (const wy of [0.14, 0.78]) win(c, tx, wy, tzz + tw / 2, 0.05, 0.12, 'f', 0.75);
      if (planOf(c, 2)) { gb.cyl(tx, th, tzz, tw * 0.5, tw * 0.55, 0.05, 8, buff); gb.sphere(tx, th + 0.05, tzz, tw * 0.5, COPPER, 1, 1.1); gb.box(tx, th + 0.05 + tw * 0.5, tzz, 0.008, 0.07, 0.008, GOLD); }
      else {
        gb.cone(tx, th, tzz, tw * 0.74, 0.34, 4, roof, Math.PI / 4);
        gb.box(tx, th + 0.32, tzz, 0.008, 0.07, 0.008, GOLD);
      }
    }
    // the picture galleries either side, lit from glass roofs
    for (const s of [-1, 1]) {
      const gx = s * 0.75, gd = 0.86, gz = -0.3, gh = 0.6;
      footing(c, gx, gz, 0.34, gd);
      gb.cbox(gx, 0, gz, 0.34, gh, gd, buff, 0, 0.012);
      for (let k = 1; k <= 3; k++) gb.box(gx, (k * gh) / 4, gz, 0.352, 0.016, gd + 0.012, band);
      gb.gable(gx, gh, gz, 0.36, gd, 0.13, buff, roof, 0.03, true);
      skylight(c, gx, gh, gz, 0.36, gd * 0.8, 0.13, true, 5, 0.03);
      for (const u of [-0.08, 0.08]) win(c, gx + u, 0.14, gz + gd / 2, 0.06, 0.16, 'f', 0.8);
    }
    for (const s of [-1, 1]) { lion(c, s * 0.24, 0.52, BRONZE); banner(c, s * 0.3, 0.64, fz + 0.08, 0.08, 0.28, ownPick(c, ['#8a2a2a', '#2a4a7a', '#2f5a3a'], 8 + s)); }
    for (const s of [-1, 1]) frontRail(c, s * 0.14, s * 0.94, 0.9);
    for (const s of [-1, 1]) { parkTree(c, s * 0.76, 0.56, 0.9, s > 0 ? 'cherry' : 'lime'); bench(c, s * 0.5, 0.74, Math.PI); lamp(c, s * 0.14, 0.82, 0.32); }
    return;
  }
  const wall = ownPick(c, [ASHLAR, '#ddd5c4', pal.stoneWall], 3);
  const W = 1.44, D = 0.8, H = 0.72, tz = -0.3, fz = tz + D / 2;
  door(c, 0, fz, 0.16, 0.26, '#3a2f28');
  house(c, { z: tz, w: W, d: D, h: H, floors: 2, wall, roof, roofType: 'flat', plinth: STONE, fancy: false, noDoor: true, lit: 0.75, nFront: 7, chimney: false });
  gb.box(0, H - 0.03, tz, W + 0.03, 0.03, D + 0.03, TRIM);
  // the galleries' glass roof behind the front, or (its own plan) a dome
  // over the great hall between glazed galleries
  if (planOf(c, 2) === 1) {
    for (const s of [-1, 1]) { gb.gable(s * 0.42, H + 0.045, tz - 0.06, 0.4, 0.5, 0.1, wall, roof, 0.03); skylight(c, s * 0.42, H + 0.045, tz - 0.06, 0.34, 0.5, 0.1, false, 3, 0.03); }
    gb.cyl(0, H + 0.04, tz - 0.06, 0.2, 0.21, 0.14, 12, wall);
    gb.sphere(0, H + 0.18, tz - 0.06, 0.2, LEAD, 1, 0.85);
    gb.cyl(0, H + 0.34, tz - 0.06, 0.03, 0.035, 0.06, 8, TRIM);
  } else {
    gb.gable(0, H + 0.045, tz - 0.06, 0.96, 0.5, 0.12, wall, roof, 0.03);
    skylight(c, 0, H + 0.045, tz - 0.06, 0.8, 0.5, 0.12, false, 6, 0.03);
  }
  balustrade(c, 0, H + 0.045, fz - 0.015, W - 0.02, false, TRIM, 6);
  templeFront(c, 0, fz, 0.86, H - 0.02, 8, 3, roof);
  for (const s of [-1, 1]) banner(c, s * 0.56, H - 0.1, fz, 0.1, 0.36, ownPick(c, ['#8a2a2a', '#2a4a7a', '#2f5a3a', '#7a5a2a'], 8 + s));
  for (const s of [-1, 1]) lion(c, s * 0.3, fz + 0.44);
  for (const s of [-1, 1]) frontRail(c, s * 0.18, s * 0.94, 0.9);
  for (const s of [-1, 1]) { parkTree(c, s * 0.8, 0.62, 0.9, s > 0 ? 'copper' : 'lime'); bench(c, s * 0.56, 0.76, Math.PI); lamp(c, s * 0.18, 0.84, 0.32); }
};

// The Assembly Rooms and the Opera House. The Assembly Rooms: a long
// stuccoed front with the ballroom's tall arched windows aglow upstairs, a
// carriage porch on columns with a balustrade over the door, a Venetian
// window above it and a pediment on the roofline; a carriage waiting. The
// Opera House: an arcaded ground floor, a loggia of paired columns lit
// gold, gilded figures on the attic, a squat copper dome over the
// auditorium and the tall stage house behind with Apollo on its gable;
// candelabra at the steps.
C.operahouse = (c, L) => {
  const { gb, pal } = c;
  c.arched = true; c.shutters = null;
  const roof = pal.slate;
  if (L) {
    const wall = pal.forced ? pal.wall : ownPick(c, ['#e2d6b8', '#ddd0b0', '#e8dcc2'], 3);
    const W = 1.5, D = 0.62, H = 0.92, tz = -0.12, fz = tz + D / 2;
    door(c, 0, fz, 0.14, 0.2, '#5a2a1e');
    footing(c, 0, tz, W, D);
    gb.cbox(0, 0, tz, W, H, D, wall, 0, 0.016);
    gb.cbox(0, -0.03, tz, W + 0.04, 0.06, D + 0.04, STONE, 0, 0.008);
    // the arcade along the street, its doors lit
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + ((i + 0.5) * W) / 7;
      if (i !== 3) { gb.glow(WARM[0], WARM[1], WARM[2], 1.3); gb.box(x, 0.02, fz + 0.004, 0.11, 0.2, 0.01, '#5a3a24'); gb.noGlow(); }
      gb.arch(x, 0.22, fz + 0.004, 0.055, 0.01, 8, '#5a3a24');
    }
    gb.box(0, 0.3, fz, W + 0.01, 0.03, 0.03, TRIM);
    // the loggia: paired columns, lit gold between them
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + ((i + 0.5) * W) / 7;
      gb.glow(2.0, 1.5, 0.6, 1.2);
      gb.box(x, 0.36, fz + 0.002, 0.1, 0.3, 0.008, '#c9963a');
      gb.noGlow();
    }
    for (let i = 0; i <= 7; i++) for (const o of [-0.016, 0.016]) gb.cyl(-W / 2 + (i * W) / 7 + o, 0.33, fz + 0.03, 0.011, 0.012, 0.36, 8, '#e9dcbc');
    gb.box(0, 0.69, fz + 0.01, W + 0.02, 0.04, 0.06, TRIM);
    // the attic: a band of gilded garlands, figures at the ends
    gb.box(0, 0.76, fz + 0.006, W - 0.1, 0.05, 0.008, GOLD);
    gb.box(0, H, tz, W + 0.03, 0.03, D + 0.03, TRIM);
    for (const s of [-1, 1]) { gb.cbox(s * (W / 2 - 0.08), H + 0.03, fz - 0.05, 0.14, 0.07, 0.1, wall, 0, 0.006); skyFigure(c, s * (W / 2 - 0.08), H + 0.1, fz - 0.05, 1.6, GOLD); }
    gb.hip(0, H + 0.03, tz, W - 0.1, D - 0.1, 0.1, COPPER, 0);
    // the auditorium's squat dome, a gilded crown on top
    const tall = planOf(c, 2) === 1, dk = tall ? 0.75 : 0.42;
    gb.cyl(0, H, -0.5, 0.42, 0.44, tall ? 0.18 : 0.12, 18, wall);
    gb.sphere(0, H + (tall ? 0.18 : 0.12), -0.5, 0.42, tall ? LEAD : COPPER, 1, dk);
    gb.cyl(0, H + (tall ? 0.18 : 0.12) + 0.42 * dk - 0.02, -0.5, 0.06, 0.07, 0.06, 10, GOLD);
    gb.sphere(0, H + (tall ? 0.18 : 0.12) + 0.42 * dk + 0.06, -0.5, 0.035, GOLD, 0);
    // the stage house, Apollo raising his lyre on the gable
    const sz = -0.78, sh = H + 0.42;
    footing(c, 0, sz, 1.0, 0.3);
    gb.cbox(0, 0, sz, 1.0, sh, 0.3, wall, 0, 0.012);
    gb.gable(0, sh, sz, 1.02, 0.32, 0.22, wall, COPPER, 0.03, true);
    gb.push(0, sh + 0.22, sz + 0.14);
    gb.cyl(0, 0, 0, 0.018, 0.024, 0.1, 8, GOLD);
    gb.sphere(0, 0.12, 0, 0.018, GOLD, 0);
    gb.box(0, 0.12, 0, 0.05, 0.06, 0.008, GOLD);
    gb.pop();
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) win(c, s * 0.3, 0.3 + k * 0.4, sz - 0.152, 0.07, 0.14, 'b', 0.6);
    // the steps, candelabra and posters
    for (let s = 0; s < 3; s++) gb.box(0, -0.03 + s * 0.02, fz + 0.12 - s * 0.03, W - 0.1 - s * 0.04, 0.02, 0.07, STONE_L);
    for (const s of [-1, 1]) { lampStandard(c, s * 0.42, fz + 0.24, 0.42, 'x'); lampStandard(c, s * 0.84, fz + 0.24, 0.42, 'x'); }
    for (const s of [-1, 1]) for (const k of [0, 1]) gb.box(s * (0.6 + k * 0.1), 0.06, fz + 0.012, 0.07, 0.11, 0.006, ownPick(c, ['#c8423a', '#d8a630', '#3f6a8f', '#7a2a5a'], 9 + s + k * 3));
    for (const s of [-1, 1]) frontRail(c, s * 0.5, s * 0.94, 0.9);
    return;
  }
  const wall = pal.forced ? pal.wall : ownPick(c, ['#efe6d2', '#e8dcc0', '#dfd2b6', '#e6d4c4'], 3);
  const W = 1.56, D = 0.66, H = 0.72, tz = -0.22, fz = tz + D / 2, fh = 0.3;
  door(c, 0, fz, 0.13, 0.2, '#3f4f5a');
  footing(c, 0, tz, W, D);
  gb.cbox(0, 0, tz, W, H, D, wall, 0, 0.016);
  gb.cbox(0, -0.03, tz, W + 0.04, 0.06, D + 0.04, STONE, 0, 0.008);
  gb.box(0, fh - 0.01, fz, W + 0.01, 0.02, 0.012, TRIM);
  gb.box(0, H - 0.03, tz, W + 0.03, 0.03, D + 0.03, TRIM);
  gb.hip(0, H, tz, W + 0.02, D + 0.02, 0.18, roof, 0.03);
  // the ballroom upstairs: tall arched windows, lit all evening
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + ((i + 0.5) * W) / 9;
    if (i === 4) continue;
    win(c, x, fh + 0.05, fz, 0.07, 0.24, 'f', 1);
    if (Math.abs(i - 4) > 1) win(c, x, 0.07, fz, 0.07, 0.13, 'f', 0.8);
  }
  for (let i = 0; i < 7; i++) win(c, -W / 2 + ((i + 0.5) * W) / 7, fh + 0.05, tz - D / 2, 0.07, 0.2, 'b', 0.8);
  for (const s of [-1, 1]) for (const u of [-0.15, 0.15]) win(c, s * (W / 2), fh + 0.05, tz + u, 0.07, 0.2, s > 0 ? 'r' : 'l', 0.9);
  // the Venetian window over the door, and a pediment on the roofline
  win(c, 0, fh + 0.05, fz, 0.08, 0.27, 'f', 1);
  for (const s of [-1, 1]) win(c, s * 0.075, fh + 0.05, fz, 0.04, 0.17, 'f', 1);
  if (planOf(c, 2)) { gb.cbox(0, H + 0.08, tz, 0.16, 0.1, 0.16, wall, 0, 0.008); gb.cyl(0, H + 0.18, tz, 0.07, 0.08, 0.06, 8, TRIM); gb.sphere(0, H + 0.24, tz, 0.075, LEAD, 1, 0.9); gb.box(0, H + 0.31, tz, 0.008, 0.06, 0.008, GOLD); }
  else gb.gable(0, H - 0.01, fz - 0.03, 0.56, 0.08, 0.13, wall, roof, 0.02, true);
  // the carriage porch on four columns, a balustrade on top
  for (const sx of [-1, 1]) for (const zz of [fz + 0.06, fz + 0.34]) gb.cyl(sx * 0.17, 0.02, zz, 0.016, 0.019, 0.27, 8, TRIM);
  gb.cbox(0, 0.29, fz + 0.2, 0.42, 0.035, 0.38, TRIM, 0, 0.006);
  balustrade(c, 0, 0.325, fz + 0.38, 0.4, false, TRIM, 2);
  for (const s of [-1, 1]) balustrade(c, s * 0.2, 0.325, fz + 0.2, 0.34, true, TRIM);
  gb.glow(2.2, 1.6, 0.8, 3.0); gb.box(0, 0.24, fz + 0.2, 0.04, 0.04, 0.04, '#ffe2a0'); gb.noGlow();
  c.addGlow(0, 0.24, fz + 0.2);
  // a carriage waiting, lamps and railings along the street
  coach(c, 0.56, 0.64, -Math.PI / 2, ownPick(c, ['#3f5466', '#5a2a2a', '#2f3a2f'], 7), true);
  for (const s of [-1, 1]) lamp(c, s * 0.28, 0.78, 0.32);
  frontRail(c, -0.94, -0.36, 0.9);
  for (const s of [-1, 1]) topiaryShape(c, s * 0.5, fz + 0.12, 1.0, 'ball');
};
