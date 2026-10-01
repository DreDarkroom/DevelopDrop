/* DevelopDrop — MIDI controllers (Web MIDI).
   Nothing is hard-coded to one device: every control is learned. Press "learn" next to an action (or run the quick map, which
   walks through the important ones), then press a button or move a knob. Mappings are kept in this browser and can be
   exported and imported. This module has no DOM: ui.js defines the actions and draws the panel.

   Note and CC messages are understood. A knob can be absolute (0..127), or a relative encoder, which sends "turned up by 1"
   or "turned down by 1" in one of two common encodings ("twos" 1 / 127, or "offset" 65 / 63). */
(function (SS) {
  'use strict';

  const M = (SS.midi = {
    state: 'off',            // off | unsupported | denied | on
    actions: new Map(),      // id -> { label, group, kind: 'button'|'knob', down, up, get, set, min, max }
    map: new Map(),          // 'channel:n|c:number' -> { action, mode: 'abs'|'twos'|'offset' }
    inputs: [],              // names of connected inputs
    learning: null,          // action id waiting for a control
    queue: [],               // further action ids for the quick map
    log: [],                 // the last few messages, for the monitor
    onChange: null,          // the panel repaints
  });

  const KEY = 'squidgysqueegee.midi.v1';
  const MODES = ['abs', 'twos', 'offset'];
  const KEY_RE = /^(?:[0-9]|1[0-5]):[nc]:(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/;
  const changed = () => { if (M.onChange) M.onChange(); };

  /** kind 'button': down() / up(). kind 'knob': get() and set(value) over min..max. */
  M.define = (id, spec) => { M.actions.set(id, Object.assign({ kind: 'button', min: 0, max: 1 }, spec, { id })); };

  const pressed = new Set();     // keys currently held (so a CC button fires down once, up once)

  /** What a message means: { key, type, value } or null for things we ignore (clock, sysex, pitch bend, ...). */
  M.parse = (b) => {
    if (!b || b.length < 2) return null;
    const status = b[0], cmd = status & 0xf0, ch = status & 0x0f;
    if (status >= 0xf0) return null;
    const d1 = b[1] & 0x7f, d2 = (b.length > 2 ? b[2] : 0) & 0x7f;
    if (cmd === 0x90) return { key: `${ch}:n:${d1}`, type: 'n', value: d2, on: d2 > 0 };
    if (cmd === 0x80) return { key: `${ch}:n:${d1}`, type: 'n', value: 0, on: false };
    if (cmd === 0xb0) return { key: `${ch}:c:${d1}`, type: 'c', value: d2, on: d2 >= 64 };
    return null;
  };

  const step = (mode, v) => (mode === 'twos' ? (v < 64 ? v : v - 128) : v - 64);

  /** A guess at the kind of control from its first message, used when learning. */
  function guessMode(m, isKnob) {
    if (!isKnob || m.type !== 'c') return 'abs';
    if (m.value === 1 || m.value === 127 || m.value === 2 || m.value === 126) return 'twos';
    if (m.value === 65 || m.value === 63) return 'offset';
    return 'abs';
  }

  M.handle = (bytes) => {
    const m = M.parse(bytes);
    if (!m) return false;
    M.log.push(`${m.type === 'n' ? 'note' : 'cc'} ${m.key.split(':')[2]} ch ${+m.key.split(':')[0] + 1} = ${m.value}`);
    if (M.log.length > 8) M.log.shift();

    if (M.learning) {
      // a note-off or a knob resting at zero is not a choice
      if (m.type === 'n' && !m.on) return true;
      const act = M.actions.get(M.learning);
      if (act) {
        for (const [k, e] of M.map) if (e.action === act.id || k === m.key) M.map.delete(k);
        M.map.set(m.key, { action: act.id, mode: guessMode(m, act.kind === 'knob') });
        M.save();
      }
      M.learning = M.queue.length ? M.queue.shift() : null;
      changed();
      return true;
    }

    const e = M.map.get(m.key);
    if (!e) { changed(); return false; }
    const act = M.actions.get(e.action);
    if (!act) return false;
    if (act.kind === 'button') {
      const was = pressed.has(m.key);
      if (m.on && !was) { pressed.add(m.key); if (act.down) act.down(); }
      else if (!m.on && was) { pressed.delete(m.key); if (act.up) act.up(); }
    } else if (act.set) {
      const span = act.max - act.min;
      if (e.mode === 'abs') act.set(act.min + (span * m.value) / 127);
      else act.set(Math.min(act.max, Math.max(act.min, act.get() + (step(e.mode, m.value) * span) / 100)));
    }
    changed();
    return true;
  };

  /* ---- learning ---- */
  M.learn = (id) => { M.queue = []; M.learning = M.actions.has(id) ? id : null; changed(); };
  M.cancelLearn = () => { M.learning = null; M.queue = []; changed(); };
  /** The quick map: walk through these actions one after another. */
  M.quickMap = (ids) => {
    const list = ids.filter((id) => M.actions.has(id));
    M.learning = list.shift() || null;
    M.queue = list;
    changed();
  };
  M.skip = () => { M.learning = M.queue.length ? M.queue.shift() : null; changed(); };
  M.forget = (id) => { for (const [k, e] of M.map) if (e.action === id) M.map.delete(k); M.save(); changed(); };
  M.clearAll = () => { M.map.clear(); M.save(); changed(); };
  M.cycleMode = (id) => {
    for (const e of M.map.values()) if (e.action === id) e.mode = MODES[(MODES.indexOf(e.mode) + 1) % MODES.length];
    M.save();
    changed();
  };
  M.keyOf = (id) => { for (const [k, e] of M.map) if (e.action === id) return { key: k, mode: e.mode }; return null; };

  /* ---- keeping mappings: in this browser, or as a small file ---- */
  M.toJSON = () => ({ app: 'SquidgySqueegee', kind: 'midi-map', version: 1, map: Object.fromEntries([...M.map].map(([k, e]) => [k, { action: e.action, mode: e.mode }])) });

  /** Validates everything before changing anything. Returns the number of mappings loaded, or -1 for an unusable file. */
  M.fromJSON = (j) => {
    if (!j || j.app !== 'SquidgySqueegee' || j.kind !== 'midi-map' || j.version !== 1 || !j.map || typeof j.map !== 'object') return -1;
    const entries = Object.entries(j.map);
    if (entries.length > 256) return -1;
    const next = new Map();
    for (const [k, e] of entries) {
      if (!KEY_RE.test(k) || !e || typeof e.action !== 'string' || !M.actions.has(e.action) || !MODES.includes(e.mode)) continue;
      next.set(k, { action: e.action, mode: e.mode });
    }
    M.map = next;
    M.save();
    changed();
    return next.size;
  };

  M.save = () => { try { localStorage.setItem(KEY, JSON.stringify(M.toJSON())); } catch (err) { /* private window: fine */ } };
  M.restore = () => {
    try {
      const t = localStorage.getItem(KEY);
      if (t) return M.fromJSON(JSON.parse(t));
    } catch (err) { /* corrupt or blocked: start empty */ }
    return 0;
  };

  /* ---- the browser side ---- */
  M.supported = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

  let access = null;
  function attach() {
    M.inputs = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = (e) => M.handle(e.data);
      M.inputs.push(input.name || 'MIDI input');
    }
    changed();
  }

  /** Asks the browser for MIDI (it shows its own permission prompt). Resolves to the list of input names. */
  M.enable = async () => {
    if (!M.supported()) { M.state = 'unsupported'; changed(); throw new Error('this browser has no Web MIDI (Chrome and Edge do)'); }
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      M.state = 'denied';
      changed();
      throw new Error('MIDI was not allowed. It needs the hosted page or localhost, and your permission');
    }
    M.state = 'on';
    access.onstatechange = attach;
    attach();
    return M.inputs;
  };
})(window.SS);
