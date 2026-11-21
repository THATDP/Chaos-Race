// Pistas: geometria + elementos dinâmicos determinísticos.
// O MESMO módulo roda no servidor (autoridade) e no cliente (predição/render),
// então a pista nunca "descola" entre os jogadores.
//
// Para adicionar uma pista nova basta declarar um novo defineTrack() usando os
// blocos prontos (gapRun, moverRun, hazardRun, shortcut, iceRun...). Nada de
// reescrever o jogo.
import { PLAYER_H } from './constants.js';

export const WORLD = { groundY: 620, killY: 1120 };

export class TrackBuilder {
  constructor(id, name, subtitle, theme, opts = {}) {
    this.id = id;
    this.name = name;
    this.subtitle = subtitle;
    this.theme = theme;
    this.opts = opts;
    this.gy = opts.groundY || WORLD.groundY;
    this.x = 0;
    this.platforms = [];
    this.hazards = [];
    this.pads = [];
    this.checkpoints = [];
    this.movingCount = 0;
  }

  // ---------- primitivas ----------
  ground(len, { kind = 'solid', y = this.gy, h = 320 } = {}) {
    const p = { x: this.x, y, w: len, h, kind, kx: 'static', isGround: true };
    this.platforms.push(p);
    this.x += len;
    return p;
  }

  gap(len) {
    this.x += len;
  }

  absPlatform(x, w, y, { kind = 'solid', h = 24, isGround = false } = {}) {
    const p = { x, y, w, h, kind, kx: 'static', isGround };
    this.platforms.push(p);
    return p;
  }

  moving(w, { y = this.gy, axis = 'y', amp = 50, period = 3.6, phase = 0, kind = 'solid', h = 24 } = {}) {
    const p = {
      x: this.x,
      y,
      w,
      h,
      kind,
      kx: 'moving',
      axis,
      amp,
      period,
      phase: phase + this.movingCount * 0.13,
      mx: this.x,
      my: y,
      id: `mv${this.movingCount++}`,
    };
    this.platforms.push(p);
    return p;
  }

  blink(w, { y = this.gy, period = 3.4, phase = 0, duty = 0.64, kind = 'solid', h = 24 } = {}) {
    this.platforms.push({ x: this.x, y, w, h, kind, kx: 'blink', period, phase, duty });
  }

  bridge(w, { y = this.gy + 12, h = 18 } = {}) {
    this.platforms.push({ x: this.x, y, w, h, kind: 'bridge', kx: 'bridge' });
  }

  ice(len) {
    return this.ground(len, { kind: 'ice' });
  }

  stairs(steps, { w = 66, rise = 56, startX = this.x } = {}) {
    for (let i = 0; i < steps; i++) {
      this.absPlatform(startX + i * w, w, this.gy - (i + 1) * rise, { h: 22 });
    }
  }

  spike(count, { x = this.x, gap = 72, w = 40, h = 32, y = this.gy } = {}) {
    for (let i = 0; i < count; i++) this.hazards.push({ kind: 'spike', x: x + i * gap, y: y - h, w, h });
  }

  saw(x, y, { amp = 110, period = 3.2, phase = 0, size = 46 } = {}) {
    this.hazards.push({ kind: 'saw', x, y, w: size, h: size, amp, period, phase });
  }

  laser(x, { y = this.gy - 220, h = 220, w = 12, period = 2.6, phase = 0, duty = 0.45 } = {}) {
    this.hazards.push({ kind: 'laser', x, y, w, h, period, phase, duty });
  }

  drill(x, { y = this.gy - 300, w = 52, h = 84, amp = 190, period = 2.4, phase = 0 } = {}) {
    this.hazards.push({ kind: 'drill', x, y, w, h, amp, period, phase });
  }

  pad({ x = this.x, w = 90, power = 820 } = {}) {
    this.pads.push({ x: x + 8, y: this.gy - 10, w, h: 12, power });
  }

  checkpoint(x = this.x + 56) {
    this.checkpoints.push({ x, y: this.gy });
  }

  finishZone(len = 620) {
    const start = this.x;
    this.ground(len);
    this.finishX = start + 200;
    return this;
  }

  // ---------- blocos compostos (garantem espaçamento jogável) ----------
  /** Vão simples com corrida livre antes e depois. */
  gapRun(len = 235, landing = 360) {
    this.gap(len);
    this.ground(landing);
    return this;
  }

