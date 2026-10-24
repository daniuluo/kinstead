// Collision playtest: plays towns headless with their real building models
// standing in (built as the game draws them), and checks that nothing passes
// through anything solid:
//  - villagers walking, strolling, working or waiting inside a wall, a shed,
//    a fence or a statue (but for the step in through their own door), or on
//    open water;
//  - building models reaching out of their plots, onto a road or into a
//    neighbour's;
//  - coaches, carts and trains through a building; gondola cabins and cables
//    through a roof.
// Besides what the villagers and vehicles happen to do over a few days, it
// sweeps every way in to every door, every stroll between a park's walks and
// seats, every outdoor work area and every gondola route, so nothing is left
// to luck. No starter has a gondola, so each town gets two lines strung
// across its busiest part first.
// Usage: node scripts/collide.js [towns=all] [days=2] [--verbose] [--probe=id,x,z]
//   towns: starter ids, comma-separated ('all': every starter but the heavy
//   Metropolis; 'scale': a big town grown by the demo bot)
//   --probe: the solid parts of building id over point (x, z), its door, and
//   the way villagers walk in to it

import * as THREE from 'three';
import { GeoBuilder } from '../src/render/geo.js';
import { buildModel, workArea } from '../src/render/buildings.js';
import { STARTERS, loadStarter } from '../src/world/starters.js';
import { World, fw, fd, isOpen, doorPoint } from '../src/world/world.js';
import { plotPath } from '../src/sim/plotNav.js';
import { growDemoTown } from '../src/world/demo.js';
import { PathFinder } from '../src/sim/path.js';
import { Sim } from '../src/sim/sim.js';
import { Agents, walkY } from '../src/sim/agents.js';
import { Transit } from '../src/sim/transit.js';
import { Animals } from '../src/sim/animals.js';
import { Construction } from '../src/sim/construction.js';
import { BUILDINGS } from '../src/defs.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const VERBOSE = process.argv.includes('--verbose');
const DAYS = Number(args[1] || 2);
const which = (args[0] || 'all').split(',');
const TRACE = Number((process.argv.find(a => a.startsWith('--probe=')) || '--probe=-1').slice(8).split(',')[0]);

// --------------------------------------------------- the models' solid parts
// Every primitive a GeoBuilder adds is tagged with its own id, which survives
// the merge into one geometry and the model's fit into its plot, so the
// finished model can be split back into its parts.
let PID = 0;
const add0 = GeoBuilder.prototype.add;
GeoBuilder.prototype.add = function (geo, color, local) {
  add0.call(this, geo, color, local);
  const g = this.parts[this.parts.length - 1];
  g.setAttribute('pid', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(++PID), 1));
  return this;
};

// convex hull of [x, z] points, anticlockwise (x right, z down the page)
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-12) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 1e-12) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
const area = (h) => { let s = 0; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
// How far point (x, z) is outside convex hull h (negative: that far inside;
// outside, a lower bound near the corners, which is all the tests need).
function outside(h, x, z) {
  if (h.length < 3) return Infinity;
  let s = -Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1e-9;
    // outward normal of an anticlockwise hull (in x, z) is (ez, -ex)
    s = Math.max(s, ((x - a[0]) * ez - (z - a[1]) * ex) / L);
  }
  return s;
}

// The solid parts of every building, filed by tile, and what the game's
// WorldView would set on each building from its model (door, spots, open).
class Solids {
  constructor(w, game) {
    this.w = w; this.game = game;
    this.byB = new Map();      // building id → its parts
    this.tiles = new Map();    // tile index → parts over it
    this.items = new Map();    // stands in for game.view.items (transit asks how tall a building is)
    for (const b of w.buildings.values()) this.add(b);
    w.on('building:add', (b) => this.add(b));
    w.on('building:change', (b) => { this.remove(b); this.add(b); });
    w.on('building:refit', (b) => { this.remove(b); this.add(b); });
    w.on('building:remove', (b) => this.remove(b));
  }

