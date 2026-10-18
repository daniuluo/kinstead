// Tiny procedural sound effects with the Web Audio API (no audio files).

export class Sfx {
  constructor() { this.ctx = null; this.master = null; }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  _tone(freq, t0, dur, type = 'sine', vol = 0.3, slide = 0) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  _noise(t0, dur, freq = 800, vol = 0.3) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  // A soft hiss of rain while it rains (only once sound has started).
  setRain(level) {
    if (!this.ctx || Math.abs(level - (this._rain ?? 0)) < 0.02) return;
    this._rain = level;
    const c = this.ctx;
    if (!this.rainGain) {
      const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < n; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = (Math.random() * 2 - 1) * 0.6 + b * 4; }
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.5;
      this.rainGain = c.createGain();
      this.rainGain.gain.value = 0;
      src.connect(f).connect(this.rainGain).connect(this.master);
      src.start();
    }
    this.rainGain.gain.setTargetAtTime(level * 0.25, c.currentTime, 1.5);
  }

  play(name) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'click': this._tone(900, t, 0.06, 'sine', 0.15); break;
      case 'build': this._noise(t, 0.08, 1400, 0.35); this._tone(240, t, 0.12, 'triangle', 0.25, 0.7); this._tone(360, t + 0.07, 0.1, 'triangle', 0.18, 0.8); break;
      case 'demolish': this._noise(t, 0.35, 500, 0.5); this._tone(120, t, 0.3, 'sawtooth', 0.12, 0.5); break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this._tone(f, t + i * 0.07, 0.22, 'triangle', 0.18)); break;
      case 'plant': this._tone(660, t, 0.1, 'sine', 0.15, 1.3); break;
      case 'dig': this._noise(t, 0.12, 300, 0.4); break;
      case 'fanfare': [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => this._tone(f, t + i * 0.11, 0.3, 'triangle', 0.2)); break;
      case 'coin': this._tone(1320, t, 0.08, 'sine', 0.08); this._tone(1760, t + 0.05, 0.1, 'sine', 0.06); break;
    }
  }
}
