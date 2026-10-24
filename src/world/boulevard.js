// Boulevards: roads laid directly side by side become one boulevard, a lane
// each way with a median between them, instead of a wide slab of road.
//
// They come from the road layout alone, so they are never saved or sent:
// findBoulevards() works them out again whenever the roads or the track
// change (World._boulevards), for saves, guests and merged villages alike.
// The result is world.blvd, one byte per tile: a bit for each side (N, E,
// S, W as in roadShape's SIDES) with a median across it. The road shape
// (roadShape.js) has no arm across a median, so each lane is laid as a
// street of its own, and the median is the verge between them.
//
// Where it runs: a strip of road two or more tiles wide (a run of road down
// a column, for a boulevard running east-west) that carries on for longer
// than it is wide. At a junction column the strip is wider than its
// neighbours (a street crosses or meets it), so the lanes join there and
// the median stops short in a rounded nose, filling the curved inside
// corners of the junction. At the boulevard's ends the lanes join too: in a
// turning loop round the median's nose where the road stops, or merging
// into the road that carries on. A level crossing breaks the median for the
// track; over water the two lanes cross on bridges of their own. Where a
// two-lane boulevard turns a corner (a 2 × 2 block with one boulevard
// coming in on one side and one going out on a side next to it), the
// median turns the corner with it.
//
// Each lane tile can hold a look (DRESSINGS with blvd: true, chosen in the
// road selection panel like a street's dressing, kept in the high bits of
// world.dress beside any street dressing; see packDress in config.js):
// trees, flower beds, a tram reservation, a cobbled promenade with fountains
// and statues, or a hedge. Without one it is a grass median. A street
// dressing on a lane keeps to its outer verge; a look goes again when its
// tile stops being a boulevard (dressFits).

import { DRESSINGS, lookPart } from '../config.js';
import { HALF, spillsOf } from './roadShape.js';
import { hash2 } from '../util/rng.js';

// the world.blvd bit for each side
const N_ = 1, E = 2, S = 4, W = 8;

// Which sides of each tile have a median across them. roads: the road grid
// to read (a plan can pass one with some tiles taken up); out: the array to
// fill (a new one if not given).
export function findBoulevards(w, roads = w.roads, out = null) {
  const N = w.N, rails = w.rails;
  if (!out || out.length !== N * N) out = new Uint8Array(N * N);
  else out.fill(0);
  // (tiles a diagonal street touches never make a boulevard: see diagonal.js)
  let diag = null;
  if (w.diagN) {
    diag = new Uint8Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if ((w.diag[z * N + x] & 15) || spillsOf(w, x, z)) diag[z * N + x] = 1;
  }
  const road = (x, z) => x >= 0 && z >= 0 && x < N && z < N && roads[z * N + x] > 0 && !(diag && diag[z * N + x]);
  // two passes: boulevards running east-west (strips down each column,
  // ax 0) and north-south (strips along each row, ax 1). u runs along the
  // boulevard, v across it.
  for (const ax of [0, 1]) {
    const has = ax ? (u, v) => road(v, u) : (u, v) => road(u, v);
    const id = ax ? (u, v) => u * N + v : (u, v) => v * N + u;
    const first = ax ? E : S, second = ax ? W : N_, other = ax ? (N_ | S) : (E | W);
    for (let u = 0; u < N; u++) {
      for (let v = 0; v < N;) {
        if (!has(u, v)) { v++; continue; }
        let v1 = v;
        while (v1 + 1 < N && has(u, v1 + 1)) v1++;
        const T = v1 - v + 1;
        if (T >= 2) {
          // how far the strip carries on either way (through junctions)
          const full = (uu) => {
            if (uu < 0 || uu >= N) return false;
            for (let q = v; q <= v1; q++) if (!has(uu, q)) return false;
            return true;
          };
          let a = u, b = u;
          while (full(a - 1)) a--;
          while (full(b + 1)) b++;
          // longer than it is wide, and not at either end (where the lanes join)
          if (u > a && u < b && b - a + 1 > T) {
            for (let q = v; q < v1; q++) {
              const i = id(u, q), j = id(u, q + 1);
              if (rails[i] || rails[j] || (out[i] & other) || (out[j] & other)) continue;
              out[i] |= first; out[j] |= second;
            }
          }
        }
        v = v1 + 1;
      }
    }
  }
  // corners: a two-lane boulevard turning through a 2 × 2 block
  const bits = (x, z) => (x >= 0 && z >= 0 && x < N && z < N ? out[z * N + x] : 0);
  const land = (x, z) => road(x, z) && !w.terrain.isWater(x, z) && !rails[z * N + x];
  for (let r = 0; r + 1 < N; r++) for (let c = 0; c + 1 < N; c++) {
    if (!land(c, r) || !land(c + 1, r) || !land(c, r + 1) || !land(c + 1, r + 1)) continue;
    if (bits(c, r) || bits(c + 1, r) || bits(c, r + 1) || bits(c + 1, r + 1)) continue;
    const ewW = (bits(c - 1, r) & S) && (bits(c - 1, r + 1) & N_), ewE = (bits(c + 2, r) & S) && (bits(c + 2, r + 1) & N_);
    const nsN = (bits(c, r - 1) & E) && (bits(c + 1, r - 1) & W), nsS = (bits(c, r + 2) & E) && (bits(c + 1, r + 2) & W);
    if (!ewW === !ewE || !nsN === !nsS) continue;
    // nothing else meets the block on its other two sides
    const ox = ewW ? c + 2 : c - 1, oz = nsN ? r + 2 : r - 1;
    if (road(ox, r) || road(ox, r + 1) || road(c, oz) || road(c + 1, oz)) continue;
    const col = ewW ? c : c + 1, row = nsN ? r : r + 1;
    out[r * N + col] |= S; out[(r + 1) * N + col] |= N_;
    out[row * N + c] |= E; out[row * N + c + 1] |= W;
  }
  return out;
}

