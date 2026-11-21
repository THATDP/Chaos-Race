import { MODES, CHAOS_LEVELS } from '@shared/modes.js';
import { TRACKS } from '@shared/tracks.js';
import { ABILITIES, ABILITY_MAP } from '@shared/abilities.js';
import { CHARACTERS, CHARACTER_MAP } from '@shared/characters.js';
import { SKINS, TRAILS, ACCESSORIES, EMOTES } from '@shared/cosmetics.js';
import { CHAOS_EVENTS } from '@shared/chaos.js';
import { esc, fmtTime } from './dom.js';
import { avatarSvg, trailPreview } from './avatar.js';
import {
  ACHIEVEMENTS,
  isUnlocked,
  unlockLabel,
  winRate,
} from '../data/progress.js';

const brand = () => `
  <div class="brand">
    <div class="brand__mark">⚡</div>
    <div>
      <span class="brand__name">CHAOS RACE</span>
      <span class="brand__tag">o caos é a pista</span>
    </div>
  </div>`;

function topbar(app, { back = null, title = '', actions = '' } = {}) {
  return `
    <header class="topbar">
      <div class="row" style="gap:14px;min-width:0">
        ${back ? `<button class="btn btn--icon btn--ghost" data-go="${back}" title="Voltar">←</button>` : brand()}
        ${title ? `<span class="badge badge--chaos">${esc(title)}</span>` : ''}
      </div>
      <div class="topbar__actions">${actions}</div>
    </header>`;
}

function onlinePill(app) {
  const on = app.netOnline;
  return `<span class="badge ${on ? 'badge--live' : ''}" title="${on ? 'Conectado ao servidor' : 'Servidor offline'}">
    ${on ? '● ONLINE' : '● OFFLINE'} · ${app.latency}ms</span>`;
}

function characterCard(app) {
  const p = app.profile;
  const c = CHARACTER_MAP[p.character] || CHARACTER_MAP.vulcan;
  const ability = ABILITY_MAP[p.ability] || ABILITY_MAP.turbo;
  const plural = p.stats.races === 1 ? '' : 's';
  return `
    <div class="player-card__head">
      <div class="player-card__avatar">${avatarSvg(p.character, p.cosmetics)}</div>
      <div style="min-width:0">
        <div class="player-card__name">${esc(p.name)}</div>
        <div class="player-card__sub">${esc(c.name)} · ${esc(c.title)}</div>
        <div class="row" style="margin-top:6px;gap:5px">
          <span class="badge">${ability.icon} ${esc(ability.name)}</span>
          <span class="badge">🏆 ${p.achievements.length}/${ACHIEVEMENTS.length}</span>
        </div>
      </div>
    </div>
    <div class="field">
      <label for="name-input">Seu nome (2–16 caracteres)</label>
      <input id="name-input" class="input" maxlength="16" value="${esc(p.name)}" placeholder="Piloto" />
    </div>
    <div class="stats-mini">
      <div class="stat-mini"><b>${p.stats.races}</b><span>Corridas</span></div>
      <div class="stat-mini"><b>${p.stats.wins}</b><span>Vitórias</span></div>
      <div class="stat-mini"><b>${winRate(p)}%</b><span>Aproveit.</span></div>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn btn--sm grow" data-go="profile">🎨 Personalizar</button>
      <button class="btn btn--sm grow" data-go="help">❓ Como jogar</button>
    </div>
    <p class="note">${p.stats.races === 0 ? 'Primeira corrida? Você começa com Vulcão, Nix e Duque liberados.' : `${p.stats.races} corrida${plural} no histórico local.`}</p>
  `;
}

