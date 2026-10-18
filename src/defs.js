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
//   rate      (builder's yard) how fast each of its builders works
//   supply    (water) people it can supply with water
//   kw        (generators) electricity produced
//   tax       (homes) tax paid per working resident, relative to a cottage
//
// branches: at its top level a type can be rebuilt as one of these types
// (a Family House becomes either a Villa or a Townhouse of flats).
// Type flags: hidden types never appear in the build menu (merged buildings);
// merged types occupy a 2×1 plot made from two neighbouring buildings.

export const CATEGORIES = [
  { id: 'residential', name: 'Homes', icon: '🏡', key: '2' },
  { id: 'commercial', name: 'Commerce', icon: '🛍️', key: '3' },
  { id: 'industry', name: 'Industry', icon: '⚒️', key: '4' },
  { id: 'services', name: 'Services', icon: '⛲', key: '5' },
  { id: 'utilities', name: 'Utilities', icon: '⚡', key: 'U' },
  { id: 'parks', name: 'Parks & Decor', icon: '🌳', key: '6' },
  { id: 'transit', name: 'Transit', icon: '🚂', key: '7' },
];

export const SERVICES = {
  water: { name: 'Water', icon: '💧', color: '#4aa3df' },
  health: { name: 'Health', icon: '🩺', color: '#e05a5a' },
  education: { name: 'Education', icon: '📚', color: '#e3a73b' },
  safety: { name: 'Safety', icon: '🛡️', color: '#5b6fd6' },
  culture: { name: 'Culture', icon: '🔔', color: '#a46ad8' },
  power: { name: 'Power', icon: '⚡', color: '#e8c33a' },
};