// Whether a street's dressing or a boulevard's look suits tile i now: a
// look needs a boulevard lane, and a planted median down the middle of a
// street needs a street that isn't one.
export function dressFits(w, i, kind) {
  const D = DRESSINGS[kind];
  if (!D) return true;
  const lane = !!(w.blvd && w.blvd[i]);
  if (D.blvd) return lane;
  if (D.key === 'median') return !lane;
  return true;
}

export const isLane = (w, x, z) => !!(w.blvd && w.inBounds(x, z) && w.blvd[w.idx(x, z)]);

// The boulevard through lane tile (x, z): both (or all) of its lanes, up to
// the junctions at either end and round its corners. [] off a boulevard.
export function boulevardTiles(w, x, z) {
  if (!isLane(w, x, z)) return [];
  const N = w.N, B = w.blvd, seen = new Set([z * N + x]), out = [[x, z]], q = [[x, z]];
  while (q.length) {
    const [cx, cz] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (!w.inBounds(nx, nz) || seen.has(nz * N + nx) || !B[nz * N + nx]) continue;
      seen.add(nz * N + nx);
      out.push([nx, nz]);
      q.push([nx, nz]);
    }
  }
  return out;
}

// The look a lane tile shows on its side of the median: a DRESSINGS key
// ('btrees', 'bflowers', 'btram', 'bprom', 'bhedge') or null for grass.
export function lookAt(w, i) {
  const D = DRESSINGS[w.dress ? lookPart(w.dress[i]) : 0];
  return D && D.blvd && w.blvd && w.blvd[i] ? D.key : null;
}

