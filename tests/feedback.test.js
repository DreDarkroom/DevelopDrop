const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const SS = load('config.js', 'feedback.js');
const F = SS.feedback;
const fresh = (o = {}) => Object.assign({ playedMs: 0, asks: 0, lastAskAt: 0, done: false }, o);

test('the card waits for real playing and a quiet moment', () => {
  assert.equal(F.shouldAsk(fresh({ playedMs: F.ASK_AFTER_MS - 1 }), 1e9, F.IDLE_MS), false, 'not enough playing yet');
  assert.equal(F.shouldAsk(fresh({ playedMs: F.ASK_AFTER_MS }), 1e9, F.IDLE_MS - 1), false, 'the person is busy: never interrupt');
  assert.equal(F.shouldAsk(fresh({ playedMs: F.ASK_AFTER_MS }), 1e9, F.IDLE_MS), true);
  assert.equal(F.shouldAsk(null, 1, 1e9), false);
});

test('answered, declined, or asked twice: never again; the second ask waits a week', () => {
  const t = 1e12;
  assert.equal(F.shouldAsk(fresh({ playedMs: 1e9, done: true }), t, 1e9), false);
  assert.equal(F.shouldAsk(fresh({ playedMs: 1e9, asks: F.MAX_ASKS }), t, 1e9), false);
  assert.equal(F.shouldAsk(fresh({ playedMs: 1e9, asks: 1, lastAskAt: t - F.RE_ASK_AFTER_MS + 1000 }), t, 1e9), false);
  assert.equal(F.shouldAsk(fresh({ playedMs: 1e9, asks: 1, lastAskAt: t - F.RE_ASK_AFTER_MS }), t, 1e9), true);
});

test('what is sent: the answer, a short note, rough time, days, app, device, language and nothing else', () => {
  const m = F.buildMessage({ feel: 'very', note: '  more\nbass \u0007 please  ', playedMs: 14 * 60000, visitDays: 3, name: 'DevelopDrop', version: '3.3.1', device: 'touch', lang: 'en-GB' });
  assert.equal(m, 'Would miss it: Very disappointed\nNote: more bass please\nPlayed about 14 min over 3 days\nDevelopDrop 3.3.1 / touch / en-GB');
  assert.equal(F.buildMessage({ feel: 'not', playedMs: 0, visitDays: 1, name: 'X', version: '1', device: 'desktop', lang: '' }).includes('Note:'), false);
  assert.match(F.buildMessage({ feel: 'nope', playedMs: 100, visitDays: 0, name: 'X', version: '1', device: 'd', lang: 'de' }), /no answer/);
  assert.equal(F.cleanNote('x'.repeat(900)).length, 500);
  assert.ok(!/@|http|userAgent/i.test(m));
});

test('the counter is off without a code, for Do Not Track, and on a developer machine', () => {
  const ok = { code: 'dredarkroom', dnt: null, host: 'dredarkroom.github.io' };
  assert.equal(F.counterAllowed(ok), true);
  assert.equal(F.counterAllowed(Object.assign({}, ok, { code: '' })), false);
  assert.equal(F.counterAllowed(Object.assign({}, ok, { code: '"><script>' })), false);
  assert.equal(F.counterAllowed(Object.assign({}, ok, { dnt: '1' })), false);
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'dre.local']) assert.equal(F.counterAllowed(Object.assign({}, ok, { host })), false, host);
});

test('days are distinct and capped; the config ships safe', () => {
  assert.deepEqual(F.addDay(['2026-10-01'], '2026-10-01'), ['2026-10-01']);
  assert.equal(F.addDay(Array.from({ length: 90 }, (_, i) => 'd' + i), 'new').length, 90);
  assert.equal(SS.config.counterCode, '', 'the counter must stay off until the owner supplies a code');
  assert.match(SS.config.feedbackUrl, /^https:\/\/ntfy\.sh\/developdrop-fb-[a-z0-9]{22}$/);
});
