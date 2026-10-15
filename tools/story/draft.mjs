// Prints a draft of the dialogue program (data/story DSL) for scenes of the scenario package, with the
// non-spoken source lines (conditions, results, stage directions) as comments to be turned into IF / DO.
//   node tools/story/draft.mjs <clips_export.json> <docs/story/file.md> <scene id>...      (ids like A00 B01a C14)
import { readFileSync } from 'node:fs';
const [exportPath, mdPath, ...ids] = process.argv.slice(2);
const exp = JSON.parse(readFileSync(exportPath, 'utf8'));
const md = readFileSync(mdPath, 'utf8').split('\n');
const byLine = new Map(); // source line -> clip, for this file
const file = mdPath.split('/').pop();
const base = { '02_chapters_0-4.md': '02_Главы_0–4_Диалоги.md', '03_chapters_5-10.md': '03_Главы_5–10_Диалоги.md', '04_side_stories.md': '04_Побочные_истории.md', '05_implementation_notes.md': '05_Озвучка_и_реализация.md' }[file] || file;
for (const c of exp.clips) if (c.source_file === base) byLine.set(c.source_line, c);
const num = (id) => +id.split('_')[1];
const short = (s) => (s.length > 170 ? s.slice(0, 167) + '…' : s);

function sceneRange(id) {
  const re = new RegExp(`^#{2,3} ${id}[ .]`);
  const a = md.findIndex((l) => re.test(l));
  if (a < 0) throw new Error('scene not found: ' + id);
  let b = md.findIndex((l, i) => i > a && /^#{1,3} /.test(l));
  if (b < 0) b = md.length;
  return [a + 1, b]; // 0-based [from, to) = lines after the header
}

for (const id of ids) {
  const [from, to] = sceneRange(id);
  const rows = [];
  for (let i = from; i < to; i++) {
    const text = md[i];
    if (!text.trim()) continue;
    const clip = byLine.get(i + 1);
    rows.push({ n: i + 1, indent: text.length - text.trimStart().length, text: text.trim(), clip });
  }
  const out = [];
  const flushRun = (run, pad) => {
    // contiguous clip numbers -> ranges
    let k = 0;
    while (k < run.length) {
      let e = k;
      while (e + 1 < run.length && num(run[e + 1]) === num(run[e]) + 1) e++;
      out.push(`${pad}$.L(${num(run[k])}${e > k ? ', ' + num(run[e]) : ''}),`);
      k = e + 1;
    }
  };
  const emitSeq = (list, pad) => {
    let run = [];
    for (const r of list) {
      if (r.clip) run.push(r.clip.id);
      else { flushRun(run, pad); run = []; out.push(`${pad}// ${short(r.text)}  [md:${r.n}]`); }
    }
    flushRun(run, pad);
  };
  out.push(`  ...S('${id}', ($) => [`);
  let i = 0;
  const seq = [];
  const flushSeq = () => { if (seq.length) { emitSeq(seq, '    '); seq.length = 0; } };
  while (i < rows.length) {
    const r = rows[i];
    const isOpt = r.clip?.kind === 'player_choice' && r.indent === 0;
    const isLabel = !r.clip && r.indent === 0 && /^Выбор /.test(r.text);
    if (isLabel || isOpt) {
      flushSeq();
      const cid = isOpt ? r.clip.choice : (r.text.match(/^Выбор ([A-Za-z0-9.]+)/)?.[1] ?? '?');
      if (isLabel) { out.push(`    // ${short(r.text)}  [md:${r.n}]`); i++; }
      out.push(`    $.CH('${cid}', [`);
      while (i < rows.length && rows[i].clip?.kind === 'player_choice' && rows[i].indent === 0) {
        const o = rows[i]; i++;
        const body = [];
        while (i < rows.length && !(rows[i].clip?.kind === 'player_choice' && rows[i].indent === 0) && rows[i].indent > 0) { body.push(rows[i]); i++; }
        out.push(`      $.O(${num(o.clip.id)}, [`);
        emitSeq(body, '        ');
        out.push('      ]),');
      }
      out.push('    ]),');
      continue;
    }
    seq.push(r);
    i++;
  }
  flushSeq();
  out.push('  ]),');
  console.log(out.join('\n'));
}
