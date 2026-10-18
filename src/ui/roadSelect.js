// The road selection tool's panel: what is picked, what upgrading,
// downgrading or taking it up would cost or pay back, what can't change and
// why, and who would be cut off; and dressing the street with trees,
// hedges, lamps or a planted median (world/roadDress.js). The picking itself (clicks, drags, Shift,
// Backspace, Tab) is in input.js; the rules are in world/roadEdit.js.

import { ROAD_LEVELS, DRESSINGS } from '../config.js';
import { BUILDINGS } from '../defs.js';
import { planRoadEdit } from '../world/roadEdit.js';
import { planDress } from '../world/roadDress.js';
import { fmt } from './ui.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (name) => `<span class="ms">${name}</span>`;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// A fresh road selection tool, optionally with tiles already picked.
export function roadSelTool(tiles = [], N = 0) {
  return { kind: 'roadsel', sel: new Set(tiles.map(([x, z]) => z * N + x)), hist: [], box: true, action: null, confirm: null };
}

// The picked tiles that are still road, as [x, z] pairs.
export function selTiles(w, t) {
  const out = [];
  for (const k of t.sel) if (w.roads[k]) out.push([k % w.N, (k / w.N) | 0]);
  return out;
}

const nameOf = (w, id) => { const b = w.buildings.get(id); return b ? BUILDINGS[b.type].levels[b.level].name : '?'; };
function names(w, ids, max = 3) {
  const list = ids.slice(0, max).map(id => esc(nameOf(w, id)));
  return list.join(', ') + (ids.length > max ? ` and ${ids.length - max} more` : '');
}

// The plans for all three actions (taking up also checks the coach lines).
export function selPlans(game) {
  const w = game.world, list = selTiles(w, game.input.tool);
  return {
    list,
    up: planRoadEdit(w, list, 'up'),
    down: planRoadEdit(w, list, 'down'),
    remove: planRoadEdit(w, list, 'remove', { paths: game.paths }),
  };
}

// Anything that needs a second click before the roads are taken up.
const risky = (p) => p.lost.length + p.cut.length + p.lines.length > 0;

