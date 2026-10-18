// Everything a building can become, laid out like the research tree: one
// column per step away from it (now, next, then, later), a card for each
// building it can lead to (shown once, wherever it is nearest), and lines
// from each to what it leads to: other paths at its top level, side paths,
// the next stage of schooling, rebuilds on a double plot or a 2×2 estate,
// and joins with a neighbour. Each card says how it is reached, shows its
// levels (where this building stands now is marked) and what is still locked.

import { BUILDINGS, TECHS, MERGES, LARGE, ESTATE, unlockOf, techForLevel } from '../defs.js';
import { thumb } from './thumbs.js';
import { showBuildingGuide } from './guide.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLE = 'Upgrades &amp; joins';
const COLS = ['Now', 'Next', 'Then', 'Later', 'Further on', 'Further still'];
const lower = (t) => BUILDINGS[t].levels[0].name.toLowerCase();
const list = (types) => {
  const names = [...new Set(types.map(lower))];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
};
const joinable = (type) => BUILDINGS[type].size === 1 && !BUILDINGS[type].merged;

// How one building leads to another: icon, short label, line colour.
const KIND = {
  branch: { icon: 'alt_route', col: '#1f4e9c', name: 'Another path at the top level' },
  side: { icon: 'call_split', col: '#1f4e9c', name: 'A side path from one of its levels' },
  stage: { icon: 'school', col: '#1f4e9c', name: 'The next stage of schooling' },
  plot: { icon: 'open_in_full', col: '#8a5a1e', name: 'Take the plot next door, then rebuild' },
  estate: { icon: 'select_all', col: '#7a3d8f', name: 'Take two more plots (2×2 estate, Great Plots), then rebuild' },
  join: { icon: 'link', col: '#1e7a6e', name: 'Join with a neighbour' },
};

// Where one type can lead: [{ kind, label, type }]
function nextOf(type) {
  const def = BUILDINGS[type], out = [];
  for (const t of def.branches || []) out.push({ kind: 'branch', label: `after the ${def.levels[def.levels.length - 1].name}`, type: t });
  for (const [lv, ts] of Object.entries(def.paths || {})) for (const t of ts) out.push({ kind: 'side', label: `from the ${def.levels[lv].name}`, type: t });
  for (const t of def.stageNext || []) out.push({ kind: 'stage', label: 'next stage', type: t });
  for (const t of LARGE[type] || []) out.push({ kind: 'plot', label: 'double plot', type: t });
  for (const t of ESTATE[type] || []) out.push({ kind: 'estate', label: '2×2 estate', type: t });
  if (joinable(type)) {
    for (const m of MERGES) {
      const other = m.a.includes(type) ? m.b : m.b.includes(type) ? m.a : null;
      if (other) out.push({ kind: 'join', label: `+ ${list(other)}`, type: m.to });
    }
  }
  return out;
}

// Every building reachable from this one, each at its nearest step, and the
// links that lead forward (back and sideways links are left out).
function graph(root) {
  const depth = new Map([[root, 0]]), order = [root], edges = [];
  for (let i = 0; i < order.length; i++) {
    const t = order[i];
    for (const k of nextOf(t)) {
      if (!depth.has(k.type)) { depth.set(k.type, depth.get(t) + 1); order.push(k.type); }
      if (depth.get(k.type) > depth.get(t) && !edges.some(e => e.from === t && e.to === k.type && e.kind === k.kind)) edges.push({ from: t, ...k, to: k.type });
    }
  }
  // columns, each ordered by where its parents sit, so the lines cross little
  const cols = [];
  for (const t of order) (cols[depth.get(t)] ||= []).push(t);
  for (let d = 1; d < cols.length; d++) {
    const rank = new Map(cols[d - 1].map((t, i) => [t, i]));
    const score = (t) => {
      const ps = edges.filter(e => e.to === t && rank.has(e.from)).map(e => rank.get(e.from));
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 1e3;
    };
    cols[d].sort((a, b) => score(a) - score(b) || order.indexOf(a) - order.indexOf(b));
  }
  return { cols, edges };
}

// What a level still needs, if anything ('' when open).
function needOf(world, type, level) {
  const tech = techForLevel(type, level), pop = unlockOf(type, level), need = [];
  if (tech && !world.hasTech(tech)) need.push(`Research ${TECHS[tech].name}`);
  if (pop && world.unlockPop < pop) need.push(`${pop} villagers`);
  return need.join(' · ');
}

