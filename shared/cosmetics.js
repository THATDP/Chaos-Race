// Cosmético compartilhado (só validação no servidor; efeito é visual).
export const TRAILS = [
  { id: 'none', name: 'Sem rastro', color: null, unlock: { type: 'free' } },
  { id: 'spark', name: 'Faíscas', color: '#ffd166', unlock: { type: 'free' } },
  { id: 'neon', name: 'Neon', color: '#59e1ff', unlock: { type: 'races', value: 5 } },
  { id: 'toxic', name: 'Tóxico', color: '#a3e635', unlock: { type: 'wins', value: 1 } },
  { id: 'void', name: 'Vazio', color: '#c084fc', unlock: { type: 'races', value: 20 } },
  { id: 'inferno', name: 'Inferno', color: '#fb7185', unlock: { type: 'wins', value: 5 } },
];

export const ACCESSORIES = [
  { id: 'none', name: 'Nenhum', unlock: { type: 'free' } },
  { id: 'goggles', name: 'Óculos de Corrida', unlock: { type: 'free' } },
  { id: 'antenna', name: 'Antena', unlock: { type: 'races', value: 2 } },
  { id: 'crown', name: 'Coroa do Caos', unlock: { type: 'wins', value: 7 } },
  { id: 'horns', name: 'Chifres', unlock: { type: 'achievements', value: 3 } },
  { id: 'halo', name: 'Halo Orbital', unlock: { type: 'races', value: 15 } },
];

export const SKINS = [
  { id: 'default', name: 'Original', tint: null, unlock: { type: 'free' } },
  { id: 'gold', name: 'Ouro', tint: '#ffd166', unlock: { type: 'wins', value: 2 } },
  { id: 'frost', name: 'Gélido', tint: '#bae6fd', unlock: { type: 'races', value: 8 } },
  { id: 'crimson', name: 'Carmesim', tint: '#fb7185', unlock: { type: 'races', value: 12 } },
  { id: 'shadow', name: 'Sombra', tint: '#3b2f63', unlock: { type: 'races', value: 25 } },
  { id: 'prisma', name: 'Prisma', tint: '#a3e635', unlock: { type: 'wins', value: 12 } },
];

export const EMOTES = [
  { id: 'gg', label: 'GG', icon: '🤝' },
  { id: 'chaos', label: 'CAOS!', icon: '🔥' },
  { id: 'oops', label: 'Ops...', icon: '💥' },
  { id: 'fast', label: 'Muito rápido!', icon: '💨' },
  { id: 'cry', label: 'Chora não', icon: '😭' },
  { id: 'king', label: 'Rei da pista', icon: '👑' },
];

export const COSMETIC_MAP = {
  trails: Object.fromEntries(TRAILS.map((t) => [t.id, t])),
  accessories: Object.fromEntries(ACCESSORIES.map((t) => [t.id, t])),
  skins: Object.fromEntries(SKINS.map((t) => [t.id, t])),
  emotes: Object.fromEntries(EMOTES.map((t) => [t.id, t])),
};

export function isValidCosmetic(kind, id) {
  return !!COSMETIC_MAP[kind]?.[id];
}

export function validCosmetics(raw) {
  const out = { skin: 'default', trail: 'spark', accessory: 'none' };
  if (!raw || typeof raw !== 'object') return out;
  if (isValidCosmetic('skins', raw.skin)) out.skin = raw.skin;
  if (isValidCosmetic('trails', raw.trail)) out.trail = raw.trail;
  if (isValidCosmetic('accessories', raw.accessory)) out.accessory = raw.accessory;
  return out;
}
