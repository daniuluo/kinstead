// Villagers: daily routines, walking, waiting for transit, and the little
// instanced people you see on the streets.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { BUILDINGS, TRADES, servicesOf, tradesOf, visitOf } from '../defs.js';
import { doorPoint, fw, fd, isOpen } from '../world/world.js';
import { tilePolyline } from './path.js';
import { curvesAt } from '../world/roadShape.js';
import { workArea } from '../render/buildings.js';
import { VillagerView, lookOf, dressOf, carryFrom, strideLen } from '../render/villagers.js';
import { traitsOf } from './people.js';
import { plotGrid, plotPath, stepsGrid, stepAt } from './plotNav.js';

// How villagers look and are drawn lives in render/villagers.js.
export { lookOf };

// The kind of outing a building is for, or null if villagers don't visit it
// (homes, workplaces and schools count their own people). A full place sends
// visitors on to another of the same kind.
export function visitKind(def) {
  if (def.park) return def.outdoor ? 'park' : null;
  if (def.shop) return 'shop';
  if (def.leisure) return 'tavern';
  const sv = servicesOf(def);
  if (sv.includes('culture')) return 'chapel';
  if (sv.includes('health')) return 'clinic';
  return null;
}

// How many visitors a place holds at once: so many per tile, and more with
// each upgrade (open-air places grow a little less).
export function visitorCap(b) {
  const def = BUILDINGS[b.type], kind = visitKind(def);
  if (!kind) return Infinity;
  const base = def.visitors || { park: 3, shop: 4, tavern: 6, chapel: 8, clinic: 3 }[kind];
  return Math.max(2, Math.round(base * fw(b) * fd(b) * (1 + (kind === 'park' ? 0.3 : 0.5) * b.level)));
}

const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(), _v = new THREE.Vector3();

// The top of a doorstep above its door's threshold (see door() in
// render/buildings.js).
const STEP_UP = 0.02;

