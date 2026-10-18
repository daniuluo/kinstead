// Trees, bushes, rocks, grass tufts and wildflowers as instanced meshes.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT } from './materials.js';
import { TREE } from '../world/world.js';
import { hash2 } from '../util/rng.js';
import { dressSpots } from '../world/roadDress.js';
import { produceOf } from '../defs.js';

function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); n.computeVertexNormals(); return n; }

// Smooth, slightly lumpy shapes for foliage (less "low-poly toy", more natural).
function organic(g, lump = 0, cx = 0, cy = 0, cz = 0) {
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  if (lump) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const dx = x - cx, dy = y - cy, dz = z - cz, L = Math.hypot(dx, dy, dz) || 1;
      const k = 1 + (hash2(Math.round(x * 1000), Math.round(z * 1000) + Math.round(y * 1000) * 7, 11) - 0.5) * lump;
      p.setXYZ(i, cx + dx * k, cy + dy * k, cz + dz * k);
    }
  }
  g.computeVertexNormals();
  return g;
}
const blob = (r, x, y, z, sy = 1, lump = 0.28) => organic(new THREE.IcosahedronGeometry(r, 2).scale(1, sy, 1).translate(x, y, z), lump, x, y, z);

const GEO = {
  trunk: organic(new THREE.CylinderGeometry(0.02, 0.036, 0.26, 7).translate(0, 0.13, 0)),
  pine: mergeGeometries([
    organic(new THREE.ConeGeometry(0.17, 0.28, 9).translate(0, 0.22, 0), 0.12, 0, 0.2, 0),
    organic(new THREE.ConeGeometry(0.13, 0.24, 9).translate(0, 0.36, 0), 0.12, 0, 0.34, 0),
    organic(new THREE.ConeGeometry(0.085, 0.2, 9).translate(0, 0.49, 0), 0.1, 0, 0.47, 0),
  ]),
  round: mergeGeometries([
    blob(0.15, 0, 0.33, 0, 0.9),
    blob(0.1, 0.08, 0.4, -0.03),
    blob(0.095, -0.08, 0.29, 0.05),
    blob(0.085, 0.02, 0.27, -0.09),
  ]),
  birch: mergeGeometries([
    blob(0.1, 0, 0.4, 0, 1.4, 0.3),
    blob(0.07, 0.045, 0.5, 0.02),
  ]),
  bush: mergeGeometries([blob(0.095, 0, 0.05, 0, 0.7), blob(0.065, 0.06, 0.04, 0.03, 0.75)]),
  rock: flat(new THREE.DodecahedronGeometry(0.1, 0).scale(1, 0.6, 0.85).translate(0, 0.03, 0)),
  tuft: flat(mergeGeometries([
    flat(new THREE.ConeGeometry(0.011, 0.075, 3).translate(0, 0.037, 0)),
    flat(new THREE.ConeGeometry(0.009, 0.06, 3).translate(0.018, 0.03, 0.01)),
    flat(new THREE.ConeGeometry(0.009, 0.065, 3).translate(-0.014, 0.032, -0.012)),
  ])),
  bloom: flat(new THREE.IcosahedronGeometry(0.013, 0).translate(0, 0.04, 0)),
  crop: flat(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 0.75, 1).translate(0, 0.022, 0)),
  post: flat(new THREE.BoxGeometry(0.016, 0.085, 0.016).translate(0, 0.042, 0)),
  rail: flat(new THREE.BoxGeometry(1, 0.012, 0.01).translate(0, 0.058, 0)),
};
// crop tufts in farm fields, by season (mixed farming), and their fences
const CROP_TUFT = [['#7fae4f', '#8fbd5a'], ['#c9a640', '#6f9e45'], ['#c08f3e', '#a8823c'], ['#6f5a44', '#6f5a44']];
const FENCE_COL = '#7a5f42';

