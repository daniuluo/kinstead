// Town invariants checked by the headless tests (playtest.js, starters.js,
// merge-test.js): plots never overlap (land deals and street fronts
// included) and the tile map agrees with them, villagers, transit lines and
// land deals point at real buildings, capacities hold, building sites keep
// moving, nothing turns into NaN; there is one seat of government.

import { fw, fd, isOpen, capOf, spareRect } from '../src/world/world.js';
import { BUILDINGS } from '../src/defs.js';
import { findBoulevards, dressFits } from '../src/world/boulevard.js';
import { streetPart, lookPart } from '../src/config.js';
import { tidyDiag, diagCapable } from '../src/world/diagonal.js';
import { spillsOf } from '../src/world/roadShape.js';

const DIR = [[0, 1], [1, 0], [0, -1], [-1, 0]];

// The invariants of a town at rest; calls problem(msg) per fault.
export function auditTown(w, problem) {
  // plots never overlap and the tile map agrees
  const rects = [];
  for (const b of w.buildings.values()) {
    for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) if (w.buildingAt[w.idx(b.x + dx, b.z + dz)] !== b.id) problem(`tile map disagrees with ${b.type} #${b.id}`);
    const e = { x0: 0, x1: 0, z0: 0, z1: 0, ...(b.ext || {}) };
    const [dx, dz] = DIR[b.rot], f = b.front || 0;
    if (dx > 0) e.x1 += f; if (dx < 0) e.x0 += f; if (dz > 0) e.z1 += f; if (dz < 0) e.z0 += f;
    rects.push([b.x - e.x0, b.z - e.z0, b.x + fw(b) + e.x1, b.z + fd(b) + e.z1, b]);
    // a building on part of a grown plot may stand forward of the plot
    const r = spareRect(b), o = b.ownFront || 0;
    if (r && o > f) rects.push([r.x - (dx < 0 ? o : 0), r.z - (dz < 0 ? o : 0), r.x + r.w + (dx > 0 ? o : 0), r.z + r.d + (dz > 0 ? o : 0), b]);
    for (let dz2 = 0; dz2 < fd(b); dz2++) for (let dx2 = 0; dx2 < fw(b); dx2++) if (w.roadAt(b.x + dx2, b.z + dz2) || w.railAt(b.x + dx2, b.z + dz2)) problem(`${b.type} #${b.id} sits on a road or track`);
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], c = rects[j];
    if (a[4] !== c[4] && a[0] < c[2] - 1e-6 && c[0] < a[2] - 1e-6 && a[1] < c[3] - 1e-6 && c[1] < a[3] - 1e-6) problem(`plots overlap: ${a[4].type} #${a[4].id} and ${c[4].type} #${c[4].id}`);
  }
  for (const i in w.buildingAt) if (w.buildingAt[i] >= 0 && !w.buildings.has(w.buildingAt[i])) { problem(`tile ${i} points at a missing building`); break; }
  // one seat of government, on grounds of its own size once rebuilt
  const seats = [...w.buildings.values()].filter(b => BUILDINGS[b.type].seat);
  if (seats.length > 1) problem(`${seats.length} seats of government: ${seats.map(b => `${b.type} #${b.id}`).join(', ')}`);
  for (const b of seats) if (!b.spare && fw(b) * fd(b) !== BUILDINGS[b.type].size ** 2) problem(`${b.type} #${b.id} stands on ${fw(b)}×${fd(b)} grounds`);
  // people, lines and land deals point at real places
  for (const r of w.residents.values()) {
    if (r.home != null && !w.buildings.has(r.home)) problem(`${r.first} ${r.last} lives in a missing building`);
    if (r.job != null && !w.buildings.has(r.job)) problem(`${r.first} ${r.last} works at a missing building`);
    if (r.job != null && r.school != null) problem(`${r.first} ${r.last} both works and studies`);
    if (!Number.isFinite(r.years) || !Number.isFinite(r.wealth ?? 0)) problem(`${r.first} has a broken age or savings`);
  }
  for (const l of w.lines) for (const s of l.stops) if (!w.buildings.has(s)) { problem(`${l.name} stops at a missing building`); break; }
  for (const b of w.buildings.values()) for (const l of b.leases || []) {
    const o = w.buildings.get(l.with);
    if (!o || !(o.leases || []).some(m => m.with === b.id)) problem(`${b.type} #${b.id} has a land deal with a missing or unaware neighbour`);
  }
  // farmland belongs to a farm, on open ground, within its limit, counted right
  if (w.fields) {
    const per = new Map();
    let stray = 0, under = null;
    for (let i = 0; i < w.fields.length; i++) {
      const f = w.fields[i];
      if (f < 0) continue;
      const b = w.buildings.get(f);
      if (!b || !BUILDINGS[b.type].fields) { stray++; continue; }
      if (!under && (w.buildingAt[i] >= 0 || w.roads[i] || w.rails[i])) under = b;
      per.set(f, (per.get(f) || 0) + 1);
    }
    if (stray) problem(`${stray} field(s) belong to no farm`);
    if (under) problem(`a field of ${under.type} #${under.id} is under a building, road or track`);
    for (const b of w.buildings.values()) {
      if (!BUILDINGS[b.type].fields) continue;
      const n = per.get(b.id) || 0;
      if ((b.fields || 0) !== n) problem(`${b.type} #${b.id} thinks it has ${b.fields || 0} fields, but has ${n}`);
      if (n > w.fieldMax(b)) problem(`${b.type} #${b.id} works ${n} fields, more than its ${w.fieldMax(b)}`);
    }
  }
  // boulevards are what the roads make them now, and every look and
  // dressing suits its tile
  if (w.blvd) {
    const now = findBoulevards(w);
    if (now.some((v, i) => v !== w.blvd[i])) problem('the boulevards are out of date with the roads');
    const bad = w.dress.findIndex((v, i) => v && (!w.roads[i] || [streetPart(v), lookPart(v)].some(k => k && !dressFits(w, i, k))));
    if (bad >= 0) problem(`a street dressing or boulevard look at tile ${bad} doesn't suit it`);
  }
  // diagonal streets are in order (links only between roads, both ways, and
  // cuts only beside them), and where one passes a plot's corner the building
  // there can face it, and does
  if (w.diag && w.diagN) {
    const was = w.diag.slice(), n = w.diagN;
    tidyDiag(w);
    if (w.diagN !== n || w.diag.some((v, i) => v !== was[i])) problem('the diagonal streets are out of order');
    for (const b of w.buildings.values()) {
      let sp = 0;
      for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) sp |= spillsOf(w, b.x + dx, b.z + dz);
      if (sp && !diagCapable(b)) problem(`${b.type} #${b.id} stands where a diagonal street passes its corner`);
      else if (sp && !b.diag) problem(`${b.type} #${b.id} doesn't face the diagonal street past its corner`);
    }
  }
  // nobody is over capacity
  for (const b of w.buildings.values()) {
    if (!isOpen(b)) continue;
    const L = BUILDINGS[b.type].levels[b.level];
    if (L.housing && b.residents.length > capOf(b, 'housing') + 6) problem(`${L.name} #${b.id} overcrowded: ${b.residents.length}/${capOf(b, 'housing')}`);
    if (b.workers.length > capOf(b, 'jobs')) problem(`${L.name} #${b.id} has too many workers`);
    if (L.seats && (b.pupils || []).length > capOf(b, 'seats')) problem(`${L.name} #${b.id} has too many pupils`);
  }
}

