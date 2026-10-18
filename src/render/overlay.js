// Tile overlays that hug the terrain: cursor / placement preview and data maps.

import * as THREE from 'three';
import { bridgeDeckY } from '../world/world.js';

function tileMesh(order) {
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  m.renderOrder = order;
  m.frustumCulled = false;
  return m;
}

export class Overlay {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.cursor = tileMesh(6);
    this.remote = tileMesh(5);
    this.map = tileMesh(3);
    this.routes = new THREE.Group();
    scene.add(this.cursor, this.remote, this.map, this.routes);
    this._c = new THREE.Color();
  }

  _tileQuad(pos, col, x, z, color, alpha, lift = 0.07, inset = 0, yOverride = null) {
    const t = this.world.terrain;
    const w = this.world;
    const h = (cx, cz) => {
      if (yOverride !== null) return yOverride;
      return t.ch(cx, cz) + lift;
    };
    let base = null;
    if (w.inBounds(x, z)) {
      const b = w.buildingOn(x, z);
      if (b) base = b.baseY + 0.04;
      else if (w.roads[w.idx(x, z)] && t.isWater(x, z)) base = bridgeDeckY() + 0.03;
      else if (t.isWater(x, z)) base = Math.max(t.tileMax(x, z), 0.02) + 0.02;
    }
    const y = (cx, cz) => (base !== null ? base : h(cx, cz));
    const x0 = x + inset, x1 = x + 1 - inset, z0 = z + inset, z1 = z + 1 - inset;
    const p = [[x0, y(x, z), z0], [x0, y(x, z + 1), z1], [x1, y(x + 1, z + 1), z1], [x0, y(x, z), z0], [x1, y(x + 1, z + 1), z1], [x1, y(x + 1, z), z0]];
    for (const v of p) { pos.push(v[0], v[1], v[2]); col.push(color.r, color.g, color.b, alpha); }
  }

  // tiles: [{x, z, color, alpha, border}]
  setCursor(tiles) { this._tiles(this.cursor, tiles); }

  // Other players' pointers and selections in multiplayer (same tiles, own layer).
  setRemote(tiles) { this._tiles(this.remote, tiles); }

  _tiles(mesh, tiles) {
    const pos = [], col = [];
    const c = this._c;
    for (const tl of tiles) {
      if (!this.world.inBounds(tl.x, tl.z)) continue;
      c.set(tl.color);
      this._tileQuad(pos, col, tl.x, tl.z, c, tl.alpha ?? 0.35, 0.07);
      if (tl.border !== false) {
        // brighter rim
        this._rim(pos, col, tl.x, tl.z, c, Math.min(1, (tl.alpha ?? 0.35) + 0.45));
      }
    }
    this._apply(mesh, pos, col);
  }

  _rim(pos, col, x, z, color, alpha) {
    const t = this.world.terrain, w = this.world;
    const b = w.buildingOn(x, z);
    const water = t.isWater(x, z);
    const yv = (cx, cz) => (b ? b.baseY + 0.045 : (w.roads[w.idx(x, z)] && water) ? bridgeDeckY() + 0.035 : water ? Math.max(t.tileMax(x, z), 0.02) + 0.025 : t.ch(cx, cz) + 0.075);
    const k = 0.06;
    const edges = [
      [[x, z], [x + 1, z], [0, k]],
      [[x + 1, z], [x + 1, z + 1], [-k, 0]],
      [[x + 1, z + 1], [x, z + 1], [0, -k]],
      [[x, z + 1], [x, z], [k, 0]],
    ];
    for (const [[ax, az], [bx, bz], [ox, oz]] of edges) {
      const a = [ax, yv(ax, az), az], bb = [bx, yv(bx, bz), bz];
      const a2 = [ax + ox, a[1], az + oz], b2 = [bx + ox, bb[1], bz + oz];
      for (const v of [a, bb, b2, a, b2, a2]) { pos.push(v[0], v[1], v[2]); col.push(color.r, color.g, color.b, alpha); }
    }
  }

  // values: Float32Array(N*N) 0..1 or null to clear; colorFn(v) -> [hex, alpha]
  setMap(values, colorFn) {
    if (!values) { this._apply(this.map, [], []); return; }
    const pos = [], col = [];
    const w = this.world, N = w.N, c = this._c;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const v = values[z * N + x];
      const r = colorFn(v, x, z);
      if (!r) continue;
      c.set(r[0]);
      this._tileQuad(pos, col, x, z, c, r[1], 0.06, 0.02);
    }
    this._apply(this.map, pos, col);
  }

  // Coloured ribbons for transit routes: [{points:[[x,y,z]...], color}]
  setRoutes(routes) {
    for (const ch of [...this.routes.children]) { ch.geometry.dispose(); ch.material.dispose(); this.routes.remove(ch); }
    for (const r of routes) {
      if (r.points.length < 2) continue;
      const pos = [];
      const wdt = r.width || 0.07;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], b = r.points[i + 1];
        const dx = b[0] - a[0], dz = b[2] - a[2];
        const len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * wdt, nz = (dx / len) * wdt;
        const ya = a[1] + 0.09, yb = b[1] + 0.09;
        pos.push(a[0] + nx, ya, a[2] + nz, b[0] + nx, yb, b[2] + nz, b[0] - nx, yb, b[2] - nz);
        pos.push(a[0] + nx, ya, a[2] + nz, b[0] - nx, yb, b[2] - nz, a[0] - nx, ya, a[2] - nz);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: r.color, transparent: true, opacity: r.opacity ?? 0.85, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      }));
      m.renderOrder = 7;
      m.frustumCulled = false;
      this.routes.add(m);
    }
  }

  _apply(mesh, pos, col) {
    const g = mesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
    g.computeBoundingSphere();
    mesh.visible = pos.length > 0;
  }

  dispose() {
    this.setRoutes([]);
    this.scene.remove(this.cursor, this.remote, this.map, this.routes);
    this.cursor.geometry.dispose(); this.remote.geometry.dispose(); this.map.geometry.dispose();
  }
}
