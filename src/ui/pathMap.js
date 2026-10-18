// Everything a building can become, as one tree: the levels it goes through,
// the other paths at its top level, side paths, the next stage of schooling,
// what it can be rebuilt as on a double plot or a 2×2 estate, and what it
// makes when joined with a neighbour, and so on down from each of those.
// Where the building stands now is marked, and so is what is still locked.

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

// Where one type can lead: [{ how, type }]
function nextOf(type) {
  const def = BUILDINGS[type], top = def.levels[def.levels.length - 1].name, out = [];
  for (const t of def.branches || []) out.push({ how: `Past the ${top}: another path`, icon: 'alt_route', type: t });
  for (const [lv, ts] of Object.entries(def.paths || {})) for (const t of ts) out.push({ how: `From the ${def.levels[lv].name}: a side path`, icon: 'call_split', type: t });
  for (const t of def.stageNext || []) out.push({ how: 'The next stage of schooling', icon: 'school', type: t });
  for (const t of LARGE[type] || []) out.push({ how: 'Take the plot next door, then rebuild as', icon: 'open_in_full', type: t });
  for (const t of ESTATE[type] || []) out.push({ how: 'Take two more plots for a 2×2 estate (Great Plots), then rebuild as', icon: 'select_all', type: t });
  if (joinable(type)) {
    for (const m of MERGES) {
      const other = m.a.includes(type) ? m.b : m.b.includes(type) ? m.a : null;
      if (other) out.push({ how: `Join with a neighbouring ${list(other)}`, icon: 'link', type: m.to });
    }
  }
  return out;
}

// What a level still needs, if anything ('' when open).
function lockOf(world, type, level) {
  const tech = techForLevel(type, level), pop = unlockOf(type, level), need = [];
  if (tech && !world.hasTech(tech)) need.push(`Research ${TECHS[tech].name}`);
  if (pop && world.unlockPop < pop) need.push(`${pop} villagers`);
  return need.join(' · ');
}

function nodeHTML(world, type, at, seen) {
  const def = BUILDINGS[type];
  const shown = at && at.type === type ? at.level : 0;
  let h = `<div class="pm-node${at && at.type === type ? ' here' : ''}"><img src="${thumb(type, shown)}" alt="">`;
  h += `<div class="pm-body"><a class="pm-name" data-guide="${type}" title="Open the building guide">${esc(def.name)}</a><div class="pm-chain">`;
  let before = '';   // a locked level locks every level after it
  h += def.levels.map((L, i) => {
    const own = lockOf(world, type, i);
    const lock = own || (before && `After the ${before}`);
    if (lock && !before) before = L.name;
    const state = at && at.type === type ? (i < at.level ? 'done' : i === at.level ? 'now' : '') : '';
    const tip = [state === 'now' ? 'This building now' : state === 'done' ? 'Already built' : '', lock || (state ? '' : 'Open to build')].filter(Boolean).join(' · ');
    return `<span class="pm-lv ${state} ${lock && !state ? 'locked' : ''}" title="${esc(tip)}">${lock && !state ? '<span class="ms">lock</span>' : ''}${esc(L.name)}<small>$${L.cost}</small></span>`;
  }).join('<i>▸</i>');
  h += '</div></div></div>';
  const kids = nextOf(type);
  if (kids.length) {
    h += '<ul>';
    for (const k of kids) {
      h += `<li><div class="pm-how"><span class="ms">${k.icon}</span>${esc(k.how)}</div>`;
      if (seen.has(k.type)) h += `<div class="pm-ref"><a data-guide="${k.type}">${esc(BUILDINGS[k.type].name)}</a> (shown above)</div>`;
      else { seen.add(k.type); h += nodeHTML(world, k.type, at, seen); }
      h += '</li>';
    }
    h += '</ul>';
  }
  return h;
}

// b: a building in town (its place is marked), or just a type from the guide.
export function showPathMap(ui, b, type = b && b.type) {
  const world = ui.world, def = BUILDINGS[type];
  const at = b ? { type: b.type, level: b.level } : null;
  const seen = new Set([type]);
  let h = `<h2>${TITLE}</h2><p class="lead">Everything ${b ? `this ${esc(def.levels[b.level].name.toLowerCase())}` : `a ${esc(lower(type))}`} can become: its levels, other paths, rebuilds on a bigger plot and joins with a neighbour. Locked steps show what they need; click a name for its guide.</p>`;
  if (LARGE[type] || ESTATE[type]) h += `<div class="note">A building that takes land can also just be <b>extended</b> across it, to hold 50% more.</div>`;
  h += `<div class="pathmap">${nodeHTML(world, type, at, seen)}</div>`;
  ui.openModal(h, (c) => {
    c.classList.add('wide');
    for (const a of c.querySelectorAll('[data-guide]')) a.onclick = () => showBuildingGuide(ui, a.dataset.guide);
  });
}
