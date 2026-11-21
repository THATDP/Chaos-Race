import { CHARACTERS } from '@shared/characters.js';
import { SKINS, TRAILS, ACCESSORIES } from '@shared/cosmetics.js';
import { TRACKS } from '@shared/tracks.js';

const KEY = 'chaosrace.profile.v1';
const NAMES = ['Cometa', 'Fúria', 'Vortex', 'Zero', 'Blitz', 'Eco', 'Kaida', 'Rex', 'Luna', 'Nitro'];

function randomId() {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return `p_${rnd[0].toString(36)}${rnd[1].toString(36)}`;
}

export function defaultProfile() {
  return {
    playerId: randomId(),
    name: `Piloto${Math.floor(Math.random() * 900 + 100)}`,
    character: 'vulcan',
    ability: 'turbo',
    cosmetics: { skin: 'default', trail: 'spark', accessory: 'none' },
    settings: { music: 0.45, sfx: 0.75, quality: 'auto', showNames: true, serverUrl: '' },
    stats: {
      races: 0,
      wins: 0,
      podiums: 0,
      finishes: 0,
      falls: 0,
      hits: 0,
      uses: 0,
      eliminations: 0,
      distance: 0,
      playTime: 0,
      modes: {},
      tracks: {},
      bestTimes: {},
    },
    ghosts: {},
    achievements: [],
    createdAt: new Date().toISOString(),
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base, ...saved };
  out.cosmetics = { ...base.cosmetics, ...(saved.cosmetics || {}) };
  out.settings = { ...base.settings, ...(saved.settings || {}) };
  out.stats = { ...base.stats, ...(saved.stats || {}) };
  out.stats.modes = { ...base.stats.modes, ...(saved.stats?.modes || {}) };
  out.stats.tracks = { ...base.stats.tracks, ...(saved.stats?.tracks || {}) };
  out.stats.bestTimes = { ...base.stats.bestTimes, ...(saved.stats?.bestTimes || {}) };
  out.ghosts = { ...base.ghosts, ...(saved.ghosts || {}) };
  out.achievements = Array.isArray(saved.achievements) ? saved.achievements : [];
  return out;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    const profile = raw ? merge(defaultProfile(), JSON.parse(raw)) : defaultProfile();
    if (!profile.name) profile.name = defaultProfile().name;
    return profile;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage cheio ou bloqueado */
  }
}

export function resetProfile() {
  const fresh = defaultProfile();
  saveProfile(fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Conquistas
// ---------------------------------------------------------------------------
export const ACHIEVEMENTS = [
  {
    id: 'first-race',
    name: 'Corrida de Estreia',
    desc: 'Complete sua primeira corrida online.',
    icon: '🏁',
    test: (c) => c.stats.races >= 1,
  },
  {
    id: 'first-win',
    name: 'Primeiro Sangue',
    desc: 'Vença uma corrida.',
    icon: '🥇',
    test: (c) => c.stats.wins >= 1,
  },
  {
    id: 'podium-5',
    name: 'Pódio Habitual',
    desc: 'Termine no top 3 em 5 corridas.',
    icon: '🏆',
    test: (c) => c.stats.podiums >= 5,
  },
  {
    id: 'veteran',
    name: 'Veterano do Caos',
    desc: 'Dispute 25 corridas.',
    icon: '🎖️',
    test: (c) => c.stats.races >= 25,
  },
  {
    id: 'champion',
    name: 'Campeão do Circuito',
    desc: 'Vença 15 corridas.',
    icon: '👑',
    test: (c) => c.stats.wins >= 15,
  },
  {
    id: 'untouchable',
    name: 'Intocável',
    desc: 'Vença uma corrida sem cair nenhuma vez.',
    icon: '🛡️',
    test: (c) => c.race.place === 1 && c.race.falls === 0 && c.race.finished,
  },
  {
    id: 'speedster',
    name: 'Relâmpago',
    desc: 'Complete uma corrida em menos de 30 segundos.',
    icon: '⚡',
    test: (c) => c.race.finished && c.race.time != null && c.race.time < 30,
  },
  {
    id: 'survivor',
    name: 'Último de Pé',
    desc: 'Vença uma partida no modo Sobrevivência.',
    icon: '❤️',
    test: (c) => c.race.place === 1 && c.race.mode === 'survival',
  },
  {
    id: 'eliminator',
    name: 'Sem Piedade',
    desc: 'Vença uma partida no modo Eliminação.',
    icon: '☠️',
    test: (c) => c.race.place === 1 && c.race.mode === 'elimination',
  },
  {
    id: 'all-tracks',
    name: 'Volta ao Mundo',
    desc: 'Corra em todas as 5 pistas.',
    icon: '🌍',
    test: (c) => Object.keys(c.stats.tracks).length >= TRACKS.length,
  },
  {
    id: 'chaos-master',
    name: 'Mestre do Caos',
    desc: 'Vença uma corrida com o caos no nível Apocalipse.',
    icon: '🌪️',
    test: (c) => c.race.place === 1 && c.race.chaos >= 3,
  },
  {
    id: 'gadgeteer',
    name: 'Engenheiro de Caos',
    desc: 'Use habilidades 50 vezes.',
    icon: '🧨',
    test: (c) => c.stats.uses >= 50,
  },
  {
    id: 'centurion',
    name: 'Centurião',
    desc: 'Dispute 100 corridas.',
    icon: '💯',
    test: (c) => c.stats.races >= 100,
  },
  {
    id: 'timekeeper',
    name: 'Senhor do Tempo',
    desc: 'Complete uma corrida contra o tempo.',
    icon: '⏱️',
    test: (c) => c.race.mode === 'timeattack' && c.race.finished,
  },
];

export function achievementCount(profile) {
  return profile.achievements.length;
}

export function evaluateAchievements(profile, race) {
  const ctx = { stats: profile.stats, profile, race };
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements.includes(a.id)) continue;
    try {
      if (a.test(ctx)) {
        profile.achievements.push(a.id);
        unlocked.push(a);
      }
    } catch {
      /* ignora teste inválido */
    }
  }
  return unlocked;
}

