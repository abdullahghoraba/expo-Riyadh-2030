import { Injectable, computed, inject, signal } from '@angular/core';
import { Lang } from '../core/models';
import { StateService } from '../core/state.service';
import { ToastService } from '../core/toast.service';

/** Longest piece handed to the speech engine at once (Chrome/Edge cut long online-voice utterances after ~15 s). */
const MAX_CHUNK = 160;

/**
 * Split narration into speakable clauses: sentence ends first (. ! ? ؟ ؛ :), then Arabic / Latin commas,
 * merging short pieces so the voice keeps a natural rhythm.
 */
export function speechChunks(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentences = clean.match(/[^.!?؟؛:]+[.!?؟؛:]*\s*/g) ?? [clean];
  const pieces: string[] = [];
  for (const s of sentences) {
    if (s.length <= max) { pieces.push(s.trim()); continue; }
    pieces.push(...(s.match(/[^،,]+[،,]?\s*/g) ?? [s]).map(x => x.trim()));
  }
  const out: string[] = [];
  for (const p of pieces.filter(Boolean)) {
    const last = out[out.length - 1];
    if (last && last.length + p.length + 1 <= max) out[out.length - 1] = last + ' ' + p;
    else out.push(p);
  }
  return out;
}

/** A neural voice served by tools/tts-server.mjs (proxied at /tts). */
export interface NeuralVoice { id: string; name: string; lang: Lang }

/** Prefix of `selectedVoice` values that pick a server-side neural voice instead of a browser voice. */
export const NEURAL = 'neural:';

