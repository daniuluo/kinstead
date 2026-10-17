// Everything visual about the world: terrain, roads, nature, buildings and ambient effects.

import * as THREE from 'three';
import { MAT, glowTexture, U } from './materials.js';
import { TerrainView } from './terrainView.js';
import { RoadsView } from './roadsView.js';
import { NatureView } from './natureView.js';
import { Overlay } from './overlay.js';
import { Particles } from './particles.js';
import { buildModel, workArea } from './buildings.js';

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class WorldView {
  constructor(world, renderer) {
    this.world = world;
    this.R = renderer;
    const scene = this.scene = renderer.scene;
    this.terrain = new TerrainView(world, scene);
    this.roads = new RoadsView(world, scene);
    this.nature = new NatureView(world, scene);
    this.overlay = new Overlay(world, scene);
    this.smoke = new Particles(scene, 1200, { soft: 0.05 });
    this.glow = new Particles(scene, 1600, { additive: true });
    this.fx = new Particles(scene, 1500, { additive: true });
    this.weather = new Particles(scene, 900, { soft: 0.2 });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.groundFn = (x, z) => world.terrain.heightAt(x, z);
    this.items = new Map();
    this.anims = [];
    this.pending = [];
    this.dirty = { roads: false, nature: false, terrain: false, paint: false, glows: true };
    this.season = 1;
    this.poolTex = glowTexture();
    this.pools = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      map: this.poolTex, color: '#ffb35c', transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    this.pools.renderOrder = 3;
    this.pools.frustumCulled = false;
    scene.add(this.pools);
    for (const b of world.buildings.values()) this.addBuilding(b, false);
    this.dirty.paint = true;

    this._h = {
      add: (b) => { this.addBuilding(b, true); this.dirty.roads = true; this.dirty.nature = true; this.dirty.paint = true; },
      remove: (b) => { this.removeBuilding(b); this.dirty.roads = true; this.dirty.nature = true; this.dirty.paint = true; },
      change: (b) => { this.removeBuilding(b, true); this.addBuilding(b, true, true); },
      roads: () => { this.dirty.roads = true; this.dirty.nature = true; this.dirty.paint = true; },
      rails: () => { this.dirty.roads = true; this.dirty.nature = true; this.dirty.paint = true; },
      trees: () => { this.dirty.nature = true; this.dirty.paint = true; },
      terrain: () => { this.dirty.terrain = true; this.dirty.roads = true; this.dirty.nature = true; },
    };
    world.on('building:add', this._h.add);
    world.on('building:remove', this._h.remove);
    world.on('building:change', this._h.change);
    world.on('roads', this._h.roads);
    world.on('rails', this._h.rails);
    world.on('trees', this._h.trees);
    world.on('terrain', this._h.terrain);
    this.fireflyTimer = 0;
    this.time = 0;
  }

  // ----------------------------------------------------------- buildings
  addBuilding(b, animate = false, upgrade = false) {
    const model = buildModel(b, { season: this.season, ground: this.groundFn });
    const mesh = new THREE.Mesh(model.geo, MAT.building);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(b.x + b.size / 2 + model.jitter.ox, b.baseY, b.z + b.size / 2 + model.jitter.oz);
    mesh.rotation.y = (b.rot * Math.PI) / 2 + model.jitter.yaw;
    mesh.userData.buildingId = b.id;
    let spin = null;
    if (model.spin) {
      spin = new THREE.Mesh(model.spin.geo, MAT.building);
      spin.position.set(model.spin.x, model.spin.y, model.spin.z);
      spin.castShadow = true;
      spin.userData.buildingId = b.id;
      spin.userData.speed = model.spin.speed;
      mesh.add(spin);
    }
    this.group.add(mesh);
    mesh.updateMatrixWorld(true);
    const toWorld = (p) => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(mesh.matrixWorld);
    const item = {
      b, mesh, spin,
      smoke: model.smoke.map(s => ({ ...toWorld(s), kind: s.kind, acc: Math.random() })),
      glows: model.glows.map(g => ({ ...toWorld(g), kind: g.kind, ground: b.baseY })),
      fountain: model.fountain ? toWorld({ x: model.fountain[0], y: model.fountain[1], z: model.fountain[2] }) : null,
      work: model.work,
    };
    // Outdoor work / wander area in world space
    b.work = workArea(b);
    this.items.set(b.id, item);
    if (animate) {
      mesh.scale.set(1, 0.01, 1);
      this.anims.push({ mesh, t: 0, dur: upgrade ? 0.55 : 0.7 });
      this.dust(mesh.position.x, b.baseY, mesh.position.z, b.size, upgrade);
    }
    this.dirty.glows = true;
  }

  removeBuilding(b, quiet = false) {
    const it = this.items.get(b.id);
    if (!it) return;
    this.group.remove(it.mesh);
    it.mesh.geometry.dispose();
    if (it.spin) it.spin.geometry.dispose();
    this.items.delete(b.id);
    if (!quiet) this.dust(it.mesh.position.x, b.baseY, it.mesh.position.z, b.size, false);
    this.dirty.glows = true;
  }

  pickBuilding(raycaster) {
    const hits = raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      const id = h.object.userData.buildingId;
      if (id !== undefined) return this.world.buildings.get(id) || null;
    }
    return null;
  }

  // ------------------------------------------------------------- effects
  dust(x, y, z, size, sparkle) {
    for (let i = 0; i < 26 * size; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5 * size;
      this.smoke.emit({
        x: x + Math.cos(a) * r, y: y + 0.05, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * 0.4, vy: 0.15 + Math.random() * 0.3, vz: Math.sin(a) * 0.4,
        drag: 2.5, wind: 0.2, life: 0.9 + Math.random() * 0.6, size: 0.12, size1: 0.35,
        r: 0.82, g: 0.76, b: 0.66, alpha: 0.6, alpha1: 0,
      });
    }
    if (sparkle) {
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.emit({
          x: x + Math.cos(a) * 0.3 * size, y: y + 0.2 + Math.random() * 0.6, z: z + Math.sin(a) * 0.3 * size,
          vx: Math.cos(a) * 0.3, vy: 0.5 + Math.random() * 0.4, vz: Math.sin(a) * 0.3, gravity: -0.6, wind: 0,
          life: 1 + Math.random() * 0.6, size: 0.09, size1: 0.02, r: 1, g: 0.85, b: 0.4, alpha: 1, alpha1: 0,
        });
      }
    }
  }

  fireworks(x, y, z) {
    const colors = [[1, 0.4, 0.4], [0.5, 0.8, 1], [1, 0.9, 0.4], [0.7, 1, 0.5], [1, 0.6, 1]];
    for (let k = 0; k < 7; k++) {
      this.pending.push({
        at: this.time + k * 0.45 + Math.random() * 0.3,
        fn: () => {
          const cx = x + (Math.random() - 0.5) * 3, cy = y + 3 + Math.random() * 1.5, cz = z + (Math.random() - 0.5) * 3;
          const c = colors[(Math.random() * colors.length) | 0];
          for (let i = 0; i < 70; i++) {
            const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 0.5;
            const q = Math.sqrt(1 - u * u);
            this.fx.emit({
              x: cx, y: cy, z: cz, vx: q * Math.cos(th) * s, vy: u * s, vz: q * Math.sin(th) * s,
              gravity: -0.8, drag: 1.2, wind: 0, life: 1.4 + Math.random() * 0.6,
              size: 0.12, size1: 0.03, r: c[0], g: c[1], b: c[2], alpha: 1, alpha1: 0,
            });
          }
        },
      });
    }
  }

  _rebuildGlows() {
    const statics = [];
    const pools = [];
    const add = (g, warm = true) => {
      statics.push({ x: g.x, y: g.y, z: g.z, size: g.kind === 'forge' ? 0.5 : 0.42, r: 1, g: g.kind === 'forge' ? 0.5 : 0.78, b: g.kind === 'forge' ? 0.15 : 0.42, a: g.kind === 'forge' ? 0.7 : 0.75, always: g.kind === 'forge' });
      if (warm && g.kind !== 'forge') pools.push([g.x, g.ground, g.z]);
    };
    for (const l of this.roads.lamps) add({ ...l, kind: 'lamp' });
    for (const it of this.items.values()) for (const g of it.glows) add(g);
    this.glow.setStatics(statics);
    // ground light pools
    const pos = [], uv = [];
    const t = this.world.terrain;
    for (const [x, gy, z] of pools) {
      const s = 0.55;
      const pts = [[x - s, z - s, 0, 0], [x - s, z + s, 0, 1], [x + s, z + s, 1, 1], [x - s, z - s, 0, 0], [x + s, z + s, 1, 1], [x + s, z - s, 1, 0]];
      for (const [px, pz, u, v] of pts) {
        const h = Math.max(gy, t.heightAt(px, pz)) + 0.05;
        pos.push(px, h, pz); uv.push(u, v);
      }
    }
    const g = this.pools.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.computeBoundingSphere();
  }

  setSeason(s) {
    if (s === this.season) return;
    this.season = s;
    this.terrain.setSeason(s);
    this.nature.setSeason(s);
    for (const it of [...this.items.values()]) if (it.b.type === 'farm') { this.removeBuilding(it.b, true); this.addBuilding(it.b, false); }
  }

  update(dt, gameDt, env) {
    this.time += dt;
    U.uTime.value = this.time;
    if (this.dirty.terrain) { this.terrain.rebuild(); this.dirty.terrain = false; this.dirty.paint = false; }
    if (this.dirty.paint) { this.terrain.repaint(); this.dirty.paint = false; }
    if (this.dirty.roads) { this.roads.rebuild(); this.dirty.roads = false; this.dirty.glows = true; }
    if (this.dirty.nature) { this.nature.rebuild(); this.dirty.nature = false; }
    if (this.dirty.glows) { this._rebuildGlows(); this.dirty.glows = false; }

    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.time >= this.pending[i].at) { this.pending[i].fn(); this.pending.splice(i, 1); }
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.mesh.scale.y = Math.max(0.01, easeOutBack(k));
      if (k >= 1) { a.mesh.scale.y = 1; this.anims.splice(i, 1); }
    }

    const hours = env.hours, night = env.night, season = env.season;
    // chimney smoke
    if (gameDt > 0) {
      const homeRate = (hours > 6 && hours < 9.5) || (hours > 17 && hours < 23) ? 1.6 : (night > 0.5 ? 0.5 : 0.3);
      const seasonK = season === 3 ? 1.6 : season === 1 ? 0.6 : 1;
      const speedK = Math.min(3, gameDt / Math.max(dt, 1e-4));
      for (const it of this.items.values()) {
        if (!it.smoke.length) continue;
        const working = it.b.workers.length > 0 && hours > 6.5 && hours < 19.5;
        for (const s of it.smoke) {
          const rate = s.kind === 'home' ? homeRate * seasonK * (it.b.residents.length ? 1 : 0)
            : s.kind === 'heavy' ? (working ? 3.5 : 0.4) : (working ? 1.6 : 0.25);
          s.acc += dt * rate * Math.sqrt(speedK);
          while (s.acc >= 1) {
            s.acc -= 1;
            const dark = s.kind === 'heavy' ? 0.55 : 0.88;
            const shade = dark * (1 - night * 0.65);
            this.smoke.emit({
              x: s.x + (Math.random() - 0.5) * 0.02, y: s.y, z: s.z + (Math.random() - 0.5) * 0.02,
              vx: (Math.random() - 0.5) * 0.03, vy: 0.14 + Math.random() * 0.06, vz: (Math.random() - 0.5) * 0.03,
              drag: 0.6, wind: 1, life: 3.5 + Math.random() * 2,
              size: 0.06, size1: s.kind === 'heavy' ? 0.42 : 0.3, r: shade, g: shade, b: shade * 1.03,
              alpha: s.kind === 'heavy' ? 0.6 : 0.45, alpha1: 0, fadeIn: 0.1,
            });
          }
        }
        if (it.spin) it.spin.rotation.z -= dt * it.spin.userData.speed * Math.min(4, Math.max(0.25, speedK));
        if (it.fountain) {
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2, s = 0.15 + Math.random() * 0.12;
            this.smoke.emit({
              x: it.fountain.x, y: it.fountain.y, z: it.fountain.z, vx: Math.cos(a) * s, vy: 0.55 + Math.random() * 0.2, vz: Math.sin(a) * s,
              gravity: -2.2, wind: 0, life: 0.55, size: 0.035, size1: 0.025, r: 0.85, g: 0.93, b: 1, alpha: 0.85, alpha1: 0.4,
            });
          }
        }
      }
    }

    // fireflies on warm nights
    if (night > 0.6 && season <= 2) {
      this.fireflyTimer += dt;
      while (this.fireflyTimer > 0.08) {
        this.fireflyTimer -= 0.08;
        const tg = this.R.rig.target;
        const x = tg.x + (Math.random() - 0.5) * 22, z = tg.z + (Math.random() - 0.5) * 22;
        const tx = Math.floor(x), tz = Math.floor(z);
        if (!this.world.inBounds(tx, tz) || !this.world.treeCount[this.world.idx(tx, tz)]) continue;
        this.fx.emit({
          x, y: this.world.terrain.heightAt(x, z) + 0.15 + Math.random() * 0.4, z,
          vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 0.1,
          wind: 0, life: 4 + Math.random() * 3, size: 0.07, size1: 0.07, r: 0.75, g: 1, b: 0.35,
          alpha: 0.9, alpha1: 0.9, blink: 3 + Math.random() * 3, phase: Math.random() * 6, fadeIn: 0.2,
        });
      }
    }

    // snowfall
    if (env.snowing) {
      const tg = this.R.rig.target;
      const n = Math.floor(dt * 70) + (Math.random() < (dt * 70) % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        this.weather.emit({
          x: tg.x + (Math.random() - 0.5) * 28, y: tg.y + 5 + Math.random() * 2, z: tg.z + (Math.random() - 0.5) * 28,
          vx: 0.1, vy: -0.55 - Math.random() * 0.2, vz: 0.05, wind: 0.6, life: 10,
          size: 0.045, size1: 0.045, r: 1, g: 1, b: 1, alpha: 0.9, alpha1: 0.9, fadeIn: 0.1,
        });
      }
    }

    const scale = this.R.pixelsPerUnit();
    const windK = [0.12, 0.05];
    this.smoke.update(dt, scale, 1, windK);
    this.glow.update(dt, scale, night, windK);
    this.fx.update(dt, scale, 1, windK);
    this.weather.update(dt, scale, 1, windK);
    this.pools.material.opacity = Math.max(0, night - 0.2) * 0.55;
  }

  dispose() {
    this.terrain.dispose(); this.roads.dispose(); this.nature.dispose(); this.overlay.dispose();
    for (const it of this.items.values()) { it.mesh.geometry.dispose(); if (it.spin) it.spin.geometry.dispose(); }
    this.scene.remove(this.group, this.pools);
    this.pools.geometry.dispose();
    for (const p of [this.smoke, this.glow, this.fx, this.weather]) p.dispose(this.scene);
  }
}

