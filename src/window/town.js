// The P1 town recipe is intentionally small, fixed and wholly local.  Later
// milestones may offer presets, but this gives the observer a dependable
// starting point without touching Kinstead's builder flow.

import { World } from '../world/world.js';
import { growDemoTown } from '../world/demo.js';

export const WINDOW_SIZE = 44;
export const WINDOW_SEED = 442024;
export const WINDOW_TOWN_ID = 'livingwindow44';

export function createWindowTown() {
  const world = World.createNew({
    N: WINDOW_SIZE,
    seed: WINDOW_SEED,
    name: 'Living Window',
    relief: 'hilly',
  });
  // createNew intentionally creates a unique builder-town id.  The observer
  // has one named world, so its identity is stable across first launches.
  world.townId = WINDOW_TOWN_ID;
  growDemoTown(world, WINDOW_SEED, 1);
  return world;
}
