// Small helpers shared by the wiki's pages: where each building's entry is,
// links to buildings and pages, and bits of markup. Only the game's
// definitions are needed (no rendering), so the prose pages load at once.

import { BUILDINGS, CATEGORIES, TECHS } from '../src/defs.js';

// The buildings page for each of the game's building menus.
export const CAT_PAGE = { residential: 'homes', commercial: 'commerce', industry: 'industry', services: 'services', utilities: 'utilities', parks: 'parks', transit: 'transit' };
export const catOf = (id) => CATEGORIES.find(c => c.id === id);
export const pageOfType = (type) => CAT_PAGE[BUILDINGS[type].cat];
export const hrefOf = (type) => `#${pageOfType(type)}/${type}`;

export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('en-US');
export const money = (n) => `$${fmt(n)}`;
export const pct = (x) => `${Math.round(x * 100)}%`;
export const an = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// A link to a building's entry, named by one of its levels (the first by
// default) or by its type name.
export function bl(type, level = 0, text = null) {
  const def = BUILDINGS[type];
  if (!def) throw new Error(`wiki: no building "${type}"`);
  const name = text ?? (level === 'type' ? def.name : def.levels[level].name);
  return `<a href="${hrefOf(type)}">${esc(name)}</a>`;
}
// A link to a research project.
export function tl(id, text = null) {
  if (!TECHS[id]) throw new Error(`wiki: no research project "${id}"`);
  return `<a href="#research/${id}">${esc(text ?? TECHS[id].name)}</a>`;
}
// A link to a page (or a section of one).
export const pl = (href, text) => `<a href="#${href}">${text}</a>`;
export const k = (key) => `<span class="kbd">${esc(key)}</span>`;
export const ms = (name) => `<span class="ms" aria-hidden="true">${name}</span>`;

// A table: head is a list of column titles (a leading '#' right-aligns the
// column, for numbers), rows a list of lists of cells (markup).
export function table(head, rows, cls = '') {
  const num = head.map(h => h.startsWith('#'));
  const th = head.map((h, i) => `<th${num[i] ? ' class="n"' : ''}>${num[i] ? h.slice(1) : h}</th>`).join('');
  const tr = rows.map(r => `<tr>${r.map((c, i) => `<td${num[i] ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

// A lazily drawn building picture (wiki.js renders it with the game's
// thumbnail renderer once it scrolls into view).
export const pic = (type, level = 0, { variant = 777, flavor = null, look = null, cls = 'thumb', alt = '' } = {}) =>
  `<img class="${cls} ph" data-thumb="${esc([type, level, variant, flavor ?? '', look ?? ''].join('|'))}" alt="${esc(alt)}" width="192" height="144">`;
