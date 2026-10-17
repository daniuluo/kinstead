// HUD, toolbar, inspector, notifications and dialogs.

import { CONFIG, ROAD_LEVELS, SEASONS, titleFor, seasonOf, TITLES, TREE_COST, TERRAFORM_COST } from '../config.js';
import { BUILDINGS, CATEGORIES, SERVICES, TRANSIT, RAIL_COST, unlockOf } from '../defs.js';
import { thumb } from './thumbs.js';
import { LocalSaves, serialize, downloadJSON, readJSONFile, saveFileName } from '../save/saves.js';
import { RNG, randomSeed } from '../util/rng.js';
import { townName as genTownName } from '../util/names.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
const signed = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const pad = (n) => String(n).padStart(2, '0');

// Emoji used around the codebase are rendered as calm monochrome icons.
const ICONS = {
  '🖐': 'pan_tool', '🛤': 'add_road', '🏡': 'cottage', '🛍': 'storefront', '⚒': 'handyman', '⛲': 'account_balance',
  '🌳': 'park', '🚂': 'train', '⛰': 'landscape', '🚜': 'delete', '🙂': 'sentiment_satisfied', '😄': 'sentiment_very_satisfied',
  '😐': 'sentiment_neutral', '😟': 'sentiment_dissatisfied', '💧': 'water_drop', '🩺': 'medical_services', '📚': 'school',
  '🛡': 'shield', '🔔': 'church', '🏭': 'factory', '🚏': 'directions_bus', '🟫': 'route', '🪨': 'grid_on', '⬛': 'road',
  '🕳': 'vertical_align_bottom', '📐': 'straighten', '🌲': 'forest', '🐴': 'directions_bus', '📋': 'list_alt', '🔒': 'lock',
  '🔓': 'lock_open', '⬆': 'arrow_upward', '⬇': 'download', '🧰': 'work', '💸': 'money_off', '🎥': 'videocam', '💻': 'computer',
  '☁': 'cloud', '📁': 'folder', '🧳': 'luggage', '🎉': 'celebration', '💡': 'lightbulb', '💾': 'save', '📊': 'bar_chart',
  '⚙': 'settings', '❓': 'help', '👁': 'layers', '🌅': 'wb_twilight', '☀': 'light_mode', '🌙': 'dark_mode', '🌸': 'local_florist',
  '🍂': 'eco', '❄': 'ac_unit', '🧑': 'person', '🧒': 'child_care', '🧓': 'elderly', '👪': 'groups', '🎲': 'casino',
  '🐟': 'set_meal', '🌾': 'grass', '🪓': 'carpenter', '🔨': 'hardware', '🥖': 'bakery_dining', '🍺': 'sports_bar',
  '🧺': 'shopping_basket', '🏛': 'account_balance', '🌷': 'local_florist', '🌼': 'filter_vintage', '🚉': 'train', '🏠': 'home',
  '😢': 'sentiment_dissatisfied', '🗽': 'person_pin',
};
const EMOJI_RE = new RegExp(Object.keys(ICONS).join('|'), 'g');
export function ico(html) {
  return String(html).replace(/️/g, '').replace(/🪙/g, '<span class="ms coin">toll</span>').replace(EMOJI_RE, (m) => `<span class="ms">${ICONS[m]}</span>`);
}

const TOOLS = [
  { id: 'select', icon: '🖐️', label: 'Select', key: '1' },
  { id: 'roads', icon: '🛤️', label: 'Roads', key: 'R' },
  ...CATEGORIES.map(c => ({ id: c.id, icon: c.icon, label: c.name.split(' ')[0], key: c.key })),
  { id: 'terrain', icon: '⛰️', label: 'Terrain', key: '8' },
  { id: 'bulldoze', icon: '🚜', label: 'Demolish', key: 'X' },
];

