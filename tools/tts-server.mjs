#!/usr/bin/env node
/**
 * Neural voice-over server for the Imagine / guided-tour narration.
 *
 * Browser voices on Windows/Chrome are usually the old "Microsoft Hoda – Arabic (Egypt)" voice, which reads
 * Modern Standard Arabic with a flat robotic tone and wrong stress. This server synthesises the narration with
 * Microsoft's neural Saudi voices (ar-SA-HamedNeural / ar-SA-ZariyahNeural – the same voices Azure Speech sells)
 * through the open-source `msedge-tts` client, and caches every clip as an MP3 on disk.
 *
 *   GET /tts/health                       → { ok, voices: [{ id, name, lang }] }
 *   GET /tts?lang=ar&voice=<id>&text=...  → audio/mpeg
 *
 * Run:  npm run tts   (or `npm start`, which starts it together with `ng serve`; /tts is proxied by proxy.conf.json)
 * Env:  TTS_PORT (default 4310), TTS_CACHE (default .tts-cache), TTS_AR_VOICE, TTS_EN_VOICE
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const PORT = Number(process.env.TTS_PORT) || 4310;
const CACHE = path.resolve(process.env.TTS_CACHE || '.tts-cache');
const MAX_TEXT = 1500;

/** Voices offered to the app. The first one of each language is the default. */
const VOICES = [
  { id: 'ar-SA-HamedNeural', name: 'Hamed – Saudi Arabic (neural)', lang: 'ar', rate: '-4%' },
  { id: 'ar-SA-ZariyahNeural', name: 'Zariyah – Saudi Arabic (neural)', lang: 'ar', rate: '-4%' },
  { id: 'en-GB-RyanNeural', name: 'Ryan – British English (neural)', lang: 'en', rate: '+0%' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia – British English (neural)', lang: 'en', rate: '+0%' }
];
const defaults = {
  ar: process.env.TTS_AR_VOICE || 'ar-SA-HamedNeural',
  en: process.env.TTS_EN_VOICE || 'en-GB-RyanNeural'
};

mkdirSync(CACHE, { recursive: true });

/** Bidi isolates/marks are for on-screen subtitles only; the speech engine must not see them. */
const clean = s => s.replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/‑/g, '-').replace(/\s+/g, ' ').trim();
const xml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** One synthesis at a time (the service rate-limits parallel sockets); identical requests share one job. */
let queue = Promise.resolve();
const inflight = new Map();

async function synth(text, voice) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice.id, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(xml(text), { rate: voice.rate });
    const chunks = [];
    await new Promise((res, rej) => {
      const guard = setTimeout(() => rej(new Error('synthesis timed out')), 45000);
      audioStream.on('data', d => chunks.push(d));
      audioStream.on('close', () => { clearTimeout(guard); res(); });
      audioStream.on('error', e => { clearTimeout(guard); rej(e); });
    });
    const mp3 = Buffer.concat(chunks);
    if (mp3.length < 1000) throw new Error('empty audio');
    return mp3;
  } finally {
    try { tts.close(); } catch { /* already closed */ }
  }
}

function clip(text, voice) {
  const key = createHash('sha1').update(voice.id + '|' + voice.rate + '|' + text).digest('hex');
  const file = path.join(CACHE, key + '.mp3');
  if (existsSync(file)) return Promise.resolve(file);
  if (inflight.has(key)) return inflight.get(key);
  const job = (queue = queue.catch(() => undefined).then(async () => {
    if (existsSync(file)) return file;
    const t0 = Date.now();
    let mp3;
    for (let attempt = 1; ; attempt++) {
      try { mp3 = await synth(text, voice); break; }
      catch (e) { if (attempt >= 2) throw e; }
    }
    writeFileSync(file, mp3);
    console.log(`[tts] ${voice.id} ${text.length} chars → ${(mp3.length / 1024).toFixed(0)} KB in ${Date.now() - t0} ms`);
    return file;
  })).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/tts/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, defaults, voices: VOICES.map(({ id, name, lang }) => ({ id, name, lang })) }));
    return;
  }
  if (url.pathname !== '/tts') { res.writeHead(404).end(); return; }

  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ar';
  const voice = VOICES.find(v => v.id === url.searchParams.get('voice') && v.lang === lang) || VOICES.find(v => v.id === defaults[lang]);
  const text = clean(url.searchParams.get('text') || '');
  if (!voice || !text || text.length > MAX_TEXT) { res.writeHead(400, { 'Content-Type': 'text/plain' }).end('bad request'); return; }

  try {
    const file = await clip(text, voice);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': statSync(file).size, 'Cache-Control': 'public, max-age=31536000, immutable' });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  } catch (e) {
    console.warn('[tts] failed:', e instanceof Error ? e.message : e);
    res.writeHead(502, { 'Content-Type': 'text/plain' }).end('synthesis failed');
  }
});

server.listen(PORT, () => console.log(`[tts] neural narration on http://localhost:${PORT}/tts  (ar: ${defaults.ar}, en: ${defaults.en}, cache: ${CACHE})`));