export function roadSelHTML(game) {
  const w = game.world, t = game.input.tool;
  if (t.kind !== 'roadsel') return null;
  const P = selPlans(game), list = P.list;
  let h = `<div class="head"><div class="big">${ms('highlight_alt')}</div><div><h3>Road selection</h3><div class="sub">${list.length ? plural(list.length, 'road tile') : 'Nothing picked yet'}</div></div></div>`;
  if (!list.length) {
    h += `<div class="note">Click a road to pick the stretch between junctions, Shift-click to add more stretches, or drag to pick every road in a ${t.box ? 'box' : 'line'} (Tab switches to a ${t.box ? 'line' : 'box'}). Works in the 2D map too.</div>`;
    return h;
  }
  const count = [0, 0, 0, 0], dressed = DRESSINGS.map(() => 0);
  let bridges = 0;
  for (const [x, z] of list) { count[w.roadAt(x, z)]++; dressed[w.dress[w.idx(x, z)]]++; if (w.terrain.isWater(x, z)) bridges++; }
  h += `<div class="chips">${[1, 2, 3].filter(L => count[L]).map(L => `<span class="chip">${count[L]} × ${esc(ROAD_LEVELS[L].name)}</span>`).join('')}${bridges ? `<span class="chip">${plural(bridges, 'bridge tile')}</span>` : ''}${DRESSINGS.map((D, k) => (D && dressed[k] ? `<span class="chip">${ms(D.icon)} ${dressed[k]} × ${esc(D.name)}</span>` : '')).join('')}</div>`;
  const btn = (op, label, icon, cls, p, price, tip = '') => {
    const why = p.short || (p.n ? tip : (p.blocked[0] && p.blocked[0].reason) || '');
    return `<span class="rsel-op" data-op="${op}"><button class="btn ${cls}" data-act="rsel" data-op="${op}" ${p.n && !p.short ? '' : 'disabled'} title="${esc(why)}">${ms(icon)} ${label} · ${price}</button></span>`;
  };
  const up = P.up, down = P.down, rm = P.remove;
  const confirm = t.confirm === 'remove' && risky(rm);
  h += '<div class="actions">'
    + btn('up', 'Upgrade', 'arrow_upward', 'primary', up, `$${fmt(up.cost)}`)
    + btn('down', 'Downgrade', 'arrow_downward', '', down, `+$${fmt(down.refund)}`)
    + btn('remove', confirm ? 'Take up anyway' : 'Take up', 'delete', confirm ? 'danger primary' : 'danger', rm, `+$${fmt(rm.refund)}`)
    + '</div>';
  // what each action would do, and what it would leave alone
  const lines = [];
  const skip = (p, verb) => { for (const b of p.blocked) lines.push(`<div class="no">${verb} skips ${plural(b.n, 'tile')}: ${esc(b.reason)}</div>`); };
  if (up.n) lines.push(`<div class="ok">Upgrade: each tile one level up (${plural(up.n, 'tile')}${up.bridges ? `, ${plural(up.bridges, 'bridge tile')} at bridge prices` : ''})</div>`);
  if (up.short && up.n) lines.push(`<div class="no">Upgrade needs $${fmt(up.cost)}, you have $${fmt(w.money)}</div>`);
  skip(up, 'Upgrade');
  if (down.n) lines.push(`<div class="ok">Downgrade: each tile one level down, a quarter of the difference back</div>`);
  skip(down, 'Downgrade');
  if (down.undressed) lines.push(`<div class="no">Downgrading takes the planted median off ${plural(down.undressed, 'tile')} (a quarter of its price back)</div>`);
  skip(rm, 'Taking up');
  h += `<div class="req">${lines.join('')}</div>`;
  if (rm.n) {
    const warn = [], info = [];
    if (rm.lost.length) warn.push(`${plural(rm.lost.length, 'building')} would lose ${rm.lost.length === 1 ? 'its' : 'their'} road: ${names(w, rm.lost)}`);
    if (rm.cut.length) warn.push(`${plural(rm.cut.length, 'building')} would be cut off from the way out of town: ${names(w, rm.cut)}`);
    for (const id of rm.lines) { const l = w.lines.find(x => x.id === id); if (l) warn.push(`${esc(l.name)} would have no route between its stops`); }
    for (const id of rm.detour) { const l = w.lines.find(x => x.id === id); if (l) info.push(`${esc(l.name)} runs along here and would take a detour`); }
    if (rm.back.length) info.push(`${plural(rm.back.length, 'building')} standing forward into the street would step back`);
    if (rm.bridges) info.push(`Includes ${plural(rm.bridges, 'bridge tile')}`);
    if (rm.undressed) info.push(`Their trees, hedges, lamps or medians go too (a quarter of their price back)`);
    if (warn.length || info.length) {
      h += `<div class="sec"><h5>Taking these up</h5><div class="req">${warn.map(s => `<div class="no warn">${s}</div>`).join('')}${info.map(s => `<div class="no">${s}</div>`).join('')}</div>`;
      if (confirm) h += '<div class="note">Click <b>Take up anyway</b> again to go ahead.</div>';
      h += '</div>';
    }
  }
  // dressing the street: one price per tile, a quarter back for what it replaces
  const dl = [];
  let dh = '<div class="actions">';
  for (let k = 1; k < DRESSINGS.length; k++) {
    const D = DRESSINGS[k], p = planDress(w, list, k), net = p.cost - p.refund;
    dh += btn(`dress:${k}`, esc(D.name), D.icon, '', p, `$${fmt(net)}`, `${D.desc} · $${D.cost} a tile, upkeep ${D.upkeep}/day · homes and shops beside it like it`);
    if (!p.n && p.blocked.length) dl.push(`<div class="no">${esc(D.name)}: ${esc(p.blocked[0].reason)}</div>`);
    else for (const b of p.blocked) dl.push(`<div class="no">${esc(D.name)} skips ${plural(b.n, 'tile')}: ${esc(b.reason)}</div>`);
    if (p.short && p.n) dl.push(`<div class="no">${esc(D.name)} needs $${fmt(net)}, you have $${fmt(w.money)}</div>`);
  }
  const bare = planDress(w, list, 0);
  if (bare.n) dh += btn('dress:0', 'Plain', 'block', '', bare, `+$${fmt(bare.refund)}`, 'Take the dressing away (a quarter of its price back)');
  dh += '</div>';
  h += `<div class="sec"><h5>Dress the street</h5>${dh}<div class="req"><div class="ok">Junctions, bends and driveways are left open</div>${dl.join('')}</div></div>`;
  h += `<div class="actions"><button class="btn" data-act="rsel" data-op="clear">${ms('deselect')} Clear</button></div>`;
  return h;
}

