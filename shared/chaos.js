// Eventos caóticos determinísticos: a posição de tudo é calculada a partir do
// tempo de partida + semente, então servidor e clientes nunca divergem.

export const CHAOS_EVENTS = [
  {
    id: 'lowgrav',
    name: 'Gravidade Lunar',
    icon: '🌙',
    color: '#7dd3fc',
    duration: 13,
    desc: 'Salte mais alto: a gravidade caiu.',
  },
  {
    id: 'heavygrav',
    name: 'Gravidade Pesada',
    icon: '🪨',
    color: '#f59e0b',
    duration: 10,
    desc: 'Tudo mais pesado. Cuidado com os pulos.',
  },
  {
    id: 'slippery',
    name: 'Pista Escorregadia',
    icon: '🧊',
    color: '#67e8f9',
    duration: 12,
    desc: 'O chão virou gelo.',
  },
  {
    id: 'wind',
    name: 'Vento Cruzado',
    icon: '💨',
    color: '#c4b5fd',
    duration: 11,
    desc: 'Rajadas empurram todos ao mesmo tempo.',
  },
  {
    id: 'meteors',
    name: 'Chuva de Meteoros',
    icon: '☄️',
    color: '#f97316',
    duration: 13,
    desc: 'Meteoros caem na pista!',
  },
  {
    id: 'overdrive',
    name: 'Overdrive',
    icon: '⚡',
    color: '#facc15',
    duration: 9,
    desc: 'Todos correm mais rápido.',
  },
  {
    id: 'bridge',
    name: 'Plataformas Temporárias',
    icon: '🧩',
    color: '#a3e635',
    duration: 15,
    desc: 'Pontes de energia apareceram nos vãos.',
  },
];

export const CHAOS_MAP = Object.fromEntries(CHAOS_EVENTS.map((e) => [e.id, e]));

export function chaosById(id) {
  return CHAOS_MAP[id] || null;
}

// hash determinístico -> [0,1)
export function hash01(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Meteoros: retângulos de perigo calculados pelo tempo.
export function meteorRects(event, t, track) {
  const age = t - event.start;
  if (age < 0 || age > event.duration) return [];
  const rects = [];
  const count = 16;
  const cycle = 2.6;
  for (let i = 0; i < count; i++) {
    const seed = (event.seed || 0) * 7919 + i * 104729;
    const x = 400 + hash01(seed) * (track.finishX - 900);
    const offset = hash01(seed + 55) * cycle;
    const local = (age + offset) % cycle;
    const fallTime = 1.5;
    if (local > fallTime) continue;
    const p = local / fallTime;
    const y = -80 + p * (track.killY - 60);
    const size = 42;
    rects.push({ x: x - size / 2, y, w: size, h: size, kind: 'meteor' });
  }
  return rects;
}

export function chaosModifiers(events, t) {
  let gravity = 1;
  let friction = 1;
  let windX = 0;
  let speed = 1;
  let active = [];
  for (const ev of events) {
    if (t < ev.start || t > ev.start + ev.duration) continue;
    const age = t - ev.start;
    active.push(ev);
    switch (ev.id) {
      case 'lowgrav':
        gravity = 0.6;
        break;
      case 'heavygrav':
        gravity = 1.5;
        break;
      case 'slippery':
        friction = 0.22;
        break;
      case 'overdrive':
        speed = 1.2;
        break;
      case 'wind':
        windX = Math.sin(age * 1.5 + (ev.seed || 0)) * 210 - 60;
        break;
      default:
        break;
    }
  }
  return { gravity, friction, windX, speed, active };
}

export function isChaosActive(events, t, id) {
  return events.some((e) => e.id === id && t >= e.start && t <= e.start + e.duration);
}
