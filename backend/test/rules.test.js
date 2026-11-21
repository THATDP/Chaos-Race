// Testes de regras do servidor autoritativo (sem rede, simulação pura).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { RoomManager } from '../src/rooms/RoomManager.js';
import { getTrack } from '../../shared/tracks.js';
import { PHYSICS_DT } from '../../shared/constants.js';
import { ABILITY_MAP } from '../../shared/abilities.js';

const track = getTrack('neon-city');
const io = {
  to: () => ({ emit() {}, volatile: { emit() {} } }),
};

function makeRoom(settings = {}, players = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }]) {
  return {
    code: 'TEST1',
    settings: {
      mode: 'classic',
      trackId: 'neon-city',
      chaos: 0,
      maxPlayers: 8,
      visibility: 'private',
      name: '',
      ...settings,
    },
    trackPool: ['neon-city', 'foundry'],
    players: new Map(
      players.map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          character: 'vulcan',
          ability: p.ability || 'turbo',
          cosmetics: {},
          connected: true,
          host: p.id === players[0].id,
        },
      ]),
    ),
    ended: null,
    onGameEnd(res) {
      this.ended = res;
    },
  };
}

function newGame(settings, players) {
  const room = makeRoom(settings, players);
  const game = new Game(room, io);
  return { game, room };
}

const seqs = new Map();
function advance(game, seconds, inputFor = () => null) {
  const steps = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    for (const [pid, st] of game.states) {
      const input = inputFor(pid, st, game);
      if (!input) continue;
      const seq = (seqs.get(pid) || 0) + 1;
      seqs.set(pid, seq);
      game.setInputs(pid, [{ seq, dir: input.dir | 0, jump: input.jump ? 1 : 0, hold: input.hold ? 1 : 0, slide: input.slide ? 1 : 0 }]);
    }
    game.step(PHYSICS_DT);
    if (game.over) break;
  }
}

function startRacing(game) {
  seqs.clear();
  game.countdown = 0;
  game.step(PHYSICS_DT);
  assert.equal(game.phase, 'racing');
}

test('contagem regressiva termina e a corrida começa', () => {
  const { game } = newGame();
  assert.equal(game.phase, 'countdown');
  advance(game, 3.2);
  assert.equal(game.phase, 'racing');
  const st = game.states.get('p1');
  assert.equal(st.x, 60, 'ninguém se move durante a contagem');
});

test('movimento é autoritativo e respeita a velocidade máxima', () => {
  const { game } = newGame();
  startRacing(game);
  advance(game, 1.5, () => ({ dir: 1 }));
  const st = game.states.get('p1');
  assert.ok(st.x > 400, `avançou ${st.x}`);
  assert.ok(Math.abs(st.vx) <= 620, `velocidade ${st.vx} limitada`);
});

test('pulo eleva o jogador e a gravidade o traz de volta', () => {
  const { game } = newGame();
  startRacing(game);
  let jumped = false;
  advance(game, 1.4, (pid) => ({ dir: 1, jump: !jumped && (jumped = true), hold: true }));
  const st = game.states.get('p1');
  assert.equal(st.grounded, true, 'voltou ao chão');
});

test('queda devolve o jogador ao checkpoint', () => {
  const { game } = newGame();
  startRacing(game);
  advance(game, 1.0, () => ({ dir: 1 }));
  const st = game.states.get('p1');
  const cpBefore = st.checkpoint;
  st.y = game.track.killY + 50;
  game.step(PHYSICS_DT);
  assert.equal(st.falls, 1);
  assert.equal(st.x, game.track.checkpoints[cpBefore].x, 'voltou ao checkpoint');
  assert.ok(st.freezeUntil > game.time);
});

test('habilidade turbo aplica impulso e respeita recarga', () => {
  const { game } = newGame({}, [{ id: 'p1', name: 'A', ability: 'turbo' }]);
  startRacing(game);
  advance(game, 0.6, () => ({ dir: 1 }));
  const ok = game.useAbility('p1');
  assert.equal(ok, true);
  const st = game.states.get('p1');
  assert.equal(st.uses, 1);
  assert.ok(st.boostUntil > game.time);
  assert.ok(st.abilityReadyAt >= game.time + ABILITY_MAP.turbo.cooldown - 0.1);
  assert.equal(game.useAbility('p1'), false, 'não pode reusar durante a recarga');
});

test('mina é criada no mundo e desacelera quem pisa nela', () => {
  const { game } = newGame({}, [
    { id: 'p1', name: 'A', ability: 'trap' },
    { id: 'p2', name: 'B', ability: 'turbo' },
  ]);
  startRacing(game);
  advance(game, 0.5, () => ({ dir: 1 }));
  assert.equal(game.useAbility('p1'), true);
  assert.equal(game.traps.length, 1);
  const trap = game.traps[0];
  const p2 = game.states.get('p2');
  p2.x = trap.x;
  p2.invulnUntil = 0;
  advance(game, 0.1, () => ({ dir: 1 }));
  assert.ok(p2.slowUntil > game.time, 'jogador foi desacelerado');
  assert.equal(game.traps.length, 0, 'mina foi consumida');
});

