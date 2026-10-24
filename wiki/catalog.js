// The generated parts of the wiki: a page for each building menu (every
// building and every level, as the game defines them), the research tree,
// and the starter towns. They use the in-game building guide's own figures
// (src/ui/guide.js), so the wiki says what the game's guide says.

import {
  BUILDINGS, CATEGORIES, SERVICES, TECHS, TRANSIT, BRANCHES, MERGES, LARGE, ESTATE, ESTATE_TYPES, GRAND, FARM_JOIN, NEEDS, RESEARCH_SOURCES, CORNER_SHOPS,
  STYLE_TECH, CAPABILITIES, CIVIC_QUARTER, kindsOf, unlockOf, techForLevel, workNeeded, choosesProduce,
} from '../src/defs.js';
import { CONFIG } from '../src/config.js';
import { stats, placement } from '../src/ui/guide.js';
import { STYLES } from '../src/render/buildings.js';
import { EDU } from '../src/sim/people.js';
import { bl, tl, pl, esc, fmt, money, pct, table, pic, hrefOf, pageOfType, CAT_PAGE, k, an } from './links.js';
import { fact } from './facts.js';

const types = Object.keys(BUILDINGS);
const or = (arr) => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} or ${arr[arr.length - 1]}`);
const lname = (t, i = 0) => BUILDINGS[t].levels[i].name;
const top = (t) => BUILDINGS[t].levels.length - 1;

// Which part of a building page a type goes in.
export function kindOf(type) {
  const d = BUILDINGS[type];
  if (!d.hidden) return 'menu';
  if (d.grand) return 'grounds';
  if (d.estate) return 'estate';
  if (d.merged) return 'double';
  return 'path';
}
const KINDS = {
  menu: ['In the build menu', 'Built straight from the menu.'],
  path: ['Upgrade paths', 'Reached by upgrading another building: a branch at its top level, or a turn from one of its levels.'],
  double: ['On a double plot', 'Joined from two neighbours, or rebuilt from a building whose plot has grown.'],
  estate: ['2×2 estates', 'A double-plot building grown onto the two plots beside it (Great Plots) and rebuilt.'],
  grounds: ['Bigger grounds', 'A 2×2 park, or the town hall at its top level, grown onto the land round one of its corners (3×3, then 4×4) and rebuilt across it.'],
};
const TAG = { menu: '', path: 'tag-branch', double: 'tag-merge', estate: 'tag-estate', grounds: 'tag-estate' };
// what the bigger grounds need, and where they are told of
const grownBy = (t) => (BUILDINGS[t].seat ? [tl('capital'), pl('civic', 'The seat of government')] : [tl('publicparks'), pl('parks', 'Parks')]);

// How a building is had: every way in.
export function originsOf(type) {
  const d = BUILDINGS[type], out = [];
  if (!d.hidden) {
    const c = CATEGORIES.find(x => x.id === d.cat);
    out.push(`Build it from the <b>${esc(c.name)}</b> menu (${k(c.key)}).`);
  }
  for (const t of types) {
    const o = BUILDINGS[t];
    if ((o.branches || []).includes(type)) out.push(`${an(lname(t, top(t)))} ${bl(t, top(t))} at its top level can be rebuilt as one.`);
    for (const [lv, list] of Object.entries(o.paths || {})) if (list.includes(type)) out.push(`${an(lname(t, +lv))} ${bl(t, +lv)} can turn into one.`);
    if ((o.stageNext || []).includes(type)) out.push(`${an(o.name)} ${bl(t, 'type')} can move on to this stage of schooling.`);
    if ((LARGE[t] || []).includes(type)) out.push(`${an(lname(t))} ${bl(t)} on a grown double plot can be rebuilt as one (${pl('plots', 'Plots')}).`);
    if ((ESTATE[t] || []).includes(type)) out.push(`${an(lname(t))} ${bl(t)} grown into a 2×2 estate can be rebuilt as one (${pl('estates', 'Estates')}, ${tl('bigplots')}).`);
    if ((GRAND[t] || []).includes(type)) {
      const [tech, page] = grownBy(type), S = BUILDINGS[type].size;
      out.push(o.seat ? `The ${bl(t, top(t))} grown onto the land round it, ${S}×${S} grounds, can be rebuilt as one (${tech}, ${page}).` : `${an(lname(t))} ${bl(t)} grown onto the land round it, ${S}×${S} grounds, can be laid out as one (${tech}, ${page}).`);
    }
  }
  for (const m of MERGES) if (m.to === type) out.push(`Join ${an(lname(m.a[0]))} ${or(m.a.map(t => bl(t)))} with ${an(lname(m.b[0]))} ${or(m.b.map(t => bl(t)))} next door (${pl('joins', 'Joins')}).`);
  if (FARM_JOIN.to === type) out.push(`Join ${an(lname(FARM_JOIN.from[0]))} ${or(FARM_JOIN.from.map(t => bl(t)))} with ${an(lname(FARM_JOIN.with[0]))} ${or(FARM_JOIN.with.map(t => bl(t)))} beside it.`);
  return out;
}

// Where a building can go from here.
export function pathsOf(type) {
  const d = BUILDINGS[type], out = [];
  for (const b of d.branches || []) out.push(`At its top level it can be rebuilt as ${an(lname(b))} ${bl(b)} (${esc(BUILDINGS[b].branch || BUILDINGS[b].name)}).`);
  for (const [lv, list] of Object.entries(d.paths || {})) for (const b of list) out.push(`From the ${esc(lname(type, +lv))} it can turn into ${an(lname(b))} ${bl(b)}.`);
  for (const b of d.stageNext || []) out.push(`It can move on to the next stage: ${an(lname(b))} ${bl(b)}${BUILDINGS[b].merged || BUILDINGS[b].estate ? ' (on a bigger plot)' : ''}.`);
  for (const b of LARGE[type] || []) out.push(`On a double plot it can be rebuilt as ${an(lname(b))} ${bl(b)}.`);
  for (const b of ESTATE[type] || []) out.push(`Grown into a 2×2 estate it can be rebuilt as ${an(lname(b))} ${bl(b)}.`);
  for (const b of GRAND[type] || []) {
    const S = BUILDINGS[b].size;
    out.push(d.seat ? `At its top level, grown onto the land round it (${S}×${S} grounds, ${grownBy(b)[0]}), it can be rebuilt as the ${bl(b)}.` : `Grown onto the land round it (${S}×${S} grounds, ${grownBy(b)[0]}), it can be laid out as ${an(lname(b))} ${bl(b)}.`);
  }
  for (const m of MERGES) {
    const other = m.a.includes(type) ? m.b : m.b.includes(type) ? m.a : null;
    if (other) out.push(`Joined with a neighbouring ${or(other.map(o => bl(o, 0, lname(o).toLowerCase())))}: ${an(lname(m.to))} ${bl(m.to)}.`);
  }
  if (FARM_JOIN.from.includes(type)) out.push(`Joined with a ${or(FARM_JOIN.with.map(o => bl(o, 0, lname(o).toLowerCase())))} beside it: ${an(lname(FARM_JOIN.to))} ${bl(FARM_JOIN.to)}.`);
  if (FARM_JOIN.with.includes(type)) out.push(`Joined with a ${or(FARM_JOIN.from.map(o => bl(o, 0, lname(o).toLowerCase())))} beside it: the farm's ${bl(FARM_JOIN.to)}.`);
  return out;
}

