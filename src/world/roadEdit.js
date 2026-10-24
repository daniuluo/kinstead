// Changing a whole stretch of road at once: pick the tiles (a box, a line,
// or the run of road between two junctions), then upgrade every tile one
// level, downgrade every tile one level, or take them all up.
//
// planRoadEdit() is pure: it says what each tile would become, what it would
// cost or pay back, which tiles can't change and why, and (for taking roads
// up) who would be cut off. applyRoadEdit() makes the change; it runs as the
// 'roadedit' command, so multiplayer guests use it the same way.

import { roadRefund, DRESSINGS, dressRefund, streetPart, lookPart, packDress } from '../config.js';
import { fw, fd } from './world.js';
import { findBoulevards, boulevardTiles, dressFits } from './boulevard.js';
import { linksOf, SIDES, CORNERS, CUT } from './roadShape.js';

export const ROAD_OPS = ['up', 'down', 'remove'];

// how many roads the road on (x, z) runs on to: not across a boulevard's
// median, where the lanes keep apart, nor where a diagonal passes by; and
// diagonally (see diagonal.js)
const degree = (w, x, z) => linksOf(w, x, z).length;

// The stretch of road through tile (x, z): it follows the road round bends
// and stops short of junctions (where three or four roads meet) and at dead
// ends. A junction tile on its own is its own stretch. On a boulevard it is
// the whole boulevard between its junctions, every lane of it, and the
// turning loops at its ends.
export function roadRun(w, x, z) {
  if (!w.roadAt(x, z)) return [];
  const lanes = boulevardTiles(w, x, z);
  if (!lanes.length && degree(w, x, z) >= 3) return [[x, z]];
  const N = w.N, start = lanes.length ? lanes : [[x, z]];
  const seen = new Set(start.map(([a, b]) => b * N + a)), out = start.slice(), q = start.slice();
  while (q.length) {
    const [cx, cz] = q.pop();
    for (const [nx, nz] of linksOf(w, cx, cz)) {
      if (seen.has(nz * N + nx) || degree(w, nx, nz) >= 3) continue;
      seen.add(nz * N + nx);
      out.push([nx, nz]);
      q.push([nx, nz]);
    }
  }
  // a turning loop at a boulevard's end leads into the boulevard
  const lane = !lanes.length && out.find(([a, b]) => w.blvd[w.idx(a, b)]);
  return lane ? roadRun(w, ...lane) : out;
}

// Road tiles inside the box between two tiles (corners included).
export function roadsInBox(w, a, b) {
  const out = [];
  for (let z = Math.max(0, Math.min(a.z, b.z)); z <= Math.min(w.N - 1, Math.max(a.z, b.z)); z++) {
    for (let x = Math.max(0, Math.min(a.x, b.x)); x <= Math.min(w.N - 1, Math.max(a.x, b.x)); x++) if (w.roadAt(x, z)) out.push([x, z]);
  }
  return out;
}

// Road tiles at any of these places.
export function roadsAt(w, list) { return list.filter(([x, z]) => w.roadAt(x, z)); }

// Road tiles beside a building's plot (the ones it could take as its access).
function roadsBeside(b, has) {
  const W = fw(b), D = fd(b), out = [];
  for (let k = 0; k < W; k++) out.push([b.x + k, b.z + D], [b.x + k, b.z - 1]);
  for (let k = 0; k < D; k++) out.push([b.x + W, b.z + k], [b.x - 1, b.z + k]);
  return out.filter(([x, z]) => has(x, z));
}

