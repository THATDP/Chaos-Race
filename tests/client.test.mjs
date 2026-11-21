// Integração do CLIENTE real (NetClient + relógio + interpolação + predição)
// contra um servidor de verdade. Não usa navegador: valida a camada de rede e
// a coerência entre a predição local (shared/physics) e o estado autoritativo.
import { spawn } from 'node:child_process';
import { NetClient } from '../frontend/src/net/client.js';
import { ServerClock, SnapshotBuffer } from '../frontend/src/net/interp.js';
import { getTrack, TrackRuntime } from '../shared/tracks.js';
import { createPlayer, stepPlayer } from '../shared/physics.js';
import { PHYSICS_DT } from '../shared/constants.js';

const PORT = 3800 + Math.floor(Math.random() * 120);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`);
  if (!ok) fails++;
};

const server = spawn(process.execPath, ['backend/src/server.js'], {
  env: { ...process.env, PORT: String(PORT), CORS_ORIGINS: '*', LOG_LEVEL: 'warn', NODE_ENV: 'test' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => {
  const s = String(d);
  if (!/Deprecation|ExperimentalWarning/.test(s)) process.stderr.write(`[server] ${s}`);
});

async function waitHealth(ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {}
    await sleep(120);
  }
  return false;
}

async function connectClient(name, playerId) {
  const net = new NetClient(BASE);
  net.connect();
  net.bindServerEvents(['room:state', 'room:error', 'match:start', 'match:snapshot', 'match:fx', 'match:end', 'match:resync']);
  net.on('match:snapshot', (s) => (net.lastSnap = s));
  net.on('match:start', (m) => (net.match = m));
  net.on('room:state', (st) => (net.room = st));
  net.on('match:end', (r) => (net.result = r));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sem conexão')), 8000);
    const off = net.on('connect', () => {
      clearTimeout(t);
      off();
      resolve();
    });
  });
  const hello = await net.emitAck('hello', { name, playerId, profile: { character: 'vulcan', cosmetics: {}, ability: 'turbo' } });
  return { net, hello, playerId };
}

async function waitUntil(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(40);
  }
  throw new Error(`timeout: ${label}`);
}

let a = null;
let b = null;
try {
  check('servidor respondeu /health', await waitHealth());

  a = await connectClient('ClienteA', 'p_client_a');
  b = await connectClient('ClienteB', 'p_client_b');
  check('NetClient conecta e faz hello', a.hello.ok && b.hello.ok && a.net.connected, `versão ${a.hello.version}`);

  const created = await a.net.emitAck('room:create', {
    settings: { mode: 'classic', trackId: 'neon-city', chaos: 0, visibility: 'private', maxPlayers: 8, name: '' },
  });
  check('cliente cria sala e recebe código', !!created.code && created.code.length === 5, created.code);

  const joined = await b.net.emitAck('room:join', { code: created.code });
  check('segundo cliente entra pelo código', joined.ok === true);

  await waitUntil(() => a.net.room?.players.length === 2, 5000, 'lobby com 2 jogadores');
  check('room:state chega aos dois clientes', a.net.room.players.length === 2 && b.net.room?.players.length === 2);

  await a.net.emitAck('room:ready', { ready: true });
  await b.net.emitAck('room:ready', { ready: true });

  await waitUntil(() => a.net.match && b.net.match, 12000, 'match:start');
  check('match:start idêntico nos dois clientes', a.net.match.matchId === b.net.match.matchId && a.net.match.trackId === 'neon-city');

  const track = getTrack(a.net.match.trackId);
  const runtime = new TrackRuntime(track);
  const me = a.net.match.players.find((p) => p.id === 'p_client_a');
  const st = createPlayer({ id: 'p_client_a', name: 'ClienteA', index: me.i, ability: 'turbo', track, lives: 0 });

  const clock = new ServerClock();
  const buffer = new SnapshotBuffer(0.1, 40);
  const api = {
    clock,
    t: 0,
  };

  await waitUntil(() => a.net.lastSnap, 8000, 'primeiro snapshot');
  while (a.net.lastSnap?.ph === 'c') await sleep(50);
  check('contagem termina (fase de corrida)', a.net.lastSnap.ph === 'r', `cd=${a.net.lastSnap.cd}`);

  const world = () => ({
    solids: runtime.solids(api.t, false),
    hazards: runtime.hazards(api.t, []),
    pads: track.pads,
    checkpoints: track.checkpoints,
    killY: track.killY,
    finishX: track.finishX,
    mods: { gravity: 1, friction: 1, windX: 0, speed: 1 },
    zones: [],
    track,
  });

  const start = a.net.lastSnap;
  clock.update(start.t);
  st.x = start.p[me.i][1];
  st.y = start.p[me.i][2];
  let seq = 0;
  let maxDrift = 0;
  let xs = [];
  const t0 = Date.now();

  let tick = 0;
  let pending = [];
  let lastSnapT = 0;
  let reconciled = 0;
  let maxAfter = 0;
  while (Date.now() - t0 < 1600) {
    const dt = PHYSICS_DT;
    api.t += dt;
    clock.advance(dt);
    const sendNow = tick++ % 2 === 0;
    const record = { seq: sendNow ? ++seq : seq, dir: 1, jump: 0, hold: 1, slide: 0 };
    if (sendNow) {
      pending.push(record);
      a.net.emit('match:input', [[record.seq, 1, 0, 1, 0]]);
    }
    stepPlayer(st, record, dt, runtime, clock.t, world());

    const snap = a.net.lastSnap;
    if (snap?.p && snap.t !== lastSnapT) {
      lastSnapT = snap.t;
      buffer.push(snap, performance.now());
      const sample = buffer.sample(clock.t);
      if (sample) xs.push(sample.get(me.i)?.x ?? null);
      const row = snap.p.find((p) => p[0] === me.i);
      if (row) {
        // mesma reconciliação do cliente real: volta ao estado autoritativo e
        // reaplica só os inputs ainda não confirmados (ack = row[6]).
        maxDrift = Math.max(maxDrift, Math.abs(st.x - row[1]));
        st.x = row[1];
        st.y = row[2];
        st.vx = row[3];
        st.vy = row[4];
        st.grounded = (row[5] & 1) === 1;
        st.checkpoint = row[7];
        pending = pending.filter((r) => r.seq > row[6]);
        for (const r of pending) stepPlayer(st, r, dt, runtime, clock.t, world());
        reconciled++;
        maxAfter = Math.max(maxAfter, Math.abs(st.x - row[1]));
      }
    }
    await sleep(dt * 1000);
  }

  const finalSnap = a.net.lastSnap;
  const row = finalSnap.p.find((p) => p[0] === me.i);
  check(
    'predição local acompanha o servidor',
    maxDrift < 90,
    `erro máx antes de reconciliar ${maxDrift.toFixed(1)} px (atraso de input)`,
  );
  check(
    'reconciliação elimina o erro de predição',
    reconciled > 8 && maxAfter < 12,
    `${reconciled} reconciliações, erro pós-reconciliação ${maxAfter.toFixed(1)} px`,
  );
  check('servidor recebeu os inputs (ack)', row[6] >= seq - 4, `ack=${row[6]} de seq=${seq}`);
  check('relógio do servidor estável', Math.abs(clock.t - finalSnap.t) < 1.2, `cliente ${clock.t.toFixed(2)}s / servidor ${finalSnap.t.toFixed(2)}s`);

  const valid = xs.filter((v) => typeof v === 'number');
  const monotonic = valid.every((v, i) => i === 0 || v >= valid[i - 1] - 1);
  check('interpolação remota suave', valid.length > 5 && monotonic, `${valid.length} amostras`);

  // queda de um cliente não derruba a partida do outro
  const before = b.net.lastSnap?.p?.length;
  a.net.disconnect();
  await sleep(1200);
  check('partida continua após uma desconexão', !!b.net.lastSnap && b.net.lastSnap.p.length >= 1, `snapshot com ${b.net.lastSnap?.p?.length} jogadores (antes ${before})`);

  const health = await (await fetch(`${BASE}/health`)).json();
  check('servidor saudável no fim', health.status === 'ok' && health.rooms >= 1, `${health.rooms} sala(s)`);
} catch (err) {
  console.log(`ERRO FATAL: ${err.message}`);
  fails++;
} finally {
  try {
    a?.net.disconnect();
  } catch {}
  try {
    b?.net.disconnect();
  } catch {}
  server.kill('SIGTERM');
  await sleep(300);
  server.kill('SIGKILL');
  console.log(`\n${fails === 0 ? '🎉' : '⚠️'} cliente: ${fails} falha(s)\n`);
  process.exit(fails === 0 ? 0 : 1);
}