// What a level needs: villagers, research, happiness, services.
function needChips(type, i) {
  const L = BUILDINGS[type].levels[i], out = [];
  const pop = unlockOf(type, i), tech = techForLevel(type, i), r = L.req || {};
  if (pop) out.push(`<span class="pop">${fmt(pop)} villagers</span>`);
  if (tech) out.push(`<span class="res">${tl(tech)}</span>`);
  if (i === 0 && BUILDINGS[type].estate && tech !== 'bigplots') out.push(`<span class="res">${tl('bigplots')}</span>`);
  if (r.happiness) out.push(`<span>Happiness ${r.happiness}%</span>`);
  for (const s of ['water', 'health', 'education', 'safety', 'culture']) if (r[s]) out.push(`<span>${esc(SERVICES[s].name)} ${s === 'water' ? '' : 'nearby'}</span>`);
  if (r.power) out.push('<span>Electricity</span>');
  return out;
}

function levelCard(type, i, page) {
  const d = BUILDINGS[type], L = d.levels[i];
  const rows = stats(type, i).map(([a, b]) => [a, b]);
  if (L.teaches) rows.push(['Teaches', EDU[L.teaches]]);
  if (L.tax && d.cat === 'residential') rows.push(['Tax factor', `× ${fmt(L.tax)}`]);
  const rs = RESEARCH_SOURCES[type];
  if (rs) rows.push(['Research', `${rs[Math.min(i, rs.length - 1)]} points a day`]);
  if (d.fields) rows.push(['Fields', `up to ${CONFIG.FIELD_MAX[Math.min(i + (d.fieldsFrom || 0), CONFIG.FIELD_MAX.length - 1)]}`]);
  rows.push(['Builder-hours', fmt(Math.max(1, Math.round(workNeeded(L.cost, i ? 'upgrade' : 'build'))))]);
  const nd = needChips(type, i);
  return `<div class="lvl" id="${page}/${type}.${i}">${pic(type, i, { alt: `${L.name}` })}
    <div class="ln"><b>${i ? '⬆ ' : ''}${esc(L.name)}<small>${i ? `Level ${i + 1}` : 'First level'}</small></b><span>${money(L.cost)}</span></div>
    <dl>${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
    ${nd.length ? `<div class="needs">${nd.join('')}</div>` : ''}</div>`;
}