  add(b) {
    const w = this.w, t = w.terrain;
    const ground = (x, z) => t.heightAt(x, z);
    const up = b.con && b.con.kind === 'upgrade';
    const target = b.con ? buildModel(up ? { ...b, type: b.con.toType || b.type, level: b.con.to, look: b.con.look !== undefined ? b.con.look : b.look, flavor: b.con.flavor !== undefined ? b.con.flavor : b.flavor } : b, { ground }) : null;
    const model = b.con ? (up ? buildModel(b, { ground }) : target) : buildModel(b, { ground });
    const jit = model.jitter;
    const th = (b.rot * Math.PI) / 2 + jit.yaw, co = Math.cos(th), si = Math.sin(th);
    const cx = b.x + fw(b) / 2 + jit.ox, cz = b.z + fd(b) / 2 + jit.oz;
    const toW = (x, z) => [cx + x * co + z * si, cz - x * si + z * co];
    // as WorldView.addBuilding / _addSite
    b.work = workArea(b);
    b.spots = !b.con && model.spots && model.spots.length ? model.spots.map(p => toW(p.x, p.z)) : null;
    const d = model.door;
    if (d) { const [x, z] = toW(d.x, d.z); b.door = { x, y: d.y + b.baseY, z, dx: d.dx * co + d.dz * si, dz: -d.dx * si + d.dz * co, ground: b.baseY }; } else b.door = null;
    b.open = !!model.open;
    this.items.set(b.id, { mesh: { geometry: (target || model).geo, position: { x: cx, y: b.baseY, z: cz }, rotation: { y: th } }, site: b.con ? { target: (target || model).geo } : null });
    // a building site's walls are only part built: nothing solid yet
    if (b.con || !model.geo) { this.byB.set(b.id, []); return; }
    const P = model.geo.attributes.position.array, I = model.geo.attributes.pid.array;
    const parts = [];
    let i0 = 0;
    for (let i = 1; i <= I.length; i++) {
      if (i < I.length && I[i] === I[i0]) continue;
      const seen = new Set(), pts = [];
      let y0 = Infinity, y1 = -Infinity;
      for (let k = i0; k < i; k++) {
        const [x, z] = toW(P[k * 3], P[k * 3 + 2]), y = P[k * 3 + 1] + b.baseY;
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        const key = `${Math.round(x * 1e4)},${Math.round(z * 1e4)}`;
        if (!seen.has(key)) { seen.add(key); pts.push([x, z]); }
      }
      i0 = i;
      const h = hull(pts);
      if (h.length < 3) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of h) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      parts.push({ b, h, x0, x1, z0, z1, y0, y1, a: area(h) });
    }
    this.byB.set(b.id, parts);
    for (const p of parts) {
      for (let tz = Math.floor(p.z0); tz <= Math.floor(p.z1); tz++) for (let tx = Math.floor(p.x0); tx <= Math.floor(p.x1); tx++) {
        if (!w.inBounds(tx, tz)) continue;
        const k = w.idx(tx, tz);
        let l = this.tiles.get(k);
        if (!l) this.tiles.set(k, l = []);
        l.push(p);
      }
    }
  }

  remove(b) {
    const parts = this.byB.get(b.id);
    this.items.delete(b.id);
    if (!parts) return;
    this.byB.delete(b.id);
    const gone = new Set(parts);
    for (const p of parts) for (let tz = Math.floor(p.z0); tz <= Math.floor(p.z1); tz++) for (let tx = Math.floor(p.x0); tx <= Math.floor(p.x1); tx++) {
      if (!this.w.inBounds(tx, tz)) continue;
      const k = this.w.idx(tx, tz), l = this.tiles.get(k);
      if (l) this.tiles.set(k, l.filter(q => !gone.has(q)));
    }
  }

  // The part at (x, z) that a villager standing at height y would be inside:
  // a wall (from their feet to above their middle), or failing that something
  // low (a fence, a bench, a low wall, a hedge), or null. r: how far inside
  // it they must be; skip: a building whose parts don't count.
  hit(x, z, y, r = 0.015, skip = null) {
    if (!this.w.inBounds(Math.floor(x), Math.floor(z))) return null;
    const l = this.tiles.get(this.w.idx(Math.floor(x), Math.floor(z)));
    if (!l) return null;
    let low = null;
    for (const p of l) {
      if (p.b === skip || x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      if (p.y0 > y + 0.06 || p.y1 < y + 0.045) continue;   // overhead (eaves, awnings, signs) or flat (paving, lawn, steps)
      if (outside(p.h, x, z) > -r) continue;
      // no higher than the floor or the doorway: a step, a flight of steps
      // up to a portico, a plinth or a footing, to be climbed rather than
      // walked through
      if (p.y1 <= Math.max(p.b.baseY, p.b.door ? p.b.door.y : -Infinity) + 0.035) { low ||= { p, kind: 'step' }; continue; }
      if (p.y1 >= y + 0.12 && p.a >= 0.0016) return { p, kind: 'wall' };
      if (p.a >= 0.0004) low ||= { p, kind: 'low' };
    }
    return low;
  }

  // Parts within r of (x, z) whose heights overlap [ya, yb] (a gondola cabin).
  touch(x, z, ya, yb, r) {
    const out = [];
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (!this.w.inBounds(tx, tz)) continue;
      for (const p of this.tiles.get(this.w.idx(tx, tz)) || []) {
        if (p.y1 < ya || p.y0 > yb || x < p.x0 - r || x > p.x1 + r || z < p.z0 - r || z > p.z1 + r) continue;
        if (p.a < 0.0016) continue;   // a lamp post, a flagpole: not worth a swerve
        if (outside(p.h, x, z) < r - 0.005 && !out.includes(p)) out.push(p);
      }
    }
    return out;
  }
}

