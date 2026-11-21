import { ABILITY_MAP } from '@shared/abilities.js';
import { EMOTES } from '@shared/cosmetics.js';
import { esc, fmtTime } from './dom.js';
import { CHARACTER_MAP } from '@shared/characters.js';

export class Hud {
  constructor({ onPause, onToggleMute, onEmote, onAbility, touchApi, isTouch }) {
    this.root = document.getElementById('hud');
    this.touchRoot = document.getElementById('touch');
    this.onPause = onPause;
    this.onToggleMute = onToggleMute;
    this.onEmote = onEmote;
    this.onAbility = onAbility;
    this.touchApi = touchApi;
    this.isTouch = isTouch;
    this.bannerUntil = 0;
    this.bannerDuration = 1;
    this.rankSig = '';
    this.noticeTimer = null;
    this.countdownTimer = null;
    this.muted = false;
    this.match = null;
  }

  show(match, playersMeta, selfIndex) {
    this.match = match;
    this.playersMeta = playersMeta;
    this.selfIndex = selfIndex;
    this.root.innerHTML = `
      <div class="hud__top">
        <div class="row" style="gap:8px">
          <div class="hud-pill hud-pill--mode">${esc(match.modeName)}</div>
          <div class="hud-pill">⏱ <b data-time>0.0</b></div>
          <div class="hud-pill" data-place-pill>🏁 <b data-place>–</b>/<span data-total>${match.players.length}</span></div>
          <div class="hud-pill hidden" data-lives-pill>❤️ <b data-lives>3</b></div>
          <div class="hud-pill hidden" data-lap-pill>🔁 <b data-lap>1</b></div>
          <div class="hud-pill hidden" data-elim-pill>☠️ <b data-elim>–</b></div>
        </div>
        <div class="hud-right">
          <div class="hud-pill" data-ping-pill>📶 <b data-ping>0</b>ms</div>
          <button class="hud-btn" data-act="mute" title="Som (M)">🔊</button>
          <button class="hud-btn" data-act="pause" title="Menu (Esc)">⏸</button>
        </div>
      </div>
      <div class="rank" data-rank></div>
      <div class="minimap">
        <div class="minimap__track"></div>
        <div class="minimap__finish"></div>
        <div data-dots></div>
      </div>
      <div class="hud-bottom">
        <div class="ability-box">
          <div class="ability-icon" data-ab-icon>
            <span data-ab-emoji>⚡</span>
            <div class="ability-icon__cd hidden" data-ab-cd></div>
          </div>
          <div class="ability-meta">
            <b data-ab-name>Turbo</b>
            <span data-ab-key>E / Shift</span>
          </div>
        </div>
        <div class="row" style="gap:8px;align-items:center">
          <div class="emote-bar" data-emotes></div>
          <div class="hud-pill" data-track-name>${esc(match.trackName)}</div>
        </div>
      </div>
      <div class="chaos-banner hidden" data-banner>
        <div class="chaos-banner__icon" data-banner-icon>🌪️</div>
        <div style="min-width:0">
          <div class="chaos-banner__name" data-banner-name>CAOS</div>
          <div class="chaos-banner__desc" data-banner-desc></div>
          <div class="chaos-timer"><i data-banner-bar></i></div>
        </div>
      </div>
      <div class="countdown hidden" data-countdown></div>
      <div class="hud-notice hidden" data-notice></div>
      <div class="countdown hidden" data-eliminated>
        <div style="text-align:center">
          <div class="countdown__label" style="font-size:clamp(2rem,6vw,4rem);background:linear-gradient(90deg,#ff4d6d,#ff2fb9);-webkit-background-clip:text;background-clip:text;color:transparent">ELIMINADO</div>
          <div class="muted tiny" style="margin-top:8px">assistindo a corrida…</div>
        </div>
      </div>
    `;

    this.q = (sel) => this.root.querySelector(sel);
    this.elTime = this.q('[data-time]');
    this.elPlace = this.q('[data-place]');
    this.elTotal = this.q('[data-total]');
    this.elPing = this.q('[data-ping]');
    this.elRank = this.q('[data-rank]');
    this.elDots = this.q('[data-dots]');
    this.elAbIcon = this.q('[data-ab-icon]');
    this.elAbEmoji = this.q('[data-ab-emoji]');
    this.elAbCd = this.q('[data-ab-cd]');
    this.elAbName = this.q('[data-ab-name]');
    this.elBanner = this.q('[data-banner]');
    this.elBannerBar = this.q('[data-banner-bar]');
    this.elCountdown = this.q('[data-countdown]');
    this.elNotice = this.q('[data-notice]');
    this.elEliminated = this.q('[data-eliminated]');
    this.elLivesPill = this.q('[data-lives-pill]');
    this.elLives = this.q('[data-lives]');
    this.elLapPill = this.q('[data-lap-pill]');
    this.elLap = this.q('[data-lap]');
    this.elElimPill = this.q('[data-elim-pill]');
    this.elElim = this.q('[data-elim]');

    const ability = ABILITY_MAP[match.players.find((p) => p.i === selfIndex)?.ability] || ABILITY_MAP.turbo;
    this.elAbEmoji.textContent = ability.icon;
    this.elAbName.textContent = ability.name;
    this.elAbIcon.style.borderColor = ability.color;
    this.elAbName.style.color = ability.color;

    // emotes
    const emoteBar = this.q('[data-emotes]');
    this.match.emotes = EMOTES;
    emoteBar.innerHTML = EMOTES.map(
      (e, i) => `<button class="emote-btn" data-emote="${e.id}" title="${esc(e.label)} (${i + 1})">${e.icon}</button>`,
    ).join('');
    emoteBar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-emote]');
      if (btn) this.onEmote?.(btn.dataset.emote);
    });

    this.q('[data-act="pause"]').addEventListener('click', () => this.onPause?.());
    this.q('[data-act="mute"]').addEventListener('click', (e) => {
      this.muted = this.onToggleMute?.();
      e.currentTarget.textContent = this.muted ? '🔇' : '🔊';
    });

    this.buildDots(match.players);
    this.buildTouch();
    this.elCountdown.innerHTML = `<div class="countdown__num">3</div>`;
    this.elCountdown.classList.remove('hidden');
  }

  buildDots(players) {
    this.elDots.innerHTML = players
      .map((p) => {
        const color = (CHARACTER_MAP[p.character] || CHARACTER_MAP.vulcan).colors.accent;
        return `<div class="minimap__dot${p.i === this.selfIndex ? ' minimap__dot--me' : ''}" data-dot="${p.i}" style="left:0%;background:${color}" title="${esc(p.name)}"></div>`;
      })
      .join('');
    this.dotEls = new Map();
    this.elDots.querySelectorAll('[data-dot]').forEach((el) => this.dotEls.set(Number(el.dataset.dot), el));
  }

  buildTouch() {
    if (!this.touchRoot) return;
    if (!this.isTouch) {
      this.touchRoot.classList.add('hidden');
      return;
    }
    this.touchRoot.classList.remove('hidden');
    this.touchRoot.innerHTML = `
      <div class="touch__side">
        <button class="touch__btn" data-touch="left" aria-label="Esquerda">◀</button>
        <button class="touch__btn" data-touch="right" aria-label="Direita">▶</button>
      </div>
      <div class="touch__side">
        <button class="touch__btn touch__btn--ability" data-touch="ability" aria-label="Habilidade">⚡</button>
        <button class="touch__btn" data-touch="slide" aria-label="Deslizar">▼</button>
        <button class="touch__btn" data-touch="jump" aria-label="Pular">▲</button>
      </div>`;
    const bind = (el, on) => {
      const start = (e) => {
        e.preventDefault();
        el.classList.add('is-held');
        on(true);
      };
      const end = (e) => {
        e.preventDefault();
        el.classList.remove('is-held');
        on(false);
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
    };
    this.touchRoot.querySelectorAll('[data-touch]').forEach((el) => {
      const key = el.dataset.touch;
      if (key === 'ability') {
        bind(el, (v) => {
          if (v) this.onAbility?.();
        });
      } else {
        bind(el, (v) => this.touchApi?.(key, v));
      }
    });
  }

  countdown(n) {
    if (!this.elCountdown) return;
    this.elCountdown.classList.remove('hidden');
    this.elCountdown.innerHTML = `<div class="countdown__num">${n}</div>`;
  }

  go() {
    if (!this.elCountdown) return;
    this.elCountdown.innerHTML = `<div class="countdown__label">VAI!</div>`;
    clearTimeout(this.countdownTimer);
    this.countdownTimer = setTimeout(() => this.elCountdown.classList.add('hidden'), 750);
  }

  setChaos(ev) {
    if (!this.elBanner) return;
    this.elBanner.classList.remove('hidden');
    this.elBanner.style.setProperty('--chaos-color', ev.color || '#ff2fb9');
    this.q('[data-banner-icon]').textContent = ev.icon || '🌪️';
    this.q('[data-banner-name]').textContent = (ev.name || 'CAOS').toUpperCase();
    this.q('[data-banner-desc]').textContent = ev.desc || '';
    this.bannerUntil = performance.now() + Math.min(8000, (ev.duration || 8) * 1000);
    this.bannerDuration = Math.min(8000, (ev.duration || 8) * 1000);
    // reinicia animação
    this.elBanner.style.animation = 'none';
    void this.elBanner.offsetWidth;
    this.elBanner.style.animation = '';
  }

  notice(msg, ttl = 2000) {
    if (!this.elNotice) return;
    this.elNotice.textContent = msg;
    this.elNotice.classList.remove('hidden');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.elNotice.classList.add('hidden'), ttl);
  }

  selfFinished(place) {
    if (!this.elCountdown) return;
    this.elCountdown.classList.remove('hidden');
    const suffix = place === 1 ? 'º LUGAR — VITÓRIA!' : 'º LUGAR';
    this.elCountdown.innerHTML = `<div style="text-align:center"><div class="countdown__label" style="font-size:clamp(2rem,7vw,5rem)">${place}${suffix}</div><div class="muted tiny" style="margin-top:10px">aguardando os outros jogadores…</div></div>`;
    this.countdownTimer = setTimeout(() => this.elCountdown.classList.add('hidden'), 3200);
  }

  eliminated() {
    this.elEliminated?.classList.remove('hidden');
  }

  update(state) {
    if (!this.elTime) return;
    this.elTime.textContent = fmtTime(state.time);
    this.elPlace.textContent = state.place || '–';
    this.elTotal.textContent = state.total;
    this.elPing.textContent = state.ping ?? 0;

    if (state.place === 1) this.elPlace.style.color = 'var(--amber)';
    else this.elPlace.style.color = 'var(--cyan)';

    // vidas / voltas / eliminação
    if (state.mode === 'survival') {
      this.elLivesPill.classList.remove('hidden');
      this.elLives.textContent = Math.max(0, state.self.lives);
    }
    if (state.mode === 'elimination' || state.mode === 'survival') {
      this.elLapPill.classList.remove('hidden');
      this.elLap.textContent = state.self.laps + 1;
    }
    if (state.mode === 'elimination' && state.elimIn >= 0) {
      this.elElimPill.classList.remove('hidden');
      this.elElim.textContent = `${Math.ceil(state.elimIn)}s`;
    }

    // ranking
    const sig = state.rows
      .map((r) => `${r.i}:${Math.round(r.progress / 25)}:${r.flags & 96}:${r.lives}`)
      .join('|');
    if (sig !== this.rankSig) {
      this.rankSig = sig;
      const base = state.rows[0]?.progress || 0;
      this.elRank.innerHTML = state.rows
        .map((r, idx) => {
          const gap = Math.max(0, base - r.progress);
          return `<div class="rank__row${r.isSelf ? ' rank__row--me' : ''}${r.eliminated ? ' rank__row--out' : ''}">
            <span class="rank__pos">${idx + 1}</span>
            <span class="rank__dot" style="background:${r.color}"></span>
            <span class="rank__name">${esc(r.name)}${r.eliminated ? ' ☠' : (r.flags & 32) ? ' 🏁' : ''}</span>
            <span class="rank__gap">${idx === 0 ? Math.round(r.progress) + 'm' : '-' + Math.round(gap) + 'm'}</span>
          </div>`;
        })
        .join('');
    }

    // minimapa
    const span = state.mode === 'classic' || state.mode === 'timeattack' ? state.finishX : state.finishX;
    for (const r of state.rows) {
      const el = this.dotEls?.get(r.i);
      if (!el) continue;
      const laps = r.laps || 0;
      let pct;
      if (state.mode === 'classic' || state.mode === 'timeattack') {
        pct = Math.min(1, Math.max(0, r.progress / span));
      } else {
        pct = Math.min(1, Math.max(0, (r.progress - laps * span) / span));
      }
      el.style.left = `${4 + pct * 90}%`;
    }

    // habilidade
    const cd = state.self.cooldown;
    if (cd > 0.15) {
      this.elAbCd.classList.remove('hidden');
      this.elAbCd.textContent = Math.ceil(cd);
      this.elAbIcon.classList.remove('is-ready');
    } else {
      this.elAbCd.classList.add('hidden');
      this.elAbIcon.classList.add('is-ready');
    }

    // banner de caos
    if (this.elBanner && !this.elBanner.classList.contains('hidden')) {
      const remain = this.bannerUntil - performance.now();
      if (remain <= 0) {
        this.elBanner.classList.add('hidden');
      } else {
        this.elBannerBar.style.width = `${Math.max(0, Math.min(100, (remain / this.bannerDuration) * 100))}%`;
      }
    }
  }

  destroy() {
    clearTimeout(this.noticeTimer);
    clearTimeout(this.countdownTimer);
    if (this.root) this.root.innerHTML = '';
    if (this.touchRoot) {
      this.touchRoot.innerHTML = '';
      this.touchRoot.classList.add('hidden');
    }
  }
}
