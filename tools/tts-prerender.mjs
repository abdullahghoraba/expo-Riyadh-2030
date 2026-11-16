#!/usr/bin/env node
/**
 * Pre-records the narration with the neural voices for static hosting (GitHub Pages), where tools/tts-server.mjs
 * cannot run. Every line the app can speak is computed with the app's own code (src/app/imagine/narration-lines.ts)
 * for every plot × pavilion style × floor count, synthesised through tools/tts-server.mjs and written to
 * <outDir>/voice/*.mp3 plus voice/index.json, which AudioService looks up when no narration server answers.
 *
 *   node tools/tts-prerender.mjs [outDir] [--langs=ar,en]      (defaults: dist/expo-twin-angular/browser, ar)
 *
 * Clips are cached in .tts-cache (shared with the server), so later runs only synthesise new or changed lines.
 * A line that cannot be synthesised is skipped – the app then uses the browser voice for that line only.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = path.resolve(root, args.find(a => !a.startsWith('--')) || 'dist/expo-twin-angular/browser');
const langs = (args.find(a => a.startsWith('--langs='))?.slice(8) || 'ar').split(',').filter(Boolean);
const PORT = Number(process.env.TTS_PRERENDER_PORT) || 4319;

if (!existsSync(path.join(out, 'index.html'))) {
  console.error(`[prerender] ${out} has no index.html – run ng build first`);
  process.exit(1);
}

// 1. the app's narration code (plain TypeScript), bundled for Node
const entry = `
export { narrationValues, spokenLine, speechKey } from './src/app/imagine/narration-lines';
export { setCenter } from './src/app/core/geo';
export { WalkRouter } from './src/app/core/walk-router';
export { pavilionPlan, specFromPlot, STYLES } from './src/app/pavilion/pavilion-plan';
`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
const tmp = path.join(os.tmpdir(), `narration-lines-${process.pid}.mjs`);
writeFileSync(tmp, bundle.outputFiles[0].text);
const N = await import(pathToFileURL(tmp).href);
rmSync(tmp, { force: true });

// 2. every line: all plots × every style × every floor count the pavilion tab allows (2–6) or a plot starts with
const data = name => JSON.parse(readFileSync(path.join(root, 'public/data', name), 'utf8'));
const site = data('site.json'), narration = data('narration.json'), plots = data('plots.geojson').features.map(f => f.properties);
const services = data('services.geojson');
N.setCenter(site.center);
const router = new N.WalkRouter(data('streets.geojson'));
const beats = [...narration.imagine, ...narration.tour];
const lo = Math.min(2, ...plots.map(p => p.floors)), hi = Math.max(6, ...plots.map(p => p.floors));
const lines = Object.fromEntries(langs.map(l => [l, new Set()]));
for (const p of plots) {
  for (const style of Object.keys(N.STYLES)) {
    for (let floors = lo; floors <= hi; floors++) {
      const v = N.narrationValues({ site, services }, router, p, N.pavilionPlan(N.specFromPlot(p, { style, floors })));
      for (const lang of langs) for (const b of beats) lines[lang].add(N.speechKey(N.spokenLine(b, lang, v)));
    }
  }
}

// 3. synthesise through the narration server (same voices, cleaning and cache as during development)
const server = spawn(process.execPath, [path.join(root, 'tools/tts-server.mjs')], {
  cwd: root, env: { ...process.env, TTS_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit']
});
const base = `http://localhost:${PORT}`;
let health = null;
for (let i = 0; i < 60 && !health; i++) {
  await new Promise(r => setTimeout(r, 250));
  health = await fetch(`${base}/tts/health`).then(r => r.json()).catch(() => null);
}
if (!health) {
  server.kill();
  console.error('[prerender] narration server did not start');
  process.exit(1);
}

const dir = path.join(out, 'voice');
mkdirSync(dir, { recursive: true });
const index = {};
let failed = 0;
try {
  for (const lang of langs) {
    const voice = health.defaults[lang], clips = {}, list = [...lines[lang]];
    console.log(`[prerender] ${lang}: ${list.length} lines with ${voice}`);
    for (const [i, text] of list.entries()) {
      const file = createHash('sha1').update(voice + '|' + text).digest('hex').slice(0, 16) + '.mp3';
      try {
        const r = await fetch(`${base}/tts?lang=${lang}&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        writeFileSync(path.join(dir, file), Buffer.from(await r.arrayBuffer()));
        clips[text] = file;
      } catch (e) {
        failed++;
        console.warn(`[prerender] skipped (${e instanceof Error ? e.message : e}): ${text.slice(0, 60)}…`);
      }
      if ((i + 1) % 20 === 0) console.log(`[prerender] ${lang}: ${i + 1}/${list.length}`);
    }
    index[lang] = { voice, clips };
  }
} finally {
  server.kill();
}
writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
const total = Object.values(index).reduce((a, x) => a + Object.keys(x.clips).length, 0);
console.log(`[prerender] ${total} clips in ${dir}${failed ? `, ${failed} skipped` : ''}`);
