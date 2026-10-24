// The browser half of scripts/site-shots.js: loaded into the game page, it
// sets up each landing-page picture in a real town and posts it back to the
// server, which saves it in img/. Frames are stepped by hand, so it works in
// a hidden browser tab too. /shots?only=hero,night retakes just those.

import { CONFIG } from '../src/config.js';
import { BUILDINGS } from '../src/defs.js';
import { STARTERS } from '../src/world/starters.js';
import { newVillage, mergeTowns, besideOffset } from '../src/save/merge.js';
import { deserialize } from '../src/save/saves.js';
import { fw, fd } from '../src/world/world.js';

// name, the town, the canvas size (pixel art at 2× makes the picture half
// that), what to look at, the zoom, the time of day and the season
// (0 spring … 3 winter), and a quarter turn of the view (view).
const SHOTS = [
  { name: 'hero', town: 'city', W: 1920, H: 960, focus: 'townhall', zoom: 0.8, hours: 10.5, season: 1 },
  { name: 'og', town: 'city', W: 1200, H: 630, focus: 'townhall', zoom: 0.95, hours: 10.5, season: 1, sky: true, scale: 2 },
  { name: 'highstreet', town: 'city', W: 960, H: 600, focus: 'arcade', zoom: 4, hours: 11, season: 1 },
  { name: 'estates', town: 'city', W: 960, H: 600, focus: 'cathedralclose', zoom: 4.6, hours: 14.5, season: 1 },
  { name: 'civic', town: 'city', W: 960, H: 600, focus: 'townhall', zoom: 3.4, hours: 14.5, season: 1 },
  { name: 'villagers', town: 'market', W: 960, H: 600, focus: 'bakery', lineup: true, zoom: 15, gap: 0.1, hours: 11, season: 1 },
  { name: 'night', town: 'city', W: 960, H: 600, focus: 'townhall', zoom: 2.1, hours: 21.6, season: 1 },
  { name: 'starters', town: 'market', W: 960, H: 600, focus: 'townhall', zoom: 2.5, hours: 10, season: 1 },
  { name: 'tiltshift', town: 'market', W: 960, H: 600, focus: 'townhall', zoom: 1.7, hours: 15.5, season: 2, tilt: 'strong' },
  { name: 'seasons', town: 'market', W: 960, H: 600, focus: 'townhall', zoom: 2.3, hours: 12, seasons: true },
  { name: 'farms', town: 'mill', W: 960, H: 600, focus: 'farm', zoom: 2.4, hours: 11, season: 1, fields: true },
  { name: 'merge', merge: ['market', 'hamlet'], W: 960, H: 600, zoom: 1.6, fit: true, hours: 10, season: 1 },
  { name: 'gondola', town: 'market', W: 960, H: 600, gondola: true, zoom: 3.2, hours: 10.5, season: 1 },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const say = (msg) => { console.log('[shots]', msg); fetch('/log', { method: 'POST', body: String(msg) }).catch(() => {}); };
const G = () => window.kinstead;

// Step the game by hand (a hidden tab gets almost no animation frames).
function step(n, render = false) {
  const g = G();
  for (let i = 0; i < n; i++) { g.clock = performance.now() - 100; g.frame(render); }
}

// Draw at exactly W×H (the renderer otherwise follows the window).
function sizeTo(W, H) {
  const R = G().renderer;
  R.renderer.setSize(W, H, false);
  if (R.post) { R.post.composer.setPixelRatio(R.renderer.getPixelRatio()); R.post.composer.setSize(W, H); }
  const halfH = CONFIG.VIEW_HEIGHT / 2, halfW = halfH * (W / H);
  Object.assign(R.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  R.camera.updateProjectionMatrix();
}

// The picture just drawn, one pixel per art pixel.
function grab() {
  const R = G().renderer, c = R.canvas, ps = R.post && R.post.pix ? R.pixelScale : 1;
  const tmp = document.createElement('canvas');
  tmp.width = c.width; tmp.height = c.height;
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.drawImage(c, 0, 0);
  if (ps === 1) return tmp;
  const W = Math.floor(c.width / ps), H = Math.floor(c.height / ps);
  const src = t.getImageData(0, 0, c.width, c.height).data, out = new ImageData(W, H), o = out.data, h = ps >> 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = ((y * ps + h) * c.width + x * ps + h) * 4, di = (y * W + x) * 4;
    o[di] = src[si]; o[di + 1] = src[si + 1]; o[di + 2] = src[si + 2]; o[di + 3] = src[si + 3];
  }
  const res = document.createElement('canvas');
  res.width = W; res.height = H;
  res.getContext('2d').putImageData(out, 0, 0);
  return res;
}

// WebP at a high quality: a sixth of the size of a PNG of the same pixels,
// with no artefacts to speak of once scaled up (the social card is a JPEG,
// which every site that shows link previews reads).
async function post(name, canvas, type = 'webp', q = 0.92) {
  const ext = type === 'jpeg' ? 'jpg' : type;
  const r = await fetch(`/shot?name=${name}.${ext}`, { method: 'POST', body: canvas.toDataURL(`image/${type}`, q) });
  say(`${name}.${ext}: ${canvas.width}×${canvas.height} ${r.ok ? 'saved' : 'FAILED'}`);
}

let loaded = null;
async function loadTown(spec) {
  const key = spec.merge ? spec.merge.join('+') : spec.town;
  if (loaded === key) return;
  const g = G();
  if (spec.merge) {
    // town B set down a few tiles to the right of town A's buildings, level
    // with them, so the picture shows both towns and the join between
    const [a, b] = spec.merge.map(s => newVillage({ starter: s }));
    const box = (d) => {
      const w = deserialize(structuredClone(d));
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const o of w.buildings.values()) { x0 = Math.min(x0, o.x); z0 = Math.min(z0, o.z); x1 = Math.max(x1, o.x + fw(o)); z1 = Math.max(z1, o.z + fd(o)); }
      return { x0, z0, x1, z1 };
    };
    const A = box(a), B = box(b);
    const arr = { x: Math.round(A.x1 + 5 - B.x0), z: Math.round((A.z0 + A.z1) / 2 - (B.z0 + B.z1) / 2), rot: 0 };
    let r;
    try { r = mergeTowns(a, b, arr); } catch { r = mergeTowns(a, b, besideOffset(a.N, b.N, 'right')); }
    g.loadData(r.data);
  } else {
    const def = STARTERS.find(s => s.id === spec.town);
    g.newGame({ name: def.town, starter: def.id });
  }
  g.ui.closeAllWindows();
  loaded = key;
  step(20);
}

