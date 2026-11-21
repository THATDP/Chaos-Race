// Simulação de física compartilhada. O servidor roda como autoridade e o
// cliente roda o MESMO código para predição local e reconciliação.
import {
  PHYS,
  PLAYER_W,
  PLAYER_H,
  SLIDE_H,
  clamp,
  approach,
} from './constants.js';

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createPlayer({ id, name, index, ability, track, lives = 0 }) {
  const sp = track.spawns[index % track.spawns.length];
  return {
    id,
    name,
    index,
    ability,
    x: sp.x,
    y: sp.y,
    vx: 0,
    vy: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    grounded: false,
    sliding: false,
    dir: 0,
    coyote: 0,
    jumpBuf: 0,
    holdJump: false,
    padCd: 0,
    supportId: null,
    supportOffX: 0,
    onIce: false,
    freezeUntil: 0,
    invulnUntil: 0,
    shieldUntil: 0,
    boostUntil: 0,
    slowUntil: 0,
    checkpoint: 0,
    lives,
    laps: 0,
    progress: 0,
    finished: false,
    finishT: null,
    eliminated: false,
    emote: 0,
    emoteAt: -99,
    lastHazardAt: -99,
    hits: 0,
    falls: 0,
    uses: 0,
    abilityReadyAt: 0,
    disqualified: false,
  };
}

function setSliding(p, want, solids) {
  if (want && !p.sliding) {
    p.sliding = true;
    p.y += PLAYER_H - SLIDE_H;
    p.h = SLIDE_H;
    if (p.grounded && p.vx > 90) p.vx += PHYS.slideBoost;
  } else if (!want && p.sliding) {
    // precisa de espaço para levantar
    const test = { x: p.x, y: p.y - (PLAYER_H - SLIDE_H), w: p.w, h: PLAYER_H };
    const blocked = solids.some((s) => overlaps(test, s));
    if (!blocked) {
      p.sliding = false;
      p.y -= PLAYER_H - SLIDE_H;
      p.h = PLAYER_H;
    }
  }
}

/**
 * Avança a física de um jogador por dt.
 * Retorna lista de eventos: {type:'land'|'jump'|'pad'|'hit'|'shield'|'fall'|'finish'|'checkpoint'}
 */