// The medians, one tile-long piece at a time, along the tile edges they
// straddle (land on both sides only: twin bridges have none):
// { x0, z0, x1, z1 (the edge), alongX, a, b (the tiles either side, index;
//   a is the north or west one), wa, wb (how far the median reaches into
//   each, from the edge), look, k (its place along its straight run), n
//   (the run's length), c (the run's middle line: z for alongX, else x) }
export function medianSegs(w) {
  const N = w.N, B = w.blvd, t = w.terrain, segs = [];
  if (!B || !B.some(Boolean)) return segs;
  const runs = new Map();
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x;
    if (!B[i] || t.isWater(x, z)) continue;
    for (const [bit, dx, dz] of [[S, 0, 1], [E, 1, 0]]) {
      if (!(B[i] & bit)) continue;
      const j = (z + dz) * N + x + dx;
      if (t.isWater(x + dx, z + dz)) continue;
      const alongX = bit === S;
      const wa = 0.5 - HALF[w.roads[i]], wb = 0.5 - HALF[w.roads[j]];
      const s = {
        x0: x + dx, z0: z + dz, x1: x + 1, z1: z + 1, alongX, a: i, b: j, wa, wb,
        look: lookAt(w, i) || lookAt(w, j), k: 0, n: 1,
        c: (alongX ? z + 1 : x + 1) + (wb - wa) / 2,
      };
      segs.push(s);
      const key = (alongX ? 'x' : 'z') + (alongX ? z + 1 : x + 1);
      if (!runs.has(key)) runs.set(key, []);
      runs.get(key).push(s);
    }
  }
  // number each straight run of median along its line
  for (const list of runs.values()) {
    list.sort((p, q) => (p.alongX ? p.x0 - q.x0 : p.z0 - q.z0));
    let start = 0;
    for (let k = 1; k <= list.length; k++) {
      const prev = list[k - 1], cur = list[k];
      const next = cur && (cur.alongX ? cur.x0 === prev.x1 : cur.z0 === prev.z1) && cur.look === prev.look;
      if (next) continue;
      for (let m = start; m < k; m++) { list[m].k = m - start; list[m].n = k - start; }
      start = k;
    }
  }
  return segs;
}

// The lattice points the medians touch (z * (N + 1) + x), each with the look
// of a median piece meeting it: where a median ends in a nose or turns a
// corner, the curved corners of the road round that point are median too.
export function medianPoints(w, segs = medianSegs(w)) {
  const M = w.N + 1, pts = new Map();
  for (const s of segs) for (const [x, z] of [[s.x0, s.z0], [s.x1, s.z1]]) {
    const k = z * M + x;
    if (!pts.has(k) || (!pts.get(k) && s.look)) pts.set(k, s.look);
  }
  return pts;
}

