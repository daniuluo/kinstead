// The shape of the road surface on a land tile, shared by the road mesh, the
// painted shoulders, door paths, power poles and walking villagers.
//
// A road tile is a centre square plus an arm towards every linked neighbour
// (narrowed to meet a lesser road next door). Where a road turns a corner
// (exactly two arms at right angles) the whole tile is a quarter ring around
// the inside tile corner, so the surface, its edging stones and anyone
// walking along it follow a curve. Where two arms meet at a junction, the
// inside corner between them gets a matching fillet, so the grass meets the
// road in a curve there too. Arms that lead onto a bridge stay square: the
// ramp up to the deck runs straight.
//
// Corners use a local frame: corner k is the tile corner K between side k
// and the next side clockwise (k2). u runs from K along side k's edge into
// the tile, v along side k2's edge. The arm on side k has its inside edge at
// u = 0.5 - a_k and the arm on side k2 at v = 0.5 - a_k2, so the fillet (and
// a bend's inside edge) is the quarter ellipse with those radii around K,
// meeting both arms at the tile edge; a bend's outside edge is the quarter
// ellipse with radii 0.5 + a_k and 0.5 + a_k2.
//
// Diagonal streets run from tile centre to tile centre through the corner
// the two tiles share (w.diag; see diagonal.js). Their band of road spills
// over that corner into the two tiles beside it, and they meet the grid at
// 45 degrees, so any tile a diagonal touches (its own tiles, and the tiles
// whose corner it passes) is laid from a field instead: the distance to the
// nearest piece of road (a disc at each tile's centre, a strip along each
// link, the quarter-ellipse fillets of the grid), the diagonals blended in
// smoothly so they meet everything else in a curve. Every tile works the
// field out the same way, so the pieces meet exactly at the tile edges, and
// along an edge shared with an ordinary tile it is that tile's own shape.

// half-width of the roadway per road level, and the band of edging stones
// along the sides of cobbled and paved streets
export const HALF = [0, 0.16, 0.215, 0.27];
export const BAND = 0.035;
// N, E, S, W: clockwise, so side k and side (k + 1) & 3 share a corner
export const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// corner k of a tile, between side k and side k + 1, as the step to the
// diagonal neighbour across it: NE, SE, SW, NW
export const CORNERS = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
// w.diag: bit k (0-3) a diagonal link across corner k; bit CUT << k: the
// road across side k is cut (a diagonal passing by, corner to corner)
export const CUT = 16;

// whether the road across side k of tile (x, z) is cut off
function cutAcross(w, x, z, k) {
  if (!w.diagN) return false;
  const N = w.N, [dx, dz] = SIDES[k], nx = x + dx, nz = z + dz;
  return !!(w.diag[z * N + x] & (CUT << k)) || (nx >= 0 && nz >= 0 && nx < N && nz < N && !!(w.diag[nz * N + nx] & (CUT << ((k + 2) & 3))));
}

// The sides of tile (x, z) cut off from the road beside it (bit k: side k).
export function cutsOf(w, x, z) {
  let m = 0;
  if (w.diagN) for (let k = 0; k < 4; k++) if (cutAcross(w, x, z, k)) m |= 1 << k;
  return m;
}

// Whether the road on tile (x, z) runs on diagonally across corner k: both
// tiles road, both with the link.
export function diagLinked(w, x, z, k) {
  if (!w.diagN || !w.inBounds(x, z)) return false;
  const N = w.N, [dx, dz] = CORNERS[k], nx = x + dx, nz = z + dz;
  return !!(w.diag[z * N + x] & (1 << k)) && nx >= 0 && nz >= 0 && nx < N && nz < N && !!(w.diag[nz * N + nx] & (1 << ((k + 2) & 3)))
    && !!w.roads[z * N + x] && !!w.roads[nz * N + nx];
}

