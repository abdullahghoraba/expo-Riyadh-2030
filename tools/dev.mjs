#!/usr/bin/env node
/** `npm start`: runs the neural narration server (tools/tts-server.mjs) next to `ng serve` and stops both together. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ng = require.resolve('@angular/cli/bin/ng.js');
const kids = [
  spawn(process.execPath, ['tools/tts-server.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, [ng, 'serve', ...process.argv.slice(2)], { stdio: 'inherit' })
];
const stop = code => { kids.forEach(k => k.exitCode === null && k.kill()); process.exit(code ?? 0); };
kids[1].on('exit', stop);
kids[0].on('exit', code => { if (code) console.warn('[tts] narration server stopped – the app falls back to browser voices'); });
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
