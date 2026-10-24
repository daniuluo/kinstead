// Building forms: the shape a building takes, beyond its materials. Two
// buildings of the same name and level differ in the form of their roofs
// (gable, hip, half-hip, saltbox, cross gable, mansard, gambrel, flat behind
// a parapet), whether a gable faces the street (plain, crow-stepped, curved or
// Dutch), their dormers, the porch or door case, bay and oriel windows,
// balconies, a corner turret, what stands on the ridge (a cupola, finials, a
// weather vane), and, model by model, their plan: wings, lean-tos, set-backs
// and an extra storey (F.plan, F.tall, F.side).
//
// formOf() picks all of this once per building from its variant alone, so a
// building keeps its form as it is upgraded, on every load and for every
// player. house() (buildings.js) gives the form to the first house a model
// draws (its main body); every house in the model takes the form's roofs.

import { RNG } from '../util/rng.js';
import { shade } from './geo.js';
import { win } from './buildings.js';

const GLASS = '#2f3a44', WARM = [1.7, 1.2, 0.55], IRON = '#2f2c2a', TRIM = '#ece6da', STONE = '#8f877a', TIMBER = '#4e3a2a';

const weighted = (r, table) => { let t = r.next() * table.reduce((a, b) => a + b[1], 0); for (const [k, w] of table) if ((t -= w) <= 0) return k; return table[0][0]; };

// What each style builds like (the palette's style, or the one a player
// chose): the roofs it puts on where a model asks for a gable or a hip, how
// often a gable faces the street and how that gable is finished, its porches,
// balconies and turrets.
const FORMS = {
  // Tudor: gables and cross gables, jettied gables to the street, a gallery
  timber: {
    gable: [['gable', 4], ['crossgable', 3], ['halfhip', 2]], hip: [['hip', 3], ['halfhip', 2], ['gable', 1]], front: 0.42, gables: [['plain', 1]],
    porch: [[null, 2], ['canopy', 2], ['gabled', 3]], balcony: [[null, 5], ['gallery', 1]], turret: [[null, 8], ['oriel', 1], ['square', 1]],
  },
  // limewashed cottage: half-hips and gables, plain porches
  plaster: {
    gable: [['gable', 3], ['halfhip', 3], ['hip', 1], ['saltbox', 1]], hip: [['hip', 3], ['halfhip', 2]], front: 0.25, gables: [['plain', 3], ['curved', 1]],
    porch: [['canopy', 3], ['gabled', 2], ['hood', 1], [null, 1]], balcony: [[null, 6], ['iron', 1]], turret: [[null, 9], ['round', 1]],
  },
  // Georgian and Regency: hips, mansards, parapets, porticos and balconies
  painted: {
    gable: [['gable', 2], ['hip', 3], ['mansard', 2], ['parapet', 1]], hip: [['hip', 4], ['mansard', 2], ['parapet', 1]], front: 0.18, gables: [['plain', 2], ['curved', 2], ['dutch', 1]],
    porch: [['portico', 3], ['hood', 2], ['pediment', 2], ['fanlight', 2]], balcony: [['iron', 3], [null, 2]], turret: [[null, 8], ['round', 1], ['oriel', 1]],
  },
  // Victorian brick: cross gables, Dutch and stepped gables, mansards, turrets
  brick: {
    gable: [['gable', 3], ['crossgable', 3], ['mansard', 1], ['parapet', 1], ['gambrel', 1]], hip: [['hip', 3], ['mansard', 2], ['parapet', 1]], front: 0.4,
    gables: [['plain', 2], ['stepped', 2], ['dutch', 2], ['curved', 1]],
    porch: [['hood', 2], ['fanlight', 2], ['gabled', 2], ['stoop', 2], [null, 1]], balcony: [['iron', 2], [null, 3]], turret: [[null, 5], ['round', 2], ['square', 1], ['oriel', 1]],
  },
  // stone: plain and crow-stepped gables, saltboxes, arched doorways
  stone: {
    gable: [['gable', 4], ['saltbox', 2], ['hip', 1]], hip: [['hip', 3], ['gable', 1], ['mansard', 1]], front: 0.3, gables: [['plain', 3], ['stepped', 2]],
    porch: [['gabled', 2], ['arch', 3], ['canopy', 1], [null, 1]], balcony: [[null, 1]], turret: [[null, 6], ['round', 1], ['square', 2]],
  },
  // clapboard: gambrels and saltboxes, verandas and galleries
  clapboard: {
    gable: [['gable', 3], ['saltbox', 2], ['gambrel', 3]], hip: [['hip', 3], ['gambrel', 1]], front: 0.35, gables: [['plain', 1]],
    porch: [['veranda', 3], ['portico', 2], ['canopy', 2]], balcony: [['gallery', 2], [null, 3]], turret: [[null, 7], ['round', 2]],
  },
  mixed: {
    gable: [['gable', 4], ['crossgable', 2], ['halfhip', 2], ['saltbox', 1], ['mansard', 1], ['gambrel', 1], ['parapet', 1]], hip: [['hip', 4], ['mansard', 1], ['parapet', 1]], front: 0.35,
    gables: [['plain', 3], ['stepped', 1], ['dutch', 1], ['curved', 1]],
    porch: [['canopy', 2], ['gabled', 2], ['hood', 2], ['fanlight', 1], ['portico', 1], ['veranda', 1], [null, 1]], balcony: [['iron', 1], ['gallery', 1], [null, 4]],
    turret: [[null, 7], ['round', 2], ['square', 1], ['oriel', 1]],
  },
};

