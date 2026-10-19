// Numbers the wiki states that live inside the game's code rather than in
// src/defs.js or src/config.js (which the wiki reads directly). Each one
// names the file and a pattern that finds it there; scripts/site-check.js
// reads the code and fails when a number has changed, so the wiki can be
// brought back in step. `value` is what the pattern's groups must read
// (one number, or a list for several groups).

export const FACTS = {
  // ------------------------------------------------------------ happiness
  happyBase: { value: 42, file: 'src/sim/sim.js', re: /let h = (\d+);/ },
  happyWater: { value: 10, file: 'src/sim/sim.js', re: /add\('water', f\.water \? (\d+) : 0/ },
  happyHealth: { value: 9, file: 'src/sim/sim.js', re: /add\('health', f\.health \? (\d+) : 0/ },
  happyEducation: { value: 8, file: 'src/sim/sim.js', re: /add\('education', f\.education \? (\d+) : 0/ },
  happySafety: { value: 7, file: 'src/sim/sim.js', re: /add\('safety', f\.safety \? (\d+) : 0/ },
  happyCulture: { value: 6, file: 'src/sim/sim.js', re: /add\('culture', f\.culture \? (\d+) : 0/ },
  happyPower: { value: 4, file: 'src/sim/sim.js', re: /add\('power', f\.power \? (\d+) : 0/ },
  happyAppeal: { value: [16, 0.8], file: 'src/sim/sim.js', re: /f\.appeal = Math\.min\((\d+), this\.appeal\[i\] \* ([\d.]+)\)/ },
  happyShops: { value: [7, 5], file: 'src/sim/sim.js', re: /f\.shops = near\(shops, b, (\d+)\);\s*add\('shops', f\.shops \? (\d+) : 0/ },
  happyPlay: { value: 4, file: 'src/sim/sim.js', re: /add\('play', f\.play \? (\d+) : 0/ },
  happyPotter: { value: 3, file: 'src/sim/sim.js', re: /add\('potter', f\.potter \? (\d+) : 0/ },
  happyTransit: { value: [4, 3], file: 'src/sim/sim.js', re: /f\.transit = near\(stops, b, (\d+)\);\s*add\('transit', f\.transit \? (\d+) : 0/ },
  happySmoke: { value: 22, file: 'src/sim/sim.js', re: /f\.pollution = Math\.min\((\d+), this\.pollution\[i\]\)/ },
  happyLand: { value: [3, 2], file: 'src/sim/sim.js', re: /add\('land', f\.land === 'buyer' \? (\d+) : (\d+)/ },
  happyTax: { value: [10, 1.6, 0.8], file: 'src/sim/sim.js', re: /f\.tax = tax > (\d+) \? -\(tax - \d+\) \* ([\d.]+) : \(\d+ - tax\) \* ([\d.]+)/ },
  happyCrowded: { value: 6, file: 'src/sim/sim.js', re: /add\('crowded', f\.crowded \? -(\d+) : 0/ },
  happyJobs: { value: 14, file: 'src/sim/sim.js', re: /add\('jobs', -f\.unemployed \* (\d+)/ },
  happyRoad: { value: 25, file: 'src/sim/sim.js', re: /add\('road', b\.connected \? 0 : -(\d+)/ },
  // every factor the game adds up, so a new one fails the check until the wiki lists it
  happyKeys: { keys: ['base', 'water', 'health', 'education', 'safety', 'culture', 'power', 'appeal', 'shops', 'play', 'potter', 'transit', 'pollution', 'land', 'tax', 'crowded', 'jobs', 'road'], file: 'src/sim/sim.js', all: /\badd\('(\w+)'|\['(base)', \d+/g },
  moodWork: { value: [4, 8], file: 'src/sim/sim.js', re: /r\.job \? (\d+) : r\.school != null \? 0 : -(\d+)/ },

  // ---------------------------------------------------- arrivals and leaving
  arriveHappy: { value: 38, file: 'src/sim/sim.js', re: /vacantHomes\(\)\.filter\(b => b\.happiness >= (\d+)\)/ },
  leaveHappy: { value: [28, 0.35], file: 'src/sim/sim.js', re: /b\.happiness < (\d+) && rng\.chance\(([\d.]+)\)/ },

  // ----------------------------------------------------------- money
  taxDefault: { value: 10, file: 'src/world/world.js', re: /this\.taxRate = (\d+);/ },
  taxRange: { value: [0, 20], file: 'src/ui/ui.js', re: /id="tax" min="(\d+)" max="(\d+)"/ },
  taxWorker: { value: [6, 1], file: 'src/sim/sim.js', re: /inc\.taxes \+= \(r\.job \? (\d+) \* hk : (\d+)\) \* tk/ },
  taxElder: { value: 1.5, file: 'src/sim/sim.js', re: /else if \(r\.age === 'elder'\) inc\.taxes \+= ([\d.]+) \* tk/ },
  poweredIncome: { value: 1.15, file: 'src/sim/sim.js', re: /\(b\.powered \? ([\d.]+) : 1\)/ },
  demolishRefund: { value: 0.25, file: 'src/world/world.js', re: /removeBuilding\(id, refund = ([\d.]+)\)/ },
  joinCost: { value: [120, 0.3], file: 'src/world/world.js', re: /const cost = Math\.round\((\d+) \+ def\.levels\[level\]\.cost \* ([\d.]+)\);/ },
  moveCost: { value: [40, 0.3], file: 'src/world/world.js', re: /moveCost\(b\) \{ return Math\.round\((\d+) \+ this\.buildValue\(b\) \* ([\d.]+)\); \}/ },
  restyle: { value: [0.3, 30], file: 'src/world/world.js', re: /const RESTYLE = ([\d.]+);[\s\S]*?Math\.max\((\d+), Math\.round\(this\.buildValue\(b\) \* RESTYLE\)\)/ },

  // ---------------------------------------------------- services and utilities
  reachStaff: { value: 0.5, file: 'src/sim/sim.js', re: /L\.radius \* \(([\d.]+) \+ [\d.]+ \* Math\.min\(1, k\)\)/ },
  powerDemand: { value: [0.5, 0.2, 0.25], file: 'src/sim/sim.js', re: /pDem \+= ([\d.]+) \+ ([\d.]+) \* capOf\(b, 'housing'\) \+ ([\d.]+) \* capOf\(b, 'jobs'\)/ },
  waterUnstaffed: { value: 0.3, file: 'src/sim/sim.js', re: /sizeK\(b\) \* \(([\d.]+) \+ [\d.]+ \* this\.staffOf\(b\)\)/ },

  // ---------------------------------------------------------- research
  villagersPerPoint: { value: 60, file: 'src/sim/sim.js', re: /Math\.floor\(w\.population \/ (\d+)\);\s*if \(v\) out\.push\(\{ name: 'Villagers'/ },

  // ------------------------------------------------------------ people
  eduPay: { value: [0.85, 0.95, 1, 1.15, 1.35, 1.6], file: 'src/sim/people.js', re: /const EDU_PAY = \[([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\];/ },
  schoolAges: { value: [6, 11, 14], file: 'src/sim/people.js', re: /stageForAge = \(y\) => \(y < (\d+) \? 0 : y < (\d+) \? 1 : y < (\d+) \? 2 : 3\)/ },
  pension: { value: 3, file: 'src/sim/people.js', re: /pensionOf = \(r\) => \(r\.age === 'elder' \? (\d+) : 0\)/ },

  // ------------------------------------------------------------ the game
  speeds: { value: [1, 2, 4, 8, 16, 32], file: 'play/index.html', re: /data-speed="(\d+)" title="Normal speed"[\s\S]*?data-speed="(\d+)"[\s\S]*?data-speed="(\d+)"[\s\S]*?data-speed="(\d+)"[\s\S]*?data-speed="(\d+)"[\s\S]*?data-speed="(\d+)"/ },
  sizes: { value: [32, 48, 64, 80], file: 'src/ui/ui.js', re: /<option value="(\d+)">Small[\s\S]*?<option value="(\d+)" selected>Medium[\s\S]*?<option value="(\d+)">Large[\s\S]*?<option value="(\d+)">Huge/ },
  maxPlayers: { value: 8, file: 'src/net/session.js', re: /MAX_PLAYERS = (\d+)/ },
  mergeMax: { value: 96, file: 'src/save/merge.js', re: /MERGE_MAX_N = (\d+)/ },
};

// The value of a fact (the first, or the nth of a list).
export const fact = (k, n = 0) => { const v = FACTS[k].value; return Array.isArray(v) ? v[n] : v; };
