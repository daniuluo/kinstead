// Heightmap terrain: corner heights on an (N+1)x(N+1) lattice.
// Each tile is two triangles split along the (x,z)→(x+1,z+1) diagonal, and
// heightAt() samples exactly that surface so roads and props sit flush.

import { CONFIG } from '../config.js';
import { RNG, makeNoise2D, fbm, clamp, lerp, smoothstep, hash2 } from '../util/rng.js';

export class Terrain {
  constructor(N, H) {
    this.N = N;
    this.S = N + 1;
    this.H = H || new Float32Array(this.S * this.S);
  }

  ch(cx, cz) {
    if (cx < 0) cx = 0; else if (cx > this.N) cx = this.N;
    if (cz < 0) cz = 0; else if (cz > this.N) cz = this.N;
    return this.H[cz * this.S + cx];
  }

  setCh(cx, cz, v) { this.H[cz * this.S + cx] = v; }

  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N; }

  tileMin(x, z) { return Math.min(this.ch(x, z), this.ch(x + 1, z), this.ch(x, z + 1), this.ch(x + 1, z + 1)); }
  tileMax(x, z) { return Math.max(this.ch(x, z), this.ch(x + 1, z), this.ch(x, z + 1), this.ch(x + 1, z + 1)); }
  tileAvg(x, z) { return (this.ch(x, z) + this.ch(x + 1, z) + this.ch(x, z + 1) + this.ch(x + 1, z + 1)) * 0.25; }
  slope(x, z) { return this.tileMax(x, z) - this.tileMin(x, z); }
  isWater(x, z) { return this.tileAvg(x, z) < CONFIG.WATER_LEVEL + 0.05; }

  heightAt(x, z) {
    const N = this.N;
    if (x < 0) x = 0; else if (x > N - 1e-4) x = N - 1e-4;
    if (z < 0) z = 0; else if (z > N - 1e-4) z = N - 1e-4;
    const tx = Math.floor(x), tz = Math.floor(z);
    const fx = x - tx, fz = z - tz;
    const h00 = this.ch(tx, tz), h10 = this.ch(tx + 1, tz), h01 = this.ch(tx, tz + 1), h11 = this.ch(tx + 1, tz + 1);
    if (fz > fx) return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
    return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  }
}

// ---------------------------------------------------------------- generation

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}

