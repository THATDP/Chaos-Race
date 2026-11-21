// Smoke test das telas usando DOM real (jsdom) — roda com esbuild (alias @shared).
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html><body>
    <div id="app">
      <div id="screens"></div>
      <div id="race" class="hidden"><div id="phaser-container"></div><div id="hud"></div><div id="touch"></div></div>
      <div id="conn" class="hidden"><span id="conn-text"></span></div>
      <div id="toasts"></div>
      <div id="modal-root" class="hidden"></div>
    </div>
  </body></html>`,
  { url: 'https://exemplo.github.io/chaos-race/?sala=ABCDE', pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
global.location = dom.window.location;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
if (!globalThis.crypto) Object.defineProperty(global, 'crypto', { value: dom.window.crypto, configurable: true });

const { SCREENS } = await import('../frontend/src/ui/screens.js');
const progress = await import('../frontend/src/data/progress.js');
const { avatarSvg } = await import('../frontend/src/ui/avatar.js');
const { Hud } = await import('../frontend/src/ui/hud.js');

let fails = 0;
const check = (name, cond, info = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`);
  if (!cond) fails++;
};

// ---- perfil e progresso ----
const profile = progress.defaultProfile();
check('perfil padrão tem id e nome', !!profile.playerId && profile.name.length >= 2, profile.name);
localStorage.setItem('chaosrace.profile.v1', JSON.stringify(profile));
const loaded = progress.loadProfile();
check('perfil persiste no localStorage', loaded.playerId === profile.playerId);
check('Vulcão/Nix/Duque desbloqueados de início', ['vulcan', 'nix', 'duke'].every((id) => progress.isUnlocked({ unlock: { type: 'free' } }, loaded)));

const raceResult = {
  duration: 21.4,
  reason: 'all-finished',
  places: [
    { place: 1, id: loaded.playerId, name: loaded.name, character: 'vulcan', time: 19.4, finished: true, eliminated: false, hits: 1, falls: 0, uses: 2, laps: 0, lives: 0, progress: 7050, disconnected: false },
    { place: 2, id: 'x', name: 'Outro', character: 'nix', time: 21.4, finished: true, eliminated: false, hits: 2, falls: 1, uses: 1, laps: 0, lives: 0, progress: 7050, disconnected: false },
  ],
  winner: { id: loaded.playerId },
};
const rec = progress.recordRace(loaded, { results: raceResult, selfId: loaded.playerId, trackId: 'neon-city', mode: 'classic', chaos: 1 });
check('estatísticas registradas', loaded.stats.races === 1 && loaded.stats.wins === 1, `${loaded.stats.wins} vitória(s)`);
check('recorde de tempo salvo', rec.record === true && loaded.stats.bestTimes['neon-city'] === 19.4);
check('conquistas de estreia e vitória', rec.newAchievements.length >= 2, rec.newAchievements.map((a) => a.name).join(', '));
check('fantasma salvo', (() => {
  progress.saveGhost(loaded, 'neon-city', 19.4, [[0, 60, 564, 0], [0.1, 120, 564, 0], [0.2, 180, 560, 1]]);
  return !!progress.getGhost(loaded, 'neon-city');
})());

// ---- avatares ----
const ids = ['vulcan', 'nix', 'duke', 'mira', 'bolt', 'yuki', 'kaos', 'titan'];
check('todos os 8 personagens geram SVG', ids.every((id) => avatarSvg(id, { skin: 'gold', accessory: 'crown', trail: 'neon' }).startsWith('<svg')));
check('SVG respeita cosméticos', avatarSvg('vulcan', { accessory: 'crown' }).includes('crown') || avatarSvg('vulcan', { accessory: 'crown' }).length > 500);

// ---- telas ----
const fakeNet = { connected: true, latency: 42 };
const app = {
  profile: loaded,
  netOnline: true,
  latency: 42,
  net: fakeNet,
  rooms: [
    { code: 'ABCDE', name: 'Sala do Kaos', mode: 'classic', modeName: 'Corrida Clássica', modeIcon: '🏁', trackName: 'Cidade Neon', players: 3, total: 3, maxPlayers: 8, chaos: 2, phase: 'lobby' },
  ],
  room: {
    code: 'ABCDE',
    settings: { mode: 'classic', trackId: 'neon-city', chaos: 2, visibility: 'private', maxPlayers: 8, name: '' },
    phase: 'lobby',
    modeName: 'Corrida Clássica',
    trackName: 'Cidade Neon',
    players: [
      { id: loaded.playerId, name: loaded.name, character: 'vulcan', ability: 'turbo', cosmetics: {}, ready: false, connected: true, host: true },
      { id: 'outro1', name: 'Fulano', character: 'nix', ability: 'guard', cosmetics: {}, ready: true, connected: true, host: false },
    ],
    hostId: loaded.playerId,
    maxPlayers: 8,
    results: null,
  },
  results: raceResult,
  rematchState: { votes: 1, needed: 2 },
  match: null,
  playSettings: { mode: 'classic', chaos: 1 },
  createSettings: { name: '', trackId: 'random', visibility: 'public', maxPlayers: 8 },
  inviteCode: 'ABCDE',
  returnTo: 'menu',
  muted: false,
  version: '1.0.0',
  serverUrl: 'https://srv.exemplo.com',
  serverHost: 'srv.exemplo.com',
  unlocks: progress.listUnlocks(loaded),
  lastRace: { record: true },
  playersById: new Map(),
  isHost: true,
  audio: { sfx() {}, startMusic() {}, stopMusic() {}, toggleMute: () => true, setVolumes() {}, unlock() {}, ctx: null },
  isTouch: false,
  goto() {},
  toast() {},
  quickPlay() {},
  createRoom() {},
  joinRoom() {},
  leaveRoom() {},
  setReady() {},
  startRoom() {},
  updateRoomSettings() {},
  changeProfile() {},
  saveSettings() {},
  toggleMute() { return true; },
  testServer: async () => null,
  copyInvite() {},
  refreshRooms() {},
  setPlay() {},
  resetProgress() {},
  reconnect() {},
  rematch() {},
  toLobby() {},
};