// ----------------------------------------------------------------- findings
const name = (b) => `${BUILDINGS[b.type].levels[b.level].name} (${b.type}.${b.level}${b.look ? ' ' + b.look : ''}${b.flavor ? ' ' + b.flavor : ''})`;
class Findings {
  constructor() { this.map = new Map(); }
  // kind of fault, what it involves, where; counted, with the first few places kept
  add(kind, what, at, serious = true) {
    const key = kind + ' | ' + what;
    let f = this.map.get(key);
    if (!f) this.map.set(key, f = { kind, what, n: 0, at: [], serious });
    f.n++;
    if (f.at.length < 3) f.at.push(at);
  }
  get serious() { let n = 0; for (const f of this.map.values()) if (f.serious) n++; return n; }
  print(indent = '  ') {
    const list = [...this.map.values()].sort((a, b) => (b.serious - a.serious) || a.kind.localeCompare(b.kind) || b.n - a.n);
    for (const f of list) console.log(`${indent}${f.serious ? 'FAIL' : 'warn'} ${f.kind}: ${f.what} ×${f.n}${VERBOSE || f.serious ? '  at ' + f.at.join('; ') : ''}`);
  }
}
const at = (x, z) => `(${x.toFixed(2)}, ${z.toFixed(2)})`;
const THING = { wall: 'a wall', low: 'something low', step: 'the steps (not up them)' };

// ------------------------------------------------------------- static sweeps
// Every way in to every door: from the pavement of its street, at the lanes
// villagers keep to, through the gate and up to the door.
function sweepDoors(game, S, F, lanes) {
  const w = game.world, ag = game.agents;
  for (const B of w.buildings.values()) {
    if (!B.access || !isOpen(B) || !B.door || B.open) continue;
    const def = BUILDINGS[B.type];
    if (def.stop || def.outdoor) continue;
    // a short walk in from the next tile along the street
    const a = B.access;
    const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [a.x + dx, a.z + dz]).find(([x, z]) => w.roadAt(x, z));
    if (!from) continue;
    const tiles = game.paths.road(from[0], from[1], a.x, a.z);
    if (!tiles) continue;
    for (const lane of lanes) {
      const r = { lk: { lane, speed: 1, scale: 1 }, school: null, at: B.id };
      const wk = ag._walk(r, B, B, tiles, { x: from[0] + 0.5, z: from[1] + 0.5 }, () => {});
      ag._drop(wk);
      const pts = wk.pts, n = pts.length - 1;   // the last leg (door → inside) is the way in through the wall
      if (TRACE === B.id) console.log(`  trace #${B.id} lane ${lane}: doorIn ${wk.doorIn} · ${pts.slice(-6).map(([x, z]) => at(x, z)).join(' → ')}`);
      let found = null;
      // from the last point on the street, through the gate, up the step to the door
      for (let s = Math.max(0, n - wk.doorIn - 1); s < n - 1 && !found; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1], L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(L / 0.02));
        for (let j = 0; j <= k && !found; j++) {
          const x = ax + ((bx - ax) * j) / k, z = az + ((bz - az) * j) / k;
          Object.assign(wk, { seg: s, t: j / k, x, z });
          const h = S.hit(x, z, walkY(w, wk));
          if (h) found = { h, x, z, own: h.p.b === B };
        }
      }
      if (found) {
        const { h, x, z, own } = found;
        F.add(`way in through ${THING[h.kind]}`, own ? `${name(B)}, its own` : `${name(B)}, through the ${name(h.p.b)} next door`, `${at(x, z)} #${B.id}`, h.kind === 'wall' || !own);
        break;
      }
    }
  }
}

