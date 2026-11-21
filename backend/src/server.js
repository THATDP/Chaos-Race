import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager, validateRoomSettings } from './rooms/RoomManager.js';
import {
  RateLimiter,
  cleanId,
  sanitizeInputBatch,
  sanitizeName,
  sanitizeProfile,
  sanitizeRoomCode,
  sanitizeSettings,
} from './util/validate.js';
import { getMode } from '../../shared/modes.js';
import { getTrack, TRACKS } from '../../shared/tracks.js';
import { EMOTES } from '../../shared/cosmetics.js';
import { createLogger } from './util/logger.js';

// Carregador de .env sem dependências (variáveis já definidas têm prioridade).
for (const file of ['.env', 'backend/.env']) {
  try {
    const text = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      if (process.env[m[1]] !== undefined) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch {
    /* arquivo opcional */
  }
}

const log = createLogger('server');
const PORT = Number(process.env.PORT) || 3001;
const VERSION = '1.0.0';
const TICK_MS = 1000 / 60;

const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173';
const ORIGINS = rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);
const ALLOW_ALL = ORIGINS.includes('*');

function originAllowed(origin) {
  if (!origin) return true; // clientes nativos / health checks
  if (ALLOW_ALL) return true;
  return ORIGINS.some((allowed) => {
    if (allowed === origin) return true;
    try {
      // permite subdomínios exatos informados, sem curinga perigoso
      return new URL(origin).host === new URL(allowed).host && allowed.startsWith('http');
    } catch {
      return false;
    }
  });
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(
  cors({
    origin(origin, cb) {
      if (originAllowed(origin)) cb(null, true);
      else cb(new Error('Origem não permitida'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      if (originAllowed(origin)) cb(null, true);
      else cb(new Error('Origem não permitida'));
    },
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 20000,
  pingInterval: 20000,
  pingTimeout: 15000,
  connectTimeout: 12000,
  transports: ['websocket', 'polling'],
});

const manager = new RoomManager(io, { maxRooms: Number(process.env.MAX_ROOMS) || 300 });
let tickTimer = null;
let lastTick = Date.now();

function startLoop() {
  lastTick = Date.now();
  tickTimer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    try {
      manager.tick(dt, now);
    } catch (err) {
      log.error('erro no loop de simulação:', err?.message || err);
    }
  }, TICK_MS);
  tickTimer.unref?.();
}

// --- HTTP -----------------------------------------------------------------
const health = (req, res) => {
  const stats = manager.stats();
  res.json({
    status: 'ok',
    service: 'chaos-race-server',
    version: VERSION,
    uptime: Math.round(process.uptime()),
    rooms: stats.rooms,
    players: stats.players,
    racing: stats.racing,
    tracks: TRACKS.length,
    time: new Date().toISOString(),
  });
};

app.get('/', (req, res) => {
  res.json({
    service: 'Chaos Race — servidor multiplayer',
    version: VERSION,
    status: 'online',
    endpoints: ['/health', '/api/rooms', '/api/config'],
    transports: ['websocket', 'polling'],
  });
});
app.get('/health', health);
app.get('/api/health', health);
app.get('/api/config', (req, res) => {
  res.json({
    version: VERSION,
    tickRate: 60,
    snapshotRate: 20,
    maxPlayers: 8,
    tracks: TRACKS.map((t) => ({ id: t.id, name: t.name, subtitle: t.subtitle })),
  });
});
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: manager.listPublic() });
});
app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => {
  log.warn('erro HTTP', req.method, req.url, err?.message);
  res.status(500).json({ error: 'server_error' });
});

// --- Socket.IO ------------------------------------------------------------
io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  if (!originAllowed(origin)) return next(new Error('origem_nao_permitida'));
  socket.data.limiter = new RateLimiter(90, 60);
  socket.data.inputLimiter = new RateLimiter(34, 40);
  socket.data.connectedAt = Date.now();
  socket.data.session = null;
  return next();
});

function replyError(socket, code, msg, ack) {
  if (typeof ack === 'function') ack({ ok: false, error: msg, code });
  else socket.emit('room:error', { code, msg });
}

function currentRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return null;
  return manager.getRoom(code);
}

function leaveCurrent(socket, { permanent = true } = {}) {
  const room = currentRoom(socket);
  const pid = socket.data.playerId;
  if (room && pid) {
    room.removePlayer(pid, { permanent });
    socket.leave(room.code);
  }
  socket.data.roomCode = null;
  socket.data.playerId = null;
}

