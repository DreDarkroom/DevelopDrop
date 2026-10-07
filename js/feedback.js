/* DevelopDrop — the feedback card and the optional page counter.

   THE CARD asks one question once you have really played for a while: "If this stopped existing, how would you feel?" (very / somewhat / not bothered),
   then an optional note. It never interrupts: it waits for about two minutes of actual playing (counted across visits, only while the page is visible and
   you are touching it), then waits for a quiet moment. "No thanks" means never again. Nothing is sent unless you press Send, and what is sent is only:
   your answer, your note, roughly how long you have played, how many different days you came, the app name and version, 'touch' or 'desktop', and your
   browser language. No account, no identifier. It goes to a private notification channel (ntfy.sh) that only the owner reads.

   THE COUNTER is an anonymous page-view count (GoatCounter: no cookies, no IP address stored). It is off until SS.config.counterCode is filled in, and it
   stays off for visitors who send "Do Not Track" and on localhost.

   Everything decided by rules (when to ask, what to send, whether to count) is a pure function on SS.feedback, so the tests can check it without a browser.
   (The same logic lives in DreVelopDrop as an ES module, src/ui/feedback.js; keep the two in step.) */
(function (SS) {
  'use strict';
  const F = {};
  F.ASK_AFTER_MS = 120000;          // two minutes of real playing before the first ask
  F.IDLE_MS = 4000;                 // ...then wait for a quiet moment this long
  F.ACTIVE_WINDOW_MS = 30000;       // a person counts as playing for 30 s after their last touch or key
  F.MAX_ASKS = 2;                   // shown at most twice ever (the second time a week later), and never again after any answer
  F.RE_ASK_AFTER_MS = 7 * 86400000;
  F.FEEL = { very: 'Very disappointed', some: 'Somewhat disappointed', not: 'Not bothered' };

  /** st = { playedMs, asks, lastAskAt, done }. idleMs = time since the last touch or key. */
  F.shouldAsk = (st, now, idleMs) => {
    if (!st || st.done || st.asks >= F.MAX_ASKS || st.playedMs < F.ASK_AFTER_MS) return false;
    if (st.asks > 0 && now - st.lastAskAt < F.RE_ASK_AFTER_MS) return false;
    return idleMs >= F.IDLE_MS;
  };

  /** One line of text, no control characters, at most 500 characters. */
  F.cleanNote = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

  F.buildMessage = ({ feel, note, playedMs, visitDays, name, version, device, lang }) => {
    const min = Math.max(0, Math.round((playedMs || 0) / 60000)), days = Math.max(1, visitDays || 1);
    const lines = [`Would miss it: ${F.FEEL[feel] || 'no answer'}`, `Played about ${min} min over ${days} day${days === 1 ? '' : 's'}`, `${name} ${version} / ${device} / ${F.cleanNote(lang).slice(0, 12) || '?'}`];
    const n = F.cleanNote(note);
    if (n) lines.splice(1, 0, `Note: ${n}`);
    return lines.join('\n');
  };

  /** Count only with a valid GoatCounter code, never for Do Not Track, never on a developer's own machine. */
  F.counterAllowed = ({ code, dnt, host }) =>
    /^[a-z0-9-]{2,40}$/.test(code || '') && dnt !== '1' && dnt !== 'yes' && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|.*\.local)$/.test(host || '');

  F.dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  /** The list of distinct days this person came (kept on their device only), capped at the last 90. */
  F.addDay = (days, today) => (days.includes(today) ? days : days.concat(today).slice(-90));

  /* ------------------------------------------------------------ the browser part */
  const KEY = 'dd.fb';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (err) { return {}; } };
  const write = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (err) { /* private window: it just will not be remembered */ } };
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  F.startCounter = (code) => {
    code = code === undefined ? SS.config.counterCode : code;
    if (!F.counterAllowed({ code, dnt: navigator.doNotTrack || window.doNotTrack, host: location.hostname })) return false;
    const s = document.createElement('script');
    s.async = true; s.src = '//gc.zgo.at/count.js'; s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
    document.head.appendChild(s);
    return true;
  };

  /** mode: 'live' (default), 'force' (?feedback=1: show now) or 'test' (?feedback=test: show now, send nothing). */
  F.start = (opts) => {
    const o = Object.assign({ url: SS.config.feedbackUrl, mode: 'live', now: () => Date.now() }, opts || {});
    if (!o.url && o.mode === 'live') return null;
    const st = Object.assign({ playedMs: 0, asks: 0, lastAskAt: 0, done: false, days: [] }, read());
    st.days = F.addDay(st.days, F.dayKey(o.now()));
    write(st);
    let lastInput = 0, card = null;
    const poke = () => { lastInput = o.now(); };
    addEventListener('pointerdown', poke, { passive: true });
    addEventListener('keydown', poke, { passive: true });
    const visible = () => document.visibilityState === 'visible' && !document.body.classList.contains('clean');

    const timer = setInterval(() => {
      const t = o.now();
      if (lastInput && t - lastInput < F.ACTIVE_WINDOW_MS && document.visibilityState === 'visible') { st.playedMs += 1000; if (st.playedMs % 10000 === 0) write(st); }
      if (card || !visible()) return;
      if (o.mode !== 'live' || (lastInput && F.shouldAsk(st, t, t - lastInput))) show();
    }, 1000);

    function close(markDone) {
      if (markDone) st.done = true;
      write(st);
      if (card) { card.remove(); card = null; }
      if (o.mode !== 'live') clearInterval(timer);
    }
    function button(label, fn, cls) { const b = h('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; }

    function show() {
      st.asks++; st.lastAskAt = o.now(); write(st);
      card = h('section'); card.id = 'fbcard';
      card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Quick feedback'); card.setAttribute('aria-live', 'polite');   // announced politely, focus left alone
      document.body.appendChild(card);
      stepOne();
    }
    function stepOne() {
      card.textContent = '';
      const row = h('div', 'fbrow');
      card.append(h('p', null, `If ${SS.config.name} stopped existing, how would you feel?`), row, h('p', 'fbfine', 'Sends only your answers. No account, no tracking.'));
      ['very', 'some', 'not'].forEach((k) => row.appendChild(button(F.FEEL[k], () => stepTwo(k))));
      row.appendChild(button('No thanks', () => close(true), 'fbquiet'));
      // Deliberately NOT focused: Space builds and drops the music, and a focused button would turn a stray Space into an answer.
    }
    function stepTwo(feel) {
      const ta = h('textarea'); ta.rows = 3; ta.maxLength = 500; ta.placeholder = 'Optional: what would make it better?';
      ta.setAttribute('aria-label', 'What would make it better? Optional.');
      const msg = h('p', 'fbfine'); msg.setAttribute('aria-live', 'polite');
      const row = h('div', 'fbrow');
      const send = button('Send', async () => {
        send.disabled = true; msg.textContent = 'Sending...';
        const body = F.buildMessage({ feel, note: ta.value, playedMs: st.playedMs, visitDays: st.days.length, name: SS.config.name, version: SS.config.version,
          device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop', lang: navigator.language });
        try {
          if (o.mode === 'test') { console.info('[feedback test, not sent]\n' + body); } else {
            const r = await fetch(o.url, { method: 'POST', body, headers: { Title: `${SS.config.name} feedback`, Tags: 'speech_balloon' } });
            if (!r.ok) throw new Error(String(r.status));
          }
          msg.textContent = o.mode === 'test' ? 'Thank you (test: nothing was sent).' : 'Thank you.';
          st.done = true; write(st); setTimeout(() => close(true), 2200);
        } catch (err) { send.disabled = false; msg.textContent = 'Could not send (offline?). Nothing was kept.'; }
      });
      row.append(send, button('Skip the note', () => { ta.value = ''; send.click(); }, 'fbquiet'), button('Close', () => close(true), 'fbquiet'));
      card.textContent = '';
      card.append(h('p', null, `Thanks: ${F.FEEL[feel].toLowerCase()}.`), ta, row, msg);
      ta.focus({ preventScroll: true });
    }
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) close(true); });
    return { state: st, close, show, stop() { clearInterval(timer); if (card) card.remove(); } };
  };

  SS.feedback = F;
})(window.SS = window.SS || { events: [] });
