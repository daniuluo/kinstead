// Grows a lived-in village automatically — used behind the title screen.

import { RNG } from '../util/rng.js';
import { BUILDINGS } from '../defs.js';

const FREE = { free: true, ignoreMoney: true, ignoreUnlock: true };

export function growDemoTown(world, seed, size = 1) {
  const rng = new RNG(seed);
  const N = world.N, t = world.terrain;
  let start = null;
  for (const b of world.buildings.values()) if (b.type === 'townhall') start = { x: b.x + 1, z: b.z + 1 };
  start ||= { x: N >> 1, z: N >> 1 };
  const R = 9 + 4 * size;

  // streets
  for (let k = 0; k < 26 * size; k++) {
    const roads = [];
    for (let z = start.z - R; z <= start.z + R; z++) for (let x = start.x - R; x <= start.x + R; x++) {
      if (world.roadAt(x, z) && Math.hypot(x - start.x, z - start.z) < R) roads.push([x, z]);
    }
    if (!roads.length) break;
    const [sx, sz] = rng.pick(roads);
    const [dx, dz] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const len = rng.int(3, 7);
    const lvl = Math.hypot(sx - start.x, sz - start.z) < 5 ? 2 : 1;
    const tiles = [];
    for (let i = 1; i <= len; i++) {
      const x = sx + dx * i, z = sz + dz * i;
      if (!world.inBounds(x, z) || t.isWater(x, z) || t.slope(x, z) > 0.6 || world.buildingOn(x, z)) break;
      if (world.roadAt(x - dz, z - dx) && world.roadAt(x + dz, z + dx) && i > 1) break;
      tiles.push([x, z]);
    }
    for (const [x, z] of tiles) {
      world.roads[world.idx(x, z)] = Math.max(world.roads[world.idx(x, z)], lvl);
      world._clearTrees(x, z);
    }
  }
  // upgrade the main street near the centre
  for (let z = start.z - 4; z <= start.z + 4; z++) for (let x = start.x - 4; x <= start.x + 4; x++) {
    if (world.roadAt(x, z)) world.roads[world.idx(x, z)] = 2;
  }
  world.updateRoadNetwork();

  // buildings along the streets
  const spots = [];
  for (let z = start.z - R; z <= start.z + R; z++) for (let x = start.x - R; x <= start.x + R; x++) {
    if (world.inBounds(x, z)) spots.push([x, z, Math.hypot(x - start.x, z - start.z) + rng.next() * 3]);
  }
  spots.sort((a, b) => a[2] - b[2]);
  const weights = [
    ['house', 34], ['market', 3], ['bakery', 2], ['tavern', 2], ['farm', 3], ['lumber', 2], ['fishery', 2],
    ['workshop', 2], ['well', 3], ['clinic', 1], ['school', 1], ['watch', 1], ['chapel', 1], ['garden', 4],
    ['plaza', 1], ['flowers', 2], ['statue', 1], ['coachstop', 1],
  ];
  const total = weights.reduce((s, w) => s + w[1], 0);
  const pickType = () => { let r = rng.next() * total; for (const [k, w] of weights) { if ((r -= w) <= 0) return k; } return 'house'; };
  const count = { };
  for (const [x, z, d] of spots) {
    let type = pickType();
    if (d > R - 3 && rng.chance(0.5)) type = rng.chance(0.5) ? 'farm' : 'house';
    const def = BUILDINGS[type];
    if ((type === 'clinic' || type === 'school' || type === 'chapel' || type === 'plaza' || type === 'statue') && count[type]) continue;
    if (def.size === 2 && rng.chance(0.4)) continue;
    const near = d < 6;
    let level = 0;
    const maxL = def.levels.length - 1;
    if (type === 'house') level = Math.min(maxL, near ? rng.int(1, 2) : rng.int(0, 1));
    else level = Math.min(maxL, rng.int(0, maxL));
    const r = world.placeBuilding(type, x, z, { ...FREE, level });
    if (r.ok) count[type] = (count[type] || 0) + 1;
  }
}
