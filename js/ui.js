/* SquidgySqueegee — controls, keyboard and pointer. */
(function (SS) {
  'use strict';

  const A = SS.audio, S = SS.seq, V = SS.visual, R = SS.rec;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s) => document.querySelector(s);
  const LENS = [8, 10, 12, 14, 15, 16];
  const qs = new URLSearchParams(location.search);
  const r3 = (v) => Math.round(v * 1000) / 1000;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  const stampNow = () => {
    const n = new Date();
    return `${n.getFullYear()}${pad2(n.getMonth() + 1)}${pad2(n.getDate())}-${pad2(n.getHours())}${pad2(n.getMinutes())}`;
  };
  const fmtBytes = (n) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);
  const fmtTime = (s) => `${pad2(Math.floor(s / 60))}:${pad2(Math.floor(s % 60))}`;

  /* ---- a small message that fades by itself ---- */
  let toastTimer = 0;
  function toast(msg, ms = 3800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---- three drummers, each a ring ---- */
  const rings = [];

  function buildDrummers() {
    const host = $('#drummers');
    S.drummers.forEach((d, i) => {
      const wrap = el('div', 'drummer');
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '-50 -50 100 100');
      svg.setAttribute('role', 'group');
      svg.setAttribute('aria-label', `${d.name} drummer`);
      const info = el('div', 'info');
      const ctl = el('div', 'ctl');
      const mk = (label, aria, fn) => {
        const b = el('button', null, label);
        b.type = 'button';
        b.setAttribute('aria-label', `${d.name} ${aria}`);
        b.addEventListener('click', () => {
          fn();
          S.regen(i);
          renderRing(i);
          b.blur();
        });
        return b;
      };
      ctl.append(
        mk('−', 'fewer hits', () => (d.hits = Math.max(0, d.hits - 1))),
        mk('+', 'more hits', () => (d.hits = Math.min(d.len, d.hits + 1))),
        mk('‹', 'shorter loop', () => step(d, -1)),
        mk('›', 'longer loop', () => step(d, 1)),
      );
      svg.addEventListener('click', (e) => {
        const c = e.target.closest('.dot');
        if (!c) return;
        const s = +c.dataset.s;
        d.steps[s] = !d.steps[s];
        c.classList.toggle('on', d.steps[s]);
        c.classList.remove('ghost');
        c.style.fillOpacity = '';
      });
      wrap.append(svg, info, ctl);
      host.append(wrap);
      rings[i] = { svg, info, dots: [], now: -1 };
      renderRing(i);
    });
  }

  function step(d, dir) {
    const at = LENS.indexOf(d.len);
    d.len = LENS[Math.max(0, Math.min(LENS.length - 1, at + dir))];
    d.hits = Math.min(d.hits, d.len);
  }

  function renderRing(i) {
    const d = S.drummers[i], r = rings[i];
    r.svg.replaceChildren();
    r.dots = [];
    const rad = 38, pr = Math.min(7, rad * Math.sin(Math.PI / d.len) * 0.78);
    for (let s = 0; s < d.len; s++) {
      const a = (s / d.len) * Math.PI * 2 - Math.PI / 2;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', (rad * Math.cos(a)).toFixed(2));
      c.setAttribute('cy', (rad * Math.sin(a)).toFixed(2));
      c.setAttribute('r', pr.toFixed(2));
      c.setAttribute('class', 'dot' + (d.steps[s] ? ' on' : ''));
      c.dataset.s = s;
      r.svg.append(c);
      r.dots.push(c);
    }
    r.info.textContent = `${d.name} ${d.hits}/${d.len}`;
  }

  /* ---- bass step grid: 16 columns x 8 degrees ---- */
  const cells = [];
  let nowCol = -1;

  function buildRoll() {
    const roll = $('#roll');
    for (let row = 7; row >= 0; row--) {
      for (let col = 0; col < 16; col++) {
        const b = el('button', 'cell' + (col % 4 === 0 ? ' beat' : ''));
        b.type = 'button';
        b.setAttribute('aria-label', `step ${col + 1}, degree ${row + 1}`);
        b.addEventListener('click', () => {
          const p = S.synth.pattern;
          p[col] = p[col] === row ? -1 : row;
          paintRoll();
          if (A.ready && p[col] >= 0) A.note(A.now() + 0.01, S.midi(row), 0.7, 0.18, false);
          b.blur();
        });
        (cells[col] = cells[col] || [])[row] = b;
        roll.append(b);
      }
    }
    paintRoll();
  }

  function paintRoll() {
    const p = S.synth.pattern;
    for (let col = 0; col < 16; col++) {
      for (let row = 0; row < 8; row++) {
        const on = p[col] === row;
        cells[col][row].classList.toggle('on', on);
        cells[col][row].setAttribute('aria-pressed', on);
      }
    }
  }

  /* ---- knobs, named for the tray they belong to ---- */
  const KNOBS = [
    ['cutoff', 'Aperture', 'filter', () => A.params.cutoff, (v) => A.setParam('cutoff', v)],
    ['reso', 'Contrast', 'resonance', () => A.params.reso, (v) => A.setParam('reso', v)],
    ['decay', 'Burn', 'decay', () => A.params.decay, (v) => A.setParam('decay', v)],
    ['drive', 'Grain', 'drive', () => A.params.drive, (v) => A.setParam('drive', v)],
    ['glide', 'Wipe', 'glide', () => A.params.glide, (v) => A.setParam('glide', v)],
    ['space', 'Bath', 'echo + room', () => A.params.space, (v) => A.setParam('space', v)],
    ['swing', 'Bounce', 'swing', () => S.swing * 2, (v) => (S.swing = v / 2)],
    ['drift', 'Drift', 'wander', () => S.drift, (v) => (S.drift = v)],
  ];

  const syncs = []; // re-read every slider from the model (after an import)

  function slider(label, sub, min, max, stepv, value, onInput, fmt, get) {
    const l = el('label', 'knob');
    const name = el('span', null, label);
    name.append(el('small', null, sub));
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = min;
    inp.max = max;
    inp.step = stepv;
    inp.value = value;
    inp.setAttribute('aria-label', `${label} (${sub})`);
    const out = el('output', null, fmt ? fmt(value) : '');
    inp.addEventListener('input', () => {
      onInput(+inp.value);
      if (fmt) out.textContent = fmt(+inp.value);
    });
    l.append(name, inp);
    if (fmt) l.append(out);
    if (get) {
      syncs.push(() => {
        inp.value = get();
        if (fmt) out.textContent = fmt(+inp.value);
      });
    }
    return l;
  }

  function buildKnobs() {
    const host = $('#knobs');
    for (const [, label, sub, get, set] of KNOBS) host.append(slider(label, sub, 0, 1, 0.001, get(), set, null, get));
  }

  /* ---- lights and time ---- */
  const bulbs = [];

  function buildLight() {
    const host = $('#bulbs');
    S.lights.forEach((l, i) => {
      const b = el('button', 'bulbbtn');
      b.type = 'button';
      b.append(el('i'), el('span', null, `${i + 1} ${l.name}`), el('small', null, l.mode));
      b.style.setProperty('--b', l.tint.join(','));
      b.addEventListener('click', () => {
        setLight(i);
        b.blur();
      });
      host.append(b);
      bulbs[i] = b;
    });
    $('#light').append(
      slider('Timer', 'bpm', 80, 160, 1, A.params.tempo, (v) => A.setParam('tempo', v), (v) => String(v), () => A.params.tempo),
    );
  }

  /* ---- the tools strip: loop, files, recording, view ---- */
  const flash = (b, text) => {
    const was = b.dataset.was || b.textContent;
    b.dataset.was = was;
    b.textContent = text;
    setTimeout(() => (b.textContent = was), 1400);
  };

  function buildTools() {
    $('#save').addEventListener('click', (e) => {
      const ok = S.save();
      flash(e.currentTarget, ok ? 'saved ✓' : 'no storage');
      toast(ok ? 'Loop saved in this browser. It comes back next time you open this page.' : 'This browser blocked saving. Use files → export instead.');
      e.currentTarget.blur();
    });
    $('#revert').addEventListener('click', (e) => {
      S.goHome();
      paintRoll();
      toast('Bass pattern returned to your saved loop.');
      e.currentTarget.blur();
    });
    $('#clean').addEventListener('click', () => {
      setClean(true);
      $('#clean').blur();
    });
    $('#play').addEventListener('click', () => {
      togglePlay();
      $('#play').blur();
    });
    buildFilesMenu();
    buildRecorder();
  }

  /* ---- files menu: several kinds of JSON out, and loops back in ---- */
  let menuOpen = false;

  function closeMenu() {
    menuOpen = false;
    $('#filesmenu').hidden = true;
    $('#files').setAttribute('aria-expanded', 'false');
  }

  function buildFilesMenu() {
    const menu = $('#filesmenu'), btn = $('#files');
    const item = (label, hint, fn) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.title = hint;
      b.addEventListener('click', () => { closeMenu(); fn(); });
      menu.append(b);
    };
    item('Export everything', 'Bass, drums, sound settings, light and drift: the whole loop as a .json file', () => exportKind('loop'));
    item('Export bass line only', 'Just the 16-step bass pattern', () => exportKind('pattern'));
    item('Export drums only', 'Just the three drummer rings', () => exportKind('drums'));
    item('Export sound only', 'Knobs, tempo, swing, drift and light, without the notes', () => exportKind('sound'));
    menu.append(el('hr'));
    item('Copy loop to clipboard', 'Paste it into a message or another browser', copyLoop);
    item('Import from a file…', 'Load any exported loop (whole or partial)', () => $('#pick').click());
    item('Paste loop from clipboard', 'Load a loop someone sent you as text', pasteLoop);
    btn.addEventListener('click', () => {
      menuOpen = !menuOpen;
      menu.hidden = !menuOpen;
      btn.setAttribute('aria-expanded', String(menuOpen));
    });
    document.addEventListener('pointerdown', (e) => { if (menuOpen && !e.target.closest('#filesmenu, #files')) closeMenu(); });
    const pick = $('#pick');
    pick.addEventListener('change', async () => {
      const f = pick.files[0];
      pick.value = '';
      if (!f) return;
      if (f.size > 100000) return toast(f.name.endsWith('.sqz') ? 'That is a performance recording: open it in the player (player.html).' : 'That file is too big to be a loop.');
      importText(await f.text(), f.name);
    });
  }

  function download(text, name, type = 'application/json') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportKind(kind) {
    const names = { loop: 'loop', pattern: 'bass', drums: 'drums', sound: 'sound' };
    const name = `squidgysqueegee-${names[kind]}-${stampNow()}.json`;
    download(JSON.stringify(S.snapshot(kind), null, 2), name);
    toast(`Exported ${name}`);
  }

  async function copyLoop() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(S.snapshot('loop')));
      toast('Loop copied. Paste it anywhere; use files → paste loop to load it back.');
    } catch (err) {
      toast('The browser would not let me use the clipboard. Use export instead.');
    }
  }

  async function pasteLoop() {
    try {
      importText(await navigator.clipboard.readText(), 'clipboard');
    } catch (err) {
      toast('The browser would not let me read the clipboard. Use import from a file instead.');
    }
  }

  function importText(text, source) {
    let j = null;
    try { j = JSON.parse(text); } catch (err) { /* handled below */ }
    if (j && j.kind === 'performance') return toast('That is a performance recording. Open it in the player (player.html).');
    if (!j || !S.apply(j)) return toast(`${source} is not a loop this page can use. Nothing was changed.`);
    refreshAll();
    const what = { loop: 'Loop', pattern: 'Bass line', drums: 'Drums', sound: 'Sound settings' }[j.kind || 'loop'];
    toast(`${what} loaded from ${source}. (Save loop makes it the one that comes back next time.)`);
  }

  /* after an import: bring every control in line with the model */
  function refreshAll() {
    S.drummers.forEach((d, i) => renderRing(i));
    paintGhosts();
    paintRoll();
    syncs.forEach((f) => f());
    setLight(S.light);
  }

  /* ---- recording ---- */
  function buildRecorder() {
    const sel = $('#recfmt'), btn = $('#rec'), snap = $('#snap');
    const sup = R.support();
    for (const [key, f] of Object.entries(R.FORMATS)) {
      const o = el('option', null, f.label + (key === 'video' && sup.videoType ? ` (${sup.videoType})` : ''));
      o.value = key;
      o.title = f.hint;
      if ((key === 'video' && !sup.video) || (key === 'mp3' && !sup.mp3)) { o.disabled = true; o.textContent += ' — not in this browser'; }
      sel.append(o);
    }
    try { const last = localStorage.getItem('sq.recfmt'); if (last && sel.querySelector(`option[value="${last}"]:not(:disabled)`)) sel.value = last; } catch (err) { /* fine */ }
    sel.title = R.FORMATS[sel.value].hint;
    sel.addEventListener('change', () => {
      sel.title = R.FORMATS[sel.value].hint;
      try { localStorage.setItem('sq.recfmt', sel.value); } catch (err) { /* fine */ }
      sel.blur();
    });

    btn.addEventListener('click', async () => {
      btn.blur();
      try {
        if (R.state.active) {
          const r = await R.stop();
          if (r) toast(`Saved ${r.name} · ${fmtBytes(r.bytes)} · ${fmtTime(r.seconds)}` + (r.where === 'memory' ? ' (in your Downloads)' : ''), 7000);
        } else {
          if (!A.ready) return toast('Turn on the safelight first.');
          await R.start(sel.value);
        }
      } catch (err) {
        toast(`Recording problem: ${err.message}`, 7000);
      }
    });
    snap.addEventListener('click', async () => {
      snap.blur();
      try { toast(`Saved ${await R.snap()}`); } catch (err) { toast(`Could not save a picture: ${err.message}`); }
    });
    R.onUpdate = (st) => {
      const info = $('#recinfo');
      document.body.classList.toggle('recording', !!st.active);
      btn.textContent = st.active ? 'stop rec' : '● rec';
      btn.setAttribute('aria-pressed', String(!!st.active));
      sel.disabled = !!st.active;
      info.textContent = st.active ? `${fmtTime(R.elapsed())}${st.format === 'perf' ? '' : ' · ' + fmtBytes(st.bytes || 0)}` : '';
    };
    R.onAuto = (r) => toast(`Recording stopped: ${r.reason}. Saved ${r.name}.`, 9000);
  }

  function setLight(i) {
    S.setLight(i);
    V.setLight(i);
    if (SS.perf) SS.perf.log(A.now(), 7, i);
    document.documentElement.style.setProperty('--tint-rgb', S.lights[i].tint.join(','));
    bulbs.forEach((b, j) => b.setAttribute('aria-pressed', j === i));
  }

  function togglePlay() {
    if (!A.ready) return;
    if (S.playing) S.stop();
    else S.start();
    $('#play').textContent = S.playing ? 'stop' : 'play';
    updateWake();
  }

  /* ghost hats show as faint fills on the hat ring's empty steps */
  function paintGhosts() {
    const dots = rings[2].dots, g = S.ghosts;
    dots.forEach((c, s) => {
      const on = g[s] > 0.15 && !S.drummers[2].steps[s];
      c.classList.toggle('ghost', on);
      c.style.fillOpacity = on ? (g[s] * 0.5).toFixed(2) : '';
    });
  }

  /* ---- events released by the visual loop on the audio clock ---- */
  SS.onEvent = function (e) {
    if (e.type === 'step') {
      if (nowCol >= 0) for (const c of cells[nowCol]) c.classList.remove('now');
      nowCol = e.a;
      for (const c of cells[nowCol]) c.classList.add('now');
    } else if (e.type === 'd') {
      const r = rings[e.a];
      if (!r) return;
      if (r.dots[r.now]) r.dots[r.now].classList.remove('now');
      r.now = e.b;
      if (r.dots[e.b]) r.dots[e.b].classList.add('now');
    } else if (e.type === 'cycle') {
      paintRoll();
      paintGhosts();
    }
  };

  /* ---- clean mode, and keeping the screen awake for a whole set ---- */
  let wake = null;

  const isClean = () => document.body.classList.contains('clean');

  async function updateWake() {
    const want = isClean() || S.playing || R.state.active;
    try {
      if (want && !wake && 'wakeLock' in navigator) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!want && wake) {
        await wake.release();
        wake = null;
      }
    } catch (err) { /* not supported or refused: everything still works */ }
  }

  async function setClean(on) {
    document.body.classList.toggle('clean', on);
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch (err) { /* fullscreen refused: still clean, just windowed */ }
    updateWake();
    const b = $('#clean');
    if (b) b.setAttribute('aria-pressed', on);
  }

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isClean() && !qs.get('clean')) setClean(false); // Esc leaves clean mode too
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateWake();
      if (A.ready) A.resume();
    }
  });

  /* ---- help card ---- */
  function toggleHelp(force) {
    const h = $('#help'), on = force != null ? force : h.hidden;
    h.hidden = !on;
    $('#helpbtn').setAttribute('aria-expanded', String(on));
    if (on) { $('#help').scrollTop = 0; }
  }

  function buildHelp() {
    $('#helpbtn').addEventListener('click', (e) => { toggleHelp(); e.currentTarget.blur(); });
    $('#helpclose').addEventListener('click', () => toggleHelp(false));
    $('#ver').textContent = SS.config.version;
    const sug = $('#suggest');
    if (SS.config.suggestEmail) {
      sug.href = `mailto:${SS.config.suggestEmail}?subject=${encodeURIComponent('SquidgySqueegee suggestion')}&body=${encodeURIComponent('What would make it better?\n\n')}`;
      sug.hidden = false;
    }
    const road = $('#roadmap');
    if (SS.config.repoUrl) { road.href = SS.config.repoUrl.replace(/\/$/, '') + '/blob/main/ROADMAP.md'; road.hidden = false; }
  }

  /* ---- audio that gets paused by the browser: say so, and resume on the next touch ---- */
  function watchAudio() {
    const note = $('#notice');
    const resume = () => { if (A.ready) A.resume(); };
    A.onState = (state) => {
      const paused = state !== 'running';
      note.hidden = !paused;
      note.textContent = paused ? 'Audio is paused by the browser. Click or press any key to resume.' : '';
    };
    addEventListener('pointerdown', resume, { passive: true });
    addEventListener('keydown', resume, { passive: true });
  }

  /* ---- keyboard: a row of piano, space to expose ---- */
  const KEYS = 'awsedftgyhujkolp';
  let heldKey = null;

  function keys() {
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        if (!e.repeat && A.ready) {
          A.expose(true);
          V.setExpose(true);
        }
        return;
      }
      if (e.repeat) return;
      if (k === 'escape') {
        if (menuOpen) closeMenu();
        else if (!$('#help').hidden) toggleHelp(false);
        else if (isClean()) setClean(false);
      } else if (k === 'enter' && document.activeElement.tagName !== 'BUTTON') togglePlay();
      else if (k === '`') document.body.classList.toggle('bare');   // hide/show the panel (H is a piano key now)
      else if (k === '?') toggleHelp();
      else if (k === 'c') setClean(!isClean());
      else if (k === 'q') toast(`Picture quality: ${V.cycleQuality()}`);
      else if (k >= '1' && k <= '3') setLight(+k - 1);
      else if (A.ready && KEYS.includes(k)) {
        heldKey = k;
        A.noteOn(A.now() + 0.005, A.params.root + 12 + KEYS.indexOf(k), 0.8, false);
      }
    });
    addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        if (A.ready) {
          A.expose(false);
          V.setExpose(false);
        }
      } else if (k === heldKey) {
        heldKey = null;
        A.noteOff(A.now() + 0.005);
      }
    });
  }

  /* ---- pointer: the squeegee ---- */
  function pointer() {
    const stage = $('#stage');
    let prev = null, quiet = 0;
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      prev = { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!prev) return;
      V.wipe(e.clientX, e.clientY, prev.x, prev.y);
      if (SS.perf) SS.perf.log(A.now(), 8, r3(e.clientX / innerWidth), r3(e.clientY / innerHeight), r3(prev.x / innerWidth), r3(prev.y / innerHeight));
      const speed = Math.hypot(e.clientX - prev.x, e.clientY - prev.y) / 40;
      const x = e.clientX / innerWidth;
      A.setParam('mod', x);
      A.squeak(speed, x);
      prev = { x: e.clientX, y: e.clientY };
      clearTimeout(quiet);
      quiet = setTimeout(() => A.squeak(0), 90);
    });
    const up = () => {
      prev = null;
      V.wipeEnd();
      A.setParam('mod', 0.5);
      A.squeak(0);
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  }

  /* ---- power on ---- */
  async function powerOn() {
    document.body.classList.add('lit');
    await A.init();
    S.start();
    $('#play').textContent = 'stop';
    updateWake();
  }

  function debugOverlay() {
    const box = $('#debug');
    box.hidden = false;
    setInterval(() => {
      const s = V.stats, i = A.info();
      box.textContent = `${s.fps} fps · ${s.level} (${s.mode}) · frame ${s.frameMs.toFixed(1)} ms · sim ${s.sections.sim} compose ${s.sections.compose} finish ${s.sections.finish} · errors ${s.errors} · downgrades ${s.downgrades}${s.recovery ? ` · recovering ${s.recovery}%` : ''}` +
        (i ? `\naudio ${i.state} ${i.sampleRate} Hz · latency base ${(i.baseLatency * 1000).toFixed(0)} ms out ${(i.outputLatency * 1000).toFixed(0)} ms` : '');
    }, 500);
  }

  function init() {
    buildDrummers();
    buildRoll();
    buildKnobs();
    buildLight();
    buildTools();
    buildHelp();
    watchAudio();
    keys();
    pointer();
    setLight(S.light);
    $('#switch').addEventListener('click', powerOn);
    // a set is not something to lose to a stray Ctrl+W or F5
    addEventListener('beforeunload', (e) => {
      if (S.playing || R.state.active) { e.preventDefault(); e.returnValue = ''; }
    });
    // options for OBS and friends: ?clean=1 (no panel, no fullscreen prompt), ?autostart=1, ?debug=1, ?quality=low|medium|high
    if (qs.get('clean') === '1') { document.body.classList.add('clean'); $('#clean').setAttribute('aria-pressed', 'true'); }
    if (qs.get('debug') === '1') debugOverlay();
    if (qs.get('autostart') === '1') powerOn().catch(() => { /* the browser wants a click first: the splash stays */ });
  }

  SS.ui = { init, toast };
})(window.SS);