// The corners of tile (x, z) that a diagonal street between two of its
// neighbours passes (bit k: corner k), its band spilling over them.
export function spillsOf(w, x, z) {
  if (!w.diagN) return 0;
  let m = 0;
  for (let k = 0; k < 4; k++) if (diagLinked(w, x + SIDES[k][0], z + SIDES[k][1], (k + 1) & 3)) m |= 1 << k;
  return m;
}

// Road level across one side of a tile (the road to the outside world runs on
// off the edge of the map); 0 across a boulevard's median (w.blvd, see
// boulevard.js), where the lanes keep apart, or where a diagonal cuts it off.
function linkL(w, x, z, dx, dz, k) {
  const nx = x + dx, nz = z + dz;
  if (w.blvd && w.inBounds(x, z) && (w.blvd[z * w.N + x] & (1 << k))) return 0;
  if (cutAcross(w, x, z, k)) return 0;
  if (w.inBounds(nx, nz)) return w.roads[nz * w.N + nx];
  return x === w.entry.x && z === w.entry.z ? w.roads[z * w.N + x] : 0;
}

// Whether the road on tile (x, z) runs on across side k into the road next
// door (not across a median, nor where a diagonal passes by).
export function linked(w, x, z, k) {
  const [dx, dz] = SIDES[k];
  return !!w.roadAt(x, z) && !!w.roadAt(x + dx, z + dz) && !(w.blvd && (w.blvd[z * w.N + x] & (1 << k))) && !cutAcross(w, x, z, k);
}

// Every tile the road on (x, z) leads on to: [nx, nz, diagonal], along the
// grid (not across a median) and diagonally.
export function linksOf(w, x, z) {
  const out = [];
  for (let k = 0; k < 4; k++) if (linked(w, x, z, k)) out.push([x + SIDES[k][0], z + SIDES[k][1], false]);
  if (w.diagN) for (let k = 0; k < 4; k++) if (diagLinked(w, x, z, k)) out.push([x + CORNERS[k][0], z + CORNERS[k][1], true]);
  return out;
}

// Shape of the road on a land tile, or null (no road, or a bridge):
// { x, z, L, hw, arms[4] (half-width per side, 0 = no arm), bridge[4],
//   bend (corner index of a quarter-ring turn, or -1), fillets [corner index],
//   diag[4] (half-width of a diagonal across each corner, 0 = none),
//   spill (bit k: a diagonal between two neighbours passes corner k),
//   sdf (laid from the field: a diagonal touches the tile), prims (its pieces) }
export function roadTile(w, x, z) {
  if (!w.inBounds(x, z)) return null;
  const L = w.roads[z * w.N + x];
  if (!L || w.terrain.isWater(x, z)) return null;
  const hw = HALF[L];
  const arms = [0, 0, 0, 0], bridge = [false, false, false, false];
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = SIDES[k];
    const Ln = linkL(w, x, z, dx, dz, k);
    if (!Ln) continue;
    arms[k] = Math.min(hw, HALF[Ln]);
    bridge[k] = w.inBounds(x + dx, z + dz) && w.terrain.isWater(x + dx, z + dz);
  }
  const diag = [0, 0, 0, 0];
  let spill = 0;
  if (w.diagN) {
    for (let k = 0; k < 4; k++) if (diagLinked(w, x, z, k)) diag[k] = Math.min(hw, HALF[w.roadAt(x + CORNERS[k][0], z + CORNERS[k][1])]);
    spill = spillsOf(w, x, z);
  }
  const sdf = !!spill || diag.some(Boolean);
  let bend = -1;
  const ks = [0, 1, 2, 3].filter(k => arms[k]);
  if (!sdf && ks.length === 2 && !bridge[ks[0]] && !bridge[ks[1]]) {
    if (ks[1] - ks[0] === 1) bend = ks[0];
    else if (ks[0] === 0 && ks[1] === 3) bend = 3;
  }
  const fillets = [];
  if (bend < 0) {
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) & 3;
      // (not round a corner a diagonal runs through)
      if (arms[k] && arms[k2] && !bridge[k] && !bridge[k2] && !diag[k] && !(spill & (1 << k))) fillets.push(k);
    }
  }
  const s = { x, z, L, hw, arms, bridge, bend, fillets, diag, spill, sdf, prims: null };
  if (sdf) s.prims = primsOf(w, s);
  return s;
}

