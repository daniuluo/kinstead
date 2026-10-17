// Building catalogue. Every type has a chain of upgrade levels.
//
// Level fields:
//   cost      coins to build (level 0) or to upgrade into this level
//   upkeep    coins per day
//   housing   residents a home can hold
//   jobs      workplaces
//   income    coins per worker per day (commerce / industry)
//   visit     coins earned whenever a villager shops or relaxes here
//   radius    service / park reach in tiles
//   appeal    park attractiveness
//   unlock    population needed before this level becomes available
//   req       requirements for upgrading into this level

export const CATEGORIES = [
  { id: 'residential', name: 'Homes', icon: '🏡', key: '2' },
  { id: 'commercial', name: 'Commerce', icon: '🛍️', key: '3' },
  { id: 'industry', name: 'Industry', icon: '⚒️', key: '4' },
  { id: 'services', name: 'Services', icon: '⛲', key: '5' },
  { id: 'parks', name: 'Parks & Decor', icon: '🌳', key: '6' },
  { id: 'transit', name: 'Transit', icon: '🚂', key: '7' },
];

export const SERVICES = {
  water: { name: 'Water', icon: '💧', color: '#4aa3df' },
  health: { name: 'Health', icon: '🩺', color: '#e05a5a' },
  education: { name: 'Education', icon: '📚', color: '#e3a73b' },
  safety: { name: 'Safety', icon: '🛡️', color: '#5b6fd6' },
  culture: { name: 'Culture', icon: '🔔', color: '#a46ad8' },
};

