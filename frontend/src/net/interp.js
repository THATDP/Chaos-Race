// Relógio da partida + buffer de interpolação dos jogadores remotos.
export class ServerClock {
  constructor() {
    this.t = 0;
    this.started = false;
    this.lastRecv = 0;
    this.jitter = 0;
  }

  /** O snapshot traz o tempo de corrida do servidor. Suavizamos a correção. */
  update(snapT, recvPerf = performance.now()) {
    this.lastRecv = recvPerf;
    if (!this.started) {
      this.t = snapT;
      this.started = true;
      return;
    }
    const err = snapT - this.t;
    if (Math.abs(err) > 0.75) this.t = snapT;
    else this.t += err * 0.18;
    this.jitter = this.jitter * 0.9 + Math.abs(err) * 0.1;
  }

  advance(dt) {
    if (this.started) this.t += dt;
  }
}

export class SnapshotBuffer {
  constructor(delay = 0.1, max = 40) {
    this.delay = delay;
    this.max = max;
    this.buf = [];
  }

  push(snap, recvPerf = performance.now()) {
    if (!snap || !Array.isArray(snap.p)) return;
    this.buf.push({ t: snap.t, p: snap.p, recv: recvPerf });
    if (this.buf.length > this.max) this.buf.shift();
    // mantém ordenado por t (pacotes podem chegar fora de ordem)
    for (let i = this.buf.length - 1; i > 0 && this.buf[i].t < this.buf[i - 1].t; i--) {
      [this.buf[i], this.buf[i - 1]] = [this.buf[i - 1], this.buf[i]];
    }
  }

  clear() {
    this.buf.length = 0;
  }

  get latest() {
    return this.buf[this.buf.length - 1] || null;
  }

  /** Retorna Map(index -> estado) interpolado no tempo de render. */
  sample(renderT) {
    const out = new Map();
    const buf = this.buf;
    if (!buf.length) return out;
    if (buf.length === 1 || renderT <= buf[0].t) {
      for (const p of buf[0].p) out.set(p[0], rowToState(p));
      return out;
    }
    const last = buf[buf.length - 1];
    if (renderT >= last.t) {
      for (const p of last.p) out.set(p[0], rowToState(p));
      return out;
    }
    let i = buf.length - 2;
    while (i > 0 && buf[i].t > renderT) i--;
    const a = buf[i];
    const b = buf[i + 1];
    const span = b.t - a.t || 0.0001;
    const alpha = Math.min(1, Math.max(0, (renderT - a.t) / span));
    const bMap = new Map(b.p.map((row) => [row[0], row]));
    for (const rowA of a.p) {
      const rowB = bMap.get(rowA[0]);
      if (!rowB) {
        out.set(rowA[0], rowToState(rowA));
        continue;
      }
      out.set(rowA[0], {
        x: rowA[1] + (rowB[1] - rowA[1]) * alpha,
        y: rowA[2] + (rowB[2] - rowA[2]) * alpha,
        vx: rowA[3] + (rowB[3] - rowA[3]) * alpha,
        vy: rowA[4] + (rowB[4] - rowA[4]) * alpha,
        flags: rowB[5],
        ack: rowB[6],
        cp: rowB[7],
        laps: rowB[8],
        lives: rowB[9],
        progress: rowB[10],
        cd: rowB[11],
        finishT: rowB[12],
      });
    }
    return out;
  }
}

export function rowToState(row) {
  return {
    x: row[1],
    y: row[2],
    vx: row[3],
    vy: row[4],
    flags: row[5],
    ack: row[6],
    cp: row[7],
    laps: row[8],
    lives: row[9],
    progress: row[10],
    cd: row[11],
    finishT: row[12],
  };
}
