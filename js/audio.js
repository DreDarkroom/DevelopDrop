/* SquidgySqueegee — audio engine.
   One mono analogue-style voice (2 saws + square sub -> tanh drive -> 24dB ladder-ish filter),
   three drum voices, and a tray (echo + room) they can all be dipped in. */
(function (SS) {
  'use strict';

  const A = (SS.audio = { ready: false });
  const P = (A.params = {
    cutoff: 0.42, reso: 0.4, decay: 0.38, drive: 0.3, glide: 0.18, space: 0.3,
    tempo: 119, mod: 0.5, lift: 0, breath: 0, root: 45,
  });

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const cutHz = (x) => 50 * Math.pow(2, clamp(x, 0, 1) * 7.6); // 0..1 -> 50Hz..~9.7kHz

  let ctx, dry, fxIn, comp, limiter, analyser, bins, noiseBuf, voice, echo, squeak, rise, mediaDest;

  A.now = () => (ctx ? ctx.currentTime : 0);
  A.ctx = () => ctx;
  A.tapSource = () => limiter;                 // final, limited output: what recordings capture
  A.resume = () => (ctx ? ctx.resume() : Promise.resolve());
  A.onState = null;                            // set by the UI: called with 'running' | 'suspended' | 'interrupted' | 'closed'
  A.hook = null;                               // set by the performance recorder: (audioTime, code, ...args)
  const hook = (t, code, ...args) => { if (A.hook) A.hook(t, code, ...args); };
  const r2 = (v) => Math.round(v * 100) / 100;

  /** Everything the final output goes through, as a stream (used for video capture). */
  A.stream = function () {
    if (!ctx) return null;
    if (!mediaDest) {
      mediaDest = ctx.createMediaStreamDestination();
      limiter.connect(mediaDest);
    }
    return mediaDest.stream;
  };

  A.info = () => (ctx ? { state: ctx.state, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency || 0 } : null);

  A.init = async function () {
    if (ctx) return ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    // MP3 encoders only speak 32 / 44.1 / 48 kHz; if the device runs at something else (e.g. 96 kHz), ask for 48 kHz.
    if (![32000, 44100, 48000].includes(ctx.sampleRate)) {
      await ctx.close();
      ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
    }
    ctx.onstatechange = () => { if (A.onState) A.onState(ctx.state); };

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.008;
    comp.release.value = 0.22;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    // A last line of defence for a loud PA and for recordings: a fast, hard compressor that catches peaks.
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;
    bins = new Uint8Array(analyser.frequencyBinCount);
    comp.connect(master);
    master.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(ctx.destination);

    dry = ctx.createGain();
    dry.connect(comp);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    buildTray();
    buildVoice();
    buildSqueak();
    A.ready = true;
    return ctx.resume();
  };

  /* ---- the tray: dotted-eighth echo that darkens every pass, plus a noise-tail room ---- */
  function buildTray() {
    fxIn = ctx.createGain();
    echo = ctx.createDelay(2);
    echo.delayTime.value = (0.75 * 60) / P.tempo;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    fxIn.connect(echo);
    echo.connect(tone);
    tone.connect(fb);
    fb.connect(echo);
    tone.connect(comp);

    const room = ctx.createConvolver();
    room.buffer = impulse(2.8, 2.6);
    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.5;
    fxIn.connect(room);
    room.connect(roomOut);
    roomOut.connect(comp);
  }

  function impulse(sec, curve) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, curve);
    }
    return buf;
  }

  /* ---- the voice ---- */
  function driveCurve(d) {
    const n = 512, c = new Float32Array(n), k = 1 + d * 10, norm = Math.tanh(k);
    for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
    return c;
  }

  function buildVoice() {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const sub = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o2.detune.value = 9;
    sub.type = 'square';

    const mix = ctx.createGain();
    for (const [o, lvl] of [[o1, 0.34], [o2, 0.34], [sub, 0.28]]) {
      const g = ctx.createGain();
      g.gain.value = lvl;
      o.connect(g);
      g.connect(mix);
      o.start();
    }

    const shaper = ctx.createWaveShaper();
    shaper.oversample = '2x';
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'lowpass';
    f2.Q.value = 0.5;
    f1.frequency.value = f2.frequency.value = cutHz(P.cutoff);
    const vca = ctx.createGain();
    vca.gain.value = 0;
    const send = ctx.createGain();

    mix.connect(shaper);
    shaper.connect(f1);
    f1.connect(f2);
    f2.connect(vca);
    vca.connect(dry);
    vca.connect(send);
    send.connect(fxIn);

    voice = { o1, o2, sub, f1, f2, vca, send, shaper };
    for (const k of ['reso', 'drive', 'space']) A.setParam(k, P[k]);
  }

  A.setParam = function (k, val) {
    P[k] = val;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (typeof val === 'number' && k !== 'breath') hook(t, 5, k, Math.round(val * 1000) / 1000);
    if (k === 'reso') voice.f1.Q.setTargetAtTime(0.7 + val * val * 16, t, 0.02);
    else if (k === 'drive') voice.shaper.curve = driveCurve(val);
    else if (k === 'space') voice.send.gain.setTargetAtTime(val * 0.9, t, 0.02);
    else if (k === 'tempo') echo.delayTime.setTargetAtTime((0.75 * 60) / val, t, 0.05);
  };

  A.noteOn = function (t, midi, vel, accent, baseOverride) {
    if (!ctx) return;
    const f = mtof(midi);
    const tau = 0.004 + P.glide * 0.09;
    voice.o1.frequency.setTargetAtTime(f, t, tau);
    voice.o2.frequency.setTargetAtTime(f, t, tau);
    voice.sub.frequency.setTargetAtTime(f / 2, t, tau);

    const base = baseOverride != null ? baseOverride : cutHz(P.cutoff + (P.mod - 0.5) * 0.6 + P.lift + P.breath);
    hook(t, 0, midi, r2(vel), accent ? 1 : 0, Math.round(base * 10) / 10);
    const peak = Math.min(base * Math.pow(2, 2.5 + (accent ? 1.2 : 0)), 14000);
    const dec = 0.03 + P.decay * 0.32;
    for (const fl of [voice.f1, voice.f2]) {
      fl.frequency.cancelScheduledValues(t);
      fl.frequency.setTargetAtTime(peak, t, 0.003);
      fl.frequency.setTargetAtTime(base, t + 0.02, dec);
    }
    voice.vca.gain.cancelScheduledValues(t);
    voice.vca.gain.setTargetAtTime(vel, t, 0.004);
  };

  A.noteOff = function (t) {
    if (!ctx) return;
    hook(t, 1);
    voice.vca.gain.cancelScheduledValues(t);
    voice.vca.gain.setTargetAtTime(0, t, 0.05);
  };

  A.note = function (t, midi, vel, dur, accent) {
    A.noteOn(t, midi, vel, accent);
    A.noteOff(t + dur);
  };

  /* ---- drums ---- */
  function route(node, send) {
    node.connect(dry);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(fxIn);
    }
  }

  function burst(t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.value = o.freq;
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    src.connect(f);
    f.connect(g);
    route(g, o.send || 0);
    src.start(t, Math.random() * 1.5, o.dur + 0.05);
  }

  A.kick = function (t, vel = 1) {
    if (!ctx) return;
    hook(t, 2, r2(vel));
    kickImpl(t, vel);
  };

  function kickImpl(t, vel) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g);
    route(g, 0);
    o.start(t);
    o.stop(t + 0.52);
    burst(t, { type: 'highpass', freq: 2500, dur: 0.012, gain: 0.25 * vel });
  }

  A.snare = function (t, vel = 1) {
    if (!ctx) return;
    hook(t, 3, r2(vel));
    burst(t, { type: 'bandpass', freq: 1900, q: 0.9, dur: 0.16, gain: 0.55 * vel, send: 0.18 * P.space });
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    g.gain.setValueAtTime(0.4 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g);
    route(g, 0);
    o.start(t);
    o.stop(t + 0.13);
  };

  A.hat = function (t, vel = 1, open) {
    if (!ctx) return;
    hook(t, 4, r2(vel), open ? 1 : 0);
    burst(t, { type: 'highpass', freq: 7500, dur: open ? 0.22 : 0.045, gain: (open ? 0.22 : 0.3) * vel });
  };

  /* ---- the squeegee's squeak: filtered noise following the drag ---- */
  function buildSqueak() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 14;
    bp.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp);
    bp.connect(g);
    g.connect(dry);
    src.start();
    squeak = { bp, g };
  }

  let lastSqueak = { t: -1, s: -1, x: -1 };
  A.squeak = function (speed, x = 0.5) {
    if (!squeak) return;
    const t = ctx.currentTime;
    if (speed === 0 || t - lastSqueak.t > 0.04 || Math.abs(speed - lastSqueak.s) > 0.15 || Math.abs(x - lastSqueak.x) > 0.03) {
      hook(t, 10, r2(speed), r2(x));
      lastSqueak = { t, s: speed, x };
    }
    squeak.g.gain.setTargetAtTime(clamp(speed, 0, 1) * 0.09, t, 0.03);
    squeak.bp.frequency.setTargetAtTime(900 + x * 2800, t, 0.03);
  };

  /* ---- exposure: hold to build a riser, release for the drop ---- */
  A.expose = function (on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    hook(t, 6, on ? 1 : 0);
    if (on && !rise) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 4;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(8000, t + 5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.2, t + 5);
      src.connect(bp);
      bp.connect(g);
      route(g, 0.4);
      src.start(t);
      rise = { src, g };
      P.lift = 0.3;
    } else if (!on && rise) {
      rise.g.gain.cancelScheduledValues(t);
      rise.g.gain.setTargetAtTime(0, t, 0.04);
      rise.src.stop(t + 0.4);
      rise = null;
      P.lift = 0;
      burst(t, { type: 'highpass', freq: 2500, dur: 1.6, gain: 0.35, send: 0.5 });
      kickImpl(t, 1);   // internal: the expose event itself is what gets recorded
    }
  };

  A.level = function () {
    if (!analyser) return { bass: 0, mid: 0, high: 0 };
    analyser.getByteFrequencyData(bins);
    const avg = (a, b) => {
      let s = 0;
      for (let i = a; i < b; i++) s += bins[i];
      return s / ((b - a) * 255);
    };
    return { bass: avg(1, 6), mid: avg(6, 40), high: avg(40, 200) };
  };
})((window.SS = window.SS || { events: [] }));
