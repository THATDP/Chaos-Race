import { CHARACTER_MAP } from '@shared/characters.js';
import { COSMETIC_MAP } from '@shared/cosmetics.js';

// Retrato vetorial dos personagens. O mesmo "shape" é usado no jogo (Phaser),
// garantindo consistência entre menu, lobby e pista.
export function avatarSvg(characterId, cosmetics = {}, opts = {}) {
  const c = CHARACTER_MAP[characterId] || CHARACTER_MAP.vulcan;
  const skin = COSMETIC_MAP.skins[cosmetics.skin] || COSMETIC_MAP.skins.default;
  const acc = COSMETIC_MAP.accessories[cosmetics.accessory] || COSMETIC_MAP.accessories.none;
  const body = skin.tint || c.colors.body;
  const accent = c.colors.accent;
  const visor = c.colors.visor;
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  const eyes = opts.eyes !== false;

  const head = {
    runner: `<path d="M32 44 q0-20 18-20 q18 0 18 20 v8 q0 16-18 16 q-18 0-18-16z" fill="${body}"/>
      <path d="M34 24 q16-12 32 0 l-4 8 q-12-6-24 0z" fill="${accent}"/>`,
    tank: `<rect x="28" y="24" width="44" height="44" rx="10" fill="${body}"/>
      <rect x="24" y="62" width="52" height="18" rx="7" fill="${accent}" opacity="0.85"/>`,
    float: `<circle cx="50" cy="46" r="22" fill="${body}"/>
      <circle cx="50" cy="46" r="22" fill="url(#${id}r)" opacity="0.6"/>`,
    scout: `<path d="M32 50 q0-24 18-24 q18 0 18 24 q0 14-18 14 q-18 0-18-14z" fill="${body}"/>
      <path d="M30 30 l-8-14 l14 4 z" fill="${accent}"/>
      <path d="M70 30 l8-14 l-14 4 z" fill="${accent}"/>`,
    bot: `<rect x="30" y="24" width="40" height="40" rx="8" fill="${body}"/>
      <rect x="40" y="16" width="20" height="8" rx="4" fill="${accent}"/>`,
    chaos: `<path d="M50 20 l10 10 l14-4 l-4 14 l10 10 l-14 4 l-4 14 l-10-10 l-14 4 l4-14 l-10-10 l14-4z" fill="${body}"/>
      <circle cx="50" cy="46" r="11" fill="${accent}" opacity="0.35"/>`,
  }[c.shape] || '';

  const visorShapes = {
    runner: `<rect x="35" y="42" width="30" height="10" rx="4" fill="${visor}"/>`,
    tank: `<rect x="34" y="38" width="32" height="9" rx="3" fill="${visor}"/>`,
    float: `<ellipse cx="50" cy="44" rx="15" ry="9" fill="${visor}"/>`,
    scout: `<path d="M36 44 q14-8 28 0 q-14 8-28 0z" fill="${visor}"/>`,
    bot: `<rect x="37" y="38" width="26" height="12" rx="4" fill="${visor}"/>
      <circle cx="45" cy="44" r="2.4" fill="${accent}"/><circle cx="55" cy="44" r="2.4" fill="${accent}"/>`,
    chaos: `<path d="M38 42 l10 4 l-4 6 l-10-4z" fill="${visor}"/><path d="M62 42 l-10 4 l4 6 l10-4z" fill="${visor}"/>`,
  }[c.shape] || '';

  const accessories = {
    goggles: `<rect x="34" y="36" width="32" height="9" rx="4" fill="${accent}" opacity="0.9"/>
      <rect x="40" y="37.5" width="9" height="6" rx="2" fill="#0b0618" opacity="0.65"/>
      <rect x="52" y="37.5" width="9" height="6" rx="2" fill="#0b0618" opacity="0.65"/>`,
    antenna: `<line x1="50" y1="22" x2="50" y2="10" stroke="${accent}" stroke-width="3"/>
      <circle cx="50" cy="8" r="4" fill="${accent}"/>`,
    crown: `<path d="M34 20 l6-12 l10 8 l10-8 l6 12z" fill="${accent}" stroke="#7a5200" stroke-width="1.2"/>`,
    horns: `<path d="M34 26 q-8-8-4-16 q8 4 10 12z" fill="${accent}"/>
      <path d="M66 26 q8-8 4-16 q-8 4-10 12z" fill="${accent}"/>`,
    halo: `<ellipse cx="50" cy="12" rx="20" ry="6" fill="none" stroke="${accent}" stroke-width="3" opacity="0.9"/>`,
    none: '',
  }[acc.id] || '';

  const eyesMarkup = eyes
    ? c.shape === 'bot'
      ? ''
      : `<circle cx="43" cy="47" r="2" fill="#fff" opacity="0.85"/><circle cx="57" cy="47" r="2" fill="#fff" opacity="0.85"/>`
    : '';

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${c.name}">
    <defs>
      <radialGradient id="${id}r" cx="35%" cy="25%">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.75"/>
        <stop offset="70%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <g>
      <ellipse cx="50" cy="93" rx="30" ry="6" fill="#000" opacity="0.35"/>
      <path d="M24 96 q4-26 26-26 q22 0 26 26z" fill="${accent}" opacity="0.9"/>
      <path d="M38 96 q2-16 12-16 q10 0 12 16z" fill="${body}" opacity="0.95"/>
      ${head}
      ${visorShapes}
      ${eyesMarkup}
      ${accessories}
      <circle cx="76" cy="66" r="4" fill="${accent}" opacity="0.75"/>
    </g>
  </svg>`;
}

export function trailPreview(trailId) {
  const t = COSMETIC_MAP.trails[trailId] || COSMETIC_MAP.trails.spark;
  if (!t.color) return `<div class="trail-chip" style="color:var(--dim)">∅</div>`;
  return `<div class="trail-chip" style="background:radial-gradient(circle, ${t.color}66, transparent 70%);color:${t.color};text-shadow:0 0 12px ${t.color}">✦</div>`;
}
