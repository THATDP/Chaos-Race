const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function make(level, tag) {
  return (...args) => {
    if (LEVELS[level] > current) return;
    const line = `[${stamp()}] ${level.toUpperCase().padEnd(5)} ${tag ? `(${tag}) ` : ''}`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(line + msg(args));
  };
}

function msg(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export function createLogger(tag = 'chaos') {
  return {
    info: make('info', tag),
    warn: make('warn', tag),
    error: make('error', tag),
    debug: make('debug', tag),
  };
}

export const log = createLogger('chaos');