// What else a building is: flags the game gives it.
function notes(type) {
  const d = BUILDINGS[type], out = [];
  const n = NEEDS[type];
  if (n) {
    for (const kind of ['power', 'water']) {
      const x = n[kind];
      if (!x) continue;
      const what = kind === 'power' ? (x.use === 'machines' ? 'power for' : 'electric light for') : 'running water for';
      out.push(`From the ${bl(type, x.from)}: needs ${what} ${esc(x.what)}; without it, ${x.without ? `it does ${pct(x.without)} of its work` : '<b>it stops</b>'}.`);
    }
    if (n.staff === false) out.push('Works without staff.');
  }
  if (d.unique) out.push('Only one per town.');
  if (d.nearTrees) out.push('Earns more with trees around it.');
  if (d.play) out.push('Somewhere to play: children head here after school, and homes with children in its reach are happier.');
  if (d.potter) out.push('Allotments to dig: elders go there in the mornings, and homes with elders in its reach are happier.');
  if (kindsOf(type) && d.seat) out.push(`Built in one of ${Object.keys(kindsOf(type)).length} styles (${Object.values(kindsOf(type)).map(x => esc(x.name.toLowerCase())).join(', ')}), and rebuilt in another from its panel (${pl('civic/styles', 'Its style')}).`);
  else if (kindsOf(type)) out.push(`Comes in ${Object.keys(kindsOf(type)).length} kinds (${Object.values(kindsOf(type)).map(x => esc(x.name.toLowerCase())).join(', ')}), chosen when it is built or reworked later (${pl('kinds', 'Plantings and monuments')}).`);
  if (d.seat) out.push(`The seat of government: its level raises every tax in town (${pl('civic', 'The seat of government')}).`);
  if (d.civic) out.push(`With its middle within ${CIVIC_QUARTER.reach} tiles of the town hall's, it makes part of a civic quarter: each kind there adds ${pct(CIVIC_QUARTER.tax)} to the town's taxes (${pl('civic/quarter', 'The civic quarter')}).`);
  d.levels.forEach((L, i) => { if (L.culture) out.push(`The ${bl(type, i)} brings culture to the streets within ${L.culture} tiles.`); });
  if (d.generator) out.push(`Makes electricity (${pl('power-water/power', 'Power')}).`);
  if (d.builders) out.push(`Its workers are builders (${pl('construction/builders', 'Builders')}).`);
  if (d.fields) out.push(`Ploughs fields beyond its plot${choosesProduce(type) ? ' and chooses what it grows' : ''} (${pl('farms', 'Farms and fields')}).`);
  if (CORNER_SHOPS.has(type)) out.push(`On a street corner it turns its shopfront round the corner (${pl('highstreet/corners', 'Corner shopfronts')}).`);
  if (d.stop) out.push(`A stop for ${TRANSIT[d.stop].vehicles} (${pl(`transport/${d.stop}`, 'Transit')}).`);
  return out;
}

