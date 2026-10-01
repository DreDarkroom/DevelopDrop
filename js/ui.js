/* DevelopDrop — controls, keyboard, pointer, files dropped on the page, MIDI panel. */
(function (SS) {
  'use strict';

  const A = SS.audio, S = SS.seq, V = SS.visual, R = SS.rec, PB = SS.playback, M = SS.midi;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s) => document.querySelector(s);
  const LENS = [8, 10, 12, 14, 15, 16];
  const qs = new URLSearchParams(location.search);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const slug = () => SS.config.slug || 'developdrop';

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

  const syncs = []; // re-read every control from the model (after an import, a style, a MIDI move)
  let syncQueued = false;
  const syncSoon = () => {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => { syncQueued = false; syncs.forEach((f) => f()); });
  };

  /* ---- three drummers, each a ring (right-click a ring to mute it) ---- */
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
      wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleMute(S.PARTS[i]); });
      wrap.title = 'Right-click to mute';
      wrap.append(svg, info, ctl);
      host.append(wrap);
      rings[i] = { svg, info, dots: [], now: -1, wrap };
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

  /* ---- mutes: bring layers in and out ---- */
  const muteBtns = {};
  const PART_LABEL = { kick: 'kick', snare: 'snare', hat: 'hats', bass: 'bass' };
  const MUTE_KEYS = { z: 'kick', x: 'snare', v: 'hat', b: 'bass' };

  function buildMutes() {
    const host = $('#mutes');
    for (const part of S.PARTS) {
      const b = el('button', 'mute', PART_LABEL[part]);
      b.type = 'button';
      b.title = `Mute or bring back the ${PART_LABEL[part]} (${Object.keys(MUTE_KEYS).find((k) => MUTE_KEYS[k] === part)})`;
      b.addEventListener('click', () => { toggleMute(part); b.blur(); });
      host.append(b);
      muteBtns[part] = b;
    }
    paintMutes();
  }

  function paintMutes() {
    S.PARTS.forEach((part, i) => {
      if (muteBtns[part]) muteBtns[part].setAttribute('aria-pressed', String(!!S.mute[part]));
      if (rings[i] && i < 3) rings[i].wrap.classList.toggle('muted', !!S.mute[part]);
    });
    $('#roll').classList.toggle('muted', !!S.mute.bass);
  }

  function toggleMute(part) {
    S.toggleMute(part);
    paintMutes();
  }

  /* ---- bass step grid: 16 columns x 8 degrees (right-click a step to clear it) ---- */
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
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          S.synth.pattern[col] = -1;
          paintRoll();
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

  function clearPart(what) {
    S.clear(what);
    if (what !== 'drums') paintRoll();
    if (what !== 'bass') { S.drummers.forEach((d, i) => renderRing(i)); paintGhosts(); }
    toast(what === 'bass' ? 'Bass line cleared. Click the grid to write your own.' : what === 'drums' ? 'Drums cleared. Click the rings to write them.' : 'Everything cleared. You have a blank page.');
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
    ['level', 'Level', 'overall', () => A.params.level, (v) => A.setParam('level', v)],
    ['duck', 'Duck', 'bass under kick', () => A.params.duck, (v) => A.setParam('duck', v)],
  ];

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

  /* ---- lights, styles and time ---- */
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
    buildStyles();
    buildTempo();
  }

  function buildStyles() {
    const sel = $('#style');
    S.styles.forEach((st, i) => {
      const o = el('option', null, st.name);
      o.value = i;
      o.title = st.note;
      sel.append(o);
    });
    sel.value = S.style;
    sel.title = S.styles[S.style].note;
    sel.addEventListener('change', () => { setStyle(+sel.value); sel.blur(); });
    syncs.push(() => { sel.value = S.style; sel.title = S.styles[S.style].note; });
  }

  function setStyle(i) {
    i = (i + S.styles.length) % S.styles.length;
    if (!S.applyStyle(i)) return;
    $('#style').value = i;
    toast(`${S.styles[i].name}: ${S.styles[i].note}${S.playing ? ' (lands on the next bar)' : ''}`, 5200);
    if (!S.playing) refreshAll();
  }

  /* tempo: a fine slider (tenths), the exact number, and a drum-and-bass range behind one switch */
  const TEMPO_RANGE = { normal: [70, 140], dnb: [150, 180] };
  let tempoEls = null;

  function buildTempo() {
    const host = $('#tempo');
    const lab = el('label', 'knob');
    const name = el('span', null, 'Timer');
    name.append(el('small', null, 'bpm'));
    const range = document.createElement('input');
    range.type = 'range';
    range.step = 0.1;
    range.setAttribute('aria-label', 'Tempo in beats per minute');
    lab.append(name, range);
    const row = el('div', 'temporow');
    const num = document.createElement('input');
    num.type = 'number';
    num.min = 60; num.max = 200; num.step = 0.1;
    num.setAttribute('aria-label', 'Exact tempo');
    const dnb = el('button', null, 'dnb');
    dnb.type = 'button';
    dnb.title = 'Drum and bass range, up to 180 (\\)';
    row.append(num, dnb);
    host.append(lab, row);
    tempoEls = { range, num, dnb };
    range.addEventListener('input', () => setTempo(+range.value, true));
    num.addEventListener('change', () => { setTempo(+num.value); num.blur(); });
    dnb.addEventListener('click', () => { setDnb(!S.dnb); dnb.blur(); });
    syncs.push(paintTempo);
    paintTempo();
  }

  function paintTempo() {
    if (!tempoEls) return;
    const t = A.params.tempo, base = S.dnb ? TEMPO_RANGE.dnb : TEMPO_RANGE.normal;
    tempoEls.range.min = Math.min(base[0], Math.floor(t));      // a journey or a style can be outside the usual range: widen, never clip
    tempoEls.range.max = Math.max(base[1], Math.ceil(t));
    tempoEls.range.value = t;
    if (document.activeElement !== tempoEls.num) tempoEls.num.value = (Math.round(t * 10) / 10).toFixed(1);
    tempoEls.dnb.setAttribute('aria-pressed', String(!!S.dnb));
  }

  function setTempo(v, fromSlider) {
    if (!isFinite(v)) return;
    A.setParam('tempo', clamp(Math.round(v * 10) / 10, 60, 200));
    if (!fromSlider) paintTempo();
    else if (tempoEls && document.activeElement !== tempoEls.num) tempoEls.num.value = A.params.tempo.toFixed(1);
  }

  function nudgeTempo(d) { setTempo(A.params.tempo + d); }

  function setDnb(on) {
    S.dnb = !!on;
    if (on && A.params.tempo < 150) setTempo(174);
    else if (!on && A.params.tempo > 140) setTempo(Math.round(A.params.tempo / 2));
    paintTempo();
    toast(on ? 'Drum and bass range: 150 to 180. The "Rapid Fixer" style has the kit for it.' : 'Back to the usual tempo range.');
  }

  /* ---- the tools strip: loop, files, clips, perform, recording, view ---- */
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
    $('#clearbass').addEventListener('click', (e) => { clearPart('bass'); e.currentTarget.blur(); });
    $('#cleardrums').addEventListener('click', (e) => { clearPart('drums'); e.currentTarget.blur(); });
    $('#clean').addEventListener('click', () => {
      setClean(true);
      $('#clean').blur();
    });
    $('#play').addEventListener('click', () => {
      togglePlay();
      $('#play').blur();
    });
    buildMutes();
    buildClips();
    buildPerform();
    buildFilesMenu();
    buildRecorder();
  }

  /* ---- builds and drops: held from the keyboard, the mouse, the button or a MIDI pad ---- */
  let buildSrc = null;

  function startBuild(variant, src) {
    if (buildSrc || PB.perf) return;
    if (!A.ready || !S.playing) { toast('Press play first (enter).'); return; }
    if (!S.buildStart(variant)) return;
    buildSrc = src;
    $('#build').classList.add('holding');
  }

  function endBuild(src) {
    if (buildSrc !== src) return;
    buildSrc = null;
    $('#build').classList.remove('holding');
    S.buildRelease();
  }

  function buildPerform() {
    const b = $('#build');
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      b.setPointerCapture(e.pointerId);
      startBuild(e.shiftKey ? 1 : 0, 'button');
    });
    const up = () => endBuild('button');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    $('#quant').addEventListener('change', (e) => { S.setQuant(e.target.value); e.target.blur(); });
    $('#journey').addEventListener('click', (e) => { toggleJourneyPop(); e.currentTarget.blur(); });
    $('#midi').addEventListener('click', (e) => { toggleMidi(); e.currentTarget.blur(); });
    buildJourneyPop();
  }

  /* ---- clips: record some bars of drums or bass, loop them, keep them as files ---- */
  function buildClips() {
    const go = (part) => {
      if (!A.ready || !S.playing) return toast('Press play first (enter).');
      if (S.clipRec && S.clipRec.parts.includes(part)) { S.cancelClip(); return toast('Clip recording cancelled.'); }
      const bars = +$('#clipbars').value;
      if (S.recordClip(part, bars)) toast(`Recording ${bars} bar${bars > 1 ? 's' : ''} of ${part} from the next bar. Play, it loops when done.`, 4500);
    };
    $('#clipdrums').addEventListener('click', (e) => { go('drums'); e.currentTarget.blur(); });
    $('#clipbass').addEventListener('click', (e) => { go('bass'); e.currentTarget.blur(); });
    $('#clipbars').addEventListener('change', (e) => e.target.blur());
    paintClips();
  }

  function paintClips() {
    const host = $('#clips');
    host.replaceChildren();
    for (const part of ['drums', 'bass']) {
      const c = S.clips[part];
      if (!c) continue;
      const b = el('button', 'chip' + (c.active ? '' : ' off'), `${part} ${c.bars}`);
      b.type = 'button';
      b.title = 'Click: play or stop · Shift-click: save as a file · Right-click: remove';
      b.addEventListener('click', (e) => {
        if (e.shiftKey) {
          const name = `${slug()}-clip-${part}-${stampNow()}.json`;
          download(JSON.stringify(S.clipToJSON(part)), name);
          toast(`Saved ${name}. Drag it back onto the page any time.`);
        } else S.playClip(part, !c.active);
        b.blur();
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); S.clearClip(part); });
      host.append(b);
    }
    const rec = S.clipRec ? S.clipRec.parts : [];
    $('#clipdrums').classList.toggle('armed', rec.includes('drums'));
    $('#clipbass').classList.toggle('armed', rec.includes('bass'));
  }

  /* ---- journey: tempo creeps up and the picture progresses ---- */
  const journeyCfg = { to: 140, bars: 64, scenes: true };
  let journeyOpen = false;

  function buildJourneyPop() {
    const pop = $('#journeypop');
    pop.classList.add('card');
    const close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => toggleJourneyPop(false));
    const to = document.createElement('input');
    to.type = 'number'; to.min = 60; to.max = 200; to.step = 1; to.value = journeyCfg.to;
    to.setAttribute('aria-label', 'Tempo to arrive at');
    const bars = document.createElement('select');
    bars.setAttribute('aria-label', 'How many bars the journey takes');
    for (const n of [16, 32, 64, 128, 256]) { const o = el('option', null, `${n} bars`); o.value = n; bars.append(o); }
    bars.value = journeyCfg.bars;
    const scenes = document.createElement('input');
    scenes.type = 'checkbox'; scenes.checked = true;
    const go = el('button', null, 'start');
    go.type = 'button';
    const hint = el('p', null, '');
    pop.append(close, el('h3', null, 'Journey'),
      el('p', null, 'Slowly raise the tempo while the picture changes and thickens. It starts on the next bar.'),
      Object.assign(el('div', 'row'), {}), Object.assign(el('div', 'row'), {}), el('div', 'row'), hint);
    const rows = pop.querySelectorAll('.row');
    const l1 = el('label', null, 'to'); l1.append(to, el('span', null, 'bpm'));
    const l2 = el('label', null, 'over'); l2.append(bars);
    const l3 = el('label'); l3.append(scenes, el('span', null, 'change the picture too'));
    rows[0].append(l1, l2);
    rows[1].append(l3);
    rows[2].append(go);
    const read = () => { journeyCfg.to = clamp(+to.value || 140, 60, 200); journeyCfg.bars = +bars.value; journeyCfg.scenes = scenes.checked; };
    go.addEventListener('click', () => { if (S.journey) stopJourney(); else startJourney(read); });
    pop._go = go; pop._hint = hint; pop._read = read; pop._to = to;
    paintJourney();
  }

  function startJourney(read) {
    const pop = $('#journeypop');
    (read || pop._read)();
    if (!A.ready || !S.playing) return toast('Press play first (enter).');
    if (S.journeyStart(journeyCfg)) toast(`Journey: ${A.params.tempo} to ${journeyCfg.to} bpm over ${journeyCfg.bars} bars.`, 4500);
    paintJourney();
  }

  function stopJourney() { S.journeyStop(); paintJourney(); toast('Journey stopped where it was.'); }

  function paintJourney() {
    const pop = $('#journeypop');
    if (!pop._go) return;
    pop._go.textContent = S.journey ? 'stop' : 'start';
    pop._hint.textContent = S.journey ? `${Math.round((S.journey.to - S.journey.from) ? 100 * (A.params.tempo - S.journey.from) / (S.journey.to - S.journey.from) : 0)}% of the way to ${S.journey.to} bpm` : '';
    $('#journey').classList.toggle('armed', !!S.journey);
  }

  function toggleJourneyPop(force) {
    journeyOpen = force != null ? force : !journeyOpen;
    $('#journeypop').hidden = !journeyOpen;
    if (journeyOpen) { if (midiOpen) toggleMidi(false); $('#journeypop')._to.value = S.dnb && journeyCfg.to < 150 ? 174 : journeyCfg.to; }
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
    item('Import from a file…', 'Load a loop, a clip or a recording (you can also drag it onto the page)', () => $('#pick').click());
    item('Paste loop from clipboard', 'Load a loop someone sent you as text', pasteLoop);
    btn.addEventListener('click', () => {
      menuOpen = !menuOpen;
      menu.hidden = !menuOpen;
      btn.setAttribute('aria-expanded', String(menuOpen));
    });
    document.addEventListener('pointerdown', (e) => { if (menuOpen && !e.target.closest('#filesmenu, #files')) closeMenu(); });
    const pick = $('#pick');
    pick.addEventListener('change', () => {
      const files = [...pick.files];
      pick.value = '';
      handleFiles(files);
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
    const name = `${slug()}-${names[kind]}-${stampNow()}.json`;
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

  /* ---- anything dropped on the page: a recording, a loop, a clip, a MIDI map ---- */
  async function handleFiles(files) {
    for (const f of files.slice(0, 4)) {
      try { await importFile(f); } catch (err) { toast(`${f.name}: ${err.message}`); }
    }
  }

  async function importFile(f) {
    const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
    const gz = head[0] === 0x1f && head[1] === 0x8b;
    if (gz || /\.sqz$/i.test(f.name)) {
      if (f.size > 60 * 1024 * 1024) return toast('That file is too large to be a performance.');
      return openRecording(new Uint8Array(await f.arrayBuffer()), f.name);
    }
    if (f.size > 4 * 1024 * 1024) return toast(`${f.name} is too big to be a loop or a clip.`);
    importText(await f.text(), f.name);
  }

  function importText(text, source) {
    let j = null;
    try { j = JSON.parse(text); } catch (err) { /* handled below */ }
    if (j && j.kind === 'performance') return openRecording(new TextEncoder().encode(text), source);
    if (j && j.kind === 'clip') {
      const part = S.loadClip(j);
      if (!part) return toast(`${source} is not a clip this page can use. Nothing was changed.`);
      paintClips();
      return toast(S.playing ? `${part} clip loaded. It comes in on the next bar, in time.` : `${part} clip loaded. It starts when you press play.`);
    }
    if (j && j.kind === 'midi-map') {
      const n = M.fromJSON(j);
      return toast(n < 0 ? `${source} is not a MIDI map this page can use.` : `MIDI map loaded (${n} controls).`);
    }
    if (!j || !S.apply(j)) return toast(`${source} is not a loop this page can use. Nothing was changed.`);
    refreshAll();
    const what = { loop: 'Loop', pattern: 'Bass line', drums: 'Drums', sound: 'Sound settings' }[j.kind || 'loop'];
    toast(`${what} loaded from ${source}. (Save loop makes it the one that comes back next time.)`);
  }

  /* after an import, a style or a MIDI move: bring every control in line with the model */
  function refreshAll() {
    S.drummers.forEach((d, i) => renderRing(i));
    paintGhosts();
    paintRoll();
    paintMutes();
    paintClips();
    paintJourney();
    syncs.forEach((f) => f());
    setLight(S.light);
  }

  /* ---- a recording takes over the page (and the audio) until "back to live" ---- */
  let liveSnap = null, wasPlaying = false;

  async function openRecording(bytes, name) {
    try {
      const probe = await SS.perf.decode(bytes);
      if (!probe.events.length) throw new Error('that recording is empty');
    } catch (err) {
      return toast(`${name}: ${err.message}`);
    }
    if (R.state.active) return toast('Stop recording first, then open a recording.');
    if (!PB.perf) { liveSnap = S.snapshot('loop'); wasPlaying = S.playing; }
    if (S.playing) { S.buildCancel(); S.journeyStop(); S.stop(); $('#play').textContent = 'play'; }
    document.body.classList.add('lit');
    document.body.classList.add('playback');
    try {
      const doc = await PB.load(bytes);
      $('#pseek').max = doc.duration;
    } catch (err) {
      return backToLive();
    }
    $('#pbar').hidden = false;
    await PB.play();
    toast(`Playing ${name}. Press back to live to play again yourself.`, 5200);
  }

  async function backToLive() {
    await PB.close();
    $('#pbar').hidden = true;
    document.body.classList.remove('playback');
    if (liveSnap) { S.apply(liveSnap); liveSnap = null; }
    V.setScene(S.scene);
    refreshAll();
    if (A.ready) { S.start(); $('#play').textContent = 'stop'; updateWake(); }
  }

  function buildPlaybackBar() {
    let dragging = false;
    const paint = () => {
      if (!PB.perf) return;
      const p = PB.position();
      if (!dragging) $('#pseek').value = p;
      $('#ptime').textContent = `${fmtTime(p)} / ${fmtTime(PB.perf.duration)}`;
      $('#pplay').textContent = PB.playing ? '❚❚' : '▶';
      $('#pplay').setAttribute('aria-label', PB.playing ? 'Pause' : 'Play');
    };
    PB.onChange = paint;
    $('#pplay').addEventListener('click', () => { PB.toggle(); $('#pplay').blur(); });
    $('#pclose').addEventListener('click', backToLive);
    const seekBar = $('#pseek');
    seekBar.addEventListener('input', () => { dragging = true; if (PB.perf) $('#ptime').textContent = `${fmtTime(+seekBar.value)} / ${fmtTime(PB.perf.duration)}`; });
    seekBar.addEventListener('change', () => { dragging = false; PB.seek(+seekBar.value); seekBar.blur(); });
  }

  function buildDrop() {
    const zone = $('#dropzone');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; zone.hidden = false; } });
    addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) zone.hidden = true; });
    addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      zone.hidden = true;
      handleFiles([...e.dataTransfer.files]);
    });
  }

  /* ---- recording ---- */
  const VIDEO_FORMATS = ['webm', 'visuals', 'both', 'mp4', 'screen'];

  function buildRecorder() {
    const sel = $('#recfmt'), btn = $('#rec'), snap = $('#snap'), q = $('#recq');
    const sup = R.support();
    for (const [key, f] of Object.entries(R.FORMATS)) {
      const o = el('option', null, f.label);
      o.value = key;
      o.title = f.hint;
      if (sup[key] === false) { o.disabled = true; o.textContent += ' — not in this browser'; }
      sel.append(o);
    }
    try { const last = localStorage.getItem('sq.recfmt'); if (last && sel.querySelector(`option[value="${last}"]:not(:disabled)`)) sel.value = last; } catch (err) { /* fine */ }
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = 'wav';
    try { const lq = localStorage.getItem('sq.recq'); if (lq && q.querySelector(`option[value="${lq}"]`)) q.value = lq; } catch (err) { /* fine */ }
    const paintFmt = () => {
      sel.title = R.FORMATS[sel.value].hint;
      q.hidden = !VIDEO_FORMATS.includes(sel.value);
      R.videoBitrate = +q.value;
    };
    paintFmt();
    sel.addEventListener('change', () => {
      paintFmt();
      try { localStorage.setItem('sq.recfmt', sel.value); } catch (err) { /* fine */ }
      sel.blur();
    });
    q.addEventListener('change', () => {
      paintFmt();
      try { localStorage.setItem('sq.recq', q.value); } catch (err) { /* fine */ }
      q.blur();
    });

    btn.addEventListener('click', async () => {
      btn.blur();
      try {
        if (R.state.active) {
          const r = await R.stop();
          if (r) toast(`Saved ${r.name} · ${fmtBytes(r.bytes)} · ${fmtTime(r.seconds)}` + (r.where === 'memory' ? ' (in your Downloads)' : ''), 7000);
        } else {
          if (!A.ready) return toast('Turn on the safelight first.');
          if (PB.perf) return toast('Go back to live before recording.');
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
      q.disabled = !!st.active;
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
    if (!A.ready || PB.perf) return;
    if (S.playing) {
      S.buildCancel();
      S.journeyStop();
      buildSrc = null;
      $('#build').classList.remove('holding');
      V.setBuild(0);
      S.stop();
    } else S.start();
    $('#play').textContent = S.playing ? 'stop' : 'play';
    paintJourney();
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
  let armedTimer = 0;
  const armed = () => $('#armed');

  SS.onEvent = function (e) {
    switch (e.type) {
      case 'step':
        if (nowCol >= 0) for (const c of cells[nowCol]) c.classList.remove('now');
        nowCol = e.a;
        for (const c of cells[nowCol]) c.classList.add('now');
        break;
      case 'd': {
        const r = rings[e.a];
        if (!r) return;
        if (r.dots[r.now]) r.dots[r.now].classList.remove('now');
        r.now = e.b;
        if (r.dots[e.b]) r.dots[e.b].classList.add('now');
        break;
      }
      case 'cycle':
        paintRoll();
        paintGhosts();
        break;
      case 'style':
        refreshAll();
        break;
      case 'dropArmed':
        armed().textContent = 'drop ▸';
        armed().hidden = false;
        clearTimeout(armedTimer);
        armedTimer = setTimeout(() => { armed().hidden = true; }, Math.max(500, (e.a || 0) * 1000 + 600));
        break;
      case 'drop':
        armed().hidden = true;
        break;
      case 'journey':
        paintTempo();
        paintJourney();
        break;
      case 'journeyEnd':
        paintJourney();
        break;
      case 'clipDone': case 'clipState': case 'clipArmed': case 'clipRec': case 'clipCancel':
        paintClips();
        break;
      default:
    }
  };

  /* ---- clean mode, and keeping the screen awake for a whole set ---- */
  let wake = null;

  const isClean = () => document.body.classList.contains('clean');

  async function updateWake() {
    const want = isClean() || S.playing || R.state.active || PB.playing;
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
      sug.href = `mailto:${SS.config.suggestEmail}?subject=${encodeURIComponent((SS.config.name || 'DevelopDrop') + ' suggestion')}&body=${encodeURIComponent('What would make it better?\n\n')}`;
      sug.hidden = false;
    }
    const road = $('#roadmap');
    if (SS.config.repoUrl) { road.href = SS.config.repoUrl.replace(/\/$/, '') + '/blob/main/ROADMAP.md'; road.hidden = false; }
  }

  /* ---- audio that gets paused by the browser: say so, and resume on the next touch ---- */
  function watchAudio() {
    const note = $('#notice');
    const resume = () => { if (A.ready && !(PB.perf && !PB.playing)) A.resume(); };
    A.onState = (state) => {
      const paused = state !== 'running';
      note.hidden = !paused || !!(PB.perf && !PB.playing);
      note.textContent = paused ? 'Audio is paused by the browser. Click or press any key to resume.' : '';
    };
    addEventListener('pointerdown', resume, { passive: true });
    addEventListener('keydown', resume, { passive: true });
  }

  /* ---- the darkroom: one safelight, nothing else ---- */
  function toggleDarkroom() {
    const on = document.body.classList.toggle('darkroom');
    if (on) toast('Safelight only.', 1800);
  }

  /* ---- keyboard: a row of piano, space to build and drop, a few keys for everything else ---- */
  const KEYS = 'awsedftgyhujkolp';
  let heldKey = null;
  const isField = (t) => t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox'));

  function keys() {
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isField(e.target)) return;
      const k = e.key.toLowerCase();
      if (PB.perf) {                                        // a recording is playing: only the transport and the view
        if (k === ' ') { e.preventDefault(); if (!e.repeat) PB.toggle(); }
        else if (k === 'arrowleft') PB.seek(PB.position() - 10);
        else if (k === 'arrowright') PB.seek(PB.position() + 10);
        else if (k === 'escape') { if (isClean()) setClean(false); else backToLive(); }
        else if (!e.repeat && k === 'c') setClean(!isClean());
        else if (!e.repeat && k === 'q') toast(`Picture quality: ${V.cycleQuality()}`);
        return;
      }
      if (k === ' ') {
        e.preventDefault();
        if (!e.repeat) startBuild(e.shiftKey ? 1 : 0, 'key');
        return;
      }
      if (e.repeat) return;
      if (k === 'escape') {
        if (menuOpen) closeMenu();
        else if (midiOpen) toggleMidi(false);
        else if (journeyOpen) toggleJourneyPop(false);
        else if (!$('#help').hidden) toggleHelp(false);
        else if (isClean()) setClean(false);
      } else if (k === 'enter' && document.activeElement.tagName !== 'BUTTON') togglePlay();
      else if (k === '`') document.body.classList.toggle('bare');   // hide/show the panel (H is a piano key now)
      else if (k === '?') toggleHelp();
      else if (k === 'c') setClean(!isClean());
      else if (k === 'q') toast(`Picture quality: ${V.cycleQuality()}`);
      else if (k >= '1' && k <= '3') setLight(+k - 1);
      else if (k === '0') toggleDarkroom();
      else if (MUTE_KEYS[k]) toggleMute(MUTE_KEYS[k]);
      else if (k === 'n') clearPart(e.shiftKey ? 'drums' : 'bass');
      else if (k === ';') setStyle(S.style - 1);
      else if (k === "'") setStyle(S.style + 1);
      else if (k === '[') nudgeTempo(-1);
      else if (k === ']') nudgeTempo(1);
      else if (k === '{') nudgeTempo(-0.1);
      else if (k === '}') nudgeTempo(0.1);
      else if (k === '\\' || k === '|') setDnb(!S.dnb);
      else if (k === 'r') {
        if (e.shiftKey) { S.cancelClip(); S.clearClip('drums'); S.clearClip('bass'); toast('Clips cleared.'); }
        else if (A.ready && S.playing && S.recordClip('both', +$('#clipbars').value)) toast('Recording drums and bass from the next bar, then looping them.');
      } else if (k === 'i') { if (S.journey) stopJourney(); else startJourney(); }
      else if (k === 'm') toggleMidi();
      else if (A.ready && KEYS.includes(k)) {
        heldKey = k;
        A.noteOn(A.now() + 0.005, A.params.root + 12 + KEYS.indexOf(k), 0.8, false);
      }
    });
    addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        endBuild('key');
      } else if (k === heldKey) {
        heldKey = null;
        A.noteOff(A.now() + 0.005);
      }
    });
    addEventListener('blur', () => { endBuild('key'); endBuild('mouse'); });   // never leave a build hanging when the window loses focus
  }

  /* ---- pointer: the squeegee (left), build and drop (right or middle) ---- */
  function pointer() {
    const stage = $('#stage');
    let prev = null, quiet = 0;
    // A right-click is an instrument here, never a browser menu (which would also land in a screen recording).
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, select, textarea')) e.preventDefault(); });
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        startBuild(e.button === 1 || e.shiftKey ? 1 : 0, 'mouse');
        return;
      }
      if (PB.perf) return;
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
    const up = (e) => {
      if (e && (e.button === 2 || e.button === 1)) { endBuild('mouse'); return; }
      if (!prev) return;
      prev = null;
      V.wipeEnd();
      A.setParam('mod', 0.5);
      A.squeak(0);
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', (e) => { endBuild('mouse'); up(); });
    stage.addEventListener('auxclick', (e) => e.preventDefault());
  }

  /* ---- MIDI: learn any control. The actions are defined here, the mapping lives in midi.js ---- */
  let midiOpen = false;

  const QUICK_MAP = ['play', 'build', 'mute-kick', 'mute-snare', 'mute-hat', 'mute-bass', 'style-next', 'style-prev', 'cutoff', 'reso', 'space', 'level', 'tempo'];

  function defineMidi() {
    const btn = (id, label, group, down, up) => M.define(id, { label, group, kind: 'button', down, up });
    btn('play', 'Play / stop', 'Transport', togglePlay);
    btn('build', 'Build, let go to drop', 'Transport', () => startBuild(0, 'midi'), () => endBuild('midi'));
    btn('build-sink', 'Build under water, let go to drop', 'Transport', () => startBuild(1, 'midi'), () => endBuild('midi'));
    for (const part of S.PARTS) btn(`mute-${part}`, `Mute ${PART_LABEL[part]}`, 'Layers', () => toggleMute(part));
    btn('clear-bass', 'Clear the bass line', 'Layers', () => clearPart('bass'));
    btn('clear-drums', 'Clear the drums', 'Layers', () => clearPart('drums'));
    btn('clip-drums', 'Record a drums clip', 'Layers', () => $('#clipdrums').click());
    btn('clip-bass', 'Record a bass clip', 'Layers', () => $('#clipbass').click());
    btn('style-next', 'Next style', 'Show', () => setStyle(S.style + 1));
    btn('style-prev', 'Previous style', 'Show', () => setStyle(S.style - 1));
    btn('scene-next', 'Next picture', 'Show', () => V.setScene((S.scene = (S.scene + 1) % 4)));
    btn('light-next', 'Next light', 'Show', () => setLight((S.light + 1) % 3));
    btn('journey', 'Start or stop the journey', 'Show', () => { if (S.journey) stopJourney(); else startJourney(); });
    btn('tempo-up', 'Tempo up 1', 'Time', () => nudgeTempo(1));
    btn('tempo-down', 'Tempo down 1', 'Time', () => nudgeTempo(-1));
    for (const [id, label, sub, get, set] of KNOBS) {
      M.define(id, { label: `${label} (${sub})`, group: 'Knobs', kind: 'knob', min: 0, max: 1, get, set: (v) => { set(v); syncSoon(); } });
    }
    M.define('tempo', { label: 'Tempo', group: 'Time', kind: 'knob', min: 70, max: 180, get: () => A.params.tempo, set: (v) => { setTempo(v); syncSoon(); } });
  }

  const keyText = (k) => {
    const [ch, t, n] = k.split(':');
    return `ch ${+ch + 1} ${t === 'n' ? 'note' : 'cc'} ${n}`;
  };

  function toggleMidi(force) {
    midiOpen = force != null ? force : !midiOpen;
    $('#midipanel').hidden = !midiOpen;
    if (midiOpen) { if (journeyOpen) toggleJourneyPop(false); paintMidi(); }
  }

  function paintMidi() {
    if (!midiOpen) return;
    const p = $('#midipanel');
    p.classList.add('card');
    p.replaceChildren();
    const close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => toggleMidi(false));
    p.append(close, el('h3', null, 'MIDI controller'));

    const status = M.state === 'on'
      ? (M.inputs.length ? `Connected: ${M.inputs.join(', ')}` : 'Allowed, but no controller found. Plug one in.')
      : M.state === 'unsupported' ? 'This browser has no Web MIDI (Chrome and Edge do).'
        : M.state === 'denied' ? 'MIDI was not allowed. It needs the hosted page or localhost, and your permission.'
          : 'Not connected.';
    p.append(el('p', null, status));

    const top = el('div', 'row');
    const mk = (label, fn, title) => { const b = el('button', null, label); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); top.append(b); return b; };
    if (M.state !== 'on') {
      mk('connect', async () => {
        try { const names = await M.enable(); toast(names.length ? `MIDI: ${names.join(', ')}` : 'MIDI is on. Plug in a controller.'); } catch (err) { toast(err.message, 6000); }
        paintMidi();
      }, 'The browser asks for permission');
    } else {
      mk('quick map', () => { M.quickMap(QUICK_MAP); }, 'Walk through the main controls one by one');
      if (M.learning) mk('skip', () => M.skip());
      if (M.learning) mk('stop', () => M.cancelLearn());
      mk('clear all', () => { M.clearAll(); });
      mk('save map', () => { const n = `${slug()}-midi-${stampNow()}.json`; download(JSON.stringify(M.toJSON(), null, 2), n); toast(`Saved ${n}`); });
      mk('load map', () => $('#pick').click(), 'Choose a saved map file (or drag it onto the page)');
    }
    p.append(top);

    if (M.learning) p.append(el('p', null, `Now press a button or move a knob for: ${M.actions.get(M.learning).label}`));
    p.append(Object.assign(el('div', 'mon'), { textContent: M.log.length ? M.log.slice(-4).join('\n') : 'Messages from your controller show here.' }));

    if (M.state === 'on') {
      const table = el('table');
      let group = null;
      for (const a of M.actions.values()) {
        if (a.group !== group) {
          group = a.group;
          const tr = el('tr'), td = el('td', 'group-h', group);
          td.colSpan = 3;
          tr.append(td);
          table.append(tr);
        }
        const tr = el('tr');
        if (M.learning === a.id) tr.className = 'listening';
        const cur = M.keyOf(a.id);
        const c2 = el('td', 'k', cur ? keyText(cur.key) : '—');
        if (cur && a.kind === 'knob') {
          const mb = el('button', null, cur.mode === 'abs' ? 'absolute' : cur.mode === 'twos' ? 'relative' : 'relative (offset)');
          mb.type = 'button';
          mb.title = 'Knobs that spin endlessly are relative; click to change how this one is read';
          mb.addEventListener('click', () => M.cycleMode(a.id));
          c2.append(' ', mb);
        }
        const c3 = el('td');
        const lb = el('button', null, M.learning === a.id ? 'listening…' : 'learn');
        lb.type = 'button';
        lb.addEventListener('click', () => M.learn(a.id));
        c3.append(lb);
        if (cur) {
          const fb = el('button', null, '×');
          fb.type = 'button';
          fb.title = 'Forget this mapping';
          fb.addEventListener('click', () => M.forget(a.id));
          c3.append(' ', fb);
        }
        tr.append(el('td', null, a.label), c2, c3);
        table.append(tr);
      }
      p.append(table);
    }
    p.append(el('p', null, 'Traktor Kontrol X1 MK2: Native Instruments\' manual says to hold SHIFT and press both LOAD buttons to switch it to its plain MIDI mode. Then run quick map and touch each control when asked. Nothing here is tied to one device, so any MIDI controller works.'));
  }

  function buildMidi() {
    defineMidi();
    M.restore();
    M.onChange = () => { paintMidi(); };
    // a mapping already exists and the browser has already allowed MIDI here: reconnect quietly (no prompt)
    if (M.map.size && M.supported() && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'midi' }).then((s) => { if (s.state === 'granted') M.enable().catch(() => {}); }).catch(() => {});
    }
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
    buildPlaybackBar();
    buildDrop();
    buildMidi();
    watchAudio();
    keys();
    pointer();
    setLight(S.light);
    $('#dre').addEventListener('click', toggleDarkroom);
    $('#switch').addEventListener('click', powerOn);
    // a set is not something to lose to a stray Ctrl+W or F5
    addEventListener('beforeunload', (e) => {
      if (S.playing || R.state.active || PB.playing) { e.preventDefault(); e.returnValue = ''; }
    });
    // options for OBS and friends: ?clean=1 (no panel, no fullscreen prompt), ?autostart=1, ?debug=1, ?quality=low|medium|high
    if (qs.get('clean') === '1') { document.body.classList.add('clean'); $('#clean').setAttribute('aria-pressed', 'true'); }
    if (qs.get('debug') === '1') debugOverlay();
    if (qs.get('autostart') === '1') powerOn().catch(() => { /* the browser wants a click first: the splash stays */ });
  }

  SS.ui = { init, toast, setStyle, setTempo, refreshAll, openRecording, backToLive, importText };
})(window.SS);
