// Global tunables for Kinstead.

export const CONFIG = {
  // Google Drive cloud saves: paste your OAuth 2.0 Web Client ID here
  // (see README → "Google Drive saves"). It can also be entered in-game
  // under Settings, which stores it in this browser only.
  GOOGLE_CLIENT_ID: '',

  DAY_SECONDS: 480,        // real seconds per in-game day at 1x speed (an unhurried walking pace needs a long day)
  DAYS_PER_SEASON: 6,
  WATER_LEVEL: 0,
  START_MONEY: 4000,
  WALK_SPEED: 0.275,       // tiles per real second at 1x
  CART_SPEED: 0.36,        // a horse and cart at a walk, a little quicker than people on foot
  MAX_AGENTS: 1200,
  AUTOSAVE_DAYS: 1,
  VIEW_HEIGHT: 22,         // world units visible vertically at zoom 1
};

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

export function titleFor(pop) {
  let t = TITLES[0];
  for (const x of TITLES) if (pop >= x.pop) t = x;
  return t;
}

export function seasonOf(day) {
  return Math.floor(((day - 1) / CONFIG.DAYS_PER_SEASON)) % 4;
}
