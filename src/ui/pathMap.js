// Everything a building can become, as a tech tree: one row for each
// building it can lead to, its levels as nodes left to right, and a line
// from the exact level each path opens at (another path after the top
// level, a side path from one level) or, for what any level can do (the
// next stage of schooling, a rebuild on a double plot or a 2×2 estate, a
// join with a neighbour), from the start of its row. Rows say how they are
// reached; where this building stands now is marked, and so is what is
// still locked.

import { BUILDINGS, TECHS, MERGES, LARGE, ESTATE, unlockOf, techForLevel } from '../defs.js';
import { thumb } from './thumbs.js';
import { showBuildingGuide } from './guide.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLE = 'Upgrades &amp; joins';
const lower = (t) => BUILDINGS[t].levels[0].name.toLowerCase();
const list = (types) => {
  const names = [...new Set(types.map(lower))];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
};
const joinable = (type) => BUILDINGS[type].size === 1 && !BUILDINGS[type].merged;

// How one building leads to another: icon, line colour and key text.
const KIND = {
  branch: { icon: 'alt_route', col: '#1f4e9c', name: 'Another path, after the top level' },
  side: { icon: 'call_split', col: '#1f4e9c', name: 'A side path, from one level' },
  stage: { icon: 'school', col: '#1f4e9c', name: 'The next stage of schooling' },
  plot: { icon: 'open_in_full', col: '#8a5a1e', name: 'Take the plot next door, then rebuild' },
  estate: { icon: 'select_all', col: '#7a3d8f', name: 'Take two more plots (a 2×2 estate), then rebuild' },
  join: { icon: 'link', col: '#1e7a6e', name: 'Join with a neighbour' },
};
const ORDER = ['branch', 'side', 'stage', 'plot', 'estate', 'join'];

// Where one type can lead: [{ kind, at (the level it opens from), any (any
// level can), label, type }]
function nextOf(type) {
  const def = BUILDINGS[type], top = def.levels.length - 1, out = [];
  for (const t of def.branches || []) out.push({ kind: 'branch', at: top, label: `after the ${def.levels[top].name}`, type: t });
  for (const [lv, ts] of Object.entries(def.paths || {})) for (const t of ts) out.push({ kind: 'side', at: +lv, label: `from the ${def.levels[lv].name}`, type: t });
  for (const t of def.stageNext || []) out.push({ kind: 'stage', at: 0, any: true, label: 'next stage', type: t });
  for (const t of LARGE[type] || []) out.push({ kind: 'plot', at: 0, any: true, label: 'double plot', type: t });
  for (const t of ESTATE[type] || []) out.push({ kind: 'estate', at: 0, any: true, label: '2×2 estate', type: t });
  if (joinable(type)) {
    for (const m of MERGES) {
      const other = m.a.includes(type) ? m.b : m.b.includes(type) ? m.a : null;
      if (other) out.push({ kind: 'join', at: 0, any: true, label: `+ ${list(other)}`, type: m.to });
    }
  }
  return out.sort((a, b) => a.at - b.at || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

// The tree: every type reachable from this one gets a row, in the order a
// walk from it meets them, and starts one column past the level it opens
// from (the nearest, when several paths lead to it). Paths that would run
// backwards are left out.
function layout(root) {
  const edges = [], types = [root], seen = new Set([root]);
  for (let i = 0; i < types.length; i++) {
    for (const e of nextOf(types[i])) {
      if (e.type === root) continue;
      edges.push({ from: types[i], ...e, to: e.type });
      if (!seen.has(e.type)) { seen.add(e.type); types.push(e.type); }
    }
  }
  const col = new Map([[root, 0]]);
  for (let pass = 0, changed = true; changed && pass < 30; pass++) {
    changed = false;
    for (const e of edges) {
      if (!col.has(e.from)) continue;
      const c = col.get(e.from) + e.at + 1;
      if (!col.has(e.to) || c < col.get(e.to)) { col.set(e.to, c); changed = true; }
    }
  }
  // its own upgrade paths first, right under it, then rebuilds and joins
  const rows = [];
  const walk = (t) => {
    if (rows.includes(t)) return;
    rows.push(t);
    for (const e of edges.filter(e => e.from === t).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))) walk(e.to);
  };
  walk(root);
  const forward = edges.filter(e => col.get(e.to) > col.get(e.from) + e.at);
  const width = Math.max(...rows.map(t => col.get(t) + BUILDINGS[t].levels.length));
  return { rows, col, edges: forward, width };
}

// What a level still needs, if anything ('' when open).
function needOf(world, type, level) {
  const tech = techForLevel(type, level), pop = unlockOf(type, level), need = [];
  if (tech && !world.hasTech(tech)) need.push(`Research ${TECHS[tech].name}`);
  if (pop && world.unlockPop < pop) need.push(`${pop} villagers`);
  return need.join(' · ');
}

