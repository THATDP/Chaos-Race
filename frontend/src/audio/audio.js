// Áudio 100% procedural (WebAudio): nada de arquivos pesados, música por pista
// e efeitos sintetizados na hora.
const THEMES = {
  menu: { bpm: 102, root: 174.61, scale: [0, 3, 7, 10, 12, 15], style: 'menu' },
  'neon-city': { bpm: 126, root: 220, scale: [0, 3, 5, 7, 10, 12], style: 'city' },
  foundry: { bpm: 140, root: 174.61, scale: [0, 1, 5, 7, 8, 12], style: 'industrial' },
  jungle: { bpm: 110, root: 196, scale: [0, 2, 3, 7, 9, 12], style: 'tribal' },
  peaks: { bpm: 118, root: 261.63, scale: [0, 2, 4, 7, 9, 12], style: 'airy' },
  orbital: { bpm: 132, root: 233.08, scale: [0, 3, 6, 7, 10, 12], style: 'space' },
  results: { bpm: 100, root: 261.63, scale: [0, 4, 7, 11, 12, 16], style: 'victory' },
};

const midiToHz = (root, semis) => root * Math.pow(2, semis / 12);

export class AudioEngine {
  constructor(settings = {}) {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicVol = settings.music ?? 0.45;
    this.sfxVol = settings.sfx ?? 0.75;
    this.enabled = true;
    this.timer = null;
    this.step = 0;
    this.themeId = null;
    this.nextTime = 0;
    this.noise = null;
    this.chordIndex = 0;
    this.muted = false;
    this.musicRunning = false;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol * 0.55;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.master);
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.musicRunning && this.themeId) this.startMusic(this.themeId);
  }

  setVolumes({ music, sfx } = {}) {
    if (music != null) this.musicVol = music;
    if (sfx != null) this.sfxVol = sfx;
    if (this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVol * 0.55, this.ctx.currentTime, 0.05);
      this.sfxGain.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
    return this.muted;
  }

  // ---------------- música ----------------
  startMusic(themeId) {
    this.themeId = themeId;
    if (!this.ctx) return;
    this.stopMusic();
    this.musicRunning = true;
    this.step = 0;
    this.chordIndex = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.musicRunning = false;
  }

  schedule() {
    if (!this.ctx || !this.musicRunning) return;
    const t = THEMES[this.themeId] || THEMES.menu;
    const stepDur = 60 / t.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      this.playStep(t, this.step, this.nextTime, stepDur);
      this.step += 1;
      this.nextTime += stepDur;
    }
  }

  playStep(theme, step, time, dur) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const chord = [0, 3, 7, 10][bar % 4];
    const scale = theme.scale;

    // baixo
    if (s16 % 8 === 0) {
      this.tone(midiToHz(theme.root / 2, chord), time, dur * 3.2, 'sawtooth', 0.14, this.musicGain, 260);
    }
    if (s16 === 6 || s16 === 14) {
      this.tone(midiToHz(theme.root / 2, chord + 7), time, dur * 1.2, 'square', 0.07, this.musicGain, 500);
    }
    // arpejo
    if (s16 % 2 === 0) {
      const note = scale[(step * 3 + bar) % scale.length] + chord;
      const oct = theme.style === 'airy' ? 4 : theme.style === 'industrial' ? 2 : 4;
      this.tone(midiToHz(theme.root, note + oct), time, dur * 1.6, theme.style === 'industrial' ? 'square' : 'triangle', 0.055, this.musicGain, 3200);
    }
    // pads
    if (s16 === 0) {
      this.tone(midiToHz(theme.root, chord), time, dur * 12, 'sine', 0.045, this.musicGain, 900);
      this.tone(midiToHz(theme.root, chord + 7), time, dur * 12, 'sine', 0.035, this.musicGain, 900);
    }
    // bateria
    if (theme.style !== 'airy' || s16 % 8 === 0) {
      if (s16 % 4 === 0) this.kick(time, 0.16);
      if (s16 === 4 || s16 === 12) this.hat(time, 0.05);
      if (s16 === 2 || s16 === 6 || s16 === 10 || s16 === 14) this.hat(time, 0.028);
      if (theme.style === 'industrial' && (s16 === 7 || s16 === 15)) this.snare(time, 0.07);
      if (theme.style === 'tribal' && (s16 === 3 || s16 === 11)) this.snare(time, 0.05);
    }
  }

  tone(freq, time, dur, type, gain, dest, filterHz) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (filterHz) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterHz;
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  kick(time, gain) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  noiseHit(time, gain, dur, freq, type = 'highpass') {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  hat(time, gain) {
    this.noiseHit(time, gain, 0.05, 8000);
  }
  snare(time, gain) {
    this.noiseHit(time, gain, 0.16, 1800, 'bandpass');
  }

  // ---------------- efeitos ----------------
  sfx(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const dest = this.sfxGain;
    const tone = (freq, dur, type, gain, to, filter) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, now + dur);
      if (filter) {
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filter;
        osc.connect(f);
        f.connect(g);
      } else osc.connect(g);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    };
    switch (name) {
      case 'ui':
        tone(660, 0.06, 'square', 0.05, 880, 2200);
        break;
      case 'jump':
        tone(300, 0.16, 'square', 0.09, 620, 2400);
        break;
      case 'land':
        tone(150, 0.12, 'sine', 0.12, 60, 400);
        break;
      case 'hit':
        tone(220, 0.3, 'sawtooth', 0.18, 45, 900);
        tone(90, 0.25, 'square', 0.12, 40, 500);
        break;
      case 'ability':
        tone(420, 0.22, 'triangle', 0.14, 1100, 3000);
        break;
      case 'shield':
        tone(880, 0.3, 'sine', 0.12, 440, 2000);
        break;
      case 'pad':
        tone(240, 0.24, 'sawtooth', 0.12, 900, 1800);
        break;
      case 'checkpoint':
        tone(880, 0.1, 'triangle', 0.08, 1180, 3000);
        break;
      case 'countdown':
        tone(620, 0.12, 'square', 0.1, 620, 1800);
        break;
      case 'go':
        tone(880, 0.28, 'square', 0.12, 880, 3000);
        tone(1320, 0.32, 'triangle', 0.09, 1320, 4000);
        break;
      case 'lap':
        tone(660, 0.12, 'triangle', 0.11, 990, 3000);
        break;
      case 'finish':
        [0, 4, 7, 12].forEach((s, i) =>
          setTimeout(() => {
            if (this.ctx) this.tone(midiToHz(392, s), this.ctx.currentTime + 0.02, 0.32, 'triangle', 0.12, this.sfxGain, 3500);
          }, i * 120),
        );
        break;
      case 'eliminated':
        tone(300, 0.5, 'sawtooth', 0.14, 70, 700);
        break;
      case 'trap':
        tone(180, 0.18, 'square', 0.14, 60, 700);
        this.noiseHit(now, 0.08, 0.12, 2400, 'bandpass');
        break;
      case 'swap':
        tone(200, 0.35, 'sine', 0.12, 1400, 3000);
        break;
      case 'win':
        [0, 4, 7, 12, 16].forEach((s, i) =>
          setTimeout(() => {
            if (this.ctx) this.tone(midiToHz(261.63, s), this.ctx.currentTime + 0.02, 0.45, 'triangle', 0.12, this.sfxGain, 4000);
          }, i * 110),
        );
        break;
      default:
        tone(520, 0.07, 'square', 0.05, 700, 2000);
    }
  }
}