// What changing these tiles would do. op: 'up' (one level up), 'down' (one
// level down) or 'remove'. paths (optional, a PathFinder) also marks the
// tiles that coach lines run along.
// Returns { op, tiles: [{ x, z, L, to, cost, refund, reason, water, line }],
//   n (tiles that change), cost, refund, bridges, undressed (dressings that
//   would go), blocked: [{ reason, n }],
//   short (why it can't be afforded), and for 'remove':
//   lost / cut / back (building ids: left with no road at all, no longer
//   joined to the way out of town, stepping back from the street),
//   lines / detour (coach line ids: losing their route / taking a detour) }
export function planRoadEdit(w, list, op, { paths = null } = {}) {
  const seen = new Set(), tiles = [], blocked = new Map();
  let n = 0, cost = 0, refund = 0, bridges = 0, undressed = 0;
  const block = (t, reason) => { t.reason = reason; blocked.set(reason, (blocked.get(reason) || 0) + 1); };
  for (const [x, z] of list) {
    if (!w.inBounds(x, z)) continue;
    const i = w.idx(x, z), L = w.roads[i];
    if (!L || seen.has(i)) continue;
    seen.add(i);
    const water = w.terrain.isWater(x, z);
    const t = { x, z, L, to: L, cost: 0, refund: 0, reason: null, water, line: false };
    tiles.push(t);
    if (op === 'up') {
      if (L >= 3) block(t, 'Already a paved street');
      else {
        const c = w.checkRoad(x, z, L + 1);
        if (!c.ok) block(t, c.reason);
        else { t.to = L + 1; t.cost = c.cost; }
      }
    } else if (op === 'down') {
      if (L <= 1) block(t, "Dirt paths can't go any lower (take them up instead)");
      else { t.to = L - 1; t.refund = roadRefund(L, L - 1, water); }
    } else if (x === w.entry.x && z === w.entry.z) block(t, 'The road to the outside world must stay');
    else { t.to = 0; t.refund = roadRefund(L, 0, water); }
    // a street's dressing (and a boulevard's look) goes with it, or when the
    // road is too narrow for it
    const v = w.dress ? w.dress[i] : 0;
    if (!t.reason && v) {
      const goes = (k) => { const D = DRESSINGS[k]; return !!D && (t.to === 0 || (!!D.minLevel && t.to < D.minLevel)); };
      let s = streetPart(v), l = lookPart(v);
      if (goes(s)) { t.refund += dressRefund(s); s = 0; }
      if (goes(l)) { t.refund += dressRefund(l); l = 0; }
      if (packDress(s, l) !== v) { t.undress = true; t.dressTo = packDress(s, l); undressed++; }
    }
    if (!t.reason) { n++; cost += t.cost; refund += t.refund; if (water) bridges++; }
  }
  const plan = { op, tiles, n, cost, refund, bridges, undressed, unlooked: 0, blocked: [...blocked].map(([reason, k]) => ({ reason, n: k })), short: null };
  if (op === 'up' && n && cost > w.money) plan.short = 'Not enough money';
  if (op === 'remove') {
    Object.assign(plan, removalEffects(w, tiles.filter(t => !t.reason), paths));
    // a boulevard whose other lane goes is a plain street again, and its
    // look goes with it (a quarter of its price back)
    if (n && w.dress.some(v => lookPart(v) || (DRESSINGS[streetPart(v)] || {}).key === 'median')) {
      const roads = w.roads.slice();
      for (const t of tiles) if (!t.reason) roads[w.idx(t.x, t.z)] = 0;
      const after = { blvd: findBoulevards(w, roads) };
      for (let i = 0; i < roads.length; i++) {
        const v = w.dress[i];
        if (!v || !roads[i]) continue;
        let lost = false;
        for (const k of [streetPart(v), lookPart(v)]) if (k && !dressFits(after, i, k)) { plan.refund += dressRefund(k); lost = true; }
        if (lost) plan.unlooked++;
      }
    }
  }
  return plan;
}

