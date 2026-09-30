const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

function fresh() {
  const SS = load('midi.js');
  const M = SS.midi;
  const calls = [];
  let v = 0.5;
  M.define('go', { kind: 'button', down: () => calls.push('down'), up: () => calls.push('up') });
  M.define('knob', { kind: 'knob', min: 0, max: 1, get: () => v, set: (x) => { v = x; } });
  M.define('tempo', { kind: 'knob', min: 60, max: 200, get: () => 120, set: (x) => calls.push(['tempo', x]) });
  return { M, calls, val: () => v };
}

test('parse understands notes, CCs, and ignores clock and sysex', () => {
  const { M } = fresh();
  assert.deepEqual(M.parse([0x90, 36, 100]), { key: '0:n:36', type: 'n', value: 100, on: true });
  assert.equal(M.parse([0x90, 36, 0]).on, false);          // note-on with velocity 0 is a note-off
  assert.equal(M.parse([0x85, 40, 10]).key, '5:n:40');
  assert.deepEqual(M.parse([0xb2, 7, 99]), { key: '2:c:7', type: 'c', value: 99, on: true });
  assert.equal(M.parse([0xf8]), null);
  assert.equal(M.parse([0xf0, 1, 2, 0xf7]), null);
  assert.equal(M.parse([0xe0, 1, 2]), null);               // pitch bend: not used
  assert.equal(M.parse(null), null);
  assert.equal(M.parse([0x90]), null);
});

test('a learned button fires down once and up once, even for a CC that repeats', () => {
  const { M, calls } = fresh();
  M.learn('go');
  M.handle([0x90, 12, 127]);                               // learning consumes this
  assert.deepEqual(calls, []);
  assert.equal(M.learning, null);
  M.handle([0x90, 12, 127]); M.handle([0x90, 12, 127]); M.handle([0x80, 12, 0]);
  assert.deepEqual(calls, ['down', 'up']);
  M.learn('go');
  M.handle([0xb0, 20, 127]);
  calls.length = 0;
  M.handle([0xb0, 20, 127]); M.handle([0xb0, 20, 100]); M.handle([0xb0, 20, 0]);
  assert.deepEqual(calls, ['down', 'up']);
});

test('learning ignores a note-off and replaces older mappings for the same action or key', () => {
  const { M } = fresh();
  M.learn('go');
  M.handle([0x80, 5, 0]);                                  // release of the last key: not a choice
  assert.equal(M.learning, 'go');
  M.handle([0x90, 5, 100]);
  M.learn('go');
  M.handle([0x90, 6, 100]);                                // same action, new key: old one is gone
  assert.equal(M.map.size, 1);
  assert.equal(M.keyOf('go').key, '0:n:6');
  M.learn('knob');
  M.handle([0xb0, 6 + 0, 0]);                              // a different type on number 6: separate key
  assert.equal(M.map.size, 2);
  M.learn('tempo');
  M.handle([0xb0, 6, 50]);                                 // the same key taken over by another action
  assert.equal(M.keyOf('knob'), null);
  assert.equal(M.keyOf('tempo').key, '0:c:6');
});

test('absolute knobs scale across the range', () => {
  const { M, calls, val } = fresh();
  M.learn('knob'); M.handle([0xb0, 1, 40]);                // first value 40: absolute
  assert.equal(M.keyOf('knob').mode, 'abs');
  M.handle([0xb0, 1, 127]);
  assert.equal(val(), 1);
  M.handle([0xb0, 1, 0]);
  assert.equal(val(), 0);
  M.learn('tempo'); M.handle([0xb0, 2, 50]);
  M.handle([0xb0, 2, 127]);
  assert.deepEqual(calls.pop(), ['tempo', 200]);
});

test('relative encoders (twos and offset) nudge and stay inside the range', () => {
  const { M, val } = fresh();
  M.learn('knob'); M.handle([0xb0, 3, 1]);                 // a first value of 1: a "twos" encoder
  assert.equal(M.keyOf('knob').mode, 'twos');
  M.handle([0xb0, 3, 1]);
  assert.ok(Math.abs(val() - 0.51) < 1e-9);
  M.handle([0xb0, 3, 127]);                                // -1
  assert.ok(Math.abs(val() - 0.5) < 1e-9);
  for (let i = 0; i < 200; i++) M.handle([0xb0, 3, 10]);
  assert.equal(val(), 1);                                  // clamped
  M.learn('knob'); M.handle([0xb0, 4, 65]);
  assert.equal(M.keyOf('knob').mode, 'offset');
  for (let i = 0; i < 300; i++) M.handle([0xb0, 4, 60]);
  assert.equal(val(), 0);
});

