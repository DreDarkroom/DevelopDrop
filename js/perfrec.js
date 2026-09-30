/* SquidgySqueegee — the compact "performance" format (.sqz).
   Not audio: a recording of WHAT THE INSTRUMENT DID (every note, drum hit, knob move, light change and squeegee stroke,
   with its exact time). The stand-alone player (player.html) re-plays it through the same synth and visuals, so an hour-long
   set is a few hundred KB instead of hundreds of MB, and it plays back in any browser.

   File = JSON, gzip-compressed when the browser supports it (auto-detected on load, so both work).
   {
     app, kind:"performance", version:1, created, duration (s), unit:"0.1ms",
     snapshot: {...the loop at the start...},
     events: [[dt, code, ...args], ...]     dt = time since the previous event in 0.1 ms units
   }
   Codes: 0 noteOn(midi,vel,accent,baseHz)  1 noteOff  2 kick(vel)  3 snare(vel)  4 hat(vel,open)  5 param(key,value)
          6 expose(on)  7 light(i)  8 wipe(x,y,px,py normalised)  9 kaleido(n)  10 squeak(speed,x)
          11 sweep(0=hp|1=lp, toHz, seconds)  12 gap(seconds)  13 impact(size)  14 riser(on, variant)  15 kit(index)  16 scene(index)
   Pure logic, no browser-only APIs except CompressionStream (present in browsers and Node 18+). */
