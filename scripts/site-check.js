// Headless test of the website: the landing page (index.html), the game
// (play/) and the wiki (wiki/). It checks that every file a page loads is
// there, that old links to the site's root still reach the game, and that
// the wiki keeps up with the game: every building, research project,
// starter town, key, setting and happiness factor has its place in the
// wiki, every number the wiki quotes from the game's code (wiki/facts.js)
// still matches, and every link inside the wiki goes somewhere.
//
//   node scripts/site-check.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg); }
}
const missingList = (arr) => (arr.length ? `: ${arr.slice(0, 12).join(', ')}${arr.length > 12 ? ` (+${arr.length - 12})` : ''}` : '');

// 1. every local file each page loads exists ------------------------------
console.log('Files');
for (const page of ['index.html', 'play/index.html', 'wiki/index.html']) {
  const html = read(page), dir = path.dirname(page);
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(m => m[1])
    .filter(u => !/^(https?:|data:|mailto:|#|javascript:)/.test(u));
  const bad = [];
  for (const u of refs) {
    const clean = u.split(/[?#]/)[0];
    let f = path.join(ROOT, dir, clean);
    if (!clean || clean.endsWith('/')) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) bad.push(u);
  }
  ok(refs.length && !bad.length, `${page}: all ${refs.length} local files it loads exist${missingList(bad)}`);
  // and the module scripts it imports (relative imports, followed one level)
  for (const m of html.matchAll(/<script type="module" src="([^"]+)"/g)) {
    const mod = path.join(dir, m[1]), src = read(mod), mdir = path.dirname(mod);
    const imps = [...src.matchAll(/(?:import|from)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)].map(x => x[1]);
    const gone = imps.filter(i => !fs.existsSync(path.join(ROOT, mdir, i)));
    ok(!gone.length, `${mod}: its ${imps.length} relative imports exist${missingList(gone)}`);
  }
}
{
  const play = read('play/index.html');
  ok(/register\('\.\.\/sw\.js'/.test(play), 'the game registers the service worker at the top of the site (../sw.js), so its scope covers every page');
  ok(/"three": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/build\/three\.module\.js"/.test(play) && read('wiki/index.html').includes(play.match(/"three": "([^"]+)"/)[1]),
    'the wiki maps three to the same version as the game');
  ok(/register\('sw\.js'/.test(read('index.html')) && /register\('\.\.\/sw\.js'/.test(read('wiki/index.html')), 'the landing page and the wiki register the same service worker');
}

// 2. the old root links reach the game ------------------------------------
console.log('Root forwarding');
{
  const html = read('index.html');
  const m = html.match(/if \((\/.*\/)\.test\(location\.search\)\) location\.replace\('play\/' \+ location\.search \+ location\.hash\);/);
  ok(!!m, 'the landing page forwards game links to play/ with their query and hash, before anything loads');
  ok(html.indexOf(m ? m[0] : '@@') < html.indexOf('<link'), '...ahead of the styles and fonts');
  if (m) {
    const re = eval(m[1]); // eslint-disable-line no-eval
    const forward = ['?join=K7Q-M2P', '?join=K7QM2P&x=1', '?x=1&join=ABC', '?continue', '?continue=1'];
    const stay = ['', '?utm_source=forum', '?joinery=1', '?fbclid=abc'];
    ok(forward.every(s => re.test(s)), `forwards ${forward.join(' ')}`);
    ok(stay.every(s => !re.test(s)), 'leaves other visits on the landing page');
  }
  const game = read('src/main.js');
  const reads = [...new Set([...game.matchAll(/params\.(?:get|has)\('(\w+)'\)/g), ...read('src/game.js').matchAll(/URLSearchParams\(location\.search\)\.(?:get|has)\('(\w+)'\)/g)].map(x => x[1]))];
  ok(reads.length && reads.every(p => new RegExp(`\\b${p}\\b`).test(m ? m[1] : '')), `every query the game reads (${reads.join(', ')}) is forwarded from the root`);
  ok(/location\.pathname\}\?join=/.test(read('src/ui/multiplayer.js')), 'invite links are made from the page the game is on (now play/)');
}

// 3. the wiki's facts still match the game's code -------------------------
console.log('Facts the wiki quotes from the code');
const { FACTS } = await import(pathToFileURL(path.join(ROOT, 'wiki/facts.js')).href);
for (const [key, f] of Object.entries(FACTS)) {
  const src = read(f.file);
  if (f.all) {
    const got = [...new Set([...src.matchAll(f.all)].map(m => m[1] || m[2]))];
    const extra = got.filter(x => !f.keys.includes(x)), gone = f.keys.filter(x => !got.includes(x));
    ok(!extra.length && !gone.length, `${key}: the wiki lists every one in ${f.file}${missingList([...extra.map(x => `new ${x}`), ...gone.map(x => `gone ${x}`)])}`);
    continue;
  }
  const m = src.match(f.re);
  const want = Array.isArray(f.value) ? f.value : [f.value];
  const got = m ? m.slice(1).map(Number) : null;
  ok(got && got.length === want.length && got.every((v, i) => v === want[i]), `${key} is ${want.join(', ')} in ${f.file}${got ? (got.join() === want.join() ? '' : ` (the code says ${got.join(', ')})`) : ' (not found: the code has changed)'}`);
}

// 4. the wiki covers the game ---------------------------------------------
console.log('Wiki pages');
const defs = await import(pathToFileURL(path.join(ROOT, 'src/defs.js')).href);
const { PAGES, KEYS, SETTINGS, GROUPS } = await import(pathToFileURL(path.join(ROOT, 'wiki/pages.js')).href);
const catalog = await import(pathToFileURL(path.join(ROOT, 'wiki/catalog.js')).href);
const { CAT_PAGE } = await import(pathToFileURL(path.join(ROOT, 'wiki/links.js')).href);
const { STARTERS } = await import(pathToFileURL(path.join(ROOT, 'src/world/starters.js')).href);

const ids = new Set(['home']), dup = [], html = {};
for (const p of PAGES) {
  if (ids.has(p.id)) dup.push(p.id);
  ids.add(p.id);
}
let rendered = 0;
for (const p of PAGES) {
  let secs = [];
  try {
    secs = p.sections ? p.sections() : [];
    if (p.generated) secs = [...secs, ...await catalog.generate(p.generated, p.id)];
    rendered++;
  } catch (e) {
    ok(false, `page ${p.id} renders: ${e.message}`);
    continue;
  }
  html[p.id] = secs.map(s => (s.raw ? s.html : `<h2 id="${p.id}/${s.id}"></h2>${s.html}`)).join('');
  for (const s of secs) if (!s.raw) { const id = `${p.id}/${s.id}`; if (ids.has(id)) dup.push(id); ids.add(id); }
  for (const m of html[p.id].matchAll(/\bid="([^"]+)"/g)) { if (ids.has(m[1]) && !secs.some(s => !s.raw && `${p.id}/${s.id}` === m[1])) dup.push(m[1]); ids.add(m[1]); }
}
ok(rendered === PAGES.length, `all ${PAGES.length} wiki pages render`);
ok(!dup.length, `every page, section and entry has its own address${missingList(dup)}`);
ok(PAGES.every(p => GROUPS.some(([g]) => g === p.group)), 'every page is in a group of the navigation');
ok(defs.CATEGORIES.every(c => CAT_PAGE[c.id] && PAGES.some(p => p.id === CAT_PAGE[c.id] && p.generated === 'catalog')), 'every building menu has a page');
{
  const missing = Object.keys(defs.BUILDINGS).filter(t => !ids.has(`${CAT_PAGE[defs.BUILDINGS[t].cat]}/${t}`));
  ok(!missing.length, `every building (${Object.keys(defs.BUILDINGS).length}) has an entry on its menu's page${missingList(missing)}`);
  const lv = Object.entries(defs.BUILDINGS).flatMap(([t, d]) => d.levels.map((L, i) => `${CAT_PAGE[d.cat]}/${t}.${i}`)).filter(id => !ids.has(id));
  ok(!lv.length, `every level of every building has its card${missingList(lv)}`);
  const techs = Object.keys(defs.TECHS).filter(t => !ids.has(`research/${t}`));
  ok(!techs.length, `every research project (${Object.keys(defs.TECHS).length}) is in the research tree${missingList(techs)}`);
  const br = defs.BRANCHES.filter(([b]) => !ids.has(`research/${b}`)).map(([b]) => b);
  ok(!br.length, `every research branch has its row${missingList(br)}`);
  const st = STARTERS.filter(s => !ids.has(`starters/${s.id}`)).map(s => s.id);
  ok(!st.length, `every starter town (${STARTERS.length}) is on the Starter towns page${missingList(st)}`);
}
{
  // every link inside the wiki goes to a page, a section or an entry
  const all = Object.values(html).join('');
  const hrefs = [...new Set([...all.matchAll(/href="#([^"]*)"/g)].map(m => m[1]))];
  // (a bare building or project, #villa or #carpentry, finds its entry too)
  const bad = hrefs.filter(h => h && !ids.has(h) && !defs.BUILDINGS[h] && !defs.TECHS[h]);
  ok(hrefs.length > 100 && !bad.length, `all ${hrefs.length} links inside the wiki lead somewhere${missingList(bad)}`);
  const see = PAGES.flatMap(p => (p.see || []).filter(r => !ids.has(r)).map(r => `${p.id} → ${r}`));
  ok(!see.length, `every "See also" leads somewhere${missingList(see)}`);
  const landing = [...read('index.html').matchAll(/href="wiki\/#([^"]+)"/g)].map(m => m[1]).filter(h => !ids.has(h));
  ok(!landing.length, `every link from the landing page into the wiki leads somewhere${missingList(landing)}`);
}

// 5. keys and settings -----------------------------------------------------
console.log('Keys and settings');
{
  const input = read('src/ui/input.js');
  const onKey = input.slice(input.indexOf('onKey(e, down)'), input.indexOf('update(dt)'));
  const cases = [...onKey.matchAll(/case '([^']+)':/g)].map(m => m[1]);
  const pans = [...input.slice(input.indexOf('update(dt)')).matchAll(/k\.has\('([^']+)'\)/g)].map(m => m[1]);
  const ctrl = /\(e\.ctrlKey \|\| e\.metaKey\) && k === 's'/.test(onKey) ? ['ctrl+s', 'ctrl+shift+s'] : [];
  const known = new Set(KEYS.flatMap(e => e.keys));
  const missing = [...new Set([...cases, ...pans, ...ctrl])].filter(c => !known.has(c));
  ok(cases.length > 20 && !missing.length, `every key the game answers to (${cases.length + pans.length + ctrl.length}) is on the Controls page${missingList(missing.map(m => JSON.stringify(m)))}`);
  const stale = [...known].filter(k => ![...cases, ...pans, ...ctrl].includes(k));
  ok(!stale.length, `no key on the Controls page that the game no longer has${missingList(stale)}`);
}
{
  const ui = read('src/ui/ui.js'), perf = read('src/ui/perfSettings.js');
  const win = ui.slice(ui.indexOf('showSettings() {'), ui.indexOf('refreshAfterSandbox()'));
  const labels = [
    ...[...win.matchAll(/check\('st\w+', [^,]+, '([^']+)'/g)].map(m => m[1]),
    ...[...win.matchAll(/seg\('st\w+', '([^']+)'/g)].map(m => m[1]),
    ...[...win.matchAll(/<span class="set-label">([^<]+)<\/span>/g)].map(m => m[1]),
    ...[...win.matchAll(/<label for="st\w+">([^<]+)<\/label>/g)].map(m => m[1]),
    ...[...perf.matchAll(/seg\('pf\w+', '([^']+)'/g)].map(m => m[1]),
    ...[...perf.matchAll(/check\('pf\w+', [^,]+, '([^']+)'/g)].map(m => m[1]),
    ...[...perf.matchAll(/<span class="set-label">([^<]+)<\/span>/g)].map(m => m[1]),
  ].filter(l => !l.includes('${'));   // (not the template inside seg() itself)
  const groups = [...win.matchAll(/group\('([^']+)'/g), ...perf.matchAll(/group\('([^']+)'/g)].map(m => m[1]);
  const wikiLabels = new Set(SETTINGS.flatMap(g => g.rows.map(r => r[0])));
  const missing = labels.filter(l => !wikiLabels.has(l));
  ok(labels.length > 20 && !missing.length, `every setting in the Settings window (${labels.length}) is on the Settings page${missingList(missing)}`);
  const gm = groups.filter(g => !SETTINGS.some(s => s.group === g));
  ok(!gm.length, `every group of the Settings window is on the Settings page${missingList(gm)}`);
  const stale = [...wikiLabels].filter(l => !labels.includes(l));
  ok(!stale.length, `no setting on the Settings page that the game no longer has${missingList(stale)}`);
}

// 6. icons -------------------------------------------------------------------
console.log('Icons');
for (const [page, used] of [
  ['wiki/index.html', [...PAGES.map(p => p.icon || 'article'), ...[...read('wiki/wiki.js').matchAll(/ms\('(\w+)'\)/g)].map(m => m[1]), 'article', ...[...read('wiki/index.html').matchAll(/<span class="ms"[^>]*>(\w+)<\/span>/g)].map(m => m[1])]],
  ['index.html', [...read('index.html').matchAll(/<span class="ms"[^>]*>(\w+)<\/span>/g)].map(m => m[1])],
]) {
  const m = read(page).match(/icon_names=([\w,]+)/);
  const have = m ? m[1].split(',') : [];
  const missing = [...new Set(used)].filter(i => !have.includes(i));
  ok(m && !missing.length, `${page} loads every icon it shows${missingList(missing)}`);
  ok(have.join(',') === [...have].sort().join(','), `${page}: the icon list is in alphabetical order (Google Fonts needs it)`);
}

console.log(`\n${pass} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
