// Economy audit: every building level's price and upkeep against what it
// gives back — payback days from taxes or earnings for homes and workplaces,
// cost and upkeep per tile of reach for services, per kW or per person of
// water for utilities, per unit of scenery for parks. Run it after changing
// prices to spot buildings out of line with their neighbours. The last
// section sets each 2×2 estate against the double-plot building it is
// rebuilt from, grown to 2×2 (which holds, earns and costs half as much again),
// and each 2×2 park against the grounds it can grow into. A park's other uses
// show beside its scenery: research, a charge per visit, culture, somewhere
// to play (play) or dig (potter).
// Usage: node scripts/economy.js
import { BUILDINGS, RESEARCH_SOURCES, ESTATE, GRAND, servicesOf } from '../src/defs.js';
const rows = [];
for (const [type, d] of Object.entries(BUILDINGS)) {
  d.levels.forEach((L, i) => {
    const area = d.merged ? 2 : d.size ** 2;
    const uses = d.park ? [d.play && 'play', d.potter && 'potter', L.culture && `culture r${L.culture}`].filter(Boolean).join(' ') : '';
    const hk = L.tax ?? 1 + 0.25 * i;
    const res = RESEARCH_SOURCES[type] ? RESEARCH_SOURCES[type][Math.min(i, RESEARCH_SOURCES[type].length - 1)] : 0;
    const svc = servicesOf(d);
    const r = { type, i, name: L.name, cat: d.cat, cost: L.cost, up: L.upkeep || 0, area, housing: L.housing || 0, jobs: L.jobs || 0, income: L.income || 0, visit: L.visit || 0, hk, radius: L.radius || 0, svc: svc.join('+'), seats: L.seats || 0, kw: L.kw || 0, supply: L.supply || 0, appeal: L.appeal || 0, res, uses, park: !!d.park };
    // homes: taxes from residents (about 55% employed adults at 6×hk, the rest ~1)
    if (r.housing) { r.day = r.housing * (0.55 * 6 * hk + 0.45 * 1); r.net = r.day - r.up; r.payback = r.cost / r.net; r.perUnit = r.cost / r.housing; }
    else if (r.jobs && r.income) { r.day = r.jobs * r.income; r.net = r.day - r.up; r.payback = r.cost / r.net; r.perUnit = r.cost / r.jobs; }
    rows.push(r);
  });
}
const f = (v, d = 0) => (v == null || !isFinite(v) ? '·' : v.toFixed(d));
const cats = [...new Set(rows.map(r => r.cat))];
for (const cat of cats) {
  console.log(`\n== ${cat}`);
  for (const r of rows.filter(x => x.cat === cat)) {
    const extra = r.housing ? `homes ${r.housing} tax×${f(r.hk, 2)} /day ${f(r.day)} payback ${f(r.payback)}d per-res $${f(r.perUnit)}`
      : r.jobs && r.income ? `jobs ${r.jobs} ×$${r.income} /day ${f(r.day)} payback ${f(r.payback)}d per-job $${f(r.perUnit)}${r.visit ? ' visit ' + r.visit : ''}`
      : r.kw ? `kW ${r.kw}  $/kW ${f(r.cost / r.kw, 1)} up/kW ${f(r.up / r.kw, 2)} jobs ${r.jobs}`
      : r.supply ? `water ${r.supply}  $/person ${f(r.cost / r.supply, 1)} up/100 ${f(r.up / r.supply * 100, 2)} jobs ${r.jobs}`
      : r.park && r.appeal ? `appeal ${r.appeal} r${r.radius}  $/appeal·tile ${f(r.cost / (r.appeal * Math.PI * r.radius ** 2), 2)}${r.res ? `  research ${r.res}/day` : ''}${r.visit ? `  $${r.visit} a visit` : ''}${r.svc ? `  ${r.svc} r${r.radius} ($/tile ${f(r.cost / (Math.PI * r.radius ** 2), 1)})` : ''}${r.uses ? `  ${r.uses}` : ''}`
      : r.svc ? `${r.svc} r${r.radius} seats ${r.seats} res ${r.res} jobs ${r.jobs}  $/tile ${f(r.cost / (Math.PI * r.radius ** 2), 1)} up/100tiles ${f(r.up / (Math.PI * r.radius ** 2) * 100, 1)}${r.seats ? ' $/seat ' + f(r.cost / r.seats, 1) : ''}`
      : r.appeal ? `appeal ${r.appeal} r${r.radius}  $/appeal·tile ${f(r.cost / (r.appeal * Math.PI * r.radius ** 2), 2)}`
      : `jobs ${r.jobs} income ${r.income} visit ${r.visit}`;
    console.log(`${(r.type + '.' + r.i).padEnd(18)} ${String(r.name).padEnd(20)} $${String(r.cost).padStart(5)} up ${String(r.up).padStart(3)} area ${r.area} | ${extra}`);
  }
}