export const BUILDINGS = {
  // ---------------------------------------------------------------- homes
  house: {
    name: 'House', cat: 'residential', size: 1, icon: '🏠',
    desc: 'Homes for your villagers. Upgrade them as services arrive.',
    levels: [
      { name: 'Cottage', cost: 100, housing: 3 },
      { name: 'Family House', cost: 260, housing: 6, unlock: 25, req: { happiness: 50, water: true } },
      { name: 'Townhouse', cost: 650, housing: 10, unlock: 120, req: { happiness: 62, water: true, health: true, education: true } },
    ],
  },

  // ------------------------------------------------------------- commerce
  market: {
    name: 'Market', cat: 'commercial', size: 1, shop: true, icon: '🧺',
    desc: 'Villagers come here to shop. Every visit earns coins.',
    levels: [
      { name: 'Market Stall', cost: 150, jobs: 2, income: 4, visit: 3 },
      { name: 'Shop', cost: 380, jobs: 4, income: 5, visit: 5, unlock: 25 },
      { name: 'Emporium', cost: 900, jobs: 8, income: 6, visit: 8, unlock: 120 },
    ],
  },
  bakery: {
    name: 'Bakery', cat: 'commercial', size: 1, shop: true, unlock: 25, icon: '🥖',
    desc: 'Fresh bread every morning. The ovens smoke all day.',
    levels: [
      { name: 'Bakery', cost: 260, jobs: 3, income: 5, visit: 4 },
      { name: 'Patisserie', cost: 520, jobs: 5, income: 6, visit: 6, unlock: 60 },
    ],
  },
  tavern: {
    name: 'Tavern', cat: 'commercial', size: 1, leisure: true, unlock: 25, icon: '🍺',
    desc: 'Where villagers gather in the evening.',
    levels: [
      { name: 'Tavern', cost: 320, jobs: 3, income: 4, visit: 5 },
      { name: 'Inn', cost: 760, jobs: 6, income: 5, visit: 8, unlock: 120 },
    ],
  },

  // ------------------------------------------------------------- industry
  farm: {
    name: 'Farm', cat: 'industry', size: 2, outdoorWork: true, icon: '🌾',
    desc: 'Fields and a farmhouse. Farmers work outdoors.',
    levels: [
      { name: 'Farmstead', cost: 260, jobs: 4, income: 10 },
      { name: 'Farm', cost: 520, jobs: 8, income: 11, unlock: 25 },
      { name: 'Estate', cost: 1100, jobs: 12, income: 12, unlock: 60 },
    ],
  },
  lumber: {
    name: 'Woodcutter', cat: 'industry', size: 1, nearTrees: true, icon: '🪓',
    desc: 'Turns nearby forest into timber. Earns more next to trees.',
    levels: [
      { name: "Woodcutter's Hut", cost: 200, jobs: 3, income: 10 },
      { name: 'Sawmill', cost: 480, jobs: 6, income: 11, unlock: 60 },
    ],
  },
  fishery: {
    name: 'Fishery', cat: 'industry', size: 1, needsWater: true, icon: '🐟',
    desc: 'Must be built next to water.',
    levels: [
      { name: 'Fishing Hut', cost: 180, jobs: 2, income: 13 },
      { name: 'Fishery', cost: 420, jobs: 5, income: 14, unlock: 25 },
    ],
  },
  workshop: {
    name: 'Workshop', cat: 'industry', size: 1, icon: '🔨',
    desc: 'Lucrative, but its smoke makes neighbours unhappy.',
    levels: [
      { name: 'Workshop', cost: 300, jobs: 4, income: 14, pollution: 3 },
      { name: 'Smithy', cost: 620, jobs: 7, income: 15, pollution: 4, unlock: 25 },
      { name: 'Manufactory', cost: 1300, jobs: 14, income: 16, pollution: 5, unlock: 120 },
    ],
  },

  // ------------------------------------------------------------- services
  well: {
    name: 'Well', cat: 'services', size: 1, service: 'water', icon: '💧',
    desc: 'Supplies water to nearby homes.',
    levels: [
      { name: 'Well', cost: 80, upkeep: 2, radius: 4 },
      { name: 'Water Tower', cost: 420, upkeep: 6, radius: 8, unlock: 60 },
    ],
  },
  clinic: {
    name: 'Clinic', cat: 'services', size: 1, service: 'health', icon: '🩺',
    desc: 'Keeps villagers healthy.',
    levels: [
      { name: 'Herbalist', cost: 300, upkeep: 8, jobs: 2, radius: 6 },
      { name: 'Clinic', cost: 650, upkeep: 15, jobs: 5, radius: 9, unlock: 60 },
    ],
  },
  school: {
    name: 'School', cat: 'services', size: 1, service: 'education', unlock: 25, icon: '📚',
    desc: 'Children attend during the day.',
    levels: [
      { name: 'Schoolhouse', cost: 350, upkeep: 9, jobs: 2, radius: 7 },
      { name: 'School', cost: 720, upkeep: 16, jobs: 5, radius: 10, unlock: 60 },
    ],
  },
  watch: {
    name: 'Watch', cat: 'services', size: 1, service: 'safety', icon: '🛡️',
    desc: 'Watchmen keep the peace.',
    levels: [
      { name: 'Watch Post', cost: 240, upkeep: 6, jobs: 2, radius: 6 },
      { name: 'Guardhouse', cost: 560, upkeep: 12, jobs: 4, radius: 9, unlock: 60 },
    ],
  },
  chapel: {
    name: 'Chapel', cat: 'services', size: 1, service: 'culture', unlock: 25, icon: '🔔',
    desc: 'A place for gatherings, weddings and quiet.',
    levels: [
      { name: 'Chapel', cost: 420, upkeep: 5, jobs: 1, radius: 8 },
      { name: 'Church', cost: 950, upkeep: 10, jobs: 3, radius: 12, unlock: 120 },
    ],
  },
  townhall: {
    name: 'Town Hall', cat: 'services', size: 2, unique: true, icon: '🏛️',
    desc: 'The heart of the village. Upgrading boosts tax income.',
    levels: [
      { name: 'Town Hall', cost: 1000, upkeep: 5, jobs: 3, taxBonus: 0 },
      { name: 'Guild Hall', cost: 1600, upkeep: 10, jobs: 6, taxBonus: 0.1, unlock: 120 },
      { name: 'Grand Hall', cost: 3200, upkeep: 18, jobs: 10, taxBonus: 0.2, unlock: 200 },
    ],
  },

  // ---------------------------------------------------------------- parks
  garden: {
    name: 'Garden', cat: 'parks', size: 1, park: true, outdoor: true, icon: '🌷',
    desc: 'Green space for strolling. Boosts happiness nearby.',
    levels: [
      { name: 'Village Green', cost: 40, upkeep: 1, appeal: 5, radius: 3 },
      { name: 'Garden', cost: 120, upkeep: 2, appeal: 9, radius: 4 },
      { name: 'Park', cost: 300, upkeep: 4, appeal: 14, radius: 5, unlock: 25 },
    ],
  },
  plaza: {
    name: 'Plaza', cat: 'parks', size: 2, park: true, outdoor: true, unlock: 25, icon: '⛲',
    desc: 'A cobbled square where villagers meet.',
    levels: [
      { name: 'Plaza', cost: 420, upkeep: 4, appeal: 12, radius: 5 },
      { name: 'Fountain Square', cost: 850, upkeep: 7, appeal: 20, radius: 7, unlock: 60 },
    ],
  },
  flowers: {
    name: 'Flower Bed', cat: 'parks', size: 1, park: true, icon: '🌼',
    desc: 'A splash of colour.',
    levels: [{ name: 'Flower Bed', cost: 25, upkeep: 0.5, appeal: 3, radius: 2 }],
  },
  statue: {
    name: 'Statue', cat: 'parks', size: 1, park: true, unlock: 60, icon: '🗽',
    desc: 'A monument to your founders.',
    levels: [{ name: 'Statue', cost: 260, upkeep: 1, appeal: 8, radius: 4 }],
  },

  // -------------------------------------------------------------- transit
  coachstop: {
    name: 'Coach Stop', cat: 'transit', size: 1, stop: 'coach', icon: '🚏',
    desc: 'A sheltered stop for horse-drawn coach lines. Link stops into a line.',
    levels: [{ name: 'Coach Stop', cost: 60, upkeep: 1 }],
  },
  station: {
    name: 'Railway Station', cat: 'transit', size: 1, stop: 'rail', needsRail: true, unlock: 25, icon: '🚉',
    desc: 'Needs a road on one side and railway track on another.',
    levels: [
      { name: 'Railway Halt', cost: 350, upkeep: 4, jobs: 1 },
      { name: 'Railway Station', cost: 700, upkeep: 8, jobs: 3, unlock: 60 },
    ],
  },
};

export const TRANSIT = {
  coach: { name: 'Coach', vehicleCost: 150, upkeep: 4, fare: 2, speed: 1.3, capacity: 8, stopType: 'coachstop', unlock: 0 },
  rail: { name: 'Railway', vehicleCost: 600, upkeep: 12, fare: 4, speed: 2.0, capacity: 24, stopType: 'station', unlock: 25 },
};
export const RAIL_COST = 30;
export const LINE_COLORS = ['#d9534f', '#3f7fbf', '#4f9a5a', '#e3a73b', '#8a5aa8', '#2fa3a3', '#d9734a', '#c75b9b'];

export const BUILDING_ORDER = Object.keys(BUILDINGS);

export function levelDef(type, level) {
  return BUILDINGS[type].levels[level];
}

export function unlockOf(type, level = 0) {
  const d = BUILDINGS[type];
  return Math.max(d.unlock || 0, d.levels[level].unlock || 0);
}

export function isShop(type) { return !!BUILDINGS[type].shop; }
export function isLeisure(type) { return !!(BUILDINGS[type].leisure || BUILDINGS[type].park); }