io.on('connection', (socket) => {
  log.debug(`socket conectado ${socket.id} (${manager.stats().players} jogadores)`);
  socket.emit('server:info', {
    version: VERSION,
    tickRate: 60,
    snapshotRate: 20,
    serverTime: Date.now(),
    origins: ALLOW_ALL ? ['*'] : ORIGINS.length,
  });

  socket.on('ping:check', (payload, ack) => {
    if (typeof ack === 'function') ack({ t: Date.now(), c: payload?.c ?? null });
  });

  socket.on('hello', (payload = {}, ack) => {
    if (!socket.data.limiter.allow()) return;
    try {
      const name = sanitizeName(payload.name);
      if (!name) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Nome inválido: use 2 a 16 caracteres.' });
        return;
      }
      const playerId = cleanId(payload.playerId) || `p_${socket.id.slice(0, 10)}_${Date.now().toString(36)}`;
      const profile = sanitizeProfile(payload.profile);
      socket.data.session = { name, playerId, ...profile };
      if (typeof ack === 'function')
        ack({ ok: true, playerId, name, serverTime: Date.now(), version: VERSION });
    } catch (err) {
      log.error('hello falhou', err?.message);
    }
  });

  socket.on('room:list', (payload, ack) => {
    if (!socket.data.limiter.allow()) return;
    const rooms = manager.listPublic();
    if (typeof ack === 'function') ack({ rooms });
    else socket.emit('room:list', { rooms });
  });

  socket.on('room:create', (payload = {}, ack) => {
    if (!socket.data.limiter.allow(2)) return;
    try {
      if (!socket.data.session) return replyError(socket, 'no_session', 'Envie seu nome antes de criar a sala.', ack);
      leaveCurrent(socket);
      const base = sanitizeSettings(payload.settings, {
        mode: 'classic',
        trackId: 'random',
        maxPlayers: 8,
        chaos: 1,
        visibility: 'public',
        name: '',
      });
      const settings = validateRoomSettings(base);
      const mode = getMode(settings.mode);
      if (mode.solo) settings.maxPlayers = 1;
      const { ok, room, error } = manager.createRoom(settings);
      if (!ok) return replyError(socket, 'rooms_full', error, ack);
      const session = socket.data.session;
      const res = room.addPlayer(socket, {
        playerId: session.playerId,
        name: session.name,
        character: session.character,
        ability: session.ability,
        cosmetics: session.cosmetics,
      });
      if (!res.ok) {
        manager.destroyRoom(room.code);
        return replyError(socket, 'join_failed', res.error, ack);
      }
      if (typeof ack === 'function') ack({ ok: true, code: room.code });
    } catch (err) {
      log.error('room:create falhou', err?.message);
      replyError(socket, 'server_error', 'Não foi possível criar a sala.', ack);
    }
  });

  socket.on('room:join', (payload = {}, ack) => {
    if (!socket.data.limiter.allow(2)) return;
    try {
      if (!socket.data.session) return replyError(socket, 'no_session', 'Envie seu nome antes de entrar.', ack);
      const code = sanitizeRoomCode(payload.code);
      if (!code) return replyError(socket, 'bad_code', 'Código de convite inválido.', ack);
      const room = manager.getRoom(code);
      if (!room) return replyError(socket, 'not_found', 'Sala não encontrada. Confira o código.', ack);
      const session = socket.data.session;
      if (socket.data.roomCode && socket.data.roomCode !== code) leaveCurrent(socket);
      const res = room.addPlayer(socket, {
        playerId: session.playerId,
        name: session.name,
        character: session.character,
        ability: session.ability,
        cosmetics: session.cosmetics,
      });
      if (!res.ok) return replyError(socket, 'join_failed', res.error, ack);
      if (typeof ack === 'function') ack({ ok: true, code: room.code });
    } catch (err) {
      log.error('room:join falhou', err?.message);
      replyError(socket, 'server_error', 'Não foi possível entrar na sala.', ack);
    }
  });

  socket.on('room:quick', (payload = {}, ack) => {
    if (!socket.data.limiter.allow(2)) return;
    try {
      if (!socket.data.session) return replyError(socket, 'no_session', 'Envie seu nome antes de jogar.', ack);
      const session = socket.data.session;
      const wantedMode = sanitizeSettings(payload.settings, { mode: 'classic' }).mode;
      let room = manager.findQuickJoin({ mode: wantedMode });
      let created = false;
      if (!room) {
        const settings = validateRoomSettings(
          sanitizeSettings(payload.settings, {
            mode: wantedMode,
            trackId: 'random',
            maxPlayers: 8,
            chaos: 1,
            visibility: 'public',
            name: '',
          }),
        );
        const res = manager.createRoom(settings);
        if (!res.ok) return replyError(socket, 'rooms_full', res.error, ack);
        room = res.room;
        created = true;
      }
      leaveCurrent(socket);
      const added = room.addPlayer(socket, {
        playerId: session.playerId,
        name: session.name,
        character: session.character,
        ability: session.ability,
        cosmetics: session.cosmetics,
      });
      if (!added.ok) {
        if (created) manager.destroyRoom(room.code);
        return replyError(socket, 'join_failed', added.error, ack);
      }
      if (typeof ack === 'function') ack({ ok: true, code: room.code, created });
    } catch (err) {
      log.error('room:quick falhou', err?.message);
      replyError(socket, 'server_error', 'Falha ao buscar partida.', ack);
    }
  });

  socket.on('room:rejoin', (payload = {}, ack) => {
    if (!socket.data.limiter.allow(2)) return;
    if (!socket.data.session) return replyError(socket, 'no_session', 'Reconecte primeiro.', ack);
    const code = sanitizeRoomCode(payload.code);
    const room = code ? manager.getRoom(code) : null;
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false });
      return socket.emit('room:gone', { code });
    }
    const res = room.reconnect(socket, socket.data.session.playerId);
    if (!res.ok) {
      if (typeof ack === 'function') ack({ ok: false });
      return socket.emit('room:gone', { code });
    }
    if (typeof ack === 'function') ack({ ok: true, code: room.code, phase: room.phase });
  });

  socket.on('room:leave', () => {
    if (!socket.data.limiter.allow()) return;
    leaveCurrent(socket);
    socket.emit('room:left', {});
  });

  socket.on('room:profile', (payload = {}) => {
    if (!socket.data.limiter.allow()) return;
    const profile = sanitizeProfile(payload.profile);
    if (socket.data.session) Object.assign(socket.data.session, profile);
    const room = currentRoom(socket);
    if (room && socket.data.playerId) room.setProfile(socket.data.playerId, profile);
  });

  socket.on('room:ready', (payload = {}) => {
    if (!socket.data.limiter.allow()) return;
    const room = currentRoom(socket);
    if (!room || !socket.data.playerId) return;
    room.setReady(socket.data.playerId, payload.ready !== false);
  });

  socket.on('room:settings', (payload = {}) => {
    if (!socket.data.limiter.allow(2)) return;
    const room = currentRoom(socket);
    if (!room || !socket.data.playerId) return;
    const player = room.participant(socket.data.playerId);
    if (!player?.host) return replyError(socket, 'not_host', 'Só o anfitrião pode mudar as regras.');
    const settings = sanitizeSettings(payload.settings, room.settings);
    room.updateSettings(socket.data.playerId, validateRoomSettings(settings));
  });

  socket.on('room:start', () => {
    if (!socket.data.limiter.allow(2)) return;
    const room = currentRoom(socket);
    if (!room || !socket.data.playerId) return;
    const player = room.participant(socket.data.playerId);
    if (!player?.host) return;
    const mode = getMode(room.settings.mode);
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (connected.length < mode.minPlayers) {
      return replyError(socket, 'need_players', `Este modo precisa de ${mode.minPlayers} jogador(es).`);
    }
    room.start();
  });

  socket.on('room:rematch', () => {
    if (!socket.data.limiter.allow(2)) return;
    const room = currentRoom(socket);
    if (room && socket.data.playerId) room.voteRematch(socket.data.playerId);
  });

  socket.on('room:lobby', () => {
    if (!socket.data.limiter.allow(2)) return;
    const room = currentRoom(socket);
    if (room && socket.data.playerId) room.toLobby(socket.data.playerId);
  });

  socket.on('match:input', (payload) => {
    if (!socket.data.inputLimiter.allow()) return;
    const room = currentRoom(socket);
    if (!room?.game || !socket.data.playerId) return;
    const batch = sanitizeInputBatch(payload, 8);
    if (!batch || !batch.length) return;
    room.game.setInputs(socket.data.playerId, batch);
  });

  socket.on('match:ability', () => {
    if (!socket.data.limiter.allow(2)) return;
    const room = currentRoom(socket);
    if (!room?.game || !socket.data.playerId) return;
    const ok = room.game.useAbility(socket.data.playerId);
    if (!ok) socket.emit('match:notice', { msg: 'Habilidade recarregando...' });
  });

  socket.on('match:emote', (payload = {}) => {
    if (!socket.data.limiter.allow()) return;
    const room = currentRoom(socket);
    if (!room?.game || !socket.data.playerId) return;
    const emote = EMOTES.find((e) => e.id === payload.id);
    if (!emote) return;
    room.game.emote(socket.data.playerId, emote.id);
  });

  socket.on('disconnect', (reason) => {
    const room = currentRoom(socket);
    const pid = socket.data.playerId;
    if (room && pid) {
      const permanent = room.phase === 'lobby';
      room.removePlayer(pid, { permanent });
    }
    socket.data.roomCode = null;
    socket.data.playerId = null;
    log.debug(`socket ${socket.id} desconectou (${reason})`);
  });

  socket.on('error', (err) => log.warn('erro de socket', err?.message));
});

io.engine.on('connection_error', (err) => {
  log.warn('handshake rejeitado:', err.code, err.message, err.context?.origin);
});

startLoop();
server.listen(PORT, '0.0.0.0', () => {
  log.info(`Chaos Race server v${VERSION} ouvindo em 0.0.0.0:${PORT}`);
  log.info(`CORS permitido: ${ALLOW_ALL ? '*' : ORIGINS.join(', ')}`);
});

const shutdown = (signal) => {
  log.info(`recebido ${signal}, encerrando...`);
  if (tickTimer) clearInterval(tickTimer);
  manager.dispose();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => log.error('uncaughtException', err?.stack || err));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', err?.stack || err));

export { app, server, io, manager };
