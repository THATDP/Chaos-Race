// Constantes compartilhadas entre cliente e servidor.
// Qualquer mudança aqui precisa valer para os dois lados (predição x autoridade).

export const TICK_RATE = 60;
export const INPUT_RATE = 30;
export const SNAPSHOT_RATE = 20;

export const PLAYER_W = 34;
export const PLAYER_H = 56;
export const SLIDE_H = 28;

export const PHYS = {
  gravity: 2300,
  maxRun: 530,
  maxSlide: 715,
  maxBack: 300,
  accelGround: 2500,
  accelAir: 1450,
  frictionGround: 2400,
  frictionIce: 190,
  airDrag: 90,
  jumpVel: 965,
  jumpCut: 0.42,
  slideBoost: 80,
  maxFall: 1450,
  coyote: 0.1,
  stepUp: 14,
  jumpBuffer: 0.13,
  respawnFreeze: 1.05,
  invulnAfterHit: 1.6,
  padCooldown: 0.45,
};

export const MATCH = {
  countdown: 4, // segundos de contagem regressiva
  maxPlayers: 8,
  minPlayers: 2,
  finishTimeout: 240, // segundos até forçar fim de partida
  reconnectGrace: 45, // segundos que o assento fica reservado
  eliminationInterval: 15,
};

export const PHYSICS_DT = 1 / TICK_RATE;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const approach = (v, target, delta) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
export const lerp = (a, b, t) => a + (b - a) * t;
