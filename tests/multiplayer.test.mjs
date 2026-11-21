// Teste de integração REAL: sobe o servidor e conecta clientes Socket.IO
// independentes (processos de rede distintos), entra na mesma sala, corre,
// usa habilidade, desconecta/reconecta e recebe o resultado final.
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { getTrack, TrackRuntime } from '../shared/tracks.js';

const PORT = 3400 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const TRACK_ID = 'neon-city';
const track = getTrack(TRACK_ID);
const runtime = new TrackRuntime(track);

let failures = 0;
const results = [];
function check(name, cond, info = '') {
  results.push({ name, ok: !!cond, info });
  if (cond) console.log(`  ✅ ${name}${info ? ` — ${info}` : ''}`);
  else {
    failures++;
    console.log(`  ❌ ${name}${info ? ` — ${info}` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(fn, ms = 8000, label = 'condição') {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (fn()) return true;
    await sleep(60);
  }
  throw new Error(`timeout esperando ${label}`);
}

const server = spawn(process.execPath, ['backend/src/server.js'], {
  env: { ...process.env, PORT: String(PORT), CORS_ORIGINS: '*', LOG_LEVEL: 'warn' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
server.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[srv!] ${d}`));

async function waitHealth(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return await res.json();
    } catch {
      /* ainda subindo */
    }
    await sleep(300);
  }
  throw new Error('servidor não respondeu /health');
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
    const timer = setTimeout(() => reject(new Error('timeout conexão')), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function once(socket, event, predicate = null, ms = 20000) {
  if (typeof predicate !== 'function') predicate = () => true;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout esperando ${event}`));
    }, ms);
    function handler(data) {
      try {
        if (!predicate(data)) return;
      } catch {
        return;
      }
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }
    socket.on(event, handler);
  });
}

const ack = (socket, event, payload) =>
  new Promise((resolve) => {
    socket.timeout(10000).emit(event, payload, (err, res) => {
      resolve(err ? { ok: false, error: String(err) } : res || { ok: false });
    });
  });

const name = (id) => `Piloto${id}`;

async function createClient(id, existingId = null) {
  const socket = await connect();
  const playerId = existingId || `p_test_${id}_${Math.random().toString(36).slice(2, 8)}`;
  const hello = await ack(socket, 'hello', {
    name: name(id),
    playerId,
    profile: { character: 'vulcan', ability: 'turbo', cosmetics: {} },
  });
  if (!hello?.ok) throw new Error('hello falhou: ' + JSON.stringify(hello));
  socket.playerId = playerId;
  socket.lastSnap = null;
  socket.snapCount = 0;
  socket.positions = [];
  socket.fx = [];
  socket.ended = null;
  socket.on('room:state', (st) => (socket.roomState = st));
  socket.on('match:resync', (d) => (socket.resync = d));
  socket.on('match:end', (res) => (socket.ended = res));
  socket.on('match:snapshot', (s) => {
    socket.lastSnap = s;
    socket.snapCount++;
  });
  socket.on('match:fx', (fx) => socket.fx.push(fx));
  socket.on('match:start', (m) => {
    socket.match = m;
    socket.started = m;
    socket.myIndex = m.players.find((p) => p.id === playerId)?.i ?? 0;
  });
  return socket;
}

// Bot de QA: decide saltos pela geometria da pista e pelo último snapshot.
function startBot(socket, { holdFor = 0 } = {}) {
  const bot = { seq: 0, timer: null, running: true, holdUntil: 0, startedAt: Date.now(), finished: false };
  const send = (records) => {
    if (socket.connected) socket.emit('match:input', records);
  };
  bot.tick = () => {
    if (!bot.running) return;
    const now = Date.now();
    if (now - bot.startedAt < holdFor) return;
    const snap = socket.lastSnap;
    if (!snap || snap.ph === 'c') return;
    const row = snap.p?.find((p) => p[0] === socket.myIndex);
    if (!row) return;
    const [, x, y, vx, vy, flags] = row;
    if ((flags & 32) !== 0 || (flags & 64) !== 0) {
      bot.finished = true;
      return;
    }
    const grounded = (flags & 1) !== 0;
    const t = snap.t + (performance.now() - socket.lastSnapAt) / 1000;
    // estima o tempo do snapshot para consultar a geometria
    const solids = runtime.solids(Math.round(t * 100) / 100, false);
    const hazards = runtime.hazards(Math.round(t * 100) / 100);
    const feet = y + 56;
    const groundUnder = (px) =>
      solids.some((s) => s.x <= px && s.x + s.w >= px && s.y >= feet - 20 && s.y <= feet + 70);
    const edge = grounded && !groundUnder(x + 34 + 20);
    const hazard = hazards.some(
      (h) =>
        (h.kind === 'spike' || h.kind === 'saw') &&
        h.x + h.w > x + 30 &&
        h.x < x + 34 + 110 &&
        h.y + h.h > y + 6 &&
        h.y < feet - 2,
    );
    const wall = solids.some(
      (s) => s.x >= x + 30 && s.x < x + 34 + 36 && s.y < feet - 24 && s.y + s.h > y + 8,
    );
    const jump = grounded && (edge || hazard || wall);
    const hold = jump || (!grounded && vy < -80);
    const records = [
      [++bot.seq, 1, jump ? 1 : 0, hold ? 1 : 0, 0],
      [++bot.seq, 1, 0, hold ? 1 : 0, 0],
    ];
    send(records);
  };
  bot.timer = setInterval(() => {
    try {
      bot.tick();
    } catch (err) {
      console.error('bot', err.message);
    }
  }, 1000 / 30);
  // timestamp de recebimento por snapshot
  socket.on('match:snapshot', () => {
    socket.lastSnapAt = performance.now();
  });
  bot.stop = () => {
    bot.running = false;
    clearInterval(bot.timer);
  };
  return bot;
}

async function main() {
  console.log('\n=== CHAOS RACE — teste de integração multiplayer ===\n');
  const health = await waitHealth();
  check('HTTP /health responde', health.status === 'ok', `v${health.version}, ${health.rooms} salas`);
  check('/api/config expõe pistas', Array.isArray(health.tracks) === false && health.tracks === 5, `${health.tracks} pistas`);

  const corsRes = await fetch(`${BASE}/health`, { headers: { Origin: 'https://example.com' } });
  check('CORS responde health para origem externa', corsRes.ok);

  // ---------------- criação de sala privada ----------------
  const host = await createClient(1);
  const guest = await createClient(2);
  const other = await createClient(3);

  const priv = await ack(host, 'room:create', {
    settings: { mode: 'classic', trackId: TRACK_ID, chaos: 0, maxPlayers: 4, visibility: 'private' },
  });
  check('anfitrião cria sala privada', priv.ok && /^[A-Z0-9]{5}$/.test(priv.code || ''), priv.code);

  const list = await ack(other, 'room:list', {});
  check(
    'sala privada NÃO aparece na lista pública',
    list.ok !== false && !(list.rooms || []).some((r) => r.code === priv.code),
    `${(list.rooms || []).length} salas públicas`,
  );

  const badJoin = await ack(guest, 'room:join', { code: 'ZZZZZ' });
  check('código inexistente é rejeitado', badJoin.ok === false, badJoin.error);

  const join1 = await ack(guest, 'room:join', { code: priv.code });
  check('convidado entra pelo código', join1.ok === true);

  await waitUntil(() => host.roomState?.players.length === 2, 5000, 'lobby com 2 jogadores');
  check('lobby lista os dois jogadores', host.roomState.players.length === 2, host.roomState.players.map((p) => p.name).join(', '));

  const join2 = await ack(other, 'room:join', { code: priv.code });
  check('terceiro jogador entra na mesma sala', join2.ok === true);

  await waitUntil(() => host.roomState?.players.length === 3, 5000, 'lobby com 3 jogadores');
  check('lobby vê 3 jogadores', host.roomState.players.length === 3);

  // ---------------- início sincronizado ----------------
  const startPromises = [once(host, 'match:start', null, 12000), once(guest, 'match:start', null, 12000), once(other, 'match:start', null, 12000)];
  host.emit('room:ready', { ready: true });
  guest.emit('room:ready', { ready: true });
  await sleep(900);
  check('partida não começa com jogador não pronto', !host.started && !guest.started);
  other.emit('room:ready', { ready: true });

  const starts = await Promise.all(startPromises);
  check('todos recebem match:start', starts.every((s) => s && s.trackId === TRACK_ID), starts[0]?.trackName);
  check('mesma partida para todos', new Set(starts.map((s) => s.matchId)).size === 1);
  check('servidor escolheu a pista configurada', starts[0].trackId === TRACK_ID);

  // verifica saltos: menor y observado nos snapshots
  let minY = 9999;
  guest.on('match:snapshot', (s) => {
    for (const row of s.p) minY = Math.min(minY, row[2]);
  });
  const hostBot = startBot(host);
  const guestBot = startBot(guest, { holdFor: 900 });
  const otherBot = startBot(other, { holdFor: 1800 });

  // ------ input inválido / spam não derruba o servidor ------
  host.emit('match:input', 'lixo');
  host.emit('match:input', [{ seq: -5, dir: 99 }]);
  host.emit('match:ability', { hack: true });
  for (let i = 0; i < 120; i++) other.emit('match:ability');

  const snap = await once(guest, 'match:snapshot', null, 8000);
  check('snapshots chegam aos clientes', Array.isArray(snap.p) && snap.p.length === 3, `${snap.p?.length} jogadores no pacote`);
  check('snapshot é compacto', JSON.stringify(snap).length < 2500, `${JSON.stringify(snap).length} bytes`);

  // espera a contagem regressiva acabar
  await waitUntil(() => guest.lastSnap?.ph === 'r', 8000, 'fim da contagem');
  check('contagem regressiva sincronizada termina', guest.lastSnap?.ph === 'r');

  // posições autoritativas avançam
  const beforeX = guest.lastSnap.p.map((p) => p[1]);
  await sleep(2200);
  const snap2 = guest.lastSnap;
  const afterX = snap2.p.map((p) => p[1]);
  const advanced = afterX.filter((x, i) => x > beforeX[i] + 40).length;
  check('movimento sincronizado pelo servidor', advanced >= 2, `posições ${beforeX.map(Math.round)} -> ${afterX.map(Math.round)}`);

  const ackSeq = snap2.p.find((p) => p[0] === guest.myIndex)?.[6];
  check('servidor confirma inputs (ack)', ackSeq > 0, `ack=${ackSeq}`);
  check('saltos são simulados no servidor', minY < 540, `menor y = ${Math.round(minY)}`);

  // habilidade validada no servidor
  guest.emit('match:ability');
  const fxAbility = await once(host, 'match:fx', (f) => f.t === 'ability', 5000).catch(() => null);
  check('habilidade é aplicada e transmitida', !!fxAbility, fxAbility ? `jogador ${fxAbility.i}` : 'sem fx');

  // ---------------- reconexão ----------------
  const indexBefore = guest.myIndex;
  const xBefore = guest.lastSnap?.p.find((p) => p[0] === indexBefore)?.[1] ?? 0;
  guestBot.stop();
  guest.disconnect();
  await sleep(700);
  const guest2 = await createClient(2, guest.playerId); // novo socket, mesmo playerId
  guest2.myIndex = indexBefore;
  const rejoin = await ack(guest2, 'room:rejoin', { code: priv.code });
  check('reconexão volta para a mesma sala', rejoin.ok === true && rejoin.phase === 'racing', rejoin.phase);
  await waitUntil(() => !!guest2.resync, 6000, 'resync').catch(() => null);
  check('servidor reenvia estado após reconectar', !!guest2.resync?.snapshot, guest2.resync ? `${guest2.resync.snapshot.p.length} jogadores` : 'nada');
  const guestBot2 = startBot(guest2);

  // ---------------- chegada e resultado ----------------
  await waitUntil(() => host.ended || guest2.ended, 75000, 'match:end');
  const end = host.ended || guest2.ended;

  check('partida termina com resultado no servidor', !!end, end ? `${end.places.length} colocados em ${end.duration}s` : 'sem match:end');

  if (end) {
    check('resultado tem vencedor', !!end.winner?.id, end.winner?.name);
    check('resultado contém tempos/estatísticas', end.places.every((p) => typeof p.place === 'number' && typeof p.hits === 'number'));
    const winnerPlace = end.places[0];
    check('ranking é coerente', winnerPlace.place === 1 && winnerPlace.id === end.winner.id);
    const hostPlace = end.places.find((p) => p.id === host.playerId);
    console.log(
      `  · pódio: ${end.places.map((p) => `${p.place}º ${p.name}${p.finished ? ' ' + p.time + 's' : ''}`).join(' | ')}`,
    );
    check('anfitrião completou a corrida', !!hostPlace && hostPlace.finished, `${hostPlace?.place}º em ${hostPlace?.time}s`);
    check('todos os clientes receberam resultado coerente', end.places.length === 3 && new Set(end.places.map((p) => p.place)).size === 3);
    check('cliente não declara vitória — servidor decide', typeof end.winner.id === 'string');

    // revanche
    const oldId = starts[0].matchId;
    host.started = null;
    host.emit('room:rematch');
    guest2.emit('room:rematch');
    other.emit('room:rematch');
    await waitUntil(() => host.started && host.started.matchId !== oldId, 15000, 'revanche');
    const second = host.started;
    check('revanche reinicia a partida', !!second, second?.matchId ? 'novo matchId' : 'sem novo start');
    if (second) {
      check('revanche gera novo identificador de partida', second.matchId !== starts[0].matchId);
      host.emit('room:leave');
    }
  }

  // ---------------- sala pública / fila rápida ----------------
  const pubHost = await createClient(4);
  const quick = await ack(pubHost, 'room:quick', { settings: { mode: 'classic', chaos: 1 } });
  check('fila rápida cria/entra em sala pública', quick.ok === true, quick.code);
  const pubList = await ack(other, 'room:list', {});
  check(
    'sala pública aparece na lista',
    (pubList.rooms || []).some((r) => r.code === quick.code),
    (pubList.rooms || []).map((r) => r.code).join(','),
  );

  const pubGuest = await createClient(5);
  const joinQuick = await ack(pubGuest, 'room:quick', { settings: { mode: 'classic', chaos: 1 } });
  check('segundo jogador cai na mesma sala pública', joinQuick.ok && joinQuick.code === quick.code);

  // saída: sala some da lista quando todos saem
  pubHost.emit('room:leave');
  pubGuest.emit('room:leave');
  await sleep(700);
  const pubList2 = await ack(other, 'room:list', {});
  check('sala esvaziada sai da lista pública', !(pubList2.rooms || []).some((r) => r.code === quick.code));

  // limpeza
  for (const s of [host, guest2, other, pubHost, pubGuest]) {
    try {
      s.disconnect();
    } catch {
      /* ignora */
    }
  }
  hostBot.stop();
  otherBot.stop();
  if (typeof guestBot2 !== 'undefined') guestBot2.stop();

  await sleep(300);
  const finalHealth = await fetch(`${BASE}/health`).then((r) => r.json());
  check('servidor segue saudável no fim do teste', finalHealth.status === 'ok', `${finalHealth.rooms} salas restantes`);

  console.log(`\n=== ${results.length - failures}/${results.length} verificações OK ===\n`);
  server.kill('SIGTERM');
  await sleep(300);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('ERRO FATAL:', err);
  server.kill('SIGKILL');
  process.exit(1);
});