// Hovering an action shows on the map which tiles it would change (green),
// which it would leave alone (red), and who it would cut off.
export function bindRoadSel(ui, el) {
  const input = ui.game.input;
  let over = null;
  for (const s of el.querySelectorAll('.rsel-op')) {
    s.onmouseenter = () => { if (input.tool.kind === 'roadsel') { input.tool.action = s.dataset.op; input.refresh(); } };
    s.onmouseleave = () => { if (input.tool.kind === 'roadsel') { input.tool.action = null; input.refresh(); } };
    if (s.matches(':hover')) over = s.dataset.op;
  }
  // the panel was just redrawn: preview only what the pointer is really over
  if (input.tool.kind === 'roadsel' && input.tool.action !== over) { input.tool.action = over; input.refresh(); }
}

export function roadSelAct(ui, data) {
  const g = ui.game, w = g.world, input = g.input, t = input.tool;
  if (t.kind !== 'roadsel') return;
  const op = data.op;
  if (op === 'clear') { input.pickRoads([], false); return; }
  const list = selTiles(w, t);
  if (!list.length) return;
  if (op.startsWith('dress:')) {
    const kind = Number(op.slice(6)), D = DRESSINGS[kind];
    g.cmd({ t: 'dress', kind, tiles: list }, (r) => {
      if (!r.ok) { ui.toast(r.reason || "Those streets can't be dressed", 'bad'); ui.renderInspector(true); return; }
      g.sfx('build');
      const money = r.spent ? ` · $${fmt(r.spent - (r.refund || 0))}` : r.refund ? ` · $${fmt(r.refund)} back` : '';
      ui.toast(`${D ? `${D.name} along ${plural(r.n, 'tile')}` : `Took the dressing off ${plural(r.n, 'tile')}`}${money}${r.skipped ? ` · ${r.skipped} left as ${r.skipped === 1 ? 'it was' : 'they were'}` : ''}`, 'good', '🌳');
      if (input.tool === t) ui.inspect({ kind: 'roadsel' });
    });
    return;
  }
  // cutting anything off takes a second click
  if (op === 'remove' && t.confirm !== 'remove' && risky(planRoadEdit(w, list, 'remove'))) {
    t.confirm = 'remove';
    ui.renderInspector(true);
    return;
  }
  t.confirm = null;
  g.cmd({ t: 'roadedit', op, tiles: list }, (r) => {
    if (!r.ok) { ui.toast(r.reason || "Those roads can't be changed", 'bad'); ui.renderInspector(true); return; }
    g.sfx(op === 'remove' ? 'demolish' : op === 'up' ? 'upgrade' : 'build');
    const what = op === 'up' ? 'Upgraded' : op === 'down' ? 'Downgraded' : 'Took up';
    const money = r.spent ? ` · $${fmt(r.spent)}` : r.refund ? ` · $${fmt(r.refund)} back` : '';
    ui.toast(`${what} ${plural(r.n, 'road tile')}${money}${r.skipped ? ` · ${r.skipped} left as ${r.skipped === 1 ? 'it was' : 'they were'}` : ''}`, 'good', op === 'remove' ? '🚜' : '🛤️');
    if (input.tool === t) {
      for (const k of [...t.sel]) if (!w.roads[k]) t.sel.delete(k);
      ui.inspect({ kind: 'roadsel' });
    }
  });
}
