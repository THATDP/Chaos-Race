import Phaser from 'phaser';
import { getTrack, TrackRuntime } from '@shared/tracks.js';
import { createPlayer, stepPlayer } from '@shared/physics.js';
import { PHYSICS_DT, PLAYER_H, SLIDE_H } from '@shared/constants.js';
import { chaosModifiers, isChaosActive, meteorRects, CHAOS_MAP } from '@shared/chaos.js';
import { ABILITY_MAP } from '@shared/abilities.js';
import { EMOTES } from '@shared/cosmetics.js';
import { CHARACTER_MAP } from '@shared/characters.js';
import { TrackView } from './trackView.js';
import { CharacterView } from './characterView.js';
import { FLAG, has } from './flags.js';
import { ServerClock, SnapshotBuffer } from '../net/interp.js';

const r2 = (v) => Math.round(v * 100) / 100;
const INTERP_DELAY = 0.1;

export class RaceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RaceScene' });
  }

  init(data) {
    this.ctx = data;
    this.match = data.match;
    this.track = getTrack(this.match.trackId);
    this.runtime = new TrackRuntime(this.track);
    this.selfMeta = this.match.players.find((p) => p.id === data.selfId) || this.match.players[0];
    this.selfIndex = this.selfMeta.i;
    this.playersMeta = new Map(this.match.players.map((p) => [p.i, p]));
    this.clock = new ServerClock();
    this.snaps = new SnapshotBuffer(INTERP_DELAY);
    this.chaosEvents = [];
    this.traps = [];
    this.zones = [];
    this.seq = 0;
    this.pending = [];
    this.batch = [];
    this.sendAcc = 0;
    this.acc = 0;
    this.racing = false;
    this.selfFinished = false;
    this.eliminated = false;
    this.hudAcc = 0;
    this.phase = 'c';
    this.countdownShown = -1;
    this.lastSnap = null;
    this.smooth = { x: null, y: null };
    this.announced = new Set();
    this.jumpQueued = false;
    this.prevJumpHeld = false;
    this.jumpHeld = false;
    this.touch = { left: false, right: false, jump: false, slide: false };
    this.recordSamples = [];
    this.recordAcc = 0;
    this.destroyed = false;
    this.lastSelfLives = null;
    this.lastSelfPlace = null;
    this.created = false;
    this.earlySnaps = [];
  }

  create() {
    this.cameras.main.setBackgroundColor('#05020e');
    this.trackView = new TrackView(this, this.track, this.ctx.quality).build();
    this.cameras.main.setBounds(0, 0, this.track.finishX + 1000, this.track.killY + 500);

    this.views = new Map();
    for (const meta of this.match.players) {
      const view = new CharacterView(this, meta, meta.i === this.selfIndex, this.ctx.quality);
      this.views.set(meta.i, view);
    }
    this.selfState = createPlayer({
      id: this.selfMeta.id,
      name: this.selfMeta.name,
      index: this.selfIndex,
      ability: this.selfMeta.ability,
      track: this.track,
      lives: 0,
    });

    const cam = this.cameras.main;
    cam.startFollow(this.views.get(this.selfIndex).root, true, 0.16, 0.1);
    cam.setDeadzone(120, 80);
    cam.setFollowOffset(-40, 60);
    cam.setZoom(this.scale.width < 700 ? 0.85 : 1);

    this.fxLayer = this.add.graphics().setScrollFactor(0).setDepth(40);
    this.vignette = this.add.graphics().setScrollFactor(0).setDepth(41).setAlpha(0);

    this.setupInput();
    this.setupGhost();
    this.ctx.hud?.show?.(this.match, this.playersMeta, this.selfIndex);
    this.created = true;
    if (this.earlySnaps.length) {
      const latest = this.earlySnaps[this.earlySnaps.length - 1];
      this.earlySnaps = [];
      this.handleSnapshot(latest);
    }
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', this.cleanup, this);
    window.addEventListener('blur', this.onBlur);
  }

  onResize() {
    this.cameras.main.setZoom(this.scale.width < 700 ? 0.85 : 1);
  }

  setupInput() {
    const kb = this.input.keyboard;
    this.keys = kb.addKeys('A,D,LEFT,RIGHT,W,UP,S,DOWN,SPACE,SHIFT,E,ESC,ONE,TWO,THREE,FOUR,FIVE,SIX');
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    this.graphicsBursts = [];
  }

  setupGhost() {
    const ghost = this.ctx.ghost;
    if (this.match.mode !== 'timeattack' || !ghost?.samples?.length) return;
    this.ghostData = ghost.samples;
    this.ghostView = new CharacterView(
      this,
      { name: 'FANTASMA', character: 'nix', ability: 'turbo', cosmetics: { skin: 'frost', trail: 'neon', accessory: 'none' } },
      false,
      'low',
    );
    this.ghostView.root.setAlpha(0.45);
    this.ghostView.label.setText(`fantasma ${ghost.time.toFixed(2)}s`).setAlpha(0.6);
  }

  onBlur = () => {
    this.touch.left = false;
    this.touch.right = false;
    this.touch.jump = false;
    this.touch.slide = false;
  };

  // ------------------------------------------------------------------
  // Rede
  // ------------------------------------------------------------------
  handleSnapshot(snap) {
    if (this.destroyed || !snap) return;
    if (!this.created) {
      this.earlySnaps.push(snap);
      if (this.earlySnaps.length > 4) this.earlySnaps.shift();
      return;
    }
    this.lastSnap = snap;
    this.clock.update(snap.t);
    this.snaps.push(snap);
    const prevPhase = this.phase;
    this.phase = snap.ph === 'c' ? 'c' : 'r';

    this.chaosEvents = (snap.ev || []).map((e) => ({ id: e[0], start: e[1], duration: e[2], seed: e[3] }));
    this.traps = (snap.tr || []).map((t) => ({ id: t[0], x: t[1], y: t[2], owner: t[3], until: t[4] }));
    this.zones = (snap.zn || []).map((z) => ({ x: z[0], w: z[1], until: z[2], owner: z[3] }));

    const row = snap.p.find((p) => p[0] === this.selfIndex);
    if (row) this.reconcile(row, snap.t);

    if (this.phase === 'c') {
      const n = Math.ceil(snap.cd - 0.001);
      if (n !== this.countdownShown && n > 0) {
        this.countdownShown = n;
        this.ctx.hud?.countdown?.(n);
        this.ctx.audio?.sfx('countdown');
      }
    } else if (prevPhase === 'c' || (!this.racing && this.phase === 'r')) {
      this.startRacing();
    }

    // anúncio de eventos de caos
    for (const ev of this.chaosEvents) {
      const key = `${ev.id}:${ev.start}`;
      if (!this.announced.has(key) && ev.start <= this.clock.t + 0.4) {
        this.announced.add(key);
        const def = CHAOS_MAP[ev.id];
        this.ctx.hud?.setChaos?.({ ...def, duration: ev.duration, start: ev.start, serverT: snap.t });
        this.ctx.audio?.sfx('ability');
        this.cameras.main.flash(220, 120, 60, 180, false);
      }
    }
  }

  handleGo() {
    this.startRacing(true);
  }

  startRacing(immediate = false) {
    if (this.racing) return;
    this.racing = true;
    this.ctx.hud?.go?.();
    if (immediate) this.ctx.audio?.sfx('go');
  }

  reconcile(row, snapT) {
    const st = this.selfState;
    const [i, x, y, vx, vy, flags, ack, cp, laps, lives, prog, cd, ft] = row;
    const wasLeft = has(this.selfState._flags || 0, FLAG.eliminated);
    st.x = x;
    st.y = y;
    st.vx = vx;
    st.vy = vy;
    st.checkpoint = cp;
    st.laps = laps;
    st.lives = lives;
    st.grounded = has(flags, FLAG.grounded);
    st.sliding = has(flags, FLAG.sliding);
    st.h = st.sliding ? SLIDE_H : PLAYER_H;
    st.supportId = null;
    st._flags = flags;
    st.invulnUntil = has(flags, FLAG.invuln) ? snapT + 0.25 : 0;
    st.freezeUntil = has(flags, FLAG.frozen) ? snapT + 0.2 : 0;
    st.shieldUntil = has(flags, FLAG.shield) ? snapT + 0.5 : 0;
    st.boostUntil = has(flags, FLAG.boost) ? snapT + 0.5 : 0;
    st.slowUntil = has(flags, FLAG.slow) ? snapT + 0.5 : 0;
    st.quantumUntil = has(flags, FLAG.quantum) ? snapT + 0.4 : 0;
    this.selfFinished = has(flags, FLAG.finished);
    this.eliminated = has(flags, FLAG.eliminated);
    this.abilityCooldown = cd;

    if (this.eliminated && !wasLeft) {
      this.ctx.hud?.eliminated?.();
      this.ctx.audio?.sfx('eliminated');
    }
    if (this.lastSelfLives != null && lives < this.lastSelfLives && !this.eliminated) {
      this.cameras.main.shake(200, 0.008);
      this.ctx.hud?.notice?.('Você perdeu uma vida!', 1600);
    }
    this.lastSelfLives = lives;

    // replay dos inputs ainda não confirmados
    const world = this.worldNow();
    const keep = [];
    for (const rec of this.pending) {
      if (rec.seq > ack) {
        keep.push(rec);
        try {
          stepPlayer(st, rec, PHYSICS_DT, this.runtime, this.clock.t, world);
        } catch {
          /* ignora erro de replay isolado */
        }
      }
    }
    this.pending = keep;

    if (this.selfFinished && this.lastSelfPlace == null) {
      const place = this.rank().findIndex((r) => r.i === this.selfIndex) + 1;
      this.lastSelfPlace = place;
      this.ctx.hud?.selfFinished?.(place);
      this.ctx.audio?.sfx('finish');
      this.cameras.main.flash(300, 255, 255, 255, false);
    }
  }

  handleFx(fx) {
    if (this.destroyed || !fx) return;
    const view = this.views.get(fx.i);
    const audio = this.ctx.audio;
    switch (fx.t) {
      case 'jump':
        break; // som local já toca na predição
      case 'land':
        if (fx.i === this.selfIndex) audio?.sfx('land');
        break;
      case 'pad':
        audio?.sfx('pad');
        this.burst(fx.x + 45, fx.y + 40, 0xffc93a, 10);
        break;
      case 'checkpoint':
        if (fx.i === this.selfIndex) {
          audio?.sfx('checkpoint');
          this.ctx.hud?.notice?.('Checkpoint!', 1100);
        }
        break;
      case 'shield':
        audio?.sfx('shield');
        this.burst(fx.x + 17, fx.y + 28, 0x38bdf8, 14);
        break;
      case 'ability':
        if (fx.i === this.selfIndex) audio?.sfx('ability');
        this.burst(fx.x + 17, fx.y + 28, ABILITY_MAP[fx.a]?.color ? Phaser.Display.Color.HexStringToColor(ABILITY_MAP[fx.a].color).color : 0xffffff, 16);
        break;
      case 'trap':
        audio?.sfx('trap');
        this.burst(fx.x + 17, fx.y + 14, 0xfb7185, 18);
        break;
      case 'hit':
        this.burst(fx.x + 17, fx.y + 28, 0xff4d6d, 18);
        if (fx.i === this.selfIndex) {
          audio?.sfx('hit');
          this.cameras.main.shake(240, 0.012);
          this.flashVignette(0xff2f6d);
        }
        break;
      case 'fall':
        if (fx.i === this.selfIndex) {
          audio?.sfx('hit');
          this.flashVignette(0x29e7ff);
          this.ctx.hud?.notice?.('Você caiu! Voltando ao checkpoint…', 1500);
        }
        break;
      case 'swap':
        audio?.sfx('swap');
        this.burst(fx.x + 17, fx.y + 28, 0xf472b6, 22);
        break;
      case 'finish':
        if (fx.i !== this.selfIndex) this.burst(fx.x + 17, fx.y + 28, 0xb6ff3a, 24);
        break;
      case 'lap':
        if (fx.i === this.selfIndex) {
          audio?.sfx('lap');
          this.ctx.hud?.notice?.(`Volta ${fx.laps} concluída!`, 1400);
        }
        break;
      case 'eliminated':
        if (fx.i === this.selfIndex) {
          this.ctx.hud?.eliminated?.();
          audio?.sfx('eliminated');
        } else {
          this.ctx.hud?.notice?.(`${this.playersMeta.get(fx.i)?.name || 'Jogador'} foi eliminado`, 2200);
        }
        break;
      case 'elimWarning':
        this.ctx.hud?.notice?.('Eliminação em instantes!', 2600);
        this.ctx.audio?.sfx('countdown');
        break;
      case 'emote': {
        const emote = EMOTES.find((e) => e.id === fx.e);
        view?.setEmote(emote?.icon || '💬');
        break;
      }
      case 'reconnect':
        this.ctx.hud?.notice?.(`${this.playersMeta.get(fx.i)?.name || 'Jogador'} reconectou`, 1800);
        break;
      default:
        break;
    }
  }

  burst(x, y, color, count = 12) {
    if (this.ctx.quality === 'low') return;
    const g = this.add.graphics().setDepth(30);
    g.fillStyle(color, 0.9);
    const dots = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 200;
      dots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, r: 1.5 + Math.random() * 3 });
    }
    let life = 0.55;
    const update = (_t, dtMs) => {
      const dt = dtMs / 1000;
      life -= dt;
      g.clear();
      for (const d of dots) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 520 * dt;
        g.fillStyle(color, Math.max(0, life / 0.55) * 0.85);
        g.fillCircle(d.x, d.y, d.r);
      }
      if (life <= 0) {
        this.events.off('update', update);
        g.destroy();
      }
    };
    this.events.on('update', update);
  }

  flashVignette(color) {
    this.vignette.clear();
    const W = this.scale.width;
    const H = this.scale.height;
    this.vignette.fillStyle(color, 0.5);
    this.vignette.fillRect(0, 0, W, 8);
    this.vignette.fillRect(0, H - 8, W, 8);
    this.vignette.fillRect(0, 0, 8, H);
    this.vignette.fillRect(W - 8, 0, 8, H);
    this.vignette.setAlpha(0.9);
    this.tweens.add({ targets: this.vignette, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
  }

  // ------------------------------------------------------------------
  // Loop principal
  // ------------------------------------------------------------------
  update(time, delta) {
    if (this.destroyed) return;
    const dt = Math.min(0.05, delta / 1000);
    this.clock.advance(dt);
    this.world = this.worldNow();
    this.acc += dt;
    let steps = 0;
    while (this.acc >= PHYSICS_DT && steps < 5) {
      this.acc -= PHYSICS_DT;
      steps++;
      this.fixedStep();
    }

    this.sendAcc += dt;
    if (this.sendAcc >= 1 / 30 && this.batch.length) {
      this.sendAcc = 0;
      this.ctx.sendInputs?.(this.batch);
      this.batch = [];
    }

    this.handleKeys();
    this.updateViews(dt);
    this.updateGhost(dt);
    this.updateChaosVisual(dt);
    this.updateRecording(dt);
    this.trackView.drawDynamic(
      this.clock.t,
      this.world.solids,
      this.world.hazards,
      this.track.pads,
      this.traps,
      this.zones,
    );

    this.hudAcc += dt;
    if (this.hudAcc >= 0.1) {
      this.hudAcc = 0;
      this.ctx.hud?.update?.(this.hudState());
    }
  }

  worldNow() {
    const t = this.clock.t;
    const bridge = isChaosActive(this.chaosEvents, t, 'bridge');
    const solids = this.runtime.solids(r2(t), bridge);
    const extra = [];
    for (const ev of this.chaosEvents) if (ev.id === 'meteors') extra.push(...meteorRects(ev, t, this.track));
    return {
      solids,
      hazards: this.runtime.hazards(r2(t), extra),
      pads: this.track.pads,
      checkpoints: this.track.checkpoints,
      killY: this.track.killY,
      finishX: this.track.finishX,
      mods: chaosModifiers(this.chaosEvents, t),
      zones: this.zones,
      track: this.track,
    };
  }

  fixedStep() {
    if (this.phase !== 'r' || this.selfFinished || this.eliminated) return;
    const left = this.touch.left || this.keys.A.isDown || this.keys.LEFT.isDown;
    const right = this.touch.right || this.keys.D.isDown || this.keys.RIGHT.isDown;
    this.jumpHeld = !!(this.touch.jump || this.keys.SPACE.isDown || this.keys.W.isDown || this.keys.UP.isDown);
    if (this.jumpHeld && !this.prevJumpHeld) this.jumpQueued = true;
    this.prevJumpHeld = this.jumpHeld;
    const jump = this.jumpQueued ? 1 : 0;
    this.jumpQueued = false;
    const slide = this.touch.slide || this.keys.S.isDown || this.keys.DOWN.isDown;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const rec = { seq: ++this.seq, dir, jump, hold: this.jumpHeld ? 1 : 0, slide: slide ? 1 : 0 };
    this.pending.push(rec);
    this.batch.push([rec.seq, rec.dir, rec.jump, rec.hold, rec.slide]);
    if (this.pending.length > 150) this.pending.shift();
    if (!this.world) this.world = this.worldNow();
    const evs = stepPlayer(this.selfState, rec, PHYSICS_DT, this.runtime, this.clock.t, this.world);
    for (const ev of evs) {
      if (ev.type === 'jump') {
        this.ctx.audio?.sfx('jump');
        this.burst(this.selfState.x + 17, this.selfState.y + 50, 0xffffff, 6);
      } else if (ev.type === 'land' && ev.speed > 500) {
        this.ctx.audio?.sfx('land');
      }
    }
  }

  handleKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.SHIFT)) {
      this.useAbility();
    }
    const emoteKeys = [this.keys.ONE, this.keys.TWO, this.keys.THREE, this.keys.FOUR, this.keys.FIVE, this.keys.SIX];
    for (let i = 0; i < emoteKeys.length; i++) {
      if (emoteKeys[i] && Phaser.Input.Keyboard.JustDown(emoteKeys[i])) this.sendEmote(i);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.ctx.onPause?.();
  }

  useAbility() {
    if (!this.racing || this.selfFinished || this.eliminated) return;
    if ((this.abilityCooldown ?? 0) > 0.15) {
      this.ctx.hud?.notice?.('Habilidade recarregando…', 900);
      return;
    }
    this.ctx.useAbility?.();
    this.ctx.audio?.sfx('ability');
    const st = this.selfState;
    // resposta imediata (o servidor confirma depois)
    if (this.selfMeta.ability === 'turbo') {
      st.boostUntil = this.clock.t + 1;
      st.vx = Math.max(st.vx, 780);
    } else if (this.selfMeta.ability === 'quantum') {
      st.vy = -1100;
      st.grounded = false;
      st.supportId = null;
    }
    this.burst(st.x + 17, st.y + 28, 0xffffff, 12);
  }

  sendEmote(index) {
    const e = EMOTES[index];
    if (!e) return;
    this.ctx.emote?.(e.id);
    this.views.get(this.selfIndex)?.setEmote(e.icon);
    this.ctx.audio?.sfx('ui');
  }

  setTouch(key, value) {
    if (key in this.touch) this.touch[key] = value;
  }

  updateViews(dt) {
    const t = this.clock.t;
    const st = this.selfState;
    if (this.smooth.x == null) {
      this.smooth.x = st.x;
      this.smooth.y = st.y;
    }
    const dx = st.x - this.smooth.x;
    const dy = st.y - this.smooth.y;
    if (Math.abs(dx) > 110 || Math.abs(dy) > 140) {
      this.smooth.x = st.x;
      this.smooth.y = st.y;
    } else {
      const k = Math.min(1, dt * 20);
      this.smooth.x += dx * k;
      this.smooth.y += dy * k;
    }
    let flags = 0;
    if (st.grounded) flags |= FLAG.grounded;
    if (st.sliding) flags |= FLAG.sliding;
    if (st.shieldUntil > t) flags |= FLAG.shield;
    if (st.boostUntil > t) flags |= FLAG.boost;
    if (st.slowUntil > t) flags |= FLAG.slow;
    if (this.selfFinished) flags |= FLAG.finished;
    if (this.eliminated) flags |= FLAG.eliminated;
    if (st.freezeUntil > t) flags |= FLAG.frozen;
    if (st.invulnUntil > t) flags |= FLAG.invuln;
    if (st.quantumUntil > t) flags |= FLAG.quantum;

    const selfView = this.views.get(this.selfIndex);
    selfView.update(dt, {
      x: this.smooth.x,
      y: this.smooth.y,
      vx: st.vx,
      vy: st.vy,
      flags,
    }, this.racing);

    const remotes = this.snaps.sample(this.clock.t - INTERP_DELAY);
    for (const [index, view] of this.views) {
      if (index === this.selfIndex) continue;
      const s = remotes.get(index);
      if (s) {
        view.update(dt, s, this.racing);
      } else if (this.lastSnap) {
        const row = this.lastSnap.p.find((p) => p[0] === index);
        if (row) {
          view.update(dt, {
            x: row[1],
            y: row[2],
            vx: row[3],
            vy: row[4],
            flags: row[5],
          }, this.racing);
        }
      }
    }
  }

  updateGhost(dt) {
    if (!this.ghostView || !this.ghostData) return;
    const t = this.clock.t;
    const arr = this.ghostData;
    if (!arr.length) return;
    if (t <= arr[0][0]) {
      this.ghostView.update(dt, { x: arr[0][1], y: arr[0][2], vx: 0, vy: 0, flags: FLAG.grounded }, true);
      return;
    }
    if (t >= arr[arr.length - 1][0]) {
      this.ghostView.root.setVisible(false);
      return;
    }
    let lo = 0;
    let hi = arr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid][0] <= t) lo = mid;
      else hi = mid;
    }
    const a = arr[lo];
    const b = arr[hi];
    const k = (t - a[0]) / Math.max(0.001, b[0] - a[0]);
    this.ghostView.root.setVisible(true);
    this.ghostView.update(dt, {
      x: a[1] + (b[1] - a[1]) * k,
      y: a[2] + (b[2] - a[2]) * k,
      vx: (b[1] - a[1]) / Math.max(0.001, b[0] - a[0]),
      vy: 0,
      flags: FLAG.grounded | (a[3] ? FLAG.sliding : 0),
    }, true);
  }

  updateRecording(dt) {
    if (this.match.mode !== 'timeattack' || !this.racing || this.selfFinished) return;
    this.recordAcc += dt;
    if (this.recordAcc >= 0.08) {
      this.recordAcc = 0;
      if (this.recordSamples.length < 3000) {
        this.recordSamples.push([r2(this.clock.t), r2(this.selfState.x), r2(this.selfState.y), this.selfState.sliding ? 1 : 0]);
      }
    }
  }

  updateChaosVisual(dt) {
    const g = this.fxLayer;
    g.clear();
    const W = this.scale.width;
    const H = this.scale.height;
    const t = this.clock.t;
    const mods = this.world?.mods || { gravity: 1, friction: 1, windX: 0, speed: 1 };
    const active = mods.active || [];

    for (const ev of active) {
      const def = CHAOS_MAP[ev.id];
      if (!def) continue;
      if (ev.id === 'slippery' || ev.id === 'bridge') {
        g.fillStyle(Phaser.Display.Color.HexStringToColor(def.color).color, 0.06);
        g.fillRect(0, 0, W, H);
      } else if (ev.id === 'heavygrav') {
        g.fillStyle(0xf59e0b, 0.05);
        g.fillRect(0, 0, W, H);
      } else if (ev.id === 'lowgrav') {
        g.fillStyle(0x7dd3fc, 0.05);
        g.fillRect(0, 0, W, H);
      } else if (ev.id === 'overdrive') {
        g.fillStyle(0xfacc15, 0.05);
        g.fillRect(0, 0, W, H);
      } else if (ev.id === 'wind') {
        g.lineStyle(2, 0xc4b5fd, 0.25);
        const dir = Math.sign(mods.windX) || 1;
        const offset = (t * 420 * dir) % W;
        for (let i = 0; i < 14; i++) {
          const y = ((i * 97 + t * 60 * dir) % H + H) % H;
          const x = ((offset + i * 131) % (W + 200) + W + 200) % (W + 200) - 100;
          g.lineBetween(x, y, x + 46 * dir, y);
        }
      }
    }

    // linhas de velocidade quando o jogador está muito rápido
    const speed = Math.abs(this.selfState.vx);
    if (speed > 620 && this.ctx.quality !== 'low') {
      const a = Math.min(0.3, (speed - 620) / 900);
      g.lineStyle(2, 0xffffff, a);
      for (let i = 0; i < 8; i++) {
        const y = ((i * 83 + t * 700) % H);
        const x = ((t * 900 + i * 220) % (W + 300)) - 150;
        g.lineBetween(x, y, x - 90, y);
      }
    }
  }

  hudState() {
    const rows = [];
    if (this.lastSnap) {
      for (const row of this.lastSnap.p) {
        const meta = this.playersMeta.get(row[0]) || {};
        const ch = CHARACTER_MAP[meta.character] || CHARACTER_MAP.vulcan;
        rows.push({
          i: row[0],
          name: meta.name || '?',
          color: ch.colors.accent,
          progress: row[10],
          laps: row[8],
          lives: row[9],
          flags: row[5],
          finishT: row[12],
          cd: row[11],
          isSelf: row[0] === this.selfIndex,
          eliminated: has(row[5], FLAG.eliminated),
        });
      }
    }
    const mode = this.match.mode;
    rows.sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      const af = has(a.flags, FLAG.finished);
      const bf = has(b.flags, FLAG.finished);
      if (af !== bf) return af ? -1 : 1;
      if (af && bf) return (a.finishT || 0) - (b.finishT || 0);
      return b.progress - a.progress;
    });
    const me = rows.find((r) => r.isSelf);
    const place = rows.findIndex((r) => r.isSelf) + 1;
    return {
      phase: this.phase,
      countdown: this.lastSnap?.cd ?? 0,
      time: this.clock.t,
      mode,
      modeName: this.match.modeName,
      chaos: this.match.chaos,
      trackName: this.match.trackName,
      trackLength: this.match.length,
      finishX: this.match.finishX,
      rows,
      place,
      total: rows.length,
      self: {
        index: this.selfIndex,
        ability: this.selfMeta.ability,
        cooldown: Math.max(0, this.abilityCooldown ?? 0),
        lives: me?.lives ?? 0,
        laps: me?.laps ?? 0,
        progress: me?.progress ?? 0,
        finished: this.selfFinished,
        eliminated: this.eliminated,
        speed: Math.abs(this.selfState.vx),
      },
      elimIn: this.lastSnap?.el ?? -1,
      ping: this.ctx.getPing?.() ?? 0,
      fps: Math.round(this.game.loop.actualFps),
    };
  }

  rank() {
    return this.hudState().rows;
  }

  cleanup() {
    this.destroyed = true;
    window.removeEventListener('blur', this.onBlur);
    this.scale.off('resize', this.onResize, this);
    for (const view of this.views?.values() || []) view.destroy();
    this.ghostView?.destroy();
    this.trackView?.destroy();
  }
}
