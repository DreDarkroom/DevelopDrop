/* DevelopDrop — the performance player page: a small transport bar over the shared playback engine (js/playback.js). */
(function (SS) {
  'use strict';

  const V = SS.visual, PB = SS.playback;
  const $ = (s) => document.querySelector(s);
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}` : `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };

  let idleTimer = 0, dragging = false;

  let toastTimer = 0;
  function toast(msg, ms = 4500) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function paint() {
    const perf = PB.perf;
    if (!perf) return;
    const p = PB.position();
    if (!dragging) $('#seek').value = p;
    $('#time').textContent = `${fmt(p)} / ${fmt(perf.duration)}`;
    $('#play').textContent = PB.playing ? '❚❚' : '▶';
    $('#play').setAttribute('aria-label', PB.playing ? 'Pause' : 'Play');
  }
  PB.onChange = paint;

  async function load(bytes, name) {
    let doc;
    try {
      doc = await PB.load(bytes);
    } catch (err) {
      toast(`${name || 'That file'}: ${err.message}`);
      return false;
    }
    $('#drop').hidden = true;
    $('#bar').hidden = false;
    $('#seek').max = doc.duration;
    $('#ptitle').textContent = `${name ? name + ' · ' : ''}${fmt(doc.duration)} · ${doc.events.length.toLocaleString()} events`;
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
    idleTimer = setTimeout(() => { if (PB.playing && !dragging) bar.classList.add('idle'); }, 3000);
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
        if (await load(new Uint8Array(await r.arrayBuffer()), 'demo.sqz')) PB.play();
      } catch (err) { toast(`Demo: ${err.message}`); }
    });
    pick.addEventListener('change', () => { const f = pick.files[0]; pick.value = ''; loadFile(f); });
    $('#play').addEventListener('click', () => { PB.toggle(); poke(); });
    $('#hide').addEventListener('click', () => document.body.classList.add('clean'));
    const seekBar = $('#seek');
    seekBar.addEventListener('input', () => { dragging = true; $('#time').textContent = `${fmt(+seekBar.value)} / ${fmt(PB.perf.duration)}`; });
    seekBar.addEventListener('change', () => { dragging = false; PB.seek(+seekBar.value); });
    addEventListener('pointermove', () => { document.body.classList.remove('clean'); poke(); });
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase(), perf = PB.perf;
      if (k === ' ' && perf) { e.preventDefault(); if (!e.repeat) PB.toggle(); }
      else if (k === 'arrowleft' && perf) PB.seek(PB.position() - 10);
      else if (k === 'arrowright' && perf) PB.seek(PB.position() + 10);
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
    addEventListener('beforeunload', (e) => { if (PB.playing) { e.preventDefault(); e.returnValue = ''; } });
  }

  SS.player = { load, play: PB.play, pause: PB.pause, seek: PB.seek, position: PB.position, get playing() { return PB.playing; }, get perf() { return PB.perf; } };
  init();
})(window.SS);
