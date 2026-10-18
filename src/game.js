// Game orchestrator: owns the renderer, the current world and every system.

import * as THREE from 'three';
import { CONFIG, SEASONS, TITLES } from './config.js';
import { BUILDINGS, SERVICES, unlockOf } from './defs.js';
import { Renderer } from './render/renderer.js';
import { Sky } from './render/sky.js';
import { WorldView } from './render/worldView.js';
import { Particles } from './render/particles.js';
import { World } from './world/world.js';
import { growDemoTown } from './world/demo.js';
import { PathFinder } from './sim/path.js';
import { Sim } from './sim/sim.js';
import { Agents } from './sim/agents.js';
import { Transit } from './sim/transit.js';
import { Animals } from './sim/animals.js';
import { Construction } from './sim/construction.js';
import { UI } from './ui/ui.js';
import { Input } from './ui/input.js';
import { Sfx } from './ui/sfx.js';
import { serialize, deserialize, LocalSaves, downloadJSON, readJSONFile, saveFileName } from './save/saves.js';
import { Drive } from './save/gdrive.js';
import { randomSeed, RNG } from './util/rng.js';
import { townName } from './util/names.js';

const SETTINGS_KEY = 'hearthvale.settings';

export class Game {
  constructor() {
    this.THREE = THREE;
    this.renderer = new Renderer(document.getElementById('app'));
    this.sky = new Sky(this.renderer);
    this.drive = new Drive();
    this.settings = { shadows: true, ao: true, pixelArt: true, pixelSize: 2, autosave: true, sound: true, popCoins: true, popToasts: true, popTips: true, popLabels: true };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {}
    this.speed = 1;
    this.prevSpeed = 1;
    this.env = { hours: 7, night: 0, season: 0, snowing: false };
    this._ev = {};
    this.world = null;
    this.demo = false;
    this.follow = null;
    this.overlayMode = null;
    this._overlayT = 0;
    this._toastT = { arrived: -99, departed: -99 };
    this.time = 0;
    this.audio = new Sfx();
    this.lantern = new Particles(this.renderer.scene, 400, { additive: true });
    this.ui = new UI(this);
    this.input = new Input(this);

    this.on('coins', (c) => this.ui.coin(c.x, c.y, c.z, c.v));
    this.on('day', () => this._onDay());
    this.on('season', (s) => { if (!this.demo) this.ui.toast(`${SEASONS[s].name} has arrived`, 'info', SEASONS[s].icon); });
    this.on('milestone', (t) => this._onMilestone(t));
    this.on('arrived', ({ building, family }) => {
      if (this.demo || this.time - this._toastT.arrived < 25) return;
      this._toastT.arrived = this.time;
      this.ui.toast(`The ${family[0].last} family moved into a ${BUILDINGS[building.type].levels[building.level].name}`, 'good', '🧳');
    });
    this.on('departed', ({ count }) => {
      if (this.demo || this.time - this._toastT.departed < 30) return;
      this._toastT.departed = this.time;
      this.ui.toast(`${count} unhappy villager${count > 1 ? 's' : ''} packed up and left`, 'bad', '😟');
    });
    this.on('transit:routes', () => this.updateRouteOverlay());

    this._bindFileDrop();
    this.clock = performance.now();
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  on(e, fn) { (this._ev[e] ||= []).push(fn); }
  emit(e, d) { for (const fn of this._ev[e] || []) fn(d); }

  // ------------------------------------------------------------ lifecycle
  load(world, { fresh = false, demo = false } = {}) {
    this._teardown();
    this.world = world;
    this.demo = demo;
    this.paths = new PathFinder(world);
    this.view = new WorldView(world, this.renderer);
    this.sim = new Sim(this);
    this.transit = new Transit(this);
    if (fresh) this.sim.seedFounders(); else this.sim.recompute();
    this.agents = new Agents(this);
    this.animals = new Animals(this);
    this.construction = new Construction(this);
    world.on('building:done', (e) => this._onBuilt(e));
    world.on('land:sold', (e) => this._onLand(e));
    this.transit.rebuild();
    this.transit.planCarts();
    this.renderer.setBounds(world.N);
    let focus = { x: world.N / 2, z: world.N / 2 };
    for (const b of world.buildings.values()) if (b.type === 'townhall') focus = { x: b.x + 1, z: b.z + 1 };
    this.renderer.lookAt(focus.x, focus.z, true);
    this._demoFocus = focus;
    this.renderer.rig.zoom = this.renderer.rig.zoomT = demo ? 1.25 : 1.7;
    this.overlayMode = null;
    this.follow = null;
    this.speed = 1;
    this.view.setSeason(this.sky.season);
    document.getElementById('hud').classList.toggle('hidden', demo);
    this.ui.inspect(null);
    this.ui.closeFlyout();
    this.ui.setLegend(null);
    this.input.setTool({ kind: 'select' });
    this.applySettings();
  }

  _teardown() {
    if (!this.world) return;
    this.input._setGhost(null);
    this.agents?.dispose();
    this.animals?.dispose();
    this.transit?.dispose();
    this.view?.dispose();
    this.lantern.clear();
    this.world = null;
  }

  startDemo() {
    const seed = randomSeed();
    const w = World.createNew({ N: 44, seed, name: townName(new RNG(seed)) });
    growDemoTown(w, seed, 1);
    w.hours = 17.2;
    w.day = 1 + CONFIG.DAYS_PER_SEASON * (seed % 3);
    this.load(w, { fresh: true, demo: true });
    this.speed = 1;
  }

  newGame({ name, seed, N, sandbox }) {
    const w = World.createNew({ N, seed, name, sandbox });
    this.load(w, { fresh: true });
    document.getElementById('title').classList.add('hidden');
    this.ui.toast(`Welcome to ${name}! Build cottages along the road to attract settlers.`, 'big', '🏡');
    setTimeout(() => this.ui.toast('Press ❓ any time for a quick guide.', 'info', '💡'), 2500);
  }

  loadData(data) {
    const w = deserialize(data);
    this.load(w, { fresh: false });
    document.getElementById('title').classList.add('hidden');
  }

  toTitle() {
    if (this.world && !this.demo && this.settings.autosave) this.saveLocal('autosave', true);
    this.startDemo();
    this.showTitle();
  }

  showTitle() {
    const t = document.getElementById('title');
    t.classList.remove('hidden');
    const saves = LocalSaves.list();
    const cont = document.getElementById('btnContinue');
    cont.classList.toggle('hidden', !saves.length);
    cont.onclick = () => {
      const latest = [...LocalSaves.list()].sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1))[0];
      if (!latest) return;
      try { this.loadData(LocalSaves.load(latest.id)); this.ui.toast(`Welcome back to ${this.world.townName}`, 'good', '🏡'); } catch (e) { this.ui.toast(e.message, 'bad'); }
    };
    document.getElementById('btnNew').onclick = () => this.ui.showNewGame((o) => this.newGame(o));
    document.getElementById('btnLoad').onclick = () => this.ui.showSaves('local');
  }

  // --------------------------------------------------------------- saving
  saveLocal(id, quiet = false) {
    if (!this.world || this.demo) return false;
    try {
      const data = serialize(this.world);
      if (id === 'autosave') data.name = this.world.townName;
      LocalSaves.save(id, data, this.captureThumb());
      if (!quiet) this.ui.toast('Saved', 'good', '💾');
      return true;
    } catch (e) {
      this.ui.toast(e.message, 'bad');
      return false;
    }
  }

  quickSave() { this.saveLocal('quick'); }

  // Plain .json download of the current town.
  downloadSave() {
    if (!this.world || this.demo) return;
    downloadJSON(serialize(this.world), saveFileName(this.world));
    this.ui.toast('Save file downloaded', 'good', '⬇');
  }

  // Drop a .json save anywhere on the page to load it.
  _bindFileDrop() {
    window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', async (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      if (!/\.json$/i.test(f.name) && f.type !== 'application/json') { this.ui.toast('Drop a Hearthvale .json save to load it', 'bad'); return; }
      try {
        this.loadData(await readJSONFile(f));
        this.ui.closeModal();
        this.ui.toast(`Loaded ${f.name}`, 'good', '📁');
      } catch (err) { this.ui.toast(err.message, 'bad'); }
    });
  }

  captureThumb() {
    try {
      this.renderer.render();
      const src = this.renderer.canvas;
      const c = document.createElement('canvas');
      c.width = 320; c.height = 180;
      const g = c.getContext('2d');
      const sky = this.sky.cur;
      const grd = g.createLinearGradient(0, 0, 0, 180);
      grd.addColorStop(0, '#' + sky.top.getHexString()); grd.addColorStop(1, '#' + sky.bot.getHexString());
      g.fillStyle = grd; g.fillRect(0, 0, 320, 180);
      const ar = src.width / src.height, tw = 320, th = 180;
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (ar > tw / th) { sw = src.height * (tw / th); sx = (src.width - sw) / 2; } else { sh = src.width / (tw / th); sy = (src.height - sh) / 2; }
      g.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return null; }
  }

  _onDay() {
    if (this.demo) return;
    this.transit.planCarts();
    if (this.settings.autosave && (this.world.day % CONFIG.AUTOSAVE_DAYS === 0)) this.saveLocal('autosave', true);
  }

  _onMilestone(t) {
    if (this.demo) return;
    const unlocked = [];
    for (const [type, def] of Object.entries(BUILDINGS)) {
      if (unlockOf(type, 0) === t.pop) unlocked.push(def.name);
      def.levels.forEach((L, i) => { if (i > 0 && L.unlock === t.pop) unlocked.push(L.name); });
    }
    this.ui.toast(`${this.world.townName} is now a ${t.name}!`, 'big', '🎉');
    if (unlocked.length) setTimeout(() => this.ui.toast(`Unlocked: ${unlocked.slice(0, 6).join(', ')}${unlocked.length > 6 ? '…' : ''}`, 'good', '🔓'), 900);
    this.sfx('fanfare');
    let at = null;
    for (const b of this.world.buildings.values()) if (b.type === 'townhall') at = b;
    const x = at ? at.x + 1 : this.renderer.rig.target.x, z = at ? at.z + 1 : this.renderer.rig.target.z;
    this.view.fireworks(x, at ? at.baseY : 1, z);
  }

  // ------------------------------------------------------------- controls
  setSpeed(s) {
    if (s === 0 && this.speed) this.prevSpeed = this.speed;
    this.speed = s;
  }

  stepSpeed(dir) {
    const S = [0, 1, 2, 4, 8, 16, 32];
    const i = Math.max(0, S.indexOf(this.speed));
    this.setSpeed(S[Math.max(0, Math.min(S.length - 1, i + dir))]);
  }

  toggleTopDown() {
    this.renderer.setTopDown(!this.renderer.rig.topDown);
    this.ui.syncToolbar();
  }

  setFollow(id) {
    if (this.follow === id) return;
    this.follow = id;
    if (this.ui.selection && this.ui.selection.kind === 'resident') this.ui.renderInspector(true);
  }

  refreshCursor() { this.input.refresh(); }

  sfx(name) { if (this.settings.sound) this.audio.play(name); }

  _onBuilt({ building: b, kind, moved }) {
    if (this.demo || this.time - (this._toastT.built || -99) < 4) return;
    this._toastT.built = this.time;
    const name = BUILDINGS[b.type].levels[b.level].name;
    const msg = kind === 'upgrade' ? `Upgrade finished: ${name}` : kind === 'merge' ? `The builders finished the ${name}`
      : moved ? `The ${name} is back up on its new plot` : `The builders finished a new ${name}`;
    this.ui.toast(msg, 'good', '🏗️');
    this.sfx('upgrade');
  }

  _onLand({ buyer, seller, price }) {
    if (this.demo) return;
    const n = (b) => BUILDINGS[b.type].levels[b.level].name;
    this.ui.toast(`The ${n(buyer)} household bought part of the next-door ${n(seller)}'s garden for 🪙 ${price}`, 'info', '🌿');
  }

  applySettings() {
    this.renderer.setShadows(this.settings.shadows);
    const s = this.settings;
    const gf = this.renderer.gfx;
    if (!this.renderer.post && (s.pixelArt || s.ao) || gf.pixelArt !== s.pixelArt || gf.pixelSize !== s.pixelSize || gf.ao !== s.ao || !this._gfxInit) {
      this._gfxInit = true;
      this.renderer.setGraphics({ pixelArt: s.pixelArt, pixelSize: s.pixelSize, ao: s.ao });
    }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch {}
  }

  // ------------------------------------------------------------- overlays
  setOverlay(mode) {
    this.overlayMode = mode;
    this.refreshOverlay();
    this.updateRouteOverlay();
    const legends = {
      happiness: '🙂 Happiness <span class="grad" style="background:linear-gradient(90deg,#e0533d,#e8c84a,#5fbf4e)"></span>',
      appeal: '🌳 Scenery <span class="grad" style="background:linear-gradient(90deg,transparent,#3fae4e)"></span>',
      pollution: '🏭 Pollution <span class="grad" style="background:linear-gradient(90deg,transparent,#7a4aa0)"></span>',
      transit: '🚏 Transit routes',
    };
    let html = legends[mode] || (SERVICES[mode] ? `${SERVICES[mode].icon} ${SERVICES[mode].name} coverage <span class="grad" style="background:${SERVICES[mode].color}"></span>` : null);
    if (html) html += ' <button class="btn small" id="legendX">✕</button>';
    this.ui.setLegend(html);
    const x = document.getElementById('legendX');
    if (x) x.onclick = () => this.setOverlay(null);
  }

  refreshOverlay() {
    if (!this.view) return;
    const ov = this.view.overlay, mode = this.overlayMode, sim = this.sim, w = this.world;
    if (!mode || mode === 'transit') { ov.setMap(null); return; }
    const N = w.N;
    if (SERVICES[mode]) {
      const col = SERVICES[mode].color;
      ov.setMap(sim.coverage[mode], (v, x, z) => (v ? [col, w.terrain.isWater(x, z) ? 0.12 : 0.34] : null));
    } else if (mode === 'happiness') {
      const vals = new Float32Array(N * N).fill(-1);
      for (const b of w.buildings.values()) {
        if (!BUILDINGS[b.type].levels[b.level].housing) continue;
        vals[w.idx(b.x, b.z)] = b.happiness / 100;
      }
      const c = new THREE.Color(), a = new THREE.Color('#e0533d'), m = new THREE.Color('#e8c84a'), g = new THREE.Color('#5fbf4e');
      ov.setMap(vals, (v) => {
        if (v < 0) return null;
        if (v < 0.5) c.copy(a).lerp(m, v * 2); else c.copy(m).lerp(g, (v - 0.5) * 2);
        return ['#' + c.getHexString(), 0.6];
      });
    } else if (mode === 'appeal') {
      ov.setMap(sim.appeal, (v) => (v > 0.5 ? ['#3fae4e', Math.min(0.6, v / 25)] : null));
    } else if (mode === 'pollution') {
      ov.setMap(sim.pollution, (v) => (v > 0.5 ? ['#7a4aa0', Math.min(0.6, v / 25)] : null));
    }
  }

  updateRouteOverlay() {
    if (!this.view || !this.transit) return;
    const t = this.input.tool;
    const show = this.overlayMode === 'transit' || t.kind === 'line' || t.kind === 'rail' || this.ui.category === 'transit';
    const ribbons = show ? this.transit.routeRibbons() : [];
    if (t.kind === 'line' && t.stops.length >= 2) {
      const tmp = { mode: t.mode, stops: t.stops };
      const r = this.transit._route(tmp);
      if (r) ribbons.push({ points: r.pts.map(([x, z]) => [x, this.transit._height(t.mode, x, z) + 0.02, z]), color: '#ffffff', opacity: 0.7, width: 0.05 });
    }
    this.view.overlay.setRoutes(ribbons);
  }

  // ---------------------------------------------------------------- frame
  frame() {
    const now = performance.now();
    let dt = (now - this.clock) / 1000;
    this.clock = now;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const w = this.world;
    if (w) {
      const gameDt = this.sim.update(dt);
      this.sky.update(w.day, w.hours);
      const env = this.env;
      env.hours = w.hours; env.night = this.sky.night; env.season = this.sky.season;
      env.snowing = env.season === 3 && this.sky.snow > 0.15 && ((w.day * 7 + Math.floor(w.hours / 5)) % 3 === 0);
      this.view.setSeason(env.season);
      this.agents.update(dt, gameDt);
      this.construction.update(dt, gameDt);
      this.transit.update(dt);
      this.animals.update(dt, this.speed);
      this.view.update(dt, gameDt, env);
      // villagers carry little lanterns at night
      const l = this.agents.lanterns.map(wk => ({ x: wk.x + Math.cos(wk.heading) * 0.05, y: wk.y + 0.12, z: wk.z - Math.sin(wk.heading) * 0.05, size: 0.16, r: 1, g: 0.75, b: 0.4, a: 0.8 }));
      this.lantern.setStatics(l);
      this.lantern.update(dt, this.renderer.pixelsPerUnit(), env.night);
      if (this.follow != null) {
        const r = w.residents.get(this.follow);
        const p = r && this.agents.positionOf(r);
        if (p) this.renderer.lookAt(p.x, p.z); else this.follow = null;
      }
      if (this.demo) {
        const rig = this.renderer.rig;
        const cx = this._demoFocus.x, cz = this._demoFocus.z;
        rig.goal.x = cx + Math.sin(this.time * 0.05) * 3;
        rig.goal.z = cz + Math.cos(this.time * 0.04) * 2.5;
      }
      this._overlayT += dt;
      if (this.overlayMode && this._overlayT > 1) { this._overlayT = 0; this.refreshOverlay(); }
      this.input.update(dt);
      if (!this.demo) this.ui.update(dt);
    }
    this.renderer.updateCamera(dt);
    this.renderer.render();
  }
}
