// People audit: how many live or work in each building against how big it
// is drawn. Every type is built at every level on its own plot, in a few
// variants; the solid bodies it is made of (walls, wings and towers, not
// roofs, fences, signs or props) are measured, and their floor area counted
// storey by storey: a house() knows its floors, any other body takes one
// storey per STOREY of height. People per tile of floor are then set against
// the target for the building's use class (TARGET), and the ones far off it
// are flagged. Run it after changing capacities or models.
// Usage: node scripts/people.js [--json]
import { GeoBuilder } from '../src/render/geo.js';
import { buildModel } from '../src/render/buildings.js';
import { BUILDINGS } from '../src/defs.js';

// The use classes, and how many people each takes per tile of floor against
// a home's (HOME: the median home). Offices pack clerks in tighter than
// families live; a shop's upper floors are mostly stores and a hospitality
// building's mostly patrons' rooms; a hall (town hall, chapel, library) is
// mostly one big room. Farms, industry and utilities work out in yards and
// around machinery the floor doesn't show, a school's staff go by its seats,
// and a home over a shop or workshop by both: these have no floor target.
export const HOME = 10.64;
export const TARGET = { home: 1, office: 1.6, shop: 0.75, hospitality: 0.45, service: 0.75, hall: 0.3 };
const CLASS = {
  office: ['offices', 'exchange', 'bank'],
  hospitality: ['tavern', 'inn', 'coachinginn', 'coffeehouse', 'musichall', 'teagarden'],
  hall: ['townhall', 'chapel', 'library'],
  industry: ['brewhouse'],
};
// Levels whose trade isn't under a roof or whose staff go by something
// else, and the 2×2 estates, which follow the building they are rebuilt
// from (their grounds have people too: grooms, gardeners, porters).
export const EXEMPT = {
  'house.0': 'a family of three at the least', 'market.0': 'an open stall', 'market.3': 'an open arcade under the hall', 'fishmarket.0': 'open stalls',
  musichall: 'its performers', teagarden: 'tables out on the lawn', firestation: 'crews by the engines',
  manor: 'an estate', quadrangle: 'an estate', markethall: 'an estate', coachinginn: 'an estate',
};
export const exemptWhy = (type, level) => EXEMPT[type + '.' + level] || EXEMPT[type] || null;

export function useClass(type) {
  const d = BUILDINGS[type], L = d.levels[d.levels.length - 1];
  if (d.park || d.cat === 'transit') return null;
  for (const [c, list] of Object.entries(CLASS)) if (list.includes(type)) return c;
  if (d.fields || d.outdoorWork) return 'farm';
  if (d.cat === 'utilities') return 'utility';
  if (L.housing && L.jobs) return 'mixed';
  if (L.housing) return 'home';
  if (d.cat === 'commercial') return 'shop';
  if (d.cat === 'industry') return 'industry';
  if (d.cat === 'services') return L.seats ? 'school' : 'service';
  return null;
}

// what counts as a body: at least this big every way (a fence, sign,
// awning, chimney, crate or lamp is smaller one way or another)
const MIN = 0.12;
let bodies = null;
for (const k of ['box', 'cbox']) {
  const orig = GeoBuilder.prototype[k];
  GeoBuilder.prototype[k] = function (...a) {
    const r = orig.apply(this, a);
    if (bodies) {
      const g = this.parts[this.parts.length - 1];
      g.computeBoundingBox();
      const { min, max } = g.boundingBox;
      if (max.x - min.x >= MIN && max.y - min.y >= MIN && max.z - min.z >= MIN) bodies.push({ x0: min.x, x1: max.x, y0: min.y, y1: max.y, z0: min.z, z1: max.z });
    }
    return r;
  };
}

const STEP = 0.02;
const VARIANTS = [1, 2, 3, 4, 5, 6];
// one storey of a body that isn't a house(): the median storey of the houses drawn
let STOREY = 0.3;

