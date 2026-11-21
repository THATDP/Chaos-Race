export const FLAG = {
  grounded: 1,
  sliding: 2,
  shield: 4,
  boost: 8,
  slow: 16,
  finished: 32,
  eliminated: 64,
  frozen: 128,
  disconnected: 256,
  invuln: 512,
  quantum: 1024,
};

export const has = (flags, bit) => (flags & bit) !== 0;
