import { Room } from './Room.js';
import { TRACKS } from '../../../shared/tracks.js';
import { getMode, MODE_MAP } from '../../../shared/modes.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('rooms');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  constructor(io, options = {}) {
    this.io = io;
    this.rooms = new Map();
    this.maxRooms = options.maxRooms || 300;
    this.trackPool = TRACKS.map((t) => t.id);
    this.onlinePlayers = 0;
  }

  generateCode() {
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = '';
      for (let i = 0; i < 5; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    return `R${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  createRoom(settings) {
    if (this.rooms.size >= this.maxRooms) return { ok: false, error: 'Servidor cheio de salas. Tente novamente.' };
    const code = this.generateCode();
    const room = new Room(code, this.io, settings, this.trackPool);
    this.rooms.set(code, room);
    log.info(`sala criada ${code} (${settings.mode}, ${settings.visibility}) total=${this.rooms.size}`);
    return { ok: true, room };
  }

  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  destroyRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
    log.info(`sala removida ${code} total=${this.rooms.size}`);
  }

  listPublic() {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && r.phase === 'lobby' && r.players.size > 0 && r.players.size < r.maxPlayers)
      .sort((a, b) => b.players.size - a.players.size || b.createdAt - a.createdAt)
      .slice(0, 40)
      .map((r) => r.publicInfo());
  }

  findQuickJoin(settings) {
    const candidates = [...this.rooms.values()].filter(
      (r) =>
        r.isPublic &&
        r.phase === 'lobby' &&
        r.players.size > 0 &&
        r.players.size < r.maxPlayers &&
        !getMode(r.settings.mode).solo &&
        (settings?.mode ? r.settings.mode === settings.mode : true),
    );
    candidates.sort((a, b) => b.players.size - a.players.size);
    return candidates[0] || null;
  }

  tick(dt, now) {
    for (const [code, room] of this.rooms) {
      room.tick(dt, now);
      const emptyTooLong = room.emptySince && now - room.emptySince > 30000;
      const idleLobby = room.phase === 'lobby' && now - room.lastActivity > 20 * 60 * 1000;
      if (emptyTooLong || idleLobby) this.destroyRoom(code);
    }
  }

  stats() {
    let players = 0;
    let racing = 0;
    for (const r of this.rooms.values()) {
      players += r.connectedCount;
      if (r.phase === 'racing') racing++;
    }
    return { rooms: this.rooms.size, players, racing, uptime: process.uptime() };
  }

  dispose() {
    for (const code of [...this.rooms.keys()]) this.destroyRoom(code);
  }
}

export function validateRoomSettings(settings) {
  const mode = MODE_MAP[settings.mode] ? getMode(settings.mode) : getMode('classic');
  return {
    ...settings,
    mode: mode.id,
    maxPlayers: mode.solo ? 1 : Math.max(2, Math.min(8, settings.maxPlayers || 8)),
  };
}