function measureOne(type, level, variant) {
  const d = BUILDINGS[type];
  const W = d.merged ? 2 : d.size, D = d.merged ? 1 : d.size;
  const flavor = type === 'shophouse' ? 'market' : null;
  const b = { type, level, variant, flavor, look: null, size: Math.max(W, D), w: W, d: D, x: 0, z: 0, baseY: 0, minY: 0, rot: 0, rail: d.needsRail ? { x: 0, z: 0, dir: 2 } : null };
  bodies = [];
  const m = buildModel(b, { flat: true });
  const bs = bodies, hs = m.houses || [];
  bodies = null;
  let gfa = 0, foot = 0, top = 0;
  for (let x = -W / 2 + STEP / 2; x < W / 2; x += STEP) for (let z = -D / 2 + STEP / 2; z < D / 2; z += STEP) {
    const over = bs.filter(o => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1);
    if (!over.length) continue;
    const h = hs.filter(o => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1);
    let floors;
    if (h.length) floors = Math.max(...h.map(o => o.floors));
    else {
      // the height of the bodies over this spot, overlaps counted once
      const iv = over.map(o => [Math.max(0, o.y0), o.y1]).sort((p, q) => p[0] - q[0]);
      let len = 0, s = -1, e = -1;
      for (const [a, c] of iv) { if (a > e) { if (e > s) len += e - s; s = a; e = c; } else e = Math.max(e, c); }
      if (e > s) len += e - s;
      floors = Math.max(1, Math.round(len / STOREY));
    }
    foot += STEP * STEP; gfa += STEP * STEP * floors; top = Math.max(top, floors);
  }
  return { gfa, foot, top, houses: hs };
}

// a building's floor area (tiles), footprint and most storeys, over a few variants
export function measure(type, level) {
  const runs = VARIANTS.map(v => measureOne(type, level, v));
  const avg = (k) => runs.reduce((s, r) => s + r[k], 0) / runs.length;
  return { gfa: avg('gfa'), foot: avg('foot'), storeys: Math.max(...runs.map(r => r.top)) };
}

// the storey height houses are drawn with
{
  const fh = [];
  for (const type of ['house', 'villa', 'flats', 'market', 'offices', 'workshop', 'clinic', 'townhall']) {
    BUILDINGS[type].levels.forEach((_, L) => { for (const h of measureOne(type, L, 1).houses) fh.push(h.h / h.floors); });
  }
  fh.sort((a, b) => a - b);
  STOREY = fh[Math.floor(fh.length / 2)];
}

export function audit() {
  const rows = [];
  for (const [type, d] of Object.entries(BUILDINGS)) {
    const cls = useClass(type);
    if (!cls) continue;
    d.levels.forEach((L, i) => {
      const m = measure(type, i);
      const people = (L.housing || 0) + (L.jobs || 0);
      rows.push({ type, i, name: L.name, cls, ...m, housing: L.housing || 0, jobs: L.jobs || 0, seats: L.seats || 0, people, dens: m.gfa ? people / m.gfa : 0 });
    });
  }
  return rows;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/people.js')) {
  const rows = audit();
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ STOREY, rows })); process.exit(0); }
  console.log(`storey height ${STOREY.toFixed(3)}; floor area in tiles (a 1×1 plot is 1); a home takes ${HOME} people per tile of floor`);
  for (const cls of [...new Set(rows.map(r => r.cls))]) {
    const rs = rows.filter(r => r.cls === cls), t = TARGET[cls], ref = t ? t * HOME : median(rs.map(r => r.dens));
    console.log(`\n== ${cls}  (${t ? `target ${ref.toFixed(1)}, ${t} × a home's` : `no floor target; median ${ref.toFixed(1)}`} people per tile of floor)`);
    for (const r of rs) {
      const k = ref ? r.dens / ref : 0, why = exemptWhy(r.type, r.i);
      const flag = why ? `  (${why})` : t && k < 0.75 ? '  << few' : t && k > 1.34 ? '  >> many' : '';
      const who = r.housing && r.jobs ? `homes ${r.housing} + jobs ${r.jobs}` : r.housing ? `homes ${r.housing}` : `jobs ${r.jobs}${r.seats ? ' (seats ' + r.seats + ')' : ''}`;
      console.log(`${(r.type + '.' + r.i).padEnd(18)} ${String(r.name).padEnd(22)} ${String(r.storeys).padStart(2)} storeys  floor ${r.gfa.toFixed(2).padStart(5)}  ${who.padEnd(22)} ${r.dens.toFixed(1).padStart(5)}/tile  ×${k.toFixed(2)}${flag}`);
    }
  }
}