(function (SS) {
  'use strict';

  const C = { noteOn: 0, noteOff: 1, kick: 2, snare: 3, hat: 4, param: 5, expose: 6, light: 7, wipe: 8, kaleido: 9, squeak: 10, sweep: 11, gap: 12, impact: 13, riser: 14, kit: 15, scene: 16 };
  const SCHEDULED = new Set([C.noteOn, C.noteOff, C.kick, C.snare, C.hat, C.sweep, C.gap, C.impact, C.riser]); // carry a future audio time; the rest happen "now"
  const UNIT = 10000;                                                        // ticks per second (0.1 ms)
  const MAX_EVENTS = 3000000;
  // A Map, not a plain object: a hostile file naming a parameter "__proto__" or "constructor" must not match anything.
  const PARAM_RANGE = new Map(Object.entries({ cutoff: [0, 1], reso: [0, 1], decay: [0, 1], drive: [0, 1], glide: [0, 1], space: [0, 1], tempo: [60, 200], mod: [0, 1], level: [0, 1], duck: [0, 1] }));
  const r = (v, d) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };

  /* ---------------- recording ---------------- */
  let rec = null;

  const perf = {
    CODES: C,
    get active() { return !!rec; },

    start(nowAbs, snapshot) {
      rec = { t0: nowAbs, snapshot, ev: [] };
    },

    /** tAbs = the time (audio clock) the event happens at; for scheduled sounds that is in the future. */
    log(tAbs, code, ...args) {
      if (!rec) return;
      if (rec.ev.length >= MAX_EVENTS) return;
      rec.ev.push([Math.max(0, tAbs - rec.t0), code, ...args]);
    },

    stop(nowAbs) {
      if (!rec) return null;
      const ev = rec.ev.map((e, i) => [e, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map((x) => x[0]);
      let prev = 0;
      const packed = ev.map((e) => {
        const ticks = Math.round(e[0] * UNIT);
        const out = [ticks - prev, e[1], ...e.slice(2)];
        prev = ticks;
        return out;
      });
      const doc = {
        app: 'SquidgySqueegee', kind: 'performance', version: 1, created: new Date().toISOString(),
        duration: r(Math.max(0, nowAbs - rec.t0), 2), unit: '0.1ms', snapshot: rec.snapshot, events: packed,
      };
      rec = null;
      return doc;
    },
  };

  /* ---------------- file encoding ---------------- */
  async function gzip(bytes) {
    const cs = new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
    return new Uint8Array(await cs.arrayBuffer());
  }

  async function gunzip(bytes) {
    const ds = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    return new Uint8Array(await ds.arrayBuffer());
  }

  perf.encode = async function (doc) {
    const bytes = new TextEncoder().encode(JSON.stringify(doc));
    try {
      return { bytes: await gzip(bytes), gzip: true };
    } catch (err) {
      return { bytes, gzip: false };                      // no CompressionStream: plain JSON still loads everywhere
    }
  };

  /** bytes (gzip or plain JSON) -> validated, expanded performance {duration, snapshot, events:[{t, code, a:[...]}]} */
  perf.decode = async function (bytes) {
    let u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) u8 = await gunzip(u8);
    let doc;
    try {
      doc = JSON.parse(new TextDecoder().decode(u8));
    } catch (err) {
      throw new Error('not a SquidgySqueegee performance file');
    }
    return perf.validate(doc);
  };

  perf.validate = function (doc) {
    if (!doc || doc.app !== 'SquidgySqueegee' || doc.kind !== 'performance' || !Array.isArray(doc.events)) {
      throw new Error('not a SquidgySqueegee performance file');
    }
    if (doc.version !== 1) throw new Error('this performance was made by a newer version');
    if (doc.events.length > MAX_EVENTS) throw new Error('performance is too large');
    const out = [];
    let ticks = 0;
    for (const e of doc.events) {
      if (!Array.isArray(e) || e.length < 2 || !Number.isFinite(e[0]) || e[0] < 0 || !Number.isInteger(e[1])) continue;
      ticks += e[0];
      const a = e.slice(2);
      if (!a.every((x) => typeof x === 'number' ? Number.isFinite(x) : typeof x === 'string')) continue;
      const code = e[1];
      if (code === C.param) {
        const range = PARAM_RANGE.get(a[0]);
        if (!range || typeof a[1] !== 'number') continue;          // unknown / hostile parameter names are dropped
        a[1] = Math.min(range[1], Math.max(range[0], a[1]));
      } else if (code === C.light) {
        if (![0, 1, 2].includes(a[0])) continue;
      } else if (code === C.kaleido) {
        if (![6, 8, 10, 12].includes(a[0])) continue;
      } else if (code === C.sweep) {
        if (![0, 1].includes(a[0]) || !(a[1] >= 10 && a[1] <= 20000) || !(a[2] >= 0 && a[2] <= 60)) continue;
      } else if (code === C.gap) {
        if (!(a[0] >= 0 && a[0] <= 2)) continue;
      } else if (code === C.impact) {
        if (!(a[0] >= 0 && a[0] <= 3)) continue;
      } else if (code === C.riser) {
        if (![0, 1].includes(a[0]) || ![0, 1].includes(a[1])) continue;
      } else if (code === C.kit) {
        if (!Number.isInteger(a[0]) || a[0] < 0 || a[0] > 4) continue;
      } else if (code === C.scene) {
        if (!Number.isInteger(a[0]) || a[0] < 0 || a[0] > 3) continue;
      } else if (code < 0 || code > 16) {
        continue;
      }
      out.push({ t: ticks / UNIT, code, a });
    }
    const last = out.length ? out[out.length - 1].t : 0;
    return { duration: Math.max(Number(doc.duration) || 0, last), snapshot: doc.snapshot || {}, events: out, created: doc.created };
  };

  /* ---------------- playback scheduling (used by player.html; pure, so it is unit-tested) ---------------- */

  /** state at time t: the last value of every parameter, the light, kaleidoscope and whether expose is held. */
  perf.stateAt = function (events, t) {
    const state = { params: {}, light: null, kaleido: null, expose: false };
    for (const e of events) {
      if (e.t > t) break;
      if (e.code === C.param) state.params[e.a[0]] = e.a[1];
      else if (e.code === C.light) state.light = e.a[0];
      else if (e.code === C.kaleido) state.kaleido = e.a[0];
      else if (e.code === C.expose) state.expose = !!e.a[0];
    }
    return state;
  };

  perf.indexAt = function (events, t) {
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].t < t) lo = mid + 1; else hi = mid;
    }
    return lo;
  };

  /**
   * Hand out every event that is due. Returns the new index.
   * `T0` maps performance time to audio-clock time (audio time = T0 + e.t).
   * Sounds are dispatched up to `lookahead` seconds early with their exact time; everything else when it is due.
   */
  perf.pump = function (events, idx, now, T0, handlers, lookahead = 0.18, lead = 0.03) {
    while (idx < events.length) {
      const e = events[idx], at = T0 + e.t;
      const scheduled = SCHEDULED.has(e.code);
      if (scheduled ? at >= now + lookahead : at > now + lead) break;
      const h = handlers[e.code];
      if (h) h(at, ...e.a);
      idx++;
    }
    return idx;
  };

  SS.perf = perf;
})((typeof window !== 'undefined' ? (window.SS = window.SS || { events: [] }) : (globalThis.SS = globalThis.SS || { events: [] })));
