// A gentle soundtrack, made up as it plays: a lute picking out folk chords,
// a soft flute (or bells in winter and at night) wandering over them and a
// warm pad underneath, in an easy 3/4 lilt. At night it slows down and turns
// to a minor key; in rain it plays quieter and sparser. Everything is
// synthesised with the Web Audio API, so there are no music files and nothing
// to license.

const KEY = 50;   // D3
const TRIAD = { M: [0, 4, 7], m: [0, 3, 7] };
// four-bar chord loops: [semitones above the key, major or minor]
const LOOPS = {
  day: [
    [[0, 'M'], [5, 'M'], [9, 'm'], [7, 'M']],
    [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']],
    [[0, 'M'], [10, 'M'], [5, 'M'], [0, 'M']],
    [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']],
    [[0, 'M'], [5, 'M'], [0, 'M'], [7, 'M']],
  ],
  night: [
    [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']],
    [[0, 'm'], [5, 'm'], [10, 'M'], [0, 'm']],
    [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']],
  ],
};
const TUNE = { day: [0, 2, 4, 7, 9], night: [0, 3, 5, 7, 10] };   // pentatonic, so nothing clashes
const RHYTHMS = [[1, 1, 1], [2, 1], [1, 2], [0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1], [3], [1, 1, 0.5, 0.5]];
const ENDINGS = [[2, 1], [3], [1, 2]];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (a) => a[(Math.random() * a.length) | 0];

export class Music {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.plucks = new Map();
    this.phrase = null;
  }

  get ctx() { return this.game.audio.ctx; }

  // Start (or keep) playing if the setting is on; stop if it's off.
  apply() {
    const s = this.game.settings;
    if (s.music === false) { this.stop(); return; }
    this.start();
    if (this.out) this.out.gain.setTargetAtTime(this._vol(), this.ctx.currentTime, 0.3);
  }

  _vol() { return 1.3 * Math.max(0, Math.min(1, this.game.settings.musicVol ?? 0.5)); }

  start() {
    if (this.on) return;
    if (!this.game.audio._ensure()) return;
    const c = this.ctx;
    if (!this.out) {
      this.out = c.createGain();
      this.out.gain.value = 0;
      this.out.connect(c.destination);
      this.bus = c.createGain();
      const tone = c.createBiquadFilter();
      tone.type = 'lowpass'; tone.frequency.value = 5200;
      this.bus.connect(tone).connect(this.out);
      const verb = c.createConvolver();
      verb.buffer = this._room(2.6);
      const wet = c.createGain();
      wet.gain.value = 0.32;
      this.bus.connect(verb).connect(wet).connect(this.out);
    }
    this.on = true;
    this.out.gain.cancelScheduledValues(c.currentTime);
    this.out.gain.setTargetAtTime(this._vol(), c.currentTime, 1.2);
    this.next = c.currentTime + 0.2;
    this.barN = 0;
    this.phrase = null;
    clearInterval(this.timer);
    this.timer = setInterval(() => this._tick(), 200);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer);
    if (this.out) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  // A soft room for everything to ring in: a burst of fading noise.
  _room(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    }
    return b;
  }

  // ---------------------------------------------------------- composing
  _mood() {
    const env = this.game.env || {};
    return { night: (env.night || 0) > 0.55, wet: (env.rain || 0) > 0.3 || !!env.snowing, winter: env.season === 3 };
  }

  // Eight bars: a chord loop played twice, with a tune (or a rest from it).
  _newPhrase() {
    const m = this._mood(), mode = m.night ? 'night' : 'day';
    this.count = (this.count || 0) + 1;
    // every so often a quiet breather: just the pad and a few bells
    const breather = this.count % (4 + ((Math.random() * 3) | 0)) === 0;
    const loop = pick(LOOPS[mode]);
    const p = {
      mode, loop, breather,
      bpm: m.night ? 60 + Math.random() * 6 : m.wet ? 66 : 76 + Math.random() * 8,
      sparse: m.night || m.wet,
      tune: !breather && Math.random() < (m.wet ? 0.4 : m.night ? 0.55 : 0.7),
      voice: m.winter || (m.night && Math.random() < 0.5) ? 'bell' : 'flute',
      soft: m.wet ? 0.7 : 1,
    };
    p.notes = p.tune ? this._motif(p) : [];
    return p;
  }

  _chord(p, bar) {
    const [off, q] = p.loop[bar % 4];
    let root = KEY + off;
    if (root > KEY + 7) root -= 12;
    return { root, t: TRIAD[q] };
  }

  // A four-bar tune: mostly stepwise on the pentatonic scale, landing on a
  // chord note at the start of each bar and on the root at the end.
  _motif(p) {
    const pool = [];
    for (let o = 1; o <= 3; o++) for (const s of TUNE[p.mode]) { const m = KEY + 12 * o + s; if (m >= 62 && m <= 86) pool.push(m); }
    let i = (pool.length / 2) | 0;
    const notes = [];
    const nearest = (m, ch, rootOnly) => {
      let best = m, bd = 99;
      for (let o = -1; o <= 4; o++) for (const t of rootOnly ? [0] : ch.t) {
        const c = ch.root + 12 * o + t;
        if (c < 62 || c > 86) continue;
        if (Math.abs(c - m) < bd) { bd = Math.abs(c - m); best = c; }
      }
      return best;
    };
    for (let bar = 0; bar < 4; bar++) {
      const ch = this._chord(p, bar), r = bar === 3 ? pick(ENDINGS) : pick(RHYTHMS);
      let beat = 0;
      r.forEach((d, k) => {
        i = Math.max(0, Math.min(pool.length - 1, i + pick([-1, -1, 1, 1, 0, 2, -2, 1])));
        let m = pool[i];
        if (beat === 0) m = nearest(m, ch, false);
        const last = bar === 3 && k === r.length - 1;
        if (last) m = nearest(m, ch, true);
        if (!last && !(bar === 0 && k === 0) && Math.random() < 0.12) { beat += d; return; }
        notes.push({ bar, beat, dur: d, midi: m });
        beat += d;
      });
    }
    return notes;
  }

  // ---------------------------------------------------------- scheduling
  _tick() {
    const c = this.ctx;
    if (!c || !this.on) return;
    // after a long stall (a sleeping tab) start again from now
    if (this.next < c.currentTime - 1) this.next = c.currentTime + 0.1;
    while (this.next < c.currentTime + 1.4) {
      if (this.barN % 8 === 0 || !this.phrase) this.phrase = this._newPhrase();
      const beat = 60 / this.phrase.bpm;
      this._bar(this.phrase, this.barN % 8, this.next, beat);
      this.next += beat * 3;
      this.barN++;
    }
  }

  _bar(p, bar, t0, beat) {
    const ch = this._chord(p, bar), [r, t] = [ch.root, ch.t];
    const k = p.soft;
    // warm pad, swelling over the bar
    this._pad([r + 12, r + 12 + t[1], r + 12 + t[2]], t0, beat * 3, (p.breather ? 0.05 : p.sparse ? 0.04 : 0.028) * k);
    if (p.breather) {
      if (bar % 2 === 0) this._bell(r + 24 + t[2], t0 + beat, 0.05 * k);
      return;
    }
    // bass on the first beat
    this._pluck(r - 12, t0, 0.32 * k, 600);
    // the lute picks out the chord in eighth notes (fewer at night and in rain)
    const arp = [r, r + t[2], r + 12 + t[1], r + t[2], r + 12, r + t[2]];
    arp.forEach((m, i) => {
      if (p.sparse && i % 2) return;
      const swing = i % 2 ? beat * 0.04 : 0;
      this._pluck(m, t0 + i * beat / 2 + swing, (i === 0 ? 0.24 : 0.16) * k, 2600);
    });
    // the tune, played twice through the phrase
    for (const n of p.notes) {
      if (n.bar !== bar % 4) continue;
      const at = t0 + n.beat * beat, dur = n.dur * beat;
      if (p.voice === 'bell') this._bell(n.midi, at, 0.09 * k);
      else this._flute(n.midi, at, dur, 0.075 * k);
    }
  }

  // ---------------------------------------------------------- instruments
  // A plucked string (Karplus-Strong), rendered once per pitch and reused.
  _pluckBuf(midi) {
    let b = this.plucks.get(midi);
    if (b) return b;
    const c = this.ctx, sr = c.sampleRate, f = mtof(midi), N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * (midi < 48 ? 2.4 : 1.7));
    const ring = new Float32Array(N), out = new Float32Array(len);
    let prev = 0;
    for (let i = 0; i < N; i++) { const v = Math.random() * 2 - 1; ring[i] = (v + prev) * 0.5; prev = ring[i]; }
    for (let i = 0, p = 0; i < len; i++) {
      const a = ring[p], nb = ring[(p + 1) % N];
      out[i] = a;
      ring[p] = (a + nb) * 0.4985;
      p = (p + 1) % N;
    }
    for (let i = Math.floor(len * 0.85); i < len; i++) out[i] *= (len - i) / (len * 0.15);
    b = c.createBuffer(1, len, sr);
    b.copyToChannel(out, 0);
    b.rate = f / (sr / (N + 0.5));   // the averaging adds half a sample: tune it back
    this.plucks.set(midi, b);
    return b;
  }

  _pluck(midi, t, vol, bright) {
    const c = this.ctx, b = this._pluckBuf(midi);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = b;
    s.playbackRate.value = b.rate;
    f.type = 'lowpass'; f.frequency.value = bright;
    g.gain.value = vol;
    s.connect(f).connect(g).connect(this.bus);
    s.start(t);
  }

  _flute(midi, t, dur, vol) {
    const c = this.ctx, f0 = mtof(midi);
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    const lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'triangle'; o.frequency.value = f0;
    o2.type = 'sine'; o2.frequency.value = f0 * 2;
    const g2 = c.createGain(); g2.gain.value = 0.18;
    lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f0 * 0.006, t + Math.min(0.5, dur));
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    lp.type = 'lowpass'; lp.frequency.value = 2400;
    const end = t + Math.max(0.15, dur * 0.95);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.07);
    g.gain.setValueAtTime(vol * 0.85, end - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.18);
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.bus);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(end + 0.25); }
  }

  _bell(midi, t, vol) {
    const c = this.ctx, f0 = mtof(midi);
    for (const [k, v, d] of [[1, 1, 2.2], [2.76, 0.35, 0.9], [5.4, 0.12, 0.4]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f0 * k;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.bus);
      o.start(t); o.stop(t + d + 0.05);
    }
  }

  _pad(notes, t, dur, vol) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.25);
    lp.connect(g).connect(this.bus);
    for (const m of notes) for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + dur * 1.3);
    }
  }
}
