// Focused P1 checks that do not need WebGL.  The full suite remains the
// Kinstead regression gate; this verifies the observer's own boundaries.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { createWindowTown, WINDOW_SEED, WINDOW_SIZE, WINDOW_TOWN_ID } from '../src/window/town.js';
import { WINDOW_SAVE_FORMAT, WINDOW_SAVE_KEY, WINDOW_SAVE_VERSION, readWindowSave, saveWindow } from '../src/window/windowSave.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

function seedFounders(world) {
  const game = {
    world,
    speed: 1,
    emit() {},
    agents: { arrive() {}, depart() {} },
  };
  const sim = new Sim(game);
  // Keep the first population recipe repeatable too; the builder's default
  // Sim seed is deliberately random because ordinary new towns are unique.
  sim.rng.state = WINDOW_SEED;
  sim.seedFounders();
}

console.log('Living Window');
let original;
check('the recipe makes a stable 44 by 44 town', () => {
  original = createWindowTown();
  seedFounders(original);
  assert.equal(original.N, WINDOW_SIZE);
  assert.equal(original.seed, WINDOW_SEED);
  assert.equal(original.townId, WINDOW_TOWN_ID);
  assert.ok(original.buildings.size >= 12, 'expected the demo grower to populate buildings');
  assert.ok(original.residents.size > 0, 'expected founders in the populated town');
});

check('the observer envelope round-trips identity and current state', () => {
  const storage = new MemoryStorage();
  const record = saveWindow(original, storage, new Date('2026-11-10T12:00:00.000Z'));
  assert.equal(record.format, WINDOW_SAVE_FORMAT);
  assert.equal(record.version, WINDOW_SAVE_VERSION);
  assert.equal(storage.getItem('hearthvale.saves.v1'), null);
  assert.equal(storage.getItem('hearthvale.slot.autosave'), null);
  const restored = readWindowSave(storage);
  assert.equal(restored.status, 'loaded');
  assert.equal(restored.world.townId, original.townId);
  assert.equal(restored.world.seed, original.seed);
  assert.equal(restored.world.buildings.size, original.buildings.size);
  assert.equal(restored.world.residents.size, original.residents.size);
  assert.equal(restored.world.day, original.day);
  assert.equal(restored.world.hours, original.hours);
});

check('a corrupt or future save is left intact', () => {
  const storage = new MemoryStorage();
  const corrupt = '{ this is not json';
  storage.setItem(WINDOW_SAVE_KEY, corrupt);
  assert.equal(readWindowSave(storage).status, 'corrupt');
  assert.equal(storage.getItem(WINDOW_SAVE_KEY), corrupt);
  const future = JSON.stringify({ format: WINDOW_SAVE_FORMAT, version: WINDOW_SAVE_VERSION + 1, kinstead: {} });
  storage.setItem(WINDOW_SAVE_KEY, future);
  assert.equal(readWindowSave(storage).status, 'future');
  assert.equal(storage.getItem(WINDOW_SAVE_KEY), future);
});

check('the route is isolated and the engine gates observer mutation', () => {
  const page = fs.readFileSync(path.join(ROOT, 'window/index.html'), 'utf8');
  const play = fs.readFileSync(path.join(ROOT, 'play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'window/window.css'), 'utf8');
  const game = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  const input = fs.readFileSync(path.join(ROOT, 'src/ui/input.js'), 'utf8');
  assert.match(page, /src="\.\.\/src\/window\/main\.js"/);
  assert.match(page, /href="window\.css"/);
  assert.match(page, /location\.protocol === 'file:'/);
  assert.match(page, /fileProtocolNotice/);
  assert.match(play, /location\.protocol === 'file:'/);
  assert.match(play, /file-protocol-note/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(game, /this\.observer \? 'living-window\.settings\.v1'/);
  assert.match(game, /if \(this\.observer\) \{\s*const r = \{ ok: false, error: 'Living Window is read-only\.'/);
  assert.match(game, /if \(fresh && this\.observer\) this\.sim\.rng = new RNG\(world\.seed\)/);
  assert.match(game, /if \(this\.observer\) \{\s*try \{ return this\.observerAutosave/);
  assert.match(input, /this\.game\.observer/);
});

if (!process.exitCode) console.log(`\n${passed} ok, 0 FAIL`);