// Where everything along the boulevards stands, by kind:
// { trees: [{x, z, s, r}], hedges: [{x, z, r}], balls: [{x, z, r}],
//   beds: [{x, z, len, wid, alongX, h}], blooms: [{x, z, h}],
//   tufts: [{x, z, r, s}], shrubs: [{x, z, r}], lamps: [{x, z}],
//   benches: [{x, z, ry}], fountains: [{x, z, r, h}], statues: [{x, z, ry, h}],
//   rails: [{x0, z0, x1, z1}], wires: [{x0, z0, x1, z1}],
//   poles: [{x, z, ax, az}] (a tram pole and the way its arm reaches),
//   shelters: [{x, z, ry}] }
// (Positions in world x, z; the views put them on the ground.)
export function boulevardSpots(w, segs = medianSegs(w)) {
  const out = { trees: [], hedges: [], balls: [], beds: [], blooms: [], tufts: [], shrubs: [], lamps: [], benches: [], fountains: [], statues: [], rails: [], wires: [], poles: [], shelters: [] };
  for (const s of segs) {
    // the middle of the median along this piece, and across it
    const ax = s.alongX ? 1 : 0, az = s.alongX ? 0 : 1, px = az, pz = ax;
    const half = (s.wa + s.wb) / 2;
    const ox = s.alongX ? s.x0 : s.c, oz = s.alongX ? s.c : s.z0;
    const at = (along, off = 0) => [ox + ax * along + px * off, oz + az * along + pz * off];
    const h = (salt) => hash2(s.x0 * 7 + (s.alongX ? 0 : 3), s.z0 * 5 + salt, 61);
    const first = s.k === 0, last = s.k === s.n - 1;
    const tuft = (n) => {
      for (let q = 0; q < n; q++) {
        const [x, z] = at(0.08 + h(q) * 0.84, (h(q + 9) - 0.5) * 2 * Math.max(0, half - 0.08));
        out.tufts.push({ x, z, r: h(q + 20) * 6.28, s: 0.7 + h(q + 30) * 0.5 });
      }
    };
    switch (s.look) {
      case 'btrees': {
        const [x, z] = at(0.5 + (h(1) - 0.5) * 0.08);
        out.trees.push({ x, z, s: 0.62 + h(2) * 0.1, r: h(3) * 6.28 });
        // a lamp between every other pair of trees
        if (!last && (s.k & 1) === 0) { const [lx, lz] = at(1); out.lamps.push({ x: lx, z: lz }); }
        tuft(2);
        break;
      }
      case 'bflowers': {
        const len = 0.66, wid = Math.min(0.24, 2 * half - 0.16);
        const [x, z] = at(0.5);
        out.beds.push({ x, z, len, wid, alongX: s.alongX, h: h(4) });
        // the bedding plants, in two rows (each a leafy clump in flower)
        for (let q = 0; q < 14; q++) {
          const [bx, bz] = at(0.5 + ((q % 7) - 3) * (len - 0.1) / 7, ((q < 7 ? -1 : 1) * wid) / 4.2);
          out.blooms.push({ x: bx, z: bz, h: h(4), r: h(q + 50) * 6.28 });
        }
        // a clipped shrub where one bed ends and the next begins
        if (!last) { const [sx, sz] = at(1); out.shrubs.push({ x: sx, z: sz, r: h(5) * 6.28 }); }
        tuft(1);
        break;
      }
      case 'btram': {
        // two rails down the middle, the wire above them, a pole every other
        // tile on alternate sides, benches and now and then a shelter
        for (const o of [-0.05, 0.05]) { const [x0, z0] = at(0, o), [x1, z1] = at(1, o); out.rails.push({ x0, z0, x1, z1 }); }
        { const [x0, z0] = at(0), [x1, z1] = at(1); out.wires.push({ x0, z0, x1, z1 }); }
        if ((s.k & 1) === 0) {
          const side = (s.k >> 1) & 1 ? 1 : -1, [x, z] = at(0.5, side * (half - 0.05));
          out.poles.push({ x, z, ax: -px * side, az: -pz * side });
        }
        if (s.n >= 3 && s.k % 3 === 1) {
          // facing the rails, for the tram
          const side = h(6) < 0.5 ? -1 : 1, shelter = s.k % 6 === 4;
          const [x, z] = at(0.5 + (shelter ? 0 : 0.18), side * (half - 0.07));
          (shelter ? out.shelters : out.benches).push({ x, z, ry: Math.atan2(-px * side, -pz * side) });
        }
        break;
      }
      case 'bprom': {
        // a fountain, then a statue, every four tiles (the lot centred on the
        // run and clear of its ends), with benches half way between them and
        // lamps every other tile
        const count = s.n >= 3 ? Math.floor((s.n - 3) / 4) + 1 : 0, off = Math.floor((s.n - 1 - 4 * (count - 1)) / 2);
        const q = s.k - off, feature = count && q >= 0 && q % 4 === 0 && q / 4 < count;
        if (feature) {
          const [x, z] = at(0.5);
          if ((q / 4) % 2 === 0) out.fountains.push({ x, z, r: Math.min(0.15, half - 0.06), h: h(7) });
          else out.statues.push({ x, z, ry: Math.atan2(px, pz), h: h(8) });
        } else if (!count || (q + 8) % 4 === 2) {
          for (const side of [-1, 1]) {
            const [x, z] = at(0.5, side * (half - 0.08));
            out.benches.push({ x, z, ry: Math.atan2(px * side, pz * side) });
          }
        }
        if (!last && (s.k & 1) === 1) { const [lx, lz] = at(1); out.lamps.push({ x: lx, z: lz }); }
        break;
      }
      case 'bhedge': {
        // a clipped hedge down the middle, with a gap to cross every third
        // tile between two clipped balls
        const gapEnd = s.n >= 3 && (s.k + 1) % 3 === 0 && !last, gapStart = s.n >= 3 && s.k % 3 === 0 && !first;
        for (let q = 0; q < 13; q++) {
          const a = 0.04 + q * 0.077;
          if ((first && a < 0.16) || (last && a > 0.84) || (gapEnd && a > 0.8) || (gapStart && a < 0.2)) continue;
          const [x, z] = at(a);
          out.hedges.push({ x, z, r: h(q + 40) * 6.28 });
        }
        if (gapEnd) for (const a of [0.84, 1.16]) {
          const [x, z] = at(a);
          out.balls.push({ x, z, r: h(10 + a * 10) * 6.28 });
        }
        break;
      }
      default:
        tuft(3);
    }
  }
  return out;
}