test('cycleMode rotates abs, twos, offset', () => {
  const { M } = fresh();
  M.learn('knob'); M.handle([0xb0, 9, 30]);
  assert.equal(M.keyOf('knob').mode, 'abs');
  M.cycleMode('knob'); assert.equal(M.keyOf('knob').mode, 'twos');
  M.cycleMode('knob'); assert.equal(M.keyOf('knob').mode, 'offset');
  M.cycleMode('knob'); assert.equal(M.keyOf('knob').mode, 'abs');
});

test('quick map walks the list, and skip moves on', () => {
  const { M } = fresh();
  M.quickMap(['go', 'nope', 'knob', 'tempo']);             // unknown ids are dropped
  assert.equal(M.learning, 'go');
  M.handle([0x90, 1, 100]);
  assert.equal(M.learning, 'knob');
  M.skip();
  assert.equal(M.learning, 'tempo');
  M.handle([0xb0, 2, 20]);
  assert.equal(M.learning, null);
  assert.equal(M.map.size, 2);
});

test('mappings export and import, and a hostile file changes nothing', () => {
  const { M } = fresh();
  M.learn('go'); M.handle([0x90, 7, 100]);
  const j = JSON.parse(JSON.stringify(M.toJSON()));
  M.clearAll();
  assert.equal(M.fromJSON(j), 1);
  assert.equal(M.keyOf('go').key, '0:n:7');
  const before = JSON.stringify(M.toJSON());
  assert.equal(M.fromJSON(null), -1);
  assert.equal(M.fromJSON({ app: 'x' }), -1);
  assert.equal(M.fromJSON({ app: 'SquidgySqueegee', kind: 'midi-map', version: 1, map: 5 }), -1);
  assert.equal(JSON.stringify(M.toJSON()), before);
  const bad = { app: 'SquidgySqueegee', kind: 'midi-map', version: 1, map: {
    '0:n:1': { action: 'go', mode: 'abs' },
    '16:n:1': { action: 'go', mode: 'abs' },                // channel out of range
    '0:n:200': { action: 'go', mode: 'abs' },               // number out of range
    '0:c:2': { action: 'missing', mode: 'abs' },            // unknown action
    '0:c:3': { action: 'go', mode: 'wild' },                // unknown mode
    '__proto__': { action: 'go', mode: 'abs' },
  } };
  assert.equal(M.fromJSON(bad), 1);
  assert.deepEqual([...M.map.keys()], ['0:n:1']);
  const huge = { app: 'SquidgySqueegee', kind: 'midi-map', version: 1, map: {} };
  for (let i = 0; i < 300; i++) huge.map[`0:n:${i % 128}:${i}`] = { action: 'go', mode: 'abs' };
  assert.equal(M.fromJSON(huge), -1);
});

test('a message for an unmapped control does nothing, and a removed action is ignored', () => {
  const { M, calls } = fresh();
  assert.equal(M.handle([0x90, 99, 127]), false);
  M.learn('go'); M.handle([0x90, 1, 100]);
  M.actions.delete('go');
  assert.equal(M.handle([0x90, 1, 127]), false);
  assert.deepEqual(calls, []);
});

test('enable reports unsupported browsers and works with a fake MIDIAccess', async () => {
  const { M } = fresh();
  globalThis.navigator = undefined;
  await assert.rejects(M.enable(), /no Web MIDI/);
  assert.equal(M.state, 'unsupported');
  const input = { name: 'Fake X1', onmidimessage: null };
  const access = { inputs: new Map([['a', input]]), onstatechange: null };
  Object.defineProperty(globalThis, 'navigator', { value: { requestMIDIAccess: async () => access }, configurable: true });
  const names = await M.enable();
  assert.deepEqual(names, ['Fake X1']);
  assert.equal(M.state, 'on');
  M.learn('go');
  input.onmidimessage({ data: [0x90, 3, 100] });           // messages arrive through the browser's callback
  assert.equal(M.keyOf('go').key, '0:n:3');
  delete globalThis.navigator;
});