// A building's form, from its variant (and the style it is built in).
export function formOf(variant, pal) {
  const v = variant >>> 0;
  const own = (salt) => new RNG((v ^ Math.imul(salt * 2 + 1, 0x9e3779b1)) >>> 0);
  const S = FORMS[pal.style] || FORMS.mixed, r = own(101);
  const F = {
    own,
    roofs: { gable: weighted(r, S.gable), hip: weighted(r, S.hip) },
    front: r.chance(S.front) ? 'gable' : 'eaves',
    gable: weighted(r, S.gables),
    dormer: weighted(r, [['gable', 4], ['flat', 2], ['hip', 2], [null, 3]]),
    // a porch: the style's (a style a player chose has one or not, as it says)
    porch: pal.forced ? (pal.porch ? weighted(r, S.porch.filter(([k]) => k)) : null) : r.chance(0.7) ? weighted(r, S.porch) : null,
    bay: pal.forced ? (pal.bay ? weighted(r, [['canted', 2], ['tall', 2]]) : null) : weighted(r, [['canted', 3], ['tall', 2], ['oriel', 1], [null, 4]]),
    balcony: weighted(r, S.balcony),
    turret: weighted(r, S.turret),
    crest: weighted(r, [[null, 3], ['cupola', 2], ['finials', 2], ['vane', 2]]),
    // the model's own choices: which of its plans, a storey more, which side
    // a wing or lean-to goes, and two more for whatever else it varies
    plan: r.int(0, 59),
    tall: r.chance(0.4) ? 1 : 0,
    side: r.chance(0.5) ? 1 : -1,
    a: r.next(),
    b: r.next(),
  };
  // a style a player chose keeps its own roof where it names one
  if (pal.forced && ['halfhip', 'saltbox', 'crossgable'].includes(pal.roofStyle)) F.roofs.gable = pal.roofStyle;
  return F;
}

// One of the model's own plans: n of them, the same at every level.
export const planOf = (c, n, salt = 0) => (c.form ? (salt ? (c.form.plan * 7 + salt * 13) % n : c.form.plan % n) : 0);

// The roof a house gets for the kind a model asks for: a gable or a hip
// becomes the building's own form of it; thatch and flat stay.
export function roofFor(c, kind) {
  const F = c.form;
  if (!F) return kind;
  if (kind === 'gable') return F.roofs.gable;
  if (kind === 'hip') return F.roofs.hip;
  return kind;
}

// ----------------------------------------------------------------- roofs