// How high a walker stands: on the ground or the street, but on the way in
// to a door or out of it, up the steps, the porch and the portico in front
// of it as the model has them (wk.stairsIn / wk.stairsOut, from stepsGrid),
// or where the model isn't known, up on the step and the threshold of the
// door (which on a slope may be well above the street), hopping on to the
// step over the last bit of the way to it and down again on the way out.
export function walkY(w, wk) {
  const g = w.walkHeight(wk.x, wk.z);
  // leaving an open plot: on its ground (which may stand above the street
  // on a slope) to its edge, then down to the street
  if (wk.plotOut && wk.seg < wk.plotOut) return wk.seg < wk.plotOut - 1 ? wk.plotY : wk.plotY + (g - wk.plotY) * wk.t;
  if (wk.floorIn == null && wk.floorOut == null) return g;
  const n = wk.pts.length, s = wk.seg;
  const st = wk.stairsOut && s < wk.doorOut ? wk.stairsOut : wk.stairsIn && s >= n - wk.doorIn - 2 ? wk.stairsIn : null;
  if (st) return Math.max(g, stepAt(st, wk.x, wk.z));
  // the step, the doorway and the step inside stand at the floor
  const at = (i) => (wk.floorOut != null && i < Math.min(3, wk.doorOut) ? wk.floorOut : wk.floorIn != null && i >= n - Math.min(3, wk.doorIn) ? wk.floorIn : null);
  const ya = at(s), yb = at(s + 1);
  if (ya == null && yb == null) return g;
  if (ya != null && yb != null) return Math.max(g, ya + (yb - ya) * wk.t);
  const a = wk.pts[s], b = wk.pts[s + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const off = yb != null ? (1 - wk.t) * L : wk.t * L;   // how far from the step
  return Math.max(g, (yb ?? ya) - Math.max(0, off - 0.02) * 4);
}

// Where a door's path meets the edge of its plot, straight out from the door
// (a little past it, on the pavement); null when the door is at the front.
function gateOf(B, d) {
  const x0 = B.x, z0 = B.z, x1 = B.x + fw(B), z1 = B.z + fd(B);
  let t = Infinity;
  if (d.dx > 1e-3) t = Math.min(t, (x1 - d.x) / d.dx); else if (d.dx < -1e-3) t = Math.min(t, (x0 - d.x) / d.dx);
  if (d.dz > 1e-3) t = Math.min(t, (z1 - d.z) / d.dz); else if (d.dz < -1e-3) t = Math.min(t, (z0 - d.z) / d.dz);
  if (!Number.isFinite(t) || t < 0.2) return null;
  t += 0.05;
  return [d.x + d.dx * t, d.z + d.dz * t];
}

export class Agents {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    // villagers cut a corner along the road's curve (not on a bridge ramp)
    this._curve = (x, z) => curvesAt(this.world, x, z);
    this.walkers = new Set();
    this.plannedDay = -1;
    const scene = game.renderer.scene;
    this.view = new VillagerView(scene, CONFIG.MAX_AGENTS);
    this._grids = new WeakMap();   // a drawn model → the way about its plot (plotNav)
    this._stairs = new WeakMap();  // a drawn model → the steps up to its door
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.065, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.95, depthWrite: false }));
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
    r.lk = lookOf(r, dressOf(this.world, r));
  }

  dispose() {
    this.view.dispose();
    this.game.renderer.scene.remove(this.ring);
  }

  // ------------------------------------------------------------- planning
  _candidates(pred) {
    const out = [];
    for (const b of this.world.buildings.values()) if (b.access && b.connected && isOpen(b) && pred(BUILDINGS[b.type], b)) out.push(b);
    return out;
  }

  // Every kind of place a day's plan can lead to, looked up once and kept
  // for the rest of this update (days are only planned in update(), and
  // nothing there opens, closes or links up a building): planning the whole
  // town's day at midnight doesn't search the town for each villager.
  _places() {
    return this._lists ||= {
      shops: this._candidates(d => d.shop),
      // (allotments are for the old to dig, not for a stroll)
      parks: this._candidates(d => d.park && d.outdoor && !d.potter),
      plays: this._candidates(d => d.play),
      allots: this._candidates(d => d.potter),
      taverns: this._candidates(d => d.leisure && !d.park),
      // (a bandstand brings culture to the streets round it, but nobody goes
      // to it to worship)
      chapels: this._candidates(d => servicesOf(d).includes('culture') && !d.park),
      schools: this._candidates(d => servicesOf(d).includes('education')),
      clinics: this._candidates(d => visitKind(d) === 'clinic'),
    };
  }

  _nearest(r, list, k = 3) {
    if (!list.length) return null;
    const home = this.world.buildings.get(r.home);
    if (!home) return list[(Math.random() * list.length) | 0].id;
    const sorted = list.map(b => [b, Math.abs(b.x - home.x) + Math.abs(b.z - home.z) + Math.random() * 4]).sort((a, b) => a[1] - b[1]);
    return sorted[Math.min(sorted.length - 1, (Math.random() * k) | 0)][0].id;
  }

  // A shopping trip is for one trade (TRADES): one the town sells, the
  // everyday ones most often and those only sold far from home less, at one
  // of the nearer shops selling it. So the town's only draper gets its
  // clothes shopping, and a street of bakeries doesn't draw every errand.
  _shopFor(r, shops) {
    if (!shops.length) return null;
    const home = this.world.buildings.get(r.home);
    if (!home) return this._nearest(r, shops);
    const near = new Map();
    for (const b of shops) {
      const d = Math.abs(b.x - home.x) + Math.abs(b.z - home.z);
      for (const t of tradesOf(b)) if (!(near.get(t) <= d)) near.set(t, d);
    }
    const odds = [];
    let sum = 0;
    for (const [t, d] of near) { const p = (TRADES[t] ? TRADES[t].often : 1) / (1 + Math.max(0, d - 6) / 6); odds.push([t, p]); sum += p; }
    let x = Math.random() * sum, want = odds[odds.length - 1][0];
    for (const [t, p] of odds) if ((x -= p) <= 0) { want = t; break; }
    return this._nearest(r, shops.filter(b => tradesOf(b).includes(want)));
  }

  planDay(r, now) {
    const R = Math.random;
    const { shops, parks, plays, allots, taverns, chapels, schools, clinics } = this._places();
    const pick = (list) => this._nearest(r, list), shop = () => this._shopFor(r, shops);
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
    // children mostly head for somewhere to play
    const playPick = () => pickFar(plays.length && R() < 0.75 ? plays : parks);
    if (r.age === 'adult' && r.school != null && this.world.buildings.get(r.school)) {
      // a student: lectures, then the library or the tavern
      push(8 + R() * 1.2, r.school);
      push(15.5 + R() * 1.5, R() < 0.4 * tavK && taverns.length ? pick(taverns) : home);
      if (plan[plan.length - 1].dest !== home) push(21 + R(), home);
    } else if (r.age === 'adult' && r.job != null) {
      const job = this.world.buildings.get(r.job);
      const late = job && BUILDINGS[job.type].leisure;
      const start = late ? 13 + R() * 1.5 : 6.4 + R() * 1.7 + shift;
      const end = late ? 21.5 + R() * 1.2 : 16 + R() * 1.8 + shift + (has('diligent') ? 0.8 : 0);
      push(start, r.job);
      const after = R(), pShop = 0.38 * shopK * outK, pOut = pShop + 0.24 * outK;
      if (!late && after < pShop && shops.length) { push(end, shop()); push(end + 0.7 + R() * 1.2, home); }
      else if (!late && after < pOut && leisure.length) { push(end, pickFar(leisure)); push(end + 1 + R() * 1.6, home); }
      else push(end, home);
      if (!late && has('devout') && chapels.length && R() < 0.5) { push(18.4 + R() * 0.4, pick(chapels)); push(19.4 + R() * 0.4, home); }
      else if (!late && R() < 0.2 * tavK && taverns.length) { push(19.6 + R() + shift, pick(taverns)); push(22 + R() * 1.4 + shift, home); }
    } else if (r.age === 'adult') {
      push(8.5 + R() * 2.5 + shift, R() < Math.min(1, 0.75 * shopK) ? shop() ?? pick(parks) : pickFar(parks) ?? shop());
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
        push(14 + R() * 0.8, R() < play ? playPick() ?? home : home);
        push(17.5 + R(), home);
      } else {
        push(9.5 + R() * 2, playPick());
        push(12.5 + R(), home);
        if (R() < play + 0.2) push(15 + R(), playPick());
        push(18 + R() * 0.5, home);
      }
    } else {
      // the old: chapel, the park, or of a morning their allotment
      const dig = allots.length && !has('devout') && R() < (has('outdoorsy') ? 0.7 : 0.45);
      push(8.4 + R() * 2 + shift, dig ? pick(allots) : has('devout') || R() < 0.6 ? pick(chapels) ?? pick(parks) : pickFar(parks));
      push(11.5 + R(), home);
      if (R() < 0.6 * outK) { push(14 + R() * 2, R() < 0.6 * shopK ? shop() ?? pick(parks) : pickFar(parks)); push(16.6 + R(), home); }
    }
    // now and then a visit to the herbalist or the doctor, in the early
    // afternoon while they're at home anyway (the old go most often)
    const atSchool = r.school != null && this.world.buildings.get(r.school);
    const free = r.age === 'elder' || (!atSchool && (r.age === 'child' || (r.age === 'adult' && r.job == null)));
    if (clinics.length && free && R() < (r.age === 'elder' ? 0.25 : r.age === 'child' ? 0.08 : 0.06)) {
      const t = r.age === 'elder' ? 12.6 + R() * 0.5 : r.age === 'child' ? 13.6 + R() * 0.3 : 13.1 + R() * 0.4;
      push(t, pick(clinics));
      push(t + 0.9 + R() * 0.5, home);
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
      // dressed for a new job (or a grander home) from this morning
      const d = dressOf(w, r);
      if (r.lk && (r.lk.kind !== d.kind || r.lk.rich !== d.rich)) this.refreshLook(r);
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
  // walls), the doorway, the doorstep, and the gate: the edge of the plot
  // straight out from the door, so a door set back behind a forecourt, a
  // portico or a garden is walked up to square on rather than across the
  // corner of a wall. Null for open-air places.
  _doorway(B, r, arriving) {
    const d = B && B.door;
    if (!d || B.open) return null;
    const def = BUILDINGS[B.type];
    if (def.stop || def.outdoor || (def.outdoorWork && r && r.job === B.id) || (B.con && r && r.site === B.id) || !isOpen(B)) return null;
    const inside = [d.x - d.dx * 0.09, d.z - d.dz * 0.09], door = [d.x, d.z], step = [d.x + d.dx * 0.08, d.z + d.dz * 0.08];
    const way = [step, door, inside];
    const gate = gateOf(B, d);
    if (gate) way.unshift(gate);
    return arriving ? way : way.reverse();
  }

  _walk(r, A, B, tiles, startPos, onArrive) {
    const start = doorPoint(A), end = doorPoint(B);
    const pts = tilePolyline(tiles, r.lk.lane, start, end, this._curve);
    const out = startPos ? null : this._doorway(A, r, false), into = this._doorway(B, r, true);
    // with a real door the plot-edge point is skipped (the front may stand
    // further forward than the plot edge)
    if (out) { pts.shift(); pts.unshift(...out); }
    if (into) { pts.pop(); pts.push(...into); }
    let plotOut = 0;
    if (startPos) {
      // out of an open plot, round whatever stands in the way
      const g = this._gridOf(A), way = g ? plotPath(g, startPos.x, startPos.z, pts[0][0], pts[0][1]) : null;
      if (way) { way.pop(); pts.unshift(...way); }
      pts.unshift([startPos.x, startPos.z]);
      plotOut = 1 + (way ? way.length : 0);
    }
    const wk = this._makeWalker(r.lk, pts, onArrive);
    wk.plotOut = plotOut;
    wk.plotY = A.baseY + 0.012;
    wk.doorOut = out ? out.length : 0;
    wk.doorIn = into ? into.length : 0;
    wk.floorOut = out ? A.door.y + STEP_UP : null;
    wk.floorIn = into ? B.door.y + STEP_UP : null;
    wk.stairsOut = out ? this._stairsOf(A) : null;
    wk.stairsIn = into ? this._stairsOf(B) : null;
    wk.dest = B.id;
    // the shopping carried home, and a satchel on the way to and from school
    wk.carry = carryFrom(A, r, this.world.day);
    wk.bag = r.school != null && (A.id === r.school || B.id === r.school);
    if (out) wk.delay = Math.random() * 0.25;
    wk.r = r;
    r.walk = wk;
    r.loc = 'walk';
    return wk;
  }

  _makeWalker(lk, pts, onArrive) {
    // every walker has all its fields from the start: one object shape keeps
    // the loops over hundreds of them each frame quick
    const wk = {
      lk, pts, seg: 0, t: 0, x: pts[0][0], z: pts[0][1], y: 0,
      heading: 0, phase: Math.random() * 6, mode: 'path', onArrive, idle: 0, speedK: lk.speed,
      r: null, dest: null, delay: 0, doorOut: 0, doorIn: 0, moving: false, ghost: false, hand: false,
      area: null, ring: false, baseY: 0, working: false, tool: null, target: null, route: null, floorIn: null, floorOut: null, stairsIn: null, stairsOut: null, plotOut: 0, plotY: 0,
      carry: null, bag: false, lamp: false, lx: null, ly: null, lz: null, _i: 0,
    };
    if (pts.length > 1) wk.heading = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    this.walkers.add(wk);
    return wk;
  }

  _drop(wk) { this.walkers.delete(wk); if (wk.r && wk.r.walk === wk) wk.r.walk = null; }

  // The way about B's open plot round what stands on it (plotNav), from its
  // model as drawn: null headless, on a building site, or with no model.
  _gridOf(B) {
    const it = B && !B.con && this.game.view && this.game.view.items && this.game.view.items.get(B.id);
    const mesh = it && it.mesh;
    if (!mesh || !mesh.geometry) return null;
    let g = this._grids.get(mesh);
    if (g === undefined) { g = plotGrid(B, mesh, B.x, B.z, B.x + fw(B), B.z + fd(B)); this._grids.set(mesh, g); }
    return g;
  }

  // The steps up to B's door as its model has them (plotNav stepsGrid): null
  // headless, or with no door or model.
  _stairsOf(B) {
    const it = B && B.door && this.game.view && this.game.view.items && this.game.view.items.get(B.id);
    const mesh = it && it.mesh;
    if (!mesh || !mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) return null;
    let s = this._stairs.get(mesh);
    if (s === undefined) {
      // only the strip from the door out to the street
      const d = B.door, L = Math.max(fw(B), fd(B)) + 0.2, ex = d.x + d.dx * L, ez = d.z + d.dz * L;
      s = stepsGrid(B, mesh, Math.min(d.x, ex) - 0.3, Math.min(d.z, ez) - 0.3, Math.max(d.x, ex) + 0.3, Math.max(d.z, ez) + 0.3, Math.max(d.y, B.baseY) + 0.15);
      this._stairs.set(mesh, s);
    }
    return s;
  }

  _arrive(r, destId) {
    const w = this.world;
    const B = w.buildings.get(destId);
    if (!B) { if (r.walk) this._drop(r.walk); r.loc = 'in'; r.at = r.home; return; }
    const def = BUILDINGS[B.type];
    // a visitor who finds the place full turns round (and doesn't pay)
    if (this._visiting(r, B) && Number.isFinite(visitorCap(B)) && (this._occupancy().get(B.id) || 0) > visitorCap(B) && r.walk) {
      this._occ = null;
      r.at = destId;
      r.loc = 'out';
      const next = this._roomFor(r, null, B);
      this.go(r, next ?? r.home);
      if (r.loc === 'out') { if (r.walk) this._drop(r.walk); r.loc = 'in'; r.at = r.home; }
      return;
    }
    if (def.shop || (def.leisure && !def.park) || (def.park && visitOf(B) && this._visiting(r, B))) {
      const v = this.game.sim.recordVisit(B);
      if (v && r.age !== 'child') r.wealth = Math.round(((r.wealth ?? 60) - v) * 10) / 10;
      if (v) this.game.emit('coins', { x: doorPoint(B).x, y: B.baseY + 0.4, z: doorPoint(B).z, v });
    }
    r.at = destId;
    const site = !!(B.con && r.site === B.id);
    const outdoor = def.outdoor || B.open || (def.outdoorWork && r.job === B.id) || site;
    if (outdoor && r.walk) {
      const wk = r.walk;
      wk.mode = 'wander';
      wk.area = site ? siteArea(B) : B.work || workArea(B) || [B.x + 0.15, B.z + 0.15, B.x + fw(B) - 0.15, B.z + fd(B) - 0.15];
      // a park's visitors stroll between its walks and seats (B.spots, from
      // the model) rather than anywhere on the plot (so not into the pond)
      wk.ring = site;
      wk.baseY = B.baseY + 0.012;
      // the old dig their allotment
      wk.working = (def.outdoorWork && r.job === B.id) || site || (def.potter && r.age === 'elder');
      wk.tool = site ? 'hammer' : B.type === 'orchard' ? 'pick' : 'hoe';
      if (wk.working) wk.carry = null;
      wk.spots = !site && !wk.working && B.spots && B.spots.length ? B.spots : null;
      wk.idle = 0.3;
      wk.target = null;
      wk.route = null;
      wk.floorIn = wk.floorOut = null;
      wk.stairsIn = wk.stairsOut = null;
      wk.plotOut = 0;
      r.loc = 'out';
    } else {
      if (r.walk) this._drop(r.walk);
      r.loc = 'in';
    }
  }

  // ------------------------------------------------------------ crowding
  // Is this villager a visitor there (not living, working, studying or building)?
  _visiting(r, B) { return B.id !== r.home && B.id !== r.job && B.id !== r.school && B.id !== r.site; }

  // Visitors at each place: out in a park, inside a shop, pub, chapel or
  // clinic, or already on their way there.
  _occupancy() {
    if (this._occ) return this._occ;
    const occ = this._occ = new Map();
    const add = (id) => occ.set(id, (occ.get(id) || 0) + 1);
    for (const wk of this.walkers) {
      const r = wk.r;
      if (!r || wk.ghost || wk.working) continue;
      const id = wk.mode === 'wander' ? r.at : wk.mode === 'path' ? wk.dest : null;
      if (id != null && id !== r.home && id !== r.job && id !== r.school) add(id);
    }
    for (const r of this.world.residents.values()) {
      if (r.loc === 'in' && r.at != null && r.at !== r.home && r.at !== r.job && r.at !== r.school) add(r.at);
    }
    return occ;
  }

  visitorsAt(b) { return { now: this._occupancy().get(b.id) || 0, cap: visitorCap(b) }; }

  // Where a villager actually goes: a place that's full sends them to the
  // nearest of the same kind with room, or keeps them at home. (With id null,
  // just look for somewhere else like `full`.)
  _roomFor(r, id, full = null) {
    const w = this.world, B = full || w.buildings.get(id);
    if (!B || !this._visiting(r, B) || visitorCap(B) === Infinity) return id;
    const occ = this._occupancy();
    if (!full && (occ.get(id) || 0) < visitorCap(B)) { occ.set(id, (occ.get(id) || 0) + 1); return id; }
    const kind = visitKind(BUILDINGS[B.type]);
    const from = w.buildings.get(r.at) || w.buildings.get(r.home) || B;
    let best = null, bd = 14;
    for (const o of w.buildings.values()) {
      if (o === B || visitKind(BUILDINGS[o.type]) !== kind || !o.access || !o.connected || !isOpen(o)) continue;
      if ((occ.get(o.id) || 0) >= visitorCap(o)) continue;
      const d = Math.abs(o.x - from.x) + Math.abs(o.z - from.z);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) { occ.set(best.id, (occ.get(best.id) || 0) + 1); return best.id; }
    return r.at === r.home ? null : r.home;
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
      const pts = tilePolyline(tiles, r.lk.lane, startEdge, doorPoint(home), this._curve);
      const into = this._doorway(home, r, true);
      if (into) { pts.pop(); pts.push(...into); }
      const delay = Math.random() * 1.5;
      for (let k = 0; k < 2; k++) pts.unshift([startEdge.x, startEdge.z]);
      const wk = this._makeWalker(r.lk, pts, () => { r.loc = 'in'; r.at = home.id; this._drop(wk); this.planDay(r, w.hours); });
      if (into) { wk.doorIn = into.length; wk.floorIn = home.door.y + STEP_UP; wk.stairsIn = this._stairsOf(home); }
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
      const pts = tilePolyline(tiles, r.lk.lane, doorPoint(from), null, this._curve);
      const out = this._doorway(from, r, false);
      if (out) { pts.shift(); pts.unshift(...out); }
      const wk = this._makeWalker(r.lk, pts, () => this._drop(wk));
      if (out) { wk.doorOut = out.length; wk.floorOut = from.door.y + STEP_UP; wk.stairsOut = this._stairsOf(from); }
      wk.ghost = true;
    }
    this.game.sim.dirty = true;
  }

  // A villager changed age group: refresh their size and colours.
  refreshLook(r) {
    r.lk = lookOf(r, dressOf(this.world, r));
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
    this._lists = null;
    if (this.plannedDay !== w.day) {
      if (this.plannedDay === -1) { for (const r of w.residents.values()) { if (!r.lk) this._initResident(r); this.planDay(r, w.hours); } this.plannedDay = w.day; }
      else this.newDay();
    }
    const hours = w.hours;
    this._occ = null;
    if (gameDt > 0) {
      for (const r of w.residents.values()) {
        if (!r.lk) this._initResident(r);
        if (r.loc === 'walk' || r.loc === 'wait' || r.loc === 'ride') continue;
        if (r.pi < r.plan.length && hours >= r.plan[r.pi].t) {
          const p = r.plan[r.pi++];
          const dest = this._roomFor(r, p.dest);
          if (dest != null) this.go(r, dest);
        }
      }
    }
    const speed = this.game.speed;
    const move = dt * speed * CONFIG.WALK_SPEED;
    const night = this.game.env.night;
    this.lanterns.length = 0;
    for (const wk of [...this.walkers]) {
      if (wk.delay > 0) { wk.delay -= dt * speed; continue; }
      wk.lamp = false;
      if (wk.mode === 'path') {
        const atDoor = (wk.doorOut && wk.seg < wk.doorOut - 1) || (wk.doorIn && wk.seg >= wk.pts.length - wk.doorIn - 1);
        let rem = move * wk.speedK * (atDoor ? 0.45 : 1);
        const want = rem;
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
        wk.y = walkY(w, wk);
        wk.phase += (want - rem) / strideLen(wk.lk.scale);
        wk.moving = speed > 0;
      } else if (wk.mode === 'wander') {
        wk.y = wk.baseY;
        if (wk.idle > 0) { wk.idle -= dt * speed; wk.moving = false; if (wk.working && speed) wk.phase += dt * speed * 4; continue; }
        if (!wk.target && wk.route && wk.route.length) wk.target = wk.route.shift();
        if (!wk.target) {
          const [x0, z0, x1, z1] = wk.area;
          const pick = () => {
            if (wk.ring) {
              // builders work their way round the scaffolding
              const wx = x1 - x0, wz = z1 - z0, t = Math.random() * 2 * (wx + wz);
              return t < wx ? [x0 + t, z0] : t < wx + wz ? [x1, z0 + t - wx] : t < 2 * wx + wz ? [x1 - (t - wx - wz), z1] : [x0, z1 - (t - 2 * wx - wz)];
            }
            if (wk.spots) {
              const p = wk.spots[(Math.random() * wk.spots.length) | 0];
              return [p[0] + (Math.random() - 0.5) * 0.08, p[1] + (Math.random() - 0.5) * 0.08];
            }
            return [x0 + Math.random() * (x1 - x0), z0 + Math.random() * (z1 - z0)];
          };
          wk.target = pick();
          // the way there round the buildings, sheds and stalls on the plot;
          // somewhere else if there's no way to it (shut in by railings, say)
          const g = wk.ring ? null : this._gridOf(wk.r && w.buildings.get(wk.r.at));
          let way = g ? plotPath(g, wk.x, wk.z, wk.target[0], wk.target[1]) : null;
          for (let k = 0; g && !way && k < 3; k++) { wk.target = pick(); way = plotPath(g, wk.x, wk.z, wk.target[0], wk.target[1]); }
          if (way && way.length) { wk.target = way.shift(); wk.route = way; }
          else if (g) { wk.target = null; wk.idle = 1 + Math.random() * 2; wk.moving = false; continue; }
        }
        const dx = wk.target[0] - wk.x, dz = wk.target[1] - wk.z;
        const d = Math.hypot(dx, dz);
        const step = move * (wk.lk.scale < 0.8 ? 0.9 : 0.45);
        if (d <= step) {
          wk.x = wk.target[0]; wk.z = wk.target[1]; wk.target = null;
          // (a corner on the way: straight on round it)
          if (!(wk.route && wk.route.length)) wk.idle = wk.working ? 1.5 + Math.random() * 3 : 1 + Math.random() * 5;
        } else {
          wk.x += (dx / d) * step; wk.z += (dz / d) * step;
          wk.heading += angDiff(Math.atan2(dx, dz), wk.heading) * Math.min(1, dt * 10);
          wk.phase += step / strideLen(wk.lk.scale);
        }
        wk.moving = speed > 0;
      } else if (wk.mode === 'wait') {
        wk.y = w.walkHeight(wk.x, wk.z);
        wk.moving = false;
      }
      wk.lamp = night > 0.55 && wk.mode === 'path' && !wk.ghost && wk.lk.scale > 0.8 && ((wk.r?.look ?? 1) & 3) === 0;
      if (wk.lamp) this.lanterns.push(wk);
    }
    this._render(dt);
  }

  // The walkers to draw this frame: those in view, with a tile to spare for
  // their shadows (off-screen villagers cost time and look no different),
  // and of those, as the Performance settings ask (settings.villagers), only
  // some where crowds gather ('crowds', the default), all, about half, or
  // only those near the middle of the view. The selected villager always
  // shows. Sets wk.shown, which their lanterns follow.
  _drawList() {
    const out = this._shown || (this._shown = []);
    out.length = 0;
    const g = this.game, cam = g.renderer && g.renderer.camera, mode = (g.settings && g.settings.villagers) || 'crowds';
    if (cam) _fr.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const c = cam && g.renderer.rig.target, sel = this.selected;
    const crowd = mode === 'crowds' ? this._crowds() : null;
    for (const wk of this.walkers) {
      let show = !cam || _fr.intersectsSphere(_sp.set(_v.set(wk.x, wk.y, wk.z), 1));
      if (show && mode !== 'all' && !(sel && wk.r === sel)) {
        // the same half of the town every frame (the lane is each villager's own)
        if (mode === 'some') show = (wk.lk.lane * 997) % 1 < 0.5;
        else if (crowd) show = luck(wk) < crowd.shareAt(wk.x, wk.z);
        else if (c) show = Math.hypot(wk.x - c.x, wk.z - c.z) < 12;
      }
      wk.shown = show;
      if (show) out.push(wk);
    }
    return out;
  }

  // How crowded each patch of the town is: in each square of CROWD_CELL
  // tiles, the share of the villagers out there to draw so that about
  // CROWD_MAX show (all of them where there are fewer). It eases towards
  // that a little each frame, so as a crowd gathers or thins villagers fade
  // from view or back one at a time rather than all at once; it blends
  // from one patch to the next (shareAt), so nobody blinks in or out at the
  // edge of one; and as each one's luck is their own, the same ones stay in
  // sight as they walk on.
  _crowds() {
    const C = CONFIG.CROWD_CELL, n = Math.ceil(this.world.N / C);
    let cr = this._crowd;
    if (!cr || cr.n !== n) {
      cr = this._crowd = { n, count: new Uint16Array(n * n), share: new Float32Array(n * n).fill(1) };
      const cl = (v) => Math.min(n - 1, Math.max(0, v));
      cr.at = (wk) => cl(Math.floor(wk.z / C)) * n + cl(Math.floor(wk.x / C));
      cr.shareAt = (x, z) => {
        const fx = x / C - 0.5, fz = z / C - 0.5, i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k;
        const S = cr.share, i0 = cl(i), i1 = cl(i + 1), k0 = cl(k) * n, k1 = cl(k + 1) * n;
        return (S[k0 + i0] * (1 - u) + S[k0 + i1] * u) * (1 - v) + (S[k1 + i0] * (1 - u) + S[k1 + i1] * u) * v;
      };
    }
    cr.count.fill(0);
    for (const wk of this.walkers) cr.count[cr.at(wk)]++;
    for (let i = 0; i < cr.share.length; i++) {
      const want = Math.min(1, CONFIG.CROWD_MAX / Math.max(1, cr.count[i]));
      cr.share[i] += (want - cr.share[i]) * 0.05;
    }
    return cr;
  }

  _render(dt) {
    this.view.draw(this._drawList(), this.game.env, this.game.renderer.camera);
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
      _v.set(wk.x, wk.y + 0.08 * wk.lk.scale, wk.z);
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

// A villager's own luck, from 0 to 1, the same every frame (the departing,
// who are no longer residents, go by their lane).
function luck(wk) {
  const v = wk.r ? wk.r.id * 0.6180339887 : wk.lk.lane * 997;
  return v - Math.floor(v);
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
