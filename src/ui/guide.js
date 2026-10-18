// What a building does, for the build menu: a short summary when hovering a
// card, and the full picture (every level, its needs and where it can lead)
// in the Building guide window when one is picked.

import { BUILDINGS, SERVICES, TECHS, MERGES, LARGE, servicesOf, unlockOf, techForLevel, workNeeded } from '../defs.js';
import { EDU } from '../sim/people.js';
import { visitorCap, visitKind } from '../sim/agents.js';
import { thumb } from './thumbs.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GUIDE = 'Building guide';

const plot = (def) => (def.merged ? { w: 2, d: 1 } : { w: def.size, d: def.size });
const visitors = (type, level) => { const p = plot(BUILDINGS[type]); return visitorCap({ type, level, size: Math.max(p.w, p.d), ...p }); };
const WHO = { park: 'people out for a stroll', shop: 'shoppers', tavern: 'guests', chapel: 'worshippers', clinic: 'patients' };

// What one level offers, as [label, value] pairs.
function stats(type, level) {
  const def = BUILDINGS[type], L = def.levels[level], out = [];
  if (L.housing) out.push(['Homes for', `${L.housing} villagers`]);
  if (L.jobs) out.push(['Jobs', `${L.jobs}${L.edu ? ` (${EDU[L.edu].toLowerCase()} schooling)` : ''}`]);
  if (L.seats) out.push(['Pupils', `${L.seats}`]);
  const cap = visitors(type, level);
  if (Number.isFinite(cap)) out.push(['Visitors at once', `${cap} ${WHO[visitKind(def)]}`]);
  for (const s of servicesOf(def)) out.push([`${SERVICES[s].name} reach`, `${L.radius} tiles`]);
  if (def.park && L.appeal) out.push(['Scenery', `+${L.appeal} within ${L.radius} tiles`]);
  else if (L.appeal) out.push(['Scenery', `+${L.appeal}`]);
  if (L.visit) out.push(['Per visit', `$${L.visit}`]);
  if (L.income) out.push(['Earnings', `$${L.income} a worker a day`]);
  if (L.supply) out.push(['Water for', `${L.supply} villagers`]);
  if (L.kw) out.push(['Power', `${L.kw} kW`]);
  if (L.rate) out.push(['Builder speed', `${L.rate}×`]);
  if (L.taxBonus) out.push(['Town tax', `+${Math.round(L.taxBonus * 100)}%`]);
  if (L.pollution) out.push(['Smoke', `${L.pollution} tiles around`]);
  if (L.upkeep) out.push(['Upkeep', `$${L.upkeep} a day`]);
  return out;
}

// What a level needs before it can be built or upgraded to.
function needs(world, type, level) {
  const L = BUILDINGS[type].levels[level], out = [];
  const pop = unlockOf(type, level), tech = techForLevel(type, level);
  if (pop) out.push({ text: `${pop} villagers`, met: world.unlockPop >= pop });
  if (tech) out.push({ text: `Research: ${TECHS[tech].name}`, met: world.hasTech(tech) });
  const r = L.req || {};
  if (r.happiness) out.push({ text: `Happiness ${r.happiness}%` });
  for (const s of ['water', 'health', 'education', 'safety', 'culture']) if (r[s]) out.push({ text: `${SERVICES[s].name} nearby` });
  if (r.power) out.push({ text: 'Electricity' });
  return out;
}

function placement(def) {
  const out = [];
  out.push(def.merged ? 'Takes a double plot' : def.size > 1 ? `Takes a ${def.size}×${def.size} plot` : 'Takes one plot');
  if (!def.park) out.push('needs a road alongside');
  if (def.needsWater) out.push('must be beside water');
  if (def.needsRail) out.push('needs railway track alongside');
  if (def.unique) out.push('only one per town');
  return out.join(', ');
}

function lockText(world, type) {
  const def = BUILDINGS[type], pop = unlockOf(type, 0);
  if (world.unlockPop < pop) return `Unlocks at ${pop} villagers`;
  if (!world.hasTech(def.tech)) return `Research ${TECHS[def.tech].name} first`;
  return null;
}