// ---------------------------------------------------------------------------
// Registro de corrida
// ---------------------------------------------------------------------------
export function recordRace(profile, { results, selfId, trackId, mode, chaos }) {
  const me = results?.places?.find((p) => p.id === selfId);
  if (!me) return { newAchievements: [], record: false };
  const s = profile.stats;
  s.races += 1;
  if (me.place === 1) s.wins += 1;
  if (me.place <= 3) s.podiums += 1;
  if (me.finished) s.finishes += 1;
  s.falls += me.falls || 0;
  s.hits += me.hits || 0;
  s.uses += me.uses || 0;
  s.distance += Math.max(0, me.progress || 0);
  s.playTime += Math.round(results.duration || 0);
  s.modes[mode] = s.modes[mode] || { races: 0, wins: 0 };
  s.modes[mode].races += 1;
  if (me.place === 1) s.modes[mode].wins += 1;
  s.tracks[trackId] = s.tracks[trackId] || { races: 0, wins: 0, best: null };
  s.tracks[trackId].races += 1;
  if (me.place === 1) s.tracks[trackId].wins += 1;

  let record = false;
  if (me.finished && me.time != null) {
    const prev = s.bestTimes[trackId];
    if (prev == null || me.time < prev) {
      s.bestTimes[trackId] = Math.round(me.time * 100) / 100;
      if (s.tracks[trackId].best == null || me.time < s.tracks[trackId].best) {
        s.tracks[trackId].best = s.bestTimes[trackId];
      }
      record = true;
    }
  }

  const race = {
    place: me.place,
    mode,
    trackId,
    chaos,
    falls: me.falls || 0,
    hits: me.hits || 0,
    uses: me.uses || 0,
    finished: !!me.finished,
    time: me.time,
    eliminated: !!me.eliminated,
  };
  const newAchievements = evaluateAchievements(profile, race);
  saveProfile(profile);
  return { newAchievements, record, race };
}

// ---------------------------------------------------------------------------
// Fantasma (Contra o Tempo)
// ---------------------------------------------------------------------------
export function saveGhost(profile, trackId, time, samples) {
  const prev = profile.ghosts[trackId];
  if (prev && prev.time <= time) return false;
  profile.ghosts[trackId] = {
    time: Math.round(time * 100) / 100,
    samples: samples.slice(0, 2400),
    at: Date.now(),
  };
  saveProfile(profile);
  return true;
}

export function getGhost(profile, trackId) {
  return profile.ghosts[trackId] || null;
}

// ---------------------------------------------------------------------------
// Desbloqueios
// ---------------------------------------------------------------------------
export function unlockLabel(unlock) {
  if (!unlock || unlock.type === 'free') return 'Inicial';
  if (unlock.type === 'races') return `${unlock.value} corridas`;
  if (unlock.type === 'wins') return `${unlock.value} vitórias`;
  if (unlock.type === 'achievements') return `${unlock.value} conquistas`;
  return '???';
}

export function isUnlocked(item, profile) {
  const u = item?.unlock;
  if (!u || u.type === 'free') return true;
  const s = profile.stats;
  if (u.type === 'races') return s.races >= u.value;
  if (u.type === 'wins') return s.wins >= u.value;
  if (u.type === 'achievements') return profile.achievements.length >= u.value;
  return false;
}

export function listUnlocks(profile) {
  return {
    characters: CHARACTERS.filter((c) => isUnlocked(c, profile)),
    skins: SKINS.filter((c) => isUnlocked(c, profile)),
    trails: TRAILS.filter((c) => isUnlocked(c, profile)),
    accessories: ACCESSORIES.filter((c) => isUnlocked(c, profile)),
  };
}

export function winRate(profile) {
  const r = profile.stats.races;
  if (!r) return 0;
  return Math.round((profile.stats.wins / r) * 100);
}

export function suggestedName() {
  return `${NAMES[Math.floor(Math.random() * NAMES.length)]}${Math.floor(Math.random() * 90 + 10)}`;
}
