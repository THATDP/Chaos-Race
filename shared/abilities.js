// Habilidades (gadgets) originais. Todas disponíveis desde o início:
// nenhuma vantagem paga, o equilíbrio é o mesmo para todos.
export const ABILITIES = [
  {
    id: 'turbo',
    name: 'Turbo Neon',
    icon: '⚡',
    color: '#fbbf24',
    desc: 'Impulso violento de velocidade por 0,9s. Recarrega em 9s.',
    cooldown: 9,
    type: 'self',
  },
  {
    id: 'quantum',
    name: 'Salto Quântico',
    icon: '🪐',
    color: '#a78bfa',
    desc: 'Salto extra no ar, atravessa armadilhas por 1,2s. Recarrega em 11s.',
    cooldown: 11,
    type: 'self',
  },
  {
    id: 'shield',
    name: 'Escudo de Íon',
    icon: '🛡️',
    color: '#38bdf8',
    desc: 'Absorve completamente o próximo impacto por 6s. Recarrega em 14s.',
    cooldown: 14,
    type: 'self',
  },
  {
    id: 'trap',
    name: 'Mina Caótica',
    icon: '💣',
    color: '#fb7185',
    desc: 'Solta uma mina que atordoa e desacelera quem passar. Recarrega em 8s.',
    cooldown: 8,
    type: 'world',
  },
  {
    id: 'swap',
    name: 'Troca Dimensional',
    icon: '🌀',
    color: '#f472b6',
    desc: 'Troca de lugar com o adversário à frente mais próximo. Recarrega em 22s.',
    cooldown: 22,
    type: 'swap',
  },
  {
    id: 'storm',
    name: 'Tempestade',
    icon: '🌩️',
    color: '#34d399',
    desc: 'Cria uma zona de vento e gelo à frente que afeta todos. Recarrega em 16s.',
    cooldown: 16,
    type: 'world',
  },
];

export const ABILITY_MAP = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));
export const DEFAULT_ABILITY = 'turbo';

export const TRAP_LIFETIME = 18;
export const STORM_DURATION = 6;
export const STORM_LENGTH = 520;

export function isValidAbility(id) {
  return Object.prototype.hasOwnProperty.call(ABILITY_MAP, id);
}
