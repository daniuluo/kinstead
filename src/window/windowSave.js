// A deliberately separate envelope for the observer.  Kinstead's legacy
// LocalSaves slots stay untouched, so opening /window/ cannot replace a
// builder town or silently "upgrade" an old save.

import { deserialize, serialize } from '../save/saves.js';

export const WINDOW_SAVE_KEY = 'living-window.v1';
export const WINDOW_SAVE_FORMAT = 'living-window';
export const WINDOW_SAVE_VERSION = 1;

function failure(kind, message) {
  return { status: kind, message };
}

export function readWindowSave(storage = globalThis.localStorage) {
  let raw;
  try { raw = storage.getItem(WINDOW_SAVE_KEY); }
  catch { return failure('unavailable', 'Browser storage is unavailable.'); }
  if (raw == null) return { status: 'missing' };

  let record;
  try { record = JSON.parse(raw); }
  catch { return failure('corrupt', 'The saved Living Window data is not valid JSON.'); }
  if (!record || record.format !== WINDOW_SAVE_FORMAT || !Number.isInteger(record.version) || !record.kinstead) {
    return failure('corrupt', 'The saved Living Window data has an unrecognized format.');
  }
  if (record.version > WINDOW_SAVE_VERSION) {
    return failure('future', 'This Living Window save was made by a newer version.');
  }
  if (record.version !== WINDOW_SAVE_VERSION) {
    return failure('unsupported', `Living Window save version ${record.version} is not supported.`);
  }
  try {
    return { status: 'loaded', world: deserialize(record.kinstead), record };
  } catch (error) {
    return failure('corrupt', `The saved Living Window town could not be read: ${error.message}`);
  }
}

export function saveWindow(world, storage = globalThis.localStorage, now = new Date()) {
  const record = {
    format: WINDOW_SAVE_FORMAT,
    version: WINDOW_SAVE_VERSION,
    savedAt: now.toISOString(),
    kinstead: serialize(world),
  };
  // setItem is intentionally the only mutation here.  On parse, version or
  // quota errors callers keep the existing bytes rather than clearing them.
  storage.setItem(WINDOW_SAVE_KEY, JSON.stringify(record));
  return record;
}
