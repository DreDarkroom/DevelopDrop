// Adds ?v=<version> to every local script and stylesheet in the HTML pages, and prints what it did.
// Why: hosts cache files for minutes, so after a release a visitor could get a NEW page with OLD scripts.
// A new version string in the address makes browsers fetch the matching files. Run it after changing js/config.js's version:
//   node tools/stamp.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const version = (fs.readFileSync(path.join(root, 'js/config.js'), 'utf8').match(/version:\s*'([^']+)'/) || [])[1];
if (!version) { console.error('could not find version in js/config.js'); process.exit(1); }
let changed = 0;
for (const page of ['index.html', 'player.html']) {
  const file = path.join(root, page);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/((?:src|href)="(?:js|css)\/[^"?]+)(?:\?v=[^"]*)?"/g, `$1?v=${version}"`);
  if (after !== before) { fs.writeFileSync(file, after); changed++; }
  console.log(`${page}: ${(after.match(/\?v=/g) || []).length} references stamped ?v=${version}`);
}
console.log(changed ? 'updated' : 'already up to date');
