/* SquidgySqueegee — sequencer.
   A 16-step bass line that re-writes itself every cycle, and three drummers who each
   loop at a different length (16 / 12 / 14), so the groove phases against itself. */
(function (SS) {
  'use strict';

  const A = SS.audio;
  const S = (SS.seq = { playing: false, cycle: 0, light: 0, swing: 0.22 });

  /* The light you work under decides the mode. */
  S.lights = [
    { id: 'safelight', name: 'Safelight', mode: 'Aeolian', scale: [0, 2, 3, 5, 7, 8, 10], tint: [255, 52, 32] },
    { id: 'amber', name: 'Amber', mode: 'Dorian', scale: [0, 2, 3, 5, 7, 9, 10], tint: [255, 158, 48] },
    { id: 'enlarger', name: 'Enlarger', mode: 'Lydian', scale: [0, 2, 4, 6, 7, 9, 11], tint: [246, 238, 222] },
  ];

  /* Scale degrees 0..7 (7 = the octave), -1 = rest. Hops on the off-beats. */
  S.synth = { pattern: [0, -1, 0, 2, -1, 4, -1, 3, 0, -1, 5, -1, 4, 2, -1, 7] };

  /* Evenly spread `hits` across `len` steps, then rotate. */
  function euclid(hits, len, rot) {
    const out = new Array(len).fill(false);
    for (let i = 0; i < len; i++) {
      if (Math.floor(((i + 1) * hits) / len) !== Math.floor((i * hits) / len)) out[(i + rot) % len] = true;
    }
    return out;
  }

  function drummer(name, len, hits, rot) {
    const d = { name, len, hits, rot, steps: [] };
    d.steps = euclid(hits, len, rot);
    return d;
  }

  S.drummers = [drummer('kick', 16, 4, 1), drummer('snare', 12, 2, 3), drummer('hat', 14, 7, 0)];

  S.regen = (i) => {
    const d = S.drummers[i];
    d.steps = euclid(d.hits, d.len, d.rot);
  };

  S.midi = (deg) => {
    const sc = S.lights[S.light].scale;
    return A.params.root + sc[deg % 7] + 12 * Math.floor(deg / 7);
  };

  S.setLight = (i) => {
    S.light = i;
  };

  /* ---- drift: the loop breathes around a "home" pattern ----
     Once per cycle at most one step moves. Steps on the beat barely move, the rest can be
     nudged a scale degree, dropped out, or brought back on a chord tone. The further the line
     is from home, the more likely a step is put back. drift = 0 freezes it exactly. */
  S.drift = 0.4;
  S.home = S.synth.pattern.slice();

  const clampDeg = (n) => Math.max(0, Math.min(7, n));
  const CHORD_TONES = [0, 2, 4, 7];

  S.evolve = function (pattern) {
    const d = S.drift;
    if (d <= 0) return pattern;
    const rnd = Math.random;

    const away = [];
    for (let i = 0; i < 16; i++) if (pattern[i] !== S.home[i]) away.push(i);
    // how many steps may differ from home; past the middle of the knob the leash lengthens
    const allowed = 1 + Math.round(d * 5) + Math.round(Math.max(0, d - 0.5) * 8);
    if (away.length > allowed || (away.length && rnd() < 0.15)) {
      const i = away[Math.floor(rnd() * away.length)];
      pattern[i] = S.home[i];
      return pattern;
    }

    if (rnd() > 0.5 + d * 0.5) return pattern; // some cycles pass untouched
    const i = Math.floor(rnd() * 16), r = rnd();
    const notes = pattern.filter((n) => n >= 0).length;
    if (i % 4 === 0) {
      if (pattern[i] >= 0 && r < 0.3) pattern[i] = clampDeg(pattern[i] + (rnd() < 0.5 ? -1 : 1));
    } else if (pattern[i] < 0) {
      if (notes < 11) pattern[i] = CHORD_TONES[Math.floor(rnd() * CHORD_TONES.length)];
    } else if (r < 0.25) {
      if (notes > 7) pattern[i] = -1;
    } else {
      pattern[i] = clampDeg(pattern[i] + (rnd() < 0.5 ? -1 : 1));
    }
    return pattern;
  };

  /* ---- ghost hats: faint extra hits that appear in the hat ring's empty steps and fade away.
     Strength 0..1 per step. They never touch a written hat, and drift = 0 lets them all fade out. */
  S.ghosts = [];

  S.driftGhosts = function () {
    const d = S.drift, hat = S.drummers[2], rnd = Math.random;
    if (S.ghosts.length !== hat.len) S.ghosts = new Array(hat.len).fill(0);
    const g = S.ghosts;
    for (let i = 0; i < g.length; i++) g[i] = hat.steps[i] ? 0 : Math.max(0, g[i] - (0.06 + (1 - d) * 0.05));
    const live = g.filter((x) => x > 0.15).length;
    if (live < Math.round(d * 7) && rnd() < 0.3 + d * 0.5) {
      const free = [];
      for (let i = 0; i < g.length; i++) if (!hat.steps[i] && g[i] <= 0.15) free.push(i);
      if (free.length) g[free[Math.floor(rnd() * free.length)]] = 0.5 + rnd() * 0.5;
    }
  };

  S.goHome = () => {
    S.synth.pattern = S.home.slice();
  };

  /* ---- a loop is a small JSON snapshot: kept in the browser, or exported / imported as a file ---- */
  const KEY = 'squidgysqueegee.loop.v1';
  const PARAMS = { cutoff: [0, 1], reso: [0, 1], decay: [0, 1], drive: [0, 1], glide: [0, 1], space: [0, 1], tempo: [80, 160] };
  const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

  /* kind: 'loop' (everything), 'pattern' (bass line), 'drums' (the three rings), 'sound' (knobs, light, swing, drift, tempo) */
  S.KINDS = ['loop', 'pattern', 'drums', 'sound'];

  S.snapshot = (kind = 'loop') => {
    const o = { app: 'SquidgySqueegee', version: 1, kind };
    if (kind === 'loop' || kind === 'pattern') o.pattern = S.synth.pattern.slice();
    if (kind === 'loop' || kind === 'drums') o.drummers = S.drummers.map((d) => ({ len: d.len, hits: d.hits, rot: d.rot, steps: d.steps.slice() }));
    if (kind === 'loop' || kind === 'sound') {
      o.light = S.light;
      o.swing = S.swing;
      o.drift = S.drift;
      o.params = Object.keys(PARAMS).reduce((acc, k) => ((acc[k] = A.params[k]), acc), {});
    }
    return o;
  };

  /* Applies a snapshot. Everything is checked BEFORE anything changes, so a bad file can never half-load.
     Returns false if the file isn't a usable loop of the kind it claims to be (older files with no kind are full loops). */
  S.apply = (j) => {
    if (!j || typeof j !== 'object') return false;
    const kind = j.kind || 'loop';
    if (!S.KINDS.includes(kind)) return false;
    const wantPattern = kind === 'loop' || kind === 'pattern';
    const wantDrums = kind === 'loop' || kind === 'drums';
    const wantSound = kind === 'loop' || kind === 'sound';

    let p = null;
    if (wantPattern) {
      const valid = Array.isArray(j.pattern) && j.pattern.length === 16 && j.pattern.every((n) => Number.isInteger(n) && n >= -1 && n <= 7);
      if (!valid) return false;
      p = j.pattern.slice();
    }
    if (wantDrums && (!Array.isArray(j.drummers) || j.drummers.length !== 3)) return false;
    if (wantSound && !j.params && !('swing' in j) && !('drift' in j) && !('light' in j)) return false;

    if (wantPattern) {
      S.synth.pattern = p;
      S.home = p.slice();
    }
    if (wantDrums) {
      j.drummers.forEach((s, i) => {
        const d = S.drummers[i];
        if (s && Number.isInteger(s.len) && s.len >= 4 && s.len <= 32 && Array.isArray(s.steps) && s.steps.length === s.len) {
          d.len = s.len;
          d.hits = Math.max(0, Math.min(s.len, s.hits | 0));
          d.rot = Math.max(0, Math.min(s.len - 1, s.rot | 0));
          d.steps = s.steps.map(Boolean);
        }
      });
    }
    if (wantPattern || wantDrums) S.ghosts = [];
    if (wantSound) {
      if (S.lights[j.light]) S.light = j.light;
      const sw = num(j.swing, 0, 0.5), dr = num(j.drift, 0, 1);
      if (sw != null) S.swing = sw;
      if (dr != null) S.drift = dr;
      for (const k in PARAMS) {
        const v = num(j.params && j.params[k], PARAMS[k][0], PARAMS[k][1]);
        if (v != null) A.setParam(k, v);
      }
    }
    return true;
  };

  S.save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S.snapshot()));
      S.home = S.synth.pattern.slice();
      return true;
    } catch (err) {
      return false;
    }
  };

  S.load = () => {
    try {
      return S.apply(JSON.parse(localStorage.getItem(KEY)));
    } catch (err) {
      return false;
    }
  };

  function sanitize(p, fallback) {
    if (!Array.isArray(p) || p.length !== 16) return fallback;
    return p.map((n) => (Number.isInteger(n) && n >= -1 && n <= 7 ? n : -1));
  }

  /* ---- scheduler: look ahead a little, hand notes to the audio clock ---- */
  const emit = (t, type, a, b) => {
    const q = SS.events;
    q.push({ t, type, a, b });
    if (q.length > 400) q.splice(0, q.length - 400);
  };

  const stepDur = () => 60 / A.params.tempo / 4;
  let clock = null, nextTime = 0, tick = 0;

  /* The heartbeat lives in a Web Worker: browsers slow page timers to ~1/s in hidden or covered
     windows, but worker timers keep time. Built from a Blob so it also works from file://.
     Falls back to a plain interval if workers are unavailable. */
  function makeClock(onTick) {
    const fallback = () => {
      let id = null;
      return { start: () => { clearInterval(id); id = setInterval(onTick, 30); }, stop: () => clearInterval(id) };
    };
    try {
      const src = 'let id=null;onmessage=e=>{clearInterval(id);id=null;if(e.data==="start")id=setInterval(()=>postMessage(0),25)}';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = onTick;
      let fb = null;
      w.onerror = () => {
        fb = fb || fallback();
        if (S.playing) fb.start();
      };
      return { start: () => (fb ? fb.start() : w.postMessage('start')), stop: () => { w.postMessage('stop'); if (fb) fb.stop(); } };
    } catch (err) {
      return fallback();
    }
  }

  S.makeClock = makeClock;   // the player reuses the same background-thread heartbeat

  function play(tk, t) {
    const sd = stepDur();
    const step = tk % 16;
    if (step === 0 && tk > 0) {
      S.cycle++;
      S.synth.pattern = sanitize(S.evolve(S.synth.pattern.slice()), S.synth.pattern);
      S.driftGhosts();
      emit(t, 'cycle', S.cycle);
    }
    const st = t + (tk % 2 ? S.swing * sd : 0); // Bounce: odd sixteenths arrive late

    // Aperture breathes on two slow waves of different lengths, so it never repeats exactly
    A.params.breath = (Math.sin((tk / 256) * Math.PI * 2) * 0.08 + Math.sin((tk / 400) * Math.PI * 2) * 0.05) * Math.min(2, S.drift / 0.3);

    const pat = S.synth.pattern;
    const deg = pat[step];
    if (deg >= 0) {
      const accent = step % 4 === 0;
      const dur = sd * (pat[(step + 1) % 16] >= 0 ? 1.15 : 0.8);
      A.note(st, S.midi(deg), accent ? 0.9 : 0.62, dur, accent);
      emit(st, 'note', S.midi(deg));
    }
    emit(st, 'step', step);

    S.drummers.forEach((d, i) => {
      const idx = tk % d.len;
      emit(st, 'd', i, idx);
      if (!d.steps[idx]) {
        const gh = i === 2 ? S.ghosts[idx] || 0 : 0;
        if (gh > 0.15 && Math.random() < gh) {
          A.hat(st, 0.18 + 0.2 * gh, false);
          emit(st, 'ghost');
        }
        return;
      }
      if (i === 0) A.kick(st, 0.95);
      else if (i === 1) A.snare(st, 0.8);
      else A.hat(st, idx % 2 ? 0.35 : 0.5, idx % 7 === 0);
      emit(st, d.name);
    });
  }

  function pump() {
    const now = A.now();
    while (nextTime < now + 0.18) {
      play(tick, nextTime);
      nextTime += stepDur();
      tick++;
    }
  }

  S.start = () => {
    if (S.playing) return;
    S.playing = true;
    tick = 0;
    nextTime = A.now() + 0.08;
    clock = clock || makeClock(pump);
    clock.start();
  };

  S.stop = () => {
    S.playing = false;
    if (clock) clock.stop();
    A.noteOff(A.now());
  };
})(window.SS);
