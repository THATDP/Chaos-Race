import './styles.css';
import Phaser from 'phaser';
import { NetClient, resolveServerUrl } from './net/client.js';
import { AudioEngine } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { RaceScene } from './game/scene.js';
import { SCREENS } from './ui/screens.js';
import { toast, modal, copyText } from './ui/dom.js';
import {
  loadProfile,
  saveProfile,
  recordRace,
  resetProfile,
  getGhost,
  saveGhost,
  listUnlocks,
} from './data/progress.js';

const VERSION = '1.0.0';

const state = {
  screen: 'menu',
  returnTo: 'menu',
  profile: loadProfile(),
  rooms: [],
  room: null,
  match: null,
  results: null,
  lastRace: null,
  rematch: { votes: 0, needed: 1 },
  playSettings: { mode: 'classic', chaos: 1 },
  createSettings: { name: '', trackId: 'random', visibility: 'public', maxPlayers: 8 },
  inviteCode: '',
  netOnline: false,
  muted: false,
  playersById: new Map(),
  unlocks: null,
};

const profile = state.profile;
let audio = new AudioEngine(profile.settings);
let serverUrl = resolveServerUrl(profile);
let net = null;
let phaserGame = null;
let hud = null;
let scene = null;
let roomsTimer = null;
let helloPending = false;

const isTouch =
  'ontouchstart' in window || (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches);

function qualityMode() {
  const q = profile.settings.quality || 'auto';
  if (q !== 'auto') return q;
  const cores = navigator.hardwareConcurrency || 4;
  if (isTouch && cores <= 6) return 'low';
  return cores <= 4 ? 'low' : 'high';
}

function serverHost() {
  if (!serverUrl) return '';
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}

// ---------------------------------------------------------------------------
// Infra de UI
// ---------------------------------------------------------------------------
const screensRoot = document.getElementById('screens');
const raceRoot = document.getElementById('race');
const connEl = document.getElementById('conn');
const connText = document.getElementById('conn-text');

