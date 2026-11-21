import { TrackRuntime } from '@shared/tracks.js';

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const shade = (n, f) => {
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return (r << 16) | (g << 8) | b;
};

export class TrackView {
  constructor(scene, track, quality = 'high') {
    this.scene = scene;
    this.track = track;
    this.theme = track.theme;
    this.quality = quality;
    this.runtime = new TrackRuntime(track);
    this.seed = track.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7);
    this.dyn = null;
    this.bridgeRects = [];
    this.lowDetail = quality === 'low';
  }

  build() {
    const s = this.scene;
    const t = this.theme;
    const W = s.scale.width;
    const H = s.scale.height;
    this.buildSky(W, H);
    this.buildBackground();
    this.buildStatics();
    this.dyn = s.add.graphics().setDepth(9);
    return this;
  }

  buildSky(W, H) {
    const s = this.scene;
    const t = this.theme;
    const g = s.add.graphics().setScrollFactor(0).setDepth(-60);
    const steps = 22;
    for (let i = 0; i < steps; i++) {
      const f = i / (steps - 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(t.sky[0]),
        Phaser.Display.Color.ValueToColor(t.sky[1]),
        100,
        f * 100,
      );
      const col = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
      g.fillStyle(col, 1);
      g.fillRect(0, (H / steps) * i - 2, W, H / steps + 3);
    }
    // brilho superior
    g.fillStyle(0xffffff, 0.05);
    g.fillCircle(W * 0.7, -60, 220);

    if (!this.lowDetail) {
      const rnd = mulberry32(this.seed * 13);
      const stars = s.add.graphics().setScrollFactor(0.02, 0.05).setDepth(-59);
      for (let i = 0; i < 90; i++) {
        const x = rnd() * (this.track.finishX * 0.05 + W);
        const y = rnd() * H * 0.6;
        stars.fillStyle(0xffffff, 0.25 + rnd() * 0.5);
        stars.fillCircle(x, y, rnd() * 1.6 + 0.6);
      }
    }
  }

  buildBackground() {
    const style = this.theme.style;
    if (style === 'city') this.cityLayers();
    else if (style === 'factory') this.factoryLayers();
    else if (style === 'forest') this.forestLayers();
    else if (style === 'mountain') this.mountainLayers();
    else this.orbitalLayers();
  }

  layerGraphics(factor, depth, alpha = 1) {
    return this.scene.add
      .graphics()
      .setScrollFactor(factor, 0.18)
      .setDepth(depth)
      .setAlpha(alpha);
  }

  spanFor(factor) {
    return this.track.finishX * factor + this.scene.scale.width * 2;
  }

  cityLayers() {
    const t = this.theme;
    const s = this.scene;
    const rnd = mulberry32(this.seed);

    // camada distante
    const far = this.layerGraphics(0.12, -50);
    const spanFar = this.spanFor(0.12);
    for (let x = -100; x < spanFar; x += 90 + rnd() * 130) {
      const w = 70 + rnd() * 110;
      const h = 180 + rnd() * 420;
      far.fillStyle(t.far, 1);
      far.fillRect(x, 660 - h, w, h + 500);
      if (!this.lowDetail) {
        far.fillStyle(t.accent2, 0.16);
        for (let wy = 660 - h + 24; wy < 600; wy += 34) {
          for (let wx = x + 12; wx < x + w - 12; wx += 26) {
            if (rnd() > 0.55) far.fillRect(wx, wy, 9, 12);
          }
        }
      }
    }
    // camada média com letreiros
    const mid = this.layerGraphics(0.32, -40);
    const spanMid = this.spanFor(0.32);
    for (let x = -80; x < spanMid; x += 130 + rnd() * 160) {
      const w = 90 + rnd() * 130;
      const h = 260 + rnd() * 500;
      mid.fillStyle(t.mid, 1);
      mid.fillRect(x, 680 - h, w, h + 500);
      mid.fillStyle(t.accent, 0.55);
      mid.fillRect(x + 10, 680 - h + 18, w - 20, 7);
      if (rnd() > 0.5) {
        mid.fillStyle(t.accent2, 0.35);
        mid.fillRect(x + w * 0.3, 680 - h + 44, w * 0.4, 5);
      }
      if (!this.lowDetail) {
        mid.fillStyle(0xffffff, 0.05);
        for (let wy = 680 - h + 70; wy < 600; wy += 44) mid.fillRect(x + 18, wy, w - 36, 10);
      }
    }
    // luzes de rua / neblina
    const near = this.layerGraphics(0.6, -30);
    const spanNear = this.spanFor(0.6);
    for (let x = 0; x < spanNear; x += 220) {
      near.fillStyle(t.accent, 0.5);
      near.fillRect(x, 590, 4, 90);
      near.fillStyle(t.accent, 0.12);
      near.fillCircle(x + 2, 588, 26);
    }
    const glow = s.add.graphics().setScrollFactor(0.6, 0.2).setDepth(-29);
    glow.fillStyle(t.fog, 0.35);
    glow.fillRect(0, 560, spanNear, 260);
  }

  factoryLayers() {
    const t = this.theme;
    const s = this.scene;
    const rnd = mulberry32(this.seed + 3);
    const far = this.layerGraphics(0.14, -50);
    const span = this.spanFor(0.14);
    for (let x = -60; x < span; x += 150 + rnd() * 130) {
      const h = 240 + rnd() * 380;
      far.fillStyle(t.far, 1);
      far.fillRect(x, 660 - h, 110 + rnd() * 50, h + 500);
      far.fillStyle(shade(t.far, 1.35), 1);
      far.fillRect(x, 660 - h - 16, 30, 20);
    }
    const mid = this.layerGraphics(0.34, -40);
    const spanMid = this.spanFor(0.34);
    for (let x = 0; x < spanMid; x += 260) {
      mid.fillStyle(t.mid, 1);
      mid.fillRect(x, 560, 46, 260);
      mid.fillStyle(t.accent, 0.25);
      mid.fillRect(x + 8, 580, 30, 12);
      mid.fillStyle(t.accent, 0.12);
      mid.fillCircle(x + 23, 570, 60);
    }
    // tubulação
    mid.lineStyle(9, t.near, 0.9);
    mid.beginPath();
    mid.moveTo(0, 600);
    for (let x = 0; x < spanMid; x += 180) mid.lineTo(x + 90, 600 + Math.sin(x) * 14);
    mid.strokePath();
    const sparks = s.add.graphics().setScrollFactor(0.5, 0.2).setDepth(-32);
    for (let i = 0; i < 30; i++) {
      sparks.fillStyle(t.particle, 0.4 + rnd() * 0.4);
      sparks.fillCircle(rnd() * this.spanFor(0.5), 300 + rnd() * 320, 1 + rnd() * 2.2);
    }
  }

  forestLayers() {
    const t = this.theme;
    const s = this.scene;
    const rnd = mulberry32(this.seed + 11);
    const far = this.layerGraphics(0.14, -50);
    const span = this.spanFor(0.14);
    for (let x = -60; x < span; x += 70 + rnd() * 80) {
      const h = 260 + rnd() * 340;
      const w = 26 + rnd() * 26;
      far.fillStyle(t.far, 1);
      far.fillTriangle(x, 660, x + w / 2, 660 - h, x + w, 660);
    }
    const mid = this.layerGraphics(0.36, -40);
    const spanMid = this.spanFor(0.36);
    for (let x = -40; x < spanMid; x += 110 + rnd() * 110) {
      const h = 300 + rnd() * 260;
      const w = 46 + rnd() * 44;
      mid.fillStyle(t.mid, 1);
      mid.fillTriangle(x, 700, x + w / 2, 700 - h, x + w, 700);
      mid.fillStyle(shade(t.mid, 1.3), 0.8);
      mid.fillTriangle(x + w * 0.25, 700, x + w / 2, 700 - h, x + w * 0.55, 700);
    }
    const near = this.layerGraphics(0.62, -30);
    const spanNear = this.spanFor(0.62);
    for (let x = 0; x < spanNear; x += 160) {
      near.fillStyle(t.near, 0.95);
      near.fillRect(x, 520, 26, 260);
      near.fillStyle(t.accent2, 0.18);
      near.fillEllipse(x + 60, 540, 140, 70);
    }
    if (!this.lowDetail) {
      const flies = s.add.graphics().setScrollFactor(0.8, 0.5).setDepth(-28);
      for (let i = 0; i < 46; i++) {
        flies.fillStyle(t.particle, 0.5 + rnd() * 0.4);
        flies.fillCircle(rnd() * this.spanFor(0.8), 240 + rnd() * 330, 1.4 + rnd());
      }
    }
  }

  mountainLayers() {
    const t = this.theme;
    const s = this.scene;
    const rnd = mulberry32(this.seed + 21);
    // lua
    const moon = s.add.graphics().setScrollFactor(0.04, 0.04).setDepth(-52);
    moon.fillStyle(0xffffff, 0.12);
    moon.fillCircle(880, 130, 78);
    moon.fillStyle(0xf8fafc, 0.9);
    moon.fillCircle(880, 130, 52);
    moon.fillStyle(0xe2e8f0, 0.35);
    moon.fillCircle(858, 118, 12);
    moon.fillCircle(898, 148, 8);

    const layers = [
      { f: 0.12, d: -50, col: t.far, base: 640, hMin: 300, hMax: 520 },
      { f: 0.3, d: -42, col: t.mid, base: 680, hMin: 280, hMax: 480 },
      { f: 0.55, d: -34, col: t.near, base: 700, hMin: 240, hMax: 420 },
    ];
    for (const L of layers) {
      const g = this.layerGraphics(L.f, L.d);
      const span = this.spanFor(L.f);
      for (let x = -100; x < span; x += 180 + rnd() * 180) {
        const h = L.hMin + rnd() * (L.hMax - L.hMin);
        const w = 220 + rnd() * 260;
        g.fillStyle(L.col, 1);
        g.fillTriangle(x, L.base, x + w / 2, L.base - h, x + w, L.base);
        g.fillStyle(0xffffff, 0.22);
        g.fillTriangle(x + w / 2, L.base - h, x + w * 0.36, L.base - h * 0.62, x + w * 0.64, L.base - h * 0.62);
      }
    }
    if (!this.lowDetail) {
      const snow = s.add.graphics().setScrollFactor(0.7, 0.4).setDepth(-28);
      for (let i = 0; i < 70; i++) {
        snow.fillStyle(0xffffff, 0.3 + rnd() * 0.5);
        snow.fillCircle(rnd() * this.spanFor(0.7), rnd() * 700, 0.8 + rnd() * 1.8);
      }
    }
  }

  orbitalLayers() {
    const t = this.theme;
    const s = this.scene;
    const rnd = mulberry32(this.seed + 31);
    const planet = s.add.graphics().setScrollFactor(0.06, 0.06).setDepth(-52);
    planet.fillStyle(t.accent, 0.16);
    planet.fillCircle(760, 170, 150);
    planet.fillStyle(t.accent, 0.35);
    planet.fillCircle(760, 170, 116);
    planet.lineStyle(10, t.accent2, 0.5);
    planet.strokeEllipse(760, 170, 320, 70);

    const far = this.layerGraphics(0.16, -48);
    const span = this.spanFor(0.16);
    for (let x = -60; x < span; x += 220 + rnd() * 200) {
      const w = 100 + rnd() * 140;
      far.fillStyle(t.far, 1);
      far.fillRect(x, 420 + rnd() * 80, w, 20);
      far.fillStyle(t.mid, 1);
      far.fillRect(x + 20, 440, 16, 120 + rnd() * 90);
      far.fillStyle(t.accent2, 0.4);
      far.fillRect(x, 420, w, 4);
    }
    const mid = this.layerGraphics(0.4, -36);
    const spanMid = this.spanFor(0.4);
    for (let x = 0; x < spanMid; x += 260) {
      mid.lineStyle(2, t.accent, 0.28);
      mid.strokeRect(x, 300 + Math.sin(x) * 30, 180, 240);
      mid.fillStyle(t.accent, 0.09);
      mid.fillRect(x, 300 + Math.sin(x) * 30, 180, 240);
      mid.fillStyle(t.accent2, 0.4);
      mid.fillCircle(x + 20, 330 + Math.sin(x) * 30, 4);
    }
    const grid = this.layerGraphics(0.6, -30);
    grid.lineStyle(1, t.accent2, 0.12);
    for (let i = 0; i < 40; i++) grid.lineBetween(0, 600 + i * 26, this.spanFor(0.6), 600 + i * 26);
  }

  buildStatics() {
    const s = this.scene;
    const t = this.theme;
    const staticPlats = this.track.platforms.filter((p) => p.kx === 'static');
    for (const p of staticPlats) {
      const isIce = p.kind === 'ice';
      const fill = isIce ? 0x2b6b86 : t.ground;
      const top = isIce ? 0xbfefff : t.groundTop;
      const body = s.add.rectangle(p.x, p.y, p.w, p.h, fill).setOrigin(0, 0).setDepth(6);
      body.setStrokeStyle(1, shade(fill, 1.35), 0.9);
      const rim = s.add.rectangle(p.x, p.y, p.w, isIce ? 6 : 4, top).setOrigin(0, 0).setDepth(7);
      rim.setAlpha(isIce ? 0.85 : 0.95);
      if (p.isGround && !this.lowDetail) {
        const glow = s.add
          .rectangle(p.x, p.y - 2, p.w, 26, top)
          .setOrigin(0, 0)
          .setDepth(5)
          .setAlpha(isIce ? 0.08 : 0.07);
        glow.setBlendMode(Phaser.BlendModes.ADD);
        // detalhes
        const rnd = mulberry32(Math.floor(p.x) + 13);
        for (let i = 0; i < Math.min(4, Math.floor(p.w / 120)); i++) {
          const dx = p.x + 30 + rnd() * (p.w - 60);
          const d = s.add.rectangle(dx, p.y + 16 + rnd() * 40, 22 + rnd() * 30, 3, top).setOrigin(0, 0).setDepth(7);
          d.setAlpha(0.18);
        }
      }
    }
  }

  /** Desenha tudo que é dinâmico. Chamado a cada frame com o mesmo array usado na física. */
  drawDynamic(t, solids, hazards, pads, traps, zones, eventsActive) {
    const g = this.dyn;
    const theme = this.theme;
    g.clear();

    // plataformas móveis / intermitentes / pontes
    for (const p of solids) {
      if (p.kx === 'moving') {
        g.fillStyle(0x1a1030, 0.95);
        g.fillRect(p.x, p.y, p.w, p.h);
        g.lineStyle(2, theme.accent, 0.9);
        g.strokeRect(p.x, p.y, p.w, p.h);
        g.fillStyle(theme.accent, 0.85);
        g.fillRect(p.x + 4, p.y, Math.max(0, p.w - 8), 4);
        g.fillStyle(theme.accent, 0.12);
        g.fillRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
      } else if (p.kx === 'blink') {
        const ph = ((t / p.period + (p.phase || 0)) % 1 + 1) % 1;
        const life = ph < (p.duty ?? 0.62);
        g.fillStyle(life ? 0x123a2a : 0x2a1030, life ? 0.95 : 0.35);
        g.fillRect(p.x, p.y, p.w, p.h);
        g.lineStyle(2, life ? 0x6ee7a8 : 0x7f1d1d, life ? 0.9 : 0.5);
        g.strokeRect(p.x, p.y, p.w, p.h);
        if (life) {
          g.fillStyle(0x6ee7a8, 0.16 + Math.sin(t * 6) * 0.06);
          g.fillRect(p.x, p.y - 3, p.w, 6);
        }
      } else if (p.kx === 'bridge') {
        g.lineStyle(3, theme.accent2, 0.85);
        g.strokeRect(p.x, p.y, p.w, p.h);
        g.fillStyle(theme.accent2, 0.2);
        g.fillRect(p.x, p.y, p.w, p.h);
        for (let x = p.x + 6; x < p.x + p.w; x += 18) {
          g.lineStyle(1, theme.accent2, 0.5);
          g.lineBetween(x, p.y, x + 6, p.y + p.h);
        }
      }
    }

    // pads
    for (const pad of pads) {
      const pulse = 0.5 + Math.sin(t * 5 + pad.x) * 0.25;
      g.fillStyle(0xffc93a, 0.25 + pulse * 0.3);
      g.fillRect(pad.x, pad.y, pad.w, pad.h);
      g.fillStyle(0xfff3c4, 0.85);
      for (let i = 0; i < 3; i++) {
        const ox = pad.x + pad.w - 14 - i * 17 + ((t * 90) % 17);
        g.fillTriangle(ox, pad.y + 1, ox + 10, pad.y + 1, ox + 10, pad.y + 10);
      }
    }

    // perigos
    for (const h of hazards) {
      if (h.kind === 'spike') {
        const n = Math.max(1, Math.floor(h.w / 20));
        const step = h.w / n;
        g.fillStyle(0xff4d6d, 0.9);
        for (let i = 0; i < n; i++) {
          const x = h.x + i * step;
          g.fillTriangle(x, h.y + h.h, x + step / 2, h.y, x + step, h.y + h.h);
        }
        g.fillStyle(0xffffff, 0.35);
        for (let i = 0; i < n; i++) {
          const x = h.x + i * step;
          g.fillTriangle(x + step * 0.42, h.y + 6, x + step / 2, h.y, x + step * 0.58, h.y + 6);
        }
      } else if (h.kind === 'saw') {
        const cx = h.x + h.w / 2;
        const cy = h.y + h.h / 2;
        const r = h.w / 2;
        g.fillStyle(0x1b1030, 0.95);
        g.fillCircle(cx, cy, r);
        g.lineStyle(3, 0xff4d6d, 0.95);
        g.strokeCircle(cx, cy, r);
        g.fillStyle(0xff4d6d, 0.95);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t * 8;
          g.fillTriangle(
            cx + Math.cos(a) * r * 0.75,
            cy + Math.sin(a) * r * 0.75,
            cx + Math.cos(a + 0.28) * (r + 9),
            cy + Math.sin(a + 0.28) * (r + 9),
            cx + Math.cos(a - 0.28) * (r + 9),
            cy + Math.sin(a - 0.28) * (r + 9),
          );
        }
        g.fillStyle(0x64748b, 1);
        g.fillCircle(cx, cy, 5);
      } else if (h.kind === 'laser') {
        const on = 0.65 + Math.sin(t * 12) * 0.2;
        g.fillStyle(0xff2f6d, 0.16 * on);
        g.fillRect(h.x - 5, h.y, h.w + 10, h.h);
        g.fillStyle(0xfff0f4, 0.95);
        g.fillRect(h.x + h.w / 2 - 2, h.y, 4, h.h);
        g.fillStyle(0xff2f6d, 0.85);
        g.fillRect(h.x, h.y, h.w, h.h);
        // emissores
        g.fillStyle(0x334155, 1);
        g.fillRect(h.x - 6, h.y - 10, h.w + 12, 10);
        g.fillRect(h.x - 6, h.y + h.h, h.w + 12, 10);
      } else if (h.kind === 'drill') {
        g.fillStyle(0x475569, 1);
        g.fillRect(h.x + h.w * 0.2, h.y - 320, h.w * 0.6, 320);
        g.fillStyle(0xffb35c, 0.95);
        g.fillRect(h.x, h.y, h.w, h.h);
        g.fillStyle(0x7c2d12, 0.9);
        g.fillTriangle(h.x, h.y + h.h, h.x + h.w / 2, h.y + h.h + 22, h.x + h.w, h.y + h.h);
        g.fillStyle(0x1c1917, 0.7);
        for (let i = 1; i < 4; i++) g.fillRect(h.x, h.y + (h.h / 4) * i, h.w, 3);
      } else if (h.kind === 'meteor') {
        g.fillStyle(0xff7a2f, 0.22);
        g.fillCircle(h.x + h.w / 2, h.y + h.h / 2, h.w * 0.95);
        g.fillStyle(0xf97316, 1);
        g.fillCircle(h.x + h.w / 2, h.y + h.h / 2, h.w / 2);
        g.fillStyle(0xffe4a1, 1);
        g.fillCircle(h.x + h.w / 2 - 4, h.y + h.h / 2 - 4, h.w / 4);
      }
    }

    // minas
    for (const tr of traps) {
      const pulse = 0.5 + Math.sin(t * 9) * 0.5;
      g.fillStyle(0xfb7185, 0.25 + pulse * 0.3);
      g.fillCircle(tr.x + 17, tr.y + 13, 22);
      g.fillStyle(0x2a0a18, 1);
      g.fillCircle(tr.x + 17, tr.y + 13, 13);
      g.lineStyle(2, 0xff4d6d, 0.9);
      g.strokeCircle(tr.x + 17, tr.y + 13, 13);
      g.fillStyle(0xffd166, 0.6 + pulse * 0.4);
      g.fillCircle(tr.x + 17, tr.y + 13, 3.5);
    }

    // zonas de tempestade
    for (const z of zones) {
      const a = 0.08 + Math.sin(t * 7) * 0.03;
      g.fillStyle(0x34d399, a);
      g.fillRect(z.x, 0, z.w, this.track.killY);
      g.lineStyle(2, 0x34d399, 0.4);
      for (let i = 0; i < 3; i++) {
        const zx = z.x + ((t * 220 + i * 150) % z.w);
        g.lineBetween(zx, 120, zx - 30, 420);
      }
    }

    // linha de chegada
    const fx = this.track.finishX;
    const flag = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffffff),
      Phaser.Display.Color.ValueToColor(theme.accent),
      8,
      Math.floor(t * 8) % 8,
    );
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(fx, 300, 6, 360);
    for (let i = 0; i < 12; i++) {
      g.fillStyle(i % 2 === 0 ? 0xffffff : 0x0b0618, 0.9);
      g.fillRect(fx + 6, 300 + i * 30, 34, 30);
    }
    g.fillStyle(Phaser.Display.Color.GetColor(flag.r, flag.g, flag.b), 0.75);
    g.fillRect(fx + 40, 300, 10, 360);
  }

  destroy() {
    this.dyn?.destroy();
  }
}
