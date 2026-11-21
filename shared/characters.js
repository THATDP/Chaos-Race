// Personagens: 100% cosméticos. Nenhum atributo de gameplay muda entre eles,
// para manter o equilíbrio competitivo absoluto.
export const CHARACTERS = [
  {
    id: 'vulcan',
    name: 'Vulcão',
    title: 'O Estourado',
    desc: 'Piloto de rua com propulsor nas costas e pavio curto.',
    shape: 'runner',
    colors: { body: '#ff5d3b', accent: '#ffd166', visor: '#1b1030', skin: '#ffcf9e' },
    unlock: { type: 'free' },
  },
  {
    id: 'nix',
    name: 'Nix',
    title: 'Fantasma Neon',
    desc: 'Hacker da Cidade Neon. Corpo leve, mente rápida.',
    shape: 'float',
    colors: { body: '#59e1ff', accent: '#c084fc', visor: '#07131f', skin: '#a5f3fc' },
    unlock: { type: 'free' },
  },
  {
    id: 'duke',
    name: 'Duque',
    title: 'Muralha',
    desc: 'Blindagem improvisada com sucata da Fundição.',
    shape: 'tank',
    colors: { body: '#f59e0b', accent: '#7c2d12', visor: '#1c1917', skin: '#fcd34d' },
    unlock: { type: 'free' },
  },
  {
    id: 'mira',
    name: 'Mira',
    title: 'Rastreadora',
    desc: 'Cresceu entre cipós e sabe onde cada atalho esconde perigo.',
    shape: 'scout',
    colors: { body: '#6ee7a8', accent: '#22d3ee', visor: '#052e16', skin: '#dcfce7' },
    unlock: { type: 'races', value: 3 },
  },
  {
    id: 'bolt',
    name: 'Bolt',
    title: 'Circuito Livre',
    desc: 'Um robô de manutenção que aprendeu a correr por esporte.',
    shape: 'bot',
    colors: { body: '#a855f7', accent: '#22d3ee', visor: '#0f0524', skin: '#e9d5ff' },
    unlock: { type: 'races', value: 10 },
  },
  {
    id: 'yuki',
    name: 'Yuki',
    title: 'Lâmina de Gelo',
    desc: 'Desliza pelos Picos Congelados como se fossem um playground.',
    shape: 'scout',
    colors: { body: '#bae6fd', accent: '#6366f1', visor: '#082f49', skin: '#f0f9ff' },
    unlock: { type: 'wins', value: 3 },
  },
  {
    id: 'kaos',
    name: 'KAOS',
    title: 'O Caos Encarnado',
    desc: 'Ninguém sabe de onde veio. Todos sabem quando ele passa.',
    shape: 'chaos',
    colors: { body: '#f472b6', accent: '#facc15', visor: '#3b0764', skin: '#fbcfe8' },
    unlock: { type: 'wins', value: 10 },
  },
  {
    id: 'titan',
    name: 'Titã',
    title: 'Guardião Orbital',
    desc: 'Armadura de estação espacial, motor de foguete e zero paciência.',
    shape: 'tank',
    colors: { body: '#38bdf8', accent: '#f97316', visor: '#020617', skin: '#7dd3fc' },
    unlock: { type: 'achievements', value: 6 },
  },
];

export const CHARACTER_MAP = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
export const DEFAULT_CHARACTER = 'vulcan';

export function isValidCharacter(id) {
  return Object.prototype.hasOwnProperty.call(CHARACTER_MAP, id);
}