// Strollers walk from one of a park's walks and seats to another, outdoor
// workers and visitors to anywhere in their area: every such walk, from the
// gate and from one spot to another, the way the villagers take it (round
// what stands on the plot, where the game knows the way: plotNav).
function sweepGrounds(game, S, F) {
  const w = game.world, ag = game.agents;
  for (const B of w.buildings.values()) {
    if (!isOpen(B)) continue;
    const def = BUILDINGS[B.type];
    const strolls = B.spots && B.spots.length > 1;
    if (!strolls && !(def.outdoorWork || def.outdoor || B.open)) continue;
    let goals;
    if (strolls) goals = B.spots;
    else {
      const area = B.work || workArea(B) || [B.x + 0.15, B.z + 0.15, B.x + fw(B) - 0.15, B.z + fd(B) - 0.15];
      goals = [];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) goals.push([area[0] + ((area[2] - area[0]) * i) / 4, area[1] + ((area[3] - area[1]) * j) / 4]);
    }
    const g = ag._gridOf(B), gate = doorPoint(B);
    // a stroller sets off again from where they stopped: the spot, or the
    // open ground nearest it if the model has something standing on it
    const stop = (p) => (g && (plotPath(g, gate.x, gate.z, p[0], p[1]) || []).at(-1)) || p;
    const froms = [[gate.x, gate.z], ...(strolls ? B.spots.map(stop) : [])];
    let walks = 0, bad = 0, walls = 0, ex = null;
    for (const from of froms) for (const to of goals) {
      if (from === to) continue;
      // (with no way there, a villager goes somewhere else instead)
      const p = g ? plotPath(g, from[0], from[1], to[0], to[1]) : [to];
      if (!p) continue;
      walks++;
      const way = [from, ...p];
      let hit = null;
      for (let i = 0; i < way.length - 1 && !hit; i++) {
        const [ax, az] = way[i], [bx, bz] = way[i + 1], L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(L / 0.03));
        for (let s2 = 0; s2 <= k && !hit; s2++) {
          const x = ax + ((bx - ax) * s2) / k, z = az + ((bz - az) * s2) / k;
          // (the gate itself is on the plot's edge, by the pavement)
          if (i === 0 && from === froms[0] && Math.hypot(x - gate.x, z - gate.z) < 0.06) continue;
          hit = S.hit(x, z, B.baseY + 0.012);
          if (hit) hit = { ...hit, x, z };
        }
      }
      if (!hit) continue;
      bad++;
      const where = at(hit.x, hit.z) + ` (${hit.p.b === B ? 'its own' : name(hit.p.b)})`;
      if (hit.kind === 'wall' && !walls++) ex = where;
      else ex ||= where;
    }
    if (bad) F.add(`${strolls ? 'strollers' : 'workers or visitors'} walk through ${walls ? 'something solid' : 'something low'}`, `${name(B)}: ${bad} of ${walks} walks${g ? '' : ' (no way round known)'}`, `${ex} #${B.id}`, walls > 0);
  }
}

