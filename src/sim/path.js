// Breadth-first pathfinding over the road and rail grids, with a small cache.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TURN = 6;   // segments in a walker's quarter-circle turn

export class PathFinder {
  constructor(world) {
    this.world = world;
    const n = world.N * world.N;
    this.prev = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.stamp = 0;
    this.cache = new Map();
    const clear = () => this.cache.clear();
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
    let path = null;
    if (found) {
      path = [];
      for (let i = g; i !== -1; i = prev[i]) path.push([i % N, (i / N) | 0]);
      path.reverse();
    }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, path);
    return path;
  }
}

// Turn a tile path into a smooth world-space polyline offset to the right-hand side.
// round(x, z), if given, says whether a turn on that tile may follow the
// road's curve: a quarter circle round the inside tile corner (as the road
// surface is laid), tighter on the inside lane and wider on the outside.
export function tilePolyline(tiles, offset = 0, start = null, end = null, round = null) {
  const pts = [];
  if (start) pts.push([start.x, start.z]);
  const n = tiles.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = tiles[i];
    const cx = x + 0.5, cz = z + 0.5;
    if (offset === 0 || n === 1) { pts.push([cx, cz]); continue; }
    const prev = i > 0 ? tiles[i - 1] : null, next = i < n - 1 ? tiles[i + 1] : null;
    const d1 = prev ? [x - prev[0], z - prev[1]] : [next[0] - x, next[1] - z];
    const d2 = next ? [next[0] - x, next[1] - z] : d1;
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