const OVERLAYS = [
  { id: null, name: 'No overlay' },
  { id: 'happiness', name: '🙂 Happiness' },
  { id: 'water', name: '💧 Water' },
  { id: 'health', name: '🩺 Health' },
  { id: 'education', name: '📚 Education' },
  { id: 'safety', name: '🛡️ Safety' },
  { id: 'culture', name: '🔔 Culture' },
  { id: 'appeal', name: '🌳 Scenery' },
  { id: 'pollution', name: '🏭 Pollution' },
  { id: 'transit', name: '🚏 Transit routes' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.category = null;
    this.selection = null;
    this._t = 0;
    this.labels = new Map();
    this.follow = null;
    this.buildToolbar();
    this.bindStatic();
  }

  get world() { return this.game.world; }

  // --------------------------------------------------------------- setup
  bindStatic() {
    const g = this.game;
    for (const b of $('speed').querySelectorAll('button')) b.onclick = () => g.setSpeed(Number(b.dataset.speed));
    $('zoomIn').onclick = () => g.renderer.zoomBy(1.35);
    $('zoomOut').onclick = () => g.renderer.zoomBy(1 / 1.35);
    $('btnView').onclick = () => g.toggleTopDown();
    $('btnOverlay').onclick = () => this.toggleOverlayMenu();
    $('btnLines').onclick = () => this.showLines();
    $('btnBudget').onclick = () => this.showBudget();
    $('btnSave').onclick = () => this.showSaves();
    $('btnSettings').onclick = () => this.showSettings();
    $('btnHelp').onclick = () => this.showHelp();
    $('townBox').onclick = () => this.showRename();
    $('modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && !this._modalLocked) this.closeModal(); });
    const om = $('overlayMenu');
    om.innerHTML = ico(OVERLAYS.map(o => `<button data-o="${o.id ?? ''}">${o.name}</button>`).join(''));
    for (const b of om.querySelectorAll('button')) b.onclick = () => { g.setOverlay(b.dataset.o || null); this.toggleOverlayMenu(false); };
  }

  buildToolbar() {
    const tb = $('toolbar');
    tb.innerHTML = '';
    TOOLS.forEach((t, i) => {
      if (i === 1 || i === TOOLS.length - 2) { const s = document.createElement('div'); s.className = 'sep'; tb.appendChild(s); }
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.title = `${t.label} (${t.key})`;
      b.innerHTML = `<span class="e">${ico(t.icon)}</span><span class="l">${t.label}</span><span class="k">${t.key}</span>`;
      b.onclick = () => this.pressTool(t.id);
      tb.appendChild(b);
    });
  }

  pressTool(id) {
    const g = this.game;
    if (id === 'select') { this.closeFlyout(); g.input.setTool({ kind: 'select' }); return; }
    if (id === 'bulldoze') { this.closeFlyout(); g.input.setTool({ kind: 'bulldoze' }); return; }
    if (this.category === id) { this.closeFlyout(); g.input.setTool({ kind: 'select' }); return; }
    this.openFlyout(id);
  }

  syncToolbar() {
    const t = this.game.input.tool;
    let active = 'select';
    if (t.kind === 'bulldoze') active = 'bulldoze';
    else if (this.category) active = this.category;
    for (const b of $('toolbar').querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === active);
    for (const c of $('flyout').querySelectorAll('.card')) c.classList.toggle('on', c.dataset.key === toolKey(t));
    $('btnView').textContent = this.game.renderer.rig.topDown ? 'ISO' : '2D';
    $('btnView').classList.toggle('on', this.game.renderer.rig.topDown);
    this.updateHint();
  }

  // ------------------------------------------------------------- flyouts
  openFlyout(cat) {
    this.category = cat;
    const fl = $('flyout');
    const pop = this.world.unlockPop;
    const cards = [];
    const card = (key, img, name, cost, locked, onclick, title = '') => ({ key, img, name, cost, locked, onclick, title });
    if (cat === 'roads') {
      for (const L of [1, 2, 3]) {
        const d = ROAD_LEVELS[L];
        cards.push(card(`road:${L}`, ['🟫', '🪨', '⬛'][L - 1], d.name, `${d.cost} / tile`, pop < d.unlock ? d.unlock : 0, () => this.game.input.setTool({ kind: 'road', level: L }), 'Drag to build. Drawing over a lesser road upgrades it.'));
      }
    } else if (cat === 'terrain') {
      cards.push(card('terrain:raise', '⛰️', 'Raise land', `${TERRAFORM_COST}`, 0, () => this.game.input.setTool({ kind: 'terrain', mode: 'raise' })));
      cards.push(card('terrain:lower', '🕳️', 'Lower land', `${TERRAFORM_COST}`, 0, () => this.game.input.setTool({ kind: 'terrain', mode: 'lower' })));
      cards.push(card('terrain:flatten', '📐', 'Level land', `${TERRAFORM_COST}`, 0, () => this.game.input.setTool({ kind: 'terrain', mode: 'flatten' })));
      cards.push(card('trees', '🌲', 'Plant trees', `${TREE_COST}`, 0, () => this.game.input.setTool({ kind: 'trees' })));
    } else {
      for (const [type, def] of Object.entries(BUILDINGS)) {
        if (def.cat !== cat) continue;
        const u = unlockOf(type, 0);
        cards.push(card(`build:${type}`, thumb(type, 0), def.name, `${def.levels[0].cost}`, pop < u ? u : 0, () => this.game.input.setTool({ kind: 'build', type }), def.desc));
      }
      if (cat === 'parks') cards.push(card('trees', '🌲', 'Plant trees', `${TREE_COST}`, 0, () => this.game.input.setTool({ kind: 'trees' })));
      if (cat === 'transit') {
        cards.push(card('rail', '🛤️', 'Lay track', `${RAIL_COST} / tile`, pop < 25 ? 25 : 0, () => this.game.input.setTool({ kind: 'rail' }), 'Drag to lay railway track. Track can cross roads.'));
        cards.push(card('line:coach', '🐴', 'New coach line', `${TRANSIT.coach.vehicleCost}`, 0, () => this.game.input.setTool({ kind: 'line', mode: 'coach', stops: [] }), 'Click coach stops in order, then press Enter.'));
        cards.push(card('line:rail', '🚂', 'New rail line', `${TRANSIT.rail.vehicleCost}`, pop < 25 ? 25 : 0, () => this.game.input.setTool({ kind: 'line', mode: 'rail', stops: [] }), 'Click stations in order, then press Enter.'));
        cards.push(card('lines', '📋', 'Manage lines', '', 0, () => this.showLines()));
      }
    }
    fl.innerHTML = '';
    for (const c of cards) {
      const el = document.createElement('div');
      el.className = 'card' + (c.locked ? ' locked' : '');
      el.dataset.key = c.key;
      el.title = c.title;
      const img = c.img.startsWith('data:') ? `<img src="${c.img}" alt="">` : `<div class="ph">${ico(c.img)}</div>`;
      el.innerHTML = ico(`${img}<div class="n">${esc(c.name)}</div>` + (c.locked ? `<div class="lock">🔒 ${c.locked} villagers</div>` : (c.cost ? `<div class="c">🪙 ${c.cost}</div>` : '')));
      el.onclick = () => {
        if (c.locked) { this.toast(`${c.name} unlocks when your town reaches ${c.locked} villagers.`, 'bad', '🔒'); return; }
        c.onclick();
      };
      fl.appendChild(el);
    }
    fl.classList.remove('hidden');
    // auto-select the first available tool for quick building
    this.syncToolbar();
  }

  closeFlyout() {
    this.category = null;
    $('flyout').classList.add('hidden');
    this.syncToolbar();
  }

  updateHint() {
    const t = this.game.input.tool;
    const h = $('toolHint');
    let msg = '';
    switch (t.kind) {
      case 'road': msg = `Drag to lay ${ROAD_LEVELS[t.level].name.toLowerCase()} · drawing over roads upgrades them · right-click to stop`; break;
      case 'rail': msg = 'Drag to lay railway track · it can cross roads · right-click to stop'; break;
      case 'build': msg = `Click to place a ${BUILDINGS[t.type].name} · Tab flips the entrance · right-click to stop`; break;
      case 'bulldoze': msg = 'Click or drag to demolish · right-click to stop'; break;
      case 'terrain': msg = `Click or drag to ${t.mode === 'flatten' ? 'level' : t.mode} the land · ${TERRAFORM_COST} coins each`; break;
      case 'trees': msg = `Click or drag to plant trees · ${TREE_COST} coins each`; break;
      case 'line': msg = `Click ${t.mode === 'rail' ? 'stations' : 'coach stops'} in order (${t.stops.length} chosen) · Enter to create · Backspace to undo · Esc to cancel`; break;
      default: msg = '';
    }
    h.textContent = msg;
    h.classList.toggle('hidden', !msg);
  }

  // ----------------------------------------------------------------- HUD
  update(dt) {
    const w = this.world;
    if (!w) return;
    const sim = this.game.sim;
    const h = Math.floor(w.hours), m = Math.floor((w.hours - h) * 60 / 10) * 10;
    $('clockTime').textContent = `${pad(h)}:${pad(m)}`;
    const night = this.game.env.night;
    const ci = night > 0.6 ? 'dark_mode' : (w.hours < 8 || w.hours > 18 ? 'wb_twilight' : 'light_mode');
    if (this._ci !== ci) { this._ci = ci; $('clockIcon').innerHTML = `<span class="ms">${ci}</span>`; }
    this._t += dt;
    if (this._t > 0.25) {
      this._t = 0;
      const s = seasonOf(w.day);
      const dayOfYear = ((w.day - 1) % (CONFIG.DAYS_PER_SEASON * 4)) + 1;
      const year = Math.floor((w.day - 1) / (CONFIG.DAYS_PER_SEASON * 4)) + 1;
      $('clockDate').innerHTML = ico(`${SEASONS[s].icon} ${SEASONS[s].name} · Day ${w.day}` + (year > 1 ? ` · Year ${year}` : ''));
      void dayOfYear;
      $('money').textContent = Number.isFinite(w.money) ? fmt(w.money) : '∞';
      $('money').style.color = w.money < 0 ? 'var(--brick)' : '';
      const net = sim.budget.net;
      $('net').textContent = Number.isFinite(w.money) ? `${signed(net)} / day` : 'sandbox';
      $('net').className = net >= 0 ? 'pos' : 'neg';
      $('pop').textContent = fmt(w.population);
      const free = sim.housing.cap - sim.housing.used;
      $('housing').textContent = `${free} free home${free === 1 ? '' : 's'}`;
      const hp = Math.round(sim.happiness);
      $('happy').textContent = `${hp}%`;
      $('happyIco').textContent = hp >= 75 ? 'sentiment_very_satisfied' : hp >= 55 ? 'sentiment_satisfied' : hp >= 40 ? 'sentiment_neutral' : 'sentiment_dissatisfied';
      $('jobs').textContent = `${sim.jobs.filled}/${sim.jobs.total}`;
      $('demR').style.height = `${sim.demand.r * 100}%`;
      $('demC').style.height = `${sim.demand.c * 100}%`;
      $('demI').style.height = `${sim.demand.i * 100}%`;
      $('townName').textContent = w.townName;
      $('townTitle').textContent = titleFor(w.population).name;
      for (const b of $('speed').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.speed) === this.game.speed);
      $('speed').title = `Speed ${this.game.speed}× · [ and ] change speed`;
      if (this.selection) this.renderInspector();
    }
    this.updateLabels();
  }

  // ------------------------------------------------------------ inspector
  inspect(sel) {
    this.selection = sel;
    this.game.agents.select(sel && sel.kind === 'resident' ? this.world.residents.get(sel.id) : null);
    if (!sel) { $('inspector').classList.add('hidden'); this.game.setFollow(null); this.game.refreshCursor(); return; }
    if (sel.kind !== 'resident') this.game.setFollow(null);
    this.renderInspector(true);
    this.game.refreshCursor();
  }

  renderInspector(force = false) {
    const el = $('inspector');
    const sel = this.selection;
    const w = this.world;
    if (!sel) return;
    // don't rebuild while the pointer is over a button (keeps clicks reliable)
    if (!force && el.matches(':hover') && el.querySelector('button:hover')) return;
    let html = '';
    if (sel.kind === 'building') {
      const b = w.buildings.get(sel.id);
      if (!b) { this.inspect(null); return; }
      html = this._buildingHTML(b);
    } else if (sel.kind === 'resident') {
      const r = w.residents.get(sel.id);
      if (!r) { this.inspect(null); return; }
      html = this._residentHTML(r);
    } else if (sel.kind === 'road') {
      const L = w.roadAt(sel.x, sel.z);
      if (!L && !w.railAt(sel.x, sel.z)) { this.inspect(null); return; }
      html = this._roadHTML(sel.x, sel.z, L);
    }
    el.innerHTML = `<button class="close" data-act="close">✕</button>` + ico(html);
    el.classList.remove('hidden');
    for (const a of el.querySelectorAll('[data-act]')) a.onclick = (e) => this._act(a.dataset.act, a.dataset, e);
  }

  _buildingHTML(b) {
    const w = this.world, sim = this.game.sim;
    const def = BUILDINGS[b.type], L = def.levels[b.level];
    const stars = def.levels.length > 1 ? `<span class="stars">${'★'.repeat(b.level + 1)}${'☆'.repeat(def.levels.length - b.level - 1)}</span>` : '';
    let h = `<div class="head"><img src="${thumb(b.type, b.level, b.variant)}" alt=""><div><h3>${esc(L.name)}</h3><div class="sub">${esc(def.name)} ${stars}</div></div></div>`;
    const chips = [];
    if (!def.park || b.access) chips.push(b.connected ? '<span class="chip ok">Road connected</span>' : '<span class="chip no">Not connected to the town entrance</span>');
    if (def.needsRail) chips.push(b.rail ? '<span class="chip ok">On the railway</span>' : '<span class="chip no">No track alongside</span>');
    h += `<div class="chips">${chips.join('')}</div>`;
    const rows = [];
    if (L.housing) {
      rows.push(['Residents', `${b.residents.length} / ${L.housing}`]);
    }
    if (L.jobs) rows.push(['Workers', `${b.workers.length} / ${L.jobs}`]);
    if (L.income) {
      let v = b.workers.length * L.income;
      rows.push([def.cat === 'industry' ? 'Production' : 'Sales', `🪙 ${fmt(v)} / day`]);
    }
    if (L.visit) rows.push(['Per visit', `🪙 ${L.visit}`]);
    if (L.upkeep) rows.push(['Upkeep', `🪙 ${L.upkeep} / day`]);
    if (def.service) rows.push([`${SERVICES[def.service].icon} ${SERVICES[def.service].name} reach`, `${L.radius} tiles`]);
    if (def.park) rows.push(['Scenery', `+${L.appeal} within ${L.radius} tiles`]);
    if (L.pollution) rows.push(['Pollution', `${L.pollution} tile radius`]);
    if (L.taxBonus) rows.push(['Tax bonus', `+${Math.round(L.taxBonus * 100)}%`]);
    if (def.stop) {
      const lines = w.lines.filter(l => l.stops.includes(b.id));
      const waiting = (this.game.transit.waiting.get(b.id) || []).length;
      rows.push(['Lines', lines.length ? lines.map(l => `<span style="color:${l.color}">●</span> ${esc(l.name)}`).join('<br>') : 'None yet']);
      rows.push(['Waiting', `${waiting}`]);
    }
    rows.push(['Built', `Day ${b.built}`]);
    h += `<div class="sec">${rows.map(([a, v]) => `<div class="row"><span>${a}</span><b>${v}</b></div>`).join('')}</div>`;
    if (L.housing) {
      const f = b.factors || {};
      h += `<div class="sec"><h5>Happiness ${b.happiness}%</h5><div class="meter"><i style="width:${b.happiness}%;background-position:${-300 + b.happiness * 3}px 0"></i></div>`;
      const fc = [];
      for (const [k, s] of Object.entries(SERVICES)) fc.push(`<span class="chip ${f[k] ? 'ok' : 'no'}">${s.icon} ${s.name}</span>`);
      if (f.shops) fc.push('<span class="chip ok">🛍️ Shops nearby</span>');
      if (f.transit) fc.push('<span class="chip ok">🚏 Transit nearby</span>');
      if (f.appeal > 3) fc.push(`<span class="chip ok">🌳 Pretty (+${Math.round(f.appeal)})</span>`);
      if (f.pollution > 2) fc.push(`<span class="chip no">🏭 Smoky (−${Math.round(f.pollution)})</span>`);
      if (f.unemployed > 0.3) fc.push('<span class="chip no">🧰 Needs jobs</span>');
      if (f.tax < -2) fc.push('<span class="chip no">💸 High taxes</span>');
      h += `<div class="chips" style="margin-top:6px">${fc.join('')}</div></div>`;
      if (b.residents.length) {
        h += `<div class="sec"><h5>Household</h5><div class="chips">${b.residents.map(id => {
          const r = w.residents.get(id);
          return r ? `<span class="chip link" data-act="resident" data-id="${id}">${ageIcon(r)} ${esc(r.first)}</span>` : '';
        }).join('')}</div></div>`;
      }
    }
    if (L.jobs && b.workers.length) {
      h += `<div class="sec"><h5>Workers</h5><div class="chips">${b.workers.slice(0, 16).map(id => {
        const r = w.residents.get(id);
        return r ? `<span class="chip link" data-act="resident" data-id="${id}">${esc(r.first)} ${esc(r.last[0])}.</span>` : '';
      }).join('')}${b.workers.length > 16 ? `<span class="chip">+${b.workers.length - 16}</span>` : ''}</div></div>`;
    }
    const up = w.upgradeCheck(b);
    if (!up.max) {
      const n = up.next;
      h += `<div class="sec"><h5>Upgrade to ${esc(n.name)}</h5><div class="req">${up.reqs.map(r => `<div class="${r.met ? 'ok' : 'no'}">${esc(r.label)}</div>`).join('')}</div></div>`;
    }
    h += `<div class="actions">`;
    if (!up.max) h += `<button class="btn primary" data-act="upgrade" ${up.ok ? '' : 'disabled'}>⬆ Upgrade · 🪙 ${fmt(up.next.cost)}</button>`;
    if (b.type !== 'townhall') h += `<button class="btn danger" data-act="demolish">Demolish</button>`;
    h += `</div>`;
    return h;
  }

  _residentHTML(r) {
    const w = this.world, ag = this.game.agents;
    const home = w.buildings.get(r.home), job = r.job != null ? w.buildings.get(r.job) : null;
    const age = r.age === 'child' ? 'Child' : r.age === 'elder' ? 'Elder' : 'Adult';
    const mood = Math.max(0, Math.min(100, Math.round(r.mood ?? 60)));
    const moodE = mood >= 75 ? '😄' : mood >= 55 ? '🙂' : mood >= 40 ? '😐' : '😟';
    let work = job ? `<span class="chip link" data-act="building" data-id="${job.id}">${esc(BUILDINGS[job.type].levels[job.level].name)}</span>` :
      (r.age === 'adult' ? 'Looking for work' : r.age === 'child' ? 'Student' : 'Retired');
    let h = `<div class="head"><div class="big">${ageIcon(r)}</div><div><h3>${esc(r.first)} ${esc(r.last)}</h3><div class="sub">${age} · ${moodE} ${mood}%</div></div></div>`;
    h += `<div class="sec"><div class="row"><span>Now</span><b>${esc(ag.activity(r))}</b></div>`;
    h += `<div class="row"><span>Home</span><b>${home ? `<span class="chip link" data-act="building" data-id="${home.id}">${esc(BUILDINGS[home.type].levels[home.level].name)}</span>` : 'Homeless'}</b></div>`;
    h += `<div class="row"><span>Work</span><b>${work}</b></div></div>`;
    h += `<div class="actions"><button class="btn ${this.game.follow === r.id ? 'gold' : 'primary'}" data-act="follow">${this.game.follow === r.id ? '◉ Following' : '🎥 Follow'}</button></div>`;
    return h;
  }

  _roadHTML(x, z, L) {
    const w = this.world;
    let h = '';
    if (L) {
      const d = ROAD_LEVELS[L];
      h += `<div class="head"><div class="big">${['', '🟫', '🪨', '⬛'][L]}</div><div><h3>${d.name}</h3><div class="sub">${w.terrain.isWater(x, z) ? 'Bridge' : 'Road'} · upkeep ${d.upkeep}/day</div></div></div>`;
      h += `<div class="chips">${w.connected[w.idx(x, z)] ? '<span class="chip ok">Connected</span>' : '<span class="chip no">Not connected to the entrance</span>'}</div>`;
      if (L < 3) {
        const c = w.checkRoad(x, z, L + 1);
        h += `<div class="actions"><button class="btn primary" data-act="roadup" ${c.ok && w.money >= c.cost ? '' : 'disabled'} title="${esc(c.reason || '')}">⬆ ${ROAD_LEVELS[L + 1].name} · 🪙 ${c.cost ?? '—'}</button><button class="btn danger" data-act="roaddel">Remove</button></div>`;
        if (!c.ok) h += `<div class="req"><div class="no">${esc(c.reason)}</div></div>`;
      } else h += `<div class="actions"><button class="btn danger" data-act="roaddel">Remove</button></div>`;
    } else {
      h += `<div class="head"><div class="big">🛤️</div><div><h3>Railway track</h3><div class="sub">upkeep 0.25/day</div></div></div>`;
      h += `<div class="actions"><button class="btn danger" data-act="raildel">Remove</button></div>`;
    }
    return h;
  }

  _act(act, data) {
    const g = this.game, w = this.world, sel = this.selection;
    switch (act) {
      case 'close': this.inspect(null); break;
      case 'resident': this.inspect({ kind: 'resident', id: Number(data.id) }); break;
      case 'building': {
        const b = w.buildings.get(Number(data.id));
        if (b) { this.inspect({ kind: 'building', id: b.id }); g.renderer.lookAt(b.x + b.size / 2, b.z + b.size / 2); }
        break;
      }
      case 'upgrade': {
        const r = w.upgradeBuilding(sel.id);
        if (r.ok) { g.sfx('upgrade'); this.toast(`Upgraded to ${BUILDINGS[r.building.type].levels[r.building.level].name}!`, 'good', '⬆️'); }
        else this.toast(r.reason || 'Cannot upgrade yet', 'bad');
        this.renderInspector(true);
        break;
      }
      case 'demolish': {
        const b = w.buildings.get(sel.id);
        if (b) { w.removeBuilding(b.id); g.sfx('demolish'); this.inspect(null); }
        break;
      }
      case 'follow': g.setFollow(g.follow === sel.id ? null : sel.id); this.renderInspector(true); break;
      case 'roadup': {
        const L = w.roadAt(sel.x, sel.z);
        const r = w.placeRoads([[sel.x, sel.z]], L + 1);
        if (!r.placed) this.toast(r.failed || 'Cannot upgrade', 'bad');
        this.renderInspector(true);
        break;
      }
      case 'roaddel': { const r = w.removeRoad(sel.x, sel.z); if (r !== true) this.toast(r || 'Cannot remove', 'bad'); else this.inspect(null); break; }
      case 'raildel': w.removeRail(sel.x, sel.z); this.inspect(null); break;
    }
  }

  // --------------------------------------------------------- floating UI
  coin(x, y, z, v) {
    const g = this.game;
    if (g.renderer.rig.zoom < 1.1) return;
    const layer = $('popups');
    if (layer.childElementCount > 30) return;
    const p = g.renderer.worldToScreen(new g.THREE.Vector3(x, y, z));
    if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) return;
    const el = document.createElement('div');
    el.className = 'coin';
    el.textContent = `+${v} 🪙`;
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  updateLabels() {
    const g = this.game;
    const r = g.agents.selected;
    let el = this.labels.get('sel');
    if (!r || !this.world.residents.has(r.id)) { if (el) { el.remove(); this.labels.delete('sel'); } return; }
    const pos = g.agents.positionOf(r);
    if (!pos) return;
    if (!el) { el = document.createElement('div'); el.className = 'label3d'; $('popups').appendChild(el); this.labels.set('sel', el); }
    const p = g.renderer.worldToScreen(new g.THREE.Vector3(pos.x, pos.y + 0.32, pos.z));
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    el.textContent = `${r.first} · ${g.agents.activity(r)}`;
  }

  toast(msg, kind = 'info', icon = null) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = (icon ? `<span>${ico(icon)}</span>` : '') + `<span>${ico(esc(msg))}</span>`;
    box.prepend(el);
    while (box.childElementCount > 5) box.lastElementChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'big' ? 6500 : 4000);
  }

  tooltip(html, x, y) {
    const t = $('tooltip');
    if (!html) { t.classList.add('hidden'); return; }
    t.innerHTML = html;
    t.classList.remove('hidden');
    const r = t.getBoundingClientRect();
    t.style.left = `${Math.min(innerWidth - r.width - 8, x + 16)}px`;
    t.style.top = `${Math.min(innerHeight - r.height - 8, y + 18)}px`;
  }

  toggleOverlayMenu(force) {
    const m = $('overlayMenu');
    const show = force ?? m.classList.contains('hidden');
    m.classList.toggle('hidden', !show);
    for (const b of m.querySelectorAll('button')) b.classList.toggle('on', (b.dataset.o || null) === this.game.overlayMode);
  }

  setLegend(html) {
    const l = $('legend');
    if (!html) { l.classList.add('hidden'); return; }
    l.innerHTML = ico(html);
    l.classList.remove('hidden');
    $('btnOverlay').classList.toggle('on', !!this.game.overlayMode);
  }

  // -------------------------------------------------------------- modals
  openModal(html, mount, locked = false) {
    const card = $('modalCard');
    card.innerHTML = (locked ? '' : '<button class="x" data-close>✕</button>') + ico(html);
    $('modal').classList.remove('hidden');
    this._modalLocked = locked;
    const x = card.querySelector('[data-close]');
    if (x) x.onclick = () => this.closeModal();
    if (mount) mount(card);
  }
  closeModal() { $('modal').classList.add('hidden'); $('modalCard').innerHTML = ''; this._modalLocked = false; }
  get modalOpen() { return !$('modal').classList.contains('hidden'); }

  showRename() {
    this.openModal(`<h2>Rename your town</h2><div class="field"><label>Town name</label><input id="renameIn" maxlength="40" value="${esc(this.world.townName)}"></div>
      <div class="actions"><button class="btn primary" id="renameOk">Save name</button></div>`, (c) => {
      const inp = c.querySelector('#renameIn');
      inp.focus(); inp.select();
      const ok = () => { const v = inp.value.trim(); if (v) this.world.townName = v; this.closeModal(); };
      c.querySelector('#renameOk').onclick = ok;
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    });
  }

  showNewGame(onCreate) {
    const rng = new RNG(randomSeed());
    const name = genTownName(rng);
    this.openModal(`<h2>Found a new village</h2><p class="lead">Every seed grows a different valley — rivers, lakes, hills and forests.</p>
      <div class="field"><label>Village name</label><input id="ngName" maxlength="40" value="${esc(name)}"></div>
      <div class="grid2">
        <div class="field"><label>Map seed</label><div class="inline"><input id="ngSeed" style="flex:1" value="${randomSeed() % 1000000}"><button class="btn small" id="ngDice" title="Random seed">🎲</button></div></div>
        <div class="field"><label>Valley size</label><select id="ngSize"><option value="40">Small · 40×40</option><option value="48" selected>Medium · 48×48</option><option value="56">Large · 56×56</option></select></div>
      </div>
      <div class="field"><label class="inline"><input type="checkbox" id="ngInf"> Sandbox: unlimited coins</label></div>
      <div class="field"><label class="inline"><input type="checkbox" id="ngAll"> Sandbox: unlock every building from the start</label></div>
      <div class="actions"><button class="btn primary" id="ngGo">🏡 Found the village</button></div>`, (c) => {
      c.querySelector('#ngDice').onclick = () => { c.querySelector('#ngSeed').value = randomSeed() % 1000000; };
      c.querySelector('#ngGo').onclick = () => {
        const seedStr = c.querySelector('#ngSeed').value.trim();
        const seed = /^\d+$/.test(seedStr) ? Number(seedStr) : [...seedStr].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
        const opts = { name: c.querySelector('#ngName').value.trim() || name, seed, N: Number(c.querySelector('#ngSize').value), sandbox: { infiniteMoney: c.querySelector('#ngInf').checked, unlockAll: c.querySelector('#ngAll').checked } };
        this.closeModal();
        onCreate(opts);
      };
    });
  }

  // ---------------------------------------------------------- save/load
  showSaves(tab = 'local') {
    const g = this.game;
    const inGame = !!g.world && !g.demo;
    const tabs = [['local', '💻 This browser'], ['drive', '☁️ Google Drive'], ['file', '📁 File']];
    this.openModal(`<h2>Save & load</h2><p class="lead">${inGame ? `Saving <b>${esc(this.world.townName)}</b> — day ${this.world.day}, ${fmt(this.world.population)} villagers.` : 'Pick a saved village to continue.'}</p>
      <div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div id="saveBody"></div>`, (c) => {
      for (const b of c.querySelectorAll('[data-tab]')) b.onclick = () => this.showSaves(b.dataset.tab);
      const body = c.querySelector('#saveBody');
      if (tab === 'local') this._localTab(body, inGame);
      else if (tab === 'drive') this._driveTab(body, inGame);
      else this._fileTab(body, inGame);
    });
  }

  _localTab(body, inGame) {
    const g = this.game;
    const list = LocalSaves.list();
    let h = '';
    if (inGame) h += `<div class="actions" style="margin:0 0 12px"><button class="btn primary" id="lsNew">💾 Save as new slot</button></div>`;
    if (!list.length) h += `<div class="empty">No saves in this browser yet.</div>`;
    h += `<div class="saves">${list.map(e => `<div class="save">
      ${e.thumb ? `<img src="${e.thumb}" alt="">` : '<div class="ph">🏡</div>'}
      <div><div class="t">${esc(e.name)} ${e.id === 'autosave' ? '<span class="chip">Autosave</span>' : ''}</div>
      <div class="m">Day ${e.day} · ${fmt(e.pop)} villagers · 🪙 ${typeof e.money === "number" ? fmt(e.money) : e.money}</div><div class="m">${new Date(e.savedAt).toLocaleString()}</div></div>
      <div class="acts"><button class="btn small primary" data-load="${e.id}">Load</button>
      ${inGame && e.id !== 'autosave' ? `<button class="btn small" data-over="${e.id}">Overwrite</button>` : ''}
      <button class="btn small danger" data-del="${e.id}">✕</button></div></div>`).join('')}</div>`;
    body.innerHTML = h;
    const nb = body.querySelector('#lsNew');
    if (nb) nb.onclick = () => { if (g.saveLocal('s' + Date.now().toString(36))) this.showSaves('local'); };
    for (const b of body.querySelectorAll('[data-load]')) b.onclick = () => { try { g.loadData(LocalSaves.load(b.dataset.load)); this.closeModal(); } catch (e) { this.toast(e.message, 'bad'); } };
    for (const b of body.querySelectorAll('[data-over]')) b.onclick = () => { if (g.saveLocal(b.dataset.over)) this.showSaves('local'); };
    for (const b of body.querySelectorAll('[data-del]')) b.onclick = () => {
      if (b.dataset.confirm) { LocalSaves.remove(b.dataset.del); this.showSaves('local'); }
      else { b.dataset.confirm = '1'; b.textContent = 'Delete?'; }
    };
  }

  async _driveTab(body, inGame) {
    const g = this.game, drive = g.drive;
    if (!drive.configured) {
      body.innerHTML = `<div class="note">Cloud saves use your own Google account through the Google Drive API. To switch them on,
        create an <b>OAuth 2.0 Client ID</b> (type “Web application”) in Google Cloud Console, enable the <b>Google Drive API</b>,
        and add <code>${esc(location.origin)}</code> as an authorised JavaScript origin. Then paste the Client ID below.
        Full steps are in the README.</div>
        <div class="field"><label>Google OAuth Client ID</label><input id="gcid" placeholder="1234567890-abc.apps.googleusercontent.com"></div>
        <div class="actions"><button class="btn primary" id="gcidSave">Save Client ID</button></div>`;
      body.querySelector('#gcidSave').onclick = () => {
        const v = body.querySelector('#gcid').value.trim();
        if (!/\.apps\.googleusercontent\.com$/.test(v)) { this.toast('That does not look like a Google OAuth Client ID.', 'bad'); return; }
        drive.setClientId(v);
        this.showSaves('drive');
      };
      return;
    }
    if (!drive.connected) {
      body.innerHTML = `<div class="note">Saves go to a <b>Hearthvale Saves</b> folder in your Google Drive. The game can only see files it created.</div>
        <div class="actions"><button class="btn primary" id="gConnect">☁️ Connect Google Drive</button></div>`;
      body.querySelector('#gConnect').onclick = async () => {
        try { await drive.connect(true); this.showSaves('drive'); } catch (e) { this.toast(e.message, 'bad'); }
      };
      return;
    }
    body.innerHTML = `<div class="empty">Loading your Drive saves…</div>`;
    let files = [];
    try { files = await drive.list(); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!this.modalOpen) return;
    let h = `<div class="actions" style="margin:0 0 12px">${inGame ? '<button class="btn primary" id="gSave">☁️ Save to Drive</button>' : ''}<button class="btn" id="gOut">Disconnect</button></div>`;
    if (!files.length) h += `<div class="empty">No Hearthvale saves in your Drive yet.</div>`;
    h += `<div class="saves">${files.map(f => {
      const a = f.appProperties || {};
      return `<div class="save"><div class="ph">☁️</div><div><div class="t">${esc(a.town || f.name)}</div>
        <div class="m">${a.day ? `Day ${esc(a.day)} · ${esc(a.pop)} villagers · 🪙 ${esc(a.money)}` : esc(f.name)}</div>
        <div class="m">${new Date(f.modifiedTime).toLocaleString()}</div></div>
        <div class="acts"><button class="btn small primary" data-gload="${f.id}">Load</button>
        ${inGame ? `<button class="btn small" data-gover="${f.id}">Overwrite</button>` : ''}
        <button class="btn small danger" data-gdel="${f.id}">✕</button></div></div>`;
    }).join('')}</div>`;
    body.innerHTML = h;
    const busy = (b, t) => { b.disabled = true; b.textContent = t; };
    const sv = body.querySelector('#gSave');
    if (sv) sv.onclick = async () => { busy(sv, 'Saving…'); try { await drive.save(serialize(g.world)); this.toast('Saved to Google Drive', 'good', '☁️'); } catch (e) { this.toast(e.message, 'bad'); } this.showSaves('drive'); };
    body.querySelector('#gOut').onclick = () => { drive.disconnect(); this.showSaves('drive'); };
    for (const b of body.querySelectorAll('[data-gload]')) b.onclick = async () => {
      busy(b, '…');
      try { g.loadData(await drive.load(b.dataset.gload)); this.closeModal(); this.toast('Loaded from Google Drive', 'good', '☁️'); } catch (e) { this.toast(e.message, 'bad'); b.disabled = false; b.textContent = 'Load'; }
    };
    for (const b of body.querySelectorAll('[data-gover]')) b.onclick = async () => {
      busy(b, '…');
      try { await drive.save(serialize(g.world), b.dataset.gover); this.toast('Saved to Google Drive', 'good', '☁️'); } catch (e) { this.toast(e.message, 'bad'); }
      this.showSaves('drive');
    };
    for (const b of body.querySelectorAll('[data-gdel]')) b.onclick = async () => {
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Delete?'; return; }
      busy(b, '…');
      try { await drive.remove(b.dataset.gdel); } catch (e) { this.toast(e.message, 'bad'); }
      this.showSaves('drive');
    };
  }

  _fileTab(body, inGame) {
    const g = this.game;
    body.innerHTML = `<div class="note">Export your village as a <code>.json</code> file to back it up or move it to another computer.</div>
      <div class="actions">${inGame ? '<button class="btn primary" id="fExport">⬇ Export save file</button>' : ''}
      <label class="btn"><input type="file" id="fImport" accept=".json,application/json" hidden>⬆ Import save file</label></div>`;
    const ex = body.querySelector('#fExport');
    if (ex) ex.onclick = () => downloadJSON(serialize(g.world), saveFileName(g.world));
    body.querySelector('#fImport').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { g.loadData(await readJSONFile(f)); this.closeModal(); this.toast('Save imported', 'good', '📁'); } catch (err) { this.toast(err.message, 'bad'); }
    };
  }

  // -------------------------------------------------------------- budget
  showBudget() {
    const g = this.game, w = this.world, sim = g.sim;
    const b = sim.budget;
    const row = (k, v) => `<tr><td>${k}</td><td>${signed(v)}</td></tr>`;
    this.openModal(`<h2>Budget & statistics</h2><p class="lead">${esc(w.townName)} · ${titleFor(w.population).name} · day ${w.day}</p>
      <div class="field"><label>Tax rate: <b id="taxV">${w.taxRate}%</b> — higher taxes earn more but make villagers grumpy</label>
      <input type="range" id="tax" min="0" max="20" step="1" value="${w.taxRate}"></div>
      <div class="grid2">
        <div><h5 style="margin:6px 0">Income / day</h5><table class="budget" id="bIn"></table></div>
        <div><h5 style="margin:6px 0">Expenses / day</h5><table class="budget" id="bOut"></table></div>
      </div>
      <div class="note" style="margin-top:12px">Shop visits, fares and deliveries pay out live as villagers go about their day:
        <b>🪙 ${fmt(w.stats.todayVisitIncome)}</b> so far today, ${fmt(w.stats.visitIncome)} all time.</div>
      <div class="grid2" style="margin-top:12px">
        <div><h5 style="margin:6px 0">Population</h5><canvas class="chart" id="chPop" width="600" height="220"></canvas></div>
        <div><h5 style="margin:6px 0">Treasury</h5><canvas class="chart" id="chMoney" width="600" height="220"></canvas></div>
      </div>
      <div class="grid2" style="margin-top:8px;font-size:13px">
        <div class="row"><span>Arrived / left</span><b>${fmt(w.stats.arrivals)} / ${fmt(w.stats.departures)}</b></div>
        <div class="row"><span>Next title</span><b>${nextTitle(w.population)}</b></div>
      </div>`, (c) => {
      const fill = () => {
        const bb = sim.budget;
        c.querySelector('#bIn').innerHTML = row('🏠 Taxes', bb.income.taxes) + row('🛍️ Commerce', bb.income.commerce) + row('⚒️ Industry', bb.income.industry) + `<tr class="tot"><td>Total</td><td>${signed(bb.totalIn)}</td></tr>`;
        c.querySelector('#bOut').innerHTML = row('⛲ Services & transit stops', -bb.expense.services) + row('🏗️ Building upkeep', -bb.expense.buildings) + row('🛤️ Roads & track', -bb.expense.roads) + row('🚂 Transit vehicles', -bb.expense.transit) + `<tr class="tot"><td>Net</td><td style="color:${bb.net >= 0 ? 'var(--moss-d)' : 'var(--brick)'}">${signed(bb.net)}</td></tr>`;
      };
      fill();
      const tax = c.querySelector('#tax');
      tax.oninput = () => { w.taxRate = Number(tax.value); c.querySelector('#taxV').textContent = `${w.taxRate}%`; sim.recompute(); fill(); };
      const hist = w.history.concat([{ day: w.day, pop: w.population, money: Math.round(w.money) }]);
      drawChart(c.querySelector('#chPop'), hist.map(h => h.pop), '#5f8f4e');
      drawChart(c.querySelector("#chMoney"), hist.map(h => (Number.isFinite(h.money) ? h.money : 0)), "#d9a23b");
    });
    void b;
  }

  // --------------------------------------------------------------- lines
  showLines() {
    const g = this.game, w = this.world;
    const lines = w.lines;
    let h = `<h2>Transit lines</h2><p class="lead">Coaches run on roads between coach stops; trains run on track between stations. Villagers on long trips walk to a stop, wait, ride and pay a fare.</p>`;
    h += `<div class="actions" style="margin:0 0 12px"><button class="btn primary" id="nlCoach">🐴 New coach line</button><button class="btn primary" id="nlRail" ${w.unlockPop < 25 ? 'disabled title="Unlocks at 25 villagers"' : ''}>🚂 New rail line</button></div>`;
    if (!lines.length) h += `<div class="empty">No lines yet. Build at least two coach stops (Transit menu), then create a line.</div>`;
    h += `<div class="lines-list">${lines.map(l => {
      const st = g.transit.stats[l.id] || { riders: 0, fares: 0 };
      const cfg = TRANSIT[l.mode];
      return `<div class="line-item"><span class="dot" style="background:${l.color}"></span>
        <div><b>${esc(l.name)}</b> ${l.broken ? '<span class="chip no">Route broken</span>' : ''}<div class="m" style="font-size:12px;color:var(--ink-2);font-weight:700">${l.stops.length} stops · ${l.vehicles} ${l.mode === 'rail' ? 'train' : 'coach'}${l.vehicles > 1 ? (l.mode === 'rail' ? 's' : 'es') : ''} · ${fmt(st.riders)} riders · 🪙 ${fmt(st.fares)} fares · upkeep ${cfg.upkeep * l.vehicles}/day</div></div>
        <div class="inline"><button class="btn small" data-veh="${l.id}" data-d="-1">−</button><button class="btn small" data-veh="${l.id}" data-d="1" title="Add a vehicle (🪙 ${cfg.vehicleCost})">+</button><button class="btn small danger" data-ldel="${l.id}">✕</button></div></div>`;
    }).join('')}</div>`;
    this.openModal(h, (c) => {
      c.querySelector('#nlCoach').onclick = () => { this.closeModal(); this.openFlyout('transit'); g.input.setTool({ kind: 'line', mode: 'coach', stops: [] }); };
      c.querySelector('#nlRail').onclick = () => { this.closeModal(); this.openFlyout('transit'); g.input.setTool({ kind: 'line', mode: 'rail', stops: [] }); };
      for (const b of c.querySelectorAll('[data-veh]')) b.onclick = () => {
        const l = w.lines.find(x => x.id === Number(b.dataset.veh));
        const r = g.transit.setVehicles(l.id, l.vehicles + Number(b.dataset.d));
        if (r.reason) this.toast(r.reason, 'bad');
        this.showLines();
      };
      for (const b of c.querySelectorAll('[data-ldel]')) b.onclick = () => {
        if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Delete?'; return; }
        g.transit.deleteLine(Number(b.dataset.ldel)); this.showLines();
      };
    });
  }

  // ------------------------------------------------------- settings/help
  showSettings() {
    const g = this.game;
    const s = g.settings;
    this.openModal(`<h2>Settings</h2>
      <div class="field"><label class="inline"><input type="checkbox" id="stShadow" ${s.shadows ? 'checked' : ''}> Soft shadows (turn off on slower computers)</label></div>
      <div class="field"><label class="inline"><input type="checkbox" id="stAO" ${s.ao ? 'checked' : ''}> Ambient occlusion (soft contact shadows)</label></div>
      <div class="field"><label class="inline"><input type="checkbox" id="stAuto" ${s.autosave ? 'checked' : ''}> Autosave every in-game day</label></div>
      <div class="field"><label class="inline"><input type="checkbox" id="stSound" ${s.sound ? 'checked' : ''}> Sound effects</label></div>
      <div class="field"><label class="inline"><input type="checkbox" id="stPix" ${s.pixelArt ? 'checked' : ''}> Pixel-art rendering</label></div>
      <div class="field"><label>Pixel size</label><select id="stPixSize">${[1, 2, 3, 4].map(n => `<option value="${n}" ${s.pixelSize === n ? 'selected' : ''}>${n}× (${['finest', 'classic', 'chunky', 'retro'][n - 1]})</option>`).join('')}</select></div>
      ${g.world && !g.demo ? `<div class="field"><label class="inline"><input type="checkbox" id="stInf" ${g.world.sandbox.infiniteMoney ? 'checked' : ''}> Sandbox: unlimited coins (this town)</label></div>
      <div class="field"><label class="inline"><input type="checkbox" id="stAll" ${g.world.sandbox.unlockAll ? 'checked' : ''}> Sandbox: unlock every building (this town)</label></div>` : ''}
      <div class="field"><label>Google OAuth Client ID (for Drive saves)</label><input id="stGcid" value="${esc(g.drive.clientId)}" placeholder="Not set"></div>
      <div class="actions"><button class="btn primary" id="stOk">Done</button><button class="btn" id="stMenu">Quit to title</button></div>`, (c) => {
      c.querySelector('#stOk').onclick = () => {
        s.shadows = c.querySelector('#stShadow').checked;
        s.ao = c.querySelector('#stAO').checked;
        s.pixelArt = c.querySelector('#stPix').checked;
        s.pixelSize = Number(c.querySelector('#stPixSize').value);
        const inf = c.querySelector('#stInf'), all = c.querySelector('#stAll');
        if (inf && all) { g.world.setSandbox({ infiniteMoney: inf.checked, unlockAll: all.checked }); g.sim.recompute(); if (this.category) this.openFlyout(this.category); }
        s.autosave = c.querySelector('#stAuto').checked;
        s.sound = c.querySelector('#stSound').checked;
        const id = c.querySelector('#stGcid').value.trim();
        if (id !== g.drive.clientId) g.drive.setClientId(id);
        g.applySettings();
        this.closeModal();
      };
      c.querySelector('#stMenu').onclick = () => { this.closeModal(); g.toTitle(); };
    });
  }

  showHelp() {
    const k = (s) => `<span class="kbd">${s}</span>`;
    this.openModal(`<h2>How to play</h2><p class="lead">Grow a cozy village: lay roads, build homes, give villagers work, services and pretty places — and watch them go about their day.</p>
      <div class="grid2"><div class="help-grid">
        ${k('Drag')}<span>Pan (right / middle mouse, or left-drag with Select)</span>
        ${k('Wheel')}<span>Zoom in & out</span>
        ${k('W A S D')}<span>Pan the camera</span>
        ${k('T')}<span>Toggle 2D top-down / isometric</span>
        ${k('1')}–${k('8')}<span>Tool menus · ${k('R')} roads · ${k('X')} demolish</span>
        ${k('Tab')}<span>Flip a building's entrance</span>
        ${k('Space')}<span>Pause · ${k('[')} ${k(']')} slower / faster (up to 32×)</span>
        ${k('O')}<span>Overlays · ${k('B')} budget · ${k('L')} lines</span>
        ${k('Esc')}<span>Cancel / close</span>
      </div><div style="font-size:13px;line-height:1.5">
        <b>Getting started</b><br>
        1. Build 🏡 cottages along the road — families move in from the edge of the map.<br>
        2. Give them work: 🧺 markets, 🌾 farms, 🪓 woodcutters, 🐟 fisheries.<br>
        3. Cover homes with 💧 water, 🩺 health, 📚 schools and 🛡️ safety, and add 🌷 gardens. Happy homes can be upgraded.<br>
        4. Watch the RCI bars to see what's in demand.<br>
        5. When the town grows, link 🚏 coach stops into lines, or lay 🛤️ track between 🚉 stations.<br>
        6. Save to this browser, a file, or Google Drive from 💾.
      </div></div>`);
  }
}