// ---------------------------------------------------------------------------
export const SCREENS = {
  menu: {
    html(app) {
      const stats = app.profile.stats;
      return `
      <div class="screen" data-screen="menu">
        ${topbar(app, {
          actions: `${onlinePill(app)}
            <button class="btn btn--ghost btn--sm" data-go="profile">Perfil</button>
            <button class="btn btn--ghost btn--sm" data-go="settings">Ajustes</button>
            <button class="btn btn--icon btn--ghost" data-act="mute" title="Ligar/desligar som">${app.muted ? '🔇' : '🔊'}</button>`,
        })}
        <section class="hero">
          <div class="hero__copy">
            <span class="kicker"><span class="dot"></span> MULTIPLAYER ONLINE · 2 A 8 JOGADORES</span>
            <h1 class="hero__title">CHAOS<br/>RACE<span>O CAOS É A PISTA</span></h1>
            <p class="hero__lede">Corrida 2D em <strong>5 pistas vivas</strong>, <strong>6 habilidades</strong> e eventos que viram a prova de cabeça para baixo. Salas públicas, salas privadas com código e revanche instantânea.</p>
            <div class="hero__cta">
              <button class="btn btn--primary btn--lg" data-act="quick">▶ Jogar agora</button>
              <button class="btn btn--lg" data-go="play">Salas e código</button>
            </div>
            <div class="hero__meta">
              <span>Servidor: <b>${esc(app.serverHost || 'não configurado')}</b></span>
              <span>Corridas: <b>${stats.races}</b></span>
              <span>Vitórias: <b>${stats.wins}</b></span>
              <span>Conquistas: <b>${app.profile.achievements.length}/${ACHIEVEMENTS.length}</b></span>
            </div>
            <div class="feature-chips">
              <span class="chip">🌆 Cidade Neon</span>
              <span class="chip">🔥 Fundição</span>
              <span class="chip">🌿 Floresta</span>
              <span class="chip">🏔️ Picos</span>
              <span class="chip">🛰️ Orbital</span>
            </div>
          </div>
          <aside class="panel panel--glow player-card">${characterCard(app)}</aside>
        </section>
        <footer class="row" style="justify-content:space-between;margin-top:auto">
          <span class="note">Grátis, sem cadastro e sem vantagem paga. Só o caos decide.</span>
          <span class="note">v${app.version} · Phaser 3 + Socket.IO</span>
        </footer>
      </div>`;
    },
    bind(app, root) {
      bindName(app, root);
      root.querySelector('[data-act="quick"]')?.addEventListener('click', () => app.quickPlay());
    },
  },

  play: {
    html(app) {
      const s = app.playSettings;
      const rooms = app.rooms;
      return `
      <div class="screen" data-screen="play">
        ${topbar(app, {
          back: 'menu',
          title: 'Salas e partidas',
          actions: `${onlinePill(app)}<button class="btn btn--icon btn--ghost" data-act="mute">${app.muted ? '🔇' : '🔊'}</button>`,
        })}
        <div class="rooms-layout">
          <div style="display:flex;flex-direction:column;gap:20px;min-width:0">
            <section class="panel">
              <h2 class="panel__title">Escolha o modo</h2>
              <div class="option-grid">
                ${MODES.map(
                  (m) => `
                  <button class="option ${s.mode === m.id ? 'is-active' : ''}" data-mode="${m.id}">
                    <span class="option__top"><span class="option__icon">${m.icon}</span>${esc(m.name)}</span>
                    <span class="option__desc">${esc(m.desc)}</span>
                    <span class="option__tag">${esc(m.tag)}</span>
                  </button>`,
                ).join('')}
              </div>
              <div class="divider" style="margin:16px 0"></div>
              <h2 class="panel__title">Nível de caos</h2>
              <div class="option-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
                ${CHAOS_LEVELS.map(
                  (c) => `
                  <button class="option ${s.chaos === c.id ? 'is-active' : ''}" data-chaos="${c.id}" style="min-height:70px">
                    <span class="option__top">${c.id === 0 ? '🚫' : '🌪️'.repeat(Math.min(3, c.id))} ${esc(c.name)}</span>
                    <span class="option__desc">${esc(c.desc)}</span>
                  </button>`,
                ).join('')}
              </div>
              <div class="row" style="margin-top:16px">
                <button class="btn btn--primary grow" data-act="quick">⚡ Entrar na fila rápida</button>
                <button class="btn grow" data-act="refresh">↻ Atualizar salas</button>
              </div>
              <p class="note" style="margin-top:10px">A fila rápida entra em uma sala pública com vaga ou cria uma nova com as regras acima.</p>
            </section>

            <section class="panel">
              <div class="spread">
                <h2 class="panel__title" style="margin:0">Salas públicas</h2>
                <span class="badge">${rooms.length} aberta${rooms.length === 1 ? '' : 's'}</span>
              </div>
              <div class="rooms-list" style="margin-top:12px">
                ${
                  rooms.length
                    ? rooms
                        .map(
                          (r) => `
                  <div class="room-row">
                    <div class="room-row__icon">${r.modeIcon || '🏁'}</div>
                    <div style="min-width:0">
                      <div class="room-row__name">${esc(r.name)}
                        ${r.chaos > 0 ? '<span class="badge badge--chaos">caos ' + r.chaos + '</span>' : ''}
                        ${r.players >= r.maxPlayers ? '<span class="badge">cheia</span>' : '<span class="badge badge--live">vaga</span>'}
                      </div>
                      <div class="room-row__meta">${esc(r.modeName)} · ${esc(r.trackName)} · código <b class="mono">${esc(r.code)}</b></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px">
                      <span class="players-pip">👥 ${r.players}/${r.maxPlayers}</span>
                      <button class="btn btn--sm btn--primary" data-join="${esc(r.code)}">Entrar</button>
                    </div>
                  </div>`,
                        )
                        .join('')
                    : `<div class="empty-state">Nenhuma sala pública aberta agora.<br/>Crie uma sala ou use a fila rápida — quem entrar cai direto com você.</div>`
                }
              </div>
            </section>
          </div>

          <div style="display:flex;flex-direction:column;gap:20px;min-width:0">
            <section class="panel panel--glow">
              <h2 class="panel__title">Entrar com código</h2>
              <div class="field">
                <label for="code-input">Código de convite</label>
                <input id="code-input" class="input code-input" maxlength="6" placeholder="ABCDE" autocomplete="off" spellcheck="false" value="${esc(app.inviteCode || '')}" />
              </div>
              <button class="btn btn--primary btn--block" style="margin-top:12px" data-act="join-code">Entrar na sala</button>
              <p class="note" style="margin-top:10px">Quem criou a sala vê o código no lobby e pode copiar o link de convite.</p>
            </section>

            <section class="panel">
              <h2 class="panel__title">Criar sala</h2>
              <div class="field" style="margin-bottom:10px">
                <label for="room-name">Nome da sala (opcional)</label>
                <input id="room-name" class="input" maxlength="28" placeholder="Ex.: Caos dos amigos" value="${esc(app.createSettings.name || '')}" />
              </div>
              <div class="field" style="margin-bottom:10px">
                <label for="room-track">Pista</label>
                <select id="room-track" class="select">
                  <option value="random" ${app.createSettings.trackId === 'random' ? 'selected' : ''}>🎲 Aleatória</option>
                  ${TRACKS.map(
                    (t) => `<option value="${t.id}" ${app.createSettings.trackId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`,
                  ).join('')}
                </select>
              </div>
              <div class="row" style="gap:10px">
                <div class="field grow">
                  <label for="room-vis">Visibilidade</label>
                  <select id="room-vis" class="select">
                    <option value="public" ${app.createSettings.visibility === 'public' ? 'selected' : ''}>Pública</option>
                    <option value="private" ${app.createSettings.visibility === 'private' ? 'selected' : ''}>Privada (código)</option>
                  </select>
                </div>
                <div class="field" style="width:110px">
                  <label for="room-max">Jogadores</label>
                  <select id="room-max" class="select">
                    ${[2, 3, 4, 5, 6, 7, 8]
                      .map((n) => `<option value="${n}" ${app.createSettings.maxPlayers === n ? 'selected' : ''}>${n}</option>`)
                      .join('')}
                  </select>
                </div>
              </div>
              <button class="btn btn--lime btn--block" style="margin-top:14px" data-act="create">+ Criar e entrar</button>
              <p class="note" style="margin-top:10px">Você entra como anfitrião. A partida começa quando todos marcarem “pronto”.</p>
            </section>
          </div>
        </div>
      </div>`;
    },
    bind(app, root) {
      root.querySelectorAll('[data-mode]').forEach((el) =>
        el.addEventListener('click', () => app.setPlay({ mode: el.dataset.mode })),
      );
      root.querySelectorAll('[data-chaos]').forEach((el) =>
        el.addEventListener('click', () => app.setPlay({ chaos: Number(el.dataset.chaos) })),
      );
      root.querySelectorAll('[data-join]').forEach((el) =>
        el.addEventListener('click', () => app.joinRoom(el.dataset.join)),
      );
      root.querySelector('[data-act="quick"]')?.addEventListener('click', () => app.quickPlay());
      root.querySelector('[data-act="refresh"]')?.addEventListener('click', () => app.refreshRooms());
      root.querySelector('[data-act="join-code"]')?.addEventListener('click', () => {
        const code = root.querySelector('#code-input').value.trim().toUpperCase();
        if (!code) return app.toast('Digite um código de convite.', 'error');
        app.joinRoom(code);
      });
      root.querySelector('#code-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') root.querySelector('[data-act="join-code"]')?.click();
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      });
      root.querySelector('#room-name')?.addEventListener('input', (e) => {
        app.createSettings.name = e.target.value.slice(0, 28);
      });
      root.querySelector('#room-track')?.addEventListener('change', (e) => {
        app.createSettings.trackId = e.target.value;
      });
      root.querySelector('#room-vis')?.addEventListener('change', (e) => {
        app.createSettings.visibility = e.target.value;
      });
      root.querySelector('#room-max')?.addEventListener('change', (e) => {
        app.createSettings.maxPlayers = Number(e.target.value);
      });
      root.querySelector('[data-act="create"]')?.addEventListener('click', () => app.createRoom());
    },
  },

  lobby: {
    html(app) {
      const room = app.room;
      if (!room) {
        return `<div class="screen">${topbar(app, { back: 'menu' })}<div class="empty-state">Sala indisponível. <button class="btn btn--sm" data-go="play">Voltar</button></div></div>`;
      }
      const me = room.players.find((p) => p.id === app.profile.playerId);
      const isHost = me?.host;
      const s = room.settings;
      const mode = MODES.find((m) => m.id === s.mode) || MODES[0];
      const slots = [];
      slots.push(...room.players);
      const emptySlots = Math.max(0, Math.min(room.maxPlayers, 8) - room.players.length);
      const connected = room.players.filter((p) => p.connected);
      const allReady = connected.length >= mode.minPlayers && connected.every((p) => p.ready);
      const inviteUrl = `${location.origin}${location.pathname}?sala=${room.code}`;

      return `
      <div class="screen" data-screen="lobby">
        ${topbar(app, {
          back: 'play',
          title: `Sala ${room.code}`,
          actions: `${onlinePill(app)}
            <button class="btn btn--sm btn--danger" data-act="leave">Sair</button>`,
        })}
        <div class="lobby-head">
          <div class="lobby-code">
            <div>
              <div class="tiny muted" style="letter-spacing:.18em;text-transform:uppercase">Código de convite</div>
              <div class="code-chip">${esc(room.code)}</div>
            </div>
            <button class="btn btn--sm" data-act="copy-code">Copiar código</button>
            <button class="btn btn--sm" data-act="copy-link">Copiar link</button>
          </div>
          <div class="row">
            <span class="badge badge--chaos">${mode.icon} ${esc(mode.name)}</span>
            <span class="badge">${esc(room.trackName)}</span>
            <span class="badge">${s.visibility === 'private' ? '🔒 Privada' : '🌐 Pública'}</span>
            <span class="badge">${room.players.filter((p) => p.connected).length}/${room.maxPlayers} conectados</span>
          </div>
        </div>

        <div class="lobby-grid">
          <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
            <section class="panel">
              <h2 class="panel__title">Jogadores</h2>
              <div class="player-slots">
                ${slots
                  .map((p) => {
                    const c = CHARACTER_MAP[p.character] || CHARACTER_MAP.vulcan;
                    const ab = ABILITY_MAP[p.ability] || ABILITY_MAP.turbo;
                    const isMe = p.id === app.profile.playerId;
                    return `<div class="slot ${isMe ? 'slot--me' : ''} ${p.ready ? 'slot--ready' : ''}">
                      ${p.host ? '<span class="slot__host" title="Anfitrião">👑</span>' : ''}
                      ${p.ready ? '<span class="slot__ready">pronto</span>' : ''}
                      <div class="slot__avatar">${avatarSvg(p.character, p.cosmetics)}</div>
                      <div class="slot__name">${esc(p.name)}${isMe ? ' <span class="tiny muted">(você)</span>' : ''}</div>
                      <div class="slot__tags">
                        <span class="badge">${esc(c.name)}</span>
                        <span class="badge">${ab.icon} ${esc(ab.name.split(' ')[0])}</span>
                      </div>
                      ${!p.connected ? '<div class="slot__offline">desconectado</div>' : ''}
                    </div>`;
                  })
                  .join('')}
                ${Array.from({ length: emptySlots })
                  .map(() => '<div class="slot slot--empty">vaga livre</div>')
                  .join('')}
              </div>
              <div class="row" style="margin-top:16px;justify-content:space-between">
                <p class="note" style="margin:0">
                  ${mode.solo ? 'Modo solo: comece quando quiser.' : allReady ? 'Todo mundo pronto — a contagem começa!' : 'Todos precisam marcar PRONTO para a corrida começar automaticamente.'}
                </p>
                <div class="row">
                  ${isHost ? `<button class="btn" data-act="start" ${connected.length >= mode.minPlayers ? '' : 'disabled'}>▶ Iniciar agora</button>` : ''}
                  <button class="btn ${me?.ready ? '' : 'btn--primary'}" data-act="ready">${me?.ready ? 'Cancelar pronto' : '✔ Estou pronto'}</button>
                </div>
              </div>
            </section>

            <section class="panel">
              <h2 class="panel__title">Seu personagem e habilidade</h2>
              <div class="item-grid" style="margin-bottom:14px">
                ${CHARACTERS.slice(0, 8)
                  .map((c) => {
                    const unlocked = isUnlocked(c, app.profile);
                    return `<button class="item ${app.profile.character === c.id ? 'is-equipped' : ''} ${unlocked ? '' : 'is-locked'}" data-char="${c.id}" ${unlocked ? '' : 'disabled'} title="${esc(c.name)} — ${unlocked ? esc(c.title) : 'Desbloqueie: ' + unlockLabel(c.unlock)}">
                      <div class="item__avatar">${avatarSvg(c.id, app.profile.cosmetics)}</div>
                      <span class="item__name">${esc(c.name)}</span>
                      ${unlocked ? '' : `<span class="item__req">🔒 ${unlockLabel(c.unlock)}</span>`}
                    </button>`;
                  })
                  .join('')}
              </div>
              <div class="ability-pick">
                ${ABILITIES.map(
                  (a) => `<button class="ability-opt ${app.profile.ability === a.id ? 'is-active' : ''}" data-ab="${a.id}">
                    <b>${a.icon} ${esc(a.name)}</b><span>${esc(a.desc)}</span>
                  </button>`,
                ).join('')}
              </div>
              <div class="row" style="margin-top:12px">
                <button class="btn btn--sm" data-go="profile">🎨 Skins, rastros e acessórios</button>
              </div>
            </section>
          </div>

          <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
            <section class="panel">
              <h2 class="panel__title">Regras da sala ${isHost ? '(você manda)' : ''}</h2>
              <fieldset ${isHost ? '' : 'disabled'} style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;opacity:${isHost ? 1 : 0.65}">
                <div class="field">
                  <label for="s-mode">Modo</label>
                  <select id="s-mode" class="select">
                    ${MODES.map((m) => `<option value="${m.id}" ${s.mode === m.id ? 'selected' : ''}>${m.icon} ${esc(m.name)}</option>`).join('')}
                  </select>
                </div>
                <div class="field">
                  <label for="s-track">Pista</label>
                  <select id="s-track" class="select">
                    <option value="random" ${s.trackId === 'random' ? 'selected' : ''}>🎲 Aleatória</option>
                    ${TRACKS.map((t) => `<option value="${t.id}" ${s.trackId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                  </select>
                </div>
                <div class="field">
                  <label for="s-chaos">Nível de caos</label>
                  <select id="s-chaos" class="select">
                    ${CHAOS_LEVELS.map((c) => `<option value="${c.id}" ${s.chaos === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                  </select>
                </div>
                <div class="row" style="gap:10px">
                  <div class="field grow">
                    <label for="s-vis">Visibilidade</label>
                    <select id="s-vis" class="select">
                      <option value="public" ${s.visibility === 'public' ? 'selected' : ''}>Pública</option>
                      <option value="private" ${s.visibility === 'private' ? 'selected' : ''}>Privada</option>
                    </select>
                  </div>
                  <div class="field" style="width:112px">
                    <label for="s-max">Máx.</label>
                    <select id="s-max" class="select">
                      ${[2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${s.maxPlayers === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </fieldset>
              ${isHost ? '' : '<p class="note" style="margin-top:10px">Só o anfitrião pode alterar as regras.</p>'}
            </section>

            <section class="panel">
              <h2 class="panel__title">Pista: ${esc(room.trackName)}</h2>
              <p class="note">${esc(TRACKS.find((t) => t.id === s.trackId)?.subtitle || 'Uma pista sorteada entre as cinco disponíveis.')}</p>
              <div class="divider"></div>
              <div class="row" style="justify-content:space-between">
                <span class="note">Link de convite:</span>
                <button class="btn btn--sm" data-act="copy-link">Copiar</button>
              </div>
              <p class="mono tiny" style="word-break:break-all;color:var(--dim)">${esc(inviteUrl)}</p>
            </section>
          </div>
        </div>
      </div>`;
    },
    bind(app, root) {
      const room = app.room;
      if (!room) return;
      root.querySelectorAll('[data-char]').forEach((el) =>
        el.addEventListener('click', () => app.changeProfile({ character: el.dataset.char })),
      );
      root.querySelectorAll('[data-ab]').forEach((el) =>
        el.addEventListener('click', () => app.changeProfile({ ability: el.dataset.ab })),
      );
      root.querySelector('[data-act="ready"]')?.addEventListener('click', () => {
        const me = app.room?.players.find((p) => p.id === app.profile.playerId);
        app.setReady(!me?.ready);
      });
      root.querySelector('[data-act="start"]')?.addEventListener('click', () => app.startRoom());
      root.querySelector('[data-act="leave"]')?.addEventListener('click', () => app.leaveRoom());
      root.querySelector('[data-act="copy-code"]')?.addEventListener('click', () => app.copyInvite('code'));
      root.querySelectorAll('[data-act="copy-link"]').forEach((el) =>
        el.addEventListener('click', () => app.copyInvite('link')),
      );
      const apply = () => {
        app.updateRoomSettings({
          mode: root.querySelector('#s-mode')?.value,
          trackId: root.querySelector('#s-track')?.value,
          chaos: Number(root.querySelector('#s-chaos')?.value),
          visibility: root.querySelector('#s-vis')?.value,
          maxPlayers: Number(root.querySelector('#s-max')?.value),
        });
      };
      for (const id of ['s-mode', 's-track', 's-chaos', 's-vis', 's-max']) {
        root.querySelector(`#${id}`)?.addEventListener('change', apply);
      }
    },
  },

  results: {
    html(app) {
      const r = app.results;
      if (!r) {
        return `<div class="screen">${topbar(app, { back: 'play' })}<div class="empty-state">Sem resultado para mostrar.</div></div>`;
      }
      const me = r.places.find((p) => p.id === app.profile.playerId);
      const won = me?.place === 1;
      const podium = r.places.slice(0, 3);
      const medals = ['🥇', '🥈', '🥉'];
      return `
      <div class="screen" data-screen="results">
        ${topbar(app, { back: 'menu', title: r.trackName, actions: `${onlinePill(app)}` })}
        <div class="results-head">
          <h1 class="results-title">${won ? 'VITÓRIA!' : me ? `${me.place}º LUGAR` : 'FIM DA CORRIDA'}</h1>
          <p class="results-sub">${esc(r.modeName)} · ${esc(r.trackName)} · ${r.reason === 'all-finished' ? 'todos cruzaram a linha' : r.reason === 'timeout' ? 'tempo esgotado' : r.reason === 'last-standing' ? 'último de pé' : 'corrida encerrada'} · ${fmtTime(r.duration)}</p>
          ${app.lastRace?.record ? '<span class="badge badge--live" style="font-size:.7rem">⏱ NOVO RECORDE DA PISTA!</span>' : ''}
        </div>

        <div class="podium">
          ${podium
            .map((p) => {
              const meta = app.playersById?.get(p.id) || {};
              return `<div class="podium__card podium__card--${p.place}">
                <span class="podium__medal">${medals[p.place - 1]}</span>
                <div class="podium__avatar">${avatarSvg(p.character || meta.character || 'vulcan', meta.cosmetics || {})}</div>
                <div class="podium__name">${esc(p.name)}</div>
                <div class="podium__time">${p.finished ? fmtTime(p.time) : p.eliminated ? 'eliminado' : `${Math.round(p.progress)}m`}</div>
                <div class="podium__tag">${p.lives != null && r.mode === 'survival' ? `${p.lives} vidas` : `${p.hits} impactos · ${p.falls} quedas`}</div>
              </div>`;
            })
            .join('')}
        </div>

        <div class="grid-2">
          <section class="panel" style="grid-column:1/-1">
            <h2 class="panel__title">Classificação completa</h2>
            <div class="places">
              ${r.places
                .map(
                  (p) => `<div class="place ${p.id === app.profile.playerId ? 'place--me' : ''}">
                    <span class="place__pos">${p.place}º</span>
                    <span class="place__name">${esc(p.name)}${p.id === app.profile.playerId ? ' <span class="badge">você</span>' : ''}${p.disconnected ? ' <span class="badge">saiu</span>' : ''}${p.eliminated ? ' <span class="badge">☠</span>' : ''}</span>
                    <span class="place__stat">💥 ${p.hits} · 🕳 ${p.falls} · ⚡ ${p.uses}</span>
                    <span class="place__stat">${p.laps ? `volta ${p.laps + 1}` : ''}${r.mode === 'survival' ? ` · ❤️ ${p.lives}` : ''}</span>
                    <span class="place__time">${p.finished ? fmtTime(p.time) : '—'}</span>
                  </div>`,
                )
                .join('')}
            </div>
          </section>
        </div>

        <div class="row" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn--primary btn--lg" data-act="rematch">🔁 Revanche <span class="badge" data-votes>${app.rematchState?.votes || 0}/${app.rematchState?.needed || 1}</span></button>
          ${app.isHost ? '<button class="btn btn--lg" data-act="lobby">Voltar ao lobby</button>' : ''}
          <button class="btn btn--lg btn--danger" data-act="leave">Sair da sala</button>
        </div>
        <p class="note center">A revanche começa quando todos votarem. A sala continua no mesmo código: <b class="mono">${esc(app.room?.code || '')}</b></p>
      </div>`;
    },
    bind(app, root) {
      root.querySelector('[data-act="rematch"]')?.addEventListener('click', () => app.rematch());
      root.querySelector('[data-act="lobby"]')?.addEventListener('click', () => app.toLobby());
      root.querySelector('[data-act="leave"]')?.addEventListener('click', () => app.leaveRoom());
    },
  },

  profile: {
    html(app) {
      const p = app.profile;
      const st = p.stats;
      const unlocked = app.unlocks;
      const equipGrid = (kind, items, renderItem) => `
        <div class="item-grid">
          ${items
            .map((item) => {
              const open = isUnlocked(item, p);
              const equipped = kind === 'character' ? p.character === item.id : p.cosmetics[kind] === item.id;
              return `<button class="item ${equipped ? 'is-equipped' : ''} ${open ? '' : 'is-locked'}" data-equip="${kind}:${item.id}" ${open ? '' : 'disabled'}>
                ${renderItem(item, open)}
                <span class="item__name">${esc(item.name)}</span>
                ${open ? (equipped ? '<span class="item__req" style="color:var(--lime)">equipado</span>' : '') : `<span class="item__req">🔒 ${unlockLabel(item.unlock)}</span>`}
              </button>`;
            })
            .join('')}
        </div>`;

      return `
      <div class="screen" data-screen="profile">
        ${topbar(app, { back: app.returnTo || 'menu', title: 'Perfil e coleção', actions: onlinePill(app) })}
        <div class="panel panel--glow">
          <div class="row" style="gap:20px;align-items:center;flex-wrap:wrap">
            <div class="player-card__avatar" style="width:110px;height:110px">${avatarSvg(p.character, p.cosmetics)}</div>
            <div style="flex:1;min-width:200px">
              <div class="player-card__name" style="font-size:1.5rem">${esc(p.name)}</div>
              <div class="player-card__sub">${esc(CHARACTER_MAP[p.character].name)} · ${esc(CHARACTER_MAP[p.character].title)}</div>
              <div class="row" style="margin-top:8px;gap:6px">
                <span class="badge badge--live">🏆 ${p.achievements.length}/${ACHIEVEMENTS.length} conquistas</span>
                <span class="badge">🕒 ${Math.round(st.playTime / 60)} min em pista</span>
                <span class="badge">📏 ${Math.round(st.distance / 1000)} km</span>
              </div>
            </div>
            <div class="stats-mini" style="min-width:260px">
              <div class="stat-mini"><b>${st.races}</b><span>Corridas</span></div>
              <div class="stat-mini"><b>${st.wins}</b><span>Vitórias</span></div>
              <div class="stat-mini"><b>${winRate(p)}%</b><span>Aproveit.</span></div>
            </div>
          </div>
        </div>

        <div class="grid-2">
          <section class="panel">
            <h2 class="panel__title">Personagens (só cosmético — equilíbrio igual para todos)</h2>
            ${equipGrid('character', CHARACTERS, (c, open) => `<div class="item__avatar">${avatarSvg(c.id, p.cosmetics)}</div>`)}
          </section>
          <section class="panel">
            <h2 class="panel__title">Skins</h2>
            ${equipGrid('skin', SKINS, (s) => `<div class="item__avatar">${avatarSvg(p.character, { ...p.cosmetics, skin: s.id })}</div>`)}
            <div class="divider"></div>
            <h2 class="panel__title">Rastros</h2>
            ${equipGrid('trail', TRAILS, (t) => trailPreview(t.id))}
          </section>
          <section class="panel">
            <h2 class="panel__title">Acessórios</h2>
            ${equipGrid('accessory', ACCESSORIES, (a) => `<div class="item__avatar">${avatarSvg(p.character, { ...p.cosmetics, accessory: a.id })}</div>`)}
          </section>
          <section class="panel">
            <h2 class="panel__title">Melhores tempos</h2>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${TRACKS.map((t) => {
                const best = st.bestTimes[t.id];
                const ghost = p.ghosts[t.id];
                return `<div class="spread" style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)">
                  <span style="font-size:.82rem">${esc(t.name)}</span>
                  <span class="mono tiny" style="color:${best ? 'var(--cyan)' : 'var(--dim)'}">${best ? fmtTime(best) : '—'}${ghost ? ' 👻' : ''}</span>
                </div>`;
              }).join('')}
            </div>
            <p class="note" style="margin-top:10px">👻 = fantasma salvo no modo Contra o Tempo.</p>
          </section>
        </div>

        <section class="panel">
          <h2 class="panel__title">Conquistas</h2>
          <div class="achievements">
            ${ACHIEVEMENTS.map(
              (a) => `<div class="achv ${p.achievements.includes(a.id) ? 'achv--done' : ''}">
                <span class="achv__icon">${a.icon}</span>
                <div>
                  <div class="achv__name">${esc(a.name)}</div>
                  <div class="achv__desc">${esc(a.desc)}</div>
                </div>
              </div>`,
            ).join('')}
          </div>
        </section>
      </div>`;
    },
    bind(app, root) {
      root.querySelectorAll('[data-equip]').forEach((el) =>
        el.addEventListener('click', () => {
          const [kind, id] = el.dataset.equip.split(':');
          if (kind === 'character') app.changeProfile({ character: id });
          else app.changeProfile({ cosmetics: { ...app.profile.cosmetics, [kind]: id } });
        }),
      );
    },
  },

  settings: {
    html(app) {
      const s = app.profile.settings;
      return `
      <div class="screen" data-screen="settings">
        ${topbar(app, { back: app.returnTo || 'menu', title: 'Ajustes', actions: onlinePill(app) })}
        <div class="grid-2">
          <section class="panel">
            <h2 class="panel__title">Áudio</h2>
            <div class="field" style="margin-bottom:14px">
              <label for="vol-music">Música — ${Math.round(s.music * 100)}%</label>
              <input id="vol-music" class="range" type="range" min="0" max="1" step="0.05" value="${s.music}" />
            </div>
            <div class="field">
              <label for="vol-sfx">Efeitos — ${Math.round(s.sfx * 100)}%</label>
              <input id="vol-sfx" class="range" type="range" min="0" max="1" step="0.05" value="${s.sfx}" />
            </div>
            <div class="divider" style="margin:14px 0"></div>
            <div class="switch-row">
              <div>
                <div style="font-weight:700;font-size:.86rem">Silenciar tudo</div>
                <div class="note">Atalho: tecla M</div>
              </div>
              <button class="switch ${app.muted ? 'is-on' : ''}" data-act="mute" aria-label="Silenciar"></button>
            </div>
            <div class="switch-row">
              <div>
                <div style="font-weight:700;font-size:.86rem">Mostrar nomes dos jogadores</div>
                <div class="note">Desligue para uma tela mais limpa</div>
              </div>
              <button class="switch ${s.showNames ? 'is-on' : ''}" data-act="names" aria-label="Mostrar nomes"></button>
            </div>
          </section>

          <section class="panel">
            <h2 class="panel__title">Desempenho</h2>
            <div class="field">
              <label for="quality">Qualidade visual</label>
              <select id="quality" class="select">
                <option value="auto" ${s.quality === 'auto' ? 'selected' : ''}>Automática (recomendada)</option>
                <option value="high" ${s.quality === 'high' ? 'selected' : ''}>Alta — mais partículas</option>
                <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Baixa — PCs modestos</option>
              </select>
            </div>
            <p class="note" style="margin-top:10px">A qualidade baixa desliga partículas extras, estrelas e detalhes de cenário. A física e a rede são idênticas em qualquer ajuste.</p>
            <div class="divider" style="margin:14px 0"></div>
            <div class="field">
              <label for="server-url">URL do servidor multiplayer</label>
              <input id="server-url" class="input" placeholder="https://seu-servidor.onrender.com" value="${esc(s.serverUrl || '')}" />
            </div>
            <div class="row" style="margin-top:10px">
              <button class="btn btn--sm btn--primary" data-act="server-save">Salvar e reconectar</button>
              <button class="btn btn--sm" data-act="server-test">Testar</button>
            </div>
            <p class="note" style="margin-top:10px">Atual: <b class="mono">${esc(app.serverHost || 'não configurado')}</b>. Em produção use a URL do Render (ex.: <span class="mono">https://chaos-race.onrender.com</span>).</p>
          </section>

          <section class="panel">
            <h2 class="panel__title">Identidade</h2>
            <div class="field">
              <label for="settings-name">Seu nome</label>
              <input id="settings-name" class="input" maxlength="16" value="${esc(app.profile.name)}" />
            </div>
            <p class="note" style="margin-top:8px">Seu ID de jogador (usado para reconexão) é salvo apenas neste navegador.</p>
            <div class="divider" style="margin:14px 0"></div>
            <button class="btn btn--danger btn--block" data-act="reset">Apagar progresso local</button>
          </section>

          <section class="panel">
            <h2 class="panel__title">Controles</h2>
            <div class="keys">
              <kbd>A</kbd><span>ou <kbd>←</kbd> — frear / voltar</span>
              <kbd>D</kbd><span>ou <kbd>→</kbd> — acelerar</span>
              <kbd>Espaço</kbd><span>ou <kbd>W</kbd>/<kbd>↑</kbd> — pular (segure para pulo mais alto)</span>
              <kbd>S</kbd><span>ou <kbd>↓</kbd> — deslizar / queda rápida</span>
              <kbd>E</kbd><span>ou <kbd>Shift</kbd> — habilidade</span>
              <kbd>1–6</kbd><span>emotes</span>
              <kbd>Esc</kbd><span>menu da partida</span>
            </div>
          </section>
        </div>
      </div>`;
    },
    bind(app, root) {
      root.querySelector('#vol-music')?.addEventListener('input', (e) => {
        app.saveSettings({ music: Number(e.target.value) });
        root.querySelector('label[for="vol-music"]').textContent = `Música — ${Math.round(Number(e.target.value) * 100)}%`;
      });
      root.querySelector('#vol-sfx')?.addEventListener('input', (e) => {
        app.saveSettings({ sfx: Number(e.target.value) });
        root.querySelector('label[for="vol-sfx"]').textContent = `Efeitos — ${Math.round(Number(e.target.value) * 100)}%`;
        app.audio.sfx('ui');
      });
      root.querySelectorAll('[data-act="mute"]').forEach((el) =>
        el.addEventListener('click', () => {
          app.toggleMute();
          el.classList.toggle('is-on');
        }),
      );
      root.querySelector('[data-act="names"]')?.addEventListener('click', (e) => {
        app.saveSettings({ showNames: !app.profile.settings.showNames });
        e.currentTarget.classList.toggle('is-on');
      });
      root.querySelector('#quality')?.addEventListener('change', (e) => {
        app.saveSettings({ quality: e.target.value });
        app.toast('Qualidade aplicada na próxima corrida.', 'info');
      });
      root.querySelector('#settings-name')?.addEventListener('change', (e) => {
        const v = e.target.value.trim();
        if (v.length < 2) return app.toast('O nome precisa de pelo menos 2 caracteres.', 'error');
        app.changeProfile({ name: v });
        app.toast('Nome atualizado.', 'success');
      });
      root.querySelector('[data-act="server-save"]')?.addEventListener('click', () => {
        const url = root.querySelector('#server-url').value.trim().replace(/\/$/, '');
        app.saveSettings({ serverUrl: url });
        app.reconnect(url);
      });
      root.querySelector('[data-act="server-test"]')?.addEventListener('click', async () => {
        const url = root.querySelector('#server-url').value.trim().replace(/\/$/, '') || app.serverUrl;
        const res = await app.testServer(url);
        app.toast(res ? `Servidor OK · ${res.version} · ${res.players ?? 0} jogadores` : 'Servidor não respondeu.', res ? 'success' : 'error');
      });
      root.querySelector('[data-act="reset"]')?.addEventListener('click', () => app.resetProgress());
    },
  },

  help: {
    html(app) {
      return `
      <div class="screen" data-screen="help">
        ${topbar(app, { back: app.returnTo || 'menu', title: 'Como jogar', actions: onlinePill(app) })}
        <div class="grid-2">
          <section class="panel">
            <h2 class="panel__title">Controles</h2>
            <div class="keys">
              <kbd>D</kbd><span>Acelerar (segure para ganhar velocidade)</span>
              <kbd>A</kbd><span>Frear / voltar</span>
              <kbd>Espaço</kbd><span>Pular — segurar dá pulo mais alto, soltar corta</span>
              <kbd>S</kbd><span>Deslizar no chão / queda rápida no ar</span>
              <kbd>E</kbd><span>Usar habilidade</span>
              <kbd>1–6</kbd><span>Emotes</span>
            </div>
            <p class="note" style="margin-top:12px">No celular/tablet, botões na tela aparecem automaticamente.</p>
            <div class="divider" style="margin:12px 0"></div>
            <h2 class="panel__title">Dicas de pista</h2>
            <ul class="note" style="line-height:1.7;padding-left:18px">
              <li>Deslizar mantém velocidade e passa por vãos baixos.</li>
              <li>Checkpoints devolvem você à pista em vez de eliminar.</li>
              <li>Atalhos superiores costumam ter perigos — valem a pena em disputa.</li>
              <li>Plataformas intermitentes piscam: observe o ritmo antes de saltar.</li>
              <li>O escudo de íon absorve um impacto e ainda dá 1,2s de invulnerabilidade.</li>
            </ul>
          </section>

          <section class="panel">
            <h2 class="panel__title">Habilidades</h2>
            <div class="ability-list">
              ${ABILITIES.map(
                (a) => `<div class="ability-row">
                  <span class="ability-row__icon">${a.icon}</span>
                  <div>
                    <div class="ability-row__name" style="color:${a.color}">${esc(a.name)} <span class="tiny muted">· recarga ${a.cooldown}s</span></div>
                    <div class="ability-row__desc">${esc(a.desc)}</div>
                  </div>
                </div>`,
              ).join('')}
            </div>
          </section>

          <section class="panel">
            <h2 class="panel__title">Modos</h2>
            <div class="ability-list">
              ${MODES.map(
                (m) => `<div class="ability-row">
                  <span class="ability-row__icon">${m.icon}</span>
                  <div>
                    <div class="ability-row__name">${esc(m.name)} <span class="tiny muted">· ${esc(m.tag)}</span></div>
                    <div class="ability-row__desc">${esc(m.desc)}</div>
                  </div>
                </div>`,
              ).join('')}
            </div>
          </section>

          <section class="panel">
            <h2 class="panel__title">Eventos de caos</h2>
            <div class="ability-list">
              ${CHAOS_EVENTS.map(
                (e) => `<div class="ability-row">
                  <span class="ability-row__icon">${e.icon}</span>
                  <div>
                    <div class="ability-row__name" style="color:${e.color}">${esc(e.name)}</div>
                    <div class="ability-row__desc">${esc(e.desc)}</div>
                  </div>
                </div>`,
              ).join('')}
            </div>
            <p class="note" style="margin-top:10px">Os eventos afetam todos os jogadores por igual e são gerados pelo servidor — não são aleatórios no seu cliente.</p>
          </section>

          <section class="panel" style="grid-column:1/-1">
            <h2 class="panel__title">Multiplayer de verdade</h2>
            <div class="grid-2">
              <p class="note">
                O servidor roda a simulação a <b>60 Hz</b> e envia snapshots <b>20 vezes por segundo</b>. Seu personagem é
                simulado localmente com <b>predição</b> e corrigido com <b>reconciliação</b>; os outros jogadores usam
                <b>interpolação</b>. O servidor é quem decide velocidade, colisões, habilidades, eventos e o resultado —
                o cliente nunca declara vitória.
              </p>
              <p class="note">
                Hospedagem gratuita: o backend no <b>Render</b> pode hibernar após inatividade (o primeiro acesso pode levar
                ~50s). O frontend fica no <b>GitHub Pages</b>. Latência depende da sua conexão e da distância até o servidor —
                não há garantia de latência zero. Salas vazias são limpas automaticamente.
              </p>
            </div>
          </section>
        </div>
      </div>`;
    },
    bind() {},
  },
};

function bindName(app, root) {
  const input = root.querySelector('#name-input');
  if (!input) return;
  const commit = () => {
    const v = input.value.trim();
    if (v.length >= 2 && v !== app.profile.name) {
      app.changeProfile({ name: v });
    } else if (v.length < 2) {
      input.value = app.profile.name;
      app.toast('O nome precisa ter 2 a 16 caracteres.', 'error');
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
}
