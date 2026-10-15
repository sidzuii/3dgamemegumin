// Regenerates src/combat/params.js from the combat description's number sheet.
import { readFileSync, writeFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(new URL('../../docs/combat/Параметры_боевки.json', import.meta.url), 'utf8'));
const out = '// GENERATED from docs/combat/Параметры_боевки.json (numbers of the combat description). Do not edit by hand:\n'
  + '// node tools/combat/gen_params.mjs\nexport const PARAMS = ' + JSON.stringify(j, null, 2) + ';\n';
writeFileSync(new URL('../../src/combat/params.js', import.meta.url), out);
console.log('src/combat/params.js written');
