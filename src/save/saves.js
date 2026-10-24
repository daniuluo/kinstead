// Save format + local (browser) save slots + file export/import.

import { World } from '../world/world.js';
import { Terrain } from '../world/terrain.js';
import { BUILDINGS, TECHS } from '../defs.js';
import { titleFor, dressValid } from '../config.js';
import { tidyDiag } from '../world/diagonal.js';
import { cleanText, cleanColor, hasKey, newTownId, isTownId } from '../util/text.js';
import { pack, unpack } from './pack.js';

export const SAVE_FORMAT = 'hearthvale-save';   // the game's old name, kept so every save still loads
export const SAVE_VERSION = 1;

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b) {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export function serialize(world) {
  const H = world.terrain.H;
  const q = new Int16Array(H.length);
  for (let i = 0; i < H.length; i++) q[i] = Math.round(H[i] * 1000);
  const trees = [];
  for (const t of world.trees) trees.push(Math.round(t.x * 100), Math.round(t.z * 100), t.k, Math.round(t.s * 100), Math.round(t.r * 100));
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    name: world.townName,
    townId: world.townId || null,
    seed: world.seed,
    N: world.N,
    heights: toB64(new Uint8Array(q.buffer)),
    roads: toB64(world.roads),
    rails: toB64(world.rails),
    ...(world.buried && world.buried.some((v, i) => v && world.roads[i]) ? { buried: toB64(world.buried.map((v, i) => (v && world.roads[i] ? 1 : 0))) } : {}),
    ...(world.dress && world.dress.some((v, i) => v && world.roads[i]) ? { dress: toB64(world.dress.map((v, i) => (world.roads[i] ? v : 0))) } : {}),
    // diagonal streets (older saves have none)
    ...(world.diagN ? { diag: toB64(world.diag.map((v, i) => (world.roads[i] ? v : 0))) } : {}),
    ...(world.fieldTiles && world.fieldTiles.size ? { fields: [...world.fieldTiles].map(([id, tiles]) => [id, ...tiles]) } : {}),
    buildings: [...world.buildings.values()].map(b => [b.id, b.type, b.level, b.x, b.z, b.variant, b.rot, b.built, b.w ?? b.size, b.d ?? b.size, b.flavor || null, b.con || null, b.leases && b.leases.length ? b.leases : null, b.look || null, b.spare ? [b.spare.w, b.spare.d, ...(b.spare.sx != null ? [b.spare.sx, b.spare.sz] : [])] : null]),
    trees,
    residents: [...world.residents.values()].map(r => [r.id, r.first, r.last, r.age, r.home ?? -1, r.job ?? -1, r.look, r.wealth ?? null, r.fam ?? null, r.years != null ? Math.round(r.years * 100) / 100 : null, r.edu ?? null, r.edYrs ?? null]),
    lines: world.lines.map(l => ({ id: l.id, mode: l.mode, name: l.name, color: l.color, stops: l.stops.slice(), vehicles: l.vehicles })),
    state: {
      money: Number.isFinite(world.money) ? world.money : 0, sandbox: world.sandbox, taxRate: world.taxRate, day: world.day, hours: world.hours, nextId: world.nextId,
      entry: world.entry, history: world.history, titleIdx: world.titleIdx, stats: world.stats, research: world.research, eduScale: 5,
    },
    meta: { day: world.day, pop: world.population, money: Number.isFinite(world.money) ? Math.round(world.money) : '∞', title: titleFor(world.population).name },
  };
}

