// Global tunables for Kinstead.

export const CONFIG = {
  DAY_SECONDS: 480,        // real seconds per in-game day at 1x speed (an unhurried walking pace needs a long day)
  DAYS_PER_SEASON: 6,
  WATER_LEVEL: 0,
  START_MONEY: 4000,
  WALK_SPEED: 0.1375,      // tiles per real second at 1x: an unhurried stroll
  CART_SPEED: 0.18,        // a horse and cart at a walk, a little quicker than people on foot
  MAX_AGENTS: 1200,
  AUTOSAVE_DAYS: 1,
  PLOT_PRICE: 60,           // a neighbouring plot of land, bought to grow a building's plot
  FIELD_COST: 40,           // a tile of farmland, ploughed and fenced (a quarter back when it's taken out)
  FIELD_JOBS: 0.4,          // farm jobs each field adds
  FIELD_MAX: [6, 12, 20, 30],   // fields a farm can work, by its level
  ARRIVE_RATE: 0.8,         // how readily newcomer households take up empty homes each day
  ARRIVE_MAX: 10,           // ...and at most this many a day (each takes a home of its own)
  FAMILY_KIDS: 0.6,         // a newcomer family's third member and on: the chance each is a child
  FAMILY_KIDS_BIG: 0.4,     // ...in a family of four or more (the rest grown-up sons and daughters, relatives, grandparents)
  AUTOSAVE_SECONDS: 90,     // also this often in real time, paused or not
  VIEW_HEIGHT: 22,         // world units visible vertically at zoom 1
};

// Performance settings (Settings → Performance), as they start, and the
// Battery saver preset. fps 0 draws every frame the screen shows; resScale is
// the share of the screen's resolution drawn (pixel art gets chunkier
// pixels instead); shadowQuality picks the shadow map size (SHADOW_SIZE);
// effects thins out smoke, dust, sparks, fireworks, snow and rain;
// villagers 'some' draws about half of them, 'near' only those near the
// middle of the view; pausedSlow draws a few frames a second while the game
// is paused and nothing moves.
export const SHADOW_SIZE = { high: 4096, medium: 2048, low: 1024 };
export const PERF_DEFAULTS = { fps: 0, resScale: 1, shadows: true, shadowQuality: 'high', effects: 'full', villagers: 'all', pausedSlow: false };
export const BATTERY_SAVER = { fps: 30, resScale: 0.75, shadows: true, shadowQuality: 'low', effects: 'reduced', villagers: 'some', pausedSlow: true, ao: false, tiltShift: 'off' };

// Tilt-shift (Settings → Graphics; see render/tiltShift.js): blur is the
// widest blur, in screen heights either side, at the top and bottom of the
// screen; saturate and contrast lift the colour a little. TILT_BAND: how far
// above and below the focus stays sharp, in screen heights.
export const TILT_SHIFT = {
  subtle: { blur: 0.008, saturate: 0.07, contrast: 0.04 },
  strong: { blur: 0.018, saturate: 0.12, contrast: 0.07 },
};
export const TILT_BAND = { narrow: 0.06, normal: 0.11, wide: 0.18 };

export const SEASONS = [
  { name: 'Spring', icon: '🌸' },
  { name: 'Summer', icon: '☀️' },
  { name: 'Autumn', icon: '🍂' },
  { name: 'Winter', icon: '❄️' },
];

export const TITLES = [
  { pop: 0, name: 'Hamlet' },
  { pop: 25, name: 'Village' },
  { pop: 60, name: 'Large Village' },
  { pop: 120, name: 'Town' },
  { pop: 200, name: 'Market Town' },
];

export const ROAD_LEVELS = [
  null,
  { name: 'Dirt Path', cost: 8, upkeep: 0.15, unlock: 0 },
  { name: 'Cobblestone', cost: 22, upkeep: 0.3, unlock: 25 },
  { name: 'Paved Street', cost: 45, upkeep: 0.5, unlock: 120 },
];

export const BRIDGE_MULT = 3;
export const TREE_COST = 10;
export const CLEAR_COST = 3;
export const TERRAFORM_COST = 15;

// Taking up a road (or downgrading it) pays back a quarter of the price
// difference, like the salvage from a demolished building.
export const ROAD_SALVAGE = 0.25;
export function roadRefund(from, to, water) {
  const price = (L) => (L ? ROAD_LEVELS[L].cost : 0) * (water ? BRIDGE_MULT : 1);
  return Math.round((price(from) - price(to)) * ROAD_SALVAGE);
}

