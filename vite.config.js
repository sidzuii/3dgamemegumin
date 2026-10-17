import { defineConfig } from 'vite';
import { writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, normalize } from 'node:path';

const LAYOUT = resolve('public/data/placements.json');

/**
 * Map editor save endpoint (dev server only): POST /__editor/save writes the layout JSON to
 * public/data/placements.json (the previous version is kept as placements.backup.json).
 */
function mapEditorSave() {
  return {
    name: 'map-editor-save',
    configureServer(server) {
      server.middlewares.use('/__editor/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 20e6) req.destroy(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (typeof data !== 'object' || !data || typeof data.overrides !== 'object' || !Array.isArray(data.added)) throw new Error('bad layout');
            mkdirSync(resolve('public/data'), { recursive: true });
            if (existsSync(LAYOUT)) copyFileSync(LAYOUT, resolve('public/data/placements.backup.json'));
            writeFileSync(LAYOUT, JSON.stringify(data, null, 1) + '\n');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
          }
        });
      });
    },
  };
}

const VOICE_DIR = resolve('public/audio/voice');
const VOICE_MOD = 'virtual:voice-manifest';

/**
 * The recorded lines that exist: `import VOICES from 'virtual:voice-manifest'` = { lineId: 'mp3' | 'ogg' } from the files in
 * public/audio/voice (src/core/Voice.js). Read at build time (the portable build carries exactly the files it was built with)
 * and on each page load of the dev server (a file added while it runs is picked up by the next reload).
 */
function voiceManifest() {
  const scan = () => {
    const m = {};
    if (existsSync(VOICE_DIR)) for (const f of readdirSync(VOICE_DIR).sort()) {
      const r = /^([A-Z][A-Za-z0-9_]*_\d{3})\.(mp3|ogg)$/i.exec(f);
      if (r && !(r[1] in m)) m[r[1]] = r[2].toLowerCase();
    }
    return m;
  };
  return {
    name: 'voice-manifest',
    resolveId: (id) => (id === VOICE_MOD ? '\0' + VOICE_MOD : null),
    load: (id) => (id === '\0' + VOICE_MOD ? `export default ${JSON.stringify(scan())};` : null),
    configureServer(server) {
      const stale = (f) => {
        if (!normalize(f).startsWith(VOICE_DIR)) return;
        const mod = server.moduleGraph.getModuleById('\0' + VOICE_MOD);
        if (mod) server.moduleGraph.invalidateModule(mod);
      };
      server.watcher.add(VOICE_DIR);
      server.watcher.on('add', stale);
      server.watcher.on('unlink', stale);
    },
  };
}

export default defineConfig({
  plugins: [mapEditorSave(), voiceManifest()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Raw source assets (FBX/zip/4K textures) live in model/; the game only uses the
    // optimised copies in public/models. Don't watch them (large files can be locked
    // while they are being copied in, which crashes the watcher on Windows).
    // The map layout is saved by the editor while it runs: no reload on that write.
    watch: { ignored: ['**/model/**', '**/dist/**', '**/release/**', '**/public/data/**'] },
  },
  // The map editor's gizmo: pre-bundled so the first ?editor load doesn't trigger a reload.
  optimizeDeps: { include: ['three/examples/jsm/controls/TransformControls.js'] },
  preview: { host: '127.0.0.1', port: 4173 },
});
