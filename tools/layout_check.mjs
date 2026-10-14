// Overlap check of the Axel buildings with the saved editor layout applied (dev tool, node only).
//   node tools/layout_check.mjs [layout.json]     (default public/data/placements.json)
// Same check as the map editor's "Проверить дома" (src/world/AxelLayoutCheck.js); exit code 1 when the
// layout puts houses inside each other or on a street.
import { readFileSync } from 'node:fs';
import { checkAxelLayout } from '../src/world/AxelLayoutCheck.js';

const file = process.argv[2] ?? 'public/data/placements.json';
const layout = JSON.parse(readFileSync(file, 'utf8'));
const r = checkAxelLayout(layout.overrides);
console.log(JSON.stringify({ layout: file, ...r }, null, 1));
process.exit(r.overlaps.length || r.onStreet.length ? 1 : 0);
