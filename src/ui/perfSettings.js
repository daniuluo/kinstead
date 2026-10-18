// Settings → Performance: what to give up for a smoother game, a cooler
// computer or a longer battery (PERF_DEFAULTS in config.js says what each
// setting means; Game.applySettings puts them to work). They take effect
// with the rest of the settings, on Done.

import { PERF_DEFAULTS, BATTERY_SAVER } from '../config.js';

const opt = (v, cur, text) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${text}</option>`;

export function perfHTML(s) {
  const shadows = s.shadows ? (s.shadowQuality || 'high') : 'off';
  return `<div class="field"><label>Performance (lower settings run smoother on slower computers and use less power)</label>
    <div class="checkrow">
      <label class="inline">Frame rate <select id="pfFps">${opt(0, s.fps || 0, 'As fast as the screen')}${opt(60, s.fps, '60 a second')}${opt(30, s.fps, '30 a second')}</select></label>
      <label class="inline">Resolution <select id="pfRes">${opt(1, s.resScale ?? 1, 'Full')}${opt(0.75, s.resScale, '75%')}${opt(0.5, s.resScale, '50%')}</select></label>
      <label class="inline">Shadows <select id="pfShadow">${opt('high', shadows, 'High')}${opt('medium', shadows, 'Medium')}${opt('low', shadows, 'Low')}${opt('off', shadows, 'Off')}</select></label>
      <label class="inline">Smoke, dust and fireworks <select id="pfFx">${opt('full', s.effects || 'full', 'Full')}${opt('reduced', s.effects, 'Reduced')}${opt('off', s.effects, 'Off')}</select></label>
      <label class="inline">Villagers drawn <select id="pfPeople">${opt('all', s.villagers || 'all', 'All')}${opt('some', s.villagers, 'About half')}${opt('near', s.villagers, 'Only near the middle of the view')}</select></label>
      <label class="inline"><input type="checkbox" id="pfPaused" ${s.pausedSlow ? 'checked' : ''}> Draw only a few frames a second while the game is paused</label>
    </div>
    <div class="checkrow"><button class="btn small" id="pfSaver" title="Every setting above at its lightest that still looks like the game, and ambient occlusion off">Battery saver</button><button class="btn small" id="pfBest" title="Every setting above as it was at first">Best look</button></div></div>`;
}

// The two presets fill in the form (and the ambient occlusion box).
export function bindPerf(c) {
  const fill = (p) => {
    c.querySelector('#pfFps').value = String(p.fps);
    c.querySelector('#pfRes').value = String(p.resScale);
    c.querySelector('#pfShadow').value = p.shadows ? p.shadowQuality : 'off';
    c.querySelector('#pfFx').value = p.effects;
    c.querySelector('#pfPeople').value = p.villagers;
    c.querySelector('#pfPaused').checked = p.pausedSlow;
    const ao = c.querySelector('#stAO');
    if (ao) ao.checked = p.ao !== false;
  };
  c.querySelector('#pfSaver').onclick = () => fill(BATTERY_SAVER);
  c.querySelector('#pfBest').onclick = () => fill(PERF_DEFAULTS);
}

export function readPerf(c, s) {
  const sh = c.querySelector('#pfShadow').value;
  s.shadows = sh !== 'off';
  if (s.shadows) s.shadowQuality = sh;
  s.fps = Number(c.querySelector('#pfFps').value);
  s.resScale = Number(c.querySelector('#pfRes').value);
  s.effects = c.querySelector('#pfFx').value;
  s.villagers = c.querySelector('#pfPeople').value;
  s.pausedSlow = c.querySelector('#pfPaused').checked;
}