// A day in the given season (the same year), with fair weather.
function setDay(season, plus = 2) {
  const g = G(), w = g.world, D = CONFIG.DAYS_PER_SEASON;
  const yearStart = w.day - ((w.day - 1) % (4 * D));
  let best = null;
  for (const dd of [plus, plus + 1, plus - 1, plus + 2]) {
    w.day = yearStart + season * D + dd;
    step(1);
    const cloud = (g.sky.cloud || 0) + (g.sky.rain || 0) * 2;
    if (!best || cloud < best.cloud) best = { day: w.day, cloud };
    if (cloud < 0.12) break;
  }
  w.day = best.day;
}

function centre(w) {
  let x = 0, z = 0, n = 0;
  for (const b of w.buildings.values()) { x += b.x + fw(b) / 2; z += b.z + fd(b) / 2; n++; }
  return n ? { x: x / n, z: z / n } : { x: w.N / 2, z: w.N / 2 };
}
function focusOn(w, type) {
  const c = centre(w);
  // (the town hall: the seat, whatever it has grown into)
  const th = [...w.buildings.values()].find(b => BUILDINGS[b.type].seat);
  const at = th ? { x: th.x + 0.5, z: th.z + 0.5 } : c;
  if (!type) return c;
  let best = null, bd = Infinity;
  for (const b of w.buildings.values()) {
    if (b.type !== type && !(type === 'townhall' && BUILDINGS[b.type].seat)) continue;
    const d = Math.hypot(b.x - at.x, b.z - at.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best ? { x: best.x + fw(best) / 2, z: best.z + fd(best) / 2 } : c;
}
// The zoom that fits every building in a W×H picture (the isometric view
// sees a box of buildings about 0.75 × (width + depth) across).
function fitZoom(w, W, H, most) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of w.buildings.values()) { x0 = Math.min(x0, b.x); z0 = Math.min(z0, b.z); x1 = Math.max(x1, b.x + fw(b)); z1 = Math.max(z1, b.z + fd(b)); }
  const across = CONFIG.VIEW_HEIGHT * (W / H);
  return { zoom: Math.min(most, across / (0.75 * ((x1 - x0) + (z1 - z0)) + 3)), p: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 } };
}
// Where the most villagers are out and about (a 2-tile square).
function crowd() {
  const g = G(), bins = new Map();
  for (const a of g.agents.walkers.values ? g.agents.walkers.values() : g.agents.walkers) {
    if (a.x == null || a.ghost) continue;
    const k = `${Math.floor(a.x / 2)},${Math.floor(a.z / 2)}`;
    bins.set(k, (bins.get(k) || 0) + 1);
  }
  const best = [...bins.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [bx, bz] = best[0].split(',').map(Number);
  return { x: bx * 2 + 1, z: bz * 2 + 1 };
}
function aim(p, zoom, view = null) {
  const R = G().renderer, rig = R.rig;
  R.lookAt(p.x, p.z, true);
  // (p.y: look at a point up in the air, not on the ground)
  if (p.y != null) rig.target.y = rig.goal.y = p.y;
  rig.zoom = rig.zoomT = zoom;
  // (view: a quarter turn round, to see a building from its front)
  if (view != null) { rig.view = view; rig.turnT = (view * Math.PI) / 2; }
  rig.turn = rig.turnT; rig.base = rig.baseT; rig.elev = rig.elevT;
}

// Plough the mill town's farm a field or two and grow wheat, for the picture.
function plough(w, at) {
  for (const b of w.buildings.values()) {
    if (!BUILDINGS[b.type].fields) continue;
    const tiles = [];
    for (let z = b.z - 4; z < b.z + fd(b) + 4; z++) for (let x = b.x - 4; x < b.x + fw(b) + 4; x++) tiles.push([x, z]);
    w.setFields(b.id, tiles, true);
    if (Math.hypot(b.x - at.x, b.z - at.z) < 1) w.setProduce(b.id, 'wheat');
  }
}

// A gondola line across the town for its picture: two stations by the road
// either side of the middle, the line running across the view (from the
// left of the picture to the right) and over the roofs, with its cabins
// spread along it. Returns the middle of the line.
function gondola(w, p) {
  const g = G();
  w.setSandbox({ ...w.sandbox, infiniteMoney: true, unlockAll: true });
  const open = (x, z) => w.inBounds(x, z) && !w.buildingOn(x, z) && !w.roadAt(x, z) && !w.terrain.isWater(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.roadAt(x + dx, z + dz));
  const under = (a, b) => {
    const seen = new Set(), L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let u = 0; u <= L; u += 0.25) { const o = w.buildingOn(Math.floor(a.x + 0.5 + ((b.x - a.x) * u) / L), Math.floor(a.z + 0.5 + ((b.z - a.z) * u) / L)); if (o) seen.add(o.id); }
    return seen.size;
  };
  // the best pair: across the view, near the middle, over the most roofs,
  // with open ground halfway for a pylon
  let best = null;
  for (let z = Math.floor(p.z) - 9; z <= p.z + 9; z++) for (let x = Math.floor(p.x) - 9; x <= p.x + 9; x++) {
    if (!open(x, z)) continue;
    for (let z2 = z - 10; z2 <= z; z2++) for (let x2 = x; x2 <= x + 10; x2++) {
      const d = Math.hypot(x2 - x, z2 - z), across = ((x2 - x) - (z2 - z)) / Math.SQRT2 / (d || 1);
      if (d < 7.5 || d > 10 || across < 0.93 || !open(x2, z2)) continue;
      const mx = (x + x2) / 2 + 0.5, mz = (z + z2) / 2 + 0.5;
      const pylon = [-1, -0.5, 0, 0.5, 1].some(o => g.transit._pylonFits(mx + ((x2 - x) / d) * o, mz + ((z2 - z) / d) * o));
      const score = under({ x, z }, { x: x2, z: z2 }) + (pylon ? 4 : 0) - Math.hypot(mx - p.x, mz - p.z) * 0.3;
      if (!best || score > best.score) best = { a: [x, z], b: [x2, z2], score };
    }
  }
  if (!best) return p;
  const st = [best.a, best.b].map(([x, z]) => w.placeBuilding('gondola', x, z, { instant: true })).filter(r => r.ok).map(r => r.building);
  const r = g.transit.createLine('gondola', st.map(b => b.id));
  if (!r.ok) return p;
  g.transit.setVehicles(r.line.id, 8);
  g.transit.rebuild();
  // aimed halfway up, so the stations and the cable sit in the middle
  return { x: (best.a[0] + best.b[0]) / 2 + 0.5, z: (best.a[1] + best.b[1]) / 2 + 0.5, y: (st[0].baseY + st[1].baseY) / 2 + 0.6 };
}