function toolKey(t) {
  switch (t.kind) {
    case 'road': return `road:${t.level}`;
    case 'build': return `build:${t.type}`;
    case 'terrain': return `terrain:${t.mode}`;
    case 'trees': return 'trees';
    case 'rail': return 'rail';
    case 'line': return `line:${t.mode}`;
    default: return '';
  }
}

function ageIcon(r) { return r.age === 'child' ? '🧒' : r.age === 'elder' ? '🧓' : '🧑'; }

function nextTitle(pop) {
  for (const t of TITLES) if (t.pop > pop) return `${t.name} at ${t.pop}`;
  return 'Top title reached';
}

function drawChart(cv, values, color) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (values.length < 2) { g.fillStyle = '#9a8a76'; g.font = 'bold 22px Nunito'; g.fillText('Not enough history yet', 24, H / 2); return; }
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const x = (i) => 16 + (i / (values.length - 1)) * (W - 32);
  const y = (v) => H - 18 - ((v - min) / (max - min || 1)) * (H - 40);
  g.strokeStyle = '#e2d4b6'; g.lineWidth = 1;
  for (let k = 0; k <= 3; k++) { const yy = 18 + (k * (H - 36)) / 3; g.beginPath(); g.moveTo(10, yy); g.lineTo(W - 10, yy); g.stroke(); }
  g.beginPath();
  values.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.lineTo(x(values.length - 1), H - 18); g.lineTo(x(0), H - 18); g.closePath();
  g.fillStyle = color + '33'; g.fill();
  g.beginPath();
  values.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.strokeStyle = color; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = '#6e5b4a'; g.font = 'bold 20px Nunito';
  g.fillText(fmt(values[values.length - 1]), W - 16 - g.measureText(fmt(values[values.length - 1])).width, 26);
}
