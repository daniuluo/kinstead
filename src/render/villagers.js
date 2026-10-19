// How the villagers look: little chibi figures in the spirit of a cosy
// farming game. A big round head (about two fifths of their height) with a
// bold hairdo and dot eyes, a short chunky body, stubby arms and legs, warm
// bright clothes that follow their work, and a bouncy little walk. Each part
// is one low-poly model drawn instanced, hundreds of villagers at a time;
// every piece of a model is painted with one of two colours set per villager
// (skin and hair, shirt and trousers...) or a fixed colour of its own.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../util/rng.js';
import { BUILDINGS, servicesOf, tradesOf } from '../defs.js';
import { yearsOf, wealthOf } from '../sim/people.js';

// ------------------------------------------------------------------ sizes
// In model units a grown-up stands about 0.15 tall; scaled by lk.scale * FIG
// that is about 0.14 (a storey is about 0.28), most of a front door.
const FIG = 1;
const LEG_L = 0.032;           // hip height
const LEG_X = 0.0112;
const SH_X = 0.0255, SH_Y = 0.050;   // shoulders, from the hip
const NECK_Y = 0.055;          // where the head sits, from the hip
const HAND = 0.031;            // shoulder to the middle of the hand
const HR = 0.033, HC = 0.029;  // head radius and centre (from the neck)
const ARM_OUT = 0.16;          // arms hang a little away from the body
const SWING = 0.62;            // leg swing at a walk (radians)

// Walking: the legs swing through one step for every π of phase; this is the
// ground covered per radian, so the feet keep pace with the ground.
export const strideLen = (scale) => (2 * LEG_L * scale * FIG * Math.sin(SWING)) / Math.PI * 1.25;

// ---------------------------------------------------------------- colours
const SKIN = ['#f1c8a5', '#e0ac85', '#c68c63', '#9a6440', '#6e4630', '#f5d6bd', '#d9a07a'];
const HAIR = ['#3a2418', '#5a3420', '#7a4522', '#9a5a2a', '#b8662c', '#d9782e', '#e8b860', '#f2d890', '#222028', '#8a3424', '#c04a2a'];
const HAIR_BOLD = ['#7a4fb0', '#3d84c0', '#4f9a52', '#d0608e', '#3fa0a0'];
const HAIR_OLD = ['#ece8e0', '#d4d0c8', '#b4b0a8', '#8e8a84'];
const BRIGHT = ['#d2493c', '#e8813a', '#ecb83c', '#79b04f', '#2f8a5e', '#3d93c2', '#4566b4', '#8456ae', '#cf5f92', '#efe0bd', '#9a6038', '#2fa3a0', '#e47670', '#6878c8', '#f0a0b8', '#a8c84a'];
const FINE = ['#5a2a72', '#28407a', '#7a1f30', '#1f5f4c', '#9a7428', '#3a3a52', '#6a2a50'];
const PANTS = ['#3d4a6a', '#5a4532', '#4d5a3a', '#3a3a46', '#6e5a44', '#30577e', '#7c6a50'];
const SHOES = ['#3a2618', '#26262c', '#6a3c22', '#5a2a24'];
const STOCKINGS = ['#f2ede2', '#3a3046', '#8a4a3a', '#5a6aa0'];
const CAPS = ['#5a4a3a', '#3a4a5a', '#6a5a3a', '#4a4a4a', '#6a3a2a'];
const BAGS = ['#8a5a32', '#c8473a', '#3f5fa8', '#2f7d5b', '#9a7428'];

// What villagers wear for their work: shirt (or coat) colours, the second
// colour (trousers, overalls, waistcoat), the cut, and the hat they favour.
const OUTFIT = {
  farmer: { top: ['#d2493c', '#efe0bd', '#ecb83c', '#79b04f', '#3d93c2'], bottom: ['#3f5f8a', '#4a6a9a', '#6a4a30', '#5a6a3a'], torso: 'overalls', hat: ['straw', 0.6] },
  builder: { top: ['#efe0bd', '#d2493c', '#3d93c2', '#8a8a7a', '#e8813a'], bottom: ['#5a4532', '#6e5a44', '#3a3a46', '#4d5a3a'], torso: 'tunic', hat: ['cap', 0.65] },
  worker: { top: ['#efe0bd', '#d2493c', '#3d93c2', '#8a8a7a', '#9a6038', '#2f8a5e'], bottom: ['#5a4532', '#6e5a44', '#3a3a46', '#4d5a3a'], torso: 'tunic', hat: ['cap', 0.45] },
  fisher: { top: ['#ecb83c', '#ecb83c', '#2f4a6a', '#3a5a7a'], bottom: ['#3a3a46', '#2f4a6a'], torso: 'tunic', hat: ['cap', 0.5] },
  shop: { top: BRIGHT, bottom: PANTS, torso: 'apron', hat: null },
  clerk: { top: ['#2f3a5a', '#3a3a40', '#4a3226', '#2f4a3a', '#5a2a2e'], bottom: ['#8a6a3a', '#5a2a2e', '#c8a860', '#3a4a6a'], torso: 'coat', hat: ['bowler', 0.4] },
  teacher: { top: ['#6a5236', '#4f5a3a', '#5a4a6a', '#3f4a5a', '#7a4a3a'], bottom: ['#c8a860', '#8a3b32', '#efe0bd', '#4f5a3a'], torso: 'coat', hat: ['bowler', 0.15] },
  clergy: { top: ['#26262c'], bottom: ['#26262c'], torso: 'coat', hat: null },
  nurse: { top: ['#a8c8e0', '#e8eef0', '#c8dce8'], bottom: ['#3a4a6a', '#4a4a56'], torso: 'apron', hat: null },
  watch: { top: ['#2a3a5c'], bottom: ['#2a3a5c'], torso: 'coat', hat: ['cap', 0.85], hatColor: '#24304a' },
};

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

