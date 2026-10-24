// Diagonal streets: roads laid at 45 degrees, from tile centre to tile
// centre across the corner the two tiles share.
//
// The road grid (w.roads) says where the roads are and how good; w.diag, a
// byte a tile, says how diagonals link them: bit k (0-3) a link across
// corner k (CORNERS in roadShape.js: NE, SE, SW, NW) and bit CUT << k a cut
// across side k, where a tile on a diagonal doesn't join the road beside it
// (the street passes by, corner to corner). Roads along the grid join every
// road beside them, as they always have, unless one of the two is cut off.
// Old saves have no diagonals and no cuts.
//
// A drag lays its tiles in order (strokeTiles). A step across a corner links
// its two tiles; a tile the drag lays new is cut off from the two tiles
// beside that step, so the diagonal doesn't join every road it brushes past.
// A step along the grid joins its two tiles even where they were cut apart:
// a street drawn into a diagonal (or a diagonal drawn out of a street) makes
// a junction there. tidyDiag keeps the bytes consistent after any change.
//
// A building whose plot has a diagonal passing its corner faces it, turned
// 45 degrees on its plot (b.diag, worked out by World._updateFronts from the
// roads, never saved). Only a plain one-tile building can stand like that;
// a diagonal can't brush past the corner of anything bigger.

import { BUILDINGS } from '../defs.js';
import { SIDES, CORNERS, CUT } from './roadShape.js';

// The tiles a drag from tile a to tile b lays, in order. Along the grid it
// turns one corner (an L, longer leg first); with diag, a drag nearer 45
// degrees than the grid runs diagonally as far as it can, then straight on.
export function strokeTiles(a, b, diag = true) {
  const out = [];
  const dx = b.x - a.x, dz = b.z - a.z, sx = Math.sign(dx), sz = Math.sign(dz);
  const ax = Math.abs(dx), az = Math.abs(dz), m = Math.min(ax, az);
  if (diag && m > 0 && m >= Math.max(ax, az) * Math.tan(Math.PI / 8)) {
    for (let i = 0; i <= m; i++) out.push([a.x + sx * i, a.z + sz * i]);
    for (let i = 1; i <= ax - m; i++) out.push([a.x + sx * (m + i), a.z + sz * m]);
    for (let j = 1; j <= az - m; j++) out.push([a.x + sx * m, a.z + sz * (m + j)]);
    return out;
  }
  if (ax >= az) {
    for (let i = 0; i <= ax; i++) out.push([a.x + sx * i, a.z]);
    for (let j = 1; j <= az; j++) out.push([b.x, a.z + sz * j]);
  } else {
    for (let j = 0; j <= az; j++) out.push([a.x, a.z + sz * j]);
    for (let i = 1; i <= ax; i++) out.push([a.x + sx * i, b.z]);
  }
  return out;
}

// Whether a list of tiles is a drag: each tile next to the one before it
// (along the grid or across a corner).
export function isStroke(tiles) {
  for (let i = 1; i < tiles.length; i++) {
    const dx = Math.abs(tiles[i][0] - tiles[i - 1][0]), dz = Math.abs(tiles[i][1] - tiles[i - 1][1]);
    if (dx > 1 || dz > 1 || (!dx && !dz)) return false;
  }
  return true;
}

// The corner of tile a that tile b lies across (a diagonal step), or -1.
export function cornerTo(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  return Math.abs(dx) !== 1 || Math.abs(dz) !== 1 ? -1 : CORNERS.findIndex(([cx, cz]) => cx === dx && cz === dz);
}
// The side of tile a that tile b lies across (a step along the grid), or -1.
export function sideTo(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  return SIDES.findIndex(([sx, sz]) => sx === dx && sz === dz);
}