  /** Vão atravessado por plataforma móvel no meio. */
  moverRun(landing = 380) {
    this.gap(140);
    this.moving(150, { y: this.gy - 60, amp: 42, period: 3.6 });
    this.gap(160);
    this.ground(landing);
    return this;
  }

  /** Corrida com espinhos saltáveis. */
  spikeRun(count = 2, { len = 540 } = {}) {
    const start = this.x;
    this.ground(len);
    this.spike(count, { x: start + 190, gap: 78, w: 42, h: 32 });
    return this;
  }

  /** Portal de tempo (laser/drill) com espaço para esperar. */
  hazardRun(kind = 'laser', { len = 560 } = {}) {
    const start = this.x;
    this.ground(len);
    if (kind === 'laser') this.laser(start + 230, { y: this.gy - 200, h: 200, period: 2.5, phase: 0.2 });
    else if (kind === 'drill') this.drill(start + 250, { y: this.gy - 300, amp: 200, period: 2.4 });
    else if (kind === 'saw') this.saw(start + 250, this.gy - 54, { amp: 120, period: 3, size: 50 });
    return this;
  }

  /** Rota superior (atalho) com escada, prêmio e perigo. */
  shortcut({ len = 1000, saw: hasSaw = true, rise = 56 } = {}) {
    const start = this.x;
    this.ground(len);
    const sx = start + 210;
    this.stairs(3, { startX: sx, rise, w: 66 });
    const ux = sx + 198;
    this.absPlatform(ux, 380, this.gy - rise * 3, { h: 22 });
    if (hasSaw) this.saw(ux + 150, this.gy - rise * 3 - 62, { amp: 100, period: 3, size: 46 });
    this.absPlatform(ux + 380, 200, this.gy - rise * 3, { h: 22 });
    return this;
  }

  /** Piso escorregadio. */
  iceRun(len = 320) {
    const start = this.x;
    this.ice(len);
    return start;
  }

  autoCheckpoints() {
    const grounds = this.platforms.filter((p) => p.isGround).sort((a, b) => a.x - b.x);
    const cps = [{ x: 70, y: this.gy }];
    let last = 0;
    for (const g of grounds) {
      if (g.x - last >= 900 && g.x > 200) {
        cps.push({ x: g.x + 56, y: g.y });
        last = g.x;
      }
    }
    this.checkpoints = cps.filter((c) => c.x < this.finishX - 140);
  }

  build() {
    if (this.finishX == null) throw new Error(`pista ${this.id} sem finishZone`);
    this.autoCheckpoints();
    const spawnY = this.gy - PLAYER_H;
    this.spawns = [];
    for (let i = 0; i < 8; i++) this.spawns.push({ x: 60 + i * 44, y: spawnY });
    return {
      id: this.id,
      name: this.name,
      subtitle: this.subtitle,
      theme: this.theme,
      groundY: this.gy,
      killY: this.opts.killY || WORLD.killY,
      platforms: this.platforms,
      hazards: this.hazards,
      pads: this.pads,
      checkpoints: this.checkpoints,
      spawns: this.spawns,
      finishX: this.finishX,
      length: this.finishX + 200,
    };
  }
}

// ---------------------------------------------------------------------------
const THEMES = {
  city: {
    style: 'city',
    sky: [0x150b33, 0x3b1569],
    far: 0x2a1a55,
    mid: 0x3d2470,
    near: 0x120a26,
    ground: 0x241640,
    groundTop: 0x59e1ff,
    accent: 0xff4fd8,
    accent2: 0x59e1ff,
    fog: 0x1a0f38,
    particle: 0x59e1ff,
  },
  foundry: {
    style: 'factory',
    sky: [0x2b0f0a, 0x7a2a10],
    far: 0x46170e,
    mid: 0x2a120b,
    near: 0x180906,
    ground: 0x2a1410,
    groundTop: 0xffb35c,
    accent: 0xff6b2c,
    accent2: 0xffc24b,
    fog: 0x2a120b,
    particle: 0xff8a3d,
  },
  jungle: {
    style: 'forest',
    sky: [0x04160f, 0x0e3d2a],
    far: 0x0d3a2c,
    mid: 0x145138,
    near: 0x071f17,
    ground: 0x0f2d21,
    groundTop: 0x6ee7a8,
    accent: 0xc6ff4f,
    accent2: 0x50e3c2,
    fog: 0x0a2418,
    particle: 0xb6ff6b,
  },
  peaks: {
    style: 'mountain',
    sky: [0x081a33, 0x27548a],
    far: 0x2f5d8f,
    mid: 0x1d3f66,
    near: 0x0b1e33,
    ground: 0x1b2f47,
    groundTop: 0xbfe8ff,
    accent: 0x8fd8ff,
    accent2: 0xffffff,
    fog: 0x142c47,
    particle: 0xffffff,
  },
  orbital: {
    style: 'orbital',
    sky: [0x07031a, 0x241150],
    far: 0x1d1146,
    mid: 0x120a2e,
    near: 0x08041a,
    ground: 0x161033,
    groundTop: 0xc084fc,
    accent: 0xa855f7,
    accent2: 0x22d3ee,
    fog: 0x0d0724,
    particle: 0xd8b4fe,
  },
};