export function deserialize(data) {
  if (!data || data.format !== SAVE_FORMAT) throw new Error('This file is not a Kinstead save.');
  if (data.version > SAVE_VERSION) throw new Error('This save was made by a newer version of Kinstead.');
  const N = data.N;
  const raw = fromB64(data.heights);
  const q = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const H = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) H[i] = q[i] / 1000;
  const w = new World(N, data.seed, new Terrain(N, H));
  w.townName = cleanText(data.name, 40) || 'Kinstead';
  w.townId = isTownId(data.townId) ? data.townId : newTownId();
  w.roads.set(fromB64(data.roads).subarray(0, N * N));
  if (data.rails) w.rails.set(fromB64(data.rails).subarray(0, N * N));
  if (typeof data.buried === 'string') w.buried.set(fromB64(data.buried).subarray(0, N * N).map(v => (v ? 1 : 0)));
  if (typeof data.dress === 'string') w.dress.set(fromB64(data.dress).subarray(0, N * N).map((v, i) => (dressValid(v) && w.roads[i] ? v : 0)));
  if (typeof data.diag === 'string') { w.diag.set(fromB64(data.diag).subarray(0, N * N)); tidyDiag(w); }
  const tr = data.trees || [];
  for (let i = 0; i + 4 < tr.length; i += 5) w.addTree(tr[i] / 100, tr[i + 1] / 100, tr[i + 2], tr[i + 3] / 100, tr[i + 4] / 100);
  for (let [id, type, level, x, z, variant, rot, built, bw, bd, flavor, con, leases, look, spare] of data.buildings) {
    if (type === 'house' && level >= 2) [type, level] = level === 2 ? ['flats', 0] : ['villa', level - 2];
    if (!hasKey(BUILDINGS, type)) continue;
    w.restoreBuilding({ id, type, level, x, z, variant, rot, built, w: bw, d: bd, flavor, con, leases, look, spare });
  }
  const oldEdu = (data.state && data.state.eduScale) !== 5;
  for (const [id, first, last, age, home, job, look, wealth, fam, years, edu, edYrs] of data.residents) {
    const r = { id, first: cleanText(first, 24), last: cleanText(last, 24), age, home: home >= 0 ? home : null, job: job >= 0 ? job : null, look, mood: 60 };
    if (wealth != null) r.wealth = wealth;
    if (fam != null) r.fam = fam;
    if (years != null) r.years = years;
    // saves before the five-stage scale: primary → elementary, secondary → high school, advanced → college
    if (edu != null) r.edu = oldEdu ? [0, 1, 3, 4][edu] ?? edu : edu;
    if (edYrs && typeof edYrs === 'object') r.edYrs = edYrs;
    w.residents.set(id, r);
  }
  w.lines = (Array.isArray(data.lines) ? data.lines : []).map(l => ({ ...l, name: cleanText(l.name, 40), color: cleanColor(l.color), stops: (Array.isArray(l.stops) ? l.stops : []).filter(s => w.buildings.has(s)) }));
  const s = data.state;
  Object.assign(w, {
    money: s.money, taxRate: s.taxRate, day: s.day, hours: s.hours, nextId: s.nextId, entry: s.entry,
    history: s.history || [], titleIdx: s.titleIdx || 0,
  });
  Object.assign(w.stats, s.stats || {});
  if (s.sandbox) w.setSandbox(s.sandbox);
  // saves from before research existed keep everything they could already build
  if (s.research) w.research = { done: [], current: null, progress: 0, bank: 0, ...s.research };
  else w.research.done = Object.keys(TECHS);
  // farmland, for the farms that are there, on ground nothing else stands on
  if (Array.isArray(data.fields)) {
    for (const [id, ...tiles] of data.fields) {
      const b = w.buildings.get(id);
      if (!b || !BUILDINGS[b.type].fields) continue;
      for (const i of tiles) if (Number.isInteger(i) && i >= 0 && i < N * N && w.buildingAt[i] < 0 && !w.roads[i] && !w.rails[i]) w.fields[i] = id;
    }
  }
  w._countFields();
  w.updateRoadNetwork();
  w.updateRailLinks();
  return w;
}

// ------------------------------------------------------------ local slots

const INDEX_KEY = 'hearthvale.saves.v1';
const SLOT_KEY = (id) => `hearthvale.slot.${id}`;

export const LocalSaves = {
  list() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch { return []; }
  },
  _writeIndex(idx) { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); },
  save(id, data, thumb) {
    const idx = this.list().filter(e => e.id !== id);
    // packed to about a third (src/save/pack.js), so big towns fit in the browser
    const text = pack(JSON.stringify(data));
    const entry = { id, name: data.name, town: data.townId || null, day: data.meta.day, pop: data.meta.pop, money: data.meta.money, title: data.meta.title, savedAt: data.savedAt, thumb: thumb || null };
    try {
      localStorage.setItem(SLOT_KEY(id), text);
      idx.unshift(entry);
      this._writeIndex(idx);
    } catch (e) {
      // Out of space: retry without thumbnails.
      try {
        for (const x of idx) x.thumb = null;
        entry.thumb = null;
        localStorage.setItem(SLOT_KEY(id), text);
        idx.unshift(entry);
        this._writeIndex(idx);
      } catch {
        throw new Error('Browser storage is full. Delete an old save or export to a file.');
      }
    }
    return entry;
  },
  load(id) {
    const s = localStorage.getItem(SLOT_KEY(id));
    if (!s) throw new Error('Save not found.');
    return JSON.parse(unpack(s));
  },
  remove(id) {
    localStorage.removeItem(SLOT_KEY(id));
    this._writeIndex(this.list().filter(e => e.id !== id));
  },
  has(id) { return !!localStorage.getItem(SLOT_KEY(id)); },
  // Copy one slot to another (quietly does nothing if storage is full).
  copy(from, to) {
    const s = localStorage.getItem(SLOT_KEY(from)), e = this.list().find(x => x.id === from);
    if (!s || !e) return false;
    try {
      localStorage.setItem(SLOT_KEY(to), s);
      this._writeIndex([...this.list().filter(x => x.id !== to), { ...e, id: to }]);
      return true;
    } catch { return false; }
  },
};

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { try { resolve(JSON.parse(fr.result)); } catch { reject(new Error('That file is not valid JSON.')); } };
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

export function saveFileName(world) {
  return fileNameOf(world.townName, world.day);
}

// File name for an already-serialized save (e.g. a browser slot).
export function saveFileNameFor(data) {
  return fileNameOf(data.name || 'town', data.meta?.day ?? data.state?.day ?? 1);
}

function fileNameOf(name, day) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'town';
  return `${slug}-day${day}.kinstead.json`;
}