// b: a building in town (where it stands is marked), or just a type (the guide).
export function showPathMap(ui, b, type = b && b.type) {
  const world = ui.world, def = BUILDINGS[type];
  const at = b ? { type: b.type, level: b.level } : null;
  const { rows, col, edges, width } = layout(type);
  let h = `<h2>${TITLE}</h2><p class="lead">Everything ${b ? `this ${esc(def.levels[b.level].name.toLowerCase())}` : `a ${esc(lower(type))}`} can become. Each row is a building and its levels. A line starts at the level a path opens from, or at the start of the row when any level can take it. Click a building for its guide.</p>`;
  h += `<div class="pm-legend">${ORDER.map(k => `<span style="--k:${KIND[k].col}"><span class="ms">${KIND[k].icon}</span>${esc(KIND[k].name)}</span>`).join('')}<span><span class="ms">lock</span>Locked: hover for what it needs</span></div>`;
  if (rows.length === 1) h += '<div class="note">It has no other paths: only its own levels.</div>';
  else if (LARGE[type] || ESTATE[type]) h += '<div class="note">Taking land next door also lets it be <b>extended</b> as it is, to hold 50% more.</div>';
  h += `<div class="pm-wrap"><div class="tt-grid" style="grid-template-columns: 178px repeat(${width}, 128px); grid-template-rows: repeat(${rows.length}, minmax(50px, auto))"><svg class="pm-links"></svg>`;
  rows.forEach((t, r) => {
    const d = BUILDINGS[t], here = at && at.type === t, c0 = col.get(t);
    const how = edges.filter(e => e.to === t);
    h += `<div class="tt-row${here ? ' here' : ''}" style="grid-row:${r + 1};grid-column:1" data-guide="${t}" title="Open the building guide"><img src="${thumb(t, here ? at.level : 0)}" alt=""><div><b>${esc(d.name)}</b>`;
    if (how.length) h += `<div class="tt-how">${how.map(e => `<span style="--k:${KIND[e.kind].col}" title="${esc(KIND[e.kind].name)}"><span class="ms">${KIND[e.kind].icon}</span>${esc(e.label)}${e.any ? ', any level' : ''}</span>`).join('')}</div>`;
    h += '</div></div>';
    let before = '';   // a locked level locks every level after it
    d.levels.forEach((L, i) => {
      const own = needOf(world, t, i), lock = own || (before && `After the ${before}`);
      if (lock && !before) before = L.name;
      const state = here ? (i < at.level ? 'done' : i === at.level ? 'now' : '') : '';
      const tip = state === 'now' ? 'This building now' : state === 'done' ? 'Already built' : lock || 'Open to build';
      h += `<div class="tt-node ${state} ${lock && !state ? 'locked' : ''}" style="grid-row:${r + 1};grid-column:${c0 + i + 2}" data-node="${t}:${i}" data-guide="${t}" title="${esc(tip)}"><b>${lock && !state ? '<span class="ms">lock</span>' : ''}${esc(L.name)}</b><span>$${L.cost}</span></div>`;
    });
  });
  h += '</div></div>';
  ui.openModal(h, (c) => {
    c.classList.add('wide', 'pm-win');
    const grid = c.querySelector('.tt-grid'), svg = c.querySelector('.pm-links');
    const draw = () => {
      if (!grid.isConnected) return;
      const box = grid.getBoundingClientRect();
      svg.setAttribute('width', grid.scrollWidth); svg.setAttribute('height', grid.scrollHeight);
      const pos = (t, i) => {
        const r = grid.querySelector(`[data-node="${t}:${i}"]`).getBoundingClientRect();
        return { l: r.left - box.left, r: r.right - box.left, x: r.left - box.left + r.width / 2, t: r.top - box.top, b: r.bottom - box.top, y: r.top - box.top + r.height / 2 };
      };
      let p = '';
      // each building's own levels, one after another
      for (const t of rows) for (let i = 1; i < BUILDINGS[t].levels.length; i++) {
        const a = pos(t, i - 1), z = pos(t, i);
        p += `<path d="M${a.r} ${a.y} L${z.l} ${z.y}" stroke="#8a8a8a" stroke-width="2" fill="none"/>`;
      }
      // the paths between buildings, through the gaps between columns: out of
      // the right of the level a path opens from, or out of the left of the
      // row's first level when any level can take it, then down (or up) to
      // its row and into its first level
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 26;
      for (const e of edges) {
        const a = pos(e.from, e.at), z = pos(e.to, 0), k = KIND[e.kind];
        const locked = grid.querySelector(`[data-node="${e.to}:0"]`).classList.contains('locked');
        const sx = e.any ? a.l : a.r, gx = e.any ? a.l - gap / 2 : a.r + gap / 2;
        const dy = Math.sign(z.y - a.y) * Math.min(6, Math.abs(z.y - a.y) / 2);
        const turn = dy ? `V${z.y - dy} Q${gx} ${z.y} ${gx + 6} ${z.y} ` : '';
        p += `<path d="M${sx} ${a.y} H${gx} ${turn}H${z.l}" stroke="${k.col}" stroke-width="2" fill="none" opacity="${locked ? 0.55 : 0.9}" ${locked ? 'stroke-dasharray="4 3"' : ''}/>`;
        p += `<circle cx="${sx}" cy="${a.y}" r="3.5" fill="${k.col}"/><path d="M${z.l - 6} ${z.y - 4} L${z.l} ${z.y} L${z.l - 6} ${z.y + 4}" stroke="${k.col}" stroke-width="2" fill="none"/>`;
      }
      svg.innerHTML = p;
    };
    requestAnimationFrame(draw);
    for (const img of c.querySelectorAll('.tt-row img')) img.addEventListener('load', () => requestAnimationFrame(draw), { once: true });
    for (const el of c.querySelectorAll('[data-guide]')) el.onclick = () => showBuildingGuide(ui, el.dataset.guide);
  });
}