// Who taking up these tiles would cut off. Each remaining piece of road
// network gets a number; a building keeps its road if any road tile beside
// it survives, and stays joined to the town if one of them is in the piece
// with the way out of town. A coach line keeps its route if every stop still
// shares a piece of road with the next.
function removalEffects(w, gone, paths) {
  const N = w.N, roads = w.roads.slice(), goneSet = new Set();
  for (const t of gone) { roads[t.z * N + t.x] = 0; goneSet.add(t.z * N + t.x); }
  const has = (x, z) => x >= 0 && z >= 0 && x < N && z < N && roads[z * N + x] > 0;
  const piece = new Int32Array(N * N).fill(-1), D = w.diag;
  let np = 0;
  for (let i = 0; i < N * N; i++) {
    if (!roads[i] || piece[i] >= 0) continue;
    const q = [i];
    piece[i] = np;
    while (q.length) {
      const j = q.pop(), x = j % N, z = (j / N) | 0;
      for (let s = 0; s < 4; s++) {
        const [dx, dz] = SIDES[s];
        if (!has(x + dx, z + dz)) continue;
        const k = (z + dz) * N + x + dx;
        // (not where a diagonal passes by, cut off from it)
        if ((D[j] & (CUT << s)) || (D[k] & (CUT << ((s + 2) & 3)))) continue;
        if (piece[k] < 0) { piece[k] = np; q.push(k); }
      }
      if (D[j] & 15) for (let c = 0; c < 4; c++) {
        const [dx, dz] = CORNERS[c];
        if (!(D[j] & (1 << c)) || !has(x + dx, z + dz)) continue;
        const k = (z + dz) * N + x + dx;
        if ((D[k] & (1 << ((c + 2) & 3))) && piece[k] < 0) { piece[k] = np; q.push(k); }
      }
    }
    np++;
  }
  const e = w.entry.z * N + w.entry.x, out = roads[e] ? piece[e] : -2;
  const lost = [], cut = [], back = [];
  if (!gone.length) return { lost, cut, back, lines: [], detour: [] };
  for (const b of w.buildings.values()) {
    if (!b.access) continue;
    const near = roadsBeside(b, has);
    if (!near.length) lost.push(b.id);
    else if (b.connected && !near.some(([x, z]) => piece[z * N + x] === out)) cut.push(b.id);
    if (b.front && w._frontTiles(b).some(([x, z]) => goneSet.has(z * N + x))) back.push(b.id);
  }
  const lines = [], detour = [];
  for (const l of w.lines) {
    if (l.mode !== 'coach' || l.broken) continue;
    const stops = l.stops.map(id => w.buildings.get(id)).filter(Boolean);
    const at = stops.map(b => new Set(roadsBeside(b, has).map(([x, z]) => piece[z * N + x])));
    let ok = at.every(s => s.size > 0);
    for (let i = 0; ok && i < at.length; i++) {
      const next = at[(i + 1) % at.length];
      if (![...at[i]].some(p => next.has(p))) ok = false;
    }
    // the tiles it runs along now
    let uses = false;
    if (paths) {
      for (let i = 0; i < stops.length; i++) {
        const a = stops[i].access, b = stops[(i + 1) % stops.length].access;
        const leg = a && b ? paths.road(a.x, a.z, b.x, b.z) : null;
        if (!leg) continue;
        for (const [x, z] of leg) {
          if (!goneSet.has(z * N + x)) continue;
          uses = true;
          const t = gone.find(g => g.x === x && g.z === z);
          if (t) t.line = true;
        }
      }
    }
    if (!ok) lines.push(l.id);
    else if (uses) detour.push(l.id);
  }
  return { lost, cut, back, lines, detour };
}

// Make the change: every tile that can change does; the rest stay as they
// are. Upgrades are all-or-nothing on money.
export function applyRoadEdit(w, list, op) {
  if (!ROAD_OPS.includes(op)) return { ok: false, reason: "That action isn't valid" };
  const plan = planRoadEdit(w, list, op);
  if (!plan.n) return { ok: false, reason: plan.blocked.length ? plan.blocked[0].reason : 'No road there' };
  if (plan.short) return { ok: false, reason: plan.short };
  for (const t of plan.tiles) {
    if (t.reason) continue;
    const i = w.idx(t.x, t.z);
    w.roads[i] = t.to;
    // anything laid along a road that is taken up goes with it
    if (!t.to && w.buried) w.buried[i] = 0;
    if (t.undress) w.dress[i] = t.dressTo;
  }
  w.money += plan.refund - plan.cost;
  w.updateRoadNetwork();
  const skipped = plan.tiles.length - plan.n;
  return { ok: true, n: plan.n, spent: plan.cost, refund: plan.refund, failed: skipped ? plan.blocked[0].reason : null, skipped };
}