export const BUILDINGS = {
  // ---------------------------------------------------------------- homes
  house: {
    name: 'House', cat: 'residential', size: 1, icon: '🏠',
    desc: 'Homes for your villagers. Upgrade them as services arrive.',
    levels: [
      { name: 'Cottage', cost: 100, housing: 3, tax: 1 },
      { name: 'Family House', cost: 260, housing: 6, tax: 1.25, unlock: 25, req: { happiness: 50, water: true } },
    ],
    branches: ['villa', 'flats'],
  },
  // grand path: few, wealthy residents who pay far more tax and lift the street
  villa: {
    name: 'Villa', cat: 'residential', size: 1, hidden: true, spacious: true, tech: 'architecture', icon: '🏡', branch: 'Grand home',
    desc: 'A grand family home: fewer residents, but wealthy ones who pay far more tax and make the street prettier.',
    levels: [
      { name: 'Villa', cost: 700, housing: 8, tax: 2, appeal: 3, radius: 2, unlock: 60, req: { happiness: 60, water: true, health: true } },
      { name: 'Manor House', cost: 1500, housing: 12, tax: 2.6, appeal: 5, radius: 3, unlock: 120, req: { happiness: 66, water: true, health: true, education: true, safety: true } },
      { name: 'Grand Manor', cost: 2900, housing: 16, tax: 3.2, appeal: 7, radius: 3, unlock: 200, req: { power: true, happiness: 74, water: true, health: true, education: true, safety: true, culture: true } },
    ],
  },
  // multi-unit path: many households stacked into flats
  flats: {
    name: 'Flats', cat: 'residential', size: 1, hidden: true, spacious: true, tech: 'urban', icon: '🏘️', branch: 'Flats',
    desc: 'Homes stacked into flats: room for many households on one plot.',
    levels: [
      { name: 'Townhouse Flats', cost: 650, housing: 12, tax: 1.3, unlock: 60, req: { happiness: 56, water: true, health: true } },
      { name: 'Tenement', tech: 'highrise', cost: 1300, housing: 22, tax: 1.25, unlock: 120, req: { power: true, happiness: 60, water: true, health: true, education: true } },
      { name: 'Mansion Block', tech: 'highrise', cost: 2600, housing: 34, tax: 1.3, unlock: 200, req: { power: true, happiness: 66, water: true, health: true, education: true, safety: true } },
    ],
  },

  // Two neighbouring homes joined together (see World.mergeOptions).
  terrace: {
    name: 'Terrace', cat: 'residential', size: 2, merged: true, hidden: true, tech: 'urban', icon: '🏘️',
    desc: 'Two neighbouring homes joined into one row of houses.',
    levels: [
      { name: 'Terrace Cottages', cost: 150, housing: 8 },
      { name: 'Terraced Houses', cost: 700, housing: 16, unlock: 25, req: { happiness: 52, water: true } },
      { name: 'Town Terrace', tech: 'highrise', cost: 1500, housing: 26, unlock: 120, req: { power: true, happiness: 64, water: true, health: true, education: true } },
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
      { name: 'Market Hall', tech: 'civic', cost: 1800, jobs: 12, income: 7, visit: 11, unlock: 200, req: { power: true } },
    ],
  },
  bakery: {
    name: 'Bakery', cat: 'commercial', size: 1, shop: true, unlock: 25, tech: 'commerce', icon: '🥖',
    desc: 'Fresh bread every morning. The ovens smoke all day.',
    levels: [
      { name: 'Bakery', cost: 260, jobs: 3, income: 5, visit: 4 },
      { name: 'Patisserie', cost: 520, jobs: 5, income: 6, visit: 6, unlock: 60 },
      { name: 'Grand Bakery', cost: 1100, jobs: 8, income: 7, visit: 8, unlock: 120 },
    ],
  },
  tavern: {
    name: 'Tavern', cat: 'commercial', size: 1, leisure: true, unlock: 25, tech: 'commerce', icon: '🍺',
    desc: 'Where villagers gather in the evening.',
    levels: [
      { name: 'Tavern', cost: 320, jobs: 3, income: 4, visit: 5 },
      { name: 'Inn', cost: 760, jobs: 6, income: 5, visit: 8, unlock: 60 },
      { name: 'Coaching Inn', cost: 1500, jobs: 9, income: 6, visit: 11, unlock: 120 },
    ],
  },

  // A home joined with a shop, bakery or tavern: trade below, families above.
  shophouse: {
    name: 'Shophouse', cat: 'commercial', size: 2, merged: true, hidden: true, shop: true, tech: 'commerce', icon: '🏪',
    desc: 'Mixed use: a shop on the ground floor with homes above.',
    levels: [
      { name: 'Shophouse', cost: 150, housing: 6, jobs: 4, income: 6, visit: 6 },
      { name: 'Market Row', cost: 900, housing: 12, jobs: 7, income: 6, visit: 8, unlock: 60, req: { happiness: 55, water: true } },
      { name: 'Merchant Block', tech: 'highrise', cost: 1900, housing: 18, jobs: 10, income: 7, visit: 10, unlock: 120, req: { power: true, happiness: 62, water: true, health: true } },
    ],
  },

  // ------------------------------------------------------------- industry
  builder: {
    name: "Builder's Yard", cat: 'industry', size: 1, builders: true, icon: '🧱',
    desc: 'Home of the construction crews. Every new building, upgrade and move needs builders.',
    levels: [
      { name: "Builder's Yard", cost: 120, upkeep: 2, jobs: 3, rate: 1 },
      { name: 'Master Builder', tech: 'carpentry', cost: 420, upkeep: 4, jobs: 5, rate: 1.25, unlock: 25 },
      { name: "Masons' Lodge", tech: 'masonry', cost: 950, upkeep: 6, jobs: 8, rate: 1.5, unlock: 120 },
    ],
  },
  farm: {
    name: 'Farm', cat: 'industry', size: 2, outdoorWork: true, icon: '🌾',
    desc: 'Fields and a farmhouse. Farmers work outdoors.',
    levels: [
      { name: 'Farmstead', cost: 260, jobs: 4, income: 10 },
      { name: 'Farm', cost: 520, jobs: 8, income: 11, unlock: 25 },
      { name: 'Estate', cost: 1100, jobs: 12, income: 12, unlock: 60 },
      { name: 'Manor Farm', cost: 2000, jobs: 16, income: 13, unlock: 120 },
    ],
  },
  lumber: {
    name: 'Woodcutter', cat: 'industry', size: 1, nearTrees: true, icon: '🪓',
    desc: 'Turns nearby forest into timber. Earns more next to trees.',
    levels: [
      { name: "Woodcutter's Hut", cost: 200, jobs: 3, income: 10 },
      { name: 'Sawmill', cost: 480, jobs: 6, income: 11, unlock: 60 },
      { name: 'Timber Yard', cost: 950, jobs: 9, income: 12, unlock: 120 },
    ],
  },
  fishery: {
    name: 'Fishery', cat: 'industry', size: 1, needsWater: true, icon: '🐟',
    desc: 'Must be built next to water.',
    levels: [
      { name: 'Fishing Hut', cost: 180, jobs: 2, income: 13 },
      { name: 'Fishery', cost: 420, jobs: 5, income: 14, unlock: 25 },
      { name: 'Harbour', cost: 900, jobs: 8, income: 15, unlock: 120 },
    ],
  },
  workshop: {
    name: 'Workshop', cat: 'industry', size: 1, icon: '🔨',
    desc: 'Lucrative, but its smoke makes neighbours unhappy.',
    levels: [
      { name: 'Workshop', cost: 300, jobs: 4, income: 14, pollution: 3 },
      { name: 'Smithy', tech: 'brickmaking', cost: 620, jobs: 7, income: 15, pollution: 4, unlock: 25 },
      { name: 'Manufactory', tech: 'steam', cost: 1300, jobs: 14, income: 16, pollution: 5, unlock: 120, req: { power: true } },
    ],
  },

  // ------------------------------------------------------------- services
  well: {
    name: 'Well', cat: 'utilities', size: 1, service: 'water', icon: '💧',
    desc: 'Supplies water to nearby homes — but only as many people as it can draw for.',
    levels: [
      { name: 'Well', cost: 80, upkeep: 2, radius: 4, supply: 30 },
      { name: 'Water Tower', tech: 'hydraulics', cost: 420, upkeep: 6, radius: 8, supply: 120, unlock: 60 },
      { name: 'Waterworks', tech: 'steam', cost: 900, upkeep: 10, jobs: 3, radius: 12, supply: 300, unlock: 120, req: { power: true } },
    ],
  },
  pump: {
    name: 'Water Pump', cat: 'utilities', size: 1, service: 'water', needsWater: true, unlock: 25, tech: 'hydraulics', icon: '💧',
    desc: 'Pumps river or lake water for a lot of people. Must be built next to water.',
    levels: [
      { name: 'Pump House', cost: 350, upkeep: 4, jobs: 1, radius: 6, supply: 150 },
      { name: 'Pumping Station', tech: 'steam', cost: 900, upkeep: 8, jobs: 3, radius: 9, supply: 400, unlock: 120, req: { power: true } },
    ],
  },
  watermill: {
    name: 'Water Wheel', cat: 'utilities', size: 1, generator: true, needsWater: true, unlock: 25, tech: 'electricity', icon: '⚡',
    desc: 'A mill wheel turning a dynamo. Cheap, clean power — build it beside a stream or lake.',
    levels: [
      { name: 'Water Wheel', cost: 300, upkeep: 2, jobs: 1, kw: 40 },
      { name: 'Mill Turbine', cost: 750, upkeep: 4, jobs: 2, kw: 100, unlock: 60 },
    ],
  },
  windgen: {
    name: 'Wind Generator', cat: 'utilities', size: 1, generator: true, unlock: 25, tech: 'electricity', icon: '⚡',
    desc: 'Clean power from the wind. Small, but it can go anywhere.',
    levels: [
      { name: 'Wind Generator', cost: 260, upkeep: 2, kw: 25 },
      { name: 'Wind Turbine', cost: 650, upkeep: 4, kw: 60, unlock: 120 },
    ],
  },
  powerplant: {
    name: 'Power Station', cat: 'utilities', size: 2, generator: true, unlock: 60, tech: 'steam', icon: '🏭',
    desc: 'Coal-fired: lots of power for a growing town, and lots of smoke.',
    levels: [
      { name: 'Coal Power Station', cost: 1600, upkeep: 14, jobs: 8, kw: 220, pollution: 4 },
      { name: 'Steam Power Station', cost: 3000, upkeep: 22, jobs: 12, kw: 450, pollution: 5, unlock: 200 },
    ],
  },
  clinic: {
    name: 'Clinic', cat: 'services', size: 1, service: 'health', icon: '🩺',
    desc: 'Keeps villagers healthy.',
    levels: [
      { name: 'Herbalist', cost: 300, upkeep: 8, jobs: 2, radius: 6 },
      { name: 'Clinic', tech: 'medicine', cost: 650, upkeep: 15, jobs: 5, radius: 9, unlock: 60 },
      { name: 'Hospital', tech: 'medicine', cost: 1400, upkeep: 24, jobs: 9, radius: 13, unlock: 120, req: { power: true } },
    ],
  },
  school: {
    name: 'School', cat: 'services', size: 1, service: 'education', unlock: 25, icon: '📚',
    desc: 'Children attend during the day.',
    levels: [
      { name: 'Schoolhouse', cost: 350, upkeep: 9, jobs: 2, radius: 7 },
      { name: 'School', cost: 720, upkeep: 16, jobs: 5, radius: 10, unlock: 60 },
      { name: 'Academy', cost: 1500, upkeep: 24, jobs: 8, radius: 14, unlock: 120, req: { power: true } },
    ],
  },
  watch: {
    name: 'Watch', cat: 'services', size: 1, service: 'safety', icon: '🛡️',
    desc: 'Watchmen keep the peace.',
    levels: [
      { name: 'Watch Post', cost: 240, upkeep: 6, jobs: 2, radius: 6 },
      { name: 'Guardhouse', tech: 'masonry', cost: 560, upkeep: 12, jobs: 4, radius: 9, unlock: 60 },
      { name: 'Constabulary', cost: 1200, upkeep: 18, jobs: 7, radius: 13, unlock: 120 },
    ],
  },
  chapel: {
    name: 'Chapel', cat: 'services', size: 1, service: 'culture', unlock: 25, icon: '🔔',
    desc: 'A place for gatherings, weddings and quiet.',
    levels: [
      { name: 'Chapel', cost: 420, upkeep: 5, jobs: 1, radius: 8 },
      { name: 'Church', tech: 'masonry', cost: 950, upkeep: 10, jobs: 3, radius: 12, unlock: 60 },
      { name: 'Minster', cost: 2200, upkeep: 16, jobs: 5, radius: 16, unlock: 200 },
    ],
  },
  townhall: {
    name: 'Town Hall', cat: 'services', size: 2, unique: true, icon: '🏛️',
    desc: 'The heart of the village. Upgrading boosts tax income.',
    levels: [
      { name: 'Town Hall', cost: 1000, upkeep: 5, jobs: 3, taxBonus: 0 },
      { name: 'Guild Hall', cost: 1600, upkeep: 10, jobs: 6, taxBonus: 0.1, unlock: 120 },
      { name: 'Grand Hall', tech: 'civic', cost: 3200, upkeep: 18, jobs: 10, taxBonus: 0.2, unlock: 200, req: { power: true } },
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
    name: 'Plaza', cat: 'parks', size: 2, park: true, outdoor: true, unlock: 25, tech: 'architecture', icon: '⛲',
    desc: 'A cobbled square where villagers meet.',
    levels: [
      { name: 'Plaza', cost: 420, upkeep: 4, appeal: 12, radius: 5 },
      { name: 'Fountain Square', cost: 850, upkeep: 7, appeal: 20, radius: 7, unlock: 60 },
      { name: 'Grand Square', tech: 'civic', cost: 1500, upkeep: 10, appeal: 28, radius: 9, unlock: 120 },
    ],
  },
  flowers: {
    name: 'Flower Bed', cat: 'parks', size: 1, park: true, icon: '🌼',
    desc: 'A splash of colour.',
    levels: [{ name: 'Flower Bed', cost: 25, upkeep: 0.5, appeal: 3, radius: 2 }],
  },
  statue: {
    name: 'Statue', cat: 'parks', size: 1, park: true, unlock: 60, tech: 'architecture', icon: '🗽',
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
    name: 'Railway Station', cat: 'transit', size: 1, stop: 'rail', needsRail: true, unlock: 25, tech: 'railways', icon: '🚉',
    desc: 'Needs a road on one side and railway track on another.',
    levels: [
      { name: 'Railway Halt', cost: 350, upkeep: 4, jobs: 1 },
      { name: 'Railway Station', cost: 700, upkeep: 8, jobs: 3, unlock: 60 },
    ],
  },
};

export const TRANSIT = {
  coach: { name: 'Coach', vehicleCost: 150, upkeep: 4, fare: 2, speed: 0.9, capacity: 8, stopType: 'coachstop', unlock: 0 },
  rail: { name: 'Railway', vehicleCost: 600, upkeep: 12, fare: 4, speed: 0.7, capacity: 24, stopType: 'station', unlock: 25 },
};
export const RAIL_COST = 30;
export const LINE_COLORS = ['#d9534f', '#3f7fbf', '#4f9a5a', '#e3a73b', '#8a5aa8', '#2fa3a3', '#d9734a', '#c75b9b'];

// Research: one project at a time, paid for with research points that the
// town hall, schools and chapels produce every day. Each project unlocks
// building types (def.tech), upgrade levels (level.tech), the villa / flats
// paths, joined buildings, and building styles.
export const TECHS = {
  carpentry: { name: 'Carpentry', cost: 15, tier: 0, needs: [], desc: 'Timber framing and clapboard; better tools for the builders.' },
  pigments: { name: 'Paints & Limewash', cost: 15, tier: 0, needs: [], desc: 'Painted and limewashed walls.' },
  masonry: { name: 'Masonry', cost: 20, tier: 0, needs: [], desc: 'Dressed stone for walls, churches and guardhouses.' },
  brickmaking: { name: 'Brickmaking', cost: 20, tier: 0, needs: [], desc: 'Kilns and brick walls; the smithy.' },
  commerce: { name: 'Shopkeeping', cost: 25, tier: 0, needs: [], desc: 'Bakeries, taverns, and shops with homes above.' },
  hydraulics: { name: 'Hydraulics', cost: 30, tier: 0, needs: [], desc: 'Pumps and water towers for a thirsty town.' },
  medicine: { name: 'Medicine', cost: 35, tier: 1, needs: ['pigments'], desc: 'Proper clinics, then a hospital.' },
  architecture: { name: 'Architecture', cost: 45, tier: 1, needs: ['masonry'], desc: 'Grand homes, squares and monuments.' },
  urban: { name: 'Town Living', cost: 45, tier: 1, needs: ['brickmaking'], desc: 'Terraces and flats: more homes per plot.' },
  electricity: { name: 'Electricity', cost: 60, tier: 1, needs: ['hydraulics'], desc: 'Dynamos turned by water and wind; wires along the streets.' },
  railways: { name: 'Railways', cost: 70, tier: 2, needs: ['masonry', 'carpentry'], desc: 'Track, stations and steam trains.' },
  steam: { name: 'Steam Power', cost: 100, tier: 2, needs: ['electricity', 'brickmaking'], desc: 'Coal power stations, pumping stations and manufactories.' },
  civic: { name: 'Civic Planning', cost: 90, tier: 2, needs: ['architecture', 'commerce'], desc: 'Market halls, the Grand Hall and grand squares.' },
  highrise: { name: 'Tall Buildings', cost: 120, tier: 3, needs: ['urban', 'steam'], desc: 'Tenements, mansion blocks and the tallest terraces.' },
};
export const STYLE_TECH = { timber: 'carpentry', clapboard: 'carpentry', plaster: 'pigments', painted: 'pigments', stone: 'masonry', brick: 'brickmaking' };

// Daily research points: town hall, schools, chapels, plus a little per villager.
export const RESEARCH_SOURCES = { townhall: [3, 5, 8], school: [2, 4, 7], chapel: [1, 2, 3] };

export const BUILDING_ORDER = Object.keys(BUILDINGS);

export function levelDef(type, level) {
  return BUILDINGS[type].levels[level];
}

export function unlockOf(type, level = 0) {
  const d = BUILDINGS[type];
  return Math.max(d.unlock || 0, d.levels[level].unlock || 0);
}

// Builder-hours of work for a job of the given coin value.
const WORK_K = { build: 1, upgrade: 0.9, merge: 0.6, dismantle: 0.35, rebuild: 0.6, demolish: 0.3 };
export function workNeeded(cost, kind = 'build') {
  return Math.round((4 + cost / 14) * (WORK_K[kind] ?? 1) * 10) / 10;
}

export function isShop(type) { return !!BUILDINGS[type].shop; }
export function isLeisure(type) { return !!(BUILDINGS[type].leisure || BUILDINGS[type].park); }
