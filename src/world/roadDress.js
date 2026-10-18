// Dressing a street: a tree-lined avenue, a hedged lane, a lamp-lit street
// or a planted boulevard (DRESSINGS in config.js), laid along a stretch of
// road picked in the road selection panel. Each road tile holds at most one
// (world.dress). It is priced per tile, costs a little upkeep and makes the
// homes and shops beside it a little nicer to live by (Sim adds its appeal);
// it goes when the road is taken up, and a planted median goes when its
// street is downgraded below paving.
//
// dressSpots() says where each tree, hedge plant, lamp and stretch of median
// stands. They keep to straight runs and dead ends, so junctions and bends
// stay open, and they leave gaps at driveways, street lamps and power poles,
// and where a building stands forward into the verge.

import { CONFIG, DRESSINGS, dressRefund } from '../config.js';
import { HALF, SIDES, roadTile } from './roadShape.js';
import { doorPoint } from './world.js';
import { hash2 } from '../util/rng.js';

export const keyOf = (kind) => (DRESSINGS[kind] ? DRESSINGS[kind].key : null);

// The street lamp a plain cobbled or paved street has on some straight
// tiles (the road view draws it; dressings keep clear of it). A lamp-lit
// street has its own lamps instead.
export function plainLamp(w, x, z) {
  const L = w.roadAt(x, z);
  if (L < 2 || w.railAt(x, z) || w.terrain.isWater(x, z)) return null;
  if (w.dress && keyOf(w.dress[w.idx(x, z)]) === 'lamps') return null;
  const n = !!w.roadAt(x, z - 1), s = !!w.roadAt(x, z + 1), wv = !!w.roadAt(x - 1, z), e = !!w.roadAt(x + 1, z);
  const ns = n && s && !e && !wv, ew = e && wv && !n && !s;
  if (!(ns || ew) || hash2(x, z, 91) >= 0.4) return null;
  const side = hash2(x, z, 92) < 0.5 ? -1 : 1;
  return { x: x + 0.5 + (ns ? side * 0.31 : 0), z: z + 0.5 + (ew ? side * 0.31 : 0) };
}

// What dressing these road tiles with `kind` would do (0 takes dressings
// away). Returns { kind, tiles: [{ x, z, from, cost, refund, reason }], n
// (tiles that change), cost, refund, blocked: [{ reason, n }], short }.
// Replacing or taking away a dressing pays back a quarter of its price.
export function planDress(w, list, kind) {
  const D = DRESSINGS[kind] || null, seen = new Set(), tiles = [], blocked = new Map();
  let n = 0, cost = 0, refund = 0;
  const block = (t, reason) => { t.reason = reason; blocked.set(reason, (blocked.get(reason) || 0) + 1); };
  for (const [x, z] of list) {
    if (!w.inBounds(x, z)) continue;
    const i = w.idx(x, z), L = w.roads[i];
    if (!L || seen.has(i)) continue;
    seen.add(i);
    const from = w.dress[i], t = { x, z, from, cost: 0, refund: 0, reason: null };
    tiles.push(t);
    const s = roadTile(w, x, z);
    if (!s) block(t, 'Bridges stay plain');
    else if (s.bridge.some(Boolean)) block(t, 'The ramps up to a bridge stay plain');
    else if (w.rails[i]) block(t, 'Not across a level crossing');
    else if (!D) { if (!from) block(t, 'Nothing to take away'); }
    else if (from === kind) block(t, `Already a ${D.name.toLowerCase()}`);
    else if (D.minLevel && L < D.minLevel) block(t, 'Only on paved streets');
    else if (w.unlockPop < D.unlock) block(t, `Unlocks at ${D.unlock} villagers`);
    if (t.reason) continue;
    t.cost = D ? D.cost : 0;
    t.refund = dressRefund(from);
    n++; cost += t.cost; refund += t.refund;
  }
  // buildings standing forward onto tiles that get trees or hedges step back
  const back = [];
  if (D && D.verge && n) {
    const on = new Set(tiles.filter(t => !t.reason).map(t => w.idx(t.x, t.z)));
    for (const b of w.buildings.values()) if (b.front > 0 && w._frontTiles(b).some(([x, z]) => w.inBounds(x, z) && on.has(w.idx(x, z)))) back.push(b.id);
  }
  const plan = { kind, tiles, n, cost, refund, back, blocked: [...blocked].map(([reason, k]) => ({ reason, n: k })), short: null };
  if (n && cost - refund > w.money) plan.short = 'Not enough money';
  return plan;
}

export function applyDress(w, list, kind) {
  if (!Number.isInteger(kind) || kind < 0 || kind >= DRESSINGS.length) return { ok: false, reason: "That action isn't valid" };
  const plan = planDress(w, list, kind);
  if (!plan.n) return { ok: false, reason: plan.blocked.length ? plan.blocked[0].reason : 'No road there' };
  if (plan.short) return { ok: false, reason: plan.short };
  for (const t of plan.tiles) if (!t.reason) w.dress[w.idx(t.x, t.z)] = kind;
  w.money += plan.refund - plan.cost;
  w._updateFronts();   // trees and hedges send buildings standing forward back
  w.emit('dress');
  const skipped = plan.tiles.length - plan.n;
  return { ok: true, n: plan.n, spent: plan.cost, refund: plan.refund, failed: skipped ? plan.blocked[0].reason : null, skipped };
}

