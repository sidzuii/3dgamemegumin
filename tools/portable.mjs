// The game as a desktop program for a Windows PC with nothing to install: node tools/portable.mjs (npm run portable) builds
// release/Megumin = Play.bat (first start: shortcuts «Мегумин» with the icon, then the game) + README.txt + app/ (serve.ps1 = a tiny
// web server in the stock Windows PowerShell that opens the game in an Edge/Chrome app window, megumin.ico, game/ = the vite build).
// On Windows it also packs release/Megumin.zip.
import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { platform } from 'node:os';

const out = 'release/Megumin';
rmSync('release', { recursive: true, force: true });
mkdirSync(`${out}/app`, { recursive: true });
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', `${out}/app/game`, '--emptyOutDir'], { stdio: 'inherit' });
for (const f of ['Play.bat', 'README.txt']) copyFileSync(`tools/portable/${f}`, `${out}/${f}`);
for (const f of ['serve.ps1', 'megumin.ico']) copyFileSync(`tools/portable/${f}`, `${out}/app/${f}`);
if (platform() === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}' -DestinationPath 'release/Megumin.zip' -Force`], { stdio: 'inherit' });
  console.log('Готово: release\\Megumin.zip — отправь другу: распаковать, запустить Play.bat');
} else console.log(`Готово: ${out}${existsSync(`${out}/app/game/index.html`) ? '' : ' (сборка не найдена!)'}`);
