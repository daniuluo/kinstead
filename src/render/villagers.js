// How the villagers look: little minions. Each is a yellow capsule of a body
// in blue dungarees on short stubby legs, with one big goggle or two on a
// strap round the head; some have a few hairs on top, and they waddle. Work
// shows as small touches over the dungarees (a shopkeeper's apron, a clerk's
// tie, a builder's tool belt and hard hat, a farmhand's neckerchief and straw
// hat) and children are small and round. Each part is one low-poly model
// drawn instanced, hundreds of villagers at a time; every piece of a model is
// painted with one of two colours set per villager (their yellow and their
// blue, say) or a fixed colour of its own.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../util/rng.js';
import { BUILDINGS, servicesOf, tradesOf } from '../defs.js';
import { yearsOf, wealthOf } from '../sim/people.js';

// ------------------------------------------------------------------ sizes
// In model units a grown-up of average height stands 0.15 tall; scaled by
// lk.scale * FIG that is about 0.14 (a storey is about 0.28), most of a front
// door. The body is drawn for that height and stretched to each villager's
// own (lk.tall: short and round to tall and thin), and everything worn on it
// with it; only the goggles keep their shape.
const FIG = 1;
const LEG_L = 0.024;           // hip height
const LEG_X = 0.0125;
const BR = 0.034;              // the body's radius
const BOT = 0.028, TOPC = 0.092;   // centres of its round bottom and top, from the hip
const SH_X = 0.0325, SH_Y = 0.05;  // where the arms join, from the hip
const EYE_Y = 0.09;            // the middle of the goggles, from the hip
const HAND = 0.029;            // shoulder to the middle of the hand
const ARM_OUT = 0.3;           // arms held out from the round body
const SWING = 0.7;             // leg swing at a walk (radians)

// Walking: the legs swing through one step for every π of phase; this is the
// ground covered per radian, so the feet keep pace with the ground.
export const strideLen = (scale) => (2 * LEG_L * scale * FIG * Math.sin(SWING)) / Math.PI * 1.25;

// ---------------------------------------------------------------- colours
const YELLOW = ['#f6d33c', '#f2cb34', '#f8da4c', '#eec332', '#f4cf42', '#fadd5a', '#f0c83a'];
const YELLOW_OLD = ['#ecd47e', '#e6cc6e', '#efd88c', '#e8d084'];
const BLUE = ['#3f6db3', '#3963a6', '#4677bd', '#355f9c', '#4a7dc4', '#33598f', '#4270b0'];
const BLUE_OLD = ['#5a7ca8', '#6a88b0', '#4f6f98'];
const HAIR = ['#222028', '#222028', '#222028', '#2e2622', '#3a2418', '#5a3420'];
const HAIR_BOLD = ['#b8662c', '#7a4fb0', '#3d84c0', '#4f9a52', '#d0608e'];
const HAIR_OLD = ['#ece8e0', '#d4d0c8', '#b4b0a8'];
const IRIS = ['#6a4022', '#7a4a26', '#5a3a20', '#8a5a2a', '#6a5a2a', '#6a4022', '#3a6aa8', '#4a7a3a'];
const BRIGHT = ['#d2493c', '#e8813a', '#79b04f', '#2f8a5e', '#3d93c2', '#4566b4', '#8456ae', '#cf5f92', '#efe0bd', '#9a6038', '#2fa3a0', '#e47670', '#f0a0b8', '#a8c84a'];
const FINE = ['#5a2a72', '#28407a', '#7a1f30', '#1f5f4c', '#9a7428', '#3a3a52', '#6a2a50'];
const SHOES = ['#26262c', '#26262c', '#2e2a28', '#3a2618'];
const CAPS = ['#5a4a3a', '#3a4a5a', '#6a5a3a', '#4a4a4a', '#6a3a2a', '#c8473a', '#3f5fa8'];
const BAGS = ['#8a5a32', '#c8473a', '#3f5fa8', '#2f7d5b', '#9a7428'];
const GLOVE = '#2a2a30', WORK_GLOVE = '#a87a48';
const CREAM = '#f4ecdc', SHIRT = '#f4f0e6', GOLD = '#e0c060';

// What villagers wear for their work, over the dungarees: a touch of the
// trade (the kit, how many wear it, its colours), the hat they favour and how
// many wear it, and how many wear work gloves.
const OUTFIT = {
  farmer: { kit: ['kerchief', 0.75], a: ['#d2493c', '#d2493c', '#3d93c2', '#e8813a', '#2f8a5e'], b: [CREAM], hat: ['straw', 0.6], gloves: 0.4 },
  builder: { kit: ['belt', 1], a: ['#8a5a32', '#6a4426', '#9a6a3a'], b: ['#9a9aa2'], hat: ['hardhat', 0.85], gloves: 0.7 },
  worker: { kit: ['belt', 0.5], a: ['#8a5a32', '#6a4426', '#4a4a50'], b: ['#9a9aa2'], hat: ['cap', 0.45], gloves: 0.6 },
  fisher: { kit: ['kerchief', 0.6], a: ['#2f4a6a', '#d2493c', '#e8813a'], b: [CREAM], hat: ['cap', 0.5], gloves: 0 },
  shop: { kit: ['apron', 0.9], a: [CREAM, CREAM, SHIRT, '#e8dcc0'], b: BRIGHT, hat: null },
  clerk: { kit: ['tie', 1], a: ['#7a1f30', '#28407a', '#1f5f4c', '#3a3a52', '#9a7428'], b: [SHIRT], hat: ['bowler', 0.4] },
  teacher: { kit: ['bowtie', 0.85], a: ['#7a1f30', '#28407a', '#5a2a72', '#1f5f4c'], b: [SHIRT], hat: ['bowler', 0.15] },
  clergy: { kit: ['collar', 1], a: ['#26262c'], b: [SHIRT], hat: null },
  nurse: { kit: ['apron', 1], a: ['#f6f8f8'], b: ['#a8c8e0', '#c8dce8'], hat: null, gloves: 0.5, glove: '#f6f8f8' },
  watch: { kit: ['sash', 1], a: ['#2a3a5c'], b: [GOLD], hat: ['cap', 0.85], hatColor: '#24304a' },
};
const HARDHATS = ['#e8813a', '#efefe6', '#d2493c', '#e8813a'];

