#!/usr/bin/env node
/**
 * check-icons.js — Pre-commit validation script.
 *
 * Scans JSON data files for "icon" and "end_icon" field values, strips the "mdi:" prefix,
 * and checks that /assets/icons/{name}.svg exists for each referenced icon.
 * Exits non-zero with a clear error message if any files are missing.
 *
 * Usage (called by .git/hooks/pre-commit):
 *   node scripts/check-icons.js
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const DATA_FILES = [
  'app/tests/fixtures/mock-timeline.json',
  // perf-timeline.json is gitignored (generated); skip if not present.
  'app/tests/fixtures/perf-timeline.json',
].filter((f) => {
  try { readFileSync(resolve(root, f)); return true; } catch { return false; }
});

const missing = [];

for (const relPath of DATA_FILES) {
  const filePath = resolve(root, relPath);
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`check-icons: could not read ${relPath}: ${err.message}`);
    process.exit(1);
  }

  const events = data.events ?? [];
  for (const evt of events) {
    for (const field of ['icon', 'end_icon']) {
      if (!evt[field]) continue;
      const name = evt[field].replace(/^mdi:/, '');
      const svgPath = resolve(root, 'app/assets/icons', `${name}.svg`);
      if (!existsSync(svgPath)) {
        missing.push(`  ${evt[field]}  (referenced in ${relPath}, event "${evt.id}", field "${field}")`);
      }
    }
  }
}

if (missing.length > 0) {
  console.error('check-icons: missing icon files:\n' + missing.join('\n'));
  console.error('\nAdd the corresponding MDI SVG files to app/assets/icons/ before committing.');
  process.exit(1);
}

console.log(`check-icons: all icons present (${DATA_FILES.length} file(s) checked).`);
