// A gentle ambient soundtrack, made up as it plays. Slow chord pads swell in,
// drift for half a minute and dissolve into the next chord over a soft drone;
// glassy chimes and quiet piano notes drift in now and then, echo, and fade
// into a long reverb. Warm major-seventh colours by day, darker minor ones at
// night; quieter, darker and sparser in rain, glassier in winter. Everything
// is synthesised with the Web Audio API, so there are no music files and
// nothing to license.

const KEY = 50;   // D3
// chord colours as semitones above the chord's root, and roots above the key
const DAY = [
  { root: 0, v: [0, 7, 11, 14, 16] },       // Dmaj9
  { root: 5, v: [0, 7, 11, 14, 18] },       // Gmaj7#11
  { root: 9, v: [0, 7, 10, 14, 15] },       // Bm9
  { root: 7, v: [0, 7, 9, 14, 16] },        // A6/9
  { root: 4, v: [0, 7, 10, 14, 15] },       // F#m9
  { root: 2, v: [0, 7, 10, 14, 17] },       // Em11
];
const NIGHT = [
  { root: 0, v: [0, 7, 10, 14, 15] },       // Dm9
  { root: 10, v: [0, 7, 11, 14, 16] },      // Cmaj9
  { root: 8, v: [0, 7, 11, 14, 18] },       // Bbmaj7#11
  { root: 5, v: [0, 7, 10, 14, 15] },       // Gm9
  { root: 3, v: [0, 7, 11, 14, 16] },       // Fmaj9
];
// notes the chimes and piano may play over each chord (a pentatonic-ish set)
const SPARKLE = { day: [0, 2, 4, 7, 9, 11], night: [0, 2, 3, 7, 10] };
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (a) => a[(Math.random() * a.length) | 0];
const rand = (a, b) => a + Math.random() * (b - a);

