/* DevelopDrop — playback of a recorded performance (.sqz).
   One engine, used by the player page and by the instrument itself (drop a file on the page). It re-plays what the
   instrument did, every note and drum hit on the audio clock and every knob, light, picture and squeegee move, through
   the same synth and visuals as the live instrument. No DOM in here. */
(function (SS) {
  'use strict';

  const A = SS.audio, V = SS.visual, P = SS.perf;
  const K = P.CODES;

  const PB = (SS.playback = { perf: null, playing: false, onEnd: null, onChange: null });
  let idx = 0, T0 = 0, clock = null;
  let needsSeek = true, startAt = 0;      // until the first play there is no audio clock to anchor the performance to

  const emit = (t, type, a) => {
    const q = SS.events;
    q.push({ t, type, a });
    if (q.length > 400) q.splice(0, q.length - 400);
  };

  function setLight(i) {
    V.setLight(i);
    document.documentElement.style.setProperty('--tint-rgb', SS.seq.lights[i].tint.join(','));
  }

  /* each event code -> what to do; `at` is the audio-clock time it should happen */
  const handlers = {
    [K.noteOn]: (at, midi, vel, accent, base) => A.noteOn(at, midi, vel, !!accent, base),
    [K.noteOff]: (at) => A.noteOff(at),
    [K.kick]: (at, v) => { A.kick(at, v); emit(at, 'kick'); },
    [K.snare]: (at, v) => { A.snare(at, v); emit(at, 'snare'); },
    [K.hat]: (at, v, open) => { A.hat(at, v, !!open); emit(at, v < 0.3 ? 'ghost' : 'hat'); },
    [K.param]: (at, key, v) => A.setParam(key, v),
    [K.expose]: (at, on) => { A.expose(!!on); V.setExpose(!!on); },
    [K.light]: (at, i) => setLight(i),
    [K.wipe]: (at, x, y, px, py, size) => V.wipe(x * innerWidth, y * innerHeight, px * innerWidth, py * innerHeight, size),
    [K.kaleido]: (at, n) => V.setKaleido(n),
    [K.squeak]: (at, speed, x) => A.squeak(speed, x),
    [K.sweep]: (at, which, hz, secs) => A.sweep(which ? 'lp' : 'hp', hz, at, secs),
    [K.gap]: (at, secs) => A.gap(at, secs),
    [K.impact]: (at, size) => { A.impact(at, size); emit(at, 'drop'); },
    [K.riser]: (at, on, variant) => { A.riser(!!on, variant, at); if (on) emit(at, 'build', variant); else V.setBuild(0); },
    [K.kit]: (at, i) => { if (A.kitNames[i]) A.setKit(A.kitNames[i]); },
    [K.scene]: (at, i) => V.setScene(i),
  };

  /* bring every setting to what it was at time t (used at the start and after a seek) */
  function applyState(t) {
    const st = P.stateAt(PB.perf.events, t), snap = PB.perf.snapshot || {};
    const now = A.now();
    A.noteOff(now);
    A.squeak(0);
    A.riser(false, 0, now);
    A.openUp(now, 0);                        // a seek can land mid-build: start from open filters
    if (snap.kit && A.kits[snap.kit]) A.setKit(snap.kit);
    for (const [k, v] of Object.entries(snap.params || {})) if (typeof v === 'number') A.setParam(k, v);
    for (const [k, v] of Object.entries(st.params)) A.setParam(k, v);
    if (st.kit != null && A.kitNames[st.kit]) A.setKit(A.kitNames[st.kit]);
    setLight(st.light != null ? st.light : (SS.seq.lights[snap.light] ? snap.light : 0));
    V.setKaleido(st.kaleido || 8);
    V.setScene(st.scene != null ? st.scene : (Number.isInteger(snap.scene) ? snap.scene : 0));
    V.setBuild(0);
    A.expose(false);
    V.setExpose(false);
    if (st.expose) { A.expose(true); V.setExpose(true); }
  }

  PB.position = () => (!PB.perf ? 0 : !A.ready || needsSeek ? startAt : Math.min(PB.perf.duration, Math.max(0, A.now() - T0)));

  PB.seek = (t) => {
    if (!PB.perf) return;
    t = Math.min(PB.perf.duration, Math.max(0, t));
    idx = P.indexAt(PB.perf.events, t);
    if (!A.ready) { startAt = t; needsSeek = true; changed(); return; }
    applyState(t);
    T0 = A.now() + 0.15 - t;                 // audio time at which the performance's t=0 would have happened
    needsSeek = false;
    changed();
  };

  const changed = () => { if (PB.onChange) PB.onChange(); };

  function tick() {
    if (!PB.playing || !PB.perf) return;
    const now = A.now();
    idx = P.pump(PB.perf.events, idx, now, T0, handlers, A.lookahead);
    if (now - T0 >= PB.perf.duration + 1.5) finish();
    changed();
  }

  function finish() {
    PB.playing = false;
    if (clock) clock.stop();
    A.noteOff(A.now());
    A.riser(false, 0, A.now());
    A.expose(false);
    V.setExpose(false);
    changed();
    if (PB.onEnd) PB.onEnd();
  }

  PB.play = async () => {
    if (!PB.perf) return;
    if (!A.ready) await A.init();
    await A.resume();
    const atEnd = !needsSeek && PB.position() >= PB.perf.duration - 0.05;
    if (needsSeek || atEnd) PB.seek(atEnd ? 0 : startAt);
    PB.playing = true;
    clock = clock || SS.seq.makeClock(tick);    // a background-thread heartbeat: keeps time even if this tab is covered
    clock.start();
    changed();
  };

  PB.pause = async () => {
    PB.playing = false;
    if (clock) clock.stop();
    try { await A.ctx().suspend(); } catch (err) { /* nothing to pause */ }
    changed();
  };

  PB.toggle = () => (PB.playing ? PB.pause() : PB.play());

  /** Leave playback altogether (the instrument takes the audio back). */
  PB.close = async () => {
    PB.playing = false;
    if (clock) clock.stop();
    if (A.ready) {
      A.noteOff(A.now());
      A.riser(false, 0, A.now());
      A.expose(false);
      try { await A.resume(); } catch (err) { /* fine */ }
    }
    V.setExpose(false);
    V.setBuild(0);
    V.replay = false;
    PB.perf = null;
    changed();
  };

  /** bytes of a .sqz (gzip or plain JSON) -> loaded. Throws a readable error if it is not a performance. */
  PB.load = async (bytes) => {
    const doc = await P.decode(bytes);
    if (PB.playing) await PB.pause();
    PB.perf = doc;
    V.replay = true;
    SS.events.length = 0;
    idx = 0;
    startAt = 0;
    needsSeek = true;
    if (A.ready) PB.seek(0);                 // otherwise audio is created on the first play (browsers need a click for that)
    changed();
    return doc;
  };
})(window.SS);