// ---------------------------------------------------------------------------
// PISTAS
// ---------------------------------------------------------------------------
export const TRACKS = [];
const defineTrack = (fn) => TRACKS.push(fn());

// 1. CIDADE NEON — telhados, letreiros e atalhos aéreos
defineTrack(() => {
  const b = new TrackBuilder('neon-city', 'Cidade Neon', 'Telhados molhados, letreiros e atalhos aéreos', THEMES.city);
  b.ground(700);
  b.blink(160, { y: b.gy - 155, period: 3.1 });
  b.ground(240);
  b.gapRun(235, 400);
  b.spikeRun(2, { len: 520 });
  b.shortcut({ len: 1080, saw: true });
  b.pad({ x: b.x + 40, power: 850 });
  b.ground(320);
  b.gapRun(225, 340);
  b.hazardRun('laser', { len: 540 });
  b.iceRun(280);
  b.ground(200);
  b.moverRun(360);
  b.spikeRun(3, { len: 560 });
  b.blink(170, { y: b.gy - 70, period: 3, duty: 0.6 });
  b.gap(150);
  b.ground(400);
  b.finishZone(620);
  return b.build();
});

// 2. FUNDIÇÃO VULCÂNICA — pistões, esteiras e metal quente
defineTrack(() => {
  const b = new TrackBuilder('foundry', 'Fundição Vulcânica', 'Pistões, esteiras e chão fervendo', THEMES.foundry);
  b.ground(720);
  b.pad({ x: b.x - 260, power: 870 });
  b.ground(260);
  b.hazardRun('drill', { len: 600 });
  b.spikeRun(3, { len: 580 });
  b.gapRun(240, 380);
  b.shortcut({ len: 1000, saw: true, rise: 58 });
  b.gapRun(210, 360);
  b.hazardRun('saw', { len: 560 });
  b.pad({ x: b.x + 30, power: 900 });
  b.ground(180);
  b.moverRun(380);
  b.iceRun(300);
  b.ground(200);
  b.hazardRun('laser', { len: 560 });
  b.spikeRun(2, { len: 500 });
  b.gapRun(225, 380);
  b.finishZone(600);
  return b.build();
});

// 3. FLORESTA ANCESTRAL — cipós móveis, espinhos e lama
defineTrack(() => {
  const b = new TrackBuilder('jungle', 'Floresta Ancestral', 'Cipós, espinhos e lama escorregadia', THEMES.jungle);
  b.ground(740);
  b.spikeRun(2, { len: 560 });
  b.gapRun(200, 340);
  b.moverRun(340);
  b.iceRun(340);
  b.ground(220);
  b.hazardRun('saw', { len: 560 });
  b.gapRun(235, 320);
  b.shortcut({ len: 1020, saw: false, rise: 56 });
  b.gapRun(215, 340);
  b.hazardRun('laser', { len: 540 });
  b.moverRun(360);
  b.spikeRun(3, { len: 560 });
  b.blink(170, { y: b.gy - 90, period: 3.2, duty: 0.62 });
  b.gap(170);
  b.ground(400);
  b.finishZone(600);
  return b.build();
});

// 4. PICOS CONGELADOS — gelo, vento e plataformas suspensas
defineTrack(() => {
  const b = new TrackBuilder('peaks', 'Picos Congelados', 'Gelo traiçoeiro e abismos de vento', THEMES.peaks);
  b.ground(720);
  b.iceRun(400);
  b.gapRun(240, 340);
  b.moverRun(340);
  b.spikeRun(3, { len: 560 });
  b.iceRun(320);
  b.ground(200);
  b.hazardRun('laser', { len: 560 });
  b.gapRun(235, 340);
  b.moverRun(360);
  b.iceRun(300);
  b.spikeRun(2, { len: 520 });
  b.shortcut({ len: 1000, saw: true, rise: 56 });
  b.gapRun(230, 380);
  b.hazardRun('drill', { len: 580 });
  b.moverRun(380);
  b.blink(170, { y: b.gy - 80, period: 3, duty: 0.6 });
  b.gap(160);
  b.ground(400);
  b.finishZone(600);
  return b.build();
});

