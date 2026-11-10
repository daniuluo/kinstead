import { Game } from '../game.js';
import { createWindowTown } from './town.js';
import { readWindowSave, saveWindow } from './windowSave.js';

const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
const $ = (id) => document.getElementById(id);

function clockText(hours) {
  const mins = Math.max(0, Math.min(23 * 60 + 59, Math.round(hours * 60)));
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function fail(message) {
  const messageEl = $('windowMessage');
  messageEl.hidden = false;
  messageEl.textContent = message;
}

function boot() {
  const restored = readWindowSave();
  // Even if the stored bytes cannot be trusted, the temporary fallback should
  // still use the complete deterministic founding recipe.  `recoverable`
  // below, not `fresh`, decides whether that scene may be written back.
  const fresh = restored.status !== 'loaded';
  const recoverable = restored.status === 'missing' || restored.status === 'loaded';
  const world = restored.status === 'loaded' ? restored.world : createWindowTown();
  const game = new Game({ observer: true });
  game.load(world, { fresh });

  const saveState = (quiet = false) => {
    if (!recoverable) return false;
    try {
      const record = saveWindow(game.world);
      if (!quiet) $('windowSave').textContent = `Saved ${new Date(record.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return true;
    } catch (error) {
      fail(`This view is still running, but it could not save: ${error.message}`);
      return false;
    }
  };
  game.observerAutosave = () => saveState(true);

  if (fresh) saveState(true);
  if (!recoverable) {
    // Never overwrite the raw bytes that failed validation.  The new scene is
    // view-only until that saved data is recovered or cleared deliberately.
    fail(`${restored.message} The existing save was left untouched; this temporary view will not save.`);
  }

  const renderStatus = () => {
    const env = game.env;
    $('windowTown').textContent = game.world.townName;
    $('windowTime').textContent = `Day ${game.world.day} - ${clockText(game.world.hours)}`;
    $('windowMeta').textContent = `${seasons[env.season] || 'Season'} - ${game.world.population} residents`;
    $('windowWeather').textContent = env.snowing ? 'snowfall' : env.rain > 0.18 ? 'rain' : env.cloud > 0.62 ? 'clouded' : 'clear';
    if (recoverable && !$('windowMessage').hidden) return;
    if (recoverable) $('windowSave').textContent = 'Local living town';
  };

  game.on('day', renderStatus);
  renderStatus();
  window.setInterval(renderStatus, 1000);
}

try {
  boot();
} catch (error) {
  console.error(error);
  fail(`Living Window could not start: ${error && error.message ? error.message : error}`);
}