// Every part of every model inside its own plot (or its frontage, or the land
// it took on), but for what reaches out on purpose (a pier over the water).
function sweepPlots(game, S, F) {
  const w = game.world, DIR = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (const B of w.buildings.values()) {
    const e = { x0: 0, x1: 0, z0: 0, z1: 0, ...(B.ext || {}) };
    const [dx, dz] = DIR[B.rot], f = Math.max(B.front || 0, B.ownFront || 0);
    if (dx > 0) e.x1 += f; if (dx < 0) e.x0 += f; if (dz > 0) e.z1 += f; if (dz < 0) e.z0 += f;
    const X0 = B.x - e.x0, Z0 = B.z - e.z0, X1 = B.x + fw(B) + e.x1, Z1 = B.z + fd(B) + e.z1;
    let worst = 0, ex = null;
    for (const p of S.byB.get(B.id) || []) {
      if (p.y1 - p.y0 < 0.01 && p.y1 < B.baseY + 0.03) continue;   // flat on the ground (a path, a shadow)
      for (const [x, z] of p.h) {
        const out = Math.max(X0 - x, x - X1, Z0 - z, z - Z1);
        if (out > worst) { worst = out; ex = [x, z]; }
      }
    }
    if (worst > 0.03) {
      const tx = Math.floor(ex[0]), tz = Math.floor(ex[1]), o = w.inBounds(tx, tz) ? w.buildingOn(tx, tz) : null;
      const onto = o && o !== B ? `into the ${name(o)}` : w.inBounds(tx, tz) && w.roadAt(tx, tz) ? 'onto the road' : w.inBounds(tx, tz) && w.terrain.isWater(tx, tz) ? 'over the water' : 'onto open ground';
      F.add('model reaches out of its plot', `${name(B)} ${onto}`, `${worst.toFixed(2)} at ${at(ex[0], ex[1])} #${B.id}`, onto !== 'over the water' && onto !== 'onto open ground');
    }
  }
}

// Gondola cabins along every route, and the cables, clear of every roof.
function sweepCables(game, S, F) {
  const T = game.transit;
  for (const line of game.world.lines) {
    const r = T.routes.get(line.id);
    if (!r || line.mode !== 'gondola' || !r.ys) continue;
    const stops = new Set(line.stops);
    const hits = new Map();
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], ya = r.ys[i], yb = r.ys[i + 1];
      const L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(L / 0.08));
      for (let s = 0; s <= k; s++) {
        const u = s / k, x = ax + (bx - ax) * u, z = az + (bz - az) * u, y = ya + (yb - ya) * u;
        // the cabin: from its floor (G_HANG below the cable) to its roof; and the cable itself
        for (const p of S.touch(x, z, y - 0.29, y - 0.1, 0.085)) if (!stops.has(p.b.id)) hits.set(p.b.id, { what: 'cabin', p, x, z });
        for (const p of S.touch(x, z, y - 0.01, y + 0.01, 0.01)) if (!stops.has(p.b.id) && !hits.has(p.b.id)) hits.set(p.b.id, { what: 'cable', p, x, z });
      }
    }
    for (const h of hits.values()) F.add(`gondola ${h.what} through a building`, `${line.name} through the ${name(h.p.b)}`, `${at(h.x, h.z)} #${h.p.b.id}`);
  }
}