/**
 * Voice-over (port of reference js/audio.js). Order of preference:
 * 1. Neural voices from the local narration server (/tts → tools/tts-server.mjs; Saudi "Hamed" for Arabic) –
 *    correct Modern Standard Arabic stress and intonation on every browser.
 * 2. Browser Web Speech voices.
 * Arabic prefers the Saudi neural voices (Edge: "Microsoft Hamed / Zariyah Online (Natural) - Arabic (Saudi Arabia)").
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly state = inject(StateService);
  private readonly toast = inject(ToastService);
  private readonly synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  readonly voiceOptions = signal<SpeechSynthesisVoice[]>([]);
  readonly selectedVoice = signal('');
  readonly languageVoices = computed(() => this.voiceOptions().filter(v =>
    new RegExp('^' + this.state.lang() + '(?:[-_]|$)', 'i').test(v.lang)));
  private readonly pending = new Set<() => void>();
  private readonly warned: Partial<Record<Lang, boolean>> = {};
  private voicesReady: Promise<void> | null = null;
  /** Utterances being spoken – kept referenced so Chrome does not garbage-collect them before `onend`. */
  private live = new Set<SpeechSynthesisUtterance>();
  private currentAudio: HTMLAudioElement | null = null;
  /** Bumped by stop() so a running speak() stops queueing chunks. */
  private gen = 0;

  readonly muted = signal(false);
  /** Neural voices offered by the narration server (empty when it is not running). */
  readonly neuralVoices = signal<NeuralVoice[]>([]);
  private neuralDefaults: Partial<Record<Lang, string>> = {};
  private neuralOk = false;
  private neuralProbe: Promise<void> | null = null;
  private ready: Promise<void> | null = null;
  private lastProbe = 0;
  private readonly prefetched = new Set<string>();

  get available(): boolean {
    return !!this.synth;
  }

  /**
   * Initializes browser SpeechSynthesis voice registry, resolving once voices are available.
   *
   * @returns Promise resolving when voices are loaded.
   */
  init(): Promise<void> {
    return (this.ready ??= Promise.all([this.initVoices(), this.probeNeural()]).then(() => undefined));
  }

  /**
   * Asks the narration server which neural voices it offers (once per page; 2 s timeout).
   */
  private probeNeural(): Promise<void> {
    if (typeof fetch === 'undefined' || typeof Audio === 'undefined' || typeof location === 'undefined') return Promise.resolve();
    if (this.neuralOk) return Promise.resolve();
    if (this.neuralProbe) return this.neuralProbe;
    // a failed probe (server started later, or the page was busy loading the 3D scene) is retried, at most every 5 s
    if (Date.now() - this.lastProbe < 5000) return Promise.resolve();
    this.lastProbe = Date.now();
    return (this.neuralProbe = (async () => {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
      try {
        const r = await fetch('tts/health', { signal: ctl.signal, cache: 'no-store' });
        const j = r.ok && /json/.test(r.headers.get('content-type') ?? '') ? await r.json() as { ok?: boolean; voices?: NeuralVoice[]; defaults?: Partial<Record<Lang, string>> } : null;
        if (j?.ok && j.voices?.length) {
          this.neuralOk = true;
          this.neuralDefaults = j.defaults ?? {};
          this.neuralVoices.set(j.voices);
        }
      } catch { /* server not running → browser voices */ }
      finally {
        clearTimeout(timer);
        this.neuralProbe = null;
      }
    })());
  }

  /**
   * The neural voice to use for `lang`: the one picked in the voice menu, else the server default
   * (only when no browser voice was explicitly picked).
   */
  private neuralVoice(lang: Lang): string | null {
    if (!this.neuralOk) return null;
    const sel = this.selectedVoice(), ok = (id?: string) => !!id && this.neuralVoices().some(v => v.id === id && v.lang === lang);
    if (sel.startsWith(NEURAL)) {
      const id = sel.slice(NEURAL.length);
      if (ok(id)) return id;
    } else if (sel && this.voices.some(v => v.voiceURI === sel && new RegExp('^' + lang + '(?:[-_]|$)', 'i').test(v.lang))) {
      return null;
    }
    const def = this.neuralDefaults[lang];
    return ok(def) ? def! : this.neuralVoices().find(v => v.lang === lang)?.id ?? null;
  }

  /** Relative URL, so it also works when the app is served under a sub-path (e.g. GitHub Pages /repo-name/). */
  private neuralUrl(text: string, lang: Lang, voice: string): string {
    return `tts?lang=${lang}&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.replace(/\s+/g, ' ').trim())}`;
  }

  /**
   * Warms the server cache for upcoming narration (synthesis takes a few seconds per clip, cached replay is instant).
   * Clips are requested one after another so the first beat is ready first.
   */
  async prefetch(texts: string[], lang: Lang = this.state.lang()): Promise<void> {
    await this.probeNeural();
    const voice = this.neuralVoice(lang);
    if (!voice || this.muted()) return;
    for (const t of texts) {
      const url = this.neuralUrl(t, lang, voice);
      if (!t.trim() || this.prefetched.has(url)) continue;
      this.prefetched.add(url);
      try { await (await fetch(url)).arrayBuffer(); } catch { this.prefetched.delete(url); }
    }
  }

  private initVoices(): Promise<void> {
    const S = this.synth;
    if (!S) return Promise.resolve();
    if (!this.voicesReady) {
      this.voicesReady = new Promise<void>(res => {
        const load = (): boolean => {
          this.voices = S.getVoices();
          this.voiceOptions.set(this.voices);
          return this.voices.length > 0;
        };
        if (load()) return res();
        // Chrome / Edge fill the list asynchronously
        const done = (): void => { load(); res(); };
        S.addEventListener?.('voiceschanged', done, { once: true });
        setTimeout(done, 1500);
      });
      S.addEventListener?.('voiceschanged', () => {
        this.voices = S.getVoices();
        this.voiceOptions.set(this.voices);
      });
    }
    return this.voicesReady;
  }

  /**
   * Tiered heuristic selector prioritizing Saudi neural natural voices, then online Arabic voices,
   * then generic local Arabic voices.
   *
   * @returns Best matching Arabic SpeechSynthesisVoice, or undefined if none installed.
   */
  private pickArabic(): SpeechSynthesisVoice | undefined {
    const ar = this.voices.filter(v => /^ar/i.test(v.lang || ''));
    const sa = (v: SpeechSynthesisVoice) => /^ar[-_]sa/i.test(v.lang);
    const nat = (v: SpeechSynthesisVoice) => /natural|online|neural/i.test(v.name);
    const tiers: ((v: SpeechSynthesisVoice) => boolean)[] = [
      v => sa(v) && nat(v) && /hamed|zariyah/i.test(v.name), v => sa(v) && nat(v), nat, sa, v => /google/i.test(v.name), () => true
    ];
    for (const t of tiers) {
      const v = ar.find(t);
      if (v) return v;
    }
    return undefined;
  }

  /**
   * Selects the highest quality natural/neural synthetic voice matching the requested language.
   *
   * @param lang Language code ('en' or 'ar').
   * @returns Matching SpeechSynthesisVoice, or undefined if unavailable.
   */
  pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
    const selected = this.voices.find(v => v.voiceURI === this.selectedVoice() &&
      new RegExp('^' + lang + '(?:[-_]|$)', 'i').test(v.lang));
    if (selected) return selected;
    if (lang === 'ar') return this.pickArabic();
    const vs = this.voices.filter(v => (v.lang || '').toLowerCase().startsWith(lang));
    const score = (v: SpeechSynthesisVoice): number =>
      (/natural/i.test(v.name) ? 8 : 0) + (/online/i.test(v.name) ? 4 : 0) +
      (/gb/i.test(v.lang) ? 2 : 0) + (/us/i.test(v.lang) ? 1 : 0) +
      (/(Ryan|Sonia|Libby|Guy|Aria|Jenny|Thomas)/i.test(v.name) ? 1 : 0);
    return vs.sort((a, b) => score(b) - score(a))[0];
  }

  /**
   * Calculates an estimated reading duration in milliseconds based on word count and language.
   *
   * @param text Text to estimate reading duration for.
   * @param lang Language of the text.
   * @returns Milliseconds estimated to speak/read the text.
   */
  estimate(text: string, lang: Lang = this.state.lang()): number {
    return Math.max(2600, text.split(/\s+/).length * (lang === 'ar' ? 470 : 390));
  }

  /**
   * Checks whether the browser has a high-quality natural/neural Arabic voice installed.
   */
  private hasNaturalArabicVoice(): boolean {
    return this.voices.some(v => /^ar/i.test(v.lang || '') && /natural|neural|hamed|zariyah/i.test(v.name));
  }

  /**
   * Plays a speech chunk via high-quality online audio streaming (Google Translate TTS).
   *
   * @param text Text chunk to vocalize.
   * @param lang Target language code.
   * @returns Promise resolving to true if playback completed, false on error or cancellation.
   */
  private playAudioStream(text: string, lang: Lang): Promise<boolean> {
    const clean = text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim();
    return this.playUrl(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=${lang}&client=tw-ob`, text, lang);
  }

  /**
   * Plays an audio URL, resolving true when it ends and false on error / cancellation.
   * `extraMs` widens the safety timeout (first-time neural synthesis takes a few seconds before playback starts).
   */
  private playUrl(url: string, text: string, lang: Lang, extraMs = 0): Promise<boolean> {
    if (typeof Audio === 'undefined') return Promise.resolve(false);
    return new Promise<boolean>(res => {
      const audio = new Audio();
      this.currentAudio = audio;
      let finished = false;
      const fin = (ok: boolean): void => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.removeAttribute('src');
        if (this.currentAudio === audio) this.currentAudio = null;
        this.pending.delete(cancel);
        res(ok);
      };
      const cancel = (): void => fin(false);
      this.pending.add(cancel);
      audio.onended = () => fin(true);
      audio.onerror = () => fin(false);
      const guard = setTimeout(() => fin(true), this.estimate(text, lang) * 2 + 2500 + extraMs);
      audio.src = url;
      audio.play().catch(() => fin(false));
    });
  }

  /**
   * Speaks a narration text block in clauses, respecting mute state and language settings.
   * Resolves when speaking finishes or fallback reading estimate expires.
   *
   * @param text Narration script text.
   * @param lang Language code ('en' or 'ar').
   */
  async speak(text: string, lang: Lang = this.state.lang()): Promise<void> {
    const est = this.estimate(text, lang), S = this.synth, gen = this.gen;
    if (this.muted()) return this.sleep(est);
    await this.init();
    if (gen !== this.gen) return;

    // 1. neural narration server: the whole beat in one clip (natural sentence melody, no 15 s cut-off)
    const neural = this.neuralVoice(lang);
    if (!neural && !this.neuralOk) void this.probeNeural(); // picked up from the next beat on
    if (neural) {
      S?.cancel();
      const ok = await this.playUrl(this.neuralUrl(text, lang, neural), text, lang, 15000);
      if (ok || gen !== this.gen || this.muted()) return;
    }

    const explicitVoice = this.selectedVoice().startsWith(NEURAL) ? '' : this.selectedVoice();
    const hasNatural = this.hasNaturalArabicVoice();
    const useOnlineArabic = lang === 'ar' && !explicitVoice && !hasNatural;
    // the installed voice stays the fallback when the online stream is blocked or offline
    const voice = this.pickVoice(lang);

    if (!useOnlineArabic && !voice && !S) {
      return this.sleep(est);
    }
    if (!useOnlineArabic && !voice) {
      if (!this.warned[lang]) {
        this.warned[lang] = true;
        this.toast.show(lang === 'ar'
          ? 'No Arabic voice installed on this PC – subtitles only (Windows: Settings → Time & language → Speech → Add voices → Arabic)'
          : 'No English voice found – subtitles only', 5000);
      }
      return this.sleep(est);
    }

    if (S) S.cancel();
    const t0 = performance.now();
    for (const chunk of speechChunks(text)) {
      if (gen !== this.gen || this.muted()) break;
      let ok = false;
      if (useOnlineArabic) {
        ok = await this.playAudioStream(chunk, lang);
        if (!ok && voice) ok = await this.utter(chunk, voice, lang);
      } else if (voice) {
        ok = await this.utter(chunk, voice, lang);
      }
      if (gen !== this.gen) return;
      if (!ok) {
        await this.sleep(Math.max(0, est - (performance.now() - t0)) * 0.6);
        break;
      }
    }
  }

  /**
   * Internal helper to synthesize a single clause via SpeechSynthesisUtterance.
   *
   * @param text Clause text.
   * @param voice Chosen speech synthesis voice.
   * @param lang Target language.
   * @returns Promise resolving to true on successful playback, false on error or cancellation.
   */
  private utter(text: string, voice: SpeechSynthesisVoice, lang: Lang): Promise<boolean> {
    const S = this.synth;
    if (!S) return Promise.resolve(false);
    return new Promise<boolean>(res => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = lang === 'ar' ? (voice.lang || 'ar-SA').replace('_', '-') : voice.lang;
      u.rate = lang === 'ar' ? 0.92 : 1.0;
      u.pitch = 1;
      this.live.add(u);
      let done = false;
      const fin = (ok: boolean): void => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.live.delete(u);
        this.pending.delete(cancel);
        res(ok);
      };
      const cancel = (): void => fin(false);
      this.pending.add(cancel);
      u.onend = () => fin(true);
      u.onerror = e => fin(e.error === 'interrupted' || e.error === 'canceled');
      // safety net if the engine never fires onend
      const guard = setTimeout(() => fin(true), this.estimate(text, lang) * 2 + 3000);
      S.speak(u);
      // Chrome sometimes leaves the queue paused after a cancel()
      if (S.paused) S.resume();
    });
  }

  /**
   * Stops active speech synthesis playback and cancels pending sleep timers.
   */
  stop(): void {
    this.gen++;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute('src');
      this.currentAudio = null;
    }
    this.pending.forEach(cancel => cancel());
    this.synth?.cancel();
    this.live.clear();
  }

  /**
   * Toggles audio mute state. Stops speech if muted.
   */
  toggleMute(): void {
    this.muted.update(m => !m);
    if (this.muted()) this.stop();
  }

  /**
   * Cancellable delay timer tracked in pending cancellation set.
   *
   * @param ms Milliseconds to wait.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const done = (): void => { clearTimeout(timer); this.pending.delete(done); resolve(); };
      const timer = setTimeout(done, ms);
      this.pending.add(done);
    });
  }
}