// Hairdos and clothes lean on the villager's first name: names that are
// usually a girl's or a boy's get those looks most of the time, and the rest
// anything at all.
const FEM = new Set(('Ada Alba Anna Bea Briony Clara Cora Dora Edda Elsie Fern Flora Greta Hazel Ida Iris Juniper Lotte Mabel Mira Nell Odette Posy ' +
  'Rosalind Tamsin Una Willa Yara Agnes Dahlia Gwen Hester Ines Liesl Nettie Rhea Adela Ailsa Alma Aoife Astrid Aurelia Beatrix Bronwen Calla ' +
  'Celia Constance Dagny Damaris Delphine Dulcie Edith Eleanor Elodie Enid Esme Ettie Fenella Freya Gemma Gilda Griselda Harriet Helga ' +
  'Henrietta Ilse Imogen Isolde Ivy Jessamy Josephine Kezia Laurel Leonie Lettice Lyra Maeve Marigold Maude Meg Minna Morwen Nadia Nerys ' +
  'Nola Octavia Olwen Ophelia Orla Petra Philippa Pippa Primrose Ramona Rosamund Ruth Sabine Saffron Seren Sibyl Solveig Susannah Sybil ' +
  'Tabitha Tamar Thea Thisbe Ursula Verity Vera Violet Winifred Yvette Zillah Zinnia Bryony Carys Dilys Elspeth Fiadh Mabyn Niamh Sorcha ' +
  'Yolanda Cleo Dot Effie Hattie Moll Nan Pru Sukey Vi Bess').split(' '));
const ANY = new Set(('Kit Lark Pip Quill Rowan Sage Wren Jory Marlo Quinn Arden Blythe Jude Valentine Vesper Wynn Hollis Pell Fox Jos Kip Lou ' +
  'Rory Tam Cass Dell Fen Gale').split(' '));

// Hairdos, by who wears them (weights).
const STYLES_BY = {
  f: { adult: { bob: 4, long: 4.4, pony: 4.4, bun: 2.8, puff: 1.6, crop: 1.2, pigtails: 0.6, swoop: 1 }, child: { pigtails: 6, bob: 4, pony: 4, long: 3, puff: 1.6, crop: 1.4 }, elder: { bun: 5, bob: 2.5, crop: 1.5, puff: 1 } },
  m: { adult: { crop: 3, spiky: 1.8, swoop: 2.2, puff: 0.8, buzz: 1, pony: 0.5, long: 0.4 }, child: { spiky: 3, crop: 3, swoop: 2, puff: 1, buzz: 1 }, elder: { bald: 3.5, crop: 3, swoop: 2, buzz: 1.5 } },
};
const NO_HAT = new Set(['puff', 'bun']);

function weighted(g, table) {
  let sum = 0;
  for (const k in table) sum += table[k];
  let x = g.next() * sum;
  for (const k in table) if ((x -= table[k]) <= 0) return k;
  return Object.keys(table)[0];
}
const col = (hex) => new THREE.Color(hex);
const darker = (c, k) => c.clone().multiplyScalar(k);