// Ways to dress a street (world.dress, one per road tile, and a boulevard's
// look beside it; see roadDress.js and packDress below):
// a price per tile, a little upkeep a day, and appeal for the homes and
// shops beside it. minLevel: the road it needs (the median needs a wide one).
// verge: it stands on the verges, so buildings there don't come forward.
// blvd: a boulevard's look, for the median between its lanes (see
// boulevard.js); tech: the research it needs.
export const DRESSINGS = [
  null,
  { key: 'trees', name: 'Tree-lined avenue', icon: 'park', verge: true, cost: 28, upkeep: 0.1, appeal: 1, unlock: 25, desc: 'Street trees on the verges either side' },
  { key: 'hedges', name: 'Hedged lane', icon: 'grass', verge: true, cost: 12, upkeep: 0.05, appeal: 0.5, unlock: 0, desc: 'Low clipped hedges along both sides' },
  { key: 'lamps', name: 'Lamp-lit street', icon: 'emoji_objects', cost: 24, upkeep: 0.12, appeal: 0.7, unlock: 25, desc: 'A street lamp every other tile, lit at night when the town has power' },
  { key: 'median', name: 'Planted median', icon: 'nature', cost: 36, upkeep: 0.12, appeal: 1.2, unlock: 120, minLevel: 3, desc: 'A planted strip down the middle of a paved street' },
  { key: 'btrees', blvd: true, name: 'Tree-lined median', icon: 'forest', cost: 40, upkeep: 0.14, appeal: 1.4, unlock: 25, desc: 'A street tree on every tile of the median, and a lamp between every other pair' },
  { key: 'bflowers', blvd: true, name: 'Flower-bed median', icon: 'local_florist', cost: 32, upkeep: 0.16, appeal: 1.3, unlock: 25, tech: 'gardening', desc: 'A grass median with a flower bed on every tile, planted for each season' },
  { key: 'btram', blvd: true, name: 'Tram reservation', icon: 'tram', cost: 50, upkeep: 0.12, appeal: 1, unlock: 120, tech: 'railways', minLevel: 3, desc: 'A paved median with tram rails and overhead wires, benches and a shelter here and there' },
  { key: 'bprom', blvd: true, name: 'Cobbled promenade', icon: 'directions_walk', cost: 64, upkeep: 0.22, appeal: 1.8, unlock: 120, tech: 'fountains', minLevel: 2, desc: 'A cobbled walk down the middle with benches and lamps, and a fountain or a statue every few tiles' },
  { key: 'bhedge', blvd: true, name: 'Hedged median', icon: 'fence', cost: 16, upkeep: 0.06, appeal: 0.7, unlock: 0, desc: 'A clipped hedge down the median, with clipped balls either side of a gap to cross' },
];
// Boulevards themselves (roads laid side by side, before any look): a
// little nicer to live by than a plain street, per lane tile.
export const BOULEVARD = { appeal: 0.4 };
export const dressRefund = (kind) => (kind && DRESSINGS[kind] ? Math.round(DRESSINGS[kind].cost * ROAD_SALVAGE) : 0);
// world.dress holds both on one byte: the street's dressing in the low four
// bits and, on a boulevard's lane, its look in the high four (each an index
// into DRESSINGS, 0 for none), so a boulevard can have avenue trees on its
// verges and a promenade down its median. (Saves from before boulevards
// only ever have the low bits.)
export const streetPart = (v) => v & 15;
export const lookPart = (v) => v >> 4;
export const packDress = (street, look) => (street & 15) | ((look & 15) << 4);
export const dressPart = (v, kind) => (DRESSINGS[kind] && DRESSINGS[kind].blvd ? lookPart(v) : streetPart(v));
export const withDress = (v, kind, look = !!(DRESSINGS[kind] && DRESSINGS[kind].blvd)) => (look ? packDress(streetPart(v), kind) : packDress(kind, lookPart(v)));
// what taking up a tile's dressing and look pays back
export const dressRefundAll = (v) => dressRefund(streetPart(v)) + dressRefund(lookPart(v));
// whether a stored dress byte is one the game knows
export const dressValid = (v) => streetPart(v) < DRESSINGS.length && !(DRESSINGS[streetPart(v)] || {}).blvd && lookPart(v) < DRESSINGS.length && (!lookPart(v) || !!DRESSINGS[lookPart(v)].blvd);

export function titleFor(pop) {
  let t = TITLES[0];
  for (const x of TITLES) if (pop >= x.pop) t = x;
  return t;
}

export function seasonOf(day) {
  return Math.floor(((day - 1) / CONFIG.DAYS_PER_SEASON)) % 4;
}
