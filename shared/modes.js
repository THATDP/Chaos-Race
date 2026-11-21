export const MODES = [
  {
    id: 'classic',
    name: 'Corrida Clássica',
    icon: '🏁',
    tag: '2-8 jogadores',
    desc: 'Primeiro a cruzar a linha de chegada vence. O clássico que todo mundo entende.',
    minPlayers: 2,
    loops: false,
    lives: 0,
    timeLimit: 240,
  },
  {
    id: 'elimination',
    name: 'Eliminação',
    icon: '☠️',
    tag: '3-8 jogadores',
    desc: 'A cada 15 segundos o último colocado é eliminado. Pista em loop, sem piedade.',
    minPlayers: 3,
    loops: true,
    lives: 0,
    timeLimit: 300,
  },
  {
    id: 'survival',
    name: 'Sobrevivência',
    icon: '🛡️',
    tag: '2-8 jogadores',
    desc: 'Três vidas. Quedas e armadilhas custam uma vida. O último de pé vence.',
    minPlayers: 2,
    loops: true,
    lives: 3,
    timeLimit: 300,
  },
  {
    id: 'timeattack',
    name: 'Contra o Tempo',
    icon: '⏱️',
    tag: 'Solo',
    desc: 'Corrida solo contra o relógio e contra o seu próprio fantasma.',
    minPlayers: 1,
    maxPlayers: 1,
    solo: true,
    loops: false,
    lives: 0,
    timeLimit: 0,
  },
];

export const MODE_MAP = Object.fromEntries(MODES.map((m) => [m.id, m]));

export function getMode(id) {
  return MODE_MAP[id] || MODE_MAP.classic;
}

export const CHAOS_LEVELS = [
  { id: 0, name: 'Desligado', desc: 'Nenhum evento aleatório. Puro talento.' },
  { id: 1, name: 'Leve', desc: 'Um evento de vez em quando.' },
  { id: 2, name: 'Caótico', desc: 'Eventos frequentes e intensos.' },
  { id: 3, name: 'Apocalipse', desc: 'Tudo ao mesmo tempo. Sem promessas.' },
];

export function chaosInterval(level) {
  if (level <= 0) return Infinity;
  if (level === 1) return 26;
  if (level === 2) return 16;
  return 9;
}
