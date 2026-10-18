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

// half-width of the roadway per road level, and the band of edging stones
// along the sides of cobbled and paved streets
export const HALF = [0, 0.16, 0.215, 0.27];
export const BAND = 0.035;
// N, E, S, W: clockwise, so side k and side (k + 1) & 3 share a corner
export const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Road level across one side of a tile (the road to the outside world runs on
// off the edge of the map).
function linkL(w, x, z, dx, dz) {
  const nx = x + dx, nz = z + dz;
  if (w.inBounds(nx, nz)) return w.roads[nz * w.N + nx];
  return x === w.entry.x && z === w.entry.z ? w.roads[z * w.N + x] : 0;
}

// Shape of the road on a land tile, or null (no road, or a bridge):
// { x, z, L, hw, arms[4] (half-width per side, 0 = no arm), bridge[4],
//   bend (corner index of a quarter-ring turn, or -1), fillets [corner index] }
export function roadTile(w, x, z) {
  if (!w.inBounds(x, z)) return null;
  const L = w.roads[z * w.N + x];
  if (!L || w.terrain.isWater(x, z)) return null;
  const hw = HALF[L];
  const arms = [0, 0, 0, 0], bridge = [false, false, false, false];
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = SIDES[k];
    const Ln = linkL(w, x, z, dx, dz);
    if (!Ln) continue;
    arms[k] = Math.min(hw, HALF[Ln]);
    bridge[k] = w.inBounds(x + dx, z + dz) && w.terrain.isWater(x + dx, z + dz);
  }
  let bend = -1;
  const ks = [0, 1, 2, 3].filter(k => arms[k]);
  if (ks.length === 2 && !bridge[ks[0]] && !bridge[ks[1]]) {
    if (ks[1] - ks[0] === 1) bend = ks[0];
    else if (ks[0] === 0 && ks[1] === 3) bend = 3;
  }
  const fillets = [];
  if (bend < 0) {
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) & 3;
      if (arms[k] && arms[k2] && !bridge[k] && !bridge[k2]) fillets.push(k);
    }
  }
  return { x, z, L, hw, arms, bridge, bend, fillets };
}

// Corner k of tile (x, z): the corner point K and the unit axes u and v
// pointing from it into the tile. A point is K + u * (ux, uz) + v * (vx, vz).
export function cornerFrame(x, z, k) {
  const [ax, az] = SIDES[k], [bx, bz] = SIDES[(k + 1) & 3];
  return { Kx: x + 0.5 + (ax + bx) * 0.5, Kz: z + 0.5 + (az + bz) * 0.5, ux: -bx, uz: -bz, vx: -ax, vz: -az };
}

const ell = (u, v, ru, rv) => (u / ru) * (u / ru) + (v / rv) * (v / rv);

// What lies at a point of a tile's road shape: 0 off the road, 1 roadway,
// 2 edging stones (within `band` of an edge; pass 0 for no band).
export function shapeAt(s, px, pz, band = s.L >= 2 ? BAND : 0) {
  const { x, z, hw, arms } = s;
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

// The road surface at a world point (land tiles only; 0 off the road).
export function surfaceAt(w, px, pz) {
  const s = roadTile(w, Math.floor(px), Math.floor(pz));
  return s ? shapeAt(s, px, pz) : 0;
}

// Whether someone turning a corner on tile (x, z) may cut it along the
// road's curve: any land road tile that isn't a ramp up to a bridge.
export function curvesAt(w, x, z) {
  const s = roadTile(w, x, z);
  return !!s && !s.bridge.some(Boolean);
}