function cardHTML(world, type, at, how) {
  const def = BUILDINGS[type], here = at && at.type === type;
  let before = '', locked0 = false;   // a locked level locks every level after it
  const lvls = def.levels.map((L, i) => {
    const own = needOf(world, type, i), lock = own || (before && `After the ${before}`);
    if (lock && !before) before = L.name;
    if (i === 0 && lock) locked0 = true;
    const state = here ? (i < at.level ? 'done' : i === at.level ? 'now' : '') : '';
    const tip = state === 'now' ? 'This building now' : state === 'done' ? 'Already built' : lock || 'Open to build';
    return `<span class="pm-lv ${state} ${lock && !state ? 'locked' : ''}" title="${esc(tip)}">${lock && !state ? '<span class="ms">lock</span>' : ''}${esc(L.name)} <small>$${L.cost}</small></span>`;
  }).join('');
  let h = `<div class="pm-card${here ? ' here' : ''}${locked0 && !here ? ' locked' : ''}" data-node="${type}" title="Open the building guide">`;
  if (how.length) h += `<div class="pm-how">${how.map(e => `<span style="--k:${KIND[e.kind].col}" title="${esc(KIND[e.kind].name)}"><span class="ms">${KIND[e.kind].icon}</span>${esc(e.label)}</span>`).join('')}</div>`;
  h += `<div class="pm-top"><img src="${thumb(type, here ? at.level : 0)}" alt=""><b>${esc(def.name)}</b></div><div class="pm-lvls">${lvls}</div></div>`;
  return h;
}

// b: a building in town (where it stands is marked), or just a type (the guide).
export function showPathMap(ui, b, type = b && b.type) {
  const world = ui.world, def = BUILDINGS[type];
  const at = b ? { type: b.type, level: b.level } : null;
  const { cols, edges } = graph(type);
  const how = (t) => edges.filter(e => e.to === t);
  let h = `<h2>${TITLE}</h2><p class="lead">Everything ${b ? `this ${esc(def.levels[b.level].name.toLowerCase())}` : `a ${esc(lower(type))}`} can become, one step per column. Click a building for its guide.</p>`;
  h += `<div class="pm-legend">${Object.values(KIND).map(k => `<span style="--k:${k.col}"><span class="ms">${k.icon}</span>${esc(k.name)}</span>`).join('')}<span class="pm-lk"><span class="ms">lock</span>Locked: hover for what it needs</span></div>`;
  if (cols.length === 1) h += '<div class="note">It has no other paths: only its own levels.</div>';
  else if (LARGE[type] || ESTATE[type]) h += '<div class="note">Taking land next door also lets it be <b>extended</b> as it is, to hold 50% more.</div>';
  h += `<div class="pm-wrap"><div class="pm-grid" style="grid-template-columns: repeat(${cols.length}, minmax(200px, 260px))"><svg class="pm-links"></svg>`;
  cols.forEach((col, d) => {
    h += `<div class="pm-col"><div class="pm-colhead">${COLS[Math.min(d, COLS.length - 1)]}</div>${col.map(t => cardHTML(world, t, at, d ? how(t) : [])).join('')}</div>`;
  });
  h += '</div></div>';
  ui.openModal(h, (c) => {
    c.classList.add('wide', 'pm-win');
    const grid = c.querySelector('.pm-grid'), svg = c.querySelector('.pm-links');
    const draw = () => {
      if (!grid.isConnected) return;
      const box = grid.getBoundingClientRect();
      svg.setAttribute('width', grid.scrollWidth); svg.setAttribute('height', grid.scrollHeight);
      const at = (t) => { const r = grid.querySelector(`[data-node="${t}"]`).getBoundingClientRect(); return { l: r.left - box.left, r: r.right - box.left, y: r.top - box.top + Math.min(r.height / 2, 34) }; };
      let p = '';
      for (const e of edges) {
        const a = at(e.from), z = at(e.to), mx = (a.r + z.l) / 2;
        const dim = grid.querySelector(`[data-node="${e.to}"]`).classList.contains('locked');
        p += `<path d="M${a.r} ${a.y} C${mx} ${a.y} ${mx} ${z.y} ${z.l} ${z.y}" stroke="${KIND[e.kind].col}" stroke-width="2" fill="none" opacity="${dim ? 0.45 : 0.85}" ${dim ? 'stroke-dasharray="4 3"' : ''}/>`;
      }
      svg.innerHTML = p;
    };
    requestAnimationFrame(draw);
    // pictures arrive a moment later and can change the cards' heights
    for (const img of c.querySelectorAll('.pm-card img')) img.addEventListener('load', () => requestAnimationFrame(draw), { once: true });
    for (const el of c.querySelectorAll('[data-node]')) el.onclick = () => showBuildingGuide(ui, el.dataset.node);
  });
}