// The hover summary for a build menu card.
export function buildingSummary(world, type) {
  const def = BUILDINGS[type], L = def.levels[0];
  const chain = def.levels.map(l => esc(l.name)).join(' › ');
  const lock = lockText(world, type);
  let h = `<div class="bsum"><b>${esc(def.name)}</b>`;
  h += `<div class="bsum-chain">${chain}</div><div class="bsum-desc">${esc(def.desc || '')}</div><div class="bsum-stats">`;
  h += [['Cost', `$${L.cost}`], ...stats(type, 0)].map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('');
  h += `</div><div class="bsum-foot">${esc(placement(def))}</div>`;
  if (lock) h += `<div class="bad">🔒 ${esc(lock)}</div>`;
  return h + '<div class="bsum-hint">Click for the full guide</div></div>';
}

// The Building guide window: every level and path, kept to one window that
// follows whichever building was picked last.
export function showBuildingGuide(ui, type) {
  const world = ui.world, def = BUILDINGS[type];
  const lock = lockText(world, type);
  let h = `<h2>${GUIDE}</h2><div class="guide-head"><img src="${thumb(type, 0)}" alt=""><div><h3>${esc(def.name)}</h3><div class="guide-desc">${esc(def.desc || '')}</div>`;
  h += `<div class="guide-place">${esc(placement(def))} · builders take about ${Math.max(1, Math.round(workNeeded(def.levels[0].cost)))} builder-hours to put it up</div>`;
  if (lock) h += `<div class="guide-lock">🔒 ${esc(lock)}</div>`;
  h += '</div></div>';
  def.levels.forEach((L, i) => {
    const nd = needs(world, type, i);
    h += `<div class="guide-level"><img src="${thumb(type, i)}" alt=""><div><div class="guide-lname"><b>${i ? '⬆ ' : ''}${esc(L.name)}</b><span>$${L.cost}</span></div>`;
    h += `<div class="guide-stats">${stats(type, i).map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>`;
    if (nd.length) h += `<div class="guide-needs">${nd.map(n => `<span class="${n.met === false ? 'no' : n.met ? 'ok' : ''}">${esc(n.text)}</span>`).join('')}</div>`;
    h += '</div></div>';
  });
  // where it can lead beyond its own levels
  const more = [];
  for (const b of def.branches || []) more.push(`At the top level it can become: <b>${esc(BUILDINGS[b].levels[0].name)}</b> (${esc(BUILDINGS[b].name)})`);
  for (const [lv, list] of Object.entries(def.paths || {})) for (const b of list) more.push(`From the ${esc(def.levels[lv].name)} it can turn into a <b>${esc(BUILDINGS[b].levels[0].name)}</b>`);
  for (const b of def.stageNext || []) more.push(`It can move on to the next stage: <b>${esc(BUILDINGS[b].levels[0].name)}</b>`);
  for (const b of LARGE[type] || []) more.push(`On a double plot it can be rebuilt as <b>${esc(BUILDINGS[b].levels[0].name)}</b>`);
  for (const m of MERGES) {
    const other = m.a.includes(type) ? m.b : m.b.includes(type) ? m.a : null;
    if (other) more.push(`Joined with a neighbouring ${other.map(o => esc(BUILDINGS[o].levels[0].name.toLowerCase())).join(' or ')}: <b>${esc(BUILDINGS[m.to].levels[0].name)}</b>`);
  }
  if (more.length) h += `<div class="guide-more"><h5>Other paths</h5>${more.map(t => `<div>${t}</div>`).join('')}</div>`;
  const known = ui.windows && ui.windows.has(GUIDE);
  let saved = null;
  try { saved = localStorage.getItem(`hearthvale.win.${GUIDE}`); } catch {}
  ui.openModal(h, (c) => c.classList.add('guide'));
  // the first time, keep it to the left so the map stays clear for building
  const win = ui.windows.get(GUIDE);
  if (win && !known && !saved) { win.style.left = '8px'; win.style.top = '132px'; }
}
