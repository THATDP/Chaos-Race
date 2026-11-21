import { Game } from '../game/Game.js';
import { getMode } from '../../../shared/modes.js';
import { getTrack } from '../../../shared/tracks.js';
import { MATCH } from '../../../shared/constants.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('room');

export class Room {
  constructor(code, io, settings, trackPool) {
    this.code = code;
    this.io = io;
    this.settings = settings;
    this.trackPool = trackPool;
    this.players = new Map();
    this.phase = 'lobby';
    this.game = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.rematchVotes = new Set();
    this.disconnectTimers = new Map();
    this.emptySince = null;
    this.results = null;
  }

  get isPublic() {
    return this.settings.visibility === 'public';
  }

  get maxPlayers() {
    const mode = getMode(this.settings.mode);
    return Math.min(this.settings.maxPlayers, mode.maxPlayers || 8);
  }

  get connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  participant(pid) {
    return this.players.get(pid);
  }

  addPlayer(socket, { playerId, name, character, ability, cosmetics }) {
    if (this.phase === 'racing') {
      const existing = this.players.get(playerId);
      if (existing) return this.reconnect(socket, playerId);
      return { ok: false, error: 'Partida em andamento. Aguarde a revanche.' };
    }
    if (this.players.size >= this.maxPlayers) return { ok: false, error: 'Sala cheia.' };
    if (this.players.has(playerId)) return this.reconnect(socket, playerId);

    const isHost = this.players.size === 0;
    const player = {
      id: playerId,
      name,
      character,
      ability,
      cosmetics,
      ready: false,
      connected: true,
      socketId: socket.id,
      host: isHost,
      joinedAt: Date.now(),
    };
    this.players.set(playerId, player);
    socket.join(this.code);
    socket.data.roomCode = this.code;
    socket.data.playerId = playerId;
    this.touch();
    this.broadcastState();
    log.info(`${name} entrou na sala ${this.code} (${this.players.size}/${this.maxPlayers})`);
    return { ok: true, room: this };
  }

  reconnect(socket, playerId) {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Jogador não encontrado nesta sala.' };
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
    player.connected = true;
    player.socketId = socket.id;
    socket.join(this.code);
    socket.data.roomCode = this.code;
    socket.data.playerId = playerId;
    this.touch();
    if (this.game && this.phase === 'racing') {
      this.game.setConnected(playerId, true);
      if (this.game.startPayload) socket.emit('match:start', this.game.startPayload);
      socket.emit('match:resync', { snapshot: this.game.snapshot(), phase: this.phase });
    }
    this.broadcastState();
    log.info(`${player.name} reconectou na sala ${this.code}`);
    return { ok: true, room: this, reconnected: true };
  }