// A gable roof (as GeoBuilder.gable) whose slabs overhang the ends by endA
// (local -x: the front when the ridge runs back) and endB: a parapet gable
// wants none at its end.
export function gableRoof(c, x, y, z, w, d, h, wall, roof, oh, alongZ, endA = oh, endB = oh, t = 0.035) {
  const { gb } = c;
  gb.push(x, y, z, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  gb.roof(0, 0, 0, w, d, h, w, wall);
  const hd = d / 2, a = Math.atan2(h, hd), L = Math.hypot(hd, h) + oh;
  const cz = (hd + oh * Math.cos(a)) / 2 + (t / 2) * Math.sin(a), cy = (h - oh * Math.sin(a)) / 2 + (t / 2) * Math.cos(a);
  const sw = w + endA + endB, sx = (endB - endA) / 2;
  gb.boxC(sx, cy, cz, sw, t, L, roof, a);
  gb.boxC(sx, cy, -cz, sw, t, L, roof, -a);
  gb.boxC(sx, h + t * 0.4, 0, sw + 0.005, t * 1.1, t * 1.6, shade(roof, 0.85));
  gb.pop();
}

// A mansard: steep lower slopes all round up to a curb, a low hipped top
// over them, a cornice at the eaves. Returns where its steep slope runs (for
// dormers) and its top.
export function mansardRoof(c, w, d, h, rh, roof, trim) {
  const { gb } = c;
  const h1 = rh * 0.78, h2 = Math.max(0.05, rh * 0.3), i = Math.min(h1 * 0.34, Math.min(w, d) * 0.22);
  gb.box(0, h - 0.025, 0, w + 0.045, 0.03, d + 0.045, trim);
  gb.frustum(0, h, 0, w + 0.02, d + 0.02, h1, w - 2 * i, d - 2 * i, roof);
  gb.box(0, h + h1 - 0.008, 0, w - 2 * i + 0.03, 0.016, d - 2 * i + 0.03, shade(roof, 0.8));
  gb.hip(0, h + h1 + 0.008, 0, w - 2 * i, d - 2 * i, h2, shade(roof, 1.08), 0.006);
  return { h1, h2, inset: i, top: h + h1 + h2 };
}

// A gambrel: two slopes a side, the lower steep, the upper low, the gable
// ends in the wall (a barn's roof, a Dutch colonial house). Ridge along x
// (or z when alongZ).
export function gambrelRoof(c, w, d, h, rh, wall, roof, alongZ, oh = 0.05) {
  const { gb } = c;
  gb.push(0, h, 0, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  const hd = d / 2, kz = hd * 0.52, ky = rh * 0.66;
  const prof = [[hd, 0], [kz, ky], [0, rh], [-kz, ky], [-hd, 0]];
  gb.prism(0, 0, 0, w, prof, wall);
  const t = 0.03;
  for (const [p, q, eave] of [[prof[0], prof[1], 1], [prof[1], prof[2], 0], [prof[3], prof[4], 1], [prof[2], prof[3], 0]]) {
    const dz = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dz, dy), nz = dy / len, ny = -dz / len;
    const s = Math.sign((p[0] + q[0]) / 2) || 1, out = [s * Math.abs(nz), Math.abs(ny)];
    const ext = eave ? oh : 0.012;
    // centre of the slab, run out past the eaves on the lower slopes
    const mz = (p[0] + q[0]) / 2 + (eave ? s * (ext / 2) * Math.abs(dz / len) : 0) + out[0] * t / 2;
    const my = (p[1] + q[1]) / 2 - (eave ? (ext / 2) * Math.abs(dy / len) : 0) + out[1] * t / 2;
    gb.boxC(0, my, mz, w + oh * 2, t, len + ext + 0.01, roof, Math.atan2(-dy, dz) + (dz < 0 ? Math.PI : 0));
  }
  gb.boxC(0, rh + t * 0.4, 0, w + oh * 2 + 0.005, t * 1.1, t * 1.6, shade(roof, 0.85));
  gb.pop();
  return { top: h + rh, knee: ky };
}

// A flat roof behind a parapet: a cornice at the top of the walls, the
// parapet round the edge with its coping, the lead roof inside.
export function parapetRoof(c, w, d, h, wall, roof, trim, ph = 0.06) {
  const { gb } = c;
  gb.box(0, h - 0.03, 0, w + 0.04, 0.03, d + 0.04, trim);
  gb.box(0, h - 0.004, 0, w - 0.02, 0.02, d - 0.02, shade(roof, 0.75));
  const t = 0.025;
  for (const s of [-1, 1]) {
    gb.box(0, h, s * (d / 2 - t / 2), w, ph, t, wall);
    gb.box(s * (w / 2 - t / 2), h, 0, t, ph, d, wall);
  }
  gb.box(0, h + ph, 0, w + 0.012, 0.012, d + 0.012, trim);
  gb.box(0, h + ph + 0.004, 0, w - 2 * t, 0.012, d - 2 * t, shade(roof, 0.75));
  return { top: h + ph + 0.012 };
}

// A shaped parapet over a gable facing the street (the front at z, the gable
// w wide and h tall over the eaves at y): crow-stepped, curved with a round
// head, or Dutch with shoulders either side of a pedimented middle.
export function shapedGable(c, kind, z, y, w, h, wall, trim) {
  const { gb } = c, t = 0.026, zc = z + t / 2;
  if (kind === 'stepped') {
    const n = 4;
    for (let k = 0; k < n; k++) {
      const hw = (w / 2) * (1 - k / n) + 0.008, y0 = y + (h * k) / n, sh = h / n + 0.035;
      gb.box(0, y0, zc, hw * 2, sh, t, wall);
      for (const s of [-1, 1]) gb.box(s * (hw - 0.02), y0 + sh, zc, 0.044, 0.01, t + 0.008, trim);
    }
    gb.box(0, y + h + 0.035, zc, 0.04, 0.04, t, wall);
    return y + h + 0.075;
  }
  if (kind === 'dutch') {
    const mw = w * 0.42, sh = h * 0.42;
    gb.box(0, y, zc, w + 0.01, sh, t, wall);
    gb.box(0, y + sh, zc, mw, h - sh + 0.06, t, wall);
    for (const s of [-1, 1]) {
      gb.box(s * (w / 2 - 0.02), y + sh, zc, 0.05, 0.012, t + 0.008, trim);
      gb.arch(s * (mw / 2 + 0.03), y + sh, z, 0.03, t, 6, wall);
    }
    gb.gable(0, y + h + 0.06, zc, mw + 0.02, t + 0.01, 0.045, trim, trim, 0.005);
    return y + h + 0.105;
  }
  // curved: coped shoulders, and a round head rising over the ridge
  const mw = w * 0.36;
  gb.box(0, y, zc, w + 0.01, h * 0.34, t, wall);
  gb.box(0, y + h * 0.34, zc, w * 0.62, h * 0.3, t, wall);
  gb.box(0, y + h * 0.64, zc, mw, h * 0.36, t, wall);
  gb.arch(0, y + h, z, mw / 2, t, 8, wall);
  gb.arch(0, y + h, z - 0.004, mw / 2 + 0.01, t + 0.008, 8, trim);
  return y + h + mw / 2;
}

// ---------------------------------------------------------------- dormers

// Dormers along the front slope of a roof whose eaves stand at z = ez, y = h
// and whose ridge (or curb) is at z = rz, y = ry: n of them over w, gabled,
// hipped or flat-topped (a wider shed dormer), each with its window.
export function dormers(c, kind, n, w, ez, h, rz, ry, wall, roof, lit) {
  const { gb } = c;
  const ww = kind === 'flat' ? Math.min(0.22, (w / n) * 0.7) : 0.12;
  const t = 0.3, zf = ez - (ez - rz) * t, base = h + (ry - h) * t - 0.03, wh = 0.12, dd = 0.14;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n), zc = zf - dd / 2;
    gb.cbox(x, base, zc, ww, wh, dd, wall, 0, 0.01);
    if (kind === 'flat') {
      gb.wedge(x, base + wh, zc - 0.01, ww + 0.03, dd + 0.04, 0.025, roof, 0);
      for (const s of ww > 0.16 ? [-1, 1] : [0]) win(c, x + s * ww * 0.24, base + 0.035, zf, 0.05, 0.065, 'f', lit);
    } else if (kind === 'hip') {
      gb.hip(x, base + wh, zc, ww, dd, 0.06, roof, 0.018);
      win(c, x, base + 0.035, zf, 0.06, 0.07, 'f', lit);
    } else {
      gb.gable(x, base + wh, zc, ww, dd, 0.075, wall, roof, 0.022, true, 0.022);
      win(c, x, base + 0.035, zf, 0.06, 0.07, 'f', lit);
    }
  }
}