// A straight run of diagonal street on tile shape s, corner to corner and
// nothing else (no road along the grid, none passing its other corners): 0
// for one running NE to SW (corners 0 and 2), 1 for NW to SE, -1 otherwise.
export function diagRun(s) {
  if (!s || !s.sdf || s.spill || s.arms.some(Boolean)) return -1;
  const [a, b, c, d] = s.diag.map(Boolean);
  return a && c && !b && !d ? 0 : b && d && !a && !c ? 1 : -1;
}

// The shape a diagonal street spills over the corners of a tile with no
// road of its own, or null.
export function spillTile(w, x, z) {
  if (!w.diagN || !w.inBounds(x, z) || w.roads[z * w.N + x]) return null;
  const spill = spillsOf(w, x, z);
  if (!spill) return null;
  const s = { x, z, L: 0, hw: 0, arms: [0, 0, 0, 0], bridge: [false, false, false, false], bend: -1, fillets: [], diag: [0, 0, 0, 0], spill, sdf: true, prims: null };
  s.prims = primsOf(w, s);
  return s;
}

// The road shape over tile (x, z), its own or what spills onto it, or null.
export const shapeOf = (w, x, z) => roadTile(w, x, z) || spillTile(w, x, z);

// Corner k of tile (x, z): the corner point K and the unit axes u and v
// pointing from it into the tile. A point is K + u * (ux, uz) + v * (vx, vz).
export function cornerFrame(x, z, k) {
  const [ax, az] = SIDES[k], [bx, bz] = SIDES[(k + 1) & 3];
  return { Kx: x + 0.5 + (ax + bx) * 0.5, Kz: z + 0.5 + (az + bz) * 0.5, ux: -bx, uz: -bz, vx: -ax, vz: -az };
}

const ell = (u, v, ru, rv) => (u / ru) * (u / ru) + (v / rv) * (v / rv);

// ------------------------------------------------------------ the field
// The pieces of road that reach a tile touched by a diagonal: its centre
// disc, a strip along each of its links (from centre to centre, so both
// tiles have the same one), its grid fillets, and the diagonals passing its
// corners. Each knows its road level (a strip between two tiles: the lesser
// of theirs, as it spills over a tile with no road of its own; a road tile
// is laid all in its own level). soft: blended in smoothly.
const SOFT = 0.1;
// (a diagonal is a capsule, reaching a hair past each tile centre, so two
// in a line overlap there and join without a seam, and a dead end is round)
function strip(ax, az, bx, bz, hw, La, Lb, soft) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  return { t: soft ? 3 : 0, cx: (ax + bx) / 2, cz: (az + bz) / 2, ux: dx / len, uz: dz / len, hl: len / 2 + (soft ? 0.02 : 0), hw, L: Math.min(La, Lb) || La || Lb, soft };
}
function primsOf(w, s) {
  const { x, z, L, hw } = s, cx = x + 0.5, cz = z + 0.5, out = [];
  if (L) {
    out.push({ t: 1, cx, cz, r: hw, L });
    for (let k = 0; k < 4; k++) {
      if (!s.arms[k]) continue;
      const [dx, dz] = SIDES[k], nx = x + dx, nz = z + dz;
      out.push(strip(cx, cz, cx + dx, cz + dz, s.arms[k], L, w.inBounds(nx, nz) ? w.roads[nz * w.N + nx] : L, false));
    }
    for (const k of s.fillets) {
      const f = cornerFrame(x, z, k);
      out.push({ t: 2, ...f, ru: 0.5 - s.arms[k], rv: 0.5 - s.arms[(k + 1) & 3], L });
    }
    for (let k = 0; k < 4; k++) {
      if (!s.diag[k]) continue;
      const [dx, dz] = CORNERS[k];
      out.push(strip(cx, cz, cx + dx, cz + dz, s.diag[k], L, w.roadAt(x + dx, z + dz), true));
    }
  }
  for (let k = 0; k < 4; k++) {
    if (!(s.spill & (1 << k))) continue;
    // the diagonal between the neighbours on side k and side k + 1
    const [ax, az] = SIDES[k], [bx, bz] = SIDES[(k + 1) & 3];
    const La = w.roadAt(x + ax, z + az), Lb = w.roadAt(x + bx, z + bz);
    out.push(strip(cx + ax, cz + az, cx + bx, cz + bz, HALF[Math.min(La, Lb)], La, Lb, true));
  }
  return out;
}