  removePlayer(playerId, { permanent = true } = {}) {
    const player = this.players.get(playerId);
    if (!player) return;
    if (!permanent) {
      player.connected = false;
      this.broadcastState();
      if (this.game) this.game.setConnected(playerId, false);
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        this.forceRemove(playerId);
      }, MATCH.reconnectGrace * 1000);
      this.disconnectTimers.set(playerId, timer);
      this.touch();
      return;
    }
    this.forceRemove(playerId);
  }

  forceRemove(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.rematchVotes.delete(playerId);
    if (this.game) this.game.removePlayer(playerId);
    if (player.host) {
      const next = [...this.players.values()].find((p) => p.connected) || [...this.players.values()][0];
      if (next) next.host = true;
    }
    this.touch();
    if (this.players.size === 0) {
      this.emptySince = Date.now();
    } else {
      this.broadcastState();
    }
    log.info(`${player.name} saiu da sala ${this.code} (${this.players.size} restantes)`);
  }

  setProfile(playerId, profile) {
    const player = this.players.get(playerId);
    if (!player || this.phase === 'racing') return;
    Object.assign(player, profile);
    this.touch();
    this.broadcastState();
  }

  setReady(playerId, value) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.ready = !!value;
    this.touch();
    this.broadcastState();
    this.maybeStart();
  }

  updateSettings(playerId, settings) {
    const player = this.players.get(playerId);
    if (!player?.host || this.phase === 'racing') return false;
    this.settings = settings;
    if (this.players.size > this.maxPlayers) {
      // não remove ninguém: apenas informa no estado
    }
    this.touch();
    this.broadcastState();
    return true;
  }

  maybeStart() {
    if (this.phase !== 'lobby') return;
    const mode = getMode(this.settings.mode);
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < mode.minPlayers) return;
    if (mode.solo) {
      if (connected.length === 1 && connected[0].ready) this.start();
      return;
    }
    if (connected.every((p) => p.ready)) this.start();
  }

  start() {
    if (this.phase === 'racing') return false;
    const mode = getMode(this.settings.mode);
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < mode.minPlayers) return false;
    if (mode.solo && connected.length > 1) return false;
    this.phase = 'racing';
    this.rematchVotes.clear();
    this.results = null;
    for (const p of this.players.values()) p.ready = false;
    this.game = new Game(this, this.io);
    this.game.start();
    this.broadcastState();
    this.touch();
    return true;
  }

  onGameEnd(results) {
    if (!this.game) return;
    this.results = results;
    this.phase = 'results';
    this.rematchVotes.clear();
    this.broadcastState();
    this.io.to(this.code).emit('room:rematchState', { votes: 0, needed: this.connectedCount });
    this.touch();
  }

  voteRematch(playerId) {
    if (this.phase !== 'results' || !this.players.has(playerId)) return;
    this.rematchVotes.add(playerId);
    const needed = Math.max(1, this.connectedCount);
    this.io.to(this.code).emit('room:rematchState', {
      votes: this.rematchVotes.size,
      needed,
    });
    if (this.rematchVotes.size >= needed) {
      this.players.forEach((p) => (p.ready = false));
      this.phase = 'lobby';
      this.game?.stop();
      this.game = null;
      this.broadcastState();
      // pequena pausa para o cliente respirar antes do novo lobby
      setTimeout(() => {
        if (this.phase === 'lobby') this.start();
      }, 1200);
    }
  }

  toLobby(playerId) {
    const player = this.players.get(playerId);
    if (!player?.host || this.phase === 'racing') return;
    this.phase = 'lobby';
    this.game?.stop();
    this.game = null;
    this.rematchVotes.clear();
    this.players.forEach((p) => (p.ready = false));
    this.broadcastState();
  }

  publicInfo() {
    const mode = getMode(this.settings.mode);
    return {
      code: this.code,
      name: this.settings.name || `Sala de ${[...this.players.values()][0]?.name || 'Caos'}`,
      mode: mode.id,
      modeName: mode.name,
      modeIcon: mode.icon,
      trackId: this.settings.trackId,
      trackName: this.settings.trackId === 'random' ? 'Pista aleatória' : getTrack(this.settings.trackId).name,
      players: this.connectedCount,
      total: this.players.size,
      maxPlayers: this.maxPlayers,
      chaos: this.settings.chaos,
      phase: this.phase,
    };
  }

  state() {
    const mode = getMode(this.settings.mode);
    return {
      code: this.code,
      settings: this.settings,
      phase: this.phase,
      modeName: mode.name,
      modeMinPlayers: mode.minPlayers,
      trackName: this.settings.trackId === 'random' ? 'Aleatória' : getTrack(this.settings.trackId).name,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        character: p.character,
        ability: p.ability,
        cosmetics: p.cosmetics,
        ready: p.ready,
        connected: p.connected,
        host: p.host,
      })),
      hostId: [...this.players.values()].find((p) => p.host)?.id || null,
      maxPlayers: this.maxPlayers,
      results: this.results,
    };
  }

  broadcastState() {
    this.io.to(this.code).emit('room:state', this.state());
  }

  touch() {
    this.lastActivity = Date.now();
    if (this.players.size > 0) this.emptySince = null;
  }

  tick(dt, now) {
    if (this.game) this.game.update(dt, now);
    if (this.players.size === 0 && !this.emptySince) this.emptySince = now;
  }

  dispose() {
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
    this.game?.stop();
    this.game = null;
    this.players.clear();
  }
}