// Dormers in the steep slope of a mansard (see mansardRoof): small windows
// under round or pointed heads, along the front.
export function mansardDormers(c, n, w, d, h, M, wall, roof, lit) {
  const { gb } = c;
  const zf = d / 2 - M.inset * 0.35 + 0.01, wh = M.h1 * 0.62;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    gb.box(x, h + 0.012, zf - 0.04, 0.09, wh, 0.08, wall);
    gb.gable(x, h + 0.012 + wh, zf - 0.04, 0.1, 0.08, 0.04, wall, roof, 0.012, true, 0.016);
    win(c, x, h + 0.03, zf, 0.05, Math.min(0.08, wh - 0.03), 'f', lit);
  }
}

// ---------------------------------------------------------------- porches

// The porch or door case at a door (x, z: the wall's face, the door dh
// tall). wall, roof: the house's; w: the width of its front (a veranda
// runs along all of it); y1: how high a veranda's roof may go.
export function porchOf(c, kind, x, z, dh, wall, roof, w, y1) {
  const { gb } = c;
  const trim = c.pal.trim, white = TRIM;
  if (kind === 'canopy') {
    for (const sd of [-1, 1]) gb.box(x + sd * 0.075, 0, z + 0.1, 0.014, 0.2, 0.014, trim);
    gb.wedge(x, 0.2, z + 0.06, 0.2, 0.13, 0.05, roof, 0);
  } else if (kind === 'gabled') {
    for (const sd of [-1, 1]) gb.box(x + sd * 0.075, 0, z + 0.11, 0.016, dh + 0.03, 0.016, c.pal.timber ? TIMBER : trim);
    for (const sd of [-1, 1]) gb.box(x + sd * 0.075, 0.02, z + 0.06, 0.012, 0.05, 0.1, c.pal.timber ? TIMBER : trim);
    gb.gable(x, dh + 0.03, z + 0.06, 0.19, 0.13, 0.07, wall, roof, 0.02, true, 0.02);
  } else if (kind === 'hood') {
    gb.box(x, dh + 0.03, z + 0.035, 0.17, 0.014, 0.07, white);
    for (const sd of [-1, 1]) gb.boxC(x + sd * 0.07, dh + 0.012, z + 0.02, 0.012, 0.03, 0.03, white, 0.6);
  } else if (kind === 'pediment') {
    for (const sd of [-1, 1]) gb.box(x + sd * 0.065, 0, z + 0.008, 0.02, dh + 0.04, 0.02, white);
    gb.box(x, dh + 0.04, z + 0.012, 0.17, 0.02, 0.03, white);
    gb.gable(x, dh + 0.06, z + 0.012, 0.18, 0.03, 0.05, white, white, 0.006);
  } else if (kind === 'fanlight' || kind === 'arch') {
    const r = 0.055;
    gb.arch(x, dh, z - 0.004, r + 0.016, 0.022, 8, kind === 'arch' ? shade(STONE, 1.15) : white);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.1); gb.arch(x, dh, z + 0.002, r - 0.008, 0.02, 8, GLASS); gb.noGlow();
    if (kind === 'arch') for (const sd of [-1, 1]) gb.box(x + sd * 0.064, 0, z + 0.006, 0.024, dh, 0.02, shade(STONE, 1.15));
  } else if (kind === 'portico') {
    for (const sd of [-1, 1]) gb.cyl(x + sd * 0.08, 0.02, z + 0.12, 0.013, 0.015, dh + 0.02, 8, white);
    gb.box(x, dh + 0.04, z + 0.07, 0.21, 0.024, 0.15, white);
    gb.gable(x, dh + 0.064, z + 0.07, 0.21, 0.15, 0.06, white, roof, 0.012);
    gb.cbox(x, -0.02, z + 0.08, 0.24, 0.04, 0.16, STONE, 0, 0.008);
  } else if (kind === 'veranda') {
    const vw = w + 0.02, vd = 0.13, vy = Math.min(y1, 0.24), n = Math.max(2, Math.round(vw / 0.2));
    gb.cbox(0, -0.01, z + vd / 2, vw, 0.025, vd, shade(c.pal.wood, 1.1), 0, 0.006);
    for (let i = 0; i <= n; i++) gb.box(-vw / 2 + 0.01 + (i * (vw - 0.02)) / n, 0.015, z + vd - 0.01, 0.014, vy - 0.015, 0.014, white);
    gb.box(0, 0.075, z + vd - 0.01, vw, 0.008, 0.008, white);
    gb.wedge(0, vy, z + vd / 2, vw + 0.04, vd + 0.04, 0.045, roof, 0);
  } else if (kind === 'stoop') {
    gb.cbox(x, -0.02, z + 0.06, 0.14, 0.035, 0.12, STONE, 0, 0.006);
    gb.cbox(x, -0.02, z + 0.04, 0.14, 0.05, 0.08, STONE, 0, 0.006);
    for (const sd of [-1, 1]) {
      gb.box(x + sd * 0.07, 0.03, z + 0.11, 0.005, 0.07, 0.005, IRON);
      gb.boxC(x + sd * 0.07, 0.085, z + 0.07, 0.005, 0.005, 0.09, IRON, -0.35);
    }
  }
}