function settings(spec) {
  const g = G(), s = g.settings;
  Object.assign(s, { pixelArt: true, pixelSize: 2, ao: false, tiltShift: spec.tilt || 'off', tiltBand: 'normal', fps: 0, resScale: 1, shadows: true, shadowQuality: 'high', effects: 'full', villagers: 'all', pausedSlow: false });
  g.applySettings();
}

async function render(spec, p) {
  const g = G(), w = g.world;
  let zoom = spec.zoom;
  if (spec.fit) ({ zoom, p } = fitZoom(w, spec.W, spec.H, spec.zoom));
  aim(p, zoom, spec.view ?? 0);
  // let the villagers get about for a few minutes, then hold still
  w.hours = spec.hours - 0.4;
  g.setSpeed(4);
  step(24);
  g.setSpeed(0);
  if (spec.crowd) p = crowd() || p;
  sizeTo(spec.W, spec.H);
  aim(p, zoom, spec.view ?? 0);
  step(3, true);
  g.clock = performance.now() - 16;
  g.frame(true);
  return grab();
}

// Villagers are small beside the buildings, so the people picture lines a
// few of them up on the street outside a shop, close up: grown-ups in the
// clothes of their work, children and the old, walking, shopping, standing.
async function lineup(spec, p) {
  const g = G(), w = g.world, R = g.renderer, ag = g.agents;
  const [V, THREE] = await Promise.all([import('../src/render/villagers.js'), import('three')]);
  // the road tile nearest the shop with nothing built between it and the
  // camera (which looks from +x, +z in the usual view)
  const open = (x, z) => w.inBounds(x, z) && w.buildingAt[w.idx(x, z)] < 0;
  let spot = null, bd = Infinity;
  for (let z = Math.floor(p.z) - 8; z <= p.z + 8; z++) for (let x = Math.floor(p.x) - 8; x <= p.x + 8; x++) {
    if (!w.inBounds(x, z) || !w.roadAt(x, z)) continue;
    if (!open(x + 1, z) || !open(x, z + 1) || !open(x + 1, z + 1) || !open(x + 2, z + 1) || !open(x + 1, z + 2)) continue;
    const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
    if (d < bd) { bd = d; spot = { x: x + 0.5, z: z + 0.5 }; }
  }
  spot ||= p;
  w.hours = spec.hours;
  g.setSpeed(0);
  sizeTo(spec.W, spec.H);
  aim(spot, spec.zoom);
  R.rig.target.y = R.rig.goal.y = w.terrain.heightAt(spot.x, spot.z) + 0.1;
  R.updateCamera(0.016);
  const cam = R.camera.position, hd = Math.atan2(cam.x - spot.x, cam.z - spot.z);
  const rx = Math.cos(hd), rz = -Math.sin(hd);
  const cast = [
    ['Clara', 'adult', 'shop', 'stand'], ['Otto', 'adult', 'farmer', 'walk'], ['Ivy', 'child', null, 'bag'], ['Hugo', 'adult', 'builder', 'stand'],
    ['Mabel', 'elder', null, 'basket'], ['Silas', 'adult', 'clerk', 'walk'], ['Nell', 'adult', 'nurse', 'stand'], ['Pip', 'child', null, 'walk'],
    ['Bram', 'adult', 'watch', 'stand'], ['Greta', 'adult', null, 'parcel'],
  ];
  let seed = 4242;
  const list = cast.map(([first, age, kind, pose], k) => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const r = { id: k, look: seed, age, first, years: age === 'child' ? 8 + k : age === 'elder' ? 72 : 30 + k };
    const off = (k - (cast.length - 1) / 2) * spec.gap, back = (k % 2 ? 0.05 : -0.05);
    const x = spot.x + rx * off - Math.sin(hd) * back, z = spot.z + rz * off - Math.cos(hd) * back;
    return {
      lk: V.lookOf(r, { kind, rich: k === 9 }), r, x, y: w.terrain.heightAt(x, z), z, heading: hd + (pose === 'walk' ? (k % 4 === 1 ? 1.1 : -1.1) : 0), phase: k * 0.37,
      moving: pose === 'walk' || pose === 'basket' || pose === 'parcel' || pose === 'bag', working: false, tool: 'hammer', mode: 'path', lamp: false,
      carry: pose === 'basket' ? { kind: 'basket', c: new THREE.Color('#c8843a') } : pose === 'parcel' ? { kind: 'parcel' } : null, bag: pose === 'bag',
    };
  });
  const own = ag._render;
  ag._render = function () { this.view.draw(list, g.env, R.camera); };
  try {
    step(2, true);
    g.clock = performance.now() - 16;
    g.frame(true);
    return grab();
  } finally { ag._render = own; }
}

