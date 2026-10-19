// The road selection tool's panel: what is picked, what upgrading,
// downgrading or taking it up would cost or pay back, what can't change and
// why, and who would be cut off; dressing the street with trees, hedges,
// lamps or a planted median (world/roadDress.js); and a boulevard's look
// (world/boulevard.js). The picking itself (clicks, drags, Shift,
// Backspace, Tab) is in input.js; the rules are in world/roadEdit.js.

import { ROAD_LEVELS, DRESSINGS, streetPart, lookPart } from '../config.js';
import { BUILDINGS } from '../defs.js';
import { planRoadEdit } from '../world/roadEdit.js';
import { planDress } from '../world/roadDress.js';
import { boulevardTiles } from '../world/boulevard.js';
import { fmt } from './ui.js';

const isLook = (k) => !!(DRESSINGS[k] && DRESSINGS[k].blvd);

// What a dressing action in the panel does: 'dress:<kind>' dresses every
// picked tile (a look goes on the boulevards' medians, a dressing on the
// streets' verges); 'dress:0:look' takes the boulevards' looks away,
// 'dress:0:street' the streets' dressings. { kind, look, tiles }
export function dressOp(w, list, op) {
  const [, k, only] = op.split(':'), kind = Number(k);
  return { kind, look: only === 'look' || isLook(kind), tiles: list };
}

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
  let bridges = 0, lanes = 0;
  for (const [x, z] of list) {
    const v = w.dress[w.idx(x, z)];
    count[w.roadAt(x, z)]++; dressed[streetPart(v)]++; dressed[lookPart(v)]++;
    if (w.terrain.isWater(x, z)) bridges++;
    if (w.blvd[w.idx(x, z)]) lanes++;
  }
  h += `<div class="chips">${[1, 2, 3].filter(L => count[L]).map(L => `<span class="chip">${count[L]} × ${esc(ROAD_LEVELS[L].name)}</span>`).join('')}${bridges ? `<span class="chip">${plural(bridges, 'bridge tile')}</span>` : ''}${lanes ? `<span class="chip">${ms('add_road')} ${lanes} × boulevard lane</span>` : ''}${DRESSINGS.map((D, k) => (D && dressed[k] ? `<span class="chip">${ms(D.icon)} ${dressed[k]} × ${esc(D.name)}</span>` : '')).join('')}</div>`;
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
    if (rm.unlooked) info.push(`${plural(rm.unlooked, 'boulevard tile')} beside them would be a plain street again, and lose ${rm.unlooked === 1 ? 'its' : 'their'} look (a quarter of its price back)`);
    if (warn.length || info.length) {
      h += `<div class="sec"><h5>Taking these up</h5><div class="req">${warn.map(s => `<div class="no warn">${s}</div>`).join('')}${info.map(s => `<div class="no">${s}</div>`).join('')}</div>`;
      if (confirm) h += '<div class="note">Click <b>Take up anyway</b> again to go ahead.</div>';
      h += '</div>';
    }
  }
  // dressing the street: one price per tile, a quarter back for what it
  // replaces; and a boulevard's look, when boulevards are picked
  const dressing = (kinds, plain, plainTip) => {
    const dl = [];
    let dh = '<div class="actions">', back = 0;
    for (const k of kinds) {
      const D = DRESSINGS[k], p = planDress(w, list, k), net = p.cost - p.refund;
      dh += btn(`dress:${k}`, esc(D.name), D.icon, '', p, `$${fmt(net)}`, `${D.desc} · $${D.cost} a tile, upkeep ${D.upkeep}/day · homes and shops beside it like it`);
      if (!p.n && p.blocked.length) dl.push(`<div class="no">${esc(D.name)}: ${esc(p.blocked[0].reason)}</div>`);
      else for (const b of p.blocked) dl.push(`<div class="no">${esc(D.name)} skips ${plural(b.n, 'tile')}: ${esc(b.reason)}</div>`);
      if (p.back.length) back = Math.max(back, p.back.length);
      if (p.short && p.n) dl.push(`<div class="no">${esc(D.name)} needs $${fmt(net)}, you have $${fmt(w.money)}</div>`);
    }
    const op = `dress:0:${plain}`, bare = planDress(w, list, 0, plain === 'look');
    if (bare.n) dh += btn(op, plain === 'look' ? 'Grass' : 'Plain', 'block', '', bare, `+$${fmt(bare.refund)}`, plainTip);
    return { html: dh + '</div>', notes: dl, back };
  };
  const kinds = DRESSINGS.map((D, k) => k).filter(k => DRESSINGS[k]);
  const street = dressing(kinds.filter(k => !isLook(k)), 'street', 'Take the dressing away (a quarter of its price back)');
  if (lanes || dressed.some((n, k) => n && isLook(k))) {
    const look = dressing(kinds.filter(isLook), 'look', 'Back to a grass median (a quarter of its price back)');
    h += `<div class="sec"><h5>Boulevard look</h5>${look.html}<div class="req"><div class="ok">Roads laid side by side make a boulevard: a lane each way with a median between them${lanes ? ` (${plural(lanes, 'lane tile')} picked)` : ''}</div>${look.notes.join('')}</div></div>`;
  }
  h += `<div class="sec"><h5>Dress the street</h5>${street.html}<div class="req"><div class="ok">Junctions, bends and driveways are left open${lanes ? '; on a boulevard, the lanes’ outer verges' : ''}</div>${street.back ? `<div class="ok">Trees and hedges: ${plural(street.back, 'building')} standing forward into the street would step back behind them</div>` : ''}${street.notes.join('')}</div></div>`;
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

