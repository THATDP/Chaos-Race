import {
  MATCH,
  PHYSICS_DT,
  PHYS,
  SNAPSHOT_RATE,
  INPUT_RATE,
} from '../../../shared/constants.js';
import { getTrack, TrackRuntime } from '../../../shared/tracks.js';
import {
  createPlayer,
  stepPlayer,
  respawnAt,
  overlaps,
} from '../../../shared/physics.js';
import { ABILITY_MAP, TRAP_LIFETIME, STORM_DURATION, STORM_LENGTH } from '../../../shared/abilities.js';
import {
  CHAOS_EVENTS,
  chaosModifiers,
  isChaosActive,
  meteorRects,
} from '../../../shared/chaos.js';
import { getMode, chaosInterval } from '../../../shared/modes.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('game');

export const FLAGS = {
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

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export class Game {
  constructor(room, io) {
    this.room = room;
    this.io = io;
    this.settings = room.settings;
    this.trackId =
      this.settings.trackId === 'random'
        ? room.trackPool[Math.floor(Math.random() * room.trackPool.length)]
        : this.settings.trackId;
    this.track = getTrack(this.trackId);
    this.runtime = new TrackRuntime(this.track);
    this.mode = getMode(this.settings.mode);
    this.chaosLevel = this.settings.chaos;
    this.phase = 'countdown';
    this.countdown = 3;
    this.time = 0;
    this.acc = 0;
    this.snapAcc = 0;
    this.events = [];
    this.traps = [];
    this.zones = [];
    this.trapSeq = 0;
    this.nextChaosAt = 7;
    this.nextElimAt = 22;
    this.elimWarned = false;
    this.elimSeq = 0;
    this.endAt = null;
    this.firstFinishAt = null;
    this.results = null;
    this.over = false;
    this.startedAt = Date.now();

    this.states = new Map();
    let i = 0;
    for (const [pid, pl] of room.players) {
      const st = createPlayer({
        id: pid,
        name: pl.name,
        index: i++,
        ability: pl.ability,
        track: this.track,
        lives: this.mode.lives,
      });
      st.character = pl.character;
      st.cosmetics = pl.cosmetics;
      st.disconnected = !pl.connected;
      st.elimOrder = 0;
      st.queue = [];
      st.lastQueuedSeq = 0;
      st.ackSeq = 0;
      this.states.set(pid, st);
    }
    this.order = [...this.states.keys()];
    this.started = false;
  }

  get playerCount() {
    return this.states.size;
  }

  emitFx(type, st, extra = {}) {
    this.io.to(this.room.code).emit('match:fx', {
      t: type,
      i: st ? st.index : -1,
      x: st ? r1(st.x) : 0,
      y: st ? r1(st.y) : 0,
      ...extra,
    });
  }

  start() {
    this.startPayload = {
      matchId: `${this.room.code}-${Date.now()}`,
      trackId: this.track.id,
      trackName: this.track.name,
      trackSubtitle: this.track.subtitle,
      theme: this.track.theme,
      length: this.track.length,
      mode: this.mode.id,
      modeName: this.mode.name,
      chaos: this.chaosLevel,
      countdown: this.countdown,
      finishX: this.track.finishX,
      players: this.order.map((pid) => {
        const st = this.states.get(pid);
        return {
          i: st.index,
          id: pid,
          name: st.name,
          character: st.character,
          ability: st.ability,
          cosmetics: st.cosmetics,
        };
      }),
    };
    this.io.to(this.room.code).emit('match:start', this.startPayload);
    this.started = true;
    log.info(`partida ${this.room.code} :: ${this.track.id} / ${this.mode.id} :: ${this.states.size}p`);
  }

  emote(pid, id) {
    const st = this.states.get(pid);
    if (!st || st.eliminated) return;
    st.emote = id;
    st.emoteAt = this.time;
    this.emitFx('emote', st, { e: id });
  }

  setInputs(pid, records) {
    const st = this.states.get(pid);
    if (!st || !Array.isArray(records)) return;
    for (const rec of records) {
      if (!rec || typeof rec !== 'object') continue;
      if (!Number.isInteger(rec.seq) || rec.seq <= st.lastQueuedSeq) continue;
      if (rec.seq - st.lastQueuedSeq > 120) {
        // salto absurdo de sequência: descarta backlog antigo
        st.queue.length = 0;
      }
      st.lastQueuedSeq = rec.seq;
      st.queue.push(rec);
    }
    if (st.queue.length > 8) st.queue.splice(0, st.queue.length - 8);
  }

  setConnected(pid, connected) {
    const st = this.states.get(pid);
    if (!st) return;
    st.disconnected = !connected;
    if (connected) {
      // o cliente pode reiniciar a sequência de inputs após reconectar
      st.lastQueuedSeq = 0;
      st.ackSeq = 0;
      st.queue.length = 0;
      this.emitFx('reconnect', st);
    }
  }

  removePlayer(pid) {
    const st = this.states.get(pid);
    if (!st) return;
    this.states.delete(pid);
    this.order = this.order.filter((id) => id !== pid);
    this.emitFx('left', st);
    if (!this.over) this.checkEnd('player-left');
  }

  useAbility(pid) {
    const st = this.states.get(pid);
    if (!st) return false;
    if (this.phase !== 'racing' || st.finished || st.eliminated || st.disconnected) return false;
    if (this.time < st.abilityReadyAt) return false;
    const def = ABILITY_MAP[st.ability];
    if (!def) return false;

    let applied = true;
    switch (st.ability) {
      case 'turbo':
        st.boostUntil = this.time + 1.0;
        st.vx = Math.max(st.vx, PHYS.maxRun * 1.5);
        break;
      case 'quantum':
        st.vy = -PHYS.jumpVel * 1.12;
        st.grounded = false;
        st.supportId = null;
        st.invulnUntil = this.time + 1.2;
        st.quantumUntil = this.time + 1.2;
        break;
      case 'shield':
        st.shieldUntil = this.time + 6;
        break;
      case 'trap': {
        this.traps.push({
          id: ++this.trapSeq,
          x: Math.max(10, st.x - 42),
          y: st.y + st.h - 20,
          owner: st.index,
          until: this.time + TRAP_LIFETIME,
        });
        if (this.traps.length > 24) this.traps.shift();
        break;
      }
      case 'swap': {
        let target = null;
        for (const other of this.states.values()) {
          if (other === st || other.finished || other.eliminated) continue;
          const lead = other.progress - st.progress;
          if (lead > 80 && lead < 2600 && (!target || lead < target.progress - st.progress)) target = other;
        }
        if (!target) {
          applied = false;
          this.io.to(this.room.code).emit('match:notice', {
            i: st.index,
            msg: 'Nenhum adversário à frente para trocar!',
          });
        } else {
          const sx = st.x, sy = st.y, svx = st.vx, svy = st.vy, scp = st.checkpoint;
          st.x = target.x; st.y = target.y; st.vx = target.vx; st.vy = target.vy;
          st.checkpoint = target.checkpoint; st.supportId = null;
          target.x = sx; target.y = sy; target.vx = svx; target.vy = svy;
          target.checkpoint = scp; target.supportId = null;
          st.invulnUntil = this.time + 1.4;
          target.invulnUntil = this.time + 1.4;
          this.emitFx('swap', target, { by: st.index });
        }
        break;
      }
      case 'storm':
        this.zones.push({
          x: st.x + 180,
          w: STORM_LENGTH,
          until: this.time + STORM_DURATION,
          owner: st.index,
        });
        break;
      default:
        applied = false;
    }
    if (!applied) return false;
    st.abilityReadyAt = this.time + def.cooldown;
    st.uses++;
    this.emitFx('ability', st, { a: st.ability });
    return true;
  }

  update(realDt, nowMs) {
    if (this.over) return;
    this.acc += Math.min(realDt, 0.1);
    let guard = 0;
    while (this.acc >= PHYSICS_DT && guard++ < 8) {
      this.step(PHYSICS_DT);
      this.acc -= PHYSICS_DT;
      if (this.over) break;
    }
    this.snapAcc += realDt;
    if (this.snapAcc >= 1 / SNAPSHOT_RATE) {
      this.snapAcc = 0;
      this.broadcastSnapshot(nowMs);
    }
  }

  step(dt) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.phase = 'racing';
        this.io.to(this.room.code).emit('match:go', { at: Date.now() });
        this.emitFx('go', null);
      }
      return;
    }
    if (this.phase !== 'racing') return;

    this.time += dt;
    this.updateChaos();
    this.traps = this.traps.filter((tr) => tr.until > this.time);
    this.zones = this.zones.filter((z) => z.until > this.time);

    const mods = chaosModifiers(this.events, this.time);
    const bridgeActive = isChaosActive(this.events, this.time, 'bridge');
    const solids = this.runtime.solids(r2(this.time), bridgeActive);
    const extraHazards = [];
    for (const ev of this.events) {
      if (ev.id === 'meteors') extraHazards.push(...meteorRects(ev, this.time, this.track));
    }
    const hazards = this.runtime.hazards(r2(this.time), extraHazards);

    for (const st of this.states.values()) {
      if (st.eliminated || st.finished) continue;
      let input = { seq: st.ackSeq, dir: 0, jump: false, hold: false, slide: false };
      if (!st.disconnected && st.queue.length) {
        input = st.queue.shift();
        st.ackSeq = input.seq;
      }

      const evs = stepPlayer(st, input, dt, this.runtime, this.time, {
        solids,
        hazards,
        pads: this.track.pads,
        checkpoints: this.track.checkpoints,
        killY: this.track.killY,
        finishX: this.track.finishX,
        mods,
        zones: this.zones,
        track: this.track,
      });

      for (const ev of evs) this.handleEvent(st, ev);

      // minas
      if (!st.eliminated && !st.finished) {
        for (let k = 0; k < this.traps.length; k++) {
          const tr = this.traps[k];
          if (tr.owner === st.index) continue;
          if (overlaps(st, { x: tr.x, y: tr.y, w: 34, h: 26 })) {
            st.slowUntil = this.time + 1.5;
            st.invulnUntil = Math.max(st.invulnUntil, this.time + 0.6);
            this.traps.splice(k, 1);
            this.emitFx('trap', st, { x: tr.x, y: tr.y });
            break;
          }
        }
      }

      if (this.mode.loops) {
        st.progress = st.laps * this.track.finishX + st.x;
      } else {
        st.progress = st.finished ? 1e9 - st.finishT : st.x;
      }
    }

    if (this.mode.id === 'elimination') this.checkElimination();
    this.checkEnd();
  }

  handleEvent(st, ev) {
    switch (ev.type) {
      case 'jump':
        this.emitFx('jump', st);
        break;
      case 'land':
        this.emitFx('land', st, { sp: Math.round(ev.speed) });
        break;
      case 'pad':
        this.emitFx('pad', st);
        break;
      case 'checkpoint':
        this.emitFx('checkpoint', st, { n: ev.index });
        break;
      case 'shield':
        this.emitFx('shield', st);
        break;
      case 'hit':
        this.hitPlayer(st, 'hazard');
        break;
      case 'fall':
        this.hitPlayer(st, 'fall');
        break;
      case 'finish':
        this.onFinish(st);
        break;
      default:
        break;
    }
  }

  hitPlayer(st, cause) {
    if (st.eliminated || st.finished) return;
    if (this.time < st.invulnUntil) return;
    if (cause === 'fall') st.falls++;
    else st.hits++;
    const cp = this.track.checkpoints[st.checkpoint] || this.track.checkpoints[0];
    this.emitFx(cause === 'fall' ? 'fall' : 'hit', st);

    if (this.mode.lives > 0) {
      st.lives -= 1;
      if (st.lives <= 0) {
        this.eliminate(st, cause);
        return;
      }
    }
    respawnAt(st, cp, this.time, PHYS.respawnFreeze);
    st.vx = 0;
  }

  eliminate(st, cause) {
    if (st.eliminated) return;
    st.eliminated = true;
    st.elimOrder = ++this.elimSeq;
    st.vx = 0;
    st.vy = 0;
    this.emitFx('eliminated', st, { cause });
    this.checkEnd('elimination');
  }

  onFinish(st) {
    if (this.mode.loops) {
      st.laps += 1;
      st.x = Math.max(20, st.x - this.track.finishX + 40);
      st.y = this.track.spawns[0].y;
      st.vx = Math.max(st.vx, 240);
      st.vy = 0;
      st.checkpoint = 0;
      st.invulnUntil = this.time + 1.0;
      st.progress = st.laps * this.track.finishX + st.x;
      this.emitFx('lap', st, { laps: st.laps });
      return;
    }
    if (st.finished) return;
    st.finished = true;
    st.finishT = this.time;
    st.progress = 1e9 - this.time;
    this.emitFx('finish', st, { time: r2(this.time) });
    if (this.firstFinishAt == null) {
      this.firstFinishAt = this.time;
      this.endAt = this.time + 9;
    }
    if (this.mode.id === 'timeattack') {
      this.end('finished');
      return;
    }
    const alive = [...this.states.values()].filter((s) => !s.eliminated);
    if (alive.every((s) => s.finished)) this.end('all-finished');
  }

  checkElimination() {
    if (this.time >= this.nextElimAt) {
      const alive = [...this.states.values()].filter((s) => !s.eliminated && !s.finished);
      if (alive.length <= 1) {
        this.checkEnd('elimination');
        return;
      }
      alive.sort((a, b) => b.progress - a.progress);
      const victim = alive[alive.length - 1];
      this.eliminate(victim, 'elimination');
      this.nextElimAt = this.time + MATCH.eliminationInterval;
      this.elimWarned = false;
    } else if (!this.elimWarned && this.time >= this.nextElimAt - 3.5) {
      this.elimWarned = true;
      this.emitFx('elimWarning', null, { in: 3.5 });
    }
  }

  updateChaos() {
    const level = this.chaosLevel;
    if (!level) return;
    this.events = this.events.filter((e) => e.start + e.duration > this.time);
    if (this.time < this.nextChaosAt) return;
    const maxConcurrent = level >= 3 ? 2 : 1;
    if (this.events.length >= maxConcurrent) return;
    const pool = CHAOS_EVENTS.filter((e) => !this.events.some((a) => a.id === e.id));
    if (!pool.length) return;
    const def = pool[Math.floor(Math.random() * pool.length)];
    const ev = {
      id: def.id,
      start: this.time,
      duration: def.duration * (level >= 3 ? 1.25 : 1),
      seed: Math.floor(Math.random() * 1e6),
    };
    this.events.push(ev);
    this.nextChaosAt = this.time + chaosInterval(level) * (0.75 + Math.random() * 0.5);
    this.io.to(this.room.code).emit('match:chaos', {
      id: def.id,
      name: def.name,
      icon: def.icon,
      color: def.color,
      desc: def.desc,
      start: r2(ev.start),
      duration: r2(ev.duration),
    });
  }

  checkEnd(reason) {
    if (this.over) return;
    const alive = [...this.states.values()].filter((s) => !s.eliminated);
    const mode = this.mode;
    if (mode.id === 'classic' || mode.id === 'timeattack') {
      if (this.time > mode.timeLimit && mode.timeLimit > 0) return this.end('timeout');
      if (this.endAt != null && this.time >= this.endAt) return this.end('finish-window');
      if (alive.length && alive.every((s) => s.finished)) return this.end('all-finished');
      const active = [...this.states.values()].filter((s) => !s.finished && !s.eliminated);
      if (active.length === 0 && this.states.size >= 1) return this.end('no-players');
      if (reason === 'player-left' && this.states.size < 2) return this.end('player-left');
    } else if (mode.id === 'elimination' || mode.id === 'survival') {
      if (this.time > mode.timeLimit) return this.end('timeout');
      if (alive.length <= 1 && this.time > 2) return this.end('last-standing');
    }
    if (this.states.size === 0) return this.end('empty');
  }

  ranking() {
    return [...this.states.values()].sort((a, b) => {
      if (a.eliminated && b.eliminated) return b.elimOrder - a.elimOrder;
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.finished && b.finished) return a.finishT - b.finishT;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
  }

  end(reason) {
    if (this.over) return;
    this.over = true;
    this.phase = 'results';
    const ranked = this.ranking();
    this.results = {
      reason,
      trackId: this.track.id,
      trackName: this.track.name,
      mode: this.mode.id,
      modeName: this.mode.name,
      duration: r2(this.time),
      winner: ranked[0]
        ? { id: ranked[0].id, name: ranked[0].name, index: ranked[0].index }
        : null,
      places: ranked.map((st, i) => ({
        place: i + 1,
        id: st.id,
        index: st.index,
        name: st.name,
        character: st.character,
        time: st.finished ? r2(st.finishT) : null,
        progress: Math.round(st.progress),
        laps: st.laps,
        lives: st.lives,
        hits: st.hits,
        falls: st.falls,
        uses: st.uses,
        finished: st.finished,
        eliminated: st.eliminated,
        disconnected: st.disconnected,
      })),
    };
    this.io.to(this.room.code).emit('match:end', this.results);
    log.info(`fim ${this.room.code} :: ${reason} :: vencedor ${this.results.winner?.name || '-'}`);
    this.room.onGameEnd(this.results);
  }

  snapshot() {
    const players = this.order
      .map((pid) => this.states.get(pid))
      .filter(Boolean)
      .map((st) => {
        let flags = 0;
        if (st.grounded) flags |= FLAGS.grounded;
        if (st.sliding) flags |= FLAGS.sliding;
        if (st.shieldUntil > this.time) flags |= FLAGS.shield;
        if (st.boostUntil > this.time) flags |= FLAGS.boost;
        if (st.slowUntil > this.time) flags |= FLAGS.slow;
        if (st.finished) flags |= FLAGS.finished;
        if (st.eliminated) flags |= FLAGS.eliminated;
        if (this.time < st.freezeUntil) flags |= FLAGS.frozen;
        if (st.disconnected) flags |= FLAGS.disconnected;
        if (this.time < st.invulnUntil && !(this.time < st.freezeUntil)) flags |= FLAGS.invuln;
        if (st.quantumUntil > this.time) flags |= FLAGS.quantum;
        return [
          st.index,
          r1(st.x),
          r1(st.y),
          Math.round(st.vx),
          Math.round(st.vy),
          flags,
          st.ackSeq,
          st.checkpoint,
          st.laps,
          st.lives,
          Math.round(st.progress),
          Math.max(0, r1(st.abilityReadyAt - this.time)),
          st.finished ? r2(st.finishT) : -1,
        ];
      });
    return {
      t: r2(this.time),
      ph: this.phase === 'countdown' ? 'c' : 'r',
      cd: r1(this.countdown),
      p: players,
      ev: this.events.map((e) => [e.id, r2(e.start), r2(e.duration), e.seed]),
      tr: this.traps.map((t) => [t.id, r1(t.x), r1(t.y), t.owner, r2(t.until)]),
      zn: this.zones.map((z) => [r1(z.x), r1(z.w), r2(z.until), z.owner]),
      el: this.mode.id === 'elimination' ? r1(Math.max(0, this.nextElimAt - this.time)) : -1,
    };
  }

  broadcastSnapshot(nowMs) {
    this.io.to(this.room.code).volatile.emit('match:snapshot', {
      ...this.snapshot(),
      srv: Math.round(nowMs),
      est: Math.round(nowMs),
    });
  }

  stop() {
    this.over = true;
    this.io.to(this.room.code).emit('match:aborted', { reason: 'room-closed' });
  }
}
