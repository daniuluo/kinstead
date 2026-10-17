// Time of day + seasons: sky gradient, sun/moon light, night glow and snow cover.

import * as THREE from 'three';
import { CONFIG, seasonOf } from '../config.js';
import { U } from './materials.js';
import { clamp, smoothstep } from '../util/rng.js';

const K = (h, top, bot, sun, sunI, hs, hg, hi, night) => ({ h, top: new THREE.Color(top), bot: new THREE.Color(bot), sun: new THREE.Color(sun), sunI, hs: new THREE.Color(hs), hg: new THREE.Color(hg), hi, night });

const KEYS = [
  K(0, '#0a1230', '#1b2850', '#a9bcff', 0.62, '#4a5e96', '#262c3e', 0.55, 1),
  K(4.6, '#0d1636', '#24305a', '#a9bcff', 0.58, '#4a5e96', '#262c3e', 0.55, 1),
  K(5.85, '#2a3a6a', '#b4829c', '#ffb07a', 0.06, '#6d78a8', '#3a3340', 0.45, 0.8),
  K(6.6, '#6a9fd4', '#f6c08f', '#ffc58a', 1.5, '#a8c4e0', '#6a5a48', 0.7, 0.25),
  K(8, '#7fbbe6', '#d9eef7', '#fff1d6', 2.5, '#c4ddf0', '#7a6a50', 0.85, 0),
  K(12, '#6cb6ea', '#dff2fb', '#ffffff', 2.9, '#cfe6f7', '#7f6f55', 0.9, 0),
  K(16.5, '#77b4e2', '#e9eef0', '#fff0d0', 2.6, '#c8dcec', '#7a6a50', 0.85, 0),
  K(18.6, '#6b8fc9', '#f7b77a', '#ffb36b', 1.8, '#b8b8d0', '#6f5544', 0.7, 0.12),
  K(19.6, '#3b4f8a', '#ea8b6a', '#ff8c5a', 0.6, '#8a80a8', '#4a3a3a', 0.55, 0.55),
  K(20.15, '#202c5c', '#6a5a86', '#ff8c5a', 0.06, '#5a6494', '#2a2a38', 0.45, 0.85),
  K(21, '#121c44', '#2c3864', '#a9bcff', 0.58, '#4a5e96', '#262c3e', 0.52, 1),
  K(24, '#0a1230', '#1b2850', '#a9bcff', 0.62, '#4a5e96', '#262c3e', 0.55, 1),
];

const WINTER_TINT = new THREE.Color('#dfe8f5');

export class Sky {
  constructor(renderer) {
    this.r = renderer;
    this.skyEl = document.getElementById('sky');
    this.starsEl = document.getElementById('stars');
    this._lastBg = '';
    this.night = 0;
    this.snow = 0;
    this.season = 1;
    this._drawStars();
    window.addEventListener('resize', () => this._drawStars());
    this.cur = { top: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color() };
  }

  _drawStars() {
    const c = this.starsEl;
    c.width = window.innerWidth; c.height = window.innerHeight;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const n = Math.floor((c.width * c.height) / 3500);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * c.width, y = Math.random() * c.height;
      const r = Math.random() < 0.08 ? 1.6 : Math.random() * 1.1 + 0.3;
      g.fillStyle = `rgba(255,255,${220 + Math.random() * 35 | 0},${0.4 + Math.random() * 0.6})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }

  update(day, hours) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (hours >= KEYS[i].h && hours <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    const t = (hours - a.h) / Math.max(1e-6, b.h - a.h);
    const c = this.cur;
    c.top.copy(a.top).lerp(b.top, t);
    c.bot.copy(a.bot).lerp(b.bot, t);
    c.sun.copy(a.sun).lerp(b.sun, t);
    c.hs.copy(a.hs).lerp(b.hs, t);
    c.hg.copy(a.hg).lerp(b.hg, t);
    const sunI = a.sunI + (b.sunI - a.sunI) * t;
    const hi = a.hi + (b.hi - a.hi) * t;
    this.night = a.night + (b.night - a.night) * t;

    // seasons
    const season = seasonOf(day);
    this.season = season;
    const dps = CONFIG.DAYS_PER_SEASON;
    const dIn = ((day - 1) % dps) + hours / 24;
    let snow = 0;
    if (season === 3) snow = clamp(dIn / 1.2, 0, 1) * clamp((dps - dIn) / 0.8, 0, 1) * 0.9;
    this.snow = snow;
    if (snow > 0) { c.hg.lerp(WINTER_TINT, snow * 0.25); c.bot.lerp(WINTER_TINT, snow * 0.15 * (1 - this.night)); }

    // sun / moon direction
    const dir = this.r.sunDir;
    if (hours >= 5.85 && hours <= 20.15) {
      const st = (hours - 5.85) / (20.15 - 5.85);
      const elev = 0.12 + Math.sin(Math.PI * st) * 1.0;
      const az = -1.4 + st * 2.8 + 0.6;
      dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
    } else {
      const nh = hours > 20 ? hours - 20.15 : hours + 24 - 20.15;
      const st = nh / 9.7;
      const elev = 0.5 + Math.sin(Math.PI * st) * 0.4;
      const az = 2.4 - st * 2.2;
      dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
    }
    dir.normalize();

    const R = this.r;
    R.sun.color.copy(c.sun);
    R.sun.intensity = sunI;
    R.hemi.color.copy(c.hs);
    R.hemi.groundColor.copy(c.hg);
    R.hemi.intensity = hi;
    R.renderer.toneMappingExposure = (R.baseExposure || 1) + this.night * 0.2;
    R.scene.fog.color.copy(c.bot).lerp(c.top, 0.25);

    U.uNight.value = this.night;
    const late = hours >= 22.5 ? smoothstep(22.5, 25.5, hours) : hours < 5.5 ? (hours < 4.3 ? smoothstep(-1.5, 1.5, hours) : 1 - smoothstep(4.3, 5.5, hours)) : 0;
    U.uLate.value = late;
    U.uSnow.value = snow;

    const bg = `linear-gradient(180deg, #${c.top.getHexString()} 0%, #${c.bot.getHexString()} 100%)`;
    if (bg !== this._lastBg) { this.skyEl.style.background = bg; this._lastBg = bg; }
    this.starsEl.style.opacity = String(Math.max(0, this.night - 0.3) / 0.7);
  }
}