// Returns audit(day) for a running game, which reports each broken invariant
// via problem(day, msg).
export function makeAudit(game, problem) {
  const audit = (day) => {
    const w = game.world;
    auditTown(w, (msg) => problem(day, msg));
    // the oldest open site must keep moving while there are builders
    const C = game.construction;
    const open = [...w.buildings.values()].filter(b => b.con && !b.con.wait && b.access && b.connected).sort((a, b) => a._queued - b._queued);
    const head = open[0];
    if (head) {
      const key = `${head.id}:${head.con.kind}:${Math.floor((head.con.done / head.con.work) * 20)}`;
      if (audit.head !== key) { audit.head = key; audit.headSince = day; }
      else if (day - audit.headSince > 3 && C.hasBuilders) problem(day, `the oldest site (${head.type} #${head.id}, ${head.con.kind}) has not moved for ${day - audit.headSince} days`);
    }
    if (Number.isNaN(w.money)) problem(day, 'money is not a number');
    for (const wk of game.agents.walkers) if (!Number.isFinite(wk.x) || !Number.isFinite(wk.z)) { problem(day, 'a walker has no position'); break; }
    for (const a of game.animals.list) if (!Number.isFinite(a.x)) { problem(day, 'an animal has no position'); break; }
  };
  return audit;
}
