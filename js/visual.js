/* SquidgySqueegee — the picture.
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
  let mode = 'auto', level = 2, slowSecs = 0, goodSecs = 0, lastUp = -1e9, noUpUntil = 0;
  V.replay = false;                      // the player sets this: the recording decides the kaleidoscope, not chance
  V.stats = { fps: 0, frameMs: 0, level: 'high', mode: 'auto', downgrades: 0, upgrades: 0, recovery: 0, errors: 0, sections: {} };

  const setN = (n) => { st.n = Math.min(n, LEVELS[level].maxN); };
  V.setKaleido = setN;

  function applyLevel(i) {
    level = Math.max(0, Math.min(LEVELS.length - 1, i));
    st.n = Math.min(st.n, LEVELS[level].maxN);
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
    DPR = Math.min(window.devicePixelRatio || 1, LEVELS[level].scale);
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

  V.setExpose = (on) => {
    if (!on && st.held && st.expose > 0.3 && !reduce) st.flash = 1;
    st.held = on;
  };

  /* ---- the squeegee ---- */
  V.wipe = function (cx, cy, px, py) {
    const x = cx * DPR, y = cy * DPR, ox = px * DPR, oy = py * DPR;
    const dx = x - ox, dy = y - oy;
    if (!dx && !dy) return;
    bladeAt = { x, y, dx, dy, t: performance.now() };

    gctx.save();
    gctx.globalCompositeOperation = 'destination-out';
    gctx.lineCap = 'round';
    gctx.lineWidth = 96 * DPR;
    gctx.strokeStyle = '#000';
    gctx.beginPath();
    gctx.moveTo(ox, oy);
    gctx.lineTo(x, y);
    gctx.stroke();
    gctx.restore();

    // drag the wet picture along with the blade
    const r = 90 * DPR;
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
    const q = SS.events, now = A.now();
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
        setN(pick([6, 8, 10, 12]));
        if (SS.perf) SS.perf.log(now, 9, st.n);
      }
      if (SS.onEvent) SS.onEvent(e);
    }
  }

  /* ---- scene: drawn once per frame in a square, centre at (512,512) ---- */
  function drawScene(bass) {
    const c = cctx, a = TAU / st.n;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, SC, SC);
    c.translate(SC / 2, SC / 2);

    // bead-chain tentacles with a sucker in every bead
    for (let k = 0; k < 4; k++) {
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

    // a ring of dots per kick, travelling outward
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

    // hat confetti: circles, half-circles and squares
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
    const raw = (ms - last) / 1000;
    last = ms;
    const dt = Math.min(0.05, raw || 0.016);
    const t0 = performance.now();
    try {
      draw(dt);
    } catch (err) {
      V.stats.errors++;
      if (V.stats.errors === 1) console.error('SquidgySqueegee: a frame failed and was skipped', err);
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
    for (let i = 0; i < 3; i++) st.tint[i] += (st.tintTo[i] - st.tint[i]) * Math.min(1, dt * 4);

    // 1. feedback tunnel
    fctx.globalCompositeOperation = 'source-over';
    fctx.globalAlpha = 1;
    fctx.save();
    fctx.translate(W / 2, H / 2);
    fctx.rotate((reduce ? 0.0005 : 0.003) + st.spin * 0.02);
    const z = 1.012 + st.kick * 0.02 + st.expose * 0.025;
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

    const glow = 0.12 + st.kick * 0.22 + st.expose * 0.3;
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
    sctx.globalAlpha = Math.max(0.1, (idle ? 0.8 : 0.86) - st.expose * 0.5 - st.kick * 0.12);
    sctx.drawImage(fog, 0, 0);
    sctx.globalAlpha = 1;

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