export class Music {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.section = null;
  }

  get ctx() { return this.game.audio.ctx; }

  // Start (or keep) playing if the setting is on; stop if it's off.
  apply() {
    const s = this.game.settings;
    if (s.music === false) { this.stop(); return; }
    this.start();
    if (this.out) this.out.gain.setTargetAtTime(this._vol(), this.ctx.currentTime, 0.3);
  }

  _vol() { return 1.5 * Math.max(0, Math.min(1, this.game.settings.musicVol ?? 0.5)); }

  start() {
    if (this.on) return;
    if (!this.game.audio._ensure()) return;
    const c = this.ctx;
    if (!this.out) {
      this.out = c.createGain();
      this.out.gain.value = 0;
      this.out.connect(c.destination);
      // everything plays into a gently darkened bus, a long hall and an echo
      this.bus = c.createGain();
      this.tone = c.createBiquadFilter();
      this.tone.type = 'lowpass'; this.tone.frequency.value = 4200;
      this.bus.connect(this.tone).connect(this.out);
      const verb = c.createConvolver();
      verb.buffer = this._hall(6);
      this.verbIn = c.createGain();
      this.verbIn.gain.value = 0.9;
      const wet = c.createGain();
      wet.gain.value = 0.55;
      this.bus.connect(this.verbIn).connect(verb).connect(wet).connect(this.out);
      // the echo is only for the chimes and piano
      this.echo = c.createGain();
      const d = c.createDelay(2), fb = c.createGain(), dl = c.createBiquadFilter();
      d.delayTime.value = 0.68; fb.gain.value = 0.38;
      dl.type = 'lowpass'; dl.frequency.value = 2400;
      this.echo.connect(d).connect(dl).connect(fb).connect(d);
      dl.connect(this.bus);
    }
    this.on = true;
    this.out.gain.cancelScheduledValues(c.currentTime);
    this.out.gain.setTargetAtTime(this._vol(), c.currentTime, 2);
    this.section = null;
    this.nextSection = c.currentTime + 0.2;
    this.nextNote = c.currentTime + rand(3, 6);
    clearInterval(this.timer);
    this.timer = setInterval(() => this._tick(), 250);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer);
    if (this.out) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }

  // A long, soft hall: stereo noise that fades away slowly.
  _hall(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45;   // a little darker than white noise
        d[i] = lp * (1 - i / n) ** 2.4;
      }
    }
    return b;
  }

  _mood() {
    const env = this.game.env || {};
    return { night: (env.night || 0) > 0.55, wet: (env.rain || 0) > 0.3 || !!env.snowing, winter: env.season === 3 };
  }

  // ---------------------------------------------------------- scheduling
  _tick() {
    const c = this.ctx;
    if (!c || !this.on) return;
    const now = c.currentTime;
    // after a long stall (a sleeping tab) pick up again from now
    if (this.nextSection < now - 2) this.nextSection = now + 0.1;
    if (this.nextNote < now - 2) this.nextNote = now + rand(1, 3);
    const m = this._mood();
    this.tone.frequency.setTargetAtTime(m.wet ? 2200 : m.night ? 3000 : 4200, now, 3);
    while (this.nextSection < now + 2) this._newSection(this.nextSection, m);
    while (this.section && this.nextNote < now + 2) this._sparkle(this.nextNote, m);
  }

  // A new chord: pads swell in over a few seconds and overlap the old ones as
  // they fade, with a quiet drone on the root underneath.
  _newSection(t, m) {
    const set = m.night ? NIGHT : DAY;
    let ch = pick(set);
    for (let i = 0; i < 4 && this.section && ch === this.section.ch; i++) ch = pick(set);
    const len = rand(24, 38) * (m.night ? 1.25 : 1);
    const root = KEY + ch.root - (ch.root > 6 ? 12 : 0);
    const soft = m.wet ? 0.65 : 1;
    const fade = 7;
    this.section = { ch, root, mode: m.night ? 'night' : 'day', t0: t, t1: t + len };
    // the pad voices, spread across the stereo field
    ch.v.forEach((iv, k) => this._pad(root + 12 + iv, t, len + fade, 0.016 * soft * (k === 0 ? 1.2 : 1), (k / (ch.v.length - 1)) * 1.2 - 0.6));
    this._drone(root - 12, t, len + fade, 0.05 * soft);
    this.nextSection = t + len;
  }

  // Now and then a chime or a soft piano note, sometimes a short falling or
  // rising figure; fewer at night and in rain.
  _sparkle(t, m) {
    const s = this.section;
    const pool = [];
    for (let o = 2; o <= 3; o++) for (const iv of SPARKLE[s.mode]) pool.push(s.root + 12 * o + iv);
    const soft = m.wet ? 0.6 : 1;
    const bell = m.winter || Math.random() < (m.night ? 0.65 : 0.45);
    const n = Math.random() < 0.3 ? (Math.random() < 0.5 ? 2 : 3) : 1;
    let i = (Math.random() * pool.length) | 0;
    const step = Math.random() < 0.5 ? -1 : 1;
    for (let k = 0; k < n; k++) {
      const midi = pool[Math.max(0, Math.min(pool.length - 1, i))];
      const at = t + k * rand(0.45, 0.8), pan = rand(-0.7, 0.7);
      if (bell) this._chime(midi, at, 0.05 * soft, pan);
      else this._piano(midi - 12, at, 0.07 * soft, pan);
      i += step * (Math.random() < 0.7 ? 1 : 2);
    }
    const gap = (m.night ? rand(4, 10) : rand(2.5, 7)) * (m.wet ? 1.5 : 1);
    this.nextNote = t + gap;
  }

  // ---------------------------------------------------------- instruments
  _panner(pan) {
    const c = this.ctx;
    if (!c.createStereoPanner) return null;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  // A soft pad voice: two detuned triangles through a filter that opens and
  // closes slowly, swelling in and fading out over several seconds.
  _pad(midi, t, dur, vol, pan) {
    const c = this.ctx, f = mtof(midi);
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(rand(1100, 1700), t + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(600, t + dur);
    const att = Math.min(6, dur * 0.25), rel = 7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + dur - rel);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this._panner(pan);
    lp.connect(g);
    if (p) g.connect(p).connect(this.bus); else g.connect(this.bus);
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = det + rand(-2, 2);
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  _drone(midi, t, dur, vol) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 280;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 8);
    g.gain.setValueAtTime(vol, t + dur - 7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(this.bus);
    for (const [k, type] of [[1, 'sine'], [2, 'triangle']]) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = mtof(midi) * k;
      const og = c.createGain(); og.gain.value = k === 1 ? 1 : 0.25;
      o.connect(og).connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  // A glassy chime: a few slightly inharmonic sine partials with long tails.
  _chime(midi, t, vol, pan) {
    const c = this.ctx, f0 = mtof(midi), g = c.createGain();
    g.gain.value = vol;
    const p = this._panner(pan);
    if (p) g.connect(p).connect(this.bus); else g.connect(this.bus);
    g.connect(this.echo);
    for (const [k, v, d] of [[1, 1, 4.5], [2.01, 0.28, 2.6], [3.98, 0.12, 1.4], [5.43, 0.05, 0.8]]) {
      const o = c.createOscillator(), e = c.createGain();
      o.type = 'sine'; o.frequency.value = f0 * k;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(v, t + 0.015);
      e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(e).connect(g);
      o.start(t); o.stop(t + d + 0.05);
    }
  }

  // A soft, felted piano note: a quick, rounded attack and a long decay.
  _piano(midi, t, vol, pan) {
    const c = this.ctx, f0 = mtof(midi), g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f0 * 6, t);
    lp.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 2.5);
    g.gain.value = vol;
    const p = this._panner(pan);
    lp.connect(g);
    if (p) g.connect(p).connect(this.bus); else g.connect(this.bus);
    g.connect(this.echo);
    for (const [k, v, d] of [[1, 1, 5], [2, 0.35, 3], [3, 0.12, 1.6]]) {
      const o = c.createOscillator(), e = c.createGain();
      o.type = k === 1 ? 'triangle' : 'sine'; o.frequency.value = f0 * k;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(v, t + 0.02);
      e.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.6);
      e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(e).connect(lp);
      o.start(t); o.stop(t + d + 0.05);
    }
  }
}
