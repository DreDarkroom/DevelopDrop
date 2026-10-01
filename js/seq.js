/* Sequencer.
   A 16-step bass line that re-writes itself every cycle, three drummers who each loop at a different length, styles (presets),
   mutes, builds and drops that land on the beat, recordable clips that snap to the bar, and a slow "journey" of tempo and visuals.
   Everything that changes the music while it plays is queued to the next beat or bar, so it always lands in time. */
(function (SS) {
  'use strict';

  const A = SS.audio;
  const S = (SS.seq = { playing: false, cycle: 0, light: 0, swing: 0.22, style: 0, scene: 0, dnb: false, quant: 'beat' });

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
  S.euclid = euclid;

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

  /* ---- mutes: build a set by bringing layers in (an unheard layer makes no events, so recordings stay faithful) ---- */
  S.mute = { kick: false, snare: false, hat: false, bass: false };
  S.PARTS = ['kick', 'snare', 'hat', 'bass'];
  S.toggleMute = (part, force) => {
    if (!(part in S.mute)) return false;
    S.mute[part] = force != null ? !!force : !S.mute[part];
    return S.mute[part];
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
    if (S.home.every((n) => n < 0)) return pattern;   // a cleared line stays cleared: drift only varies something that exists
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

  /** Empty the bass line, the drums, or both (Drift will not refill an emptied bass line). */
  S.clear = (what = 'bass') => {
    if (what === 'bass' || what === 'all') {
      S.synth.pattern = new Array(16).fill(-1);
      S.home = S.synth.pattern.slice();
    }
    if (what === 'drums' || what === 'all') {
      S.drummers.forEach((d) => { d.steps = new Array(d.len).fill(false); d.hits = 0; });
      S.ghosts = [];
    }
  };

  /* ---- styles: complete starting points (tempo, kit, pattern, rings, sound, light, picture).
     Original patterns written in the spirit of each; the names are darkroom terms, the inspirations are in the notes. ---- */
  const R = (len, hits, rot) => ({ len, steps: euclid(hits, len, rot) });
  const O = (len, on) => ({ len, steps: Array.from({ length: len }, (_, i) => on.includes(i)) });
  const SND = (cutoff, reso, decay, drive, glide, space) => ({ cutoff, reso, decay, drive, glide, space });

  S.styles = [
    { name: 'Safelight', note: 'The default: slow, rolling, hypnotic.', tempo: 119, swing: 0.22, kit: 'safelight', light: 0, scene: 0, drift: 0.4,
      bass: [0, -1, 0, 2, -1, 4, -1, 3, 0, -1, 5, -1, 4, 2, -1, 7], kick: R(16, 4, 1), snare: R(12, 2, 3), hat: R(14, 7, 0), sound: SND(0.42, 0.4, 0.38, 0.22, 0.18, 0.3) },
    { name: 'Latent Image', note: 'Minimal and polyrhythmic, sparse bass, dry clicks (in the spirit of Max Cooper).', tempo: 122, swing: 0.05, kit: 'minimal', light: 1, scene: 1, drift: 0.55,
      bass: [0, -1, -1, -1, 4, -1, -1, 2, -1, -1, -1, -1, 5, -1, 3, -1], kick: R(16, 5, 0), snare: R(12, 3, 2), hat: R(14, 9, 0), sound: SND(0.5, 0.3, 0.2, 0.1, 0.05, 0.2) },
    { name: 'Dodge & Burn', note: 'Four on the floor, clap on two and four, offbeat hats, driving bass (in the spirit of Soulwax).', tempo: 126, swing: 0.12, kit: 'electro', light: 0, scene: 2, drift: 0.3,
      bass: [0, 0, -1, 7, 0, -1, 7, 0, 0, -1, 5, 0, -1, 7, 3, -1], kick: R(16, 4, 1), snare: R(16, 2, 5), hat: R(16, 4, 3), sound: SND(0.55, 0.45, 0.25, 0.3, 0.08, 0.25) },
    { name: 'Long Exposure', note: 'Rave: a pumping arpeggio, big kick and open hats (in the spirit of Orbital).', tempo: 134, swing: 0, kit: 'rave', light: 2, scene: 3, drift: 0.4,
      bass: [0, 4, 7, 4, 0, 4, 7, 4, 2, 5, 7, 5, 2, 5, 7, 5], kick: R(16, 4, 1), snare: R(16, 2, 5), hat: R(16, 8, 1), sound: SND(0.6, 0.5, 0.3, 0.3, 0.1, 0.35) },
    { name: 'Rapid Fixer', note: 'Drum and bass at 174: two-step kick, snare on two and four, rolling bass.', tempo: 174, swing: 0, kit: 'dnb', light: 0, scene: 1, drift: 0.35, dnb: true,
      bass: [0, -1, 0, -1, -1, 0, -1, 3, 0, -1, 0, -1, -1, 5, -1, 3], kick: O(16, [0, 10]), snare: O(16, [4, 12]), hat: R(16, 13, 0), sound: SND(0.35, 0.5, 0.2, 0.35, 0.02, 0.2) },
    { name: 'Slow Build', note: 'Start quiet with only a kick and hats, then bring the rest in with Z X V B or a right-click on a ring.', tempo: 104, swing: 0.18, kit: 'safelight', light: 0, scene: 0, drift: 0.3,
      bass: [0, -1, -1, -1, 0, -1, -1, -1, 3, -1, -1, -1, 2, -1, -1, -1], kick: R(16, 4, 1), snare: R(12, 2, 3), hat: R(14, 7, 0), sound: SND(0.4, 0.35, 0.4, 0.15, 0.2, 0.35), mute: { snare: true, bass: true } },
    { name: 'Blank', note: 'Nothing playing: write your own.', tempo: 119, swing: 0.15, kit: 'safelight', light: 0, scene: 0, drift: 0.4,
      bass: new Array(16).fill(-1), kick: O(16, []), snare: O(16, []), hat: O(16, []), sound: SND(0.42, 0.4, 0.38, 0.22, 0.18, 0.3) },
  ];

  function applyStyleNow(i) {
    const st = S.styles[i];
    if (!st) return false;
    S.style = i;
    S.synth.pattern = st.bass.slice();
    S.home = S.synth.pattern.slice();
    [st.kick, st.snare, st.hat].forEach((spec, k) => {
      const d = S.drummers[k];
      d.len = spec.len;
      d.steps = spec.steps.slice();
      d.hits = d.steps.filter(Boolean).length;
      d.rot = 0;
    });
    S.ghosts = [];
    S.swing = st.swing;
    S.drift = st.drift;
    S.light = st.light;
    S.dnb = !!st.dnb;
    S.scene = st.scene;
    for (const k of S.PARTS) S.mute[k] = !!(st.mute && st.mute[k]);
    A.setKit(st.kit);
    for (const [k, v] of Object.entries(st.sound)) A.setParam(k, v);
    A.setParam('tempo', st.tempo);
    emit(A.now(), 'style', i);
    return true;
  }

  /** Switch style. While playing it waits for the next bar so it lands in time; `now` forces it at once. */
  S.applyStyle = (i, opts = {}) => {
    if (!S.styles[i]) return false;
    if (!S.playing || opts.now) return applyStyleNow(i);
    S.atNextBar(() => applyStyleNow(i));
    emit(A.now(), 'queued', 'style');
    return true;
  };

  /* ---- a loop is a small JSON snapshot: kept in the browser, or exported / imported as a file ---- */
  const KEY = 'squidgysqueegee.loop.v1';
  const PARAMS = { cutoff: [0, 1], reso: [0, 1], decay: [0, 1], drive: [0, 1], glide: [0, 1], space: [0, 1], tempo: [60, 200], level: [0, 1], duck: [0, 1], root: [24, 72], kickDb: [-24, 12], snareDb: [-24, 12], hatDb: [-24, 12], bassDb: [-24, 12] };
  const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

  /* kind: 'loop' (everything), 'pattern' (bass line), 'drums' (the three rings), 'sound' (knobs, kit, light, swing, drift, tempo) */
  S.KINDS = ['loop', 'pattern', 'drums', 'sound'];

  S.snapshot = (kind = 'loop') => {
    const o = { app: 'SquidgySqueegee', version: 1, kind };
    if (kind === 'loop' || kind === 'pattern') o.pattern = S.synth.pattern.slice();
    if (kind === 'loop' || kind === 'drums') o.drummers = S.drummers.map((d) => ({ len: d.len, hits: d.hits, rot: d.rot, steps: d.steps.slice() }));
    if (kind === 'loop' || kind === 'sound') {
      o.light = S.light;
      o.swing = S.swing;
      o.drift = S.drift;
      o.kit = A.kitName;
      o.scene = S.scene;
      o.dnb = S.dnb;
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
      if (typeof j.kit === 'string' && Object.prototype.hasOwnProperty.call(A.kits, j.kit)) A.setKit(j.kit);
      if (Number.isInteger(j.scene) && j.scene >= 0 && j.scene <= 3) S.scene = j.scene;
      if (typeof j.dnb === 'boolean') S.dnb = j.dnb;
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

  /* ---------------- timing: the scheduler, and everything that has to land on a beat ---------------- */
  const emit = (t, type, a, b) => {
    const q = SS.events;
    q.push({ t, type, a, b });
    if (q.length > 400) q.splice(0, q.length - 400);
  };

  const stepDur = () => 60 / A.params.tempo / 4;
  let clock = null, nextTime = 0, tick = 0;

  S.barDur = () => stepDur() * 16;
  S._tick = () => tick;                   // for tests
  S._setTick = (n, t) => { tick = n; if (t != null) nextTime = t; };

  /** The first tick at or after the next one to be scheduled that falls on a boundary: 'now' | 'beat' | 'bar'. */
  S.nextBoundary = (mode = 'beat') => {
    const m = mode === 'bar' ? 16 : mode === 'beat' ? 4 : 1;
    let tk = tick;
    while (tk % m) tk++;
    return tk;
  };

  /** Seconds until a tick plays (for showing "drop in 0.4 s"). */
  S.timeToTick = (tk) => Math.max(0, nextTime + (tk - tick) * stepDur() - A.now());

  const pending = [];
  /** Run `fn` when the next bar starts (so anything structural lands in time). */
  S.atNextBar = (fn) => { pending.push({ tick: S.nextBoundary('bar'), fn }); };

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

  /* ---------------- clips: record a part for some bars, then loop it (snapped to the bar) ---------------- */
  S.clips = { drums: null, bass: null };
  S.clipRec = null;
  const K_KICK = 0, K_SNARE = 1, K_HAT = 2, K_BASS = 3;

  /** part: 'drums' | 'bass' | 'both'. Starts at the next bar and lasts `bars` bars. */
  S.recordClip = (part = 'drums', bars = 4) => {
    if (!S.playing) return false;
    if (![1, 2, 4, 8].includes(bars) || !['drums', 'bass', 'both'].includes(part)) return false;
    const parts = part === 'both' ? ['drums', 'bass'] : [part];
    S.clipRec = { parts, bars, startTick: S.nextBoundary('bar'), state: 'armed', events: { drums: [], bass: [] } };
    emit(A.now(), 'clipArmed', part, bars);
    return true;
  };
  S.cancelClip = () => { if (S.clipRec) { S.clipRec = null; emit(A.now(), 'clipCancel'); } };

  function capture(part, tk, ev) {
    const r = S.clipRec;
    if (!r || r.state !== 'recording' || !r.parts.includes(part)) return;
    r.events[part].push([tk - r.startTick, ...ev]);
  }

  function makeClip(part, bars, events) {
    const len = bars * 16, byTick = Array.from({ length: len }, () => []);
    for (const e of events) byTick[e[0]].push(e);
    return { part, bars, len, events, byTick, active: false, startTick: 0, bpm: A.params.tempo };
  }

  function finishClip() {
    const r = S.clipRec;
    S.clipRec = null;
    for (const part of r.parts) {
      const c = makeClip(part, r.bars, r.events[part]);
      c.bpm = A.params.tempo;
      S.clips[part] = c;
      c.active = true;                     // it starts looping straight away, on the next bar
      c.startTick = tick + ((16 - (tick % 16)) % 16);
    }
    emit(A.now(), 'clipDone', r.parts.join('+'), r.bars);
  }

  S.playClip = (part, on = true) => {
    const c = S.clips[part];
    if (!c) return false;
    if (on) { c.startTick = S.nextBoundary('bar'); c.active = true; }
    else c.active = false;
    emit(A.now(), 'clipState', part, on);
    return true;
  };
  S.clearClip = (part) => { S.clips[part] = null; emit(A.now(), 'clipState', part, false); };

  S.clipToJSON = (part) => {
    const c = S.clips[part];
    if (!c) return null;
    return { app: 'SquidgySqueegee', kind: 'clip', version: 1, part, bars: c.bars, bpm: Math.round(c.bpm * 10) / 10, swing: S.swing, kit: A.kitName,
      events: c.events.map((e) => e.map((x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x))) };
  };

  /** Validate and load a clip (from a dropped file). Returns the part, or null if it isn't a usable clip. */
  S.loadClip = (j, opts = {}) => {
    if (!j || j.app !== 'SquidgySqueegee' || j.kind !== 'clip' || j.version !== 1) return null;
    if (!['drums', 'bass'].includes(j.part) || ![1, 2, 4, 8, 16].includes(j.bars) || !Array.isArray(j.events) || j.events.length > 8192) return null;
    const len = j.bars * 16, ok = [];
    for (const e of j.events) {
      if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] < 0 || e[0] >= len || !e.every((x) => typeof x === 'number' && isFinite(x))) continue;
      const code = e[1];
      const drumCode = code === K_KICK || code === K_SNARE || code === K_HAT;
      if (j.part === 'drums' ? !drumCode : code !== K_BASS) continue;
      if (code === K_BASS ? e.length < 6 || e[2] < 0 || e[2] > 127 : e.length < 3) continue;
      ok.push(e.slice());
    }
    if (!ok.length) return null;
    const c = makeClip(j.part, j.bars, ok);
    c.bpm = typeof j.bpm === 'number' ? j.bpm : A.params.tempo;
    S.clips[j.part] = c;
    if (opts.play !== false) {
      c.active = true;
      c.startTick = S.playing ? S.nextBoundary('bar') : 0;
    }
    emit(A.now(), 'clipDone', j.part, j.bars);
    return j.part;
  };

  const activeClip = (part, tk) => { const c = S.clips[part]; return c && c.active && tk >= c.startTick ? c : null; };

  /* ---------------- builds and drops ---------------- */
  S.build = null;          // { variant, t0 } while a build is held
  S.dropAt = null;         // { tick, variant } once released and waiting for the beat

  /** Start a build now: variant 0 "lift" (kick drops out, snare roll, the mix thins) or 1 "sink" (the mix goes under water). */
  S.buildStart = (variant = 0) => {
    if (!S.playing || S.build) return false;
    const t = A.now() + 0.02;
    S.build = { variant: variant ? 1 : 0, t0: t };
    S.dropAt = null;
    A.riser(true, variant ? 1 : 0, t);
    emit(t, 'build', variant ? 1 : 0);
    return true;
  };

  /** Let go: the drop lands on the next beat or bar (whichever Quantise is set to). */
  S.buildRelease = () => {
    if (!S.build || S.dropAt) return false;
    S.dropAt = { tick: S.nextBoundary(S.quant), variant: S.build.variant };
    emit(A.now(), 'dropArmed', S.timeToTick(S.dropAt.tick));
    return true;
  };

  function doDrop(t, variant) {
    const gapLen = Math.min(0.11, stepDur() * 0.85);
    A.gap(t - gapLen, gapLen);                              // a breath of silence, then the hit
    A.riser(false, variant, t);
    A.openUp(t, variant ? 0.03 : 0);                        // the filters snap open
    A.impact(t, 1);
    A.kick(t, 1);
    A.note(t, S.midi(0) - 12, 1, stepDur() * 7, true);      // a deep bass note under the drop
    emit(t, 'kick');
    emit(t, 'drop', variant);
    S.build = null;
    S.dropAt = null;
  }

  /** Cancel a build without a drop (stop pressed, or the music stopped). */
  S.buildCancel = () => {
    if (!S.build) return;
    const t = A.now();
    A.riser(false, S.build.variant, t);
    A.openUp(t, 0.3);
    S.build = null;
    S.dropAt = null;
  };

  S.setQuant = (m) => { if (['now', 'beat', 'bar'].includes(m)) S.quant = m; return S.quant; };

  /* ---------------- journey: tempo creeps up and the picture progresses, bar by bar ---------------- */
  S.journey = null;
  S.journeyStart = (opts = {}) => {
    const to = num(opts.to, 60, 200), bars = Math.round(num(opts.bars, 4, 1024) || 64);
    if (to == null) return false;
    S.journey = { from: A.params.tempo, to, bars, startTick: S.nextBoundary('bar'), scenes: opts.scenes !== false, lastScene: -1 };
    emit(A.now(), 'journey', 0);
    return true;
  };
  S.journeyStop = () => { if (S.journey) { S.journey = null; emit(A.now(), 'journeyEnd'); } };

  function journeyStep(tk, t) {
    const j = S.journey;
    if (!j || tk < j.startTick) return;
    const p = Math.min(1, (tk - j.startTick) / 16 / j.bars);
    A.setParam('tempo', Math.round((j.from + (j.to - j.from) * p) * 10) / 10);
    emit(t, 'journey', p);
    if (j.scenes) {
      const scene = Math.min(3, Math.floor(p * 4));
      if (scene !== j.lastScene) { j.lastScene = scene; S.scene = scene; emit(t, 'scene', scene); }
    }
    if (p >= 1) S.journeyStop();
  }

  /* ---------------- the scheduler ---------------- */
  function fireKick(st, vel, tk) {
    if (S.mute.kick || (S.build && S.build.variant === 0)) return false;
    A.kick(st, vel);
    emit(st, 'kick');
    capture('drums', tk, [K_KICK, Math.round(vel * 100) / 100]);
    return true;
  }
  function fireSnare(st, vel, tk) {
    if (S.mute.snare) return false;
    A.snare(st, vel);
    emit(st, 'snare');
    capture('drums', tk, [K_SNARE, Math.round(vel * 100) / 100]);
    return true;
  }
  function fireHat(st, vel, open, tk, ghost) {
    if (S.mute.hat) return false;
    A.hat(st, vel, open);
    emit(st, ghost ? 'ghost' : 'hat');
    capture('drums', tk, [K_HAT, Math.round(vel * 100) / 100, open ? 1 : 0]);
    return true;
  }
  function fireBass(st, midi, vel, durTicks, accent, tk, sd) {
    if (S.mute.bass) return;
    A.note(st, midi, vel, durTicks * sd, accent);
    emit(st, 'note', midi);
    capture('bass', tk, [K_BASS, midi, Math.round(vel * 100) / 100, accent ? 1 : 0, durTicks]);
  }

  function play(tk, t) {
    const sd = stepDur();
    const step = tk % 16;

    if (step === 0) {
      if (tk > 0) {
        S.cycle++;
        S.synth.pattern = sanitize(S.evolve(S.synth.pattern.slice()), S.synth.pattern);
        S.driftGhosts();
        emit(t, 'cycle', S.cycle);
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].tick <= tk) { const p = pending.splice(i, 1)[0]; p.fn(); }
      }
      journeyStep(tk, t);
    }
    if (S.clipRec) {
      const r = S.clipRec;
      if (r.state === 'armed' && tk >= r.startTick) { r.state = 'recording'; emit(t, 'clipRec', r.parts.join('+'), r.bars); }
      else if (r.state === 'recording' && tk >= r.startTick + r.bars * 16) finishClip();
    }
    if (S.dropAt && tk >= S.dropAt.tick) doDrop(t, S.dropAt.variant);

    const st = t + (tk % 2 ? S.swing * sd : 0); // Bounce: odd sixteenths arrive late

    // Aperture breathes on two slow waves of different lengths, so it never repeats exactly
    A.params.breath = (Math.sin((tk / 256) * Math.PI * 2) * 0.08 + Math.sin((tk / 400) * Math.PI * 2) * 0.05) * Math.min(2, S.drift / 0.3);

    // ---- bass (a clip replaces the written line while it plays)
    const bc = activeClip('bass', tk);
    if (bc) {
      for (const e of bc.byTick[(tk - bc.startTick) % bc.len]) fireBass(st, e[2], e[3], e[5], e[4], tk, sd);
    } else {
      const pat = S.synth.pattern;
      const deg = pat[step];
      if (deg >= 0) {
        const accent = step % 4 === 0;
        fireBass(st, S.midi(deg), accent ? 0.9 : 0.62, pat[(step + 1) % 16] >= 0 ? 1.15 : 0.8, accent, tk, sd);
      }
    }
    emit(st, 'step', step);

    // ---- drums
    const dc = activeClip('drums', tk);
    if (dc) {
      for (const e of dc.byTick[(tk - dc.startTick) % dc.len]) {
        if (e[1] === K_KICK) fireKick(st, e[2], tk);
        else if (e[1] === K_SNARE) fireSnare(st, e[2], tk);
        else if (e[1] === K_HAT) fireHat(st, e[2], !!e[3], tk, e[2] < 0.3);
      }
      S.drummers.forEach((d, i) => emit(st, 'd', i, tk % d.len));
    } else {
      S.drummers.forEach((d, i) => {
        const idx = tk % d.len;
        emit(st, 'd', i, idx);
        if (!d.steps[idx]) {
          const gh = i === 2 ? S.ghosts[idx] || 0 : 0;
          if (gh > 0.15 && Math.random() < gh) fireHat(st, 0.18 + 0.2 * gh, false, tk, true);
          return;
        }
        if (i === 0) fireKick(st, 0.95, tk);
        else if (i === 1) fireSnare(st, 0.8, tk);
        else fireHat(st, idx % 2 ? 0.35 : 0.5, idx % 7 === 0, tk, false);
      });
    }

    // ---- a "lift" build adds a snare roll that speeds up the longer you hold it
    if (S.build && S.build.variant === 0) {
      const el = t - S.build.t0;
      const every = el < 1 ? 0 : el < 2.5 ? 4 : el < 4 ? 2 : 1;
      if (every && tk % every === 0) {
        const vel = Math.min(1, 0.4 + el * 0.1);
        fireSnare(st, vel, tk);
        if (el > 6) fireSnare(st + sd / 2, vel * 0.8, tk);
      }
    }
  }

  function pump() {
    const now = A.now();
    while (nextTime < now + A.lookahead) {
      play(tick, nextTime);
      nextTime += stepDur();
      tick++;
    }
  }

  S.tickOnce = play;     // for tests

  S.start = () => {
    if (S.playing) return;
    S.playing = true;
    tick = 0;
    nextTime = A.now() + 0.08;
    clock = clock || makeClock(pump);
    clock.start();
  };

  S.stop = () => {
    S.buildCancel();
    S.cancelClip();
    S.playing = false;
    if (clock) clock.stop();
    A.noteOff(A.now());
  };
})(window.SS);