function render() {
  if (state.screen === 'race') return;
  const def = SCREENS[state.screen] || SCREENS.menu;
  try {
    screensRoot.innerHTML = def.html(app);
    def.bind?.(app, screensRoot);
  } catch (err) {
    console.error('erro ao renderizar tela', err);
    screensRoot.innerHTML = `<div class="screen"><div class="empty-state">Algo deu errado ao montar a tela.<br/><button class="btn btn--sm" onclick="location.reload()">Recarregar</button></div></div>`;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  updateMusic();
}

function goto(name) {
  if (name === 'race') return;
  if (['profile', 'settings', 'help'].includes(name) && state.screen !== 'race') {
    state.returnTo = state.room ? 'lobby' : state.screen === name ? state.returnTo : state.screen;
  }
  state.screen = name;
  render();
}

function updateMusic() {
  if (!audio.ctx) return;
  if (state.screen === 'race') return;
  if (state.screen === 'results') {
    if (dbgMusic !== 'results') {
      dbgMusic = 'results';
      audio.startMusic('results');
    }
    return;
  }
  if (dbgMusic !== 'menu') {
    dbgMusic = 'menu';
    audio.startMusic('menu');
  }
}
let dbgMusic = null;

function setConnectedUi() {
  if (!connEl) return;
  if (state.netOnline && !helloPending) {
    connEl.classList.add('hidden');
    connEl.classList.remove('conn--offline');
    return;
  }
  connEl.classList.remove('hidden');
  connEl.classList.toggle('conn--offline', !state.netOnline || helloPending);
  connText.textContent = !state.netOnline
    ? serverUrl
      ? 'Reconectando ao servidor…'
      : 'Servidor não configurado — abra Ajustes'
    : 'Entrando no servidor…';
}

// ---------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------
function attachHandlers(client) {
  client.on('connect', async () => {
    state.netOnline = true;
    helloPending = true;
    setConnectedUi();
    try {
      const ack = await client.emitAck('hello', {
        name: profile.name,
        playerId: profile.playerId,
        profile: { character: profile.character, ability: profile.ability, cosmetics: profile.cosmetics },
      });
      if (ack?.ok) {
        if (ack.playerId && ack.playerId !== profile.playerId) {
          profile.playerId = ack.playerId;
          saveProfile(profile);
        }
        client.socket.emit('room:list', {}, (res) => {
          if (res?.rooms) state.rooms = res.rooms;
        });
        if (state.room?.code) {
          const rej = await client.emitAck('room:rejoin', { code: state.room.code });
          if (!rej?.ok) {
            state.room = null;
            cleanupMatch();
            toast('A sala não existe mais. Você voltou ao menu.', 'error');
            goto('play');
          } else {
            toast('Reconectado à sala.', 'success');
          }
        }
      } else {
        toast(ack?.error || 'Não foi possível registrar seu nome.', 'error');
      }
    } finally {
      helloPending = false;
      setConnectedUi();
      if (state.screen !== 'race') render();
    }
  });

  client.on('disconnect', () => {
    state.netOnline = false;
    setConnectedUi();
    if (state.screen === 'race') toast('Conexão perdida — tentando reconectar…', 'error', 4200);
  });

  client.on('connect_error', () => {
    state.netOnline = false;
    setConnectedUi();
  });

  const sock = client.socket;

  sock.on('room:state', (roomState) => {
    const wasLobby = state.room?.phase;
    state.room = roomState;
    state.rematch = { votes: 0, needed: Math.max(1, roomState.players.filter((p) => p.connected).length) };
    if (roomState.phase === 'lobby' && ['menu', 'play', 'results', 'lobby'].includes(state.screen)) {
      state.screen = 'lobby';
      render();
    } else if (state.screen === 'lobby' || state.screen === 'results') {
      render();
    } else if (wasLobby !== roomState.phase) {
      render();
    }
  });

  sock.on('room:list', (data) => {
    state.rooms = data?.rooms || [];
    if (state.screen === 'play') render();
  });

  sock.on('room:error', (data) => {
    toast(data?.msg || 'Erro na sala.', 'error');
  });

  sock.on('room:gone', () => {
    state.room = null;
    cleanupMatch();
    toast('A sala foi encerrada.', 'error');
    goto('play');
  });

  sock.on('room:left', () => {
    state.room = null;
    cleanupMatch();
    goto('menu');
  });

  sock.on('room:rematchState', (data) => {
    state.rematch = data || { votes: 0, needed: 1 };
    if (state.screen === 'results') {
      const el = screensRoot.querySelector('[data-votes]');
      if (el) el.textContent = `${state.rematch.votes}/${state.rematch.needed}`;
    }
  });

  sock.on('match:start', (payload) => startMatch(payload));
  sock.on('match:snapshot', (snap) => {
    if (!scene) return;
    try {
      scene.handleSnapshot(snap);
    } catch (err) {
      console.error('snapshot', err);
    }
  });
  sock.on('match:fx', (fx) => scene?.handleFx(fx));
  sock.on('match:go', () => scene?.handleGo());
  sock.on('match:notice', (n) => hud?.notice(n?.msg || ''));
  sock.on('match:resync', (data) => {
    if (data?.snapshot && scene) scene.handleSnapshot(data.snapshot);
  });
  sock.on('match:end', (results) => endMatch(results));
  sock.on('match:aborted', () => {
    toast('A partida foi encerrada.', 'error');
    cleanupMatch();
    goto('menu');
  });

  client.on('server:info', () => {});
}

function connectNet(url) {
  if (net) {
    try {
      net.socket.removeAllListeners();
      net.disconnect();
    } catch {
      /* ignora */
    }
  }
  serverUrl = url;
  if (!serverUrl) {
    state.netOnline = false;
    setConnectedUi();
    return;
  }
  net = new NetClient(serverUrl).connect();
  state.netOnline = false;
  setConnectedUi();
  attachHandlers(net);
}

// ---------------------------------------------------------------------------
// Ciclo de partida
// ---------------------------------------------------------------------------
function startMatch(payload) {
  if (!payload?.players?.length) return;
  if (phaserGame && state.match?.matchId === payload.matchId) return;
  cleanupMatch();
  state.match = payload;
  state.results = null;
  state.lastRace = null;
  state.playersById = new Map(payload.players.map((p) => [p.id, p]));
  state.screen = 'race';
  screensRoot.classList.add('hidden');
  raceRoot.classList.remove('hidden');
  raceRoot.setAttribute('aria-hidden', 'false');
  audio.stopMusic();
  audio.startMusic(payload.trackId);

  hud = new Hud({
    onPause: openPauseMenu,
    onToggleMute: toggleMute,
    onEmote: (id) => net?.emit('match:emote', { id }),
    onAbility: () => scene?.useAbility(),
    touchApi: (key, val) => scene?.setTouch(key, val),
    isTouch,
  });

  const session = {
    match: payload,
    selfId: profile.playerId,
    quality: qualityMode(),
    ghost: getGhost(profile, payload.trackId),
    audio,
    hud,
    sendInputs: (batch) => net?.emit('match:input', batch),
    useAbility: () => net?.emit('match:ability'),
    emote: (id) => net?.emit('match:emote', { id }),
    getPing: () => net?.latency || 0,
    onPause: openPauseMenu,
    scene: null,
  };

  const container = document.getElementById('phaser-container');
  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#05020e',
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
    render: { antialias: true, powerPreference: 'high-performance', roundPixels: false },
    fps: { target: 60 },
    scene: [],
    callbacks: {
      postBoot: (game) => {
        game.scene.add('RaceScene', RaceScene, true, session);
        scene = game.scene.getScene('RaceScene');
        session.scene = scene;
      },
    },
  });
}

