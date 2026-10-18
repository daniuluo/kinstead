// Economy audit: every building level's price and upkeep against what it
// gives back — payback days from taxes or earnings for homes and workplaces,
// cost and upkeep per tile of reach for services, per kW or per person of
// water for utilities, per unit of scenery for parks. Run it after changing
// prices to spot buildings out of line with their neighbours.
// Usage: node scripts/economy.js
import { BUILDINGS, RESEARCH_SOURCES, servicesOf } from '../src/defs.js';
const rows = [];
for (const [type, d] of Object.entries(BUILDINGS)) {
  d.levels.forEach((L, i) => {
    const area = d.merged ? 2 : d.size ** 2;
    const hk = L.tax ?? 1 + 0.25 * i;
    const res = RESEARCH_SOURCES[type] ? RESEARCH_SOURCES[type][Math.min(i, RESEARCH_SOURCES[type].length - 1)] : 0;
    const svc = servicesOf(d);
    const r = { type, i, name: L.name, cat: d.cat, cost: L.cost, up: L.upkeep || 0, area, housing: L.housing || 0, jobs: L.jobs || 0, income: L.income || 0, visit: L.visit || 0, hk, radius: L.radius || 0, svc: svc.join('+'), seats: L.seats || 0, kw: L.kw || 0, supply: L.supply || 0, appeal: L.appeal || 0, res };
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
      : r.svc ? `${r.svc} r${r.radius} seats ${r.seats} res ${r.res} jobs ${r.jobs}  $/tile ${f(r.cost / (Math.PI * r.radius ** 2), 1)} up/100tiles ${f(r.up / (Math.PI * r.radius ** 2) * 100, 1)}${r.seats ? ' $/seat ' + f(r.cost / r.seats, 1) : ''}`
      : r.appeal ? `appeal ${r.appeal} r${r.radius}  $/appeal·tile ${f(r.cost / (r.appeal * Math.PI * r.radius ** 2), 2)}`
      : `jobs ${r.jobs} income ${r.income} visit ${r.visit}`;
    console.log(`${(r.type + '.' + r.i).padEnd(18)} ${String(r.name).padEnd(20)} $${String(r.cost).padStart(5)} up ${String(r.up).padStart(3)} area ${r.area} | ${extra}`);
  }
}
