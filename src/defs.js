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
//   seats     (schools) pupils it can teach
//   edu       education its workers need (1 primary, 2 secondary, 3 advanced)
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
    name: 'Villa', cat: 'residential', size: 1, hidden: true, spacious: true, tech: 'architecture', icon: '🏡', branch: 'Grand home', accent: '#9a6a12', pathIcon: 'castle',
    desc: 'A grand family home: fewer residents, but wealthy ones who pay far more tax and make the street prettier.',
    levels: [
      { name: 'Villa', cost: 700, housing: 8, tax: 2, appeal: 3, radius: 2, unlock: 60, req: { happiness: 60, water: true, health: true } },
      { name: 'Manor House', cost: 1500, housing: 12, tax: 2.6, appeal: 5, radius: 3, unlock: 120, req: { happiness: 66, water: true, health: true, education: true, safety: true } },
      { name: 'Grand Manor', tech: 'grandarch', cost: 2900, housing: 16, tax: 3.2, appeal: 7, radius: 3, unlock: 200, req: { power: true, happiness: 74, water: true, health: true, education: true, safety: true, culture: true } },
    ],
  },
  // multi-unit path: many households stacked into flats
  flats: {
    name: 'Flats', cat: 'residential', size: 1, hidden: true, spacious: true, tech: 'flats', icon: '🏘️', branch: 'Flats', accent: '#2c5a8a', pathIcon: 'apartment',
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
    desc: 'Villagers come here to shop. Every visit brings in money.',
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
    name: 'Tavern', cat: 'commercial', size: 1, leisure: true, unlock: 25, tech: 'hospitality', icon: '🍺',
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

  // Joined from two neighbours (see MERGES) or grown on an expanded plot.
  arcade: {
    name: 'Market Arcade', cat: 'commercial', size: 2, merged: true, hidden: true, shop: true, tech: 'arcades', icon: '🧺', branch: 'Arcade', accent: '#a0522d', pathIcon: 'storefront',
    desc: 'A covered row of shops under one roof.',
    levels: [
      { name: 'Market Arcade', cost: 300, jobs: 7, income: 6, visit: 8 },
      { name: 'Covered Market', tech: 'civic', cost: 900, jobs: 11, income: 7, visit: 11, unlock: 60 },
      { name: 'Grand Arcade', tech: 'civic', cost: 1900, jobs: 16, income: 8, visit: 14, unlock: 120, req: { power: true } },
    ],
  },
  inn: {
    name: 'Inn', cat: 'commercial', size: 2, merged: true, hidden: true, leisure: true, tech: 'hospitality', icon: '🍺', branch: 'Inn', accent: '#7a3a2a', pathIcon: 'hotel',
    desc: 'Rooms, ale and a yard for the coaches. Busy every evening.',
    levels: [
      { name: 'Market Inn', cost: 300, jobs: 6, income: 5, visit: 9 },
      { name: 'Posting House', cost: 900, jobs: 9, income: 6, visit: 12, unlock: 60 },
      { name: 'Grand Hotel', cost: 2000, jobs: 14, income: 7, visit: 16, unlock: 120, req: { power: true } },
    ],
  },
  joinery: {
    name: 'Joinery', cat: 'industry', size: 2, merged: true, hidden: true, tech: 'woodwork', icon: '🪚', branch: 'Joinery', accent: '#6e5034', pathIcon: 'carpenter',
    desc: 'Timber in, furniture and doors out.',
    levels: [
      { name: 'Joinery Works', cost: 400, jobs: 8, income: 15 },
      { name: 'Furniture Works', cost: 1100, jobs: 13, income: 16, pollution: 2, unlock: 60 },
    ],
  },
  parishschool: {
    name: 'Parish School', cat: 'services', size: 2, merged: true, hidden: true, service: 'education', services: ['education', 'culture'], tech: 'parish', icon: '📚', branch: 'Parish school', accent: '#5a3a6a', pathIcon: 'church',
    desc: 'Chapel and schoolroom together: teaches children and gives the parish a place to gather.',
    levels: [
      { name: 'Parish School', cost: 500, upkeep: 10, jobs: 4, radius: 9, seats: 40, edu: 2 },
      { name: 'Cathedral School', tech: 'academies', cost: 1400, upkeep: 20, jobs: 8, radius: 13, seats: 80, edu: 3, unlock: 120 },
    ],
  },
  almshouse: {
    name: 'Almshouse', cat: 'services', size: 2, merged: true, hidden: true, service: 'health', tech: 'medicine', icon: '🩺', branch: 'Almshouse', accent: '#8a2f2f', pathIcon: 'local_hospital',
    desc: 'Care for the sick and rooms for the elderly.',
    levels: [
      { name: 'Almshouse', cost: 450, upkeep: 8, jobs: 3, radius: 7, housing: 8, edu: 1 },
      { name: 'Infirmary', tech: 'hospitals', cost: 1200, upkeep: 16, jobs: 7, radius: 11, housing: 12, edu: 2, unlock: 60 },
    ],
  },
  fountaingarden: {
    name: 'Fountain Garden', cat: 'parks', size: 2, merged: true, hidden: true, park: true, outdoor: true, service: 'water', tech: 'fountains', icon: '⛲', branch: 'Fountain garden', accent: '#2f6a8a', pathIcon: 'water_drop',
    desc: 'A walled garden round a fountain: water for the neighbours and a lovely place to sit.',
    levels: [
      { name: 'Fountain Garden', cost: 250, upkeep: 3, appeal: 12, radius: 6, supply: 60 },
      { name: 'Water Garden', cost: 700, upkeep: 6, appeal: 20, radius: 8, supply: 150, unlock: 60 },
    ],
  },
  park: {
    name: 'Town Park', cat: 'parks', size: 2, merged: true, hidden: true, park: true, outdoor: true, tech: 'gardening', icon: '🌳', branch: 'Park', accent: '#3f6a2f', pathIcon: 'park',
    desc: 'Lawns, a pond and a bandstand.',
    levels: [
      { name: 'Town Park', cost: 200, upkeep: 3, appeal: 18, radius: 6 },
      { name: 'Pleasure Gardens', cost: 600, upkeep: 6, appeal: 28, radius: 8, unlock: 60 },
    ],
  },
  mansion: {
    name: 'Country Mansion', cat: 'residential', size: 2, merged: true, hidden: true, tech: 'architecture', icon: '🏡', branch: 'Country mansion', accent: '#6a3f8a', pathIcon: 'villa',
    desc: 'A great house in its own grounds, for the town\'s wealthiest families.',
    levels: [
      { name: 'Country Mansion', cost: 1200, housing: 14, tax: 3, appeal: 8, radius: 3, unlock: 60, req: { happiness: 62, water: true, health: true } },
      { name: 'Stately Home', tech: 'grandarch', cost: 3000, housing: 20, tax: 3.6, appeal: 12, radius: 4, unlock: 200, req: { happiness: 72, water: true, health: true, education: true, power: true } },
    ],
  },
  apartments: {
    name: 'Apartments', cat: 'residential', size: 2, merged: true, hidden: true, tech: 'flats', icon: '🏘️', branch: 'Apartments', accent: '#2c6a6a', pathIcon: 'domain',
    desc: 'A big block of flats: dozens of households on a double plot.',
    levels: [
      { name: 'Apartment Court', cost: 1500, housing: 30, tax: 1.3, unlock: 60, req: { happiness: 56, water: true, health: true } },
      { name: 'Grand Apartments', tech: 'highrise', cost: 3200, housing: 50, tax: 1.35, unlock: 200, req: { happiness: 64, water: true, health: true, education: true, power: true } },
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
      { name: 'Coal Power Station', cost: 1600, upkeep: 14, jobs: 8, kw: 220, edu: 2, pollution: 4 },
      { name: 'Steam Power Station', cost: 3000, upkeep: 22, jobs: 12, kw: 450, edu: 2, pollution: 5, unlock: 200 },
    ],
  },
  clinic: {
    name: 'Clinic', cat: 'services', size: 1, service: 'health', icon: '🩺',
    desc: 'Keeps villagers healthy.',
    levels: [
      { name: 'Herbalist', cost: 300, upkeep: 8, jobs: 2, radius: 6, edu: 1 },
      { name: 'Clinic', tech: 'medicine', cost: 650, upkeep: 15, jobs: 5, radius: 9, edu: 2, unlock: 60 },
      { name: 'Hospital', tech: 'hospitals', cost: 1400, upkeep: 24, jobs: 9, radius: 13, edu: 3, unlock: 120, req: { power: true } },
    ],
  },
  school: {
    name: 'School', cat: 'services', size: 1, service: 'education', icon: '📚',
    desc: 'Children from 6 to 17 learn here, if there is a place for them. A Schoolhouse teaches to primary level, a School to secondary, an Academy to advanced.',
    levels: [
      { name: 'Schoolhouse', cost: 350, upkeep: 9, jobs: 2, radius: 7, seats: 20, edu: 1 },
      { name: 'School', tech: 'schooling', cost: 720, upkeep: 16, jobs: 5, radius: 10, seats: 45, edu: 2, unlock: 60 },
      { name: 'Academy', tech: 'academies', cost: 1500, upkeep: 24, jobs: 8, radius: 14, seats: 90, edu: 3, unlock: 120, req: { power: true } },
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
      { name: 'Town Hall', cost: 1000, upkeep: 5, jobs: 3, taxBonus: 0, edu: 1 },
      { name: 'Guild Hall', cost: 1600, upkeep: 10, jobs: 6, taxBonus: 0.1, edu: 2, unlock: 120 },
      { name: 'Grand Hall', tech: 'civic', cost: 3200, upkeep: 18, jobs: 10, taxBonus: 0.2, edu: 2, unlock: 200, req: { power: true } },
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
    name: 'Statue', cat: 'parks', size: 1, park: true, unlock: 60, tech: 'stonework', icon: '🗽',
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
// Rows of the research tree.
export const BRANCHES = [
  ['wood', 'Woodwork'], ['stone', 'Stone'], ['brick', 'Brick & homes'], ['colour', 'Colour'], ['trade', 'Trade'],
  ['water', 'Water'], ['power', 'Power'], ['learn', 'Learning'], ['care', 'Care'], ['transport', 'Transport'], ['green', 'Gardens'],
];
// tier is the column: how deep into the tree a project sits.
export const TECHS = {
  carpentry: { name: 'Carpentry', cost: 15, tier: 0, branch: 'wood', needs: [], desc: 'Timber framing, and better tools for the builders.' },
  woodwork: { name: 'Joinery', cost: 25, tier: 1, branch: 'wood', needs: ['carpentry'], desc: 'Clapboard walls, and joinery works from a workshop and a woodcutter.' },
  masonry: { name: 'Masonry', cost: 20, tier: 0, branch: 'stone', needs: [], desc: "Mortar and stone: churches, guardhouses and the masons' lodge." },
  stonework: { name: 'Dressed Stone', cost: 25, tier: 1, branch: 'stone', needs: ['masonry'], desc: 'Stone-fronted buildings and monuments.' },
  architecture: { name: 'Architecture', cost: 45, tier: 2, branch: 'stone', needs: ['stonework'], desc: 'Villas, manor houses and cobbled squares.' },
  grandarch: { name: 'Grand Architecture', cost: 90, tier: 3, branch: 'stone', needs: ['architecture', 'paints'], desc: 'Grand manors, country mansions and stately homes.' },
  brickmaking: { name: 'Brickmaking', cost: 20, tier: 0, branch: 'brick', needs: [], desc: 'Kilns, brick walls and the smithy.' },
  urban: { name: 'Terraces', cost: 35, tier: 1, branch: 'brick', needs: ['brickmaking'], desc: 'Join neighbouring homes into terraces.' },
  flats: { name: 'Flats', cost: 50, tier: 2, branch: 'brick', needs: ['urban'], desc: 'Stack households into flats and apartment courts.' },
  highrise: { name: 'Tall Buildings', cost: 120, tier: 4, branch: 'brick', needs: ['flats', 'steam'], desc: 'Tenements, mansion blocks and the tallest terraces.' },
  pigments: { name: 'Limewash', cost: 10, tier: 0, branch: 'colour', needs: [], desc: 'Limewashed walls.' },
  paints: { name: 'Paints', cost: 20, tier: 1, branch: 'colour', needs: ['pigments'], desc: 'Painted walls in every colour.' },
  commerce: { name: 'Shopkeeping', cost: 20, tier: 0, branch: 'trade', needs: [], desc: 'Bakeries, and shops with homes above.' },
  hospitality: { name: 'Hospitality', cost: 30, tier: 1, branch: 'trade', needs: ['commerce'], desc: 'Taverns and inns.' },
  arcades: { name: 'Arcades', cost: 45, tier: 2, branch: 'trade', needs: ['hospitality', 'masonry'], desc: 'Covered shopping arcades.' },
  civic: { name: 'Civic Planning', cost: 90, tier: 3, branch: 'trade', needs: ['arcades', 'architecture'], desc: 'Market halls, the Grand Hall, grand squares and covered markets.' },
  hydraulics: { name: 'Hydraulics', cost: 25, tier: 0, branch: 'water', needs: [], desc: 'River pumps and water towers.' },
  fountains: { name: 'Fountains', cost: 30, tier: 1, branch: 'water', needs: ['hydraulics'], desc: 'Fountain gardens that also supply water.' },
  electricity: { name: 'Electricity', cost: 60, tier: 2, branch: 'power', needs: ['hydraulics'], desc: 'Water wheels and wind generators, with wires along the streets.' },
  steam: { name: 'Steam Power', cost: 100, tier: 3, branch: 'power', needs: ['electricity', 'brickmaking'], desc: 'Coal power stations, pumping stations, manufactories and waterworks.' },
  schooling: { name: 'Schooling', cost: 25, tier: 0, branch: 'learn', needs: [], desc: 'Proper schools that teach to secondary level.' },
  parish: { name: 'Parish Schools', cost: 35, tier: 1, branch: 'learn', needs: ['schooling', 'masonry'], desc: 'Join a chapel and a school.' },
  academies: { name: 'Academies', cost: 90, tier: 3, branch: 'learn', needs: ['parish', 'architecture'], desc: 'Academies and cathedral schools for advanced education.' },
  medicine: { name: 'Medicine', cost: 30, tier: 0, branch: 'care', needs: [], desc: 'Proper clinics, and almshouses.' },
  hospitals: { name: 'Hospitals', cost: 70, tier: 2, branch: 'care', needs: ['medicine', 'stonework'], desc: 'Hospitals and infirmaries.' },
  railways: { name: 'Railways', cost: 70, tier: 2, branch: 'transport', needs: ['woodwork', 'stonework'], desc: 'Track, stations and steam trains.' },
  gardening: { name: 'Gardening', cost: 15, tier: 0, branch: 'green', needs: [], desc: 'Join gardens into town parks.' },
};
// Which neighbours can be joined, and into what. Either order works.
export const MERGES = [
  { a: ['house'], b: ['house'], to: 'terrace' },
  { a: ['house'], b: ['market', 'bakery', 'tavern'], to: 'shophouse' },
  { a: ['market', 'bakery'], b: ['market', 'bakery'], to: 'arcade' },
  { a: ['tavern'], b: ['market', 'bakery', 'tavern'], to: 'inn' },
  { a: ['chapel'], b: ['school'], to: 'parishschool' },
  { a: ['clinic'], b: ['chapel', 'house'], to: 'almshouse' },
  { a: ['well'], b: ['garden', 'flowers'], to: 'fountaingarden' },
  { a: ['workshop', 'lumber'], b: ['workshop', 'lumber'], to: 'joinery' },
  { a: ['garden', 'flowers'], b: ['garden', 'flowers', 'statue'], to: 'park' },
];

// What a building on an expanded (double) plot can be rebuilt as.
export const LARGE = {
  house: ['mansion', 'apartments', 'terrace'], villa: ['mansion'], flats: ['apartments'],
  market: ['arcade'], bakery: ['arcade'], tavern: ['inn'], workshop: ['joinery'], lumber: ['joinery'],
  school: ['parishschool'], clinic: ['almshouse'], well: ['fountaingarden'],
};

// Every service a building provides (combined buildings can provide two).
export const servicesOf = (def) => def.services || (def.service ? [def.service] : []);

export const STYLE_TECH = { timber: 'carpentry', clapboard: 'woodwork', plaster: 'pigments', painted: 'paints', stone: 'stonework', brick: 'brickmaking' };

// Daily research points: town hall, schools, chapels, plus a little per villager.
export const RESEARCH_SOURCES = { townhall: [3, 5, 8], school: [2, 4, 7], chapel: [1, 2, 3], parishschool: [3, 6] };

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
