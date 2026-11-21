import Phaser from 'phaser';
import { CHARACTER_MAP } from '@shared/characters.js';
import { COSMETIC_MAP } from '@shared/cosmetics.js';
import { PLAYER_H } from '@shared/constants.js';

let dotReady = false;
function ensureDotTexture(scene) {
  if (dotReady) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture('cr-dot', 8, 8);
  g.destroy();
  dotReady = true;
}

const FLAG = {
  grounded: 1,
  sliding: 2,
  shield: 4,
  boost: 8,
  slow: 16,
  finished: 32,
  eliminated: 64,
  frozen: 128,
  disconnected: 256,
  invuln: 512,
  quantum: 1024,
};

export class CharacterView {
  constructor(scene, info, isSelf, quality) {
    this.scene = scene;
    this.info = info;
    this.isSelf = isSelf;
    this.quality = quality;
    this.character = CHARACTER_MAP[info.character] || CHARACTER_MAP.vulcan;
    this.cosmetics = info.cosmetics || {};
    this.lastX = 0;
    this.lastY = 0;
    this.emoteTimer = 0;
    this.state = { x: 0, y: 0, vx: 0, vy: 0, flags: 0 };
    this.build();
  }

  build() {
    const s = this.scene;
    ensureDotTexture(s);
    const ch = this.character;
    const skin = COSMETIC_MAP.skins[this.cosmetics.skin] || COSMETIC_MAP.skins.default;
    const acc = COSMETIC_MAP.accessories[this.cosmetics.accessory];
    const trail = COSMETIC_MAP.trails[this.cosmetics.trail];
    const bodyColor = skin.tint || ch.colors.body;
    const accent = ch.colors.accent;
    const visor = ch.colors.visor;

    this.trailColor = trail?.color || accent;

    this.root = s.add.container(0, 0).setDepth(12);
    this.bodyGroup = s.add.container(0, 0);
    this.root.add(this.bodyGroup);

    // sombra
    this.shadow = s.add.ellipse(17, PLAYER_H + 2, 34, 9, 0x000000, 0.35);
    this.root.add(this.shadow);

    const g = s.add.graphics();

    // braço de trás
    g.fillStyle(Phaser.Display.Color.ValueToColor(bodyColor).darken(18).color, 1);
    g.fillRoundedRect(2, 22, 7, 18, 3);

    // pernas
    this.legBack = s.add.rectangle(12, 40, 7, 17, Phaser.Display.Color.ValueToColor(bodyColor).darken(25).color);
    this.legBack.setOrigin(0.5, 0);
    this.legFront = s.add.rectangle(22, 40, 7, 17, Phaser.Display.Color.ValueToColor(bodyColor).darken(10).color);
    this.legFront.setOrigin(0.5, 0);
    this.bodyGroup.add([this.legBack, this.legFront]);

    // torso
    if (ch.shape === 'tank') {
      g.fillStyle(bodyColor, 1);
      g.fillRoundedRect(4, 18, 26, 28, 6);
      g.fillStyle(accent, 0.85);
      g.fillRoundedRect(4, 38, 26, 8, 4);
      g.fillStyle(accent, 0.35);
      g.fillRect(8, 22, 18, 4);
    } else if (ch.shape === 'float') {
      g.fillStyle(bodyColor, 0.92);
      g.fillRoundedRect(8, 20, 18, 24, 9);
      g.fillStyle(accent, 0.4);
      g.fillRoundedRect(10, 24, 14, 6, 3);
    } else if (ch.shape === 'bot') {
      g.fillStyle(bodyColor, 1);
      g.fillRoundedRect(6, 19, 22, 26, 4);
      g.fillStyle(accent, 0.9);
      g.fillRect(9, 26, 16, 3);
      g.fillRect(9, 33, 16, 3);
    } else if (ch.shape === 'chaos') {
      g.fillStyle(bodyColor, 1);
      g.fillRoundedRect(5, 18, 24, 28, 5);
      g.fillStyle(accent, 0.8);
      g.fillTriangle(5, 18, 17, 26, 5, 30);
      g.fillTriangle(29, 18, 17, 26, 29, 30);
    } else {
      g.fillStyle(bodyColor, 1);
      g.fillRoundedRect(5, 19, 24, 26, 7);
      g.fillStyle(accent, 0.9);
      g.fillRoundedRect(5, 36, 24, 7, 3);
      g.fillStyle(accent, 0.35);
      g.fillRect(9, 23, 12, 3);
    }

    // cabeça
    const headY = 12;
    if (ch.shape === 'bot') {
      g.fillStyle(bodyColor, 1);
      g.fillRoundedRect(8, 3, 18, 17, 4);
      g.fillStyle(accent, 0.95);
      g.fillRect(15, -2, 4, 5);
    } else {
      g.fillStyle(bodyColor, 1);
      g.fillCircle(17, headY, 11);
    }
    // visor
    g.fillStyle(visor, 1);
    if (ch.shape === 'float') {
      g.fillEllipse(17, headY - 1, 16, 8);
    } else if (ch.shape === 'scout') {
      g.fillTriangle(8, headY - 2, 26, headY - 2, 17, headY + 4);
    } else {
      g.fillRoundedRect(9, headY - 5, 16, 7, 3);
    }
    // brilho do visor
    g.fillStyle(accent, 0.85);
    if (ch.shape !== 'float') g.fillRect(11, headY - 4, 5, 2);
    else g.fillCircle(13, headY - 2, 1.6);

    // braço da frente
    g.fillStyle(bodyColor, 1);
    g.fillRoundedRect(26, 22, 7, 18, 3);

    // acessórios
    if (acc && acc.id !== 'none') this.drawAccessory(g, acc.id, accent);

    this.bodyGraphics = g;
    this.bodyGroup.add(g);

    // brilho do personagem (silhueta)
    this.outline = s.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.outline.lineStyle(2, Phaser.Display.Color.ValueToColor(accent).color, 0.55);
    this.outline.strokeCircle(17, headY, 12);
    this.outline.strokeRoundedRect(4, 17, 26, 30, 6);
    this.outline.setAlpha(0.35);
    this.bodyGroup.add(this.outline);

    // escudo
    this.shieldBubble = s.add.circle(17, 28, 32, 0x38bdf8, 0.14).setStrokeStyle(2, 0x38bdf8, 0.75);
    this.shieldBubble.setVisible(false);
    this.root.add(this.shieldBubble);

    // aura de impulso
    this.boostAura = s.add.circle(17, 30, 26, 0xfbbf24, 0.18).setVisible(false);
    this.root.add(this.boostAura);

    // partículas
    if (quality !== 'low' && this.trailColor) {
      this.trail = s.add
        .particles(0, 0, 'cr-dot', {
          lifespan: 380,
          speed: { min: 10, max: 45 },
          scale: { start: 0.75, end: 0 },
          alpha: { start: 0.75, end: 0 },
          tint: Phaser.Display.Color.ValueToColor(this.trailColor).color,
          blendMode: 'ADD',
          frequency: -1,
          emitting: false,
        })
        .setDepth(11);
    }

    // nome
    this.label = s.add
      .text(17, -16, this.info.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: isSelf ? '#29e7ff' : '#e9e4ff',
        stroke: '#05020e',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
    this.root.add(this.label);

    // seta do jogador local
    if (this.isSelf) {
      this.marker = s.add.triangle(17, -26, 0, 0, 14, 0, 7, 10, 0x29e7ff).setAlpha(0.95);
      this.root.add(this.marker);
    }

    this.emoteText = s.add
      .text(17, -46, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#fff',
        backgroundColor: '#1a0a33',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.root.add(this.emoteText);
  }

  drawAccessory(g, id, accent) {
    const c = Phaser.Display.Color.ValueToColor(accent).color;
    if (id === 'goggles') {
      g.fillStyle(c, 0.95);
      g.fillRoundedRect(7, 5, 20, 6, 3);
      g.fillStyle(0x0b0618, 0.75);
      g.fillRoundedRect(10, 6, 6, 4, 2);
      g.fillRoundedRect(18, 6, 6, 4, 2);
    } else if (id === 'antenna') {
      g.lineStyle(2, c, 1);
      g.lineBetween(17, 2, 17, -8);
      g.fillStyle(c, 1);
      g.fillCircle(17, -10, 3);
    } else if (id === 'crown') {
      g.fillStyle(c, 1);
      g.fillTriangle(7, 4, 11, -5, 15, 4);
      g.fillTriangle(14, 4, 18, -7, 22, 4);
      g.fillTriangle(21, 4, 25, -5, 29, 4);
    } else if (id === 'horns') {
      g.fillStyle(c, 1);
      g.fillTriangle(7, 4, 4, -7, 12, 1);
      g.fillTriangle(27, 4, 30, -7, 22, 1);
    } else if (id === 'halo') {
      g.lineStyle(3, c, 0.85);
      g.strokeEllipse(17, -6, 26, 7);
    }
  }

  setEmote(icon) {
    if (!icon) {
      this.emoteText.setVisible(false);
      return;
    }
    this.emoteText.setText(icon).setVisible(true).setAlpha(1).setY(-40);
    this.emoteTimer = 2.4;
  }

  update(dt, state, running) {
    this.state = state;
    const { x, y, vx, vy, flags } = state;
    const sliding = flags & FLAG.sliding;
    const grounded = flags & FLAG.grounded;
    const eliminated = flags & FLAG.eliminated;
    const finished = flags & FLAG.finished;
    const invuln = flags & FLAG.invuln;
    const quantum = flags & FLAG.quantum;

    this.root.setPosition(Math.round(x), Math.round(y));
    this.root.setVisible(!(eliminated && !finished));

    // animação de corrida
    const speed = Math.abs(vx);
    const phase = this.scene.time.now / (speed > 40 ? 90 : 220);
    if (grounded && !sliding) {
      const swing = Math.sin(phase) * Math.min(0.85, speed / 620 + 0.25);
      this.legBack.setRotation(-swing);
      this.legFront.setRotation(swing);
      this.bodyGroup.y = Math.abs(Math.sin(phase)) * -1.6;
    } else if (!grounded) {
      this.legBack.setRotation(-0.55);
      this.legFront.setRotation(0.35);
      this.bodyGroup.y = 0;
    } else {
      this.legBack.setRotation(0.2);
      this.legFront.setRotation(-0.2);
      this.bodyGroup.y = 0;
    }

    if (sliding) {
      this.bodyGroup.setScale(1, 0.62);
      this.bodyGroup.setRotation(0.22);
      this.bodyGroup.y = 20;
      this.shadow.setScale(1.25, 0.8);
    } else {
      this.bodyGroup.setScale(1, 1);
      this.bodyGroup.setRotation(Phaser.Math.Clamp(vx / 4200, -0.18, 0.22));
      this.shadow.setScale(1, 1);
    }

    // pulo
    this.root.setScale(1, 1);
    if (!grounded && vy < -100) this.root.setScale(0.96, 1.05);
    else if (!grounded && vy > 400) this.root.setScale(1.03, 0.97);

    // efeitos
    this.shieldBubble.setVisible(!!(flags & FLAG.shield));
    if (flags & FLAG.shield) {
      this.shieldBubble.setScale(1 + Math.sin(this.scene.time.now / 180) * 0.06);
      this.shieldBubble.alpha = 0.85;
    }
    this.boostAura.setVisible(!!(flags & FLAG.boost));
    if (flags & FLAG.boost) this.boostAura.alpha = 0.25 + Math.sin(this.scene.time.now / 70) * 0.15;

    if (invuln) this.root.alpha = 0.6 + Math.sin(this.scene.time.now / 60) * 0.35;
    else if (quantum) this.root.alpha = 0.75;
    else this.root.alpha = 1;
    if (eliminated) this.root.alpha = 0.3;

    this.outline.setAlpha(finished ? 0.75 : 0.3);

    // marca do local
    if (this.marker) {
      this.marker.setVisible(!finished);
      this.marker.y = -24 + Math.sin(this.scene.time.now / 220) * 3;
    }

    // rastro
    if (this.trail && running) {
      const showTrail = speed > 180 || flags & FLAG.boost || (!grounded && Math.abs(vy) > 250);
      if (showTrail) {
        const count = speed > 500 || flags & FLAG.boost ? 2 : 1;
        for (let i = 0; i < count; i++) {
          this.trail.emitParticleAt(x + 8 + Math.random() * 18, y + 30 + Math.random() * 20);
        }
      }
    }
    if (this.emoteTimer > 0) {
      this.emoteTimer -= dt;
      if (this.emoteTimer <= 0) this.emoteText.setVisible(false);
      else this.emoteText.y -= dt * 12;
    }

    if (finished && !this.finishShown) {
      this.finishShown = true;
      this.scene.tweens.add({
        targets: this.root,
        scaleY: 1.18,
        scaleX: 0.88,
        duration: 140,
        yoyo: true,
        repeat: 2,
      });
    }
  }

  destroy() {
    this.trail?.destroy();
    this.root?.destroy(true);
  }
}