function endMatch(results) {
  if (!state.match) return;
  const samples = scene?.recordSamples ? [...scene.recordSamples] : [];
  state.results = results;
  state.rematch = { votes: 0, needed: Math.max(1, state.room?.players?.filter((p) => p.connected).length || 1) };

  // Estatísticas locais
  const raceInfo = recordRace(profile, {
    results,
    selfId: profile.playerId,
    trackId: state.match.trackId,
    mode: state.match.mode,
    chaos: state.match.chaos,
  });
  state.lastRace = { record: raceInfo.record, achievements: raceInfo.newAchievements };

  // Fantasma do modo Contra o Tempo
  if (state.match.mode === 'timeattack') {
    const me = results?.places?.find((p) => p.id === profile.playerId);
    if (me?.finished && me.time != null && samples.length > 2) {
      if (saveGhost(profile, state.match.trackId, me.time, samples)) {
        toast('Fantasma salvo! Corra contra você mesmo na próxima.', 'success', 3800);
      }
    }
  }

  saveProfile(profile);
  state.unlocks = listUnlocks(profile);

  for (const ach of raceInfo.newAchievements) {
    toast(`${ach.icon} Conquista: ${ach.name}`, 'success', 5000);
  }

  audio.stopMusic();
  audio.sfx(results?.winner?.id === profile.playerId ? 'win' : 'finish');

  screensRoot.classList.remove('hidden');
  raceRoot.classList.add('hidden');
  raceRoot.setAttribute('aria-hidden', 'true');
  state.screen = 'results';
  setTimeout(() => {
    destroyGame();
    if (state.results) render();
    audio.startMusic('results');
  }, 60);
}

function destroyGame() {
  hud?.destroy();
  hud = null;
  scene = null;
  if (phaserGame) {
    try {
      phaserGame.destroy(true);
    } catch {
      /* ignora */
    }
    phaserGame = null;
  }
  const container = document.getElementById('phaser-container');
  if (container) container.innerHTML = '';
}

function cleanupMatch() {
  destroyGame();
  state.match = null;
  state.results = null;
  screensRoot.classList.remove('hidden');
  raceRoot.classList.add('hidden');
  raceRoot.setAttribute('aria-hidden', 'true');
  audio.stopMusic();
}

