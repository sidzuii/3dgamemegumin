// The game for a friend's Windows PC with nothing to install: node tools/portable.mjs (npm run portable) builds it into
// release/Megumin = Play.bat + serve.ps1 (a tiny local web server in the stock Windows PowerShell) + game/ (the vite build),
// and on Windows also packs release/Megumin.zip. The friend unpacks the zip and double-clicks Play.bat.
import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { platform } from 'node:os';

const out = 'release/Megumin';
rmSync('release', { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', `${out}/game`, '--emptyOutDir'], { stdio: 'inherit' });
for (const f of ['Play.bat', 'serve.ps1']) copyFileSync(`tools/portable/${f}`, `${out}/${f}`);
if (platform() === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}' -DestinationPath 'release/Megumin.zip' -Force`], { stdio: 'inherit' });
  console.log('Готово: release\\Megumin.zip — отправь другу, пусть распакует и запустит Play.bat');
} else console.log(`Готово: ${out}${existsSync(`${out}/game/index.html`) ? '' : ' (сборка не найдена!)'}`);
