// The town's problems and bottlenecks, most serious first, for the issues
// panel. Each issue can point at the buildings involved or open a menu.

import { BUILDINGS, SERVICES, needsOf, TECHS } from '../defs.js';
import { isOpen, capOf } from '../world/world.js';
import { yearsOf, stageForAge } from '../sim/people.js';
import { mainBlocker } from './working.js';

const SEV = { bad: 0, warn: 1, info: 2 };
// "iron foundry" → "iron foundries", "builder's yard" → "builder's yards"
// (names already plural, like timber works or steam sawmills, stay as they are)
const pluralOf = (s) => (/[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : /(ss|sh|ch|x)$/.test(s) ? s + 'es' : /[^su]s$/.test(s) ? s : s + 's');

export function computeIssues(game) {
  const w = game.world, sim = game.sim;
  if (!w || !sim) return [];
  const out = [];
  const add = (sev, icon, text, act = null) => out.push({ sev, icon, text, act });
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const homes = [...w.buildings.values()].filter(b => BUILDINGS[b.type].levels[b.level].housing && isOpen(b));
  const U = sim.utility;

  // money
  if (Number.isFinite(w.money)) {
    if (w.money < 0) add('bad', 'money_off', `In debt: $${Math.round(-w.money)}`, { kind: 'budget' });
    else if (sim.budget.net < 0) add('warn', 'trending_down', `Losing $${Math.round(-sim.budget.net)} a day`, { kind: 'budget' });
  }

  // roads
  const cut = [...w.buildings.values()].filter(b => !b.connected && (b.access || !BUILDINGS[b.type].park));
  if (cut.length) add('bad', 'link_off', `${plural(cut.length, 'building')} not connected to the town's roads`, { kind: 'focus', ids: cut.map(b => b.id) });

  // utilities
  if (U) {
    if (U.power.gen && U.power.demand > U.power.gen) {
      const dark = [...w.buildings.values()].filter(b => isOpen(b) && b.connected && !b.powered && !BUILDINGS[b.type].park);
      add('bad', 'power_off', `Power short by ${U.power.demand - U.power.gen} kW — ${plural(dark.length, 'building')} in the dark`, { kind: 'tool', cat: 'utilities' });
    } else if (!U.power.gen && w.hasTech('electricity')) add('info', 'bolt', 'No electricity yet — street lamps are dark, and powered works and the grandest upgrades need it', { kind: 'tool', cat: 'utilities' });
    if (U.water.demand > U.water.supply) add('bad', 'water_drop', `Water for ${U.water.supply} of ${U.water.demand} villagers — build wells or a pump`, { kind: 'tool', cat: 'utilities' });
  }

  // workplaces and services that can't do their job (Sim._working), grouped
  // by type and by what they lack; homes show up below as homes without a
  // service, and unconnected buildings above
  const groups = new Map();
  for (const b of w.buildings.values()) {
    const bl = b.blockers;
    if (!bl || !bl.length || !isOpen(b) || bl.includes('road')) continue;
    const L = BUILDINGS[b.type].levels[b.level];
    if (L.housing && !L.jobs) continue;
    const why = mainBlocker(b);
    if (!why) continue;
    const stop = why === 'workers' ? !b.workers.length : b.working === 0, lights = why === 'power' && needsOf(b.type, b.level).power?.use === 'lights';
    const key = `${b.type}|${why}|${stop}|${lights}`;
    if (!groups.has(key)) groups.set(key, { type: b.type, why, stop, lights, ids: [] });
    groups.get(key).ids.push(b.id);
  }
  for (const g of groups.values()) {
    // name what is there: the level they all share, or the first level of the kind
    const levels = new Set(g.ids.map(id => w.buildings.get(id).level));
    const L = BUILDINGS[g.type].levels[levels.size === 1 ? [...levels][0] : 0];
    const n = g.ids.length, name = L.name.toLowerCase(), names = n === 1 ? name : pluralOf(name);
    const what = `${n} ${names}`, act = { kind: 'focus', ids: g.ids };
    if (g.why === 'workers') add(g.stop ? 'warn' : 'info', 'person_off', g.stop ? `${what} with no workers — ${n === 1 ? 'it does' : 'they do'} nothing` : `${what} short of staff`, act);
    else if (g.why === 'power') add(g.stop ? 'bad' : 'warn', 'power_off', g.stop ? `${what} stopped — no power` : g.lights ? `${what} without power — little trade after dark` : `${what} working slowly — no power`, act);
    else add(g.stop ? 'bad' : 'warn', 'format_color_reset', g.stop ? `${what} stopped — no water` : `${what} without water`, act);
  }

  // services that homes are missing (water comes through the mains to every
  // connected home, so a lack of it shows up above as a shortage)
  for (const s of ['health', 'education', 'safety']) {
    const miss = homes.filter(b => b.factors && !b.factors[s]);
    if (miss.length >= 2) add('warn', { health: 'medical_services', education: 'school', safety: 'shield' }[s], `${plural(miss.length, 'home')} out of reach of ${SERVICES[s].name.toLowerCase()}`, { kind: 'focus', ids: miss.map(b => b.id) });
  }

  // schools
  const sk = sim.schooling;
  if (sk && sk.short) {
    const names = ['', 'an elementary school', 'a middle school', 'a high school'];
    for (const st of [1, 2, 3]) {
      if (!sk.short[st]) continue;
      const kids = [...w.residents.values()].filter(r => r.age === 'child' && r.school == null && stageForAge(yearsOf(r)) === st);
      const homesOf = [...new Set(kids.map(r => r.home))].filter(id => id != null);
      add('warn', 'school', `${plural(sk.short[st], 'child', 'children')} need ${names[st]} place`, { kind: 'focus', ids: homesOf, people: 'noschool' });
    }
  }

  // jobs and homes
  const jobless = [...w.residents.values()].filter(r => r.age === 'adult' && r.job == null).length;
  if (jobless >= 3) add('warn', 'work_off', `${plural(jobless, 'villager')} looking for work`, { kind: 'people', filter: 'jobless' });
  if (sim.jobsNeedingSkill > 0) add('info', 'school', `${plural(sim.jobsNeedingSkill, 'skilled job')} unfilled — they need better-educated workers`, { kind: 'people', filter: '' });
  const free = sim.housing.open ?? sim.housing.cap - sim.housing.used;
  if (free <= 0 && sim.demand.r > 0.55) add('info', 'cottage', 'No free homes — newcomers can\'t move in', { kind: 'tool', cat: 'residential' });

  // happiness and smoke
  const sad = homes.filter(b => b.residents.length && b.happiness < 40);
  if (sad.length) add('warn', 'sentiment_dissatisfied', `${plural(sad.length, 'unhappy home')} — families may leave`, { kind: 'focus', ids: sad.map(b => b.id) });
  const smoky = homes.filter(b => b.factors && b.factors.pollution > 6);
  if (smoky.length) add('warn', 'factory', `${plural(smoky.length, 'home')} breathing smoke`, { kind: 'focus', ids: smoky.map(b => b.id) });

  // building sites
  const sites = [...w.buildings.values()].filter(b => b.con && !b.con.wait);
  const C = game.construction;
  // more work than the builders can keep up with
  if (C && C.hasBuilders) {
    const crews = [...w.residents.values()].filter(r => r.job != null && BUILDINGS[w.buildings.get(r.job)?.type]?.builders).length;
    const waiting = sites.filter(b => !(C.crew.get(b.id) || {}).assigned);
    if (waiting.length >= Math.max(3, crews)) add('warn', 'construction', `${plural(waiting.length, 'site')} waiting for builders — build another Builder's Yard or upgrade yours`, { kind: 'tool', cat: 'industry' });
  }
  if (sites.length && C && !C.hasBuilders) add('warn', 'construction', `No builders — ${plural(sites.length, 'site')} with slow hired hands`, { kind: 'tool', cat: 'industry' });
  const stuck = sites.filter(b => b.access && !b.connected);
  if (stuck.length) add('bad', 'construction', `${plural(stuck.length, 'building site')} builders can't reach`, { kind: 'focus', ids: stuck.map(b => b.id) });

  // research
  const R = w.research;
  if (!w.sandbox.unlockAll && !R.current && Object.keys(R).length && sim.researchRate() > 0 && Object.keys(TECHS).some(id => !R.done.includes(id))) add('info', 'science', R.bank ? `No research project — ${R.bank} points waiting` : 'No research project chosen', { kind: 'research' });

  // transit stops nobody uses
  const idle = [...w.buildings.values()].filter(b => BUILDINGS[b.type].stop && isOpen(b) && !w.lines.some(l => l.stops.includes(b.id)));
  if (idle.length) add('info', 'directions_bus', `${plural(idle.length, 'stop')} not on any line`, { kind: 'focus', ids: idle.map(b => b.id) });

  void capOf;
  return out.sort((a, b) => SEV[a.sev] - SEV[b.sev]);
}