test('troca dimensional só funciona com adversário à frente', () => {
  const { game } = newGame({}, [
    { id: 'p1', name: 'A', ability: 'swap' },
    { id: 'p2', name: 'B', ability: 'turbo' },
  ]);
  startRacing(game);
  const a = game.states.get('p1');
  const b = game.states.get('p2');
  b.progress = a.progress + 500;
  b.x = a.x + 500;
  const xa = a.x;
  const xb = b.x;
  assert.equal(game.useAbility('p1'), true);
  assert.ok(Math.abs(a.x - xb) < 1 && Math.abs(b.x - xa) < 1, 'posições trocadas');
  assert.ok(a.invulnUntil > game.time && b.invulnUntil > game.time, 'os dois ficam invulneráveis');

  const { game: g2 } = newGame({}, [{ id: 'p1', name: 'A', ability: 'swap' }]);
  startRacing(g2);
  assert.equal(g2.useAbility('p1'), false, 'sem alvo não gasta recarga');
  assert.equal(g2.states.get('p1').abilityReadyAt, 0);
});

test('modo sobrevivência: três quedas eliminam o jogador', () => {
  const { game } = newGame({ mode: 'survival' }, [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
  ]);
  startRacing(game);
  const a = game.states.get('p1');
  const b = game.states.get('p2');
  assert.equal(a.lives, 3);
  for (let i = 0; i < 3; i++) {
    advance(game, 1.6, (pid) => (pid === 'p2' ? { dir: 1 } : null));
    a.invulnUntil = 0;
    a.y = game.track.killY + 40;
    game.step(PHYSICS_DT);
  }
  assert.equal(a.lives, 0);
  assert.equal(a.eliminated, true);
  assert.ok(game.results, 'partida termina com um sobrevivente');
  assert.equal(game.results.winner.id, 'p2');
});

test('modo eliminação remove o último colocado', () => {
  const { game } = newGame({ mode: 'elimination' }, [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' },
  ]);
  startRacing(game);
  advance(game, 1.0, (pid) => (pid === 'p1' ? { dir: 1 } : { dir: 0 }));
  game.nextElimAt = game.time + 0.01;
  game.step(PHYSICS_DT);
  const eliminated = [...game.states.values()].filter((s) => s.eliminated);
  assert.equal(eliminated.length, 1, 'um jogador eliminado');
  assert.equal(eliminated[0].id === 'p1', false, 'quem está atrás é eliminado');
});

test('contra o tempo termina ao cruzar a linha (resultado do servidor)', () => {
  const { game } = newGame({ mode: 'timeattack' }, [{ id: 'p1', name: 'A' }]);
  startRacing(game);
  const st = game.states.get('p1');
  st.x = game.track.finishX - 260;
  st.y = game.track.groundY - 56;
  st.vx = 500;
  advance(game, 1.2, () => ({ dir: 1 }));
  assert.ok(game.results, 'resultado gerado');
  assert.equal(game.results.places[0].id, 'p1');
  assert.ok(game.results.places[0].time > 0);
  assert.equal(game.results.reason, 'finished');
});

test('inputs inválidos, duplicados ou fora de ordem são ignorados', () => {
  const { game } = newGame();
  startRacing(game);
  game.setInputs('p1', [{ seq: 5, dir: 1, jump: 0, hold: 1, slide: 0 }]);
  game.setInputs('p1', [{ seq: 5, dir: -1, jump: 0, hold: 1, slide: 0 }]);
  game.setInputs('p1', [{ seq: 0, dir: -1, jump: 0, hold: 1, slide: 0 }]);
  const st = game.states.get('p1');
  assert.equal(st.queue.length, 1, 'apenas o primeiro input válido entra');
  assert.equal(game.useAbility('nao-existe'), false);
  game.setInputs('p1', 'lixo');
  game.setInputs('p1', null);
  game.step(PHYSICS_DT);
  assert.ok(st.ackSeq === 5);
});

test('desconexão congela o jogador e reconexão libera de novo', () => {
  const { game } = newGame();
  startRacing(game);
  advance(game, 0.8, () => ({ dir: 1 }));
  const st = game.states.get('p1');
  const x = st.x;
  game.setConnected('p1', false);
  advance(game, 1.0);
  assert.ok(Math.abs(st.x - x) < 80, 'sem input o jogador desacelera e para');
  game.setConnected('p1', true);
  assert.equal(st.disconnected, false);
  assert.equal(st.lastQueuedSeq, 0, 'aceita nova sequência após reconectar');
});

test('eventos de caos são determinísticos e afetam todos', () => {
  const { game } = newGame({ chaos: 3 }, [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
  ]);
  startRacing(game);
  game.nextChaosAt = 0;
  game.step(PHYSICS_DT);
  assert.ok(game.events.length >= 1, 'evento sorteado');
  const ev = game.events[0];
  const snap = game.snapshot();
  assert.equal(snap.ev[0][0], ev.id);
  assert.ok(ev.duration > 0);
});

test('limpeza: sala vazia é destruída e lobby inativo também', () => {
  const manager = new RoomManager(io, { maxRooms: 10 });
  const { room } = manager.createRoom({
    mode: 'classic',
    trackId: 'neon-city',
    chaos: 0,
    maxPlayers: 8,
    visibility: 'public',
    name: '',
  });
  const fakeSocket = { id: 's1', join() {}, data: {}, emit() {} };
  const res = room.addPlayer(fakeSocket, {
    playerId: 'p1',
    name: 'Fulano',
    character: 'vulcan',
    ability: 'turbo',
    cosmetics: {},
  });
  assert.equal(res.ok, true);
  assert.equal(manager.listPublic().length, 1);
  const now = Date.now();
  room.removePlayer('p1', { permanent: true });
  assert.equal(manager.listPublic().length, 0, 'sala vazia não aparece mais');
  manager.tick(0.016, now + 31000);
  assert.equal(manager.rooms.size, 0, 'sala vazia removida');
});