// A boulevard lane's part of the road panel: its look, and a button for each
// look that dresses the whole boulevard between its junctions (the price for
// all of it), with why one can't be had.
export function boulevardHTML(game, x, z) {
  const w = game.world, all = boulevardTiles(w, x, z), cur = DRESSINGS[lookPart(w.dress[w.idx(x, z)])];
  let h = `<div class="sec"><h5>Boulevard</h5><div class="note">Two roads side by side: a lane each way with a median between them${cur && cur.blvd ? `, ${esc(cur.name.toLowerCase())}` : ', a grass median'}. A look covers the whole boulevard between its junctions (${plural(all.length, 'lane tile')}).</div><div class="actions">`;
  const notes = [];
  for (let k = 1; k < DRESSINGS.length; k++) {
    const D = DRESSINGS[k];
    if (!D.blvd) continue;
    const p = planDress(w, all, k), net = p.cost - p.refund, on = cur === D;
    const why = p.short || (p.n ? '' : (p.blocked[0] && p.blocked[0].reason) || '');
    h += `<button class="btn${on ? ' gold' : ''}" data-act="blvdlook" data-kind="${k}" ${p.n && !p.short ? '' : 'disabled'} title="${esc(why || `${D.desc} · $${D.cost} a tile, upkeep ${D.upkeep}/day`)}">${ms(D.icon)} ${esc(D.name)}${p.n ? ` · $${fmt(net)}` : ''}</button>`;
    if (!on && why && !/^Already/.test(why)) notes.push(`<div class="no">${esc(D.name)}: ${esc(why)}</div>`);
  }
  const bare = planDress(w, all, 0, true);
  if (bare.n) h += `<button class="btn" data-act="blvdlook" data-kind="0" title="Back to a grass median (a quarter of its price back)">${ms('block')} Grass · +$${fmt(bare.refund)}</button>`;
  h += `</div>${notes.length ? `<div class="req">${notes.join('')}</div>` : ''}</div>`;
  return h;
}

// Dress these tiles with `kind` through the command (so guests do it the same
// way) and say how it went. look: taking a boulevard's look away (back to grass).
export function dressAct(ui, kind, tiles, look, done = null) {
  const g = ui.game, D = DRESSINGS[kind];
  g.cmd({ t: 'dress', kind, tiles, look: !!look }, (r) => {
    if (!r.ok) { ui.toast(r.reason || "Those streets can't be dressed", 'bad'); ui.renderInspector(true); return; }
    g.sfx('build');
    const money = r.spent ? ` · $${fmt(r.spent - (r.refund || 0))}` : r.refund ? ` · $${fmt(r.refund)} back` : '';
    const what = D ? `${D.name} along ${plural(r.n, 'tile')}` : look ? `A grass median again along ${plural(r.n, 'tile')}` : `Took the dressing off ${plural(r.n, 'tile')}`;
    ui.toast(`${what}${money}${r.skipped ? ` · ${r.skipped} left as ${r.skipped === 1 ? 'it was' : 'they were'}` : ''}`, 'good', '🌳');
    if (done) done();
  });
}

export function roadSelAct(ui, data) {
  const g = ui.game, w = g.world, input = g.input, t = input.tool;
  if (t.kind !== 'roadsel') return;
  const op = data.op;
  if (op === 'clear') { input.pickRoads([], false); return; }
  const list = selTiles(w, t);
  if (!list.length) return;
  if (op.startsWith('dress:')) {
    const { kind, look, tiles } = dressOp(w, list, op);
    dressAct(ui, kind, tiles, look, () => { if (input.tool === t) ui.inspect({ kind: 'roadsel' }); });
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