async function openPauseMenu() {
  const leave = await modal({
    title: 'Pausa',
    body: 'Sua corrida continua no servidor enquanto este menu está aberto. Você quer voltar para a pista ou sair da sala?',
    confirm: 'Sair da sala',
    cancel: 'Voltar ao jogo',
  });
  if (leave) leaveRoom(true);
  else scene?.input?.keyboard?.resetKeys?.();
}

// ---------------------------------------------------------------------------
// Ações da interface
// ---------------------------------------------------------------------------
async function ensureSession() {
  if (!net) {
    toast('Servidor não configurado. Abra Ajustes e informe a URL do servidor.', 'error', 5200);
    return false;
  }
  if (!state.netOnline) {
    toast('Sem conexão com o servidor. Aguarde a reconexão.', 'error');
    return false;
  }
  return true;
}

function quickPlay() {
  if (!ensureSession()) return;
  audio.sfx('ui');
  net.emitAck('room:quick', { settings: state.playSettings }).then((res) => {
    if (!res?.ok) return toast(res?.error || 'Não foi possível entrar na fila.', 'error');
    if (res.created) toast('Sala criada. Compartilhe o código com seus amigos!', 'info', 4200);
  });
}

function createRoom() {
  if (!ensureSession()) return;
  net.emitAck('room:create', {
    settings: {
      ...state.createSettings,
      mode: state.playSettings.mode,
      chaos: state.playSettings.chaos,
    },
  }).then((res) => {
    if (!res?.ok) return toast(res?.error || 'Não foi possível criar a sala.', 'error');
  });
}

function joinRoom(code) {
  if (!ensureSession()) return;
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 4) return toast('Código inválido.', 'error');
  net.emitAck('room:join', { code: clean }).then((res) => {
    if (!res?.ok) return toast(res?.error || 'Sala não encontrada.', 'error');
  });
}

function leaveRoom(force = false) {
  if (!force && state.screen === 'results') {
    net?.emit('room:leave');
    return;
  }
  net?.emit('room:leave');
  cleanupMatch();
  goto('menu');
}

function setReady(value) {
  net?.emit('room:ready', { ready: value });
  audio.sfx('ui');
}

function updateRoomSettings(patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) if (v !== undefined && v !== null) clean[k] = v;
  net?.emit('room:settings', { settings: clean });
}

function changeProfile(patch) {
  Object.assign(profile, patch);
  if (patch.cosmetics) profile.cosmetics = { ...profile.cosmetics, ...patch.cosmetics };
  if (patch.name) profile.name = patch.name.slice(0, 16);
  saveProfile(profile);
  state.unlocks = listUnlocks(profile);
  if (net?.connected) {
    net.emit('hello', {
      name: profile.name,
      playerId: profile.playerId,
      profile: { character: profile.character, ability: profile.ability, cosmetics: profile.cosmetics },
    });
    net.emit('room:profile', {
      profile: { character: profile.character, ability: profile.ability, cosmetics: profile.cosmetics },
    });
  }
  if (state.screen !== 'race') render();
}

function saveSettings(patch) {
  profile.settings = { ...profile.settings, ...patch };
  saveProfile(profile);
  audio.setVolumes({ music: profile.settings.music, sfx: profile.settings.sfx });
  if (patch.quality) {
    /* aplica na próxima partida */
  }
}

function toggleMute() {
  state.muted = audio.toggleMute();
  return state.muted;
}

async function testServer(url) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function copyInvite(kind) {
  if (!state.room) return;
  const code = state.room.code;
  const value = kind === 'code' ? code : `${location.origin}${location.pathname}?sala=${code}`;
  const ok = await copyText(value);
  toast(ok ? (kind === 'code' ? 'Código copiado!' : 'Link de convite copiado!') : 'Copie manualmente: ' + value, ok ? 'success' : 'info');
}