async function shoot(spec) {
  await loadTown(spec);
  const g = G(), w = g.world;
  settings(spec);
  let p = spec.focus ? focusOn(w, spec.focus) : centre(w);
  if (spec.fields) plough(w, p);
  if (spec.gondola) p = gondola(w, p);
  let pic;
  if (spec.lineup) {
    setDay(spec.season);
    pic = await lineup(spec, p);
  } else if (spec.seasons) {
    // one view, a quarter of it in each season, spring to winter
    const parts = [];
    for (let s = 0; s < 4; s++) { setDay(s, s === 3 ? 3 : 2); parts.push(await render(spec, p)); }
    pic = document.createElement('canvas');
    pic.width = parts[0].width; pic.height = parts[0].height;
    const q = pic.width / 4, ctx = pic.getContext('2d');
    parts.forEach((c, s) => ctx.drawImage(c, s * q, 0, q, c.height, s * q, 0, q, c.height));
  } else {
    setDay(spec.season);
    pic = await render(spec, p);
  }
  if (spec.sky || spec.scale) {
    // the social card: on the sky, scaled up crisply
    const k = spec.scale || 1, out = document.createElement('canvas');
    out.width = pic.width * k; out.height = pic.height * k;
    const ctx = out.getContext('2d');
    if (spec.sky) { const gr = ctx.createLinearGradient(0, 0, 0, out.height); gr.addColorStop(0, '#6cb6ea'); gr.addColorStop(1, '#dff2fb'); ctx.fillStyle = gr; ctx.fillRect(0, 0, out.width, out.height); }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pic, 0, 0, out.width, out.height);
    pic = out;
  }
  await post(spec.name, pic, spec.sky ? 'jpeg' : 'webp', spec.sky ? 0.9 : 0.92);
  g.renderer.resize();
}

export async function run(only = null) {
  while (!G() || !G().renderer) await sleep(100);
  await sleep(500);
  const list = SHOTS.filter(s => !only || only.includes(s.name));
  // one town at a time
  list.sort((a, b) => (a.merge ? 'zz' : a.town).localeCompare(b.merge ? 'zz' : b.town));
  for (const spec of list) {
    try { await shoot(spec); } catch (e) { say(`${spec.name}: ${e && e.stack ? e.stack : e}`); }
  }
  say('done');
  window.shotsDone = true;
}

const only = new URLSearchParams(location.search).get('only');
window.kinsteadShots = { run, SHOTS };
run(only ? only.split(',') : null);
