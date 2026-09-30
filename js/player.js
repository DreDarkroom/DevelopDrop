/* SquidgySqueegee — the performance player.
   Loads a .sqz file and re-plays what the instrument did: every note and drum hit on the audio clock, every knob move,
   light change and squeegee stroke, through the same synth and visuals as the live instrument. */
(function (SS) {
  'use strict';

  const A = SS.audio, V = SS.visual, P = SS.perf;
  const K = P.CODES;
  const $ = (s) => document.querySelector(s);
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}` : `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };

  let perf = null, idx = 0, T0 = 0, playing = false, clock = null, idleTimer = 0, dragging = false;
  let needsSeek = true, startAt = 0;      // until the first Play there is no audio clock to anchor the performance to

  let toastTimer = 0;
  function toast(msg, ms = 4500) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  const emit = (t, type) => {
    const q = SS.events;
    q.push({ t, type });
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
    [K.wipe]: (at, x, y, px, py) => V.wipe(x * innerWidth, y * innerHeight, px * innerWidth, py * innerHeight),
    [K.kaleido]: (at, n) => V.setKaleido(n),
    [K.squeak]: (at, speed, x) => A.squeak(speed, x),
  };

  /* bring every setting to what it was at time t (used at the start and after a seek) */
  function applyState(t) {
    const st = P.stateAt(perf.events, t), snap = perf.snapshot || {};
    A.noteOff(A.now());
    A.squeak(0);
    for (const [k, v] of Object.entries(snap.params || {})) if (typeof v === 'number') A.setParam(k, v);
    for (const [k, v] of Object.entries(st.params)) A.setParam(k, v);
    setLight(st.light != null ? st.light : (SS.seq.lights[snap.light] ? snap.light : 0));
    V.setKaleido(st.kaleido || 8);
    A.expose(false);
    V.setExpose(false);
    if (st.expose) { A.expose(true); V.setExpose(true); }
  }

  const position = () => (!perf ? 0 : !A.ready || needsSeek ? startAt : Math.min(perf.duration, Math.max(0, A.now() - T0)));

  function seek(t) {
    if (!perf) return;
    t = Math.min(perf.duration, Math.max(0, t));
    idx = P.indexAt(perf.events, t);
    if (!A.ready) { startAt = t; needsSeek = true; paint(); return; }
    applyState(t);
    T0 = A.now() + 0.15 - t;                 // audio time at which the performance's t=0 would have happened
    needsSeek = false;
    paint();
  }

  function tick() {
    if (!playing || !perf) return;
    const now = A.now();
    idx = P.pump(perf.events, idx, now, T0, handlers);
    if (now - T0 >= perf.duration + 1.5) finish();
    paint();
  }

  function finish() {
    playing = false;
    if (clock) clock.stop();
    A.noteOff(A.now());
    A.expose(false);
    V.setExpose(false);
    $('#play').textContent = '▶';
    $('#play').setAttribute('aria-label', 'Play again');
    paint();
  }

  function paint() {
    if (!perf) return;
    const p = position();
    if (!dragging) $('#seek').value = p;
    $('#time').textContent = `${fmt(p)} / ${fmt(perf.duration)}`;
  }

  async function play() {
    if (!perf) return;
    if (!A.ready) await A.init();
    await A.resume();
    const atEnd = !needsSeek && position() >= perf.duration - 0.05;
    if (needsSeek || atEnd) seek(atEnd ? 0 : startAt);
    playing = true;
    clock = clock || SS.seq.makeClock(tick);    // a background-thread heartbeat: keeps time even if this tab is covered
    clock.start();
    $('#play').textContent = '❚❚';
    $('#play').setAttribute('aria-label', 'Pause');
    poke();
  }

  async function pause() {
    playing = false;
    if (clock) clock.stop();
    try { await A.ctx().suspend(); } catch (err) { /* nothing to pause */ }
    $('#play').textContent = '▶';
    $('#play').setAttribute('aria-label', 'Play');
    poke();
  }

  const toggle = () => (playing ? pause() : play());

  /* ---- loading ---- */
  async function load(bytes, name) {
    let doc;
    try {
      doc = await P.decode(bytes);
    } catch (err) {
      toast(`${name || 'That file'}: ${err.message}`);
      return false;
    }
    if (playing) await pause();
    perf = doc;
    V.replay = true;
    SS.events.length = 0;
    $('#drop').hidden = true;
    $('#bar').hidden = false;
    $('#seek').max = perf.duration;
    $('#ptitle').textContent = `${name ? name + ' · ' : ''}${fmt(perf.duration)} · ${perf.events.length.toLocaleString()} events`;
    idx = 0;
    startAt = 0;
    needsSeek = true;
    if (A.ready) seek(0);                     // otherwise audio is created on the first Play (browsers need a click for that)
    paint();
    poke();
    return true;
  }

  async function loadFile(f) {
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) return toast('That file is too large to be a performance.');
    return load(new Uint8Array(await f.arrayBuffer()), f.name);
  }

  /* ---- the little bar hides itself while it isn't needed ---- */
  function poke() {
    const bar = $('#bar');
    bar.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (playing && !dragging) bar.classList.add('idle'); }, 3000);
  }

  function init() {
    V.init();
    const pick = $('#pick');
    $('#open').addEventListener('click', () => pick.click());
    $('#open2').addEventListener('click', () => pick.click());
    $('#demo').addEventListener('click', async () => {
      try {
        const r = await fetch('examples/demo.sqz');
        if (!r.ok) throw new Error(`could not fetch it (${r.status})`);
        if (await load(new Uint8Array(await r.arrayBuffer()), 'demo.sqz')) play();
      } catch (err) { toast(`Demo: ${err.message}`); }
    });
    pick.addEventListener('change', () => { const f = pick.files[0]; pick.value = ''; loadFile(f); });
    $('#play').addEventListener('click', toggle);
    $('#hide').addEventListener('click', () => document.body.classList.add('clean'));
    const seekBar = $('#seek');
    seekBar.addEventListener('input', () => { dragging = true; $('#time').textContent = `${fmt(+seekBar.value)} / ${fmt(perf.duration)}`; });
    seekBar.addEventListener('change', () => { dragging = false; seek(+seekBar.value); });
    addEventListener('pointermove', () => { document.body.classList.remove('clean'); poke(); });
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ' && perf) { e.preventDefault(); if (!e.repeat) toggle(); }
      else if (k === 'arrowleft' && perf) seek(position() - 10);
      else if (k === 'arrowright' && perf) seek(position() + 10);
      else if (k === 'c') document.body.classList.toggle('clean');
      else if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
      else if (k === 'q') toast(`Picture quality: ${V.cycleQuality()}`);
    });
    // drag a file onto the page
    const drop = $('#drop');
    addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    addEventListener('dragleave', () => drop.classList.remove('over'));
    addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); loadFile(e.dataTransfer.files[0]); });
    // player.html?src=set.sqz loads a file that is hosted next to the page
    const src = new URLSearchParams(location.search).get('src');
    if (src) {
      fetch(src).then((r) => { if (!r.ok) throw new Error(`could not fetch it (${r.status})`); return r.arrayBuffer(); })
        .then((b) => load(new Uint8Array(b), src.split('/').pop()))
        .then((ok) => { if (ok) toast('Press play (or space) to start. Browsers need a click before they will make sound.', 6000); })
        .catch((err) => toast(`${src}: ${err.message}`));
    }
    addEventListener('beforeunload', (e) => { if (playing) { e.preventDefault(); e.returnValue = ''; } });
  }

  SS.player = { load, play, pause, seek, position, get playing() { return playing; }, get perf() { return perf; } };
  init();
})(window.SS);
