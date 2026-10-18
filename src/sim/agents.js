// Villagers: daily routines, walking, waiting for transit, and the little
// instanced people you see on the streets.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { BUILDINGS, servicesOf } from '../defs.js';
import { doorPoint, fw, fd, isOpen } from '../world/world.js';
import { tilePolyline } from './path.js';
import { MAT } from '../render/materials.js';
import { workArea } from '../render/buildings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../util/rng.js';
import { traitsOf, yearsOf } from './people.js';

const SKIN = ['#f1c8a5', '#e0ac85', '#c68c63', '#9a6440', '#6e4630', '#f5d6bd', '#d9a07a'];
const HAIR = ['#2b1d14', '#5a3a22', '#8a5a2b', '#c9a15a', '#1a1a1a', '#a0522d', '#6b4a35'];
const SHIRT = ['#8a3b32', '#3f5a7a', '#4f6b3f', '#a8843a', '#5f4a6e', '#3f6a6a', '#9a5a3a', '#d8cfbf', '#4f5a7a', '#7a4a3a', '#6a7a3a', '#7a4a5e', '#b8a888', '#5e4a36'];
const PANTS = ['#3a3f4a', '#5a4a3a', '#4a4f3a', '#5e5a55', '#2f3238', '#6e5e48', '#45392f'];
const HATS = ['#b89a5a', '#5e3a2a', '#d8cfbf', '#3a4250', '#4e3828'];

function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); n.computeVertexNormals(); return n; }
const GEO = {
  leg: flat(new THREE.BoxGeometry(0.022, 0.065, 0.026).translate(0, -0.0325, 0)),
  arm: flat(new THREE.BoxGeometry(0.016, 0.06, 0.018).translate(0, -0.03, 0)),
  body: flat(new THREE.CylinderGeometry(0.03, 0.042, 0.085, 7).translate(0, 0.0425, 0)),
  head: flat(new THREE.IcosahedronGeometry(0.03, 1)),
  hair: flat(new THREE.IcosahedronGeometry(0.032, 1).scale(1, 0.62, 1).translate(0, 0.006, -0.004)),
  hat: flat(mergeGeometries([
    flat(new THREE.CylinderGeometry(0.046, 0.046, 0.006, 10)),
    flat(new THREE.CylinderGeometry(0.026, 0.03, 0.03, 10).translate(0, 0.018, 0)),
  ])),
};