export function stepPlayer(p, input, dt, world, t, ctx) {
  const events = [];
  if (p.finished || p.eliminated) return events;

  const solids = ctx.solids;
  const mods = ctx.mods || { gravity: 1, friction: 1, windX: 0, speed: 1 };
  const frozen = t < p.freezeUntil;

  p.padCd = Math.max(0, p.padCd - dt);
  p.coyote = Math.max(0, p.coyote - dt);
  p.jumpBuf = Math.max(0, p.jumpBuf - dt);

  // --- plataformas móveis carregam o jogador ---
  if (p.supportId != null && p.grounded) {
    const sup = solids.find((s) => s.id === p.supportId);
    if (sup) {
      p.x = sup.x + p.supportOffX;
      p.y = sup.y - p.h;
    } else {
      p.supportId = null;
    }
  }

  const dir = frozen ? 0 : input.dir | 0;
  const wantSlide = !frozen && !!input.slide;
  const jumpPressed = !frozen && !!input.jump;
  p.holdJump = !frozen && !!input.hold;
  if (jumpPressed) p.jumpBuf = PHYS.jumpBuffer;

  setSliding(p, wantSlide, solids);

  const iceMul = p.onIce ? 0.28 : 1;
  const chaosIce = mods.friction < 0.5 ? 0.35 : 1;
  const speedMul = (mods.speed || 1) * (p.boostUntil > t ? 1.34 : 1) * (p.slowUntil > t ? 0.55 : 1);
  const maxFwd = (p.sliding ? PHYS.maxSlide : PHYS.maxRun) * speedMul;
  const maxBack = PHYS.maxBack * speedMul;
  const accel =
    (p.grounded ? PHYS.accelGround : PHYS.accelAir) *
    iceMul *
    chaosIce *
    (p.sliding ? 0.62 : 1);

  if (dir !== 0 && !frozen) {
    const target = dir > 0 ? maxFwd : -maxBack;
    const a = accel * dt;
    if (dir > 0) p.vx = Math.min(p.vx + a, Math.max(p.vx, target));
    else p.vx = Math.max(p.vx - a, Math.min(p.vx, target));
  } else {
    const fric = p.grounded
      ? PHYS.frictionGround * (p.onIce ? 0.12 : 1) * chaosIce * (p.sliding ? 0.12 : 1)
      : PHYS.airDrag;
    p.vx = approach(p.vx, 0, fric * dt);
  }

  // excesso de velocidade (pads/impulsos) decai suavemente até o máximo normal
  if (p.vx > maxFwd) p.vx = approach(p.vx, maxFwd, 480 * dt);
  // limite duro (proteção contra acumuladores maliciosos)
  const hardMax = Math.max(maxFwd, PHYS.maxSlide) * 1.6 + 200;
  p.vx = clamp(p.vx, -hardMax, hardMax);

  // vento do caos
  if (mods.windX) p.vx += mods.windX * dt * 1.6;

  // --- pulo ---
  if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0) && !frozen) {
    p.vy = -PHYS.jumpVel;
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuf = 0;
    p.supportId = null;
    if (p.sliding) {
      p.sliding = false;
      p.y -= PLAYER_H - SLIDE_H;
      p.h = PLAYER_H;
    }
    events.push({ type: 'jump' });
  }
  // pulo variável
  if (!p.holdJump && p.vy < -PHYS.jumpVel * PHYS.jumpCut) p.vy = -PHYS.jumpVel * PHYS.jumpCut;

  // gravidade
  let g = PHYS.gravity * (mods.gravity || 1);
  if (wantSlide && !p.grounded) g *= 1.65; // queda rápida
  p.vy += g * dt;
  if (p.vy > PHYS.maxFall) p.vy = PHYS.maxFall;

  // --- eixo X ---
  p.x += p.vx * dt;
  if (p.x < 0) {
    p.x = 0;
    p.vx = 0;
  }
  for (const s of solids) {
    if (s.x > p.x + p.w + 2 || s.x + s.w < p.x - 2) continue;
    if (!overlaps(p, s)) continue;
    // se a penetração pelo topo é rasa, quem resolve é o eixo Y (evita teleporte lateral)
    const penTop = p.y + p.h - s.y;
    if (p.vy >= 0 && penTop > 0 && penTop <= PHYS.stepUp) continue;
    if (p.vx > 0) {
      p.x = s.x - p.w;
      p.vx = 0;
    } else if (p.vx < 0) {
      p.x = s.x + s.w;
      p.vx = 0;
    }
  }

  // --- eixo Y ---
  const wasGrounded = p.grounded;
  const fallSpeed = p.vy;
  p.grounded = false;
  p.onIce = false;
  p.y += p.vy * dt;
  for (const s of solids) {
    if (s.x > p.x + p.w + 2 || s.x + s.w < p.x - 2) continue;
    if (!overlaps(p, s)) continue;
    if (p.vy >= 0) {
      p.y = s.y - p.h;
      p.vy = 0;
      p.grounded = true;
      p.coyote = PHYS.coyote;
      p.onIce = s.kind === 'ice';
      if (s.kx === 'moving') {
        p.supportId = s.id;
        p.supportOffX = p.x - s.x;
      } else {
        p.supportId = null;
      }
      if (!wasGrounded && fallSpeed > 420) events.push({ type: 'land', speed: fallSpeed });
      if (s.kind === 'boost') events.push({ type: 'boostTile' });
    } else {
      p.y = s.y + s.h;
      p.vy = 0;
    }
  }
  if (!p.grounded && wasGrounded) p.coyote = PHYS.coyote;

  // --- pads de impulso ---
  if (p.grounded && p.padCd <= 0) {
    for (const pad of ctx.pads) {
      if (overlaps(p, pad)) {
        p.vx = Math.max(p.vx, pad.power);
        p.padCd = PHYS.padCooldown;
        events.push({ type: 'pad' });
        break;
      }
    }
  }

  // --- checkpoints ---
  const cps = ctx.checkpoints;
  for (let i = p.checkpoint + 1; i < cps.length; i++) {
    if (p.x + p.w / 2 >= cps[i].x) {
      p.checkpoint = i;
      events.push({ type: 'checkpoint', index: i });
    } else break;
  }

  // --- zonas de tempestade ---
  if (ctx.zones) {
    for (const z of ctx.zones) {
      if (t < z.until && p.x + p.w > z.x && p.x < z.x + z.w) {
        p.vx = approach(p.vx, -120, 220 * dt);
        p.slowUntil = Math.max(p.slowUntil, t + 0.15);
      }
    }
  }

  // --- perigos ---
  if (t > p.invulnUntil && t > p.freezeUntil) {
    for (const h of ctx.hazards) {
      if (h.x > p.x + p.w || h.x + h.w < p.x) continue;
      if (overlaps(p, h)) {
        if (p.shieldUntil > t) {
          p.shieldUntil = 0;
          p.invulnUntil = t + 1.2;
          p.lastHazardAt = t;
          events.push({ type: 'shield' });
        } else {
          p.lastHazardAt = t;
          events.push({ type: 'hit', hazard: h.kind });
        }
        break;
      }
    }
  }

  // --- queda ---
  if (p.y > ctx.killY) events.push({ type: 'fall' });

  // --- chegada ---
  if (p.x + p.w / 2 >= ctx.finishX) events.push({ type: 'finish' });

  return events;
}

export function respawnAt(p, checkpoint, t, freeze = PHYS.respawnFreeze) {
  p.x = checkpoint.x;
  p.y = checkpoint.y - PLAYER_H + 2;
  p.vx = 0;
  p.vy = 0;
  p.sliding = false;
  p.h = PLAYER_H;
  p.grounded = false;
  p.supportId = null;
  p.freezeUntil = t + freeze;
  p.invulnUntil = t + freeze + 0.55;
}

export function raceSort(a, b) {
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (a.finished && b.finished) return a.finishT - b.finishT;
  return b.progress - a.progress;
}
