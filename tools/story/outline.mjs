// Compact outline of scenes: clip number, speaker, first words; answers marked with their choice id / option.
//   node tools/story/outline.mjs B01a B02a ...
import { CLIPS } from '../../src/data/story/clips.js';
for (const sc of process.argv.slice(2)) {
  const rows = Object.entries(CLIPS).filter(([k]) => k.startsWith(sc + '_'));
  console.log(`== ${sc}`);
  for (const [k, c] of rows) console.log(`${+k.split('_')[1]}${c[2] ? ' ▶' + c[2] + '#' + c[3] : ''} ${c[0].slice(0, 4)}: ${c[1].slice(0, 46)}`);
}
