// Breadth-first pathfinding over the road and rail grids, with a small cache.
// In a town with boulevards (world.blvd) or diagonal streets (world.diag),
// roads are searched by cost instead: a step along the grid costs 2 and one
// across a corner 3 (about as much further as it is), and traffic keeps to
// its side of a boulevard: a lane runs one way, with the median on its left
// (everyone keeps right), and going the wrong way along it, or across the
// median, costs more than going round. A road cut off from a diagonal
// passing by (see diagonal.js) is never stepped onto from it.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// the world.blvd bit for each of DIRS, and for the side to the left of it
const BIT = [2, 8, 4, 1], LEFT = [1, 4, 2, 8], RIGHT = [4, 1, 8, 2];
// world.diag: the cut bit for the side each of DIRS crosses, and on the far
// side; the diagonal links (roadShape.js CORNERS: NE, SE, SW, NW)
const CUT = [32, 128, 64, 16], CUT_BACK = [128, 32, 16, 64];
const CORNERS = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
const TURN = 6;   // segments in a walker's quarter-circle turn

export class PathFinder {
  constructor(world) {
    this.world = world;
    const n = world.N * world.N;
    this.prev = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.stamp = 0;
    this.cache = new Map();
    this.lanes = null;   // whether the town has boulevards (worked out when needed)
    const clear = () => { this.cache.clear(); this.lanes = null; };
    world.on('roads', clear);
    world.on('rails', clear);
  }

  road(sx, sz, gx, gz) { return this._find(this.world.roads, 'r', sx, sz, gx, gz); }
  rail(sx, sz, gx, gz) { return this._find(this.world.rails, 'l', sx, sz, gx, gz); }

  _find(grid, tag, sx, sz, gx, gz) {
    const w = this.world, N = w.N;
    const s = sz * N + sx, g = gz * N + gx;
    if (!grid[s] || !grid[g]) return null;
    if (s === g) return [[sx, sz]];
    const key = tag + s + ':' + g;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    if (tag === 'r') {
      if (this.lanes === null) this.lanes = !!(w.blvd && w.blvd.some(Boolean)) || w.diagN > 0;
      if (this.lanes) return this._keep(this._lanes(grid, s, g), key);
    }
    const stamp = ++this.stamp;
    const prev = this.prev, seen = this.seen;
    const q = [s];
    seen[s] = stamp; prev[s] = -1;
    let found = false;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      if (i === g) { found = true; break; }
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx;
        if (seen[ni] === stamp || !grid[ni]) continue;
        seen[ni] = stamp; prev[ni] = i; q.push(ni);
      }
    }
    return this._keep(found ? this._trace(g) : null, key);
  }

  _trace(g) {
    const N = this.world.N, path = [];
    for (let i = g; i !== -1; i = this.prev[i]) path.push([i % N, (i / N) | 0]);
    return path.reverse();
  }

  _keep(path, key) {
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, path);
    return path;
  }

  // The cheapest way along the roads from tile s to tile g when there are
  // boulevards or diagonals: a step costs 2 (3 across a corner), 4 across a
  // median, 6 the wrong way along a lane (with its median on the right).
  // Dial's algorithm: a ring of eight buckets by cost, as no step costs more
  // than 6.
  _lanes(grid, s, g) {
    const w = this.world, N = w.N, B = w.blvd, D = w.diag, prev = this.prev, seen = this.seen;
    if (!this.dist || this.dist.length !== N * N) { this.dist = new Int32Array(N * N); this.done = new Uint32Array(N * N); }
    const dist = this.dist, done = this.done, stamp = ++this.stamp;
    const bk = [[s], [], [], [], [], [], [], []];
    seen[s] = stamp; dist[s] = 0; prev[s] = -1;
    let left = 1;
    for (let d = 0; left > 0; d++) {
      const b = bk[d & 7];
      while (b.length) {
        const i = b.pop();
        left--;
        if (dist[i] !== d || done[i] === stamp) continue;
        done[i] = stamp;
        if (i === g) return this._trace(g);
        const x = i % N, z = (i / N) | 0, m = B[i], c = D[i];
        for (let k = 0; k < 4; k++) {
          const nx = x + DIRS[k][0], nz = z + DIRS[k][1];
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const ni = nz * N + nx;
          if (!grid[ni] || done[ni] === stamp || (c & CUT[k]) || (D[ni] & CUT_BACK[k])) continue;
          const nd = d + (m & BIT[k] ? 4 : (m & RIGHT[k]) && !(m & LEFT[k]) ? 6 : 2);
          if (seen[ni] === stamp && dist[ni] <= nd) continue;
          seen[ni] = stamp; dist[ni] = nd; prev[ni] = i;
          bk[nd & 7].push(ni);
          left++;
        }
        if (c & 15) for (let k = 0; k < 4; k++) {
          if (!(c & (1 << k))) continue;
          const nx = x + CORNERS[k][0], nz = z + CORNERS[k][1];
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const ni = nz * N + nx;
          if (!grid[ni] || done[ni] === stamp || !(D[ni] & (1 << ((k + 2) & 3)))) continue;
          const nd = d + 3;
          if (seen[ni] === stamp && dist[ni] <= nd) continue;
          seen[ni] = stamp; dist[ni] = nd; prev[ni] = i;
          bk[nd & 7].push(ni);
          left++;
        }
      }
    }
    return null;
  }
}