// ------------------------------------------------- bays, oriels, balconies

// A bay window the height of two storeys (each fh; or n of them), standing
// out from the front at (x, z), under a little hipped roof; or an oriel on
// the floor over the ground, carried on a corbel.
export function tallBay(c, x, z, fh, floors, wall, roof, lit, oriel = false, n = Math.min(floors, 2), bw = 0.17) {
  const { gb } = c;
  const bd = 0.065, f0 = oriel ? 1 : 0, f1 = oriel ? Math.max(2, n) : n, y0 = oriel ? fh + 0.02 : 0.02, top = f1 * fh - 0.03;
  if (oriel) gb.frustum(x, fh - 0.05, z + bd / 2, 0.03, 0.02, 0.07, bw, bd, shade(wall, 0.85));
  gb.cbox(x, y0, z + bd / 2, bw, top - y0, bd, wall, 0, 0.008);
  gb.hip(x, top, z + bd / 2, bw, bd, 0.05, roof, 0.014);
  for (let f = f0; f < f1; f++) {
    const wy = f * fh + fh * 0.3;
    if (c.rng.chance(lit ?? 0.75)) gb.glow(WARM[0], WARM[1], WARM[2], 1 + c.rng.float(0.02, 0.9)); else gb.noGlow();
    gb.box(x, wy, z + bd + 0.004, bw - 0.05, fh * 0.42, 0.008, GLASS);
    for (const s of [-1, 1]) gb.box(x + s * (bw / 2 + 0.003), wy, z + bd / 2, 0.008, fh * 0.42, bd - 0.025, GLASS);
    gb.noGlow();
  }
}