// One piece's signed distance at a point (< 0 on the road).
// (and the way it grows fastest there, into _g: which way the nearest edge
// faces)
const _g = [0, 0];
function primAt(p, px, pz) {
  if (p.t === 1) {
    const dx = px - p.cx, dz = pz - p.cz, r = Math.hypot(dx, dz) || 1e-9;
    _g[0] = dx / r; _g[1] = dz / r;
    return r - p.r;
  }
  if (p.t === 3) {
    const dx = px - p.cx, dz = pz - p.cz, a = Math.max(-p.hl, Math.min(p.hl, dx * p.ux + dz * p.uz));
    const ex = dx - a * p.ux, ez = dz - a * p.uz, r = Math.hypot(ex, ez) || 1e-9;
    _g[0] = ex / r; _g[1] = ez / r;
    return r - p.hw;
  }
  if (p.t === 0) {
    const dx = px - p.cx, dz = pz - p.cz, a = dx * p.ux + dz * p.uz, b = dz * p.ux - dx * p.uz;
    const qa = Math.abs(a) - p.hl, qb = Math.abs(b) - p.hw, sa = a < 0 ? -1 : 1, sb = b < 0 ? -1 : 1;
    // along the strip (u) and across it (-uz, ux)
    let ga = 0, gb = 0;
    if (qa > 0 && qb > 0) { const l = Math.hypot(qa, qb); ga = (sa * qa) / l; gb = (sb * qb) / l; } else if (qa > qb) ga = sa; else gb = sb;
    _g[0] = ga * p.ux - gb * p.uz; _g[1] = ga * p.uz + gb * p.ux;
    return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0);
  }
  const dx = px - p.Kx, dz = pz - p.Kz;
  const u = dx * p.ux + dz * p.uz, v = dx * p.vx + dz * p.vz;
  _g[0] = -(p.ux + p.vx) * Math.SQRT1_2; _g[1] = -(p.uz + p.vz) * Math.SQRT1_2;
  if (u < 0 || v < 0 || u > 0.5 || v > 0.5) return 1;
  const e = Math.sqrt(ell(u, v, p.ru, p.rv));
  if (e < 1e-6) return Math.min(p.ru, p.rv);
  const gu = u / (p.ru * p.ru), gv = v / (p.rv * p.rv), g = Math.hypot(gu, gv);
  // (the grass inside the curve is where it grows: back towards the corner)
  _g[0] = -(gu * p.ux + gv * p.vx) / g; _g[1] = -(gu * p.uz + gv * p.vz) / g;
  return (1 - e) / (g / e);
}

// The field at a point of a tile laid from it: [distance (< 0 on the road),
// road level of the nearest piece]. The grid's pieces meet as they always
// have (the nearest wins). Diagonals are blended in where they meet anything
// at an angle, which rounds the corners there; where two pieces run the same
// way (a straight diagonal from tile to tile, past a tile's centre disc) they
// simply join, so the edge stays straight. (The array is reused: read it
// before the next call.)
const _f = [0, 0];
export function fieldAt(prims, px, pz) {
  let f = 9, fx = 0, fz = 0, best = 9, bl = 0;
  for (const p of prims) {
    if (p.soft) continue;
    const d = primAt(p, px, pz);
    if (d < f) { f = d; fx = _g[0]; fz = _g[1]; }
    if (d < best) { best = d; bl = p.L; }
  }
  for (const p of prims) {
    if (!p.soft) continue;
    const d = primAt(p, px, pz);
    if (d < best) { best = d; bl = p.L; }
    const gx = _g[0], gz = _g[1], m = Math.min(f, d);
    // how sharply the two edges meet: none for the same way, all by 45 degrees
    const w = Math.min(1, Math.max(0, (1 - Math.abs(fx * gx + fz * gz)) / 0.29)), k = SOFT * w;
    const h = k > 1e-6 ? Math.max(k - Math.abs(f - d), 0) / k : 0;
    if (d < f) { fx = gx; fz = gz; }
    f = m - h * h * k * 0.25;
  }
  _f[0] = f;
  _f[1] = bl;
  return _f;
}