export function lookOf(r) {
  const g = new RNG(r.look >>> 0);
  const elder = r.age === 'elder';
  return {
    skin: new THREE.Color(g.pick(SKIN)),
    hair: new THREE.Color(elder ? (g.chance(0.5) ? '#d8d4cc' : '#b8b4ac') : g.pick(HAIR)),
    shirt: new THREE.Color(g.pick(SHIRT)),
    pants: new THREE.Color(g.pick(PANTS)),
    hat: g.chance(r.age === 'child' ? 0.1 : 0.32) ? new THREE.Color(g.pick(HATS)) : null,
    scale: (r.age === 'child' ? 0.5 + Math.min(1, yearsOf(r) / 17) * 0.3 : elder ? 0.86 : 0.88 + g.next() * 0.08),
    lane: 0.07 + g.next() * 0.13,
    speed: (r.age === 'elder' ? 0.72 : r.age === 'child' ? 1.15 : 1) * (0.9 + g.next() * 0.2),
  };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const YAXIS = new THREE.Vector3(0, 1, 0), XAXIS = new THREE.Vector3(1, 0, 0);

export class Agents {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.walkers = new Set();
    this.plannedDay = -1;
    const scene = game.renderer.scene;
    const max = CONFIG.MAX_AGENTS;
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, MAT.agent, max);
      m.castShadow = true; m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color('#ffffff'));
      scene.add(m);
      return m;
    };
    this.parts = { body: mk(GEO.body), head: mk(GEO.head), hair: mk(GEO.hair), legL: mk(GEO.leg), legR: mk(GEO.leg), armL: mk(GEO.arm), armR: mk(GEO.arm), hat: mk(GEO.hat) };
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.renderOrder = 8;
    this.ring.visible = false;
    scene.add(this.ring);
    this.selected = null;
    for (const r of this.world.residents.values()) this._initResident(r);
    this.lanterns = [];
  }

  _initResident(r) {
    r.loc = 'in';
    r.at = r.home;
    r.plan = [];
    r.pi = 0;
    r.walk = null;
    r.lk = lookOf(r);
  }

  dispose() {
    const scene = this.game.renderer.scene;
    for (const m of Object.values(this.parts)) { scene.remove(m); m.dispose(); }
    scene.remove(this.ring);
  }

  // ------------------------------------------------------------- planning
  _candidates(pred) {
    const out = [];
    for (const b of this.world.buildings.values()) if (b.access && b.connected && isOpen(b) && pred(BUILDINGS[b.type], b)) out.push(b);
    return out;
  }

  _nearest(r, list, k = 3) {
    if (!list.length) return null;
    const home = this.world.buildings.get(r.home);
    if (!home) return list[(Math.random() * list.length) | 0].id;
    const sorted = list.map(b => [b, Math.abs(b.x - home.x) + Math.abs(b.z - home.z) + Math.random() * 4]).sort((a, b) => a[1] - b[1]);
    return sorted[Math.min(sorted.length - 1, (Math.random() * k) | 0)][0].id;
  }

  planDay(r, now) {
    const R = Math.random;
    const shops = this._candidates(d => d.shop);
    const parks = this._candidates(d => d.park && d.outdoor);
    const taverns = this._candidates(d => d.leisure && !d.park);
    const chapels = this._candidates(d => servicesOf(d).includes('culture'));
    const schools = this._candidates(d => servicesOf(d).includes('education'));
    const pick = (list) => this._nearest(r, list);
    const plan = [];
    const home = r.home;
    const push = (t, dest) => { if (dest != null) plan.push({ t, dest }); };
    // personality: when they get up, how often they go out and where to
    const T = traitsOf(r), has = (t) => T.includes(t);
    const shopK = has('shopper') ? 1.8 : has('thrifty') ? 0.5 : 1;
    const outK = has('homebody') ? 0.5 : has('social') || has('curious') ? 1.5 : 1;
    const tavK = has('owl') ? 2.5 : has('social') ? 1.8 : has('homebody') ? 0.4 : 1;
    const shift = has('early') ? -0.6 : has('owl') ? 0.6 : 0;
    const leisure = has('outdoorsy') && parks.length ? parks : parks.concat(taverns);
    const pickFar = (list) => has('curious') ? this._nearest(r, list, 8) : pick(list);
    if (r.age === 'adult' && r.job != null) {
      const job = this.world.buildings.get(r.job);
      const late = job && BUILDINGS[job.type].leisure;
      const start = late ? 13 + R() * 1.5 : 6.4 + R() * 1.7 + shift;
      const end = late ? 21.5 + R() * 1.2 : 16 + R() * 1.8 + shift + (has('diligent') ? 0.8 : 0);
      push(start, r.job);
      const after = R(), pShop = 0.38 * shopK * outK, pOut = pShop + 0.24 * outK;
      if (!late && after < pShop && shops.length) { push(end, pick(shops)); push(end + 0.7 + R() * 1.2, home); }
      else if (!late && after < pOut && leisure.length) { push(end, pickFar(leisure)); push(end + 1 + R() * 1.6, home); }
      else push(end, home);
      if (!late && has('devout') && chapels.length && R() < 0.5) { push(18.4 + R() * 0.4, pick(chapels)); push(19.4 + R() * 0.4, home); }
      else if (!late && R() < 0.2 * tavK && taverns.length) { push(19.6 + R() + shift, pick(taverns)); push(22 + R() * 1.4 + shift, home); }
    } else if (r.age === 'adult') {
      push(8.5 + R() * 2.5 + shift, R() < Math.min(1, 0.75 * shopK) ? pick(shops) ?? pick(parks) : pickFar(parks) ?? pick(shops));
      push(12 + R(), home);
      if (R() < 0.55 * outK) { push(14.5 + R() * 2, has('devout') ? pick(chapels) ?? pickFar(leisure) : pickFar(leisure)); push(18 + R(), home); }
      if (R() < 0.12 * tavK && taverns.length) { push(19.8 + R(), pick(taverns)); push(22.2 + R(), home); }
    } else if (r.age === 'child') {
      const play = has('playful') ? 0.9 : has('bookish') ? 0.3 : 0.6;
      // pupils go to their own school; the youngest and those without a
      // place stay home and play
      const school = r.school != null && this.world.buildings.get(r.school) ? r.school : null;
      if (school != null) {
        push(7.3 + R() * 0.7, school);
        push(14 + R() * 0.8, R() < play ? pickFar(parks) ?? home : home);
        push(17.5 + R(), home);
      } else {
        push(9.5 + R() * 2, pickFar(parks));
        push(12.5 + R(), home);
        if (R() < play + 0.2) push(15 + R(), pickFar(parks));
        push(18 + R() * 0.5, home);
      }
    } else {
      push(8.4 + R() * 2 + shift, has('devout') || R() < 0.6 ? pick(chapels) ?? pick(parks) : pickFar(parks));
      push(11.5 + R(), home);
      if (R() < 0.6 * outK) { push(14 + R() * 2, R() < 0.6 * shopK ? pick(shops) ?? pick(parks) : pickFar(parks)); push(16.6 + R(), home); }
    }
    plan.sort((a, b) => a.t - b.t);
    r.plan = plan.filter((p, i) => i === 0 || p.dest !== plan[i - 1].dest);
    r.pi = 0;
    // catch up if we're mid-day (new game / loaded save)
    if (now != null) {
      while (r.pi < r.plan.length && r.plan[r.pi].t < now) {
        const p = r.plan[r.pi++];
        if (r.loc === 'in' && this.world.buildings.get(p.dest)) {
          const B = this.world.buildings.get(p.dest);
          const d = BUILDINGS[B.type];
          if (!(d.outdoor || (d.outdoorWork && r.job === B.id))) r.at = p.dest;
        }
      }
    }
  }

  newDay() {
    const w = this.world;
    for (const r of w.residents.values()) {
      this.planDay(r, null);
      if (r.loc === 'out' || (r.loc === 'in' && r.at !== r.home)) r.plan.unshift({ t: 0, dest: r.home });
    }
    this.plannedDay = w.day;
  }

  // ------------------------------------------------------------- movement
  go(r, destId) {
    const w = this.world;
    if (r.loc === 'walk' || r.loc === 'wait' || r.loc === 'ride') return;
    if (r.site != null && destId !== r.site) r.site = null;
    let A = w.buildings.get(r.at);
    const B = w.buildings.get(destId);
    if (!A) { r.at = r.home; A = w.buildings.get(r.home); if (r.walk) this._drop(r.walk); r.loc = 'in'; }
    if (!A || !B || A === B) return;
    if (!A.access || !B.access) return;
    const tiles = this.game.paths.road(A.access.x, A.access.z, B.access.x, B.access.z);
    if (!tiles) return;
    const startPos = r.loc === 'out' && r.walk ? { x: r.walk.x, z: r.walk.z } : null;
    if (r.walk) this._drop(r.walk);
    const plan = r.skipTransit ? null : this.game.transit.plan(A, B, tiles.length);
    r.skipTransit = false;
    if (plan) {
      const t1 = this.game.paths.road(A.access.x, A.access.z, plan.board.access.x, plan.board.access.z);
      if (t1) {
        this._walk(r, A, plan.board, t1, startPos, () => this.game.transit.wait(r, plan, B.id));
        return;
      }
    }
    this._walk(r, A, B, tiles, startPos, () => this._arrive(r, B.id));
  }

  // Front door of a building as a short path: a step inside (hidden by the
  // walls), the doorway, and the doorstep. Null for open-air places.
  _doorway(B, r, arriving) {
    const d = B && B.door;
    if (!d) return null;
    const def = BUILDINGS[B.type];
    if (def.stop || def.outdoor || (def.outdoorWork && r && r.job === B.id) || (B.con && r && r.site === B.id) || !isOpen(B)) return null;
    const inside = [d.x - d.dx * 0.09, d.z - d.dz * 0.09], door = [d.x, d.z], step = [d.x + d.dx * 0.08, d.z + d.dz * 0.08];
    return arriving ? [step, door, inside] : [inside, door, step];
  }

  _walk(r, A, B, tiles, startPos, onArrive) {
    const start = doorPoint(A), end = doorPoint(B);
    const pts = tilePolyline(tiles, r.lk.lane, start, end);
    const out = startPos ? null : this._doorway(A, r, false), into = this._doorway(B, r, true);
    // with a real door the plot-edge point is skipped (the front may stand
    // further forward than the plot edge)
    if (out) { pts.shift(); pts.unshift(...out); }
    if (into) { pts.pop(); pts.push(...into); }
    if (startPos) pts.unshift([startPos.x, startPos.z]);
    const wk = this._makeWalker(r.lk, pts, onArrive);
    wk.doorOut = out ? out.length : 0;
    wk.doorIn = into ? into.length : 0;
    if (out) wk.delay = Math.random() * 0.25;
    wk.r = r;
    r.walk = wk;
    r.loc = 'walk';
    return wk;
  }

  _makeWalker(lk, pts, onArrive) {
    const wk = {
      lk, pts, seg: 0, t: 0, x: pts[0][0], z: pts[0][1], y: 0,
      heading: 0, phase: Math.random() * 6, mode: 'path', onArrive, idle: 0, speedK: lk.speed,
    };
    if (pts.length > 1) wk.heading = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    this.walkers.add(wk);
    return wk;
  }

  _drop(wk) { this.walkers.delete(wk); if (wk.r && wk.r.walk === wk) wk.r.walk = null; }

  _arrive(r, destId) {
    const w = this.world;
    const B = w.buildings.get(destId);
    if (!B) { if (r.walk) this._drop(r.walk); r.loc = 'in'; r.at = r.home; return; }
    const def = BUILDINGS[B.type];
    if (def.shop || (def.leisure && !def.park)) {
      const v = this.game.sim.recordVisit(B);
      if (v && r.age !== 'child') r.wealth = Math.round(((r.wealth ?? 60) - v) * 10) / 10;
      if (v) this.game.emit('coins', { x: doorPoint(B).x, y: B.baseY + 0.4, z: doorPoint(B).z, v });
    }
    r.at = destId;
    const site = !!(B.con && r.site === B.id);
    const outdoor = def.outdoor || (def.outdoorWork && r.job === B.id) || site;
    if (outdoor && r.walk) {
      const wk = r.walk;
      wk.mode = 'wander';
      wk.area = site ? siteArea(B) : B.work || workArea(B) || [B.x + 0.15, B.z + 0.15, B.x + fw(B) - 0.15, B.z + fd(B) - 0.15];
      wk.ring = site;
      wk.baseY = B.baseY + 0.012;
      wk.working = (def.outdoorWork && r.job === B.id) || site;
      wk.idle = 0.3;
      wk.target = null;
      r.loc = 'out';
    } else {
      if (r.walk) this._drop(r.walk);
      r.loc = 'in';
    }
  }

  // Called by transit when a passenger alights.
  alight(r, stop, destId) {
    const w = this.world;
    const B = w.buildings.get(destId);
    r.at = stop.id;
    r.loc = 'in';
    if (!B || !stop.access || !B.access) { r.at = r.home; return; }
    const tiles = this.game.paths.road(stop.access.x, stop.access.z, B.access.x, B.access.z);
    if (!tiles) { r.at = r.home; return; }
    this._walk(r, stop, B, tiles, null, () => this._arrive(r, B.id));
  }

  // Passenger waiting at a stop (visible, standing around).
  waitAt(r, stop) {
    const p = doorPoint(stop);
    const cx = stop.x + 0.5, cz = stop.z + 0.5;
    const wk = r.walk || this._makeWalker(r.lk, [[p.x, p.z]], null);
    wk.r = r;
    r.walk = wk;
    wk.mode = 'wait';
    wk.x = p.x + (cx - p.x) * 0.25 + (Math.random() - 0.5) * 0.35;
    wk.z = p.z + (cz - p.z) * 0.25 + (Math.random() - 0.5) * 0.35;
    wk.heading = Math.atan2(p.x - cx, p.z - cz);
    r.loc = 'wait';
  }

  board(r) {
    if (r.walk) this._drop(r.walk);
    r.loc = 'ride';
  }

  // New villagers walk in from the road at the map edge.
  arrive(family, home) {
    const w = this.world;
    const e = w.entry;
    for (const r of family) {
      this._initResident(r);
      const tiles = home.access ? this.game.paths.road(e.x, e.z, home.access.x, home.access.z) : null;
      if (!tiles) continue;
      const startEdge = { x: e.x + 0.5 + (e.x === 0 ? -0.5 : e.x === w.N - 1 ? 0.5 : 0), z: e.z + 0.5 + (e.z === 0 ? -0.5 : e.z === w.N - 1 ? 0.5 : 0) };
      const pts = tilePolyline(tiles, r.lk.lane, startEdge, doorPoint(home));
      const into = this._doorway(home, r, true);
      if (into) { pts.pop(); pts.push(...into); }
      const delay = Math.random() * 1.5;
      for (let k = 0; k < 2; k++) pts.unshift([startEdge.x, startEdge.z]);
      const wk = this._makeWalker(r.lk, pts, () => { r.loc = 'in'; r.at = home.id; this._drop(wk); this.planDay(r, w.hours); });
      wk.delay = delay;
      wk.r = r;
      r.walk = wk;
      r.loc = 'walk';
      r.at = null;
    }
  }

  // Residents leaving town walk to the map edge and vanish.
  depart(ids, fromBuilding = null) {
    const w = this.world, e = w.entry;
    for (const id of ids) {
      const r = w.residents.get(id);
      if (!r) continue;
      w.residents.delete(id);
      w.stats.departures++;
      if (r.walk) this._drop(r.walk);
      if (this.selected === r) this.select(null);
      this.game.transit.forget(r);
      const from = fromBuilding || w.buildings.get(r.home);
      if (!from || !from.access) continue;
      const tiles = this.game.paths.road(from.access.x, from.access.z, e.x, e.z);
      if (!tiles) continue;
      const pts = tilePolyline(tiles, r.lk.lane, doorPoint(from), null);
      const out = this._doorway(from, r, false);
      if (out) { pts.shift(); pts.unshift(...out); }
      const wk = this._makeWalker(r.lk, pts, () => this._drop(wk));
      if (out) wk.doorOut = out.length;
      wk.ghost = true;
    }
    this.game.sim.dirty = true;
  }

  // A villager changed age group: refresh their size and colours.
  refreshLook(r) {
    r.lk = lookOf(r);
    if (r.walk) { r.walk.lk = r.lk; r.walk.speedK = r.lk.speed; }
  }

  // A villager is gone for good (passed away).
  remove(r) {
    if (r.walk) this._drop(r.walk);
    this.game.transit.forget(r);
    if (this.selected === r) this.select(null);
  }

  relocate(r) {
    if (r.walk) this._drop(r.walk);
    this.game.transit.forget(r);
    r.loc = 'in';
    r.at = r.home;
  }

  // ---------------------------------------------------------------- update
  update(dt, gameDt) {
    const w = this.world;
    if (this.plannedDay !== w.day) {
      if (this.plannedDay === -1) { for (const r of w.residents.values()) { if (!r.lk) this._initResident(r); this.planDay(r, w.hours); } this.plannedDay = w.day; }
      else this.newDay();
    }
    const hours = w.hours;
    if (gameDt > 0) {
      for (const r of w.residents.values()) {
        if (!r.lk) this._initResident(r);
        if (r.loc === 'walk' || r.loc === 'wait' || r.loc === 'ride') continue;
        if (r.pi < r.plan.length && hours >= r.plan[r.pi].t) {
          const p = r.plan[r.pi++];
          this.go(r, p.dest);
        }
      }
    }
    const speed = this.game.speed;
    const move = dt * speed * CONFIG.WALK_SPEED;
    const night = this.game.env.night;
    this.lanterns.length = 0;
    for (const wk of [...this.walkers]) {
      if (wk.delay > 0) { wk.delay -= dt * speed; continue; }
      if (wk.mode === 'path') {
        const atDoor = (wk.doorOut && wk.seg < wk.doorOut - 1) || (wk.doorIn && wk.seg >= wk.pts.length - wk.doorIn - 1);
        let rem = move * wk.speedK * (atDoor ? 0.45 : 1);
        while (rem > 0 && wk.seg < wk.pts.length - 1) {
          const a = wk.pts[wk.seg], b = wk.pts[wk.seg + 1];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const left = L * (1 - wk.t);
          if (rem >= left) { rem -= left; wk.seg++; wk.t = 0; }
          else { wk.t += rem / Math.max(L, 1e-6); rem = 0; }
        }
        if (wk.seg >= wk.pts.length - 1) {
          const end = wk.pts[wk.pts.length - 1];
          wk.x = end[0]; wk.z = end[1];
          if (wk.onArrive) { const f = wk.onArrive; wk.onArrive = null; f(); }
          else this._drop(wk);
          continue;
        }
        const a = wk.pts[wk.seg], b = wk.pts[wk.seg + 1];
        wk.x = a[0] + (b[0] - a[0]) * wk.t;
        wk.z = a[1] + (b[1] - a[1]) * wk.t;
        const hd = Math.atan2(b[0] - a[0], b[1] - a[1]);
        wk.heading += angDiff(hd, wk.heading) * Math.min(1, dt * 12);
        wk.y = w.walkHeight(wk.x, wk.z);
        if (speed) wk.phase += dt * speed * 13 * wk.speedK;
        wk.moving = speed > 0;
      } else if (wk.mode === 'wander') {
        wk.y = wk.baseY;
        if (wk.idle > 0) { wk.idle -= dt * speed; wk.moving = false; if (wk.working && speed) wk.phase += dt * speed * 4; continue; }
        if (!wk.target) {
          const [x0, z0, x1, z1] = wk.area;
          if (wk.ring) {
            // builders work their way round the scaffolding
            const wx = x1 - x0, wz = z1 - z0, t = Math.random() * 2 * (wx + wz);
            wk.target = t < wx ? [x0 + t, z0] : t < wx + wz ? [x1, z0 + t - wx] : t < 2 * wx + wz ? [x1 - (t - wx - wz), z1] : [x0, z1 - (t - 2 * wx - wz)];
          } else wk.target = [x0 + Math.random() * (x1 - x0), z0 + Math.random() * (z1 - z0)];
        }
        const dx = wk.target[0] - wk.x, dz = wk.target[1] - wk.z;
        const d = Math.hypot(dx, dz);
        const step = move * (wk.lk.scale < 0.8 ? 0.9 : 0.45);
        if (d <= step) {
          wk.x = wk.target[0]; wk.z = wk.target[1]; wk.target = null;
          wk.idle = wk.working ? 1.5 + Math.random() * 3 : 1 + Math.random() * 5;
        } else {
          wk.x += (dx / d) * step; wk.z += (dz / d) * step;
          wk.heading += angDiff(Math.atan2(dx, dz), wk.heading) * Math.min(1, dt * 10);
          if (speed) wk.phase += dt * speed * 9;
        }
        wk.moving = speed > 0;
      } else if (wk.mode === 'wait') {
        wk.y = w.walkHeight(wk.x, wk.z);
        wk.moving = false;
      }
      if (night > 0.55 && wk.mode === 'path' && !wk.ghost && wk.lk.scale > 0.8 && ((wk.r?.look ?? 1) & 3) === 0) this.lanterns.push(wk);
    }
    this._render(dt);
  }

  _render(dt) {
    const P = this.parts;
    let i = 0;
    const max = CONFIG.MAX_AGENTS;
    const t = performance.now() * 0.001;
    for (const wk of this.walkers) {
      if (i >= max) break;
      if (wk.delay > 0) continue;
      const lk = wk.lk, s = lk.scale;
      const swing = wk.moving ? Math.sin(wk.phase) * 0.65 : (wk.working ? Math.sin(wk.phase) * 0.9 : 0);
      const bob = wk.moving ? Math.abs(Math.sin(wk.phase)) * 0.008 * s : 0;
      const idleSway = wk.moving ? 0 : Math.sin(t * 1.5 + wk.phase) * 0.04;
      _q.setFromAxisAngle(YAXIS, wk.heading + idleSway);
      const ch = Math.cos(wk.heading), sh = Math.sin(wk.heading);
      const local = (lx, ly, lz) => _p.set(wk.x + (lx * ch + lz * sh) * s, wk.y + ly * s + bob, wk.z + (-lx * sh + lz * ch) * s);
      _s.set(s, s, s);
      // body & head
      P.body.setMatrixAt(i, _m.compose(local(0, 0.06, 0), _q, _s));
      P.head.setMatrixAt(i, _m.compose(local(0, 0.172, 0), _q, _s));
      P.hair.setMatrixAt(i, _m.compose(local(0, 0.18, 0), _q, _s));
      if (lk.hat) P.hat.setMatrixAt(i, _m.compose(local(0, 0.198, 0), _q, _s));
      else P.hat.setMatrixAt(i, _m.makeScale(0, 0, 0));
      // limbs
      _q2.setFromAxisAngle(XAXIS, swing); _q2.premultiply(_q);
      P.legL.setMatrixAt(i, _m.compose(local(-0.016, 0.066, 0), _q2, _s));
      P.armR.setMatrixAt(i, _m.compose(local(0.044, 0.142, 0), _q2, _s));
      _q2.setFromAxisAngle(XAXIS, -swing); _q2.premultiply(_q);
      P.legR.setMatrixAt(i, _m.compose(local(0.016, 0.066, 0), _q2, _s));
      P.armL.setMatrixAt(i, _m.compose(local(-0.044, 0.142, 0), _q2, _s));
      P.body.setColorAt(i, lk.shirt);
      P.armL.setColorAt(i, lk.shirt);
      P.armR.setColorAt(i, lk.shirt);
      P.head.setColorAt(i, lk.skin);
      P.hair.setColorAt(i, lk.hair);
      P.legL.setColorAt(i, lk.pants);
      P.legR.setColorAt(i, lk.pants);
      if (lk.hat) P.hat.setColorAt(i, lk.hat);
      wk._i = i;
      i++;
    }
    for (const m of Object.values(P)) {
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // selection ring
    const sel = this.selected;
    if (sel && sel.walk && this.walkers.has(sel.walk)) {
      this.ring.visible = true;
      this.ring.position.set(sel.walk.x, sel.walk.y + 0.01, sel.walk.z);
      this.ring.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.1);
    } else this.ring.visible = false;
  }

  // ------------------------------------------------------------- picking
  pick(clientX, clientY) {
    let best = null, bd = 16;
    for (const wk of this.walkers) {
      if (!wk.r || wk.ghost || wk.delay > 0) continue;
      _v.set(wk.x, wk.y + 0.1 * wk.lk.scale, wk.z);
      const p = this.game.renderer.worldToScreen(_v);
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < bd) { bd = d; best = wk.r; }
    }
    return best;
  }

  select(r) {
    this.selected = r;
  }

  positionOf(r) {
    if (r.walk && this.walkers.has(r.walk)) return { x: r.walk.x, y: r.walk.y, z: r.walk.z };
    if (r.loc === 'ride') { const v = this.game.transit.vehicleOf(r); if (v) return v; }
    const b = this.world.buildings.get(r.at ?? r.home);
    if (b) return { x: b.x + fw(b) / 2, y: b.baseY, z: b.z + fd(b) / 2 };
    return null;
  }

  activity(r) {
    const w = this.world;
    const name = (id) => { const b = w.buildings.get(id); return b ? BUILDINGS[b.type].levels[b.level].name : 'somewhere'; };
    if (r.loc === 'ride') return `Riding the ${this.game.transit.lineNameOf(r) || 'coach'}`;
    if (r.loc === 'wait') return 'Waiting for transit';
    if (r.loc === 'walk') {
      const dest = r.plan[r.pi - 1]?.dest;
      if (r.at === null) return 'Moving to town';
      if (dest === r.home) return 'Walking home';
      if (dest === r.job) return 'Walking to work';
      return `Walking to the ${name(dest)}`;
    }
    const site = r.site != null ? w.buildings.get(r.site) : null;
    if (site && site.con) {
      const what = site.con.kind === 'dismantle' ? 'Taking down' : site.con.kind === 'demolish' ? 'Demolishing' : site.con.kind === 'upgrade' ? 'Upgrading' : 'Building';
      if (r.loc === 'walk') return 'Heading to a building site';
      if (r.loc === 'out' && r.at === site.id) return `${what} the ${name(site.id)}`;
    }
    if (r.loc === 'out') {
      if (r.at === r.job) return `Working at the ${name(r.at)}`;
      return r.age === 'child' ? `Playing at the ${name(r.at)}` : `Relaxing at the ${name(r.at)}`;
    }
    if (r.at === r.home) return w.hours > 21.5 || w.hours < 6 ? 'Sleeping at home' : 'At home';
    if (r.at === r.job) return `Working at the ${name(r.at)}`;
    const b = w.buildings.get(r.at);
    if (b && BUILDINGS[b.type].service === 'education') return 'At school';
    return `Visiting the ${name(r.at)}`;
  }
}

// Where builders walk on a building site: a ring just inside the plot edge.
export function siteArea(B) {
  return [B.x + 0.1, B.z + 0.1, B.x + fw(B) - 0.1, B.z + fd(B) - 0.1];
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
