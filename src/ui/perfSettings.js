// Pieces of the Settings window: group boxes, rows of buttons for a choice
// of a few (one pressed in, like the game-speed buttons), and the
// Performance group with its two presets. Every control fires a 'change'
// that bubbles up, so the window applies settings as they're made.

import { PERF_DEFAULTS, BATTERY_SAVER } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A group box with a title.
export const group = (title, body, cls = '') => `<fieldset class="set-group ${cls}"><legend>${esc(title)}</legend>${body}</fieldset>`;

// A tick box with an optional line of explanation under it.
export const check = (id, on, label, hint = '', disabled = false) =>
  `<label class="set-check"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;

// A labelled row of buttons, one of them pressed in: choices are
// [value, text, tooltip?].
export const seg = (id, label, choices, cur) =>
  `<div class="set-row"><span class="set-label">${esc(label)}</span><div class="seg" id="${id}" data-value="${esc(cur)}">${choices.map(([v, t, tip]) =>
    `<button type="button" data-v="${esc(v)}" class="${String(v) === String(cur) ? 'on' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(t)}</button>`).join('')}</div></div>`;

export const segValue = (c, id) => c.querySelector(`#${id}`).dataset.value;
export function setSeg(c, id, v) {
  const el = c.querySelector(`#${id}`);
  el.dataset.value = String(v);
  for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === String(v));
}
// Pressing a button picks it (and tells the window).
export function bindSegs(c) {
  for (const el of c.querySelectorAll('.seg')) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled || b.dataset.v === el.dataset.value) return;
      setSeg(c, el.id, b.dataset.v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

export function perfHTML(s) {
  const shadows = s.shadows ? (s.shadowQuality || 'high') : 'off';
  return group('Performance', `
    <p class="set-hint">Lower settings run smoother on slower computers and use less power.</p>
    <div class="set-row"><span class="set-label">Presets</span><div class="set-presets">
      <button type="button" class="btn small" id="pfSaver" title="Everything at its lightest that still looks like the game, and soft contact shadows and tilt-shift off">Battery saver</button>
      <button type="button" class="btn small" id="pfBest" title="Everything as it was at first">Best look</button></div></div>
    ${seg('pfFps', 'Frame rate', [[0, 'Screen', 'As fast as the screen'], [60, '60', '60 frames a second'], [30, '30', '30 frames a second']], s.fps || 0)}
    ${seg('pfRes', 'Resolution', [[1, '100%'], [0.75, '75%'], [0.5, '50%']], s.resScale ?? 1)}
    ${seg('pfShadow', 'Shadows', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['off', 'Off']], shadows)}
    ${seg('pfFx', 'Smoke & dust', [['full', 'Full', 'Smoke, dust and fireworks as they are'], ['reduced', 'Fewer'], ['off', 'Off']], s.effects || 'full')}
    ${seg('pfPeople', 'Villagers shown', [['crowds', 'Thinned', 'Where crowds gather, only some of those there are drawn: busy streets, not packed ones'], ['all', 'All', 'Every villager, however crowded the street'], ['some', 'Half', 'About half of them'], ['near', 'Near view', 'Only those near the middle of the view']], s.villagers || 'crowds')}
    ${check('pfPaused', s.pausedSlow, 'Draw slowly while paused', 'Only a few frames a second while the game is paused')}`);
}

// The two presets fill in the form (and the soft shadows and tilt-shift), then apply.
export function bindPerf(c) {
  const fill = (p) => {
    setSeg(c, 'pfFps', p.fps);
    setSeg(c, 'pfRes', p.resScale);
    setSeg(c, 'pfShadow', p.shadows ? p.shadowQuality : 'off');
    setSeg(c, 'pfFx', p.effects);
    setSeg(c, 'pfPeople', p.villagers);
    c.querySelector('#pfPaused').checked = p.pausedSlow;
    const ao = c.querySelector('#stAO');
    if (ao) ao.checked = p.ao !== false;
    // Battery saver turns the tilt-shift off; Best look leaves it as chosen
    if (p.tiltShift && c.querySelector('#stTilt')) setSeg(c, 'stTilt', p.tiltShift);
    c.querySelector('#pfFps').dispatchEvent(new Event('change', { bubbles: true }));
  };
  c.querySelector('#pfSaver').onclick = () => fill(BATTERY_SAVER);
  c.querySelector('#pfBest').onclick = () => fill(PERF_DEFAULTS);
}

export function readPerf(c, s) {
  const sh = segValue(c, 'pfShadow');
  s.shadows = sh !== 'off';
  if (s.shadows) s.shadowQuality = sh;
  s.fps = Number(segValue(c, 'pfFps'));
  s.resScale = Number(segValue(c, 'pfRes'));
  s.effects = segValue(c, 'pfFx');
  s.villagers = segValue(c, 'pfPeople');
  s.pausedSlow = c.querySelector('#pfPaused').checked;
}