// The kind of work clothes a building's staff wear.
const KIND = {
  farm: 'farmer', homestead: 'farmer', orchard: 'farmer',
  builder: 'builder', contractor: 'builder',
  fishery: 'fisher', fishmarket: 'fisher',
  bank: 'clerk', offices: 'clerk', exchange: 'clerk', townhall: 'clerk', capitol: 'clerk', parliament: 'clerk', lawcourts: 'clerk', museum: 'teacher', postoffice: 'clerk', station: 'clerk',
  library: 'teacher', musichall: 'shop',
  watch: 'watch', watchhouse: 'watch', firestation: 'watch',
};
function kindOfType(type) {
  if (KIND[type]) return KIND[type];
  const def = BUILDINGS[type];
  if (!def) return null;
  if (def.shop || def.leisure) return 'shop';
  const sv = servicesOf(def);
  if (sv.includes('education')) return 'teacher';
  if (sv.includes('culture')) return 'clergy';
  if (sv.includes('health')) return 'nurse';
  if (sv.includes('safety')) return 'watch';
  if (def.cat === 'industry' || def.cat === 'utilities') return 'worker';
  return null;
}

// What a villager wears depends on their work and how well off they are:
// { kind, rich }. (Looked up again each morning, so a new job shows.)
export function dressOf(world, r) {
  let kind = null;
  if (r.age === 'adult' && r.job != null) {
    const b = world.buildings.get(r.job);
    kind = b ? kindOfType(b.type) : null;
  }
  const home = r.home != null ? world.buildings.get(r.home) : null;
  const rich = r.age !== 'child' && ((home && BUILDINGS[home.type] && BUILDINGS[home.type].spacious && home.type !== 'flats') || wealthOf(r) > 450);
  return { kind, rich: !!rich };
}

// A little hair, or none, by age (weights).
const HAIRDOS = {
  adult: { bald: 4, sprouts: 3, tuft: 1.6, combed: 1.6, mop: 1, sprig: 1.2 },
  child: { bald: 2, sprouts: 3, tuft: 2, mop: 2, sprig: 1.5 },
  elder: { bald: 5, sprouts: 2, sprig: 2, combed: 1 },
};

function weighted(g, table) {
  let sum = 0;
  for (const k in table) sum += table[k];
  let x = g.next() * sum;
  for (const k in table) if ((x -= table[k]) <= 0) return k;
  return Object.keys(table)[0];
}
// colours are shared between villagers (read, never changed)
const COLS = new Map();
const col = (hex) => { let c = COLS.get(hex); if (!c) COLS.set(hex, c = new THREE.Color(hex)); return c; };

// A villager's look, fixed for life by their seed (r.look). dress: from
// dressOf() (hired hands pass { kind: 'builder' }).
export function lookOf(r, dress = null) {
  const g = new RNG(r.look >>> 0);
  const age = r.age === 'child' || r.age === 'elder' ? r.age : 'adult';
  const child = age === 'child', elder = age === 'elder';
  // the first draws are the ones villagers always had, in the same order, so
  // everyone keeps their size, pace and place on the pavement
  const uSkin = g.next(), uHair = g.next(), uTop = g.next(), uPants = g.next();
  const hatRoll = g.chance(child ? 0.1 : 0.32);
  if (hatRoll) g.next();
  const scale = child ? 0.5 + Math.min(1, yearsOf(r) / 17) * 0.3 : elder ? 0.86 : 0.88 + g.next() * 0.08;
  // (how far right of the middle of the road they walk: at its edge, clear
  // of the coaches and carts, short of the fronts of the houses)
  const lane = 0.26 + g.next() * 0.04;
  const speed = (elder ? 0.72 : child ? 1.15 : 1) * (0.9 + g.next() * 0.2);
  // ...and the rest from a stream of their own: first the body, which a new
  // job leaves alone...
  const h = new RNG(((r.look >>> 0) ^ 0x5bd1e995) >>> 0);
  const pick = (arr, u = h.next()) => arr[Math.floor(u * arr.length) % arr.length];
  const tall = child ? 0.8 + h.next() * 0.12 : elder ? 0.86 + h.next() * 0.14 : 0.86 + h.next() * 0.28;
  const eyes = h.chance(0.4) ? 'one' : 'two';
  const hair = weighted(h, HAIRDOS[age]);
  const hairC = elder ? pick(HAIR_OLD) : h.chance(0.06) ? pick(HAIR_BOLD) : pick(HAIR, uHair);
  const iris = pick(IRIS);
  // ...then what they wear: work kit for the grown-ups who have it, else
  // now and then a neckerchief or a bow tie of their own
  const kind = (dress && dress.kind) || null, rich = !!(dress && dress.rich);
  const o = kind && !child ? OUTFIT[kind] : null;
  let kit = null;
  if (o) { if (o.kit && h.next() < o.kit[1]) kit = { kind: o.kit[0], a: col(pick(o.a, uTop)), b: col(pick(o.b)) }; }
  else if (rich && h.chance(0.6)) kit = { kind: 'bowtie', a: col(pick(FINE, uTop)), b: col(SHIRT) };
  else if (h.chance(0.14)) kit = child ? { kind: 'bowtie', a: col(pick(BRIGHT, uTop)), b: col(SHIRT) } : { kind: 'kerchief', a: col(pick(BRIGHT, uTop)), b: col(CREAM) };
  const glove = o && o.gloves && h.chance(o.gloves) ? o.glove || WORK_GLOVE : GLOVE;

  // hats: work hats, then the villager's own (as many as always wore one)
  let hat = null;
  const roll = h.next();
  if (o && o.hat && roll < o.hat[1]) hat = o.hat[0];
  else if (!o && hatRoll) hat = child ? (h.chance(0.5) ? 'straw' : 'cap') : rich ? (h.chance(0.5) ? 'top' : 'bowler') : pick(['cap', 'cap', 'bowler', 'straw']);
  const hatA = hat === 'straw' ? '#e3c06a' : hat === 'cap' ? (o && o.hatColor) || pick(CAPS) : hat === 'top' ? '#1f1f24' : hat === 'hardhat' ? pick(HARDHATS) : hat ? pick(['#2a2a2e', '#4a3226']) : null;
  const hatB = hat === 'straw' ? pick(BRIGHT) : hat === 'top' ? pick(FINE) : hat === 'bowler' ? '#151518' : hat === 'hardhat' ? '#3a3a40' : hat ? '#26262c' : null;

  return {
    age, child, elder, kind, rich, scale, lane, speed, tall, eyes, hair: hair === 'bald' ? null : hair,
    skin: col(pick(elder ? YELLOW_OLD : YELLOW, uSkin)), blue: col(pick(elder ? BLUE_OLD : BLUE, uPants)),
    hairC: col(hairC), iris: col(iris), shoe: col(pick(SHOES)), glove: col(glove),
    kit, hat: hat ? { kind: hat, a: col(hatA), b: col(hatB) } : null,
    // winter woollies: a scarf for most, a knitted hat for those without one
    scarf: h.chance(0.8) ? col(pick(BRIGHT)) : null, scarfB: col(h.chance(0.5) ? '#f2ede2' : pick(BRIGHT)),
    beanie: h.chance(child ? 0.85 : 0.6) ? { kind: 'beanie', a: col(pick(BRIGHT)), b: col(h.chance(0.6) ? '#f2ede2' : pick(BRIGHT)) } : null,
    cane: elder && h.chance(0.35),
    bag: col(pick(BAGS)),
    // how they move: a waddle; little ones skip, the old take it slowly
    gait: SWING * (child ? 1.15 : elder ? 0.7 : 1),
    hop: (child ? 0.3 : elder ? 0.08 : 0.2) * LEG_L,
    squash: child ? 0.09 : elder ? 0.03 : 0.065,
    stoop: elder ? 0.14 : 0,
  };
}

