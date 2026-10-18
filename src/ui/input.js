// Mouse / keyboard / touch: camera control and all the building tools.

import * as THREE from 'three';
import { BUILDINGS, TRANSIT } from '../defs.js';
import { fw, fd, capOf } from '../world/world.js';
import { ROAD_LEVELS } from '../config.js';
import { buildModel } from '../render/buildings.js';
import { MAT } from '../render/materials.js';
import { fmt, esc } from './ui.js';
import { householdsIn } from '../sim/people.js';
import { roadRun, roadsInBox, roadsAt, planRoadEdit } from '../world/roadEdit.js';
import { selTiles } from './roadSelect.js';

const OK = '#7fdc6a', BAD = '#ff6b5a', SOFT = '#ffffff', GOLD = '#ffd84a', WARN = '#ffa64a';

export class Input {
  constructor(game) {
    this.game = game;
    this.tool = { kind: 'select' };
    this.canvas = game.renderer.canvas;
    this.hover = null;
    this.drag = null;
    this.keys = new Set();
    this.accessIndex = 0;
    this.variant = (Math.random() * 1e9) | 0;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.pointers = new Map();
    this.ghost = null;
    this.ghostKey = '';
    this.mouse = { x: 0, y: 0 };
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.refresh(); } });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get world() { return this.game.world; }
  get ui() { return this.game.ui; }

  setTool(t) {
    const sel = this.ui.selection;
    this.tool = t;
    this.drag = null;
    this.accessIndex = 0;
    this.variant = (Math.random() * 1e9) | 0;
    // the road selection tool keeps its own panel in the inspector
    if (t.kind === 'roadsel') this.ui.inspect({ kind: 'roadsel' });
    else if (t.kind !== 'select' || (sel && sel.kind === 'roadsel')) this.ui.inspect(null);
    this.ui.syncToolbar();
    this.game.updateRouteOverlay();
    this.refresh();
  }

  // -------------------------------------------------------------- picking
  _ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.game.renderer.camera);
  }

  pickTile(e) {
    if (!this.game.view) return null;
    this._ndc(e);
    const hit = this.ray.intersectObject(this.game.view.terrain.surface, false)[0];
    if (!hit) return null;
    const x = Math.floor(hit.point.x), z = Math.floor(hit.point.z);
    if (!this.world.inBounds(x, z)) return null;
    return { x, z, px: hit.point.x, pz: hit.point.z };
  }

  pickBuilding(e) {
    this._ndc(e);
    return this.game.view.pickBuilding(this.ray);
  }

  // -------------------------------------------------------------- pointer
  onDown(e) {
    if (!this.game.world || this.game.demo) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    const t = this.tool;
    this.mouse = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || e.button === 2) { this.drag = { type: 'pan', x: e.clientX, y: e.clientY, moved: 0, button: e.button }; return; }
    if (e.button !== 0) return;
    const tile = this.pickTile(e);
    switch (t.kind) {
      case 'select': this.drag = { type: 'maybePan', x: e.clientX, y: e.clientY, moved: 0 }; break;
      case 'road': case 'rail': if (tile) this.drag = { type: 'line', start: tile, end: tile }; break;
      case 'bulldoze': if (tile) this.drag = { type: 'rect', start: tile, end: tile }; break;
      case 'roadsel': if (tile) this.drag = { type: 'pick', start: tile, end: tile, add: e.shiftKey }; break;
      case 'build': if (tile) { this._place(tile); this.drag = { type: 'paint', last: `${tile.x},${tile.z}` }; } break;
      case 'move': if (tile) this._moveTo(tile); break;
      case 'terrain': case 'trees': if (tile) { this._applyTile(tile); this.drag = { type: 'paint', last: `${tile.x},${tile.z}` }; } break;
      case 'line': this._lineClick(e); break;
    }
    this.refresh();
  }

  onMove(e) {
    if (!this.game.world || this.game.demo) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = this.drag;
    if (d && d.type === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.game.renderer.pan(mx - d.mx, my - d.my);
      if (d.d > 10) this.game.renderer.zoomBy(dist / d.d, mx, my);
      Object.assign(d, { d: dist, mx, my });
      return;
    }
    const dx = e.clientX - this.mouse.x, dy = e.clientY - this.mouse.y;
    this.mouse = { x: e.clientX, y: e.clientY };
    if (d && (d.type === 'pan' || d.type === 'maybePan')) {
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.type === 'pan' || d.moved > 6) {
        if (d.type === 'maybePan') d.type = 'pan';
        this.game.renderer.pan(dx, dy);
        this.game.setFollow(null);
        this.canvas.style.cursor = 'grabbing';
      }
      return;
    }
    if (e.target !== this.canvas && !d) { if (this.hover) { this.hover = null; this.refresh(); } return; }
    const tile = this.pickTile(e);
    const key = tile ? `${tile.x},${tile.z}` : '';
    const prevKey = this.hover ? `${this.hover.x},${this.hover.z}` : '';
    this.hover = tile;
    if (this.tool.kind === 'roadsel' && this.tool.action) { this.tool.action = null; this.refresh(e); }
    if (d && (d.type === 'line' || d.type === 'rect' || d.type === 'pick') && tile) d.end = tile;
    if (d && d.type === 'paint' && tile && key !== d.last) {
      d.last = key;
      if (this.tool.kind === 'build') { if (BUILDINGS[this.tool.type].size === 1) this._place(tile, true); }
      else this._applyTile(tile);
    }
    if (key !== prevKey || this.tool.kind === 'select') this.refresh(e);
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!d || !this.game.world) return;
    if (d.type === 'pinch') { if (this.pointers.size < 2) this.drag = null; return; }
    this.canvas.style.cursor = '';
    if (d.type === 'pan' && d.button === 2 && d.moved < 6) {
      // right-click: step back out of the current tool / selection
      if (this.tool.kind === 'line' && this.tool.stops.length) { this.tool.stops.pop(); this.ui.updateHint(); this.game.updateRouteOverlay(); }
      else if (this.tool.kind === 'roadsel' && this.tool.sel.size) this.pickRoads([], false);
      else if (this.tool.kind !== 'select') { this.ui.closeFlyout(); this.setTool({ kind: 'select' }); }
      else this.ui.inspect(null);
    } else if (d.type === 'maybePan') {
      this._selectClick(e);
    } else if (d.type === 'line') {
      const tiles = this._lineTiles(d.start, d.end);
      const c = this.tool.kind === 'rail' ? { t: 'rails', tiles } : { t: 'roads', tiles, level: this.tool.level };
      this.game.cmd(c, (r) => {
        if (r.placed) this.game.sfx('build');
        if (r.failed && !r.placed) this.ui.toast(r.failed, 'bad');
        else if (r.failed && r.failed === 'Not enough money') this.ui.toast('Ran out of money part-way', 'bad', '$');
      });
    } else if (d.type === 'rect') {
      const tiles = this._rectTiles(d.start, d.end);
      this.game.cmd({ t: 'bulldoze', tiles }, (r) => {
        if (r.n) this.game.sfx('demolish');
        else if (r.reason && tiles.length === 1) this.ui.toast(r.reason, 'bad');
      });
    } else if (d.type === 'pick') {
      this.pickRoads(this._pickTiles(d), d.add || e.shiftKey, this._oneTile(d));
    }
    this.drag = null;
    this.refresh();
  }

  onWheel(e) {
    e.preventDefault();
    if (!this.game.world) return;
    const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    this.game.renderer.zoomBy(f, e.clientX, e.clientY);
  }

  _selectClick(e) {
    const g = this.game;
    const r = g.agents.pick(e.clientX, e.clientY);
    if (r) { this.ui.inspect({ kind: 'resident', id: r.id }); g.sfx('click'); return; }
    const b = this.pickBuilding(e);
    if (b) { this.ui.inspect({ kind: 'building', id: b.id }); g.sfx('click'); return; }
    const t = this.pickTile(e);
    if (t && (this.world.roadAt(t.x, t.z) || this.world.railAt(t.x, t.z))) { this.ui.inspect({ kind: 'road', x: t.x, z: t.z }); return; }
    if (t) { const bb = this.world.buildingOn(t.x, t.z); if (bb) { this.ui.inspect({ kind: 'building', id: bb.id }); return; } }
    this.ui.inspect(null);
  }

  _place(tile, painting = false) {
    const t = this.tool;
    const def = BUILDINGS[t.type];
    const o = this._origin(tile, def.size);
    this.game.cmd({ t: 'place', type: t.type, x: o.x, z: o.z, variant: this.variant, accessIndex: this.accessIndex }, (r) => {
      if (r.ok) {
        this.game.sfx('build');
        this.variant = (Math.random() * 1e9) | 0;
        this.ghostKey = '';
        if (def.unique && this.tool === t) { this.ui.closeFlyout(); this.setTool({ kind: 'select' }); }
      } else if (!painting) this.ui.toast(r.reason || "Can't build there", 'bad');
    });
  }

  _moveTo(tile) {
    const w = this.world, b = w.buildings.get(this.tool.id);
    if (!b) { this.setTool({ kind: 'select' }); return; }
    const o = this._origin(tile, fw(b), fd(b));
    const name = BUILDINGS[b.type].levels[b.level].name;
    this.game.cmd({ t: 'move', id: b.id, x: o.x, z: o.z, accessIndex: this.accessIndex }, (r) => {
      if (!r.ok) { this.ui.toast(r.reason || "Can't move it there", 'bad'); return; }
      this.game.sfx('build');
      this.ui.toast(r.instant ? `Moved the ${name}` : `Builders will take down the ${name}, cart it over and rebuild it here`, 'good', '🏗️');
      if (this.tool.kind === 'move') this.setTool({ kind: 'select' });
      if (r.building) this.ui.inspect({ kind: 'building', id: r.building.id });
    });
  }

  _applyTile(tile) {
    const t = this.tool, quiet = !!this.drag;
    const c = t.kind === 'trees' ? { t: 'plant', x: tile.x, z: tile.z } : { t: 'terraform', x: tile.x, z: tile.z, mode: t.mode };
    this.game.cmd(c, (r) => {
      if (r.ok) this.game.sfx(c.t === 'plant' ? 'plant' : 'dig');
      else if (r.reason && !quiet) this.ui.toast(r.reason, 'bad');
    });
  }

  _lineClick(e) {
    const t = this.tool;
    const b = this.pickBuilding(e) || (() => { const tl = this.pickTile(e); return tl ? this.world.buildingOn(tl.x, tl.z) : null; })();
    const want = TRANSIT[t.mode].stopType;
    if (!b || b.type !== want) { this.ui.toast(`Click a ${t.mode === 'rail' ? 'railway station' : 'coach stop'}`, 'bad'); return; }
    if (t.stops[t.stops.length - 1] === b.id) return;
    if (t.stops.length >= 2 && t.stops[0] === b.id) { this.finishLine(); return; }
    t.stops.push(b.id);
    this.game.sfx('click');
    this.ui.updateHint();
    this.game.updateRouteOverlay();
  }

  finishLine() {
    const t = this.tool;
    if (t.kind !== 'line') return;
    this.game.cmd({ t: 'line', mode: t.mode, stops: t.stops.slice() }, (r) => {
      if (!r.ok) { this.ui.toast(r.reason || "Couldn't start that line", 'bad'); return; }
      this.ui.toast(`${r.line.name} is running!`, 'good', t.mode === 'rail' ? '🚂' : '🐴');
      this.game.sfx('upgrade');
      if (this.tool === t) this.setTool({ kind: 'line', mode: t.mode, stops: [] });
    });
  }

  _origin(tile, w, d = w) {
    if (w === 1 && d === 1) return { x: tile.x, z: tile.z };
    // centre bigger footprints on the cursor
    return { x: Math.round(tile.px - w / 2), z: Math.round(tile.pz - d / 2) };
  }

  _lineTiles(a, b) {
    const out = [];
    const dx = b.x - a.x, dz = b.z - a.z;
    const sx = Math.sign(dx), sz = Math.sign(dz);
    if (Math.abs(dx) >= Math.abs(dz)) {
      for (let i = 0; i <= Math.abs(dx); i++) out.push([a.x + sx * i, a.z]);
      for (let j = 1; j <= Math.abs(dz); j++) out.push([b.x, a.z + sz * j]);
    } else {
      for (let j = 0; j <= Math.abs(dz); j++) out.push([a.x, a.z + sz * j]);
      for (let i = 1; i <= Math.abs(dx); i++) out.push([a.x + sx * i, b.z]);
    }
    return out;
  }

  _rectTiles(a, b) {
    const out = [];
    for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push([x, z]);
    return out;
  }

  // ------------------------------------------------------ road selection
  _oneTile(d) { return d.start.x === d.end.x && d.start.z === d.end.z; }

  // What a click (the stretch between junctions) or a drag (every road in
  // the box or along the line) picks.
  _pickTiles(d) {
    const w = this.world;
    if (this._oneTile(d)) return roadRun(w, d.start.x, d.start.z);
    return this.tool.box ? roadsInBox(w, d.start, d.end) : roadsAt(w, this._lineTiles(d.start, d.end));
  }

  // Change the road selection: a fresh pick replaces it, Shift adds to it
  // (and Shift-clicking a stretch that is already picked takes it back out).
  // Backspace steps back through these changes.
  pickRoads(tiles, add, toggle = false) {
    const t = this.tool, N = this.world.N;
    if (t.kind !== 'roadsel') return;
    const keys = tiles.map(([x, z]) => z * N + x);
    t.hist.push([...t.sel]);
    if (t.hist.length > 60) t.hist.shift();
    if (!add) t.sel = new Set(keys);
    else if (toggle && keys.length && keys.every(k => t.sel.has(k))) for (const k of keys) t.sel.delete(k);
    else for (const k of keys) t.sel.add(k);
    t.confirm = null;
    if (keys.length) this.game.sfx('click');
    this.ui.inspect({ kind: 'roadsel' });
  }

  undoPick() {
    const t = this.tool;
    if (t.kind !== 'roadsel' || !t.hist.length) return;
    t.sel = new Set(t.hist.pop());
    t.confirm = null;
    this.ui.inspect({ kind: 'roadsel' });
  }

  // --------------------------------------------------------------- preview
  refresh(e = null) {
    const g = this.game, w = this.world;
    if (!w || !g.view) return;
    const ov = g.view.overlay;
    const t = this.tool, h = this.hover, d = this.drag;
    const tiles = [];
    let tip = null;
    let ghost = null;
    if (t.kind === 'select') {
      const sel = this.ui.selection;
      if (sel && sel.kind === 'building') {
        const b = w.buildings.get(sel.id);
        if (b) for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) tiles.push({ x: b.x + dx, z: b.z + dz, color: GOLD, alpha: 0.25 });
        for (const t of this.previewTiles || []) tiles.push(t);
      } else if (sel && sel.kind === 'road') tiles.push({ x: sel.x, z: sel.z, color: GOLD, alpha: 0.3 });
      if (h && e && !d) {
        const r = g.agents.pick(e.clientX, e.clientY);
        const an = r ? null : g.animals.pick(e.clientX, e.clientY);
        const b = r || an ? null : (this.pickBuilding(e) || w.buildingOn(h.x, h.z));
        if (r) tip = `<b>${esc(r.first)} ${esc(r.last)}</b><br>${esc(g.agents.activity(r))}`;
        else if (an) tip = g.animals.describe(an);
        else if (b) {
          const def = BUILDINGS[b.type], L = def.levels[b.level];
          tip = `<b>${L.name}</b>`;
          if (b.con) tip += `<br>🏗️ ${b.con.kind === 'dismantle' || b.con.kind === 'demolish' ? 'coming down' : 'being built'} · ${Math.round(Math.min(1, b.con.done / b.con.work) * 100)}%`;
          else if (L.housing) { const hh = householdsIn(this.world, b); tip += `<br>${b.residents.length}/${capOf(b, 'housing')} residents · ${hh} household${hh === 1 ? '' : 's'} · ${b.happiness}% happy`; }
          else if (L.jobs) tip += `<br>${b.workers.length}/${capOf(b, 'jobs')} workers`;
          const v = !b.con && g.agents.visitorsAt(b);
          if (v && Number.isFinite(v.cap)) tip += `<br>${v.now}/${v.cap} visitors${v.now >= v.cap ? ' · <span class="bad">full</span>' : ''}`;
          if (!b.connected && (!def.park || b.access)) tip += `<br><span class="bad">Not connected</span>`;
          for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) tiles.push({ x: b.x + dx, z: b.z + dz, color: SOFT, alpha: 0.14, border: false });
        } else tiles.push({ x: h.x, z: h.z, color: SOFT, alpha: 0.12 });
      }
    } else if ((t.kind === 'road' || t.kind === 'rail') && (d || h)) {
      const list = d ? this._lineTiles(d.start, d.end) : [[h.x, h.z]];
      let cost = 0, bad = null;
      for (const [x, z] of list) {
        const c = t.kind === 'rail' ? w.checkRail(x, z) : w.checkRoad(x, z, t.level);
        tiles.push({ x, z, color: c.ok ? OK : BAD, alpha: c.noop ? 0.15 : 0.4 });
        if (c.ok) cost += c.cost; else bad ||= c.reason;
      }
      tip = `${t.kind === 'rail' ? 'Railway track' : ROAD_LEVELS[t.level].name} · $${fmt(cost)}` + (bad ? `<br><span class="bad">${bad}</span>` : '') + (cost > w.money ? '<br><span class="bad">Not enough coins</span>' : '');
    } else if (t.kind === 'roadsel') {
      // picked tiles in gold; while an action is hovered in the panel, the
      // tiles it changes in green, those it leaves alone in red, and the
      // buildings it would cut off
      const plan = t.action && t.action !== 'clear' ? planRoadEdit(w, selTiles(w, t), t.action, { paths: g.paths }) : null;
      if (plan) {
        for (const p of plan.tiles) tiles.push({ x: p.x, z: p.z, color: p.reason ? BAD : p.line ? WARN : OK, alpha: p.reason ? 0.3 : 0.45 });
        const mark = (ids, color) => {
          for (const id of ids || []) {
            const b = w.buildings.get(id);
            if (b) for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) tiles.push({ x: b.x + dx, z: b.z + dz, color, alpha: 0.3 });
          }
        };
        mark(plan.lost, BAD);
        mark(plan.cut, WARN);
      } else for (const [x, z] of selTiles(w, t)) tiles.push({ x, z, color: GOLD, alpha: 0.4 });
      if (d && d.type === 'pick') {
        const list = this._pickTiles(d);
        if (!this._oneTile(d)) for (const [x, z] of t.box ? this._rectTiles(d.start, d.end) : this._lineTiles(d.start, d.end)) tiles.push({ x, z, color: SOFT, alpha: 0.07, border: false });
        for (const [x, z] of list) tiles.push({ x, z, color: SOFT, alpha: 0.3 });
        tip = `${list.length} road tile${list.length === 1 ? '' : 's'}${d.add ? ' · adding to the selection' : ''}`;
      } else if (h && !plan) {
        const run = roadRun(w, h.x, h.z);
        if (run.length) {
          for (const [x, z] of run) tiles.push({ x, z, color: SOFT, alpha: 0.16, border: false });
          tip = `Stretch of ${run.length} road tile${run.length === 1 ? '' : 's'} · click to pick${t.sel.size ? ' · Shift-click to add' : ''}`;
        }
      }
    } else if (t.kind === 'bulldoze' && (d || h)) {
      const list = d ? this._rectTiles(d.start, d.end) : [[h.x, h.z]];
      for (const [x, z] of list) {
        const b = w.buildingOn(x, z);
        if (b) { for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) tiles.push({ x: b.x + dx, z: b.z + dz, color: BAD, alpha: 0.4 }); }
        else tiles.push({ x, z, color: BAD, alpha: (w.roadAt(x, z) || w.railAt(x, z) || w.treeCount[w.idx(x, z)]) ? 0.4 : 0.15 });
      }
      if (!d && h) { const b = w.buildingOn(h.x, h.z); if (b) tip = `Demolish ${BUILDINGS[b.type].levels[b.level].name}` + (b.con && b.con.kind === 'build' ? '' : '<br>A crew will pull it down; residents move out'); }
    } else if (t.kind === 'build' && h) {
      const def = BUILDINGS[t.type];
      const o = this._origin(h, def.size);
      const c = w.checkBuild(t.type, o.x, o.z);
      for (let dz = 0; dz < def.size; dz++) for (let dx = 0; dx < def.size; dx++) tiles.push({ x: o.x + dx, z: o.z + dz, color: c.ok ? OK : BAD, alpha: 0.35 });
      const L = def.levels[0];
      const radius = L.radius;
      if (radius) {
        const cx = o.x + def.size / 2, cz = o.z + def.size / 2;
        for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
          if (x >= o.x && x < o.x + def.size && z >= o.z && z < o.z + def.size) continue;
          if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= radius) tiles.push({ x, z, color: def.service ? '#8fd0ff' : '#b8f08f', alpha: 0.13, border: false });
        }
      }
      tip = `<b>${def.levels[0].name}</b> <span class="muted">${def.name}</span> · $${fmt(c.cost)}` + (c.ok ? (c.access.length > 1 ? '<br>Tab: flip entrance' : '') : `<br><span class="bad">${c.reason}</span>`);
      if (c.trees) tip += `<br>Clears ${c.trees} tree${c.trees > 1 ? 's' : ''}`;
      ghost = { type: t.type, x: o.x, z: o.z, ok: c.ok, chk: c };
    } else if (t.kind === 'move' && h) {
      const b = w.buildings.get(t.id);
      if (b) {
        const W = fw(b), D = fd(b);
        const o = this._origin(h, W, D);
        const c = w.moveCheck(b, o.x, o.z);
        for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) tiles.push({ x: b.x + dx, z: b.z + dz, color: GOLD, alpha: 0.25 });
        for (let dz = 0; dz < D; dz++) for (let dx = 0; dx < W; dx++) tiles.push({ x: o.x + dx, z: o.z + dz, color: c.ok ? OK : BAD, alpha: 0.35 });
        const name = BUILDINGS[b.type].levels[b.level].name;
        tip = `<b>Move the ${name}</b> · $${fmt(c.cost || w.moveCost(b))}<br>Taken down, carted over and rebuilt` + (c.ok ? '' : `<br><span class="bad">${c.reason}</span>`);
        ghost = { type: b.type, level: b.level, variant: b.variant, flavor: b.flavor, w: W, d: D, x: o.x, z: o.z, ok: c.ok, chk: c };
      }
    } else if ((t.kind === 'terrain' || t.kind === 'trees') && h) {
      const c = t.kind === 'trees' ? w.checkPlant(h.x, h.z) : w.checkTerraform(h.x, h.z);
      tiles.push({ x: h.x, z: h.z, color: c.ok ? OK : BAD, alpha: 0.35 });
      tip = c.ok ? null : `<span class="bad">${c.reason}</span>`;
    } else if (t.kind === 'line') {
      const want = TRANSIT[t.mode].stopType;
      for (const b of w.buildings.values()) {
        if (b.type !== want) continue;
        const chosen = t.stops.indexOf(b.id);
        tiles.push({ x: b.x, z: b.z, color: chosen >= 0 ? OK : GOLD, alpha: chosen >= 0 ? 0.5 : 0.3 });
      }
    }
    ov.setCursor(tiles);
    this._setGhost(ghost);
    if (e) this.ui.tooltip(tip, e.clientX, e.clientY);
    else if (!tip) this.ui.tooltip(null);
  }

  _setGhost(gh) {
    const scene = this.game.renderer.scene;
    if (!gh) {
      if (this.ghost) { scene.remove(this.ghost); this.ghost.geometry.dispose(); this.ghost = null; this.ghostKey = ''; }
      return;
    }
    const w = this.world;
    const def = BUILDINGS[gh.type];
    const c = gh.chk;
    const acc = c.access && c.access.length ? c.access[this.accessIndex % c.access.length] : null;
    const rot = acc ? acc.rot : this.variant % 4;
    const minH = isFinite(c.minH) ? c.minH : w.terrain.tileMin(gh.x, gh.z);
    const maxH = isFinite(c.maxH) ? c.maxH : w.terrain.tileMax(gh.x, gh.z);
    const W = gh.w ?? def.size, D = gh.d ?? def.size, variant = gh.variant ?? this.variant;
    const key = `${gh.type}|${gh.level || 0}|${gh.x}|${gh.z}|${W}|${D}|${rot}|${gh.ok}|${variant}`;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    if (this.ghost) { scene.remove(this.ghost); this.ghost.geometry.dispose(); }
    const b = { type: gh.type, level: gh.level || 0, variant, flavor: gh.flavor || null, size: Math.max(W, D), w: W, d: D, baseY: maxH, minY: minH, rot, rail: c.rail || null };
    b.x = gh.x; b.z = gh.z;
    const model = buildModel(b, { ground: (x, z) => w.terrain.heightAt(x, z), season: this.game.view.season });
    if (model.spin) model.spin.geo.dispose();
    this.ghost = new THREE.Mesh(model.geo, gh.ok ? MAT.ghostOk : MAT.ghostBad);
    this.ghost.position.set(gh.x + W / 2 + model.jitter.ox, maxH + 0.002, gh.z + D / 2 + model.jitter.oz);
    this.ghost.rotation.y = (rot * Math.PI) / 2 + model.jitter.yaw;
    this.ghost.renderOrder = 9;
    scene.add(this.ghost);
  }

  // -------------------------------------------------------------- keyboard
  onKey(e, down) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k); else { this.keys.delete(k); return; }
    const g = this.game, ui = this.ui;
    if (!g.world || g.demo) return;
    if (ui.modalOpen) return;
    // Esc closes the front window first
    if (k === 'escape' && ui.anyWindow && ui.closeModal()) return;
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); if (e.shiftKey) g.downloadSave(); else g.quickSave(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (k) {
      case 'escape':
        if (this.tool.kind === 'roadsel' && this.tool.sel.size) this.pickRoads([], false);
        else if (this.tool.kind !== 'select') { ui.closeFlyout(); this.setTool({ kind: 'select' }); }
        else ui.inspect(null);
        break;
      case ' ': e.preventDefault(); g.setSpeed(g.speed ? 0 : (g.prevSpeed || 1)); break;
      case ',': g.setSpeed(1); break;
      case '.': g.setSpeed(4); break;
      case '/': g.setSpeed(32); break;
      case '[': g.stepSpeed(-1); break;
      case ']': g.stepSpeed(1); break;
      case 't': g.toggleTopDown(); break;
      case 'q': g.rotateView(-1); break;
      case 'e': g.rotateView(1); break;
      case '+': case '=': g.renderer.zoomBy(1.3); break;
      case '-': case '_': g.renderer.zoomBy(1 / 1.3); break;
      case '1': ui.pressTool('select'); break;
      case 'r': ui.pressTool('roads'); break;
      case '2': ui.pressTool('residential'); break;
      case '3': ui.pressTool('commercial'); break;
      case '4': ui.pressTool('industry'); break;
      case '5': ui.pressTool('services'); break;
      case '6': ui.pressTool('parks'); break;
      case '7': ui.pressTool('transit'); break;
      case '8': ui.pressTool('terrain'); break;
      case 'x': case 'delete': ui.pressTool('bulldoze'); break;
      case 'tab':
        e.preventDefault();
        if (this.tool.kind === 'roadsel') { this.tool.box = !this.tool.box; ui.updateHint(); ui.renderInspector(true); }
        else { this.accessIndex++; this.ghostKey = ''; }
        this.refresh();
        break;
      case 'enter': this.finishLine(); break;
      case 'backspace':
        if (this.tool.kind === 'line') { this.tool.stops.pop(); ui.updateHint(); g.updateRouteOverlay(); }
        else if (this.tool.kind === 'roadsel') this.undoPick();
        break;
      case 'o': ui.toggleOverlayMenu(); break;
      case 'b': ui.showBudget(); break;
      case 'p': ui.showPeople(); break;
      case 'k': ui.showResearch(); break;
      case 'u': ui.pressTool('utilities'); break;
      case 'n': ui.togglePopups(); break;
      case 'i': ui.toggleIssues(); break;
      case 'l': ui.showLines(); break;
      case 'm': ui.showMultiplayer(); break;
      case 'h': ui.showHelp(); break;
    }
  }

  update(dt) {
    if (!this.game.world || this.game.demo || this.ui.modalOpen) return;
    const k = this.keys;
    let dx = 0, dy = 0;
    if (k.has('a') || k.has('arrowleft')) dx += 1;
    if (k.has('d') || k.has('arrowright')) dx -= 1;
    if (k.has('w') || k.has('arrowup')) dy += 1;
    if (k.has('s') || k.has('arrowdown')) dy -= 1;
    if (dx || dy) {
      const s = 700 * dt;
      this.game.renderer.pan(dx * s, dy * s);
      this.game.setFollow(null);
    }
  }
}