// Link the tiles of a drag (once its tiles are road): see the top. fresh:
// the tile indices the drag laid new.
export function linkStroke(w, tiles, fresh) {
  const N = w.N, D = w.diag;
  for (let i = 1; i < tiles.length; i++) {
    const [ax, az] = tiles[i - 1], [bx, bz] = tiles[i];
    const a = az * N + ax, b = bz * N + bx;
    if (!w.roads[a] || !w.roads[b]) continue;
    const k = cornerTo(ax, az, bx, bz);
    if (k >= 0) {
      D[a] |= 1 << k;
      D[b] |= 1 << ((k + 2) & 3);
      if (fresh.has(a)) D[a] |= (CUT << k) | (CUT << ((k + 1) & 3));
      if (fresh.has(b)) D[b] |= (CUT << ((k + 2) & 3)) | (CUT << ((k + 3) & 3));
      continue;
    }
    const s = sideTo(ax, az, bx, bz);
    if (s < 0) continue;
    D[a] &= ~(CUT << s);
    D[b] &= ~(CUT << ((s + 2) & 3));
  }
}

// Keep w.diag consistent with the roads: a link only between two road tiles
// that both have it, a cut only beside one of the tile's own live links (a
// tile no longer on any diagonal is an ordinary road again), nothing off the
// roads. Counts the links into w.diagN. Every copy of the town (saves,
// guests, merged villages) works it out the same way.
const _tmp = { a: null };
export function tidyDiag(w) {
  const N = w.N, D = w.diag, R = w.roads;
  if (!D) return 0;
  if (!_tmp.a || _tmp.a.length !== N * N) _tmp.a = new Uint8Array(N * N);
  const out = _tmp.a;
  let n = 0;
  for (let i = 0; i < N * N; i++) {
    const v = D[i];
    out[i] = 0;
    if (!v || !R[i]) continue;
    const x = i % N, z = (i / N) | 0;
    let lo = 0;
    for (let k = 0; k < 4; k++) {
      if (!(v & (1 << k))) continue;
      const nx = x + CORNERS[k][0], nz = z + CORNERS[k][1];
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = nz * N + nx;
      if (R[j] && (D[j] & (1 << ((k + 2) & 3)))) { lo |= 1 << k; n++; }
    }
    let hi = 0;
    for (let s = 0; s < 4; s++) if ((v & (CUT << s)) && (lo & ((1 << s) | (1 << ((s + 3) & 3))))) hi |= CUT << s;
    out[i] = lo | hi;
  }
  D.set(out);
  w.diagN = n / 2;
  return w.diagN;
}

// A tile's diag byte turned k quarter turns clockwise (corners and sides
// both step round one place a turn).
export function turnDiag(v, k) {
  k &= 3;
  if (!k || !v) return v;
  const r = (q) => ((q << k) | (q >> (4 - k))) & 15;
  return r(v & 15) | (r(v >> 4) << 4);
}

// Whether a building can stand facing a diagonal: a one-tile building on its
// own plot (not joined or grown, not a station or a farm with fields).
export function diagCapable(b) {
  const def = BUILDINGS[b.type];
  return !!def && def.size === 1 && !def.merged && (b.w ?? b.size) === 1 && (b.d ?? b.size) === 1 && !def.needsRail && !def.fields && !b.spare;
}

// The corner a one-tile building at (x, z) faces when a diagonal passes it:
// spill (bit k: a diagonal passes corner k), preferring the corners either
// side of the way it faces along the grid (rot, as in world.js DIRS: S, E, N,
// W). -1 for none.
const SIDE_OF_ROT = [2, 1, 0, 3];
export function facingCorner(spill, rot) {
  if (!spill) return -1;
  const s = SIDE_OF_ROT[rot & 3];
  // corner s lies between side s and s + 1, corner s - 1 between s - 1 and s
  for (const k of [s, (s + 3) & 3, (s + 1) & 3, (s + 2) & 3]) if (spill & (1 << k)) return k;
  return -1;
}

// The way a building faces, as the turn of its model about the vertical: a
// quarter turn per rot along the grid, or 45 degrees to a diagonal (b.diag:
// 1 + the corner it faces).
export function facingAngle(b) {
  return b.diag ? (3 * Math.PI) / 4 - (b.diag - 1) * (Math.PI / 2) : (b.rot * Math.PI) / 2;
}
