// Who the villagers are: personality traits that shape their days, pay,
// savings, and the people in their lives (family, workmates, neighbours).

import { BUILDINGS } from '../defs.js';
import { isOpen } from '../world/world.js';
import { RNG, hash2 } from '../util/rng.js';

export const TRAITS = {
  early: { name: 'Early riser', desc: 'Up and about before everyone else' },
  owl: { name: 'Night owl', desc: 'Late to work and last out of the tavern' },
  homebody: { name: 'Homebody', desc: 'Happiest at home' },
  social: { name: 'Sociable', desc: 'Always out visiting, with plenty of friends' },
  shopper: { name: 'Big spender', desc: 'Never walks past a shop' },
  thrifty: { name: 'Thrifty', desc: 'Saves every coin' },
  outdoorsy: { name: 'Outdoorsy', desc: 'Spends free time in parks and gardens' },
  devout: { name: 'Devout', desc: 'Never misses chapel' },
  diligent: { name: 'Hard-working', desc: 'Works long hours for a little more pay' },
  bookish: { name: 'Bookish', desc: 'Prefers a quiet read to a crowd' },
  playful: { name: 'Playful', desc: 'Off to the park at every chance' },
  curious: { name: 'Curious', desc: 'Wanders all over town' },
};
const CLASH = [['early', 'owl'], ['homebody', 'social'], ['shopper', 'thrifty'], ['bookish', 'playful']];
const POOL = {
  adult: ['early', 'owl', 'homebody', 'social', 'shopper', 'thrifty', 'outdoorsy', 'devout', 'diligent', 'bookish'],
  child: ['playful', 'curious', 'bookish', 'social', 'homebody', 'outdoorsy'],
  elder: ['early', 'devout', 'homebody', 'thrifty', 'outdoorsy', 'social', 'bookish', 'shopper'],
};

// One or two traits, fixed for life by the villager's seed.
export function traitsOf(r) {
  if (r._traits && r._traitAge === r.age) return r._traits;
  const g = new RNG((r.look ^ 0x6d2b79f5) >>> 0);
  const pool = POOL[r.age] || POOL.adult;
  const out = [];
  const n = g.chance(0.3) ? 1 : 2;
  for (let guard = 0; out.length < n && guard < 50; guard++) {
    const t = g.pick(pool);
    if (out.includes(t) || CLASH.some(([a, b]) => (t === a && out.includes(b)) || (t === b && out.includes(a)))) continue;
    out.push(t);
  }
  r._traits = out;
  r._traitAge = r.age;
  return out;
}
export const hasTrait = (r, t) => traitsOf(r).includes(t);

// Daily wage for the villager's job (0 without one).
export function salaryOf(world, r) {
  if (r.job == null || r.age !== 'adult') return 0;
  const j = world.buildings.get(r.job);
  if (!j || !isOpen(j)) return 0;
  const def = BUILDINGS[j.type], L = def.levels[j.level];
  let pay = def.builders ? 7 + 2 * j.level : L.income ? L.income * 0.6 : 5 + 1.5 * j.level;
  if (hasTrait(r, 'diligent')) pay *= 1.15;
  pay *= EDU_PAY[eduOf(r)];
  return Math.round(pay * 10) / 10;
}

// Rent, food and firewood per day; grander homes cost more to keep.
export function livingCostOf(world, r) {
  if (r.age === 'child') return 0;
  const h = r.home != null ? world.buildings.get(r.home) : null;
  const def = h ? BUILDINGS[h.type] : null;
  const rank = h ? h.level + (def.spacious ? (h.type === 'villa' ? 3 : 1) : 0) : 0;
  let c = 2.5 + rank * 0.9;
  if (hasTrait(r, 'thrifty')) c *= 0.8;
  if (hasTrait(r, 'shopper')) c *= 1.15;
  return Math.round(c * 10) / 10;
}

export const pensionOf = (r) => (r.age === 'elder' ? 3 : 0);

// ---------------------------------------------------------- ages & schooling
// One year of a villager's life passes every YEAR_DAYS in-game days.
export const YEAR_DAYS = 2;
export const EDU = ['No schooling', 'Elementary', 'Middle school', 'High school', 'College', 'University'];
const EDU_PAY = [0.85, 0.95, 1, 1.15, 1.35, 1.6];
// the stage a child of this age should be at
export const stageForAge = (y) => (y < 6 ? 0 : y < 11 ? 1 : y < 14 ? 2 : 3);

// Age in years (older saves only knew child / adult / elder).
export function yearsOf(r) {
  if (r.years != null) return r.years;
  const g = new RNG((r.look ^ 0x27d4eb2d) >>> 0);
  r.years = r.age === 'child' ? g.int(3, 16) : r.age === 'elder' ? g.int(66, 84) : g.int(19, 60);
  return r.years;
}

// Education level 0–3. Grown-ups who arrive bring theirs with them.
export function eduOf(r) {
  if (r.edu != null) return r.edu;
  const g = new RNG((r.look ^ 0x165667b1) >>> 0);
  if (r.age === 'child') r.edu = yearsOf(r) >= 14 ? 2 : yearsOf(r) >= 11 ? 1 : 0;
  else r.edu = eduFrom(g.next(), r.age === 'elder' ? -0.15 : 0);
  return r.edu;
}