// An iron balcony (or a timber gallery, the whole front's width) at floor
// height y along the front at z, w long and centred on x.
export function balcony(c, kind, x, y, z, w) {
  const { gb } = c;
  if (kind === 'gallery') {
    const col = shade(c.pal.wood, 0.95);
    gb.box(x, y, z + 0.035, w, 0.014, 0.07, col);
    gb.box(x, y + 0.05, z + 0.068, w, 0.01, 0.01, col);
    const n = Math.max(3, Math.round(w / 0.03));
    for (let i = 0; i <= n; i++) gb.box(x - w / 2 + (i * w) / n, y + 0.014, z + 0.068, 0.006, 0.036, 0.006, col);
    for (const s of [-1, 1]) gb.boxC(x + s * (w / 2 - 0.02), y - 0.03, z + 0.03, 0.012, 0.012, 0.075, col, 0.7);
    return;
  }
  gb.box(x, y, z + 0.028, w, 0.012, 0.056, shade(STONE, 1.15));
  gb.box(x, y + 0.048, z + 0.054, w, 0.006, 0.006, IRON);
  const n = Math.max(3, Math.round(w / 0.022));
  for (let i = 0; i <= n; i++) gb.box(x - w / 2 + (i * w) / n, y + 0.012, z + 0.054, 0.004, 0.036, 0.004, IRON);
  for (const s of [-1, 1]) gb.box(x + s * w / 2, y + 0.012, z + 0.028, 0.004, 0.036, 0.052, IRON);
}

// ---------------------------------------------------------------- turrets