// Where everything along the dressed streets stands:
// { trees: [{x, z, s, r}], hedges: [{x, z, r}], lamps: [{x, z}],
//   medians: [{x0, z0, x1, z1}], shrubs: [{x, z, r}] }
export function dressSpots(w) {
  const out = { trees: [], hedges: [], lamps: [], medians: [], shrubs: [] };
  const d = w.dress;
  if (!d || !d.some(Boolean)) return out;
  const N = w.N, t = w.terrain;
  // front doors meeting each dressed tile, and verges with a building
  // standing forward into them (tile * 4 + side)
  const doors = new Map(), fronts = new Set();
  for (const b of w.buildings.values()) {
    if (b.access && d[b.access.z * N + b.access.x]) {
      const k = b.access.z * N + b.access.x, p = b.door || doorPoint(b);
      if (!doors.has(k)) doors.set(k, []);
      doors.get(k).push([p.x, p.z]);
    }
    if (b.front > 0) {
      for (const [fx, fz] of w._frontTiles(b)) {
        if (!w.inBounds(fx, fz) || !d[fz * N + fx]) continue;
        for (let k = 0; k < 4; k++) if (w.buildingOn(fx + SIDES[k][0], fz + SIDES[k][1]) === b) fronts.add((fz * N + fx) * 4 + k);
      }
    }
  }
  const straight = (s, ns) => (ns ? (s.arms[0] || s.arms[2]) && !s.arms[1] && !s.arms[3] : (s.arms[1] || s.arms[3]) && !s.arms[0] && !s.arms[2]);
  const plain = (s, i) => s && !s.bridge.some(Boolean) && !w.rails[i];
  const dry = (x, z) => t.heightAt(x, z) > CONFIG.WATER_LEVEL + 0.04;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, key = keyOf(d[i]);
    if (!key || !w.roads[i]) continue;
    const s = roadTile(w, x, z);
    if (!plain(s, i)) continue;
    const ns = straight(s, true);
    if (!ns && !straight(s, false)) continue;   // junctions, bends and lone tiles stay open
    const cx = x + 0.5, cz = z + 0.5, hw = HALF[s.L];
    const ax = ns ? 0 : 1, az = ns ? 1 : 0;     // along the street
    const px = az, pz = ax;                      // across it: +1 is east or south
    const at = (along, side, off) => [cx + ax * along + px * side * off, cz + az * along + pz * side * off];
    // what already stands on each verge, by how far along the tile
    const busy = { [-1]: [], 1: [] };
    const lamp = plainLamp(w, x, z);
    if (lamp) busy[(lamp.x - cx) * px + (lamp.z - cz) * pz < 0 ? -1 : 1].push(0);
    if (((x + z) & 1) === 0 && !(w.buried && w.buried[i])) busy[1].push(0.31);   // a power pole's spot, by the south-east corner
    for (const [dx, dz] of doors.get(i) || []) busy[(dx - cx) * px + (dz - cz) * pz < 0 ? -1 : 1].push((dx - cx) * ax + (dz - cz) * az);
    const clear = (side, along, gap) => busy[side].every(b => Math.abs(b - along) >= gap);
    const open = (side) => !fronts.has(i * 4 + (ns ? (side > 0 ? 1 : 3) : (side > 0 ? 2 : 0)));
    if (key === 'trees') {
      for (const side of [-1, 1]) {
        if (!open(side)) continue;
        const along = [-0.22, 0.26].find(a => clear(side, a, 0.2));
        if (along === undefined) continue;
        const [tx, tz] = at(along, side, hw + 0.1);
        if (dry(tx, tz)) out.trees.push({ x: tx, z: tz, s: 0.55 + hash2(x * 2 + (side > 0 ? 1 : 0), z, 21) * 0.12, r: hash2(x, z * 2 + (side > 0 ? 1 : 0), 22) * 6.28 });
      }
    } else if (key === 'hedges') {
      for (const side of [-1, 1]) {
        if (!open(side)) continue;
        for (let k = 0; k < 13; k++) {
          const a = -0.45 + k * 0.075;
          if (!clear(side, a, 0.13)) continue;
          const [hx, hz] = at(a, side, hw + 0.065);
          if (dry(hx, hz)) out.hedges.push({ x: hx, z: hz, r: hash2(x * 13 + k, z, 23) * 6.28 });
        }
      }
    } else if (key === 'lamps') {
      // every other tile, on alternate sides
      if (((x + z) & 1) !== 0) continue;
      const side = ((x + z) >> 1) & 1 ? 1 : -1;
      const along = [0, -0.27, 0.27].find(a => clear(side, a, 0.14));
      if (along === undefined) continue;
      const [lx, lz] = at(along, side, Math.max(0.31, hw + 0.04));
      out.lamps.push({ x: lx, z: lz });
    } else if (key === 'median' && s.L >= 3 && (ns ? s.arms[0] && s.arms[2] : s.arms[1] && s.arms[3])) {
      // through the middle of a paved street, rounded off short of anything
      // that isn't more of the same boulevard
      const more = (dx, dz) => {
        const j = (z + dz) * N + x + dx, o = roadTile(w, x + dx, z + dz);
        return keyOf(d[j]) === 'median' && plain(o, j) && o.L >= 3 && (ns ? o.arms[0] && o.arms[2] : o.arms[1] && o.arms[3]) && straight(o, ns);
      };
      const a0 = more(-ax, -az) ? -0.5 : -0.3, a1 = more(ax, az) ? 0.5 : 0.3;
      out.medians.push({ x0: cx + ax * a0, z0: cz + az * a0, x1: cx + ax * a1, z1: cz + az * a1 });
      for (let a = -0.38; a < a1 - 0.08; a += 0.25) if (a > a0 + 0.08) out.shrubs.push({ x: cx + ax * a, z: cz + az * a, r: hash2(x, z, 24) * 6.28 });
    }
  }
  return out;
}