export function generateTerrain(N, seed) {
  const S = N + 1;
  const H = new Float32Array(S * S);
  const rng = new RNG(seed ^ 0x5bd1e995);
  const nA = makeNoise2D(seed), nB = makeNoise2D(seed + 101), nC = makeNoise2D(seed + 202);

  const hasRiver = rng.chance(0.8);
  const riverAlongZ = rng.chance(0.5);
  const riverSide = rng.chance(0.5) ? 0.2 : 0.8;
  const riverPhase = rng.float(0, Math.PI * 2);
  const riverAmp = rng.float(0.05, 0.1) * N;
  const riverFreq = rng.float(0.06, 0.1);

  // The village starts near the middle, nudged away from the river.
  const startShift = riverSide < 0.5 ? 0.07 * N : -0.07 * N;
  const sx = Math.round(N / 2 + (riverAlongZ ? startShift : 0));
  const sz = Math.round(N / 2 + (riverAlongZ ? 0 : startShift));

  // A big hill somewhere off-centre.
  const hillAng = rng.float(0, Math.PI * 2);
  const hillX = N / 2 + Math.cos(hillAng) * N * 0.36;
  const hillZ = N / 2 + Math.sin(hillAng) * N * 0.36;
  const hillR = N * rng.float(0.28, 0.38);
  const hillH = rng.float(2.4, 3.6);

  // Maybe a lake.
  const hasLake = !hasRiver || rng.chance(0.45);
  const lakeAng = hillAng + Math.PI * rng.float(0.6, 1.4);
  const lakeX = N / 2 + Math.cos(lakeAng) * N * 0.3;
  const lakeZ = N / 2 + Math.sin(lakeAng) * N * 0.3;
  const lakeR = rng.float(3, 5.5);

  for (let cz = 0; cz < S; cz++) {
    for (let cx = 0; cx < S; cx++) {
      let h = 0.6 + fbm(nA, cx * 0.045, cz * 0.045, 4) * 0.95;
      const dh = Math.hypot(cx - hillX, cz - hillZ) / hillR;
      if (dh < 1) h += (1 - dh) * (1 - dh) * hillH * (0.75 + 0.35 * nB(cx * 0.12, cz * 0.12));
      if (hasRiver) {
        const along = riverAlongZ ? cz : cx, across = riverAlongZ ? cx : cz;
        const centre = riverSide * N + Math.sin(along * riverFreq + riverPhase) * riverAmp + nC(along * 0.07, 3.3) * 2.5;
        const d = Math.abs(across - centre);
        const w = 1.5 + nC(along * 0.05, 9.1) * 0.5;
        const carve = smoothstep(w + 3.2, w, d);
        h = lerp(h, -0.75, carve);
      }
      if (hasLake) {
        const dl = Math.hypot(cx - lakeX, cz - lakeZ) / lakeR + nC(cx * 0.2, cz * 0.2) * 0.25;
        h = lerp(h, -0.7, smoothstep(1.25, 0.55, dl));
      }
      // Flatten the founding area.
      const ds = Math.hypot(cx - sx, cz - sz);
      const f = smoothstep(11, 4, ds);
      h = lerp(h, Math.max(0.45, Math.min(h, 0.9)), f);
      if (ds < 7) h = Math.max(h, 0.4);
      H[cz * S + cx] = h;
    }
  }

  // Soften, then add tiny facets for a hand-made low-poly feel.
  const B = new Float32Array(H.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let cz = 0; cz < S; cz++) {
      for (let cx = 0; cx < S; cx++) {
        let sum = 0, wsum = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= S || z >= S) continue;
          const w = dx === 0 && dz === 0 ? 4 : (dx === 0 || dz === 0 ? 2 : 1);
          sum += H[z * S + x] * w; wsum += w;
        }
        B[cz * S + cx] = sum / wsum;
      }
    }
    H.set(B);
  }
  for (let cz = 0; cz < S; cz++) {
    for (let cx = 0; cx < S; cx++) {
      const i = cz * S + cx;
      H[i] += (hash2(cx, cz, seed) - 0.5) * 0.05;
      // Keep shallow shores from fighting with the water plane.
      if (Math.abs(H[i] - CONFIG.WATER_LEVEL) < 0.03) H[i] = CONFIG.WATER_LEVEL + (H[i] < CONFIG.WATER_LEVEL ? -0.04 : 0.04);
    }
  }

  const terrain = new Terrain(N, H);
  const start = { x: clamp(sx, 3, N - 4), z: clamp(sz, 3, N - 4) };
  const entryPath = findEntryPath(terrain, start, seed);
  return { terrain, start, entryPath };
}

// Cheapest organic-looking route from the start tile to a map edge.
function findEntryPath(t, start, seed) {
  const N = t.N;
  const cost = new Float32Array(N * N).fill(Infinity);
  const prev = new Int32Array(N * N).fill(-1);
  const heap = new MinHeap();
  const si = start.z * N + start.x;
  cost[si] = 0; heap.push(0, si);
  const stepCost = (x, z) => {
    let c = 1 + t.slope(x, z) * 5 + hash2(x, z, seed + 7) * 0.7;
    if (t.isWater(x, z)) c += 9;
    if (t.tileAvg(x, z) > 1.8) c += 2;
    return c;
  };
  while (heap.size) {
    const i = heap.pop();
    const x = i % N, z = (i / N) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!t.inBounds(nx, nz)) continue;
      const ni = nz * N + nx;
      const c = cost[i] + stepCost(nx, nz);
      if (c < cost[ni]) { cost[ni] = c; prev[ni] = i; heap.push(c, ni); }
    }
  }
  let best = -1, bestCost = Infinity;
  for (let k = 0; k < N; k++) {
    for (const [x, z] of [[k, 0], [k, N - 1], [0, k], [N - 1, k]]) {
      if (t.isWater(x, z)) continue;
      const i = z * N + x;
      // Prefer edges that aren't right next to the start.
      const c = cost[i] + (Math.abs(x - start.x) + Math.abs(z - start.z) < N * 0.3 ? 40 : 0);
      if (c < bestCost) { bestCost = c; best = i; }
    }
  }
  const path = [];
  for (let i = best; i !== -1; i = prev[i]) path.push([i % N, (i / N) | 0]);
  return path.reverse(); // start → edge
}