const FOLIAGE = {
  pine: [['#2f5236', '#36593b', '#2b4a33'], ['#2c4e33', '#335538', '#294630'], ['#304d34', '#38573b', '#2c4631'], ['#2f4a37', '#36523d', '#2a4231']],
  round: [
    ['#6a8f45', '#5f8640', '#75974d', '#e3b7c0'],
    ['#5b7d3e', '#4f7037', '#668546', '#56783b'],
    ['#b5682e', '#c48a3a', '#9a4a2a', '#a8923a', '#b87a34'],
    ['#7a6d60', '#6e6256', '#857868'],
  ],
  birch: [['#8aa556', '#93ad5e'], ['#7f9a4f', '#738f47'], ['#d4ac3c', '#dcb94a', '#c79c34'], ['#8a7e70', '#968a7c']],
  bush: [['#617f43', '#57773d', '#6a8748'], ['#4f6e3a', '#57763e', '#48663a'], ['#8a7a3a', '#97713a', '#6f6f3a'], ['#666b5a', '#6f7462']],
};
// clipped box hedges stay green the year round, a little duller in winter
const HEDGE = [['#4c7a3a', '#477238', '#52803e'], ['#46703a', '#416a36', '#4b763c'], ['#4f6e38', '#4a6834', '#557438'], ['#4b5f45', '#475a41', '#506449']];
const TUFT = ['#6f9447', '#5f8a40', '#9a8f4a', '#7a8068'];
const BLOOMS = ['#f2ede0', '#e2b84a', '#c9536b', '#9c74c9', '#e3a0b4'];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class NatureView {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.season = 1;
    const mk = (geo, mat, max, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, max));
      m.castShadow = shadow; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      scene.add(m);
      return m;
    };
    const N = world.N;
    this.cap = N * N * 4;
    this.meshes = {
      trunk: mk(GEO.trunk, MAT.trunk, this.cap),
      pine: mk(GEO.pine, MAT.foliage, this.cap),
      round: mk(GEO.round, MAT.foliage, this.cap),
      birch: mk(GEO.birch, MAT.foliage, this.cap),
      bush: mk(GEO.bush, MAT.foliage, this.cap),
      rock: mk(GEO.rock, MAT.rock, this.cap),
      tuft: mk(GEO.tuft, MAT.grass, N * N * 3, false),
      bloom: mk(GEO.bloom, MAT.grass, N * N * 3, false),
      crop: mk(GEO.crop, MAT.grass, 30000, false),
      post: mk(GEO.post, MAT.trunk, 8000),
      rail: mk(GEO.rail, MAT.trunk, 8000),
    };
    this.rebuild();
  }

  setSeason(s) {
    if (s === this.season) return;
    this.season = s;
    this.rebuild();
  }

  rebuild() {
    const w = this.world, t = w.terrain, s = this.season;
    const M = this.meshes;
    const counts = { trunk: 0, pine: 0, round: 0, birch: 0, bush: 0, rock: 0, tuft: 0, bloom: 0, crop: 0, post: 0, rail: 0 };
    const put = (key, x, y, z, sc, rot, color, sy = 1) => {
      const mesh = M[key];
      const i = counts[key]++;
      if (i >= mesh.instanceMatrix.count) return;
      _p.set(x, y, z); _q.setFromEuler(_e.set(0, rot, 0)); _s.set(sc, sc * sy, sc);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      mesh.setColorAt(i, _c.set(color));
    };
    for (const tr of w.trees) {
      const y = t.heightAt(tr.x, tr.z) - 0.01;
      const h = hash2(Math.floor(tr.x * 100), Math.floor(tr.z * 100), 3);
      const pick = (arr) => arr[Math.floor(h * arr.length) % arr.length];
      switch (tr.k) {
        case TREE.PINE:
          put('trunk', tr.x, y, tr.z, tr.s, tr.r, '#6b4a2f');
          put('pine', tr.x, y, tr.z, tr.s, tr.r, pick(FOLIAGE.pine[s]));
          break;
        case TREE.ROUND: {
          put('trunk', tr.x, y, tr.z, tr.s, tr.r, '#6e4d31', 1.1);
          const bare = s === 3;
          const col = s === 0 && h > 0.9 ? '#e3b7c0' : pick(FOLIAGE.round[s].slice(0, s === 0 ? 3 : undefined));
          put('round', tr.x, y + (bare ? 0.04 : 0), tr.z, tr.s * (bare ? 0.7 : 1), tr.r, col);
          break;
        }
        case TREE.BIRCH:
          put('trunk', tr.x, y, tr.z, tr.s * 0.8, tr.r, '#e8e4da', 1.6);
          put('birch', tr.x, y, tr.z, tr.s * (s === 3 ? 0.75 : 1), tr.r, pick(FOLIAGE.birch[s]));
          break;
        case TREE.BUSH:
          put('bush', tr.x, y, tr.z, tr.s, tr.r, pick(FOLIAGE.bush[s]));
          break;
        case TREE.ROCK:
          put('rock', tr.x, y, tr.z, tr.s, tr.r, h > 0.5 ? '#9b968c' : '#8a857b');
          break;
        case TREE.PEBBLE:
          put('rock', tr.x, y, tr.z, tr.s * 0.45, tr.r, '#a39e94');
          break;
      }
    }
    // dressed streets: avenue trees, hedges, and shrubs and flowers on a
    // planted median (positions from roadDress.js)
    this.dressed = !!(w.dress && w.dress.some(Boolean));
    if (this.dressed) {
      const sp = dressSpots(w);
      for (const tr of sp.trees) {
        const y = t.heightAt(tr.x, tr.z) - 0.01, h = hash2(Math.floor(tr.x * 100), Math.floor(tr.z * 100), 3);
        const bare = s === 3, leaves = FOLIAGE.round[s];
        put('trunk', tr.x, y, tr.z, tr.s, tr.r, '#6e4d31', 1.3);
        put('round', tr.x, y + 0.03 + (bare ? 0.04 : 0), tr.z, tr.s * (bare ? 0.7 : 1), tr.r, leaves[Math.floor(h * Math.min(3, leaves.length))]);
      }
      for (const hg of sp.hedges) {
        const c = HEDGE[s][Math.floor(hash2(Math.floor(hg.x * 40), Math.floor(hg.z * 40), 5) * 3)];
        put('bush', hg.x, t.heightAt(hg.x, hg.z) - 0.005, hg.z, 0.62, hg.r, c, 0.9);
      }
      for (const sh of sp.shrubs) {
        const y = t.heightAt(sh.x, sh.z) + 0.04, h = hash2(Math.floor(sh.x * 100), Math.floor(sh.z * 100), 7);
        put('bush', sh.x, y, sh.z, 0.5, sh.r, FOLIAGE.bush[s][Math.floor(h * 3)]);
        if (s <= 1) for (const o of [-0.07, 0.07]) put('bloom', sh.x + o * Math.cos(sh.r), y + 0.005, sh.z + o * Math.sin(sh.r), 1, 0, BLOOMS[Math.floor(hash2(Math.floor(sh.x * 50), Math.floor(sh.z * 50), 8 + o) * BLOOMS.length)]);
      }
    }
    // farm fields: rows of crop tufts (none in winter, or on grazing land)
    // and a post-and-rail fence round their outer edges
    const N = w.N, F = w.fields;
    const cropField = new Uint8Array(N * N);
    if (F && w.fieldTiles) for (const [id, tiles] of w.fieldTiles) {
      const farm = w.buildings.get(id);
      if (!farm) continue;
      const P = produceOf(farm), across = farm.rot & 1;
      const cols = P.crop && s < 3 ? P.crop[s] : CROP_TUFT[s];
      for (const ti of tiles) {
        const x = ti % N, z = (ti / N) | 0;
        if (P.kind !== 'livestock') {
          cropField[ti] = 1;
          if (s < 3) for (let u = 0.1; u < 0.98; u += 0.4) for (let v = 0.06; v < 0.97; v += 0.11) {
            const k = hash2(x * 31 + Math.round(u * 10), z * 17 + Math.round(v * 100), 9);
            const px = x + (across ? v : u) + (k - 0.5) * 0.04, pz = z + (across ? u : v) + (hash2(x, z, Math.round(u * 50 + v * 900)) - 0.5) * 0.04;
            put('crop', px, t.heightAt(px, pz), pz, 0.85 + k * 0.35, k * 6, cols[k < 0.5 ? 0 : 1]);
          }
        }
        const rail = (x0, z0, x1, z1) => {
          const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, i = counts.rail++;
          if (i < M.rail.instanceMatrix.count) {
            _p.set(mx, t.heightAt(mx, mz), mz); _q.setFromEuler(_e.set(0, -Math.atan2(z1 - z0, x1 - x0), 0)); _s.set(len, 1, 1);
            M.rail.setMatrixAt(i, _m.compose(_p, _q, _s)); M.rail.setColorAt(i, _c.set(FENCE_COL));
          }
          for (let q = 0; q <= 2; q++) { const fx = x0 + (x1 - x0) * q / 2, fz = z0 + (z1 - z0) * q / 2; put('post', fx, t.heightAt(fx, fz), fz, 1, 0, FENCE_COL); }
        };
        const edgeOf = (dx, dz) => { const nx = x + dx, nz = z + dz; return !w.inBounds(nx, nz) || (F[nz * N + nx] !== id && w.buildingAt[nz * N + nx] !== id); };
        const e = 0.04;
        if (edgeOf(0, -1)) rail(x + e, z + e, x + 1 - e, z + e);
        if (edgeOf(0, 1)) rail(x + e, z + 1 - e, x + 1 - e, z + 1 - e);
        if (edgeOf(-1, 0)) rail(x + e, z + e, x + e, z + 1 - e);
        if (edgeOf(1, 0)) rail(x + 1 - e, z + e, x + 1 - e, z + 1 - e);
      }
    }
    // grass tufts and wildflowers on open land (not in fields of crops)
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = w.idx(x, z);
        if (w.roads[i] || w.rails[i] || w.buildingAt[i] >= 0 || cropField[i] || t.isWater(x, z) || t.slope(x, z) > 0.6) continue;
        const avg = t.tileAvg(x, z);
        if (avg < 0.2 || avg > 2.4) continue;
        const n = Math.floor(hash2(x, z, 41) * 3);
        for (let k = 0; k < n; k++) {
          const px = x + hash2(x, z, 50 + k), pz = z + hash2(x, z, 60 + k);
          put('tuft', px, t.heightAt(px, pz), pz, 0.8 + hash2(x, z, 70 + k) * 0.6, hash2(x, z, 80 + k) * 6, TUFT[s]);
        }
        if (s <= 1 && hash2(x, z, 43) < 0.18) {
          const fc = BLOOMS[Math.floor(hash2(x, z, 44) * BLOOMS.length)];
          for (let k = 0; k < 3; k++) {
            const px = x + 0.15 + hash2(x, z, 90 + k) * 0.7, pz = z + 0.15 + hash2(x, z, 95 + k) * 0.7;
            put('bloom', px, t.heightAt(px, pz), pz, 1, 0, fc);
          }
        }
      }
    }
    for (const [key, mesh] of Object.entries(M)) {
      mesh.count = Math.min(counts[key], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  dispose() {
    for (const m of Object.values(this.meshes)) { this.scene.remove(m); m.dispose(); }
  }
}