// A turret at a corner (its middle at x, z), from y0 up to top: round under
// a cone, square under a spire, or an oriel turret corbelled out from the
// wall at the first floor. fh: a storey, for its windows.
export function turret(c, kind, x, z, y0, top, r, fh, wall, roof, lit) {
  const { gb, rng } = c;
  const round = kind !== 'square';
  if (y0 > 0.01) gb.cyl(x, y0 - 0.07, z, r, 0.012, 0.07, 8, shade(wall, 0.88));
  if (round) gb.cyl(x, y0, z, r, r, top - y0, 8, wall);
  else gb.cbox(x, y0, z, r * 2, top - y0, r * 2, wall, 0, 0.01);
  gb.cyl(x, top - 0.012, z, r + 0.014, r + 0.014, 0.022, 8, shade(wall, 1.12));
  for (let y = Math.max(y0, 0) + fh * 0.3; y < top - 0.08; y += fh) {
    for (const a of round ? [-0.7, 0.7] : [0]) {
      if (rng.chance(lit ?? 0.75)) gb.glow(WARM[0], WARM[1], WARM[2], 1 + rng.float(0.02, 0.9)); else gb.noGlow();
      gb.box(x + Math.sin(a) * (r + 0.002), y, z + Math.cos(a) * (r + 0.002), 0.036, Math.min(0.08, fh * 0.4), 0.01, GLASS, a);
      gb.noGlow();
    }
    if (!round) for (const s of [-1, 1]) win(c, x + s * (r + 0.001), y, z, 0.04, 0.07, s > 0 ? 'r' : 'l', lit);
  }
  // a cone, a spire, or (kind 'dome') a lead dome under a little lantern
  const cap = kind === 'dome' ? r * 1.15 : round ? r * 2.6 : r * 3;
  if (kind === 'dome') {
    gb.sphere(x, top + 0.01, z, r + 0.012, roof, 1, 0.95);
    gb.cyl(x, top + r * 0.9, z, 0.018, 0.022, r * 0.3, 6, TRIM);
  } else if (round) gb.cone(x, top + 0.01, z, r + 0.022, cap, 8, roof);
  else gb.roof(x, top + 0.01, z, r * 2 + 0.04, r * 2 + 0.04, cap, 0, roof);
  gb.box(x, top + cap, z, 0.008, 0.05, 0.008, IRON);
  gb.sphere(x, top + cap + 0.05, z, 0.01, '#c9a43a', 0);
}

// A gable rising from the front wall (at z) through the eaves: the wall
// carried up w wide from y (the eaves) by h to its apex, a short roof behind
// it running back dd into the main roof, and its window; kind: 'plain', or
// a shaped parapet (see shapedGable).
export function wallGable(c, kind, x, z, w, y, h, dd, wall, roof, trim, lit) {
  const { gb } = c;
  gb.push(x, 0, 0);
  gb.box(0, y - 0.02, z - 0.015, w, 0.03, 0.03, wall);
  if (kind && kind !== 'plain') {
    gableRoof(c, 0, y, z - dd / 2, w, dd, h, wall, roof, 0.03, true, 0.008, 0.03);
    shapedGable(c, kind, z, y - 0.01, w, h, wall, trim);
  } else gb.gable(0, y, z - dd / 2, w, dd, h, wall, roof, 0.03, true, 0.03);
  win(c, 0, y + h * 0.18, z + (kind && kind !== 'plain' ? 0.026 : 0.002), Math.min(0.07, w * 0.35), Math.min(0.09, h * 0.4), 'f', lit);
  gb.pop();
}

// ------------------------------------------------------------- the ridge

// What stands on a roof's ridge (along x, len long, at y over z): a cupola
// with a lead cap, finials at both ends, or a weather vane at one end.
export function crest(c, kind, y, z, len, wall, roof) {
  const { gb } = c;
  if (kind === 'cupola') {
    gb.cbox(0, y - 0.03, z, 0.11, 0.07, 0.11, wall, 0, 0.008);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.04, y + 0.04, z + sz * 0.04, 0.012, 0.07, 0.012, TRIM);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.05); gb.box(0, y + 0.05, z, 0.06, 0.04, 0.06, GLASS); gb.noGlow();
    gb.box(0, y + 0.11, z, 0.12, 0.012, 0.12, TRIM);
    gb.cone(0, y + 0.122, z, 0.075, 0.07, 8, shade(roof, 1.1), Math.PI / 8);
    gb.box(0, y + 0.19, z, 0.006, 0.04, 0.006, IRON);
  } else if (kind === 'finials') {
    for (const s of [-1, 1]) {
      gb.box(s * len / 2, y, z, 0.008, 0.05, 0.008, IRON);
      gb.sphere(s * len / 2, y + 0.052, z, 0.01, IRON, 0);
    }
  } else if (kind === 'vane') {
    const x = len / 2 - 0.02;
    gb.box(x, y, z, 0.006, 0.1, 0.006, IRON);
    gb.box(x, y + 0.075, z, 0.06, 0.004, 0.004, IRON);
    gb.box(x, y + 0.075, z, 0.004, 0.004, 0.06, IRON);
    gb.box(x + 0.012, y + 0.095, z, 0.05, 0.022, 0.004, '#c9a43a');
  }
}