// 2×2 estates: the double-plot building on its grown 2×2 plot against its
// estate counterpart at the same level, and what the rebuild adds a day.
console.log('\n== 2×2 estates (double-plot building grown to 2×2, ×1.5 → its estate)');
const K = 1.5;
const parkUses = (t, j) => { const d = BUILDINGS[t], L = d.levels[j], res = RESEARCH_SOURCES[t]; return [res && `research ${res[Math.min(j, res.length - 1)]}`, L.visit && `$${L.visit}/visit`, d.play && 'play'].filter(Boolean).join(' '); };
const gives = (L, i) => (L.housing ? L.housing * (0.55 * 6 * (L.tax ?? 1 + 0.25 * i) + 0.45) : L.jobs && L.income ? L.jobs * L.income : 0);
const what = (L, k) => (L.housing ? `homes ${Math.round(L.housing * k)}` : L.seats ? `seats ${Math.round(L.seats * k)} r${L.radius}` : L.jobs && L.income ? `jobs ${Math.round(L.jobs * k)}×$${L.income}` : L.appeal ? `appeal ${L.appeal} r${L.radius}` : '');
for (const [src, list] of Object.entries(ESTATE)) for (const to of list) {
  BUILDINGS[src].levels.forEach((S, i) => {
    const j = Math.min(i, BUILDINGS[to].levels.length - 1), E = BUILDINGS[to].levels[j];
    const gain = gives(E, j) - (E.upkeep || 0) - K * (gives(S, i) - (S.upkeep || 0));
    const pays = gain > 0 && gives(E, j) ? ` +$${f(gain)}/day, rebuild pays back in ${f(E.cost / gain)}d` : '';
    console.log(`${(src + '.' + i).padEnd(16)} ${what(S, K).padEnd(16)} up ${f((S.upkeep || 0) * K).padStart(3)} → ${(to + '.' + j).padEnd(17)} ${E.name.padEnd(21)} ${what(E, 1).padEnd(16)} up ${String(E.upkeep || 0).padStart(3)} $${String(E.cost).padStart(5)}${pays}${BUILDINGS[to].park ? '  ' + parkUses(to, j) : ''}`);
  });
}

// Park grounds: a 2×2 park grown onto the land round it (3×3, then 4×4)
// and laid out as a grand park, at the level it had reached; what the bigger
// grounds add, and what each tile of scenery costs.
console.log('\n== park grounds (2×2 park → 3×3 grounds → 4×4)');
const per = (L) => L.cost / (L.appeal * Math.PI * L.radius ** 2);
for (const [src, list] of Object.entries(GRAND)) for (const to of list) {
  BUILDINGS[src].levels.forEach((S, i) => {
    const j = Math.min(i, BUILDINGS[to].levels.length - 1), E = BUILDINGS[to].levels[j];
    console.log(`${(src + '.' + i).padEnd(16)} appeal ${String(S.appeal).padStart(2)} r${String(S.radius).padEnd(2)} $/a·t ${f(per(S), 2)} → ${(to + '.' + j).padEnd(13)} ${E.name.padEnd(17)} appeal ${E.appeal} r${E.radius} $/a·t ${f(per(E), 2)}  up ${S.upkeep || 0} → ${E.upkeep}  $${E.cost}  ${parkUses(to, j)}`);
  });
}
