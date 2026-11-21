// QA de geometria: percorre cada pista usando a física real (QA, não é gameplay).
import { TRACKS, TrackRuntime } from '../shared/tracks.js';
import { createPlayer, stepPlayer } from '../shared/physics.js';
import { PHYSICS_DT } from '../shared/constants.js';

const DT = PHYSICS_DT;

function run(track, verbose = false) {
  const runtime = new TrackRuntime(track);
  const p = createPlayer({ id: 'qa', name: 'qa', index: 0, ability: 'turbo', track });
  let t = 0;
  let jumpHeld = false;
  let hits = 0;
  let maxX = 0;
  let noProgress = 0;
  let lastLog = 0;

  for (let frame = 0; frame < 60 * 120; frame++) {
    t += DT;
    const solids = runtime.solids(Math.round(t * 100) / 100, false);
    const hazards = process.env.NO_HAZARDS ? [] : runtime.hazards(Math.round(t * 100) / 100);
    const feet = p.y + p.h;

    const hasGroundUnder = (x) =>
      solids.some((s) => s.x <= x && s.x + s.w >= x && s.y >= feet - 12 && s.y <= feet + 60);
    const edgeSoon = p.grounded && !hasGroundUnder(p.x + p.w + 14);
    const hazardAhead = hazards.some(
      (h) =>
        (h.kind === 'spike' || h.kind === 'saw') &&
        h.x + h.w > p.x + p.w - 4 &&
        h.x < p.x + p.w + 110 &&
        h.y + h.h > p.y + 6 &&
        h.y < feet - 2,
    );
    const wallAhead = solids.some(
      (s) =>
        s.x >= p.x + p.w - 4 &&
        s.x < p.x + p.w + 34 &&
        s.y < feet - 24 &&
        s.y + s.h > p.y + 8,
    );
    const stuck = p.grounded && Math.abs(p.vx) < 40 && noProgress > 0.35;

    const jump = p.grounded && (edgeSoon || hazardAhead || wallAhead || stuck);
    const hold = jump || (!p.grounded && p.vy < -80);
    jumpHeld = hold;

    const evs = stepPlayer(
      p,
      { seq: frame, dir: 1, jump: jump ? 1 : 0, hold: hold ? 1 : 0, slide: 0 },
      DT,
      runtime,
      t,
      {
        solids,
        hazards,
        pads: track.pads,
        checkpoints: track.checkpoints,
        killY: track.killY,
        finishX: track.finishX,
        mods: { gravity: 1, friction: 1, windX: 0, speed: 1 },
        track,
      },
    );
    for (const e of evs) {
      if (e.type === 'hit' || e.type === 'fall') {
        hits++;
        if (verbose) console.log(`  ${e.type} em x=${Math.round(p.x)} t=${t.toFixed(1)} cp=${track.checkpoints[p.checkpoint]?.x}`);
        const cp = track.checkpoints[p.checkpoint] || track.checkpoints[0];
        p.x = cp.x;
        p.y = cp.y - p.h + 2;
        p.vx = 0;
        p.vy = 0;
        p.freezeUntil = t + 0.4;
        p.invulnUntil = t + 1.0;
      }
      if (e.type === 'finish') return { id: track.id, ok: true, time: +t.toFixed(2), hits, len: track.finishX };
    }
    if (p.x > maxX + 2) {
      maxX = p.x;
      noProgress = 0;
    } else {
      noProgress += DT;
    }
    if (verbose && t - lastLog > 1) {
      lastLog = t;
      console.log(`  t=${t.toFixed(0)} x=${Math.round(p.x)} y=${Math.round(p.y)} vx=${Math.round(p.vx)} g=${p.grounded}`);
    }
    if (noProgress > 8) {
      return { id: track.id, ok: false, stuckAt: Math.round(p.x), hits, maxX: Math.round(maxX) };
    }
  }
  return { id: track.id, ok: false, timeout: true, maxX: Math.round(maxX), hits };
}

const only = process.argv[2];
for (const track of TRACKS) {
  if (only && track.id !== only) continue;
  const r = run(track, !!only);
  console.log(JSON.stringify(r));
}