// A villager's look, fixed for life by their seed (r.look). dress: from
// dressOf() (hired hands pass { kind: 'builder' }).
export function lookOf(r, dress = null) {
  const g = new RNG(r.look >>> 0);
  const age = r.age === 'child' || r.age === 'elder' ? r.age : 'adult';
  const child = age === 'child', elder = age === 'elder';
  // the first draws are the ones villagers always had, in the same order, so
  // everyone keeps their skin, size, pace and place on the pavement
  const skin = g.pick(SKIN);
  const uHair = g.next(), uTop = g.next(), uPants = g.next();
  const hatRoll = g.chance(child ? 0.1 : 0.32);
  if (hatRoll) g.next();
  const scale = child ? 0.5 + Math.min(1, yearsOf(r) / 17) * 0.3 : elder ? 0.86 : 0.88 + g.next() * 0.08;
  const lane = 0.07 + g.next() * 0.13;
  const speed = (elder ? 0.72 : child ? 1.15 : 1) * (0.9 + g.next() * 0.2);
  // ...and the rest from a stream of their own
  const h = new RNG(((r.look >>> 0) ^ 0x5bd1e995) >>> 0);
  const pick = (arr, u = h.next()) => arr[Math.floor(u * arr.length) % arr.length];
  const kind = (dress && dress.kind) || null, rich = !!(dress && dress.rich);
  const first = r.first || '';
  const p = FEM.has(first) ? (h.chance(0.9) ? 'f' : 'm') : ANY.has(first) || !first ? (h.chance(0.5) ? 'f' : 'm') : (h.chance(0.92) ? 'm' : 'f');

  const hair = weighted(h, STYLES_BY[p][age]);
  const hairC = elder ? (h.chance(0.15) ? pick(HAIR, uHair) : pick(HAIR_OLD)) : h.chance(0.07) ? pick(HAIR_BOLD) : pick(HAIR, uHair);
  const beard = p === 'm' && !child && h.chance(elder ? 0.45 : 0.25) ? (h.chance(0.6) ? 'beard' : 'tache') : null;

  // clothes: work clothes for the grown-ups who have them, else their own
  const o = kind && !child ? OUTFIT[kind] : null;
  let torso, top, bottom;
  if (o) {
    torso = o.torso === 'apron' && p === 'f' && h.chance(0.6) ? 'dressApron' : o.torso === 'tunic' && p === 'f' && kind !== 'builder' && h.chance(0.4) ? 'dress' : o.torso;
    top = pick(o.top, uTop);
    bottom = pick(o.bottom, uPants);
  } else {
    const cuts = child ? (p === 'f' ? { dress: 5.5, tunic: 3, overalls: 1.5 } : { tunic: 7, overalls: 3 })
      : elder ? (p === 'f' ? { dress: 7, coat: 3 } : { coat: 5, tunic: 5 })
        : p === 'f' ? { dress: 6, tunic: 3.4, coat: rich ? 3 : 0.6 } : { tunic: rich ? 3 : 8.5, coat: rich ? 6 : 1.5 };
    torso = weighted(h, cuts);
    top = pick(rich ? FINE : BRIGHT, uTop);
    bottom = torso === 'dress' ? pick(BRIGHT) : torso === 'coat' ? pick(rich ? ['#c8a860', '#efe0bd', '#8a3b32'] : ['#8a6a3a', '#efe0bd', '#5a4532', '#c8a860']) : pick(PANTS, uPants);
  }
  const skirt = torso === 'dress' || torso === 'dressApron';
  const trousers = torso === 'overalls' ? bottom : torso === 'coat' ? pick(['#3a3a46', '#2f3238', '#4a3f36', '#3d4a6a']) : pick(PANTS, uPants);
  const leg = skirt ? (h.chance(0.35) ? skin : pick(STOCKINGS)) : trousers;

  // hats: work hats, then the villager's own (as many as always wore one)
  let hat = null;
  const roll = h.next();
  if (o && o.hat && roll < o.hat[1]) hat = o.hat[0];
  else if (!o && hatRoll) hat = child ? (p === 'f' ? 'straw' : 'cap') : rich && p === 'm' ? (h.chance(0.5) ? 'top' : 'bowler') : p === 'f' ? 'straw' : pick(['cap', 'cap', 'bowler', 'straw']);
  if (NO_HAT.has(hair)) hat = null;
  const hatA = hat === 'straw' ? col('#e3c06a') : hat === 'cap' ? col(o && o.hatColor ? o.hatColor : pick(CAPS)) : hat === 'top' ? col('#1f1f24') : hat ? col(pick(['#2a2a2e', '#4a3226'])) : null;
  const hatB = hat === 'straw' ? col(pick(BRIGHT)) : hat === 'top' ? col(pick(FINE)) : hat === 'bowler' ? col('#151518') : hatA ? darker(hatA, 0.8) : null;

  const scarf = col(pick(BRIGHT));
  return {
    age, child, elder, kind, rich, scale, lane, speed,
    skin: col(skin), hairC: col(hairC), top: col(top), bottom: col(bottom), leg: col(leg), shoe: col(child && p === 'f' && h.chance(0.4) ? '#a83a34' : pick(SHOES)),
    torso, hair, beard,
    hat: hat ? { kind: hat, a: hatA, b: hatB } : null,
    // winter woollies: a scarf for most, a knitted hat for those without one
    scarf: h.chance(0.8) ? scarf : null, scarfB: col(h.chance(0.5) ? '#f2ede2' : pick(BRIGHT)),
    beanie: !NO_HAT.has(hair) && h.chance(child ? 0.85 : 0.6) ? { kind: 'beanie', a: col(pick(BRIGHT)), b: col(h.chance(0.6) ? '#f2ede2' : pick(BRIGHT)) } : null,
    cane: elder && h.chance(0.35),
    bag: col(pick(BAGS)),
    // how they move: little ones skip, the old take it slowly
    gait: SWING * (child ? 1.15 : elder ? 0.7 : 1),
    hop: (child ? 0.3 : elder ? 0.08 : 0.2) * LEG_L,
    squash: child ? 0.08 : elder ? 0.025 : 0.055,
    stoop: elder ? 0.16 : 0,
    headK: child ? 1.13 : 1,
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
const box = (w, h, d, paint, x, y, z, rx = 0, ry = 0, rz = 0) => piece(new THREE.BoxGeometry(w, h, d), paint, T(x, y, z, rx, ry, rz));
const cone = (r, h, seg, paint, x, y, z, rx = 0, ry = 0, rz = 0) => piece(new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0), paint, T(x, y, z, rx, ry, rz));
function model(pieces) {
  const g = mergeGeometries(pieces.flat(), false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const EYE = '#2b1d16', BLUSH = '#f0a08c', CREAM = '#f4ecdc', SHIRT = '#f4f0e6', GOLD = '#e0c060';

// A leg hangs from the hip (y = 0) to the ground: trousers (A), shoe (B).
const LEG = () => model([
  cyl(0.0098, 0.0104, LEG_L - 0.004, 7, 'A', 0, -LEG_L + 0.006, 0),
  ball(0.0108, 7, 4, 'B', [0, -LEG_L, 0.0028], [0.86, 0.85, 1.18], [0, 0, 0], [0, Math.PI / 2]),
]);
// An arm hangs from the shoulder: sleeve (A), hand (B).
const ARM = () => model([
  ball(0.0078, 6, 4, 'A', [0, 0, 0]),
  cyl(0.0068, 0.0078, 0.026, 6, 'A', 0, -0.026, 0),
  ball(0.0076, 6, 4, 'B', [0, -HAND, 0]),
]);

// Bodies, from the hip up: colour A is the shirt, dress or coat; B the
// trousers, overalls, sash or waistcoat.
const shoulders = (r = 0.0205) => ball(r, 8, 3, 'A', [0, 0.041, 0], [1, 0.85, 1], [0, 0, 0], [0, Math.PI / 2]);
const TORSO = {
  tunic: () => model([
    cyl(0.0218, 0.0226, 0.016, 8, 'B', 0, -0.006, 0),
    cyl(0.0205, 0.0232, 0.034, 8, 'A', 0, 0.008, 0),
    shoulders(),
  ]),
  overalls: () => model([
    cyl(0.0222, 0.023, 0.018, 8, 'B', 0, -0.006, 0),
    cyl(0.0205, 0.0215, 0.03, 8, 'A', 0, 0.011, 0),
    shoulders(),
    box(0.024, 0.02, 0.006, 'B', 0, 0.021, 0.0192),
    box(0.0045, 0.03, 0.044, 'B', -0.0092, 0.043, -0.0004),
    box(0.0045, 0.03, 0.044, 'B', 0.0092, 0.043, -0.0004),
    box(0.0038, 0.0038, 0.003, GOLD, -0.0085, 0.029, 0.0226),
    box(0.0038, 0.0038, 0.003, GOLD, 0.0085, 0.029, 0.0226),
  ]),
  apron: () => model([
    cyl(0.0218, 0.0226, 0.016, 8, 'B', 0, -0.006, 0),
    cyl(0.0205, 0.0232, 0.034, 8, 'A', 0, 0.008, 0),
    shoulders(),
    box(0.03, 0.04, 0.004, CREAM, 0, 0.009, 0.0222),
    box(0.02, 0.014, 0.004, CREAM, 0, 0.034, 0.0198),
    cyl(0.0236, 0.0236, 0.003, 8, CREAM, 0, 0.026, 0),
  ]),
  dress: () => model([
    cyl(0.0214, 0.031, 0.031, 8, 'A', 0, -0.015, 0),
    cyl(0.0205, 0.0212, 0.026, 8, 'A', 0, 0.016, 0),
    cyl(0.0219, 0.0219, 0.0045, 8, 'B', 0, 0.0145, 0),
    shoulders(),
  ]),
  dressApron: () => model([
    cyl(0.0214, 0.031, 0.031, 8, 'A', 0, -0.015, 0),
    cyl(0.0205, 0.0212, 0.026, 8, 'A', 0, 0.016, 0),
    cyl(0.0219, 0.0219, 0.0045, 8, 'B', 0, 0.0145, 0),
    shoulders(),
    box(0.026, 0.03, 0.003, CREAM, 0, 0.0005, 0.0272, -0.3),
    box(0.018, 0.016, 0.003, CREAM, 0, 0.027, 0.0205),
  ]),
  coat: () => model([
    cyl(0.0208, 0.0262, 0.058, 8, 'A', 0, -0.017, 0),
    shoulders(0.0207),
    box(0.013, 0.024, 0.004, 'B', 0, 0.027, 0.0204),
    box(0.008, 0.011, 0.004, SHIRT, 0, 0.042, 0.0192, -0.35),
  ]),
};

// Heads with their hair, from the neck up: colour A is the skin, B the hair.
// The face looks along +z.
const HEAD_C = [0, HC, 0.001];
// the hair over the crown: a cap of a sphere tipped back, so it comes down
// to the brow in front and the nape behind
const cap = (r, theta, tilt, dy = 0, dz = 0, s = [1, 1, 1]) => ball(r, 8, 5, 'B', [0, HC + dy, 0.001 + dz], s, [-tilt, 0, 0], [0, theta]);
const fringe = () => [
  box(0.013, 0.008, 0.006, 'B', -0.0115, HC + 0.0145, 0.0272, -0.45, -0.3),
  box(0.013, 0.009, 0.006, 'B', 0, HC + 0.0135, 0.0298, -0.45),
  box(0.013, 0.008, 0.006, 'B', 0.0115, HC + 0.0145, 0.0272, -0.45, 0.3),
];
const bangs = () => box(0.044, 0.011, 0.007, 'B', 0, HC + 0.0145, 0.0265, -0.42);
const D2R = Math.PI / 180;
function face() {
  const ez = 0.0291;
  return [
    ball(HR, 8, 6, 'A', HEAD_C, [1.04, 0.94, 0.98]),
    box(0.0062, 0.0105, 0.004, EYE, -0.0112, HC - 0.0035, ez),
    box(0.0062, 0.0105, 0.004, EYE, 0.0112, HC - 0.0035, ez),
    box(0.0065, 0.0032, 0.003, BLUSH, -0.0165, HC - 0.0125, 0.0248, 0, -0.55),
    box(0.0065, 0.0032, 0.003, BLUSH, 0.0165, HC - 0.0125, 0.0248, 0, 0.55),
  ];
}
// hair round the back and sides, down to the jaw (or the shoulders),
// flaring out at the ends
const sides = (down, flare = 1.1) => ball(HR * 1.1, 8, 6, 'B', HEAD_C, [flare, 0.98, flare * 0.95], [0, 0, 0], [62 * D2R, down * D2R], [Math.PI / 2 + 0.95, Math.PI * 2 - 1.9]);
// long locks falling in front of the shoulders
const locks = () => [
  ball(0.0105, 6, 4, 'B', [-0.0335, HC - 0.026, -0.002], [0.7, 1.7, 0.7], [0, 0, 0.1]),
  ball(0.0105, 6, 4, 'B', [0.0335, HC - 0.026, -0.002], [0.7, 1.7, 0.7], [0, 0, -0.1]),
];
const HAIR_STYLES = {
  crop: () => model([face(), cap(HR * 1.07, 96 * D2R, 25 * D2R), fringe()]),
  buzz: () => model([face(), cap(HR * 1.025, 93 * D2R, 22 * D2R)]),
  spiky: () => model([face(), cap(HR * 1.06, 95 * D2R, 25 * D2R), fringe(),
    cone(0.0085, 0.016, 5, 'B', 0, HC + 0.028, 0.004, 0.25),
    cone(0.0085, 0.015, 5, 'B', -0.013, HC + 0.024, -0.002, 0.1, 0, 0.6),
    cone(0.0085, 0.015, 5, 'B', 0.013, HC + 0.024, -0.002, 0.1, 0, -0.6),
    cone(0.008, 0.014, 5, 'B', -0.007, HC + 0.022, -0.017, -0.7, 0, 0.3),
    cone(0.008, 0.014, 5, 'B', 0.007, HC + 0.022, -0.017, -0.7, 0, -0.3),
  ]),
  swoop: () => model([face(), cap(HR * 1.07, 96 * D2R, 28 * D2R),
    ball(0.016, 6, 4, 'B', [0.005, HC + 0.0175, 0.022], [1.45, 0.62, 0.75], [-0.3, 0, -0.28]),
  ]),
  bob: () => model([face(), cap(HR * 1.12, 100 * D2R, 10 * D2R), sides(76, 1.2), bangs()]),
  long: () => model([face(), cap(HR * 1.1, 100 * D2R, 12 * D2R), sides(82, 1.08), bangs(), locks(),
    ball(0.025, 7, 5, 'B', [0, HC - 0.03, -0.019], [1.1, 1.75, 0.5]),
  ]),
  pony: () => model([face(), cap(HR * 1.08, 97 * D2R, 18 * D2R), bangs(),
    ball(0.0062, 6, 4, 'B', [0, HC + 0.016, -0.034]),
    ball(0.0115, 6, 5, 'B', [0, HC - 0.004, -0.043], [0.85, 2, 0.85], [0.42, 0, 0]),
  ]),
  bun: () => model([face(), cap(HR * 1.08, 97 * D2R, 15 * D2R), fringe(),
    ball(0.0145, 7, 5, 'B', [0, HC + 0.032, -0.011]),
  ]),
  pigtails: () => model([face(), cap(HR * 1.08, 96 * D2R, 18 * D2R), bangs(),
    ball(0.0108, 6, 5, 'B', [-0.035, HC - 0.006, -0.007], [0.9, 1.75, 0.9], [0, 0, -0.35]),
    ball(0.0108, 6, 5, 'B', [0.035, HC - 0.006, -0.007], [0.9, 1.75, 0.9], [0, 0, 0.35]),
    ball(0.0052, 5, 3, '#d84a4a', [-0.031, HC + 0.011, -0.007]),
    ball(0.0052, 5, 3, '#d84a4a', [0.031, HC + 0.011, -0.007]),
  ]),
  puff: () => model([face(), ball(HR * 1.36, 9, 6, 'B', [0, HC + 0.009, -0.005], [1, 0.95, 1], [-30 * D2R, 0, 0], [0, 102 * D2R])]),
  bald: () => model([face(), wall(HR * 1.05, 0.014, 8, 1.15, Math.PI * 2 - 2.3, 'B', 0, HC - 0.009, 0.001)]),
};
// Beards and moustaches, in the hair colour (A).
const BEARDS = {
  beard: () => model([ball(0.02, 7, 4, 'A', [0, HC - 0.019, 0.016], [1.3, 0.85, 0.85])]),
  tache: () => model([box(0.019, 0.0045, 0.006, 'A', 0, HC - 0.0115, 0.0293)]),
};
// Hats sit over the hair: colour A the hat, B the band (or bobble).
const HATS = {
  straw: () => model([
    cyl(0.052, 0.052, 0.004, 10, 'A', 0, HC + 0.019, 0.001, -0.12),
    cyl(0.027, 0.031, 0.02, 8, 'A', 0, HC + 0.02, 0, -0.12),
    cyl(0.0318, 0.0318, 0.0055, 8, 'B', 0, HC + 0.0205, 0, -0.12),
  ]),
  cap: () => model([
    ball(0.0375, 8, 4, 'A', [0, HC + 0.021, -0.001], [1.02, 0.5, 1.06], [0, 0, 0], [0, Math.PI / 2]),
    cyl(0.0375, 0.0375, 0.004, 8, 'A', 0, HC + 0.019, -0.001),
    box(0.03, 0.004, 0.017, 'A', 0, HC + 0.022, 0.035, 0.18),
    ball(0.004, 5, 3, 'B', [0, HC + 0.04, 0]),
  ]),
  bowler: () => model([
    cyl(0.042, 0.042, 0.003, 10, 'A', 0, HC + 0.021, 0),
    ball(0.029, 8, 4, 'A', [0, HC + 0.022, 0], [1, 1.12, 1], [0, 0, 0], [0, Math.PI / 2]),
    cyl(0.0295, 0.0295, 0.005, 8, 'B', 0, HC + 0.0225, 0),
  ]),
  top: () => model([
    cyl(0.042, 0.042, 0.003, 10, 'A', 0, HC + 0.022, 0),
    cyl(0.026, 0.025, 0.042, 8, 'A', 0, HC + 0.022, 0),
    cyl(0.0265, 0.0265, 0.007, 8, 'B', 0, HC + 0.024, 0),
  ]),
  beanie: () => model([
    ball(HR * 1.13, 8, 4, 'A', [0, HC + 0.003, -0.001], [1, 1, 1], [-10 * D2R, 0, 0], [0, 80 * D2R]),
    cyl(HR * 1.15, HR * 1.15, 0.008, 8, 'B', 0, HC + 0.004, -0.002, -10 * D2R),
    ball(0.0085, 6, 4, 'B', [0, HC + 0.044, -0.004]),
  ]),
};
// A knitted scarf round the neck (A), with a stripe (B).
const SCARF = () => model([
  cyl(0.0215, 0.0228, 0.01, 8, 'A', 0, -0.009, 0),
  cyl(0.0232, 0.0232, 0.003, 8, 'B', 0, -0.0055, 0),
  box(0.008, 0.024, 0.004, 'A', 0.008, -0.022, 0.0215, -0.15),
  box(0.0085, 0.003, 0.0045, 'B', 0.008, -0.027, 0.0218, -0.15),
]);
// Things held: tools in the right hand (in the arm's frame, hand at y = -HAND);
// baskets, lanterns and walking sticks hang upright from the hand.
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
    box(0.034, 0.02, 0.019, '#c8a070', 0, 0.034, 0.031),
    box(0.0352, 0.0025, 0.0195, '#efe6d2', 0, 0.034, 0.031),
    box(0.0025, 0.0205, 0.0195, '#efe6d2', 0, 0.034, 0.031),
  ]),
  lantern: () => model([
    cyl(0.001, 0.001, 0.005, 4, '#3a3a40', 0, -0.006, 0),
    cone(0.0072, 0.005, 6, '#3a3a40', 0, -0.0095, 0),
    cyl(0.0058, 0.0058, 0.011, 6, '#ffe39a', 0, -0.0205, 0),
    cyl(0.0068, 0.0068, 0.0025, 6, '#3a3a40', 0, -0.0225, 0),
  ]),
  cane: () => model([
    cyl(0.0022, 0.0022, 0.05, 5, '#6a4426', 0, -0.05, 0.002, 0.08),
    piece(new THREE.TorusGeometry(0.004, 0.0021, 4, 6, Math.PI), '#6a4426', T(0, 0, 0.004, 0, Math.PI / 2)),
  ]),
  satchel: () => model([
    box(0.025, 0.022, 0.009, 'A', 0, 0.024, -0.0255),
    box(0.026, 0.009, 0.0105, 'B', 0, 0.033, -0.0255),
    box(0.004, 0.05, 0.003, 'B', 0, 0.025, 0.0222, 0, 0, 0.75),
  ]),
};

