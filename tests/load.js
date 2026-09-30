// Loads the browser scripts into Node so the pure logic can be unit-tested. No browser needed.
const fs = require('fs');
const path = require('path');

function load(...files) {
  const win = { SS: { events: [] }, addEventListener() {}, matchMedia: () => ({ matches: false }) };
  win.window = win;
  for (const f of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
    new Function('window', 'globalThis', code).call(win, win, win);
  }
  return win.SS;
}

module.exports = { load };
