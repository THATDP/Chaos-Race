import { isValidAbility } from '../../../shared/abilities.js';
import { isValidCharacter } from '../../../shared/characters.js';
import { validCosmetics } from '../../../shared/cosmetics.js';
import { MODE_MAP } from '../../../shared/modes.js';
import { TRACK_MAP } from '../../../shared/tracks.js';

const NAME_ALLOWED = /^[\p{L}\p{N} _.\-![\](){}+*=?#@:]{2,16}$/u;

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().replace(/\s+/g, ' ');
  if (!NAME_ALLOWED.test(name)) return null;
  return name.slice(0, 16);
}

export function sanitizeText(raw, max = 80) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max);
}

export function sanitizeRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4 || code.length > 6) return null;
  return code;
}

export function sanitizeSettings(raw, current = {}) {
  const out = { ...current };
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.mode === 'string' && MODE_MAP[raw.mode]) out.mode = raw.mode;
  if (typeof raw.trackId === 'string' && (raw.trackId === 'random' || TRACK_MAP[raw.trackId]))
    out.trackId = raw.trackId;
  if (Number.isFinite(raw.maxPlayers)) out.maxPlayers = Math.max(2, Math.min(8, Math.round(raw.maxPlayers)));
  if (Number.isFinite(raw.chaos)) out.chaos = Math.max(0, Math.min(3, Math.round(raw.chaos)));
  if (raw.visibility === 'public' || raw.visibility === 'private') out.visibility = raw.visibility;
  if (typeof raw.name === 'string' && raw.name.trim()) out.name = sanitizeText(raw.name, 28);
  return out;
}

export function sanitizeProfile(raw) {
  const out = { character: 'vulcan', ability: 'turbo', cosmetics: validCosmetics(null) };
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.character === 'string' && isValidCharacter(raw.character)) out.character = raw.character;
  if (typeof raw.ability === 'string' && isValidAbility(raw.ability)) out.ability = raw.ability;
  out.cosmetics = validCosmetics(raw.cosmetics);
  return out;
}

export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seq = Number.isInteger(raw.s) ? raw.s : null;
  if (seq === null) return null;
  const dir = raw.d === 1 ? 1 : raw.d === -1 ? -1 : 0;
  return {
    seq: seq & 0x7fffffff,
    dir,
    jump: raw.j === true || raw.j === 1,
    hold: raw.h === true || raw.h === 1,
    slide: raw.sl === true || raw.sl === 1,
  };
}

export function sanitizeInputBatch(raw, max = 8) {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.q) ? raw.q : null;
  if (!list) return null;
  const out = [];
  for (const item of list.slice(0, max)) {
    if (!Array.isArray(item) || item.length < 5) continue;
    const seq = item[0];
    if (!Number.isInteger(seq) || seq < 0 || seq > 2 ** 30) continue;
    out.push({
      seq,
      dir: item[1] === 1 ? 1 : item[1] === -1 ? -1 : 0,
      jump: item[2] === 1 || item[2] === true,
      hold: item[3] === 1 || item[3] === true,
      slide: item[4] === 1 || item[4] === true,
    });
  }
  return out;
}

export function cleanId(raw) {
  if (typeof raw !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(raw)) return null;
  return raw;
}

export class RateLimiter {
  constructor(maxPerSecond = 90, burst = 45) {
    this.rate = maxPerSecond;
    this.capacity = burst;
    this.tokens = burst;
    this.last = Date.now();
  }
  allow(cost = 1) {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
