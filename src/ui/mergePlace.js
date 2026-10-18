// Placing a village into the town you are playing, in the game view itself:
// the incoming village appears as a real diorama beside your town. Drag it
// with the mouse, turn it with R, and merge with Enter (Esc cancels). The
// panel at the top shows the merged map's size and what will be settled,
// worked out by the same merge as the 2D arrangement (see mergeUI.js).

import * as THREE from 'three';
import { WorldView } from '../render/worldView.js';
import { besideOffset } from '../save/merge.js';

const ms = (name) => `<span class="ms">${name}</span>`;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// keys that still move or turn the camera while placing; every other game
// shortcut waits until the village is placed
const VIEW_KEYS = new Set(['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 't', 'q', 'e', '+', '=', '-', '_']);

export class MergePlacement {
  constructor(dialog, gap) {
    this.d = dialog;
    this.game = dialog.game;
    this.gap = gap;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
  }

  get active() { return !!this.root; }

  start() {
    const g = this.game, R = g.renderer, d = this.d, ui = g.ui;
    const A = g.world, B = d.pick.B.world;
    this.NA = A.N; this.NB = B.N;
    this.prevSpeed = g.speed;
    if (g.speed) g.setSpeed(0);
    ui.closeAllWindows();
    ui.closeFlyout();
    ui.inspect(null);
    g.input.setTool({ kind: 'select' });

    // the incoming village, as its own diorama: a pivot centres it so the
    // outer group can turn it in quarter turns and set it down anywhere
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.set(-this.NB / 2, 0, -this.NB / 2);
    this.root.add(this.pivot);
    R.scene.add(this.root);
    this.view = new WorldView(B, { scene: this.pivot, rig: R.rig, pixelsPerUnit: () => R.pixelsPerUnit() });
    this.view.setSeason(g.sky.season, g.sky.seasonW);
    this.view.update(1 / 60, 0, g.env);
    this.lines = new THREE.Group();
    R.scene.add(this.lines);

    // let the camera roam over the whole area the village can be put in
    const lo = -this.NB - this.gap - 4, hi = this.NA + this.NB + this.gap + 4;
    this.saved = { bounds: R.rig.bounds };
    R.setBounds(hi - lo);
    R._clamp = () => {
      for (const v of [R.rig.goal, R.rig.target]) {
        v.x = Math.min(hi, Math.max(lo, v.x));
        v.z = Math.min(hi, Math.max(lo, v.z));
      }
    };
    this._frame();

    // loading any other town (a save, the title screen) ends placing first
    const load = g.load;
    g.load = (...args) => { this.stop({ resume: false }); return load.apply(g, args); };

    this._h = {
      down: (e) => this._down(e), move: (e) => this._move(e), up: (e) => this._up(e), key: (e) => this._key(e),
    };
    window.addEventListener('pointerdown', this._h.down, true);
    window.addEventListener('pointermove', this._h.move, true);
    window.addEventListener('pointerup', this._h.up, true);
    window.addEventListener('keydown', this._h.key, true);
    this._panel();
    this._place();
    d._changed(true);
  }

  // Leave placing. The town stays as it was; the camera goes back to normal.
  stop({ resume = true } = {}) {
    if (!this.root) return;
    const g = this.game, R = g.renderer;
    window.removeEventListener('pointerdown', this._h.down, true);
    window.removeEventListener('pointermove', this._h.move, true);
    window.removeEventListener('pointerup', this._h.up, true);
    window.removeEventListener('keydown', this._h.key, true);
    this.view.dispose();
    R.scene.remove(this.root);
    for (const l of this.lines.children) { l.geometry.dispose(); l.material.dispose(); }
    R.scene.remove(this.lines);
    this.root = this.view = this.pivot = null;
    delete g.load;
    delete R._clamp;
    R.setBounds(this.saved.bounds);
    R._clamp();
    R.canvas.style.cursor = '';
    this.panel.remove();
    if (this.d.win === this.panel) this.d.win = null;
    if (resume && this.prevSpeed && g.world) g.setSpeed(this.prevSpeed);
  }

  // look at both towns at once
  _frame() {
    const R = this.game.renderer, L = this.d._layout();
    const cx = L.wx + L.N / 2, cz = L.wz + L.N / 2;
    R.lookAt(cx, cz);
    R.setZoom(Math.min(1.2, 30 / L.N));
  }

  // set the diorama down where the arrangement says, and redraw the outlines
  _place() {
    const { x, z, rot } = this.d.arr, NB = this.NB;
    this.root.position.set(x + NB / 2, 0.01, z + NB / 2);
    this.root.rotation.y = -rot * Math.PI / 2;
    const L = this.d._layout();
    for (const l of this.lines.children) { l.geometry.dispose(); l.material.dispose(); }
    this.lines.clear();
    const rect = (x0, z0, n, color, dashed) => {
      const y = 0.6, pts = [[x0, z0], [x0 + n, z0], [x0 + n, z0 + n], [x0, z0 + n], [x0, z0]].map(([px, pz]) => new THREE.Vector3(px, y, pz));
      const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.8, depthTest: false, transparent: true, opacity: 0.9 })
        : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      if (dashed) line.computeLineDistances();
      line.renderOrder = 20;
      this.lines.add(line);
    };
    rect(L.wx, L.wz, L.N, L.ok ? '#fffbe8' : '#ff5a4a', true);
    rect(0, 0, this.NA, '#2d6cdf', false);
    rect(x, z, NB, '#ef8a1d', false);
  }

  _changed() { this._place(); this.d._changed(); }

  _ground(e) {
    const R = this.game.renderer, r = R.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, R.camera);
    return this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  _overB(p) {
    const { x, z } = this.d.arr;
    return p && p.x >= x && p.x <= x + this.NB && p.z >= z && p.z <= z + this.NB;
  }

  _down(e) {
    if (e.button !== 0 || e.target !== this.game.renderer.canvas) return;
    const p = this._ground(e);
    if (!this._overB(p)) return;   // anywhere else: the usual camera dragging
    e.stopPropagation();
    e.preventDefault();
    this.drag = { p0: p, x: this.d.arr.x, z: this.d.arr.z };
    this.game.renderer.canvas.style.cursor = 'grabbing';
  }

  _move(e) {
    const cv = this.game.renderer.canvas;
    if (!this.drag) {
      if (e.target === cv && !e.buttons) cv.style.cursor = this._overB(this._ground(e)) ? 'grab' : '';
      return;
    }
    e.stopPropagation();
    const p = this._ground(e);
    if (!p) return;
    const NA = this.NA, NB = this.NB, gap = this.gap;
    const snaps = [-NB, 0, NA - NB, NA, Math.round((NA - NB) / 2)];
    const snap = (v) => { for (const s of snaps) if (Math.abs(v - s) <= 1) return s; return v; };
    const x = snap(Math.max(-NB - gap, Math.min(NA + gap, this.drag.x + Math.round(p.x - this.drag.p0.x))));
    const z = snap(Math.max(-NB - gap, Math.min(NA + gap, this.drag.z + Math.round(p.z - this.drag.p0.z))));
    if (x === this.d.arr.x && z === this.d.arr.z) return;
    this.d.arr.x = x; this.d.arr.z = z;
    this._place();
    this.d._info();
  }

  _up(e) {
    if (!this.drag) return;
    e.stopPropagation();
    this.drag = null;
    this.game.renderer.canvas.style.cursor = 'grab';
    this.d._changed();
  }

  _key(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (VIEW_KEYS.has(k) && !e.ctrlKey && !e.metaKey) return;
    e.stopPropagation();
    e.preventDefault();
    if (k === 'r') this._turn();
    else if (k === 'enter') this._merge();
    else if (k === 'escape') this.stop();
  }

  _turn() { this.d.arr.rot = (this.d.arr.rot + 1) % 4; this._changed(); }

  _merge() {
    if (!this.d._layout().ok) return;
    this.stop({ resume: false });
    this.d._merge();
  }

  _panel() {
    const d = this.d, A = this.game.world, B = d.pick.B.world;
    const p = this.panel = document.createElement('div');
    p.className = 'panel merge-place';
    p.innerHTML = `<div class="mp-head">${ms('add_location_alt')} Placing <b class="merge-b">${esc(B.townName)}</b> beside <b class="merge-a">${esc(A.townName)}</b></div>
      <div class="inline">${[['left', 'west', 'Left'], ['right', 'east', 'Right'], ['above', 'north', 'Above'], ['below', 'south', 'Below']].map(([s, ic, t]) => `<button class="btn small" data-side="${s}">${ms(ic)} ${t}</button>`).join('')}
        <button class="btn small" data-turn>${ms('rotate_right')} Turn (R)</button><button class="btn small" data-over title="Centre it on the town">${ms('join_inner')} Centre</button></div>
      <div class="merge-info" id="mgInfo"></div>
      <ul class="merge-sum" id="mgSum"></ul>
      <div class="mp-hint">Drag the village with the mouse. Right-drag or WASD moves the view, Q / E turns it, T looks straight down.</div>
      <div class="actions"><button class="btn small" data-map title="Arrange on the 2D map instead">${ms('map')} Map</button><button class="btn small" data-cancel>Cancel (Esc)</button><span style="flex:1"></span>
        <button class="btn primary" id="mgGo">${ms('merge')} Merge here (Enter)</button></div>`;
    document.body.appendChild(p);
    // just under the menu bar at the top right
    const bar = document.getElementById('btnSave')?.closest('.panel');
    if (bar) { const top = Math.round(bar.getBoundingClientRect().bottom + 8); p.style.top = `${top}px`; p.style.maxHeight = `calc(100dvh - ${top + 8}px)`; }
    d.win = p;
    d.cv = null;
    for (const b of p.querySelectorAll('[data-side]')) b.onclick = () => { Object.assign(d.arr, besideOffset(this.NA, this.NB, b.dataset.side)); this._changed(); };
    p.querySelector('[data-turn]').onclick = () => this._turn();
    p.querySelector('[data-over]').onclick = () => { const c = Math.round((this.NA - this.NB) / 2); Object.assign(d.arr, { x: c, z: c }); this._changed(); };
    p.querySelector('[data-map]').onclick = () => { this.stop(); d.step = 'arrange'; d._arrange(); };
    p.querySelector('[data-cancel]').onclick = () => this.stop();
    p.querySelector('#mgGo').onclick = () => this._merge();
    // clicks on the panel never reach the town behind it
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}
