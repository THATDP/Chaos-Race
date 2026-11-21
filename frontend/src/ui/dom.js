export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  return `${s}.${String(cs).padStart(2, '0')}s`;
}

export function fmtRelative(sec) {
  if (sec == null) return '—';
  if (sec < 1) return `${Math.round(sec * 1000)}ms`;
  return `${sec.toFixed(1)}s`;
}

let toastRoot = null;
export function toast(message, type = 'info', ttl = 3200) {
  toastRoot ||= document.getElementById('toasts');
  if (!toastRoot) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 300);
  }, ttl);
}

export function modal({ title = 'Confirmar', body = '', confirm = 'Sim', cancel = 'Cancelar' }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2 class="modal__title">${esc(title)}</h2>
        <p class="modal__body">${esc(body)}</p>
        <div class="modal__actions">
          <button class="btn btn--ghost btn--sm" data-act="cancel">${esc(cancel)}</button>
          <button class="btn btn--primary btn--sm" data-act="ok">${esc(confirm)}</button>
        </div>
      </div>`;
    root.classList.remove('hidden');
    const close = (val) => {
      root.classList.add('hidden');
      root.innerHTML = '';
      resolve(val);
    };
    root.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
    root.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
    root.addEventListener(
      'click',
      (e) => {
        if (e.target === root) close(false);
      },
      { once: true },
    );
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function vibrate(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignora */
  }
}

export function on(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}
