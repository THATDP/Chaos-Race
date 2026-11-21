import { io } from 'socket.io-client';

export function defaultServerUrl() {
  // Mesma origem: em desenvolvimento o Vite faz proxy de /socket.io, /api e
  // /health para o backend (veja frontend/vite.config.js). Em produção
  // (GitHub Pages) defina VITE_SERVER_URL com a URL pública do Render.
  return window.location.origin;
}

export function resolveServerUrl(profile) {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('server');
  if (fromQuery) return fromQuery.replace(/\/$/, '');
  if (profile?.settings?.serverUrl) return profile.settings.serverUrl.replace(/\/$/, '');
  const env = import.meta.env?.VITE_SERVER_URL;
  if (env) return String(env).replace(/\/$/, '');
  return defaultServerUrl();
}

export class NetClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.latency = 0;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.handlers = new Map();
  }

  connect() {
    if (this.socket) this.socket.disconnect();
    this.socket = io(this.url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
      timeout: 9000,
      autoConnect: true,
    });
    this.socket.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emitLocal('connect', {});
    });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this.emitLocal('disconnect', { reason });
    });
    this.socket.on('connect_error', (err) => {
      this.reconnectAttempts += 1;
      this.emitLocal('connect_error', { message: err?.message || 'erro de conexão' });
    });
    this.socket.on('server:info', (data) => this.emitLocal('server:info', data));
    this.socket.on('pong', (d) => this.emitLocal('pong', d));
    this.startPing();
    return this;
  }

  startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.socket?.connected) return;
      const start = performance.now();
      this.socket.timeout(4000).emit('ping:check', { c: start }, (err) => {
        if (!err) this.latency = Math.round(performance.now() - start);
      });
    }, 2500);
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emitLocal(event, data) {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(data);
      } catch (err) {
        console.error('[net handler]', event, err);
      }
    });
  }

  emit(event, data) {
    this.socket?.emit(event, data);
  }

  emitAck(event, data, timeout = 6000) {
    return new Promise((resolve) => {
      if (!this.socket?.connected) return resolve({ ok: false, error: 'Sem conexão com o servidor.' });
      this.socket.timeout(timeout).emit(event, data, (err, res) => {
        if (err) resolve({ ok: false, error: 'Servidor não respondeu. Tente novamente.' });
        else resolve(res || { ok: false });
      });
    });
  }

  bindServerEvents(names) {
    for (const name of names) {
      this.socket.on(name, (payload) => this.emitLocal(name, payload));
    }
  }

  disconnect() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.socket?.disconnect();
  }
}