// What a villager carries away from a shop: a basket of food or a parcel.
const GOODS = { provisions: '#d9a55a', bread: '#c8843a', greens: '#6aa84f', meat: '#c85a50', fish: '#9ab0bc' };
const PARCELS = new Set(['clothes', 'shoes', 'hardware', 'medicine', 'books', 'post']);
export function carryFrom(A, r, day = 0) {
  if (!A || !r || r.age === 'child' || A.id === r.job) return null;
  const trades = tradesOf(A);
  if (!trades.length) return null;
  const t = trades[(r.id + day) % trades.length];
  if (GOODS[t]) return { kind: 'basket', c: col(GOODS[t]) };
  if (PARCELS.has(t)) return { kind: 'parcel', c: null };
  return null;
}

// ------------------------------------------------------------------ models
const _c = new THREE.Color();
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

// One piece of a model, painted 'A' or 'B' (the villager's own colours) or
// a fixed colour.
function piece(geo, paint, m) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const pal = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  const k = paint === 'A' ? 0 : paint === 'B' ? 1 : 2;
  if (k === 2) _c.set(paint);
  for (let i = 0; i < n; i++) {
    pal[i * 3 + k] = 1;
    if (k === 2) { colr[i * 3] = _c.r; colr[i * 3 + 1] = _c.g; colr[i * 3 + 2] = _c.b; }
  }
  g.setAttribute('pal', new THREE.BufferAttribute(pal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  return g;
}
// a cylinder standing on y (seg sides, a flat side facing forward)
const cyl = (rt, rb, h, seg, paint, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  piece(new THREE.CylinderGeometry(rt, rb, h, seg, 1, false, Math.PI / seg).translate(0, h / 2, 0), paint, T(x, y, z, rx, ry, rz));
// part of a cylinder's wall (open), from angle a0 round by al (0 = forward)
const wall = (r, h, seg, a0, al, paint, x = 0, y = 0, z = 0) =>
  piece(new THREE.CylinderGeometry(r, r, h, seg, 1, true, a0, al).translate(0, h / 2, 0), paint, T(x, y, z));
// a sphere (or a cap of one, theta from the top), squashed by s and turned
// by rot; a flat facet faces forward
function ball(r, ws, hs, paint, at, s = [1, 1, 1], rot = [0, 0, 0], theta = [0, Math.PI], phi = null) {
  const geo = new THREE.SphereGeometry(r, ws, hs, phi ? phi[0] : Math.PI / 2 - Math.PI / ws, phi ? phi[1] : Math.PI * 2, theta[0], theta[1]);
  return piece(geo, paint, T(at[0], at[1], at[2], rot[0], rot[1], rot[2], s[0], s[1], s[2]));
}
// an open tube round the body's axis, from y up by h (lined up with cyl()'s sides)
const tube = (r, h, seg, paint, y) => wall(r, h, seg, Math.PI / seg, Math.PI * 2, paint, 0, y, 0);
const box = (w, h, d, paint, x, y, z, rx = 0, ry = 0, rz = 0) => piece(new THREE.BoxGeometry(w, h, d), paint, T(x, y, z, rx, ry, rz));
const cone = (r, h, seg, paint, x, y, z, rx = 0, ry = 0, rz = 0) => piece(new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0), paint, T(x, y, z, rx, ry, rz));
function model(pieces) {
  const g = mergeGeometries(pieces.flat(Infinity), false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
// a box on the body's round side at angle a (0 = forward), r out from the
// middle, facing out
const onSide = (w, h, d, paint, a, r, y) => box(w, h, d, paint, Math.sin(a) * r, y, Math.cos(a) * r, 0, a);

const RIM = '#b9bec6', STRAP = '#2a2a30', WHITE = '#f6f6f2', PUPIL = '#18181c', MOUTH = '#5a2418';

// A leg hangs from the hip (y = 0) to the ground: dungarees (A), shoe (B).
const LEG = () => model([
  cyl(0.0094, 0.0098, LEG_L, 7, 'A', 0, -LEG_L + 0.005, 0),
  ball(0.0105, 7, 4, 'B', [0, -LEG_L, 0.003], [0.9, 0.85, 1.22], [0, 0, 0], [0, Math.PI / 2]),
]);
// An arm hangs from the shoulder: bare yellow (A), a glove (B).
const ARM = () => model([
  ball(0.0062, 6, 4, 'A', [0, 0, 0]),
  cyl(0.0052, 0.0058, 0.022, 6, 'A', 0, -0.022, 0),
  ball(0.0074, 6, 4, 'B', [0, -HAND, 0], [1, 1.1, 1]),
]);

// The body, from the hip up: colour A the villager's yellow, B their
// dungarees. Its round bottom and the legs of the dungarees, the yellow body
// and its round top, the bib and its straps, and a little smile. (Kept to
// fewer triangles than the figures before them: thousands are drawn.)
const BODY = () => model([
  ball(BR * 1.03, 10, 3, 'B', [0, BOT, 0], [1, 1, 1], [0, 0, 0], [Math.PI / 2, Math.PI / 2]),
  tube(BR * 1.03, 0.014, 10, 'B', BOT),
  tube(BR, TOPC - BOT, 10, 'A', BOT),
  ball(BR, 10, 4, 'A', [0, TOPC, 0], [1, 1, 1], [0, 0, 0], [0, Math.PI / 2]),
  wall(BR * 1.035, 0.018, 6, -0.6, 1.2, 'B', 0, 0.04, 0),
  [-0.46, 0.46].map(a => onSide(0.0048, 0.014, 0.0025, 'B', a, BR * 1.02, 0.0645)),
  box(0.011, 0.0026, 0.003, MOUTH, 0, 0.066, BR - 0.0008),
]);

// The goggles, round the body at eye height (y = 0): the strap, and for each
// eye a silver rim, the white of the eye, its iris (A) and the pupil, all
// looking ahead.
function goggle(r, a) {
  const d = BR - 0.005, dep = 0.0105, x = Math.sin(a), z = Math.cos(a);
  const disc = (k, rad, seg, paint) => piece(new THREE.CircleGeometry(rad, seg), paint, T(x * k, 0, z * k, 0, a));
  return [
    cyl(r, r, dep, 8, RIM, x * d, 0, z * d, Math.PI / 2, a),
    disc(d + dep + 0.0004, r * 0.72, 8, WHITE),
    disc(d + dep + 0.0008, r * 0.36, 6, 'A'),
    disc(d + dep + 0.0012, r * 0.17, 5, PUPIL),
  ];
}
const strapRing = () => tube(BR * 1.07, 0.0075, 10, STRAP, -0.00375);
const EYES = {
  one: () => model([strapRing(), goggle(0.0165, 0)]),
  two: () => model([strapRing(), goggle(0.0128, -0.42), goggle(0.0128, 0.42)]),
};

// Hair, a little of it, on the crown (in the body's frame; colour A): thin
// hairs sprouting from the top `off` out towards angle a, leaning out by tilt.
const CROWN = TOPC + BR;
// (each a thin open cone of three sides)
const hair1 = (len, r, x, y, z, rx, rz) => piece(new THREE.ConeGeometry(r, len, 3, 1, true).translate(0, len / 2, 0), 'A', T(x, y, z, rx, 0, rz));
function strand(len, a, tilt, off, r = 0.0016) {
  const x = Math.sin(a) * off, z = Math.cos(a) * off;
  return hair1(len, r, x, TOPC + Math.sqrt(BR * BR - off * off) - 0.002, z, tilt * Math.cos(a), -tilt * Math.sin(a));
}
const HAIR_STYLES = {
  sprouts: () => model([
    strand(0.017, 0, 0.15, 0.002), strand(0.015, 1.3, 0.45, 0.007), strand(0.015, -1.2, 0.5, 0.007),
    strand(0.014, 2.6, 0.4, 0.008), strand(0.013, -2.4, 0.55, 0.009), strand(0.014, 0.5, 0.6, 0.011),
  ]),
  tuft: () => model([
    cone(0.0042, 0.013, 4, 'A', 0, CROWN - 0.003, 0.006, 0.5),
    cone(0.0038, 0.011, 4, 'A', -0.005, CROWN - 0.003, 0.003, 0.35, 0, 0.35),
    cone(0.0038, 0.011, 4, 'A', 0.005, CROWN - 0.003, 0.003, 0.35, 0, -0.35),
    cone(0.0034, 0.01, 4, 'A', 0, CROWN - 0.003, -0.002, 0.1),
  ]),
  combed: () => model([ball(BR * 1.045, 10, 2, 'A', [0, TOPC, 0], [1, 1, 1], [-0.15, 0, 0.22], [0, 0.72])]),
  mop: () => model([
    ball(BR * 1.07, 10, 3, 'A', [0, TOPC + 0.001, -0.002], [1, 0.95, 1], [-0.22, 0, 0], [0, 0.9]),
    cone(0.005, 0.008, 4, 'A', -0.008, CROWN - 0.0005, 0.004, 0.3, 0, 0.4),
    cone(0.005, 0.008, 4, 'A', 0.007, CROWN - 0.0005, 0.006, 0.4, 0, -0.3),
    cone(0.005, 0.008, 4, 'A', 0, CROWN - 0.0005, -0.006, -0.3),
  ]),
  // one hair standing up with a curl at the end
  sprig: () => model([
    strand(0.02, 0, 0.12, 0.002, 0.0016),
    hair1(0.009, 0.0014, 0, CROWN + 0.0175, 0.004, 1.5, 0),
  ]),
};

// Hats sit on the round top (in the body's frame): colour A the hat, B the
// band, button or bobble.
const HATS = {
  straw: () => model([
    cyl(0.05, 0.05, 0.004, 12, 'A', 0, 0.112, 0, -0.1),
    cyl(0.027, 0.0305, 0.02, 10, 'A', 0, 0.113, 0, -0.1),
    cyl(0.031, 0.031, 0.0055, 10, 'B', 0, 0.1145, 0, -0.1),
  ]),
  cap: () => model([
    ball(0.0366, 10, 4, 'A', [0, 0.108, 0], [1, 0.62, 1.03], [0, 0, 0], [0, Math.PI / 2]),
    box(0.03, 0.0035, 0.017, 'A', 0, 0.109, 0.036, 0.15),
    ball(0.0038, 5, 3, 'B', [0, 0.131, 0]),
  ]),
  bowler: () => model([
    cyl(0.043, 0.043, 0.003, 12, 'A', 0, 0.111, 0),
    ball(0.0295, 10, 4, 'A', [0, 0.112, 0], [1, 1.15, 1], [0, 0, 0], [0, Math.PI / 2]),
    cyl(0.03, 0.03, 0.005, 10, 'B', 0, 0.112, 0),
  ]),
  top: () => model([
    cyl(0.043, 0.043, 0.003, 12, 'A', 0, 0.112, 0),
    cyl(0.026, 0.025, 0.044, 10, 'A', 0, 0.112, 0),
    cyl(0.0265, 0.0265, 0.007, 10, 'B', 0, 0.114, 0),
  ]),
  hardhat: () => model([
    cyl(0.044, 0.044, 0.003, 12, 'A', 0, 0.108, 0),
    ball(0.0362, 12, 4, 'A', [0, 0.108, 0], [1, 0.82, 1.02], [0, 0, 0], [0, Math.PI / 2]),
    box(0.006, 0.004, 0.03, 'A', 0, 0.1355, 0),
  ]),
  beanie: () => model([
    ball(0.0375, 12, 4, 'A', [0, TOPC, 0], [1, 1, 1], [0, 0, 0], [0, 0.95]),
    cyl(0.0312, 0.0312, 0.0075, 12, 'B', 0, 0.1085, 0),
    ball(0.0085, 6, 4, 'B', [0, 0.132, 0]),
  ]),
};

// Touches of their trade over the dungarees (in the body's frame).
const collarRing = (paint, r = BR * 1.02) => tube(r, 0.0045, 10, paint, 0.0565);
const KITS = {
  // a shopkeeper's or a nurse's apron (A) over the bib, tied with a band (B)
  apron: () => model([
    wall(BR * 1.06, 0.044, 8, -0.75, 1.5, 'A', 0, -0.004, 0),
    wall(BR * 1.055, 0.02, 5, -0.45, 0.9, 'A', 0, 0.039, 0),
    tube(BR * 1.065, 0.004, 10, 'B', 0.038),
  ]),
  // a white collar (B) and a tie (A)
  tie: () => model([
    collarRing('B'),
    box(0.0065, 0.026, 0.0025, 'A', 0, 0.045, BR * 1.035 + 0.0028),
    box(0.0075, 0.0055, 0.003, 'A', 0, 0.0585, BR * 1.02 + 0.002),
  ]),
  // a white collar (B) and a bow tie (A)
  bowtie: () => model([
    collarRing('B'),
    box(0.008, 0.0068, 0.003, 'A', -0.0048, 0.0585, BR * 1.02 + 0.002, 0, 0, 0.3),
    box(0.008, 0.0068, 0.003, 'A', 0.0048, 0.0585, BR * 1.02 + 0.002, 0, 0, -0.3),
    box(0.0032, 0.0042, 0.0035, 'A', 0, 0.0585, BR * 1.02 + 0.0028),
  ]),
  // a neckerchief (A) knotted at the side (B)
  kerchief: () => model([
    collarRing('A', BR * 1.03),
    piece(new THREE.ConeGeometry(0.0105, 0.017, 3).translate(0, 0.0085, 0), 'A', T(0, 0.0605, BR * 1.04 + 0.001, Math.PI, 0, 0, 1, 1, 0.3)),
    ball(0.0042, 5, 3, 'B', [BR * 0.75, 0.059, BR * 0.72]),
  ]),
  // a clergyman's collar (A) with its white tab (B)
  collar: () => model([
    collarRing('A', BR * 1.025),
    box(0.0062, 0.0042, 0.003, 'B', 0, 0.0588, BR * 1.025 + 0.0015),
  ]),
  // a tool belt (A) with a pouch, a buckle and a spanner (B)
  belt: () => model([
    tube(BR * 1.065, 0.0065, 10, 'A', 0.03),
    onSide(0.012, 0.014, 0.008, 'A', 1.9, BR * 1.1, 0.026),
    onSide(0.006, 0.0055, 0.002, 'B', 0, BR * 1.065 + 0.0006, 0.0333),
    onSide(0.003, 0.018, 0.003, 'B', -1.7, BR * 1.09, 0.022),
  ]),
  // the watch's cross-belt (A) and badge (B)
  sash: () => model([
    piece(new THREE.CylinderGeometry(BR * 1.06, BR * 1.06, 0.0065, 12, 1, true).translate(0, -0.00325, 0), 'A', T(0, 0.05, 0, 0, 0, 0.55)),
    box(0.0068, 0.0078, 0.0022, 'B', -0.011, 0.05, rbOf(-0.011) + 0.0008),
  ]),
};
// how far out the bib is at x across
function rbOf(x) { const r = BR * 1.035; return Math.sqrt(r * r - x * x); }

// A knitted scarf round the body under the smile (A), with a stripe (B).
const SCARF = () => model([
  cyl(BR * 1.07, BR * 1.09, 0.0095, 10, 'A', 0, 0.052, 0),
  tube(BR * 1.1, 0.003, 10, 'B', 0.0555),
  box(0.008, 0.022, 0.004, 'A', 0.012, 0.043, BR * 1.06 + 0.002, -0.12),
  box(0.0085, 0.003, 0.0045, 'B', 0.012, 0.037, BR * 1.06 + 0.0025, -0.12),
]);
// Things held: tools in the right hand (in the arm's frame, hand at y = -HAND);
// baskets, lanterns and walking sticks hang upright from the hand; a parcel
// and a satchel go with the body.
// a handle through the hand, leaning at angle a in the arm's frame (0 points
// up the arm, π down it), from `back` behind the hand to `ahead` beyond it
const grip = (a) => [Math.cos(a), Math.sin(a)];
function handle(a, back, ahead, r, paint) {
  const [dy, dz] = grip(a);
  return cyl(r, r, back + ahead, 5, paint, 0, -HAND - back * dy, -back * dz, a);
}
const atHandle = (a, d) => { const [dy, dz] = grip(a); return [-HAND + d * dy, d * dz]; };
const HAMMER_A = 2.69, HOE_A = 2.84;
const PROPS = {
  hammer: () => model([
    handle(HAMMER_A, 0.007, 0.03, 0.0024, '#8a5a32'),
    box(0.0068, 0.009, 0.019, '#6a6a72', 0, ...atHandle(HAMMER_A, 0.027), HAMMER_A),
  ]),
  hoe: () => model([
    handle(HOE_A, 0.03, 0.085, 0.0022, '#9a6a3a'),
    box(0.018, 0.0032, 0.013, '#7a7a82', 0, ...atHandle(HOE_A, 0.083), HOE_A + 0.5),
  ]),
  basket: () => model([
    cyl(0.0125, 0.0095, 0.012, 7, '#b0844a', 0, -0.02, 0),
    ball(0.0105, 6, 3, 'A', [0, -0.0085, 0], [1, 0.55, 1], [0, 0, 0], [0, Math.PI / 2]),
    piece(new THREE.TorusGeometry(0.0105, 0.0014, 4, 8, Math.PI), '#8a6436', T(0, -0.0085, 0)),
  ]),
  parcel: () => model([
    box(0.05, 0.022, 0.018, '#c8a070', 0, 0.038, BR + 0.009),
    box(0.0512, 0.0025, 0.0185, '#efe6d2', 0, 0.038, BR + 0.009),
    box(0.0025, 0.0225, 0.0185, '#efe6d2', 0, 0.038, BR + 0.009),
  ]),
  lantern: () => model([
    cyl(0.001, 0.001, 0.005, 4, '#3a3a40', 0, -0.006, 0),
    cone(0.0072, 0.005, 6, '#3a3a40', 0, -0.0095, 0),
    cyl(0.0058, 0.0058, 0.011, 6, '#ffe39a', 0, -0.0205, 0),
    cyl(0.0068, 0.0068, 0.0025, 6, '#3a3a40', 0, -0.0225, 0),
  ]),
  cane: () => model([
    cyl(0.0022, 0.0022, 0.044, 5, '#6a4426', 0, -0.044, 0.002, 0.08),
    piece(new THREE.TorusGeometry(0.004, 0.0021, 4, 6, Math.PI), '#6a4426', T(0, 0, 0.004, 0, Math.PI / 2)),
  ]),
  satchel: () => model([
    box(0.026, 0.022, 0.009, 'A', 0, 0.045, -BR - 0.004),
    box(0.027, 0.009, 0.0105, 'B', 0, 0.054, -BR - 0.004),
    box(0.004, 0.046, 0.003, 'B', 0, 0.046, BR * 1.035 + 0.0035, 0, 0, 0.75),
  ]),
};

// ----------------------------------------------------------------- drawing
// colour = pal.x * colour A + pal.y * colour B + pal.z * the piece's own colour
function villagerMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 pal;\nattribute vec3 colA;\nattribute vec3 colB;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = pal.x * colA + pal.y * colB + pal.z * vColor.rgb;');
  };
  m.customProgramCacheKey = () => 'villager';
  return m;
}

// One instanced model and its per-villager colours.
class Part {
  constructor(geo, mat, max, scene) {
    this.max = max;
    this.n = 0;
    this.a = new Float32Array(max * 3);
    this.b = new Float32Array(max * 3);
    this.colA = new THREE.InstancedBufferAttribute(this.a, 3).setUsage(THREE.DynamicDrawUsage);
    this.colB = new THREE.InstancedBufferAttribute(this.b, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('colA', this.colA);
    geo.setAttribute('colB', this.colB);
    const m = this.mesh = new THREE.InstancedMesh(geo, mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = false; m.receiveShadow = false;
    m.frustumCulled = false;
    m.count = 0; m.visible = false;
    scene.add(m);
  }

  // one villager's copy, placed by frame F (see below)
  put(F, A, B) {
    const i = this.n;
    if (i >= this.max) return;
    this.n++;
    writeF(F, this.mesh.instanceMatrix.array, i * 16);
    const k = i * 3;
    if (A) { this.a[k] = A.r; this.a[k + 1] = A.g; this.a[k + 2] = A.b; }
    if (B) { this.b[k] = B.r; this.b[k + 1] = B.g; this.b[k + 2] = B.b; }
  }

  flush() {
    const m = this.mesh, n = this.n;
    m.count = n;
    m.visible = n > 0;
    if (n) {
      for (const [attr, size] of [[m.instanceMatrix, 16], [this.colA, 3], [this.colB, 3]]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, n * size);
        attr.needsUpdate = true;
      }
    }
    this.n = 0;
  }

  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

// Posing frames: a part's own x, y and z axes in the world (scaled with the
// villager) and its origin, twelve numbers, moved and turned about their own
// axes. Cheaper than matrices for the thousands of parts posed each frame.
const frame = () => new Float64Array(12);
function copyF(d, s) {
  d[0] = s[0]; d[1] = s[1]; d[2] = s[2]; d[3] = s[3]; d[4] = s[4]; d[5] = s[5];
  d[6] = s[6]; d[7] = s[7]; d[8] = s[8]; d[9] = s[9]; d[10] = s[10]; d[11] = s[11];
  return d;
}
function move(f, x, y, z) {
  f[9] += f[0] * x + f[3] * y + f[6] * z;
  f[10] += f[1] * x + f[4] * y + f[7] * z;
  f[11] += f[2] * x + f[5] * y + f[8] * z;
  return f;
}
// cos and sin, by a short series for the small angles of most leans, nods and
// swings (good to 1e-4 below 0.7 radians, and much quicker)
const cosA = (a) => { if (a > 0.7 || a < -0.7) return Math.cos(a); const q = a * a; return 1 - q / 2 + q * q / 24 - q * q * q / 720; };
const sinA = (a) => { if (a > 0.7 || a < -0.7) return Math.sin(a); const q = a * a; return a * (1 - q / 6 + q * q / 120); };
function turnX(f, a) {
  if (!a) return f;
  const c = cosA(a), s = sinA(a);
  for (let k = 0; k < 3; k++) { const y = f[3 + k], z = f[6 + k]; f[3 + k] = y * c + z * s; f[6 + k] = z * c - y * s; }
  return f;
}
function turnZ(f, a) {
  if (!a) return f;
  const c = cosA(a), s = sinA(a);
  for (let k = 0; k < 3; k++) { const x = f[k], y = f[3 + k]; f[k] = x * c + y * s; f[3 + k] = y * c - x * s; }
  return f;
}
function scaleF(f, sx, sy, sz) {
  for (let k = 0; k < 3; k++) { f[k] *= sx; f[3 + k] *= sy; f[6 + k] *= sz; }
  return f;
}
function writeF(f, out, o) {
  out[o] = f[0]; out[o + 1] = f[1]; out[o + 2] = f[2]; out[o + 3] = 0;
  out[o + 4] = f[3]; out[o + 5] = f[4]; out[o + 6] = f[5]; out[o + 7] = 0;
  out[o + 8] = f[6]; out[o + 9] = f[7]; out[o + 10] = f[8]; out[o + 11] = 0;
  out[o + 12] = f[9]; out[o + 13] = f[10]; out[o + 14] = f[11]; out[o + 15] = 1;
}
const _pv = new THREE.Matrix4(), _frustum = new THREE.Frustum(), _ball = new THREE.Sphere(new THREE.Vector3(), 0.6);
const _root = frame(), _tb = frame(), _bs = frame(), _f = frame(), _armL = frame(), _armR = frame();

export class VillagerView {
  constructor(scene, max) {
    this.scene = scene;
    this.max = max;
    const mat = this.mat = villagerMaterial();
    // (the sun shadows come from a plain stand-in, below)
    const mk = (geo, n = max) => new Part(geo, mat, n, scene);
    const each = (defs, n) => Object.fromEntries(Object.entries(defs).map(([k, f]) => [k, mk(f(), n)]));
    this.leg = mk(LEG(), max * 2);
    this.arm = mk(ARM(), max * 2);
    this.body = mk(BODY(), max);
    this.eyes = each(EYES, max);
    this.hair = each(HAIR_STYLES, max);
    this.kit = each(KITS, max);
    this.hat = each(HATS, max);
    this.scarf = mk(SCARF(), max);
    this.prop = each(PROPS, max);
    // Sun shadows: one rough stand-in per villager (legs and the capsule of a
    // body) casts them for all the parts. It draws nothing itself: no colour,
    // no depth, and being see-through it is left out of the pixel-art outline
    // pass.
    const caster = this.caster = new THREE.InstancedMesh(mergeGeometries([
      new THREE.BoxGeometry(0.032, LEG_L, 0.014).translate(0, LEG_L / 2, 0),
      new THREE.SphereGeometry(BR, 8, 2, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, LEG_L + BOT, 0),
      new THREE.CylinderGeometry(BR, BR, TOPC - BOT, 8, 1, true).translate(0, LEG_L + (BOT + TOPC) / 2, 0),
      new THREE.SphereGeometry(BR, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, LEG_L + TOPC, 0),
    ].map(g => g.toNonIndexed())), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false }), max);
    caster.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    caster.castShadow = true; caster.receiveShadow = false;
    caster.count = 0; caster.frustumCulled = false;
    scene.add(caster);
    // contact shadows: soft dark spots on the ground under each villager
    const sh = this.shadow = new THREE.InstancedMesh(new THREE.CircleGeometry(0.035, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }), max);
    sh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sh.count = 0; sh.frustumCulled = false; sh.renderOrder = 1;
    scene.add(sh);
    this.parts = [this.leg, this.arm, this.body, this.scarf, ...[this.eyes, this.hair, this.kit, this.hat, this.prop].flatMap(o => Object.values(o))];
  }

  // Pose and draw the walkers in view of the camera (all of them without
  // one). env: { season }.
  draw(walkers, env = {}, camera = null) {
    const t = performance.now() * 0.001;
    const winter = env.season === 3;
    const fr = camera && camera.isCamera ? _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)) : null;
    let n = 0;
    for (const wk of walkers) {
      if (n >= this.max) break;
      if (wk.delay > 0) continue;
      if (fr) {
        // (with room for their shadows and the camera moving on a frame)
        _ball.center.set(wk.x, wk.y + 0.07, wk.z);
        if (!fr.intersectsSphere(_ball)) { wk.lx = null; continue; }
      }
      const lk = wk.lk, s = lk.scale * FIG;
      const ph = wk.phase, sn = Math.sin(ph), cs = Math.cos(ph);
      const moving = wk.moving, working = !!wk.working && !moving && wk.mode === 'wander';
      const sitting = wk.sit && !moving;
      const tool = wk.working ? wk.tool || (wk.ring ? 'hammer' : 'hoe') : null;
      let swing = 0, bob = 0, sq = 1, lean = lk.stoop, roll = 0, turn = 0;
      let aL = 0, aR = 0, rL = -ARM_OUT, rR = ARM_OUT;
      if (moving) {
        // a waddle: up on each passing step, a squash as the foot lands, a
        // rock from side to side and the arms swinging
        swing = sn * lk.gait;
        const up = Math.abs(cs);
        bob = -LEG_L * (1 - Math.cos(swing)) + lk.hop * up;
        sq = 1 + lk.squash * (up - 0.6);
        lean += 0.05;
        roll = 0.11 * sn;
        aL = -swing * 1.1; aR = swing * 1.1;
      } else if (sitting) {
        // on a bench: down on the seat, legs out in front, hands in the lap,
        // leaning back a little and glancing round now and then
        const br = Math.sin(t * 2.2 + ph);
        sq = 1 + 0.015 * br;
        bob = -LEG_L;
        lean = -0.14;
        aL = aR = -0.62; rL = -0.12; rR = 0.12;
        const look = Math.sin(t * 0.55 + ph * 1.7);
        turn = Math.abs(look) > 0.7 ? Math.sign(look) * 0.15 * (Math.abs(look) - 0.7) / 0.3 : 0;
      } else if (working) {
        const k = sn;
        if (tool === 'hammer') { lean += 0.2 + 0.1 * Math.max(0, k); aR = -1.75 + 0.9 * k; aL = -0.6; rL = -0.05; }
        else if (tool === 'pick') { lean = -0.1; aL = -2.7 + 0.35 * k; aR = -2.7 - 0.35 * k; rL = -0.4; rR = 0.4; }
        else { lean += 0.14 + 0.14 * Math.max(0, k); aR = aL = -1.5 + 0.75 * k; rL = -0.05; rR = -0.2; }
      } else {
        // standing about: breathing, turning to look round now and then;
        // children at play jump up and down with their arms in the air
        const br = Math.sin(t * 2.2 + ph);
        sq = 1 + 0.02 * br;
        const look = Math.sin(t * 0.55 + ph * 1.7);
        turn = Math.abs(look) > 0.55 ? Math.sign(look) * 0.45 * (Math.abs(look) - 0.55) / 0.45 : 0;
        aL = aR = -0.05 * br;
        if (lk.child && wk.mode === 'wander' && Math.sin(t * 0.8 + ph) > 0.25) {
          const j = Math.max(0, Math.sin(t * 7 + ph * 3));
          bob = 0.014 * j;
          sq = 1 + 0.1 * (j - 0.4);
          aL = aR = -2.6 * j - 0.2;
          rL = -0.6; rR = 0.6;
        }
      }
      // what's in their hands steadies the arm holding it
      const holding = wk.lamp ? 'lantern' : wk.carry ? wk.carry.kind : (lk.cane && moving && !wk.working) ? 'cane' : null;
      if (holding === 'lantern') { aR = -0.5 + 0.08 * sn; rR = 0.4; }
      else if (holding === 'basket') { aR = -0.14 + 0.08 * sn; rR = 0.45; }
      else if (holding === 'parcel') { aL = aR = -1.2; rL = 0.05; rR = -0.05; }
      else if (holding === 'cane') { aL = -0.38 + 0.18 * sn; rL = -0.35; }
      if (tool && moving) { aR = -0.35 + 0.1 * sn; rR = 0.35; }

      // the villager's own frame: facing their heading (a minion has no neck,
      // so looking round turns the lot), scaled to their size
      const hd = wk.heading + (moving ? 0 : Math.sin(t * 1.5 + ph) * 0.04 + turn);
      const hc = Math.cos(hd) * s, hs = Math.sin(hd) * s;
      const R = _root;
      R[0] = hc; R[1] = 0; R[2] = -hs; R[3] = 0; R[4] = s; R[5] = 0; R[6] = hs; R[7] = 0; R[8] = hc;
      R[9] = wk.x; R[10] = wk.y + bob * s; R[11] = wk.z;
      // legs
      this.leg.put(turnX(move(copyF(_f, R), -LEG_X, LEG_L, 0), sitting ? -1.4 : swing), lk.blue, lk.shoe);
      this.leg.put(turnX(move(copyF(_f, R), LEG_X, LEG_L, 0), sitting ? -1.4 : -swing), lk.blue, lk.shoe);
      // the body, leaning about the hip and squashing as they bounce, at
      // their own height, and what they wear on it
      turnZ(turnX(move(copyF(_tb, R), 0, LEG_L, 0), lean), roll);
      const wide = 1 + (1 - sq) * 0.5, up = sq * lk.tall;
      scaleF(copyF(_bs, _tb), wide, up, wide);
      this.body.put(_bs, lk.skin, lk.blue);
      if (lk.kit) this.kit[lk.kit.kind].put(_bs, lk.kit.a, lk.kit.b);
      // in winter the straw hats are put away and many wear a knitted one
      const hat = winter ? (lk.hat && lk.hat.kind !== 'straw' ? lk.hat : lk.beanie) : lk.hat;
      if (hat) this.hat[hat.kind].put(_bs, hat.a, hat.b);
      else if (lk.hair) this.hair[lk.hair].put(_bs, lk.hairC, null);
      if (winter && lk.scarf) this.scarf.put(_bs, lk.scarf, lk.scarfB);
      if (wk.bag) this.prop.satchel.put(_bs, lk.bag, lk.bag);
      // the goggles keep their round shape on any body
      this.eyes[lk.eyes].put(scaleF(move(copyF(_f, _tb), 0, EYE_Y * up, 0), wide, 1, wide), lk.iris, null);
      // arms
      turnZ(turnX(move(copyF(_armL, _tb), -SH_X * wide, SH_Y * up, 0), aL), rL);
      turnZ(turnX(move(copyF(_armR, _tb), SH_X * wide, SH_Y * up, 0), aR), rR);
      this.arm.put(_armL, lk.skin, lk.glove);
      this.arm.put(_armR, lk.skin, lk.glove);
      // tools and things carried
      if (tool === 'hammer' || tool === 'hoe') this.prop[tool].put(_armR, null, null);
      if (holding === 'parcel') this.prop.parcel.put(_bs, null, null);
      else if (holding) {
        // hangs straight down from the hand
        const A = holding === 'cane' ? _armL : _armR;
        copyF(_f, R);
        _f[9] = A[9] - A[3] * HAND; _f[10] = A[10] - A[4] * HAND; _f[11] = A[11] - A[5] * HAND;
        this.prop[holding].put(_f, holding === 'basket' ? wk.carry.c : null, null);
        if (holding === 'lantern') { wk.lx = _f[9]; wk.ly = _f[10] - 0.019 * s; wk.lz = _f[11]; }
      }
      // the shadow stand-in at their height
      writeF(scaleF(copyF(_f, R), 1, lk.tall, 1), this.caster.instanceMatrix.array, n * 16);
      copyF(_f, R);
      _f[10] = wk.y + 0.004;
      writeF(_f, this.shadow.instanceMatrix.array, n * 16);
      wk._i = n;
      n++;
    }
    for (const p of this.parts) p.flush();
    for (const m of [this.shadow, this.caster]) {
      m.count = n;
      m.visible = n > 0;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, n * 16);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const p of this.parts) p.dispose(this.scene);
    for (const m of [this.shadow, this.caster]) {
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
    }
    this.mat.dispose();
  }
}