function buildingSection(type, page) {
  const d = BUILDINGS[type], kind = kindOf(type);
  const chain = d.levels.map(L => esc(L.name)).join(' › ');
  const tags = [];
  if (kind !== 'menu') tags.push(`<span class="chip ${TAG[kind]}">${esc(KINDS[kind][0])}</span>`);
  tags.push(`<span class="chip">${d.estate ? '2×2 estate' : d.merged ? 'Double plot' : d.size > 1 ? `${d.size}×${d.size}` : 'One plot'}</span>`);
  if (d.unlock) tags.push(`<span class="chip">${d.unlock} villagers</span>`);
  if (d.tech) tags.push(`<span class="chip">${tl(d.tech)}</span>`);
  const from = originsOf(type), to = pathsOf(type), more = notes(type);
  const hours = Math.max(1, Math.round(workNeeded(d.levels[0].cost)));
  return `<section class="bld" id="${page}/${type}">
    <div class="bld-head">${pic(type, top(type), { alt: `${d.levels[top(type)].name}` })}<div>
      <h2><span aria-hidden="true">${d.icon}</span> ${esc(d.name)} <a class="anchor" href="#${page}/${type}" aria-label="Link to ${esc(d.name)}">#</a></h2>
      <div class="muted">${chain}</div>
      <div class="tags">${tags.join('')}</div>
      <p>${esc(d.desc || '')}</p>
      <p class="muted">${esc(placement(d))}. Builders take about ${hours} builder-hour${hours === 1 ? '' : 's'} to put it up.</p>
    </div></div>
    ${from.length ? `<p class="works"><b>How to get it:</b> ${from.join(' ')}</p>` : ''}
    <div class="levels">${d.levels.map((L, i) => levelCard(type, i, page)).join('')}</div>
    ${more.length ? `<ul class="bld-paths">${more.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${to.length ? `<p class="works"><b>Where it can lead:</b></p><ul class="bld-paths">${to.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
  </section>`;
}

// The sections of a building page.
export function buildingPage(page) {
  const cat = Object.keys(CAT_PAGE).find(c => CAT_PAGE[c] === page);
  const list = types.filter(t => BUILDINGS[t].cat === cat);
  const order = ['menu', 'path', 'double', 'estate', 'grounds'];
  const groups = order.map(kd => [kd, list.filter(t => kindOf(t) === kd)]).filter(([, l]) => l.length);
  const overview = table(['Building', 'Levels', '#From', 'Unlocks at', 'Research', 'How'], list.map(t => {
    const d = BUILDINGS[t];
    return [`${d.icon} <a href="#${page}/${t}">${esc(d.name)}</a>`, d.levels.map(L => esc(L.name)).join(' › '), money(d.levels[0].cost),
      unlockOf(t, 0) ? `${unlockOf(t, 0)} villagers` : '—', techForLevel(t, 0) ? tl(techForLevel(t, 0)) : '—', esc(KINDS[kindOf(t)][0])];
  }), 'overview');
  const out = [{ id: 'all', title: `Every ${CATEGORIES.find(c => c.id === cat).name.toLowerCase()} building`, html: `<p>${list.length} kinds, ${list.reduce((n, t) => n + BUILDINGS[t].levels.length, 0)} levels in all. Every figure comes from the game itself. Click a name to jump to it.</p>${overview}` }];
  for (const [kd, l] of groups) {
    out.push({ id: kd, title: KINDS[kd][0], html: `<p class="muted">${esc(KINDS[kd][1])}</p>` });
    for (const t of l) out.push({ id: t, title: BUILDINGS[t].name, raw: true, html: buildingSection(t, page), sub: BUILDINGS[t].levels.map(L => L.name).join(', ') });
  }
  return out;
}

// ---------------------------------------------------------------- research
// What a project unlocks (as the game's research window works it out).
export function unlocksOf(id) {
  const out = [], seen = new Set();
  const add = (text, href = null, thumb = null) => { if (!seen.has(text)) { seen.add(text); out.push({ text, href, thumb }); } };
  if (CAPABILITIES[id]) add(CAPABILITIES[id]);
  for (const t of types) {
    const d = BUILDINGS[t];
    d.levels.forEach((L, i) => {
      if (techForLevel(t, i) !== id) return;
      if (i === 0) {
        const m = MERGES.find(x => x.to === t);
        add(m ? `${L.name} — join ${lname(m.a[0]).toLowerCase()} + ${lname(m.b[0]).toLowerCase()}` : d.hidden && d.branch ? `${L.name} (new path)` : `${L.name} (${d.name})`, hrefOf(t), [t, 0]);
      } else add(`${L.name} (upgrade)`, hrefOf(t), [t, i]);
    });
  }
  for (const [style, t] of Object.entries(STYLE_TECH)) if (t === id) add(`${STYLES.find(s => s.id === style).name} style`, '#styles/styles', ['house', 1, 4242, null, style]);
  if (id === 'railways') add('Railway track and lines', '#transport/rail');
  if (id === 'cablecars') add('Gondola lines', '#transport/gondola');
  if (id === 'bigplots') for (const t of ESTATE_TYPES) add(`${lname(t)} (new path)`, hrefOf(t), [t, 0]);
  return out;
}

export function researchPage() {
  const techs = Object.entries(TECHS);
  const total = techs.reduce((n, [, t]) => n + t.cost, 0);
  const src = Object.entries(RESEARCH_SOURCES).map(([t, pts]) => [bl(t, 'type'), BUILDINGS[t].levels.map((L, i) => `${esc(L.name)} ${pts[Math.min(i, pts.length - 1)]}`).join(' · ')]);
  const out = [{ id: 'how', title: 'How research works', html: `
    <p>Press ${k('K')} (or click the research points in the top bar) for the research tree. Pick one project at a time; it is paid for with research points as they come in each day, and the top bar shows its progress (or your banked points) and the points a day. ${techs.length} projects in ${BRANCHES.length} branches cost ${fmt(total)} points in all, and later projects cost more, so a town works through the tree over many years.</p>
    <p>Each branch is a row with its levels left to right; a project mostly needs the one before it in its row, and other needs show as tags. Unlocking a building gives its first levels; later projects unlock its higher upgrades and other paths. Some projects unlock abilities instead: ${Object.keys(CAPABILITIES).map(c => tl(c)).join(', ')}.</p>
    <p>Points come from these buildings, while they work, by level:</p>
    ${table(['Building', 'Points a day, by level'], src)}
    <p>…and from the villagers: a point a day for every ${fact('villagersPerPoint')}. The research window lists where each day's points come from.</p>` }];
  const neededBy = (id) => techs.filter(([, t]) => t.needs.includes(id)).map(([o]) => o);
  for (const [bid, bname] of BRANCHES) {
    const row = techs.filter(([, t]) => t.branch === bid).sort((a, b) => a[1].tier - b[1].tier);
    const cards = row.map(([id, t]) => {
      const un = unlocksOf(id);
      return `<div class="tech" id="research/${id}">
        <div class="tn"><b>${esc(t.name)}</b><span>${fmt(t.cost)} pts</span></div>
        <div class="tier">Level ${t.tier + 1} of ${esc(bname)}${t.needs.length ? ` · needs ${t.needs.map(n => tl(n)).join(', ')}` : ' · no other needs'}</div>
        <p>${esc(t.desc)}</p>
        ${un.length ? `<div class="un">${un.map(u => {
          const img = u.thumb ? pic(u.thumb[0], u.thumb[1], { variant: u.thumb[2] ?? 777, flavor: u.thumb[3], look: u.thumb[4], cls: 'mini' }) : '';
          return u.href ? `<a href="${u.href}">${img}${esc(u.text)}</a>` : `<span>${esc(u.text)}</span>`;
        }).join('')}</div>` : ''}
        ${neededBy(id).length ? `<div class="req">Leads to ${neededBy(id).map(n => tl(n)).join(' ')}</div>` : ''}
      </div>`;
    }).join('');
    out.push({ id: bid, title: bname, html: `<div class="techs">${cards}</div>`, sub: row.map(([, t]) => t.name).join(', ') });
  }
  return out;
}

// ------------------------------------------------------------ starter towns
export async function startersPage() {
  const { STARTERS } = await import('../src/world/starters.js');
  const rows = STARTERS.map(s => `<figure id="starters/${s.id}"><canvas width="300" height="200" data-starter="${esc(s.id)}"></canvas>
    <figcaption><b>${esc(s.name)}</b>${esc(s.desc)}<div class="m" data-starter-m="${esc(s.id)}">${s.N}×${s.N} · ${esc(s.town)} · ${s.heavy ? `<button type="button" class="btn small" data-starter-grow="${esc(s.id)}">Grow it here (a few seconds)</button>` : 'growing…'}</div></figcaption></figure>`).join('');
  return [
    { id: 'towns', title: 'The towns', html: `<p>Each map below is grown here and now by the game's own code, as it is when you pick the town, so it shows the town as it is in this version of the game.</p><div class="maps">${rows}</div>` },
    { id: 'city', title: 'The Cathedral city', html: `
      <p>The biggest starter isn't grown from a script but laid out whole, through the same rules as the rest, with every research project behind it:</p>
      <ul>
        <li><b>Streets</b>: a grid round the town hall, paved avenues and cobbled side streets, so every lot fronts a street.</li>
        <li><b>Core</b>: the town hall grown across a civic block into the domed ${bl('capitol', BUILDINGS.capitol.levels.length - 1)}, with ${bl('lawcourts', 0, 'law courts')}, a ${bl('museum', 0, 'museum')} and ${bl('operahouse', 0, 'assembly rooms')} beside it (a ${pl('civic/quarter', 'civic quarter')}), monuments and flower beds, a market hall, a cathedral close, the exchange, a department store, banks, offices, a library and a theatre.</li>
        <li><b>High street and homes</b>: every trade round the middle; then every lot gets a home or a place of work, homes running from flats and shophouses in the centre to terraces, family houses and villas at the edge, with gardens, courts and play areas between.</li>
        <li><b>Works</b>: on the side the road leaves by, with a wind farm past them, and no home within reach of their smoke.</li>
        <li><b>Services</b>: wherever a home would go without health, safety, culture, schooling, shops, a stop or somewhere to play; then school places for every child, coach lines through the stops, and power and water with some to spare.</li>
      </ul>
      <p>Families move into every home and the town runs for a few days before it is handed to you: a city at work, its people almost all employed and happy.</p>` },
    { id: 'metropolis', title: 'The Metropolis', html: `
      <p>The most people a valley can hold. It's laid out by the same code as the Cathedral city, pushed as far as it goes:</p>
      <ul>
        <li><b>The whole valley</b>: the largest map, every plot of it, with the cross streets further apart to leave more room for building, round the Gothic ${bl('parliament', BUILDINGS.parliament.levels.length - 1)} and its civic quarter.</li>
        <li><b>The densest homes</b>: ${bl('flats', BUILDINGS.flats.levels.length - 1, 'mansion blocks')}, ${bl('apartments', BUILDINGS.apartments.levels.length - 1, 'grand apartments')} and ${bl('quadrangle', BUILDINGS.quadrangle.levels.length - 1, 'mansion courts')}, some 36 people to a plot, every one full.</li>
        <li><b>Just enough work</b>: offices, banks and exchanges for the schooled, market halls, department stores and shops for the rest, so about four in five grown-ups have a job (no one leaves a town for want of work, but the town lives on their taxes).</li>
        <li><b>Power and water</b>: a strip along the edge the road comes in by, with steam power stations at the far side (they give the most power to a plot), waterworks, and the works.</li>
        <li><b>Schools and services</b>: families move in as each home goes up and schools follow the children; clinics, fire stations, chapels, shops and play areas go wherever a home would go without.</li>
      </ul>
      <p>It takes a few seconds to lay out, so the new-village window builds it only when you pick it. Its save is packed to about a third so that it fits in the browser (see ${pl('start/saving', 'Saving')}).</p>` },
  ];
}

// Grows each starter town in turn (as the new-village window does) and
// draws its map.
export async function growStarters(root) {
  const [{ STARTERS, starterSummary, loadStarter }, { drawTownMap }] = await Promise.all([import('../src/world/starters.js'), import('../src/ui/starterPicker.js')]);
  const grow = (s, cv, m) => {
    try {
      const x = starterSummary(s.id);
      drawTownMap(cv, loadStarter(s.id));
      m.textContent = `${x.N}×${x.N} · ${s.town} · ${x.title} of ${fmt(x.pop)} villagers · ${fmt(x.buildings)} buildings · $${fmt(x.money)} · day ${fmt(x.day)}`;
    } catch (e) {
      console.error(e);
      m.textContent = 'Could not grow this town here';
    }
  };
  for (const s of STARTERS) {
    const cv = root.querySelector(`canvas[data-starter="${s.id}"]`), m = root.querySelector(`[data-starter-m="${s.id}"]`);
    if (!cv || !cv.isConnected) return;
    // a heavy town (the Metropolis) only when asked for
    if (s.heavy) {
      const b = m.querySelector('[data-starter-grow]');
      if (b) b.onclick = () => { m.textContent = 'Growing…'; setTimeout(() => setTimeout(() => grow(s, cv, m), 30), 0); };
      continue;
    }
    await new Promise(r => setTimeout(r, 30));
    grow(s, cv, m);
  }
}

export function generate(gen, page) {
  if (gen === 'catalog') return buildingPage(page);
  if (gen === 'research') return researchPage();
  if (gen === 'starters') return startersPage();
  return [];
}