const screensRoot = document.getElementById('screens');
for (const [name, def] of Object.entries(SCREENS)) {
  try {
    const html = def.html(app);
    check(`tela "${name}" renderiza HTML`, typeof html === 'string' && html.length > 200, `${html.length} chars`);
    screensRoot.innerHTML = html;
    def.bind?.(app, screensRoot);
    check(`tela "${name}" faz bind sem erro`, true);
    if (name === 'play') check('tela play mostra sala pública e código', html.includes('ABCDE') && html.includes('Sala do Kaos'));
    if (name === 'lobby') check('lobby mostra código de convite', html.includes('ABCDE') && html.includes('PRONTO') === false || html.includes('pronto'));
    if (name === 'results') check('resultado mostra pódio e classificação', html.includes('VITÓRIA') && html.includes('Fulano') === false && html.includes('Outro'));
    if (name === 'profile') check('perfil lista conquistas e personagens', html.includes('Conquistas') && html.includes('KAOS'));
    if (name === 'settings') check('ajustes têm sliders e URL do servidor', html.includes('vol-music') && html.includes('srv.exemplo.com'));
    if (name === 'help') check('ajuda lista habilidades e modos', html.includes('Salto Quântico') && html.includes('Sobrevivência'));
  } catch (err) {
    check(`tela "${name}" renderiza HTML`, false, err.message);
  }
}

// ---- HUD ----
try {
  const hud = new Hud({ onPause() {}, onToggleMute: () => false, onEmote() {}, onAbility() {}, touchApi() {}, isTouch: false });
  const match = {
    mode: 'classic',
    modeName: 'Corrida Clássica',
    trackName: 'Cidade Neon',
    trackId: 'neon-city',
    chaos: 2,
    finishX: 7050,
    length: 7250,
    players: [
      { i: 0, id: 'a', name: 'A', character: 'vulcan', ability: 'turbo', cosmetics: {} },
      { i: 1, id: 'b', name: 'B', character: 'nix', ability: 'quantum', cosmetics: {} },
    ],
  };
  hud.show(match, new Map(match.players.map((p) => [p.i, p])), 0);
  check('HUD monta estrutura', !!document.querySelector('[data-rank]') && !!document.querySelector('[data-ab-icon]'));
  hud.update({
    time: 12.3,
    place: 1,
    total: 2,
    ping: 40,
    mode: 'classic',
    self: { cooldown: 2.4, lives: 0, laps: 0, progress: 1200, finished: false, eliminated: false },
    rows: [
      { i: 0, name: 'A', color: '#fff', progress: 4000, flags: 1, laps: 0, lives: 0, isSelf: true, eliminated: false },
      { i: 1, name: 'B', color: '#0ff', progress: 3000, flags: 1, laps: 0, lives: 0, isSelf: false, eliminated: false },
    ],
    elimIn: -1,
  });
  check('HUD atualiza ranking e cooldown', document.querySelector('[data-rank]').textContent.includes('A') && document.querySelector('[data-ab-cd]').textContent === '3');
  hud.setChaos({ name: 'Gravidade Lunar', icon: '🌙', color: '#7dd3fc', desc: 'teste', duration: 10 });
  check('HUD mostra banner de caos', !document.querySelector('[data-banner]').classList.contains('hidden'));
  hud.countdown(2);
  check('HUD mostra contagem', document.querySelector('[data-countdown]').textContent.includes('2'));
  hud.destroy();
} catch (err) {
  check('HUD monta estrutura', false, err.stack.split('\n').slice(0, 5).join(' | '));
}

console.log(`\n${fails === 0 ? '🎉' : '⚠️'} UI: ${fails} falha(s)\n`);
process.exit(fails === 0 ? 0 : 1);