// Gondola lines across the busiest part of the town (no starter has one):
// stations on open ground by a road, as far apart as a line goes, with as many
// buildings under the cable as can be found; one line of two stations and one
// of three, with a few cabins each.
function gondolas(game) {
  const w = game.world, rng = mulberry(w.N * 7919 + w.buildings.size);
  w.setSandbox({ infiniteMoney: true, unlockAll: true });
  const open = [];
  for (let z = 2; z < w.N - 2; z++) for (let x = 2; x < w.N - 2; x++) {
    if (!w.buildingOn(x, z) && !w.roadAt(x, z) && !w.terrain.isWater(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.roadAt(x + dx, z + dz)) && w.checkBuild('gondola', x, z).ok) open.push([x, z]);
  }
  const under = (a, b) => {
    const seen = new Set(), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let u = 0; u <= L; u += 0.25) {
      const o = w.buildingOn(Math.floor(a[0] + 0.5 + ((b[0] - a[0]) * u) / L), Math.floor(a[1] + 0.5 + ((b[1] - a[1]) * u) / L));
      if (o) seen.add(o.id);
    }
    return seen.size;
  };
  const station = ([x, z]) => {
    const r = w.placeBuilding('gondola', x, z, { instant: true });
    if (r.ok && r.building.access) return r.building;
    if (r.ok) w.removeBuilding(r.building.id, 0);
    return null;
  };
  const made = [];
  for (const n of [2, 3]) {
    let best = null;
    for (let k = 0; k < 600 && open.length > 2; k++) {
      const pts = [open[(rng() * open.length) | 0]];
      for (let j = 1; j < n; j++) pts.push(open[(rng() * open.length) | 0]);
      let ok = true, score = 0;
      for (let j = 1; j < n && ok; j++) { const L = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); if (L < 8 || L > 22) ok = false; else score += under(pts[j - 1], pts[j]); }
      if (ok && (!best || score > best.score)) best = { pts, score };
    }
    if (!best) continue;
    const st = best.pts.map(station);
    if (st.some(s => !s)) { for (const s of st) if (s) w.removeBuilding(s.id, 0); continue; }
    const r = game.transit.createLine('gondola', st.map(s => s.id));
    if (r.ok) { game.transit.setVehicles(r.line.id, 6); made.push(r.line); }
  }
  game.transit.rebuild();
  // each line, how long its spans are and the pylons holding them up
  return made.map(l => {
    const R = game.transit.routes.get(l.id);
    const legs = (R && R.legs || []).map(g => `${g.L.toFixed(1)} tiles, ${g.pylons.length} pylon${g.pylons.length === 1 ? '' : 's'}${g.pylons.length ? ' up to ' + Math.max(...g.pylons.map(p => p.h - p.g)).toFixed(2) : ''}`);
    return `${l.name} (${l.stops.length} stations; ${legs.join(' · ')})`;
  });
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ a town
function play(label, w) {
  const t0 = performance.now();
  const F = new Findings();
  const scene = { add() {}, remove() {} };
  const game = {
    speed: 8, env: { night: 0 }, renderer: { scene, worldToScreen: () => ({ x: 0, y: 0 }) }, view: { smoke: { emit() {} }, items: null },
    _ev: {}, on(e, f) { (this._ev[e] ||= []).push(f); }, emit(e, d) { for (const f of this._ev[e] || []) f(d); },
  };
  game.world = w;
  const S = new Solids(w, game);
  game.view.items = S.items;
  game.paths = new PathFinder(w);
  game.sim = new Sim(game);
  game.transit = new Transit(game);
  game.sim.recompute();
  game.agents = new Agents(game);
  game.animals = new Animals(game);
  game.construction = new Construction(game);
  game.transit.rebuild();
  game.transit.planCarts();
  game.on('day', () => game.transit.planCarts());
  w.on('roads', () => game.paths.invalidate?.());
  const built = performance.now() - t0;
  const cable = gondolas(game);
  if (cable.length) console.log(`     (gondolas added: ${cable.join(', ')})`);

  // --probe=id,x,z: the parts of building id over a point, and its door
  const probe = process.argv.find(a => a.startsWith('--probe='));
  if (probe) {
    const [id, x, z] = probe.slice(8).split(',').map(Number), B = w.buildings.get(id);
    if (B) {
      console.log(`  probe ${name(B)} #${id} at ${at(x, z)}: plot ${B.x},${B.z} ${fw(B)}×${fd(B)} rot ${B.rot} base ${B.baseY.toFixed(3)} door`, B.door && { x: +B.door.x.toFixed(3), z: +B.door.z.toFixed(3), dx: +B.door.dx.toFixed(2), dz: +B.door.dz.toFixed(2) });
      for (const p of S.byB.get(id) || []) if (outside(p.h, x, z) < 0.03) console.log(`    part y ${(p.y0 - B.baseY).toFixed(3)}–${(p.y1 - B.baseY).toFixed(3)} x ${p.x0.toFixed(3)}–${p.x1.toFixed(3)} z ${p.z0.toFixed(3)}–${p.z1.toFixed(3)} area ${p.a.toFixed(4)} out ${outside(p.h, x, z).toFixed(3)}`);
    }
  }

  // what every building stands in, and every way about it
  const lanes = [0.07, 0.135, 0.2];
  sweepPlots(game, S, F);
  sweepDoors(game, S, F, lanes);
  sweepGrounds(game, S, F);
  sweepCables(game, S, F);

  // then a few days of everyone going about their business
  const seen = new Set();   // one finding per walker and building
  const once = (wk, b) => { const k = (wk.r ? wk.r.id : 'g' + wk.lk.lane) + ':' + b.id; if (seen.has(k)) return false; seen.add(k); return true; };
  const start = w.day;
  let steps = 0, samples = 0;
  while (w.day < start + DAYS && steps < 400000) {
    const g = game.sim.update(0.1);
    game.agents.update(0.1, g);
    game.construction.update(0.1, g);
    game.transit.update(0.1);
    game.animals.update(0.1, game.speed);
    steps++;
    for (const wk of game.agents.walkers) {
      if (wk.delay > 0) continue;
      samples++;
      const y = wk.mode === 'wander' ? wk.baseY : wk.mode === 'path' ? wk.y : w.walkHeight(wk.x, wk.z);
      let skip = null, where = wk.mode;
      if (wk.mode === 'path') {
        const n = wk.pts.length;
        // the step through the wall to the inside, in or out
        if (wk.doorIn && wk.seg >= n - 2) continue;
        if (wk.doorOut && wk.seg === 0) continue;
        where = wk.doorIn && wk.seg >= n - wk.doorIn - 2 ? 'going in a door' : wk.doorOut && wk.seg < wk.doorOut ? 'coming out of a door' : 'on the street';
        const tx = Math.floor(wk.x), tz = Math.floor(wk.z);
        if (w.inBounds(tx, tz) && w.terrain.isWater(tx, tz) && !w.roadAt(tx, tz) && !w.buildingOn(tx, tz) && once(wk, { id: 'water' + w.idx(tx, tz) })) F.add('villager walks on the water', where, at(wk.x, wk.z));
      } else if (wk.mode === 'wander') {
        const B = wk.r && w.buildings.get(wk.r.at);
        where = B ? `${wk.working ? 'working' : 'strolling'} at the ${name(B)}` : 'wandering';
        // builders walk round the scaffolding of a site with no walls yet
        if (wk.ring) continue;
      } else if (wk.mode === 'wait') where = 'waiting at a stop';
      const h = S.hit(wk.x, wk.z, y, 0.015, skip);
      if (!h || !once(wk, h.p.b)) continue;
      const serious = h.kind === 'wall' && (wk.mode !== 'wander' || where.startsWith('working'));
      F.add(`villager inside ${THING[h.kind]}`, `${where}, in the ${name(h.p.b)}`, `${at(wk.x, wk.z)} #${h.p.b.id}`, serious);
    }
    // coaches, trains and carts on the ground; gondola cabins in the air
    if (steps % 3 === 0) {
      for (const v of game.transit.vehicles) {
        const cable = v.line.mode === 'gondola';
        for (const m of v.meshes) {
          const p = m.position;
          if (cable) {
            for (const q of S.touch(p.x, p.z, p.y - 0.29, p.y - 0.1, 0.085)) if (!v.line.stops.includes(q.b.id)) F.add('gondola cabin inside a building', `${v.line.name}, the ${name(q.b)}`, `${at(p.x, p.z)} y ${p.y.toFixed(2)} #${q.b.id}`);
          } else {
            const h = S.hit(p.x, p.z, p.y, 0.03);
            if (h && h.kind === 'wall') F.add(`${v.line.mode === 'rail' ? 'train' : 'coach'} through a building`, `${v.line.name}, the ${name(h.p.b)}`, `${at(p.x, p.z)} #${h.p.b.id}`);
          }
        }
      }
      for (const c of game.transit.carts) {
        const p = c.mesh.position, h = S.hit(p.x, p.z, p.y, 0.03);
        if (h && h.kind === 'wall') F.add('cart through a building', `the ${name(h.p.b)}`, `${at(p.x, p.z)} #${h.p.b.id}`);
      }
    }
  }
  // what changed while they played (sites finished, upgrades): sweep again
  sweepPlots(game, S, F);
  sweepCables(game, S, F);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  const parts = [...S.byB.values()].reduce((n, l) => n + l.length, 0);
  console.log(`${F.serious ? 'FAIL' : 'ok  '} ${label}: ${w.buildings.size} buildings (${parts} solid parts, models in ${(built / 1000).toFixed(1)} s) · ${w.population} villagers · ${game.world.lines.length} lines · ${DAYS} days, ${samples} villager positions checked · ${secs} s`);
  F.print('     ');
  return F.serious;
}

let failed = 0;
const towns = which.includes('all') ? STARTERS.filter(d => !d.heavy).map(d => d.id) : which;
for (const id of towns) {
  if (id === 'scale') {
    const w = World.createNew({ N: 64, seed: 77, name: 'Botton' });
    growDemoTown(w, 77, 2);
    failed += play('demo-grown town', w) ? 1 : 0;
    continue;
  }
  const def = STARTERS.find(d => d.id === id);
  if (!def) { console.log(`no starter called ${id}`); failed++; continue; }
  failed += play(def.name, loadStarter(def.id, { name: 'Testham' })) ? 1 : 0;
}
console.log(failed ? `\n${failed} town(s) with collisions` : '\nno collisions found');
process.exit(failed ? 1 : 0);