// Turn a tile path into a smooth world-space polyline offset to the right-hand side.
// round(x, z), if given, says whether a turn on that tile may follow the
// road's curve: a quarter circle round the inside tile corner (as the road
// surface is laid), tighter on the inside lane and wider on the outside.
// A step across a corner (a diagonal street) runs straight from centre to
// centre; turns onto and off it are mitred.
export function tilePolyline(tiles, offset = 0, start = null, end = null, round = null) {
  const pts = [];
  if (start) pts.push([start.x, start.z]);
  const n = tiles.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = tiles[i];
    const cx = x + 0.5, cz = z + 0.5;
    if (offset === 0 || n === 1) { pts.push([cx, cz]); continue; }
    const prev = i > 0 ? tiles[i - 1] : null, next = i < n - 1 ? tiles[i + 1] : null;
    let d1 = prev ? [x - prev[0], z - prev[1]] : [next[0] - x, next[1] - z];
    let d2 = next ? [next[0] - x, next[1] - z] : d1;
    if (d1[0] && d1[1] || d2[0] && d2[1]) {
      // a diagonal: unit directions, and the right-hand offsets of both
      // meeting at a mitre; a sharper turn than a right angle is cut across
      // (a mitre would reach off the road), and one back on itself goes round
      const l1 = Math.hypot(d1[0], d1[1]), l2 = Math.hypot(d2[0], d2[1]);
      d1 = [d1[0] / l1, d1[1] / l1]; d2 = [d2[0] / l2, d2[1] / l2];
      const r1 = [-d1[1], d1[0]], r2 = [-d2[1], d2[0]], dot = r1[0] * r2[0] + r1[1] * r2[1];
      if (dot < -0.99) {
        pts.push([cx + (r1[0] + d1[0]) * offset, cz + (r1[1] + d1[1]) * offset]);
        pts.push([cx + (r2[0] + d1[0]) * offset, cz + (r2[1] + d1[1]) * offset]);
      } else if (dot < -1e-6) {
        pts.push([cx + r1[0] * offset, cz + r1[1] * offset]);
        pts.push([cx + r2[0] * offset, cz + r2[1] * offset]);
      } else {
        const k = offset / (1 + dot);
        pts.push([cx + (r1[0] + r2[0]) * k, cz + (r1[1] + r2[1]) * k]);
      }
      continue;
    }
    // right-hand normal of direction (dx,dz) is (-dz, dx)
    const r1 = [-d1[1], d1[0]], r2 = [-d2[1], d2[0]];
    if (d1[0] === d2[0] && d1[1] === d2[1]) pts.push([cx + r1[0] * offset, cz + r1[1] * offset]);
    else if (d1[0] === -d2[0] && d1[1] === -d2[1]) {
      pts.push([cx + r1[0] * offset + d1[0] * offset, cz + r1[1] * offset + d1[1] * offset]);
      pts.push([cx + r2[0] * offset + d1[0] * offset, cz + r2[1] * offset + d1[1] * offset]);
    } else if (round && round(x, z)) {
      const ox = cx + (d2[0] - d1[0]) * 0.5, oz = cz + (d2[1] - d1[1]) * 0.5;
      const R = 0.5 + (d2[0] === r1[0] && d2[1] === r1[1] ? -offset : offset);
      const a0 = Math.atan2(cz - d1[1] * 0.5 + r1[1] * offset - oz, cx - d1[0] * 0.5 + r1[0] * offset - ox);
      let da = Math.atan2(cz + d2[1] * 0.5 + r2[1] * offset - oz, cx + d2[0] * 0.5 + r2[0] * offset - ox) - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      for (let k = 0; k <= TURN; k++) {
        const a = a0 + (da * k) / TURN, px = ox + Math.cos(a) * R, pz = oz + Math.sin(a) * R;
        const last = pts[pts.length - 1];
        if (!last || Math.abs(last[0] - px) + Math.abs(last[1] - pz) > 1e-6) pts.push([px, pz]);
      }
    } else pts.push([cx + (r1[0] + r2[0]) * offset, cz + (r1[1] + r2[1]) * offset]);
  }
  if (end) pts.push([end.x, end.z]);
  return pts;
}

// Round off sharp corners with a short quadratic curve (for coaches and trains).
export function smoothPolyline(pts, radius = 0.35, steps = 4) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz);
    const cross = (bx - ax) * (cz - bz) - (bz - az) * (cx - bx);
    if (Math.abs(cross) < 1e-6 || l1 < 1e-6 || l2 < 1e-6) { out.push(pts[i]); continue; }
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const p0 = [bx - ((bx - ax) / l1) * r, bz - ((bz - az) / l1) * r];
    const p2 = [bx + ((cx - bx) / l2) * r, bz + ((cz - bz) / l2) * r];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], u * u * p0[1] + 2 * u * t * bz + t * t * p2[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