// Education of a newcomer: better schools in town attract better-educated families.
export function arrivingEdu(world, rng) {
  let best = 0;
  for (const b of world.buildings.values()) { const t = BUILDINGS[b.type].levels[b.level].teaches; if (t && isOpen(b)) best = Math.max(best, t); }
  return eduFrom(rng.next(), best * 0.03);
}
function eduFrom(x, bonus = 0) {
  x += bonus;
  return x < 0.18 ? 0 : x < 0.42 ? 1 : x < 0.62 ? 2 : x < 0.88 ? 3 : x < 0.97 ? 4 : 5;
}

// What a child is doing about school, for the UI.
export function schoolingOf(world, r) {
  const s = r.school != null ? world.buildings.get(r.school) : null;
  if (r.age !== 'child') return s ? { text: `Studying at the ${BUILDINGS[s.type].levels[s.level].name}`, ok: true, building: s, student: true } : null;
  const y = yearsOf(r);
  if (y < 6) return { text: 'Too young for school', ok: true };
  const need = EDU[stageForAge(y)].toLowerCase();
  if (!s) return { text: `Needs a ${need} place`, ok: false, stage: stageForAge(y) };
  return { text: `${BUILDINGS[s.type].levels[s.level].name} · age ${Math.floor(y)}`, ok: true, building: s };
}

// Savings a villager arrives with (villa families come with money).
export function startingWealth(r, home) {
  if (r.age === 'child') return 0;
  const g = new RNG((r.look ^ 0x1b873593) >>> 0);
  const rich = home && BUILDINGS[home.type].spacious && home.type === 'villa' ? 4 : 1;
  return Math.round(g.float(25, 140) * rich);
}

export const wealthOf = (r) => (r.wealth ?? (r.age === 'child' ? 0 : 20 + (r.look % 100)));

// Family id: members of one household share it. Older saves didn't store
// it, so fall back to "same home and surname".
export function familyOf(r) { return r.fam ?? `${r.home}|${r.last}`; }

// How many households live in a home (families, and anyone living on their own).
export function householdsIn(w, b) {
  const fams = new Set();
  for (const id of b.residents) { const r = w.residents.get(id); if (r) fams.add(familyOf(r)); }
  return fams.size;
}

// Relatives living under the same roof, with how they relate to r.
export function relativesOf(world, r) {
  const fam = familyOf(r);
  const members = [...world.residents.values()].filter(o => familyOf(o) === fam).sort((a, b) => a.id - b.id);
  const i = members.indexOf(r);
  const head = members[0], second = members[1];
  const coupled = second && second.age !== 'child' && head.age === second.age;
  const out = [];
  members.forEach((o, k) => {
    if (o === r) return;
    let role;
    if (o.age === 'child') role = r.age === 'child' ? 'Sibling' : (i <= 1 && r.age !== 'elder') || (r.age === 'adult') ? 'Child' : 'Grandchild';
    else if (r.age === 'child') role = o.age === 'elder' && !(k <= 1 && coupled) ? 'Grandparent' : 'Parent';
    else if (coupled && i <= 1 && k <= 1) role = 'Partner';
    else if (o.age === 'elder' && r.age === 'adult') role = 'Parent';
    else if (o.age === 'adult' && r.age === 'elder') role = 'Son or daughter';
    else role = 'Relative';
    out.push({ r: o, role });
  });
  return out;
}

// Friends: a few workmates and neighbours (or playmates) they get on with.
export function friendsOf(world, r) {
  const out = [];
  const fam = familyOf(r);
  const home = r.home != null ? world.buildings.get(r.home) : null;
  const bar = hasTrait(r, 'social') ? 0.45 : hasTrait(r, 'homebody') ? 0.8 : 0.62;
  for (const o of world.residents.values()) {
    if (o === r || familyOf(o) === fam) continue;
    let ctx = null;
    if (r.job != null && o.job === r.job) ctx = 'Workmate';
    else if (home && o.home != null && (r.age === 'child') === (o.age === 'child')) {
      const h2 = world.buildings.get(o.home);
      if (h2 && Math.abs(h2.x - home.x) <= 3 && Math.abs(h2.z - home.z) <= 3) ctx = r.age === 'child' ? 'Playmate' : 'Neighbour';
    }
    if (!ctx) continue;
    const s = hash2(Math.min(r.id, o.id), Math.max(r.id, o.id), 77);
    if (s > bar) out.push({ r: o, ctx, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 5);
}

// End of the day: wages and pensions in, living costs out.
export function settleDay(world) {
  for (const r of world.residents.values()) {
    if (r.age === 'child') { r.wealth = 0; continue; }
    const w = wealthOf(r) + salaryOf(world, r) + pensionOf(r) - livingCostOf(world, r);
    r.wealth = Math.max(-60, Math.round(w * 10) / 10);
  }
}