// 5. ESTAÇÃO ORBITAL — gravidade, lasers e plataformas de energia
defineTrack(() => {
  const b = new TrackBuilder('orbital', 'Estação Orbital', 'Plataformas de energia e lasers no vácuo', THEMES.orbital);
  b.ground(720);
  b.blink(160, { y: b.gy - 140, period: 2.9 });
  b.ground(220);
  b.gap(150);
  b.blink(180, { y: b.gy - 45, period: 2.8, phase: 0.32, duty: 0.6 });
  b.gap(170);
  b.ground(320);
  b.hazardRun('laser', { len: 600 });
  b.gapRun(230, 360);
  b.pad({ x: b.x + 30, power: 880 });
  b.ground(200);
  b.spikeRun(3, { len: 560 });
  b.moverRun(360);
  b.shortcut({ len: 1000, saw: true, rise: 60 });
  b.hazardRun('laser', { len: 560 });
  b.iceRun(280);
  b.ground(200);
  b.moverRun(380);
  b.gapRun(220, 360);
  b.blink(170, { y: b.gy - 70, period: 3, duty: 0.6 });
  b.gap(160);
  b.ground(400);
  b.finishZone(600);
  return b.build();
});

export const TRACK_MAP = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

export function getTrack(id) {
  return TRACK_MAP[id] || TRACKS[0];
}

export function randomTrackId(exclude) {
  const pool = TRACKS.filter((t) => t.id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ---------------------------------------------------------------------------
// Tempo de execução: posições dinâmicas determinísticas
// ---------------------------------------------------------------------------
export class TrackRuntime {
  constructor(track) {
    this.track = track;
    this.staticSolids = track.platforms.filter((p) => p.kx === 'static');
    this.dynamicSolids = track.platforms.filter((p) => p.kx !== 'static');
    this.cache = new Map();
    this.cacheTime = -1;
    this.cacheBridge = null;
    this.solidsCache = [];
    this.hazardCacheTime = -1;
    this.hazardCache = [];
  }

  solids(t, bridgeActive) {
    if (this.cacheTime === t && this.cacheBridge === bridgeActive) return this.solidsCache;
    const out = this.staticSolids.slice();
    for (const p of this.dynamicSolids) {
      if (p.kx === 'bridge') {
        if (bridgeActive) out.push(p);
      } else if (p.kx === 'blink') {
        const ph = (((t / p.period + (p.phase || 0)) % 1) + 1) % 1;
        if (ph < (p.duty ?? 0.62)) out.push(p);
      } else if (p.kx === 'moving') {
        const ph = (((t / p.period + (p.phase || 0)) % 1) + 1) % 1;
        const off = Math.sin(ph * Math.PI * 2) * p.amp;
        out.push({ ...p, x: p.axis === 'x' ? p.mx + off : p.mx, y: p.axis === 'y' ? p.my + off : p.my });
      }
    }
    this.solidsCache = out;
    this.cacheTime = t;
    this.cacheBridge = bridgeActive;
    return out;
  }

  hazards(t, extra = []) {
    if (this.hazardCacheTime === t) {
      return extra.length ? this.hazardCache.concat(extra) : this.hazardCache;
    }
    const out = [];
    for (const h of this.track.hazards) {
      if (h.kind === 'spike') out.push(h);
      else if (h.kind === 'saw') {
        const ph = (((t / h.period + (h.phase || 0)) % 1) + 1) % 1;
        out.push({ ...h, x: h.x + Math.sin(ph * Math.PI * 2) * h.amp });
      } else if (h.kind === 'drill') {
        const ph = (((t / h.period + (h.phase || 0)) % 1) + 1) % 1;
        out.push({ ...h, y: h.y + h.amp + Math.sin(ph * Math.PI * 2) * h.amp });
      } else if (h.kind === 'laser') {
        const ph = (((t / h.period + (h.phase || 0)) % 1) + 1) % 1;
        if (ph < (h.duty ?? 0.45)) out.push(h);
      }
    }
    this.hazardCache = out;
    this.hazardCacheTime = t;
    return extra.length ? out.concat(extra) : out;
  }
}