// ----------------------------------------------------------------- drawing
// colour = pal.x * colour A + pal.y * colour B + pal.z * the piece's own colour
function villagerMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0 });
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
function turnY(f, a) {
  if (!a) return f;
  const c = cosA(a), s = sinA(a);
  for (let k = 0; k < 3; k++) { const x = f[k], z = f[6 + k]; f[k] = x * c - z * s; f[6 + k] = x * s + z * c; }
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
const _root = frame(), _tb = frame(), _f = frame(), _armL = frame(), _armR = frame(), _neck = frame(), _head = frame();

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
    this.torso = each(TORSO, max);
    this.head = each(HAIR_STYLES, max);
    this.beard = each(BEARDS, max);
    this.hat = each(HATS, max);
    this.scarf = mk(SCARF(), max);
    this.prop = each(PROPS, max);
    // Sun shadows: one rough stand-in per villager (legs, body and head) casts
    // them for all the parts. It draws nothing itself: no colour, no depth,
    // and being see-through it is left out of the pixel-art outline pass.
    const caster = this.caster = new THREE.InstancedMesh(mergeGeometries([
      new THREE.BoxGeometry(0.034, LEG_L, 0.014).translate(0, LEG_L / 2, 0),
      new THREE.CylinderGeometry(0.021, 0.023, 0.064, 8).translate(0, LEG_L + 0.026, 0),
      new THREE.SphereGeometry(HR * 1.08, 8, 6).translate(0, LEG_L + NECK_Y + HC, 0),
    ].map(g => g.toNonIndexed())), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false }), max);
    caster.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    caster.castShadow = true; caster.receiveShadow = false;
    caster.count = 0; caster.frustumCulled = false;
    scene.add(caster);
    // contact shadows: soft dark spots on the ground under each villager
    const sh = this.shadow = new THREE.InstancedMesh(new THREE.CircleGeometry(0.027, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }), max);
    sh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sh.count = 0; sh.frustumCulled = false; sh.renderOrder = 1;
    scene.add(sh);
    this.parts = [this.leg, this.arm, this.scarf, ...[this.torso, this.head, this.beard, this.hat, this.prop].flatMap(o => Object.values(o))];
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
      const tool = wk.working ? wk.tool || (wk.ring ? 'hammer' : 'hoe') : null;
      let swing = 0, bob = 0, sq = 1, lean = lk.stoop, roll = 0, nod = 0, turn = 0;
      let aL = 0, aR = 0, rL = -ARM_OUT, rR = ARM_OUT;
      if (moving) {
        // a bouncy trot: up on each passing step, a squash as the foot lands,
        // a little sway from side to side and the arms swinging
        swing = sn * lk.gait;
        const up = Math.abs(cs);
        bob = -LEG_L * (1 - Math.cos(swing)) + lk.hop * up;
        sq = 1 + lk.squash * (up - 0.6);
        lean += 0.07;
        roll = 0.07 * sn;
        nod = 0.1 * (0.5 - up);
        aL = -swing * 0.95; aR = swing * 0.95;
      } else if (working) {
        const k = sn;
        if (tool === 'hammer') { lean += 0.24 + 0.12 * Math.max(0, k); aR = -1.6 + 0.85 * k; aL = -0.6; rL = 0.15; nod = 0.18; }
        else if (tool === 'pick') { lean = -0.06; aL = -2.65 + 0.35 * k; aR = -2.65 - 0.35 * k; rL = -0.3; rR = 0.3; nod = -0.4; }
        else { lean += 0.16 + 0.16 * Math.max(0, k); aR = aL = -1.45 + 0.75 * k; rL = 0.12; rR = -0.05; nod = 0.12; }
      } else {
        // standing about: breathing, glancing round now and then; children
        // at play jump up and down with their arms in the air
        const br = Math.sin(t * 2.2 + ph);
        sq = 1 + 0.018 * br;
        const look = Math.sin(t * 0.55 + ph * 1.7);
        turn = Math.abs(look) > 0.55 ? Math.sign(look) * 0.45 * (Math.abs(look) - 0.55) / 0.45 : 0;
        aL = aR = -0.05 * br;
        if (lk.child && wk.mode === 'wander' && Math.sin(t * 0.8 + ph) > 0.25) {
          const j = Math.max(0, Math.sin(t * 7 + ph * 3));
          bob = 0.014 * j;
          sq = 1 + 0.08 * (j - 0.4);
          aL = aR = -2.4 * j - 0.2;
          rL = -0.45; rR = 0.45;
        }
      }
      // what's in their hands steadies the arm holding it
      const holding = wk.lamp ? 'lantern' : wk.carry ? wk.carry.kind : (lk.cane && moving && !wk.working) ? 'cane' : null;
      if (holding === 'lantern') { aR = -0.5 + 0.08 * sn; rR = 0.28; }
      else if (holding === 'basket') { aR = -0.14 + 0.08 * sn; rR = 0.34; }
      else if (holding === 'parcel') { aL = aR = -1.05; rL = 0.3; rR = -0.3; }
      else if (holding === 'cane') { aL = -0.38 + 0.18 * sn; rL = -0.2; }
      if (tool && moving) { aR = -0.35 + 0.1 * sn; rR = 0.25; }

      // the villager's own frame: facing their heading, scaled to their size
      const hd = wk.heading + (moving ? 0 : Math.sin(t * 1.5 + ph) * 0.04);
      const hc = Math.cos(hd) * s, hs = Math.sin(hd) * s;
      const R = _root;
      R[0] = hc; R[1] = 0; R[2] = -hs; R[3] = 0; R[4] = s; R[5] = 0; R[6] = hs; R[7] = 0; R[8] = hc;
      R[9] = wk.x; R[10] = wk.y + bob * s; R[11] = wk.z;
      // legs
      this.leg.put(turnX(move(copyF(_f, R), -LEG_X, LEG_L, 0), swing), lk.leg, lk.shoe);
      this.leg.put(turnX(move(copyF(_f, R), LEG_X, LEG_L, 0), -swing), lk.leg, lk.shoe);
      // body, leaning about the hip and squashing as they bounce
      turnZ(turnX(move(copyF(_tb, R), 0, LEG_L, 0), lean), roll);
      const wide = 1 + (1 - sq) * 0.5;
      this.torso[lk.torso].put(scaleF(copyF(_f, _tb), wide, sq, wide), lk.top, lk.bottom);
      turnZ(turnX(move(copyF(_armL, _tb), -SH_X, SH_Y * sq, 0), aL), rL);
      turnZ(turnX(move(copyF(_armR, _tb), SH_X, SH_Y * sq, 0), aR), rR);
      this.arm.put(_armL, lk.top, lk.skin);
      this.arm.put(_armR, lk.top, lk.skin);
      // head (kept upright against the lean, so the old look ahead not down)
      move(copyF(_neck, _tb), 0, NECK_Y * sq, 0);
      scaleF(turnY(turnX(copyF(_head, _neck), nod - lean * 0.6), turn), lk.headK, lk.headK, lk.headK);
      this.head[lk.hair].put(_head, lk.skin, lk.hairC);
      if (lk.beard) this.beard[lk.beard].put(_head, lk.hairC, null);
      // in winter the straw hats are put away and many wear a knitted one
      const hat = winter ? (lk.hat && lk.hat.kind !== 'straw' ? lk.hat : lk.beanie) : lk.hat;
      if (hat) this.hat[hat.kind].put(_head, hat.a, hat.b);
      if (winter && lk.scarf) this.scarf.put(_neck, lk.scarf, lk.scarfB);
      if (wk.bag) this.prop.satchel.put(_tb, lk.bag, lk.bag);
      // tools and things carried
      if (tool === 'hammer' || tool === 'hoe') this.prop[tool].put(_armR, null, null);
      if (holding === 'parcel') this.prop.parcel.put(_tb, null, null);
      else if (holding) {
        // hangs straight down from the hand
        const A = holding === 'cane' ? _armL : _armR;
        copyF(_f, R);
        _f[9] = A[9] - A[3] * HAND; _f[10] = A[10] - A[4] * HAND; _f[11] = A[11] - A[5] * HAND;
        this.prop[holding].put(_f, holding === 'basket' ? wk.carry.c : null, null);
        if (holding === 'lantern') { wk.lx = _f[9]; wk.ly = _f[10] - 0.019 * s; wk.lz = _f[11]; }
      }
      writeF(R, this.caster.instanceMatrix.array, n * 16);
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