function refreshRooms() {
  if (!net?.connected) return;
  net.socket.emit('room:list', {}, (res) => {
    state.rooms = res?.rooms || [];
    if (state.screen === 'play') render();
  });
}

function setPlay(patch) {
  Object.assign(state.playSettings, patch);
  render();
}

async function resetProgressAction() {
  const ok = await modal({
    title: 'Apagar progresso',
    body: 'Isso apaga estatísticas, conquistas, recordes e fantasmas salvos neste navegador. Não dá para desfazer.',
    confirm: 'Apagar tudo',
    cancel: 'Cancelar',
  });
  if (!ok) return;
  resetProfile();
  location.reload();
}

function reconnect(url) {
  connectNet(url);
  toast('Aplicando novo servidor…', 'info');
}

// ---------------------------------------------------------------------------
// App exposto às telas
// ---------------------------------------------------------------------------
const app = {
  get profile() {
    return profile;
  },
  get netOnline() {
    return state.netOnline;
  },
  get latency() {
    return net?.latency || 0;
  },
  get rooms() {
    return state.rooms;
  },
  get room() {
    return state.room;
  },
  get results() {
    return state.results;
  },
  get rematchState() {
    return state.rematch;
  },
  get match() {
    return state.match;
  },
  get playSettings() {
    return state.playSettings;
  },
  get createSettings() {
    return state.createSettings;
  },
  get inviteCode() {
    return state.inviteCode;
  },
  get returnTo() {
    return state.returnTo;
  },
  get muted() {
    return state.muted;
  },
  get version() {
    return VERSION;
  },
  get serverUrl() {
    return serverUrl;
  },
  get serverHost() {
    return serverHost();
  },
  get unlocks() {
    return state.unlocks || listUnlocks(profile);
  },
  get lastRace() {
    return state.lastRace;
  },
  get playersById() {
    return state.playersById;
  },
  get isHost() {
    return !!state.room?.players?.find((p) => p.id === profile.playerId)?.host;
  },
  get audio() {
    return audio;
  },
  get isTouch() {
    return isTouch;
  },
  goto,
  toast: (msg, type = 'info', ttl) => toast(msg, type, ttl),
  quickPlay,
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  startRoom: () => net?.emit('room:start'),
  updateRoomSettings,
  changeProfile,
  saveSettings,
  toggleMute,
  testServer,
  copyInvite,
  refreshRooms,
  setPlay,
  resetProgress: resetProgressAction,
  reconnect,
  rematch: () => {
    net?.emit('room:rematch');
    audio.sfx('ui');
  },
  toLobby: () => net?.emit('room:lobby'),
};

window.__chaos = app;

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
function boot() {
  const params = new URLSearchParams(location.search);
  const invite = params.get('sala') || params.get('room');
  if (invite) {
    state.inviteCode = invite.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    state.screen = 'play';
    setConnectedUi();
  }
  state.unlocks = listUnlocks(profile);
  render();
  setConnectedUi();

  if (serverUrl) {
    connectNet(serverUrl);
  } else {
    state.netOnline = false;
    setConnectedUi();
    toast('Servidor não configurado. Abra Ajustes → URL do servidor.', 'error', 6500);
  }

  // autoplay de áudio só depois do primeiro gesto
  const unlock = () => {
    audio.unlock();
    audio.setVolumes({ music: profile.settings.music, sfx: profile.settings.sfx });
    updateMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // clique genérico = som de interface
  document.addEventListener('click', (e) => {
    if (e.target.closest('button')) audio.sfx('ui');
  });

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const muted = toggleMute();
      toast(muted ? 'Som desligado' : 'Som ligado', 'info', 1200);
      if (state.screen !== 'race') render();
    }
  });

  window.addEventListener('beforeunload', () => {
    try {
      net?.emit('room:leave');
    } catch {
      /* ignora */
    }
  });

  // lista de salas: atualiza sozinha enquanto o jogador procura
  roomsTimer = setInterval(() => {
    if (state.screen === 'play' && net?.connected) refreshRooms();
  }, 6000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.sfx('ui');
  });
}

boot();