// What lies at a point of a tile's road shape: 0 off the road, 1 roadway,
// 2 edging stones (within `band` of an edge; pass 0 for no band).
export function shapeAt(s, px, pz, band) {
  const { x, z, hw, arms } = s;
  if (s.sdf) {
    const [d, Lf] = fieldAt(s.prims, px, pz), Lp = s.L || Lf;
    if (d > 0) return 0;
    const kb = band === 0 || Lp < 2 ? 0 : band ?? BAND;
    return kb && d > -kb ? 2 : 1;
  }
  if (band === undefined) band = s.L >= 2 ? BAND : 0;
  if (s.bend >= 0) {
    const k = s.bend, f = cornerFrame(x, z, k);
    const dx = px - f.Kx, dz = pz - f.Kz;
    const u = dx * f.ux + dz * f.uz, v = dx * f.vx + dz * f.vz;
    const a = arms[k], b = arms[(k + 1) & 3];
    if (ell(u, v, 0.5 - a, 0.5 - b) < 1 || ell(u, v, 0.5 + a, 0.5 + b) > 1) return 0;
    if (band && (ell(u, v, 0.5 - a + band, 0.5 - b + band) < 1 || ell(u, v, 0.5 + a - band, 0.5 + b - band) > 1)) return 2;
    return 1;
  }
  for (const k of s.fillets) {
    const f = cornerFrame(x, z, k);
    const dx = px - f.Kx, dz = pz - f.Kz;
    const u = dx * f.ux + dz * f.uz, v = dx * f.vx + dz * f.vz;
    if (u < 0 || v < 0 || u > 0.5 || v > 0.5) continue;
    const ru = 0.5 - arms[k], rv = 0.5 - arms[(k + 1) & 3];
    if (ell(u, v, ru, rv) < 1) return 0;
    return band && ell(u, v, ru + band, rv + band) < 1 ? 2 : 1;
  }
  const lx = px - x - 0.5, lz = pz - z - 0.5;
  if (Math.abs(lx) <= hw && Math.abs(lz) <= hw) {
    if (!band) return 1;
    for (let k = 0; k < 4; k++) {
      if (arms[k]) continue;
      const along = lx * SIDES[k][0] + lz * SIDES[k][1];
      if (along > hw - band) return 2;
    }
    return 1;
  }
  for (let k = 0; k < 4; k++) {
    if (!arms[k]) continue;
    const [ax, az] = SIDES[k];
    const along = lx * ax + lz * az, side = Math.abs(lx * az - lz * ax);
    if (along < hw || along > 0.5 + 1e-9 || side > arms[k]) continue;
    return band && side > arms[k] - band ? 2 : 1;
  }
  return 0;
}

// The road surface at a world point (land tiles only; 0 off the road),
// diagonals spilling over a tile's corner included.
export function surfaceAt(w, px, pz) {
  const s = shapeOf(w, Math.floor(px), Math.floor(pz));
  return s ? shapeAt(s, px, pz) : 0;
}

// Whether someone turning a corner on tile (x, z) may cut it along the
// road's curve: any land road tile that isn't a ramp up to a bridge (where
// diagonals meet, they turn at a point).
export function curvesAt(w, x, z) {
  const s = roadTile(w, x, z);
  return !!s && !s.bridge.some(Boolean) && !s.sdf;
}
