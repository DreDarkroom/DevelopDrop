/* DevelopDrop — the picture.
   A small scene (bead-chain tentacles, dot rings on every kick, confetti on every hat) is
   folded into a kaleidoscope, fed back into itself as a tunnel, tinted by the light you chose,
   and hidden behind a fog you wipe away with a squeegee. */
(function (SS) {
  'use strict';

  const A = SS.audio;
  const V = (SS.visual = {});
  const TAU = Math.PI * 2;
  const SC = 1024; // scene canvas size (scene units: centre = 512)
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let stage, sctx, fb, fctx, fog, gctx, scene, cctx, grain;
  let W = 0, H = 0, DPR = 1, R = 1, last = 0;
  let bladeAt = null;

  const st = {
    t: 0, phase: 0, spin: 0, n: 8,
    kick: 0, snare: 0, flash: 0, expose: 0, held: false,
    scene: 0, prevScene: 0, mix: 1, progress: 0, building: 0, bld: 0,
    tint: [255, 52, 32], tintTo: [255, 52, 32],
  };
  const rings = [];
  const sparks = [];

  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* Quality: the picture renders at a fraction of screen resolution on slower machines. 'auto' starts high and steps
     down when frames stay slow, and back up after two smooth minutes (with a backoff if that fails); a person can also choose a level (key Q, or ?quality=low). */
  const LEVELS = [
    { name: 'low', scale: 0.6, grain: false, maxN: 8 },
    { name: 'medium', scale: 0.85, grain: true, maxN: 10 },
    { name: 'high', scale: 1.25, grain: true, maxN: 12 },
  ];
  // Judged one SECOND at a time by average frame rate, not frame by frame: displays and compositors deliver slightly uneven
  // frames even when everything is fine, and a per-frame rule punishes that jitter.
  const SLOW_FPS = 36, SLOW_SECONDS = 4;        // this many slow seconds in a row: step down a level
  const GOOD_FPS = 44;
  V.recoverAfter = 120;                         // this many smooth seconds (a slow one costs 10) before trying one level up
  let mode = 'auto', level = 2, slowSecs = 0, goodSecs = 0, lastUp = -1e9, noUpUntil = 0, eco = false, lastDraw = 0;
  V.replay = false;                      // the player sets this: the recording decides the kaleidoscope, not chance
  V.stats = { fps: 0, frameMs: 0, level: 'high', mode: 'auto', downgrades: 0, upgrades: 0, recovery: 0, errors: 0, scene: 0, sections: {} };

  const maxN = () => (eco ? Math.min(8, LEVELS[level].maxN) : LEVELS[level].maxN);
  const setN = (n) => { st.n = Math.min(n, maxN()); };
  V.setKaleido = setN;

  function applyLevel(i) {
    level = Math.max(0, Math.min(LEVELS.length - 1, i));
    st.n = Math.min(st.n, maxN());
    V.stats.level = LEVELS[level].name;
    if (stage) resize();
  }

  /** 'auto' | 'high' | 'medium' | 'low' */
  V.setQuality = (m) => {
    mode = m;
    V.stats.mode = m;
    if (m !== 'auto') applyLevel(LEVELS.findIndex((l) => l.name === m));
    else applyLevel(2);
    slowSecs = 0; goodSecs = 0;
    return m;
  };
  /** The battery saver: a small picture at 30 frames a second, fewer folds. The quality manager stands down while it is on. */
  V.setEco = (on) => {
    on = !!on;
    if (on === eco) return;
    eco = on;
    V.stats.eco = on;
    st.n = Math.min(st.n, maxN());
    if (stage) resize();
  };

  V.cycleQuality = () => V.setQuality({ auto: 'high', high: 'medium', medium: 'low', low: 'auto' }[mode]);

  V.init = function () {
    stage = document.getElementById('stage');
    sctx = stage.getContext('2d', { alpha: false });
    fb = document.createElement('canvas');
    fctx = fb.getContext('2d', { alpha: false });
    fog = document.createElement('canvas');
    gctx = fog.getContext('2d');
    scene = document.createElement('canvas');
    scene.width = scene.height = SC;
    cctx = scene.getContext('2d');

    const g = document.createElement('canvas');
    g.width = g.height = 200;
    const gc = g.getContext('2d');
    const img = gc.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    grain = sctx.createPattern(g, 'repeat');

    const q = new URLSearchParams(location.search).get('quality');
    if (q && LEVELS.some((l) => l.name === q)) V.setQuality(q);
    resize();
    addEventListener('resize', resize);
    requestAnimationFrame(frame);
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, eco ? Math.min(0.55, LEVELS[level].scale) : LEVELS[level].scale);
    W = Math.floor(innerWidth * DPR);
    H = Math.floor(innerHeight * DPR);
    for (const c of [stage, fb, fog]) {
      c.width = W;
      c.height = H;
    }
    R = Math.hypot(W, H) / 2;
    fctx.fillStyle = '#000';
    fctx.fillRect(0, 0, W, H);
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, W, H);
  }

  V.setLight = (i) => {
    st.tintTo = SS.seq.lights[i].tint;
  };

  /** Which picture: 0 tentacles, 1 dot grid, 2 film frames, 3 spokes. Crossfades over a couple of seconds. */
  V.setScene = (i) => {
    i = Math.max(0, Math.min(3, i | 0));
    if (i === st.scene) return;
    st.prevScene = st.scene;
    st.scene = i;
    st.mix = 0;
    V.stats.scene = i;
    if (SS.perf && !V.replay) SS.perf.log(A.now(), 16, i);
  };

  /** 0..1: how far into a journey. The picture gets denser and busier as it grows. */
  V.setProgress = (p) => { st.progress = Math.max(0, Math.min(1, p)); };

  /** 0 none, 1 lift, 2 sink: tension builds in the picture while a build is held. */
  V.setBuild = (v) => { st.building = v | 0; };

  /** The drop: flash, a hard zoom and spin, and the fog punched open. */
  V.drop = () => {
    st.building = 0;
    st.bld = 0;
    st.kick = 1;
    if (!reduce) { st.flash = 1; st.spin += 0.3; }
    punchFog();
  };

  V.setExpose = (on) => {
    if (!on && st.held && st.expose > 0.3 && !reduce) st.flash = 1;
    st.held = on;
  };

  /* ---- the squeegee ---- */
  /** One squeegee stroke segment. `size` (0.15 to 1.5, default 1) scales the blade: a pen's pressure makes it fine. */
  V.wipe = function (cx, cy, px, py, size) {
    const k = typeof size === 'number' && isFinite(size) ? Math.min(1.5, Math.max(0.15, size)) : 1;
    const x = cx * DPR, y = cy * DPR, ox = px * DPR, oy = py * DPR;
    const dx = x - ox, dy = y - oy;
    if (!dx && !dy) return;
    bladeAt = { x, y, dx, dy, t: performance.now() };

    gctx.save();
    gctx.globalCompositeOperation = 'destination-out';
    gctx.lineCap = 'round';
    gctx.lineWidth = 96 * k * DPR;
    gctx.strokeStyle = '#000';
    gctx.beginPath();
    gctx.moveTo(ox, oy);
    gctx.lineTo(x, y);
    gctx.stroke();
    gctx.restore();

    // drag the wet picture along with the blade
    const r = 90 * k * DPR;
    fctx.save();
    fctx.beginPath();
    fctx.arc(x, y, r, 0, TAU);
    fctx.clip();
    fctx.drawImage(fb, x - r, y - r, 2 * r, 2 * r, x - r + dx * 1.6, y - r + dy * 1.6, 2 * r, 2 * r);
    fctx.restore();
  };

  V.wipeEnd = () => {
    bladeAt = null;
  };

  function punchFog() {
    const g = gctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.34);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.save();
    gctx.globalCompositeOperation = 'destination-out';
    gctx.fillStyle = g;
    gctx.fillRect(0, 0, W, H);
    gctx.restore();
  }

  /* ---- events from the sequencer, released when the audio clock reaches them ---- */
  function pump() {
    const q = SS.events, now = A.now() - A.lag();       // events are released when they are HEARD, not when they are scheduled
    while (q.length && q[0].t <= now) {
      const e = q.shift();
      if (e.type === 'kick') {
        st.kick = 1;
        if (rings.length < 10) rings.push({ r: 20, a: 1 });
        punchFog();
      } else if (e.type === 'snare') {
        st.snare = 1;
        if (!reduce) st.spin += 0.08;
      } else if (e.type === 'ghost') {
        if (sparks.length < 240) sparks.push({ r: 60 + Math.random() * 420, k: Math.random(), a: 0.45, s: 4 + Math.random() * 4, shape: 'c' });
      } else if (e.type === 'hat') {
        for (let i = 0; i < 3 && sparks.length < 240; i++) sparks.push({ r: 60 + Math.random() * 420, k: Math.random(), a: 1, s: 6 + Math.random() * 10, shape: pick(['c', 'h', 's']) });
      } else if (e.type === 'cycle' && !V.replay && Math.random() < 0.6) {
        setN(pick(st.progress < 0.3 ? [6, 8] : st.progress < 0.7 ? [8, 10] : [10, 12]));   // more folds the further along you are
        if (SS.perf) SS.perf.log(now, 9, st.n);
      } else if (!V.replay && e.type === 'scene') {
        V.setScene(e.a);
      } else if (!V.replay && e.type === 'style') {
        V.setScene(SS.seq.scene);
      } else if (e.type === 'journey') {
        V.setProgress(e.a || 0);
      } else if (e.type === 'build') {
        V.setBuild(e.a ? 2 : 1);
      } else if (e.type === 'drop') {
        V.drop();
      }
      if (SS.onEvent) SS.onEvent(e);
    }
  }

  /* ---- scenes: drawn once per frame in a square, centre at (512,512). Only the wedge near angle 0..a is ever seen
     (the kaleidoscope folds it), so everything lives in that slice. ---- */
  const hash = (i, j, k) => {
    let h = (Math.imul(i + 7, 73856093) ^ Math.imul(j + 13, 19349663) ^ Math.imul(k + 3, 83492791)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    return (h % 10000) / 10000;
  };

  // 0. bead-chain tentacles with a sucker in every bead; more of them as the journey progresses
  function sceneTentacles(c, a, bass, p) {
    const count = 4 + Math.round(p * 4);
    for (let k = 0; k < count; k++) {
      const len = 30;
      for (let i = 0; i < len; i++) {
        const th = a * (0.5 + 0.38 * Math.sin(st.phase * 0.9 + i * 0.28 + k * 1.7));
        const rad = 40 + i * 15 + 8 * Math.sin(st.phase + i * 0.5 + k);
        const x = rad * Math.cos(th), y = rad * Math.sin(th);
        const br = 3 + (1 - i / len) * (16 + bass * 12);
        c.fillStyle = `rgba(235,235,235,${0.75 - i * 0.012})`;
        c.beginPath();
        c.arc(x, y, br, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(0,0,0,0.75)';
        c.beginPath();
        c.arc(x + br * 0.15, y + br * 0.15, br * 0.36, 0, TAU);
        c.fill();
      }
    }
  }

  // 1. a polar grid of circles, half-circles and squares that flip and swell in waves (pixel confetti)
  function sceneDots(c, a, bass, p) {
    const flip = Math.floor(st.phase * 1.6);
    for (let i = 0; i < 15; i++) {
      const r = 46 + i * 32, m = 3 + Math.floor(i * 0.55) + Math.round(p * 3);
      for (let j = 0; j < m; j++) {
        const h = hash(i, j, flip);
        const shape = Math.floor(h * 4);
        if (shape === 3 && p < 0.5) continue;
        const th = (a * (j + 0.5)) / m;
        const wave = 0.5 + 0.5 * Math.sin(st.phase * 1.1 - i * 0.45 + bass * 5);
        const sz = 3.5 + 9 * wave * (0.4 + 0.6 * h);
        c.fillStyle = `rgba(240,240,240,${0.25 + 0.6 * wave})`;
        const x = r * Math.cos(th), y = r * Math.sin(th);
        c.beginPath();
        if (shape === 0) c.arc(x, y, sz, 0, TAU);
        else if (shape === 1) c.arc(x, y, sz, th, th + Math.PI);
        else c.rect(x - sz, y - sz, sz * 2, sz * 2);
        c.fill();
      }
    }
  }

  // 2. strips of film frames marching outward, each exposed a different amount, with sprocket holes (a contact sheet)
  function sceneFilm(c, a, bass, p) {
    const lanes = 2 + Math.round(p * 2), tick = Math.floor(st.phase * 0.6);
    for (let k = 0; k < lanes; k++) {
      const th = (a * (k + 0.5)) / lanes;
      for (let n = 0; n < 10; n++) {
        const r = ((n * 62 + st.phase * 38) % 560) + 30;
        const w = 10 + r * 0.11, l = 14 + r * 0.16;
        const e = 0.25 + 0.7 * hash(n, k, tick);
        c.save();
        c.translate(r * Math.cos(th), r * Math.sin(th));
        c.rotate(th);
        c.fillStyle = `rgba(235,235,235,${(e * 0.5 * (1 - r / 720) + bass * 0.12).toFixed(3)})`;
        c.fillRect(-l / 2, -w / 2, l, w);
        c.strokeStyle = 'rgba(240,240,240,0.7)';
        c.lineWidth = 1.4;
        c.strokeRect(-l / 2, -w / 2, l, w);
        c.fillStyle = 'rgba(240,240,240,0.65)';
        for (let q = 0; q < 4; q++) {
          const sx = -l / 2 + 2 + q * (l / 4);
          c.fillRect(sx, -w / 2 - 4.5, 3, 3);
          c.fillRect(sx, w / 2 + 1.5, 3, 3);
        }
        c.restore();
      }
    }
  }

  // 3. fans of light: radiating lines, expanding arcs and rotating polygons (laser-like); more lines as it progresses
  function sceneSpokes(c, a, bass, p) {
    const spokes = 6 + Math.round(p * 8);
    c.lineWidth = 1.6;
    for (let s = 0; s < spokes; s++) {
      const th = a * (s / (spokes - 1)) + 0.03 * Math.sin(st.phase + s);
      const len = 120 + 360 * (0.5 + 0.5 * Math.sin(st.phase * 1.3 + s * 0.9)) * (0.5 + bass);
      const r0 = 26 + (s % 2 ? 20 : 0);
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.moveTo(r0 * Math.cos(th), r0 * Math.sin(th));
      c.lineTo((r0 + len) * Math.cos(th), (r0 + len) * Math.sin(th));
      c.stroke();
    }
    for (let q = 0; q < 6; q++) {
      const r = ((q * 90 + st.phase * 70) % 540) + 30;
      c.strokeStyle = `rgba(255,255,255,${(0.6 * (1 - r / 600)).toFixed(3)})`;
      c.beginPath();
      c.arc(0, 0, r, 0, a);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    for (let m = 0; m < 3; m++) {
      const sides = 3 + m, rot = st.phase * (0.25 + m * 0.1), rad = 120 + m * 110 + 20 * Math.sin(st.phase + m);
      c.beginPath();
      for (let v = 0; v <= sides; v++) {
        const ang = rot + (v / sides) * TAU;
        if (v) c.lineTo(rad * Math.cos(ang), rad * Math.sin(ang)); else c.moveTo(rad * Math.cos(ang), rad * Math.sin(ang));
      }
      c.stroke();
    }
  }

  const SCENES = [sceneTentacles, sceneDots, sceneFilm, sceneSpokes];

  function drawScene(bass) {
    const c = cctx, a = TAU / st.n, p = st.progress;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, SC, SC);
    c.translate(SC / 2, SC / 2);

    if (st.mix < 1) {                                   // crossfading from the last picture to this one
      c.save(); c.globalAlpha = 1 - st.mix; SCENES[st.prevScene](c, a, bass, p); c.restore();
      c.save(); c.globalAlpha = st.mix; SCENES[st.scene](c, a, bass, p); c.restore();
    } else {
      SCENES[st.scene](c, a, bass, p);
    }

    // a ring of dots per kick, travelling outward (in every scene)
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.r += 7 + g.r * 0.02;
      g.a -= 0.012;
      if (g.a <= 0 || g.r > 520) {
        rings.splice(i, 1);
        continue;
      }
      const count = Math.max(6, Math.floor((TAU * g.r) / 26));
      c.fillStyle = `rgba(255,255,255,${g.a})`;
      for (let j = 0; j < count; j++) {
        const th = (j / count) * TAU;
        c.beginPath();
        c.arc(g.r * Math.cos(th), g.r * Math.sin(th), 3 + g.a * 4, 0, TAU);
        c.fill();
      }
    }

    // hat confetti: circles, half-circles and squares (in every scene)
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.a -= 0.03;
      if (s.a <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      const th = s.k * a;
      c.fillStyle = `rgba(255,255,255,${s.a})`;
      c.save();
      c.translate(s.r * Math.cos(th), s.r * Math.sin(th));
      c.beginPath();
      if (s.shape === 'c') c.arc(0, 0, s.s / 2, 0, TAU);
      else if (s.shape === 'h') c.arc(0, 0, s.s / 2, 0, Math.PI);
      else c.rect(-s.s / 2, -s.s / 2, s.s, s.s);
      c.fill();
      c.restore();
    }
  }

  function kaleido(ctx, rot) {
    const n = st.n, a = TAU / n, s = R / (SC / 2), eps = 0.003;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    for (let k = 0; k < n; k++) {
      ctx.save();
      if (k % 2) {
        ctx.rotate(rot + (k + 1) * a);
        ctx.scale(1, -1);
      } else {
        ctx.rotate(rot + k * a);
      }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 1.02, -eps, a + eps);
      ctx.closePath();
      ctx.clip();
      ctx.scale(s, s);
      ctx.drawImage(scene, -SC / 2, -SC / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  let acc = 0, accN = 0, statsAt = 0;
  const prof = { sim: 0, compose: 0, finish: 0 };

  function frame(ms) {
    requestAnimationFrame(frame);                       // schedule first: an error below must never stop the loop
    if (eco && ms - lastDraw < 25) return;              // eco: every other frame on a 60 Hz screen
    lastDraw = ms;
    const raw = (ms - last) / 1000;
    last = ms;
    const dt = Math.min(0.05, raw || 0.016);
    const t0 = performance.now();
    try {
      draw(dt);
    } catch (err) {
      V.stats.errors++;
      if (V.stats.errors === 1) console.error('DevelopDrop: a frame failed and was skipped', err);
    }
    // performance bookkeeping (ignore the gap when the tab was hidden)
    if (raw > 0 && raw < 0.25) {
      acc += raw; accN++;
      V.stats.frameMs = V.stats.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    }
    if (ms - statsAt > 1000 && accN) {
      const fps = accN / acc;
      V.stats.fps = Math.round(fps);
      V.stats.sections = { sim: +prof.sim.toFixed(1), compose: +prof.compose.toFixed(1), finish: +prof.finish.toFixed(1) };
      acc = 0; accN = 0; statsAt = ms;
      if (eco) { slowSecs = 0; goodSecs = 0; return; }   // the quality manager judges full-speed frames only
      slowSecs = fps < SLOW_FPS ? slowSecs + 1 : 0;
      goodSecs = fps >= GOOD_FPS ? goodSecs + 1 : Math.max(0, goodSecs - 10);
      V.stats.recovery = mode === 'auto' && level < 2 ? Math.min(100, Math.round((goodSecs / V.recoverAfter) * 100)) : 0;
      if (mode === 'auto' && slowSecs >= SLOW_SECONDS && level > 0) {
        // frames stay slow: step down. If we had only just stepped UP, this machine can't hold it: stop trying for a while.
        if (ms - lastUp < 180000) noUpUntil = ms + 15 * 60 * 1000;
        V.stats.downgrades++;
        slowSecs = 0; goodSecs = 0;
        applyLevel(level - 1);
      } else if (mode === 'auto' && level < 2 && goodSecs >= V.recoverAfter && ms > noUpUntil) {
        V.stats.upgrades++;
        goodSecs = 0;
        lastUp = ms;
        applyLevel(level + 1);
      }
    }
  }

  function draw(dt) {
    const p0 = performance.now();
    if (!W || !H || !fb.width || !fb.height) return;   // mid-resize or hidden pane: nothing to draw into
    st.t += dt;
    if (A.ready) pump();

    const lv = A.level();
    const idle = !A.ready;
    const bass = idle ? 0.12 + 0.08 * Math.sin(st.t * 0.9) : lv.bass;
    st.phase += dt * (0.5 + bass * 2.2);
    st.kick *= Math.pow(0.02, dt);
    st.snare *= Math.pow(0.05, dt);
    st.flash *= Math.pow(0.002, dt);
    st.expose += ((st.held ? 1 : 0) - st.expose) * Math.min(1, dt * (st.held ? 0.7 : 5));
    st.bld += ((st.building ? 1 : 0) - st.bld) * Math.min(1, dt * (st.building ? 0.4 : 6));
    st.mix = Math.min(1, st.mix + dt / 2.2);
    const tension = Math.max(st.expose, st.bld);
    for (let i = 0; i < 3; i++) st.tint[i] += (st.tintTo[i] - st.tint[i]) * Math.min(1, dt * 4);

    // 1. feedback tunnel
    fctx.globalCompositeOperation = 'source-over';
    fctx.globalAlpha = 1;
    fctx.save();
    fctx.translate(W / 2, H / 2);
    fctx.rotate((reduce ? 0.0005 : 0.003 + st.progress * 0.002) + st.spin * 0.02);
    const z = 1.012 + st.kick * 0.02 + tension * 0.025 + st.progress * 0.004;
    fctx.scale(z, z);
    fctx.translate(-W / 2, -H / 2);
    fctx.drawImage(fb, 0, 0);
    fctx.restore();
    st.spin *= 0.9;
    fctx.fillStyle = 'rgba(0,0,0,0.07)';
    fctx.fillRect(0, 0, W, H);

    // 2. fold the scene in
    drawScene(bass);
    fctx.globalAlpha = 0.5 + bass * 0.3;
    kaleido(fctx, st.t * (reduce ? 0.01 : 0.05) + st.spin);
    fctx.globalAlpha = 1;

    const p1 = performance.now();
    prof.sim = prof.sim * 0.9 + (p1 - p0) * 0.1;

    // 3. compose: tint, glow, fog, grain
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = 1;
    sctx.drawImage(fb, 0, 0);
    sctx.globalCompositeOperation = 'multiply';
    sctx.fillStyle = rgb(st.tint);
    sctx.fillRect(0, 0, W, H);

    const glow = 0.12 + st.kick * 0.22 + tension * 0.3 + st.progress * 0.06;
    const gr = sctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.7);
    gr.addColorStop(0, rgb(st.tint, glow));
    gr.addColorStop(1, rgb(st.tint, 0));
    sctx.globalCompositeOperation = 'screen';
    sctx.fillStyle = gr;
    sctx.fillRect(0, 0, W, H);

    gctx.globalCompositeOperation = 'source-over';
    gctx.fillStyle = 'rgba(0,0,0,0.02)';
    gctx.fillRect(0, 0, W, H);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = Math.max(0.1, (idle ? 0.8 : 0.86) - tension * 0.5 - st.kick * 0.12);
    sctx.drawImage(fog, 0, 0);
    sctx.globalAlpha = 1;

    if (st.bld > 0.02 && st.building !== 1) {
      sctx.fillStyle = `rgba(0,0,0,${(0.45 * st.bld).toFixed(3)})`;
      sctx.fillRect(0, 0, W, H);
    }

    const p2 = performance.now();
    prof.compose = prof.compose * 0.9 + (p2 - p1) * 0.1;

    if (LEVELS[level].grain) {
      sctx.save();
      sctx.globalCompositeOperation = 'soft-light';
      sctx.globalAlpha = 0.35;
      sctx.translate(-Math.random() * 200, -Math.random() * 200);
      sctx.fillStyle = grain;
      sctx.fillRect(0, 0, W + 200, H + 200);
      sctx.restore();
    }

    if (st.flash > 0.01) {
      sctx.globalCompositeOperation = 'screen';
      sctx.fillStyle = `rgba(255,244,230,${st.flash * 0.85})`;
      sctx.fillRect(0, 0, W, H);
    }

    // the blade itself: a thin line of light across the direction of travel
    if (bladeAt && performance.now() - bladeAt.t < 120) {
      const len = Math.hypot(bladeAt.dx, bladeAt.dy) || 1;
      const nx = -bladeAt.dy / len, ny = bladeAt.dx / len, h = 48 * DPR;
      sctx.globalCompositeOperation = 'source-over';
      sctx.strokeStyle = 'rgba(255,236,226,0.75)';
      sctx.lineWidth = 2 * DPR;
      sctx.beginPath();
      sctx.moveTo(bladeAt.x - nx * h, bladeAt.y - ny * h);
      sctx.lineTo(bladeAt.x + nx * h, bladeAt.y + ny * h);
      sctx.stroke();
    }
    prof.finish = prof.finish * 0.9 + (performance.now() - p2) * 0.1;
  }
})(window.SS);
