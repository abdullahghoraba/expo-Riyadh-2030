import narrationJson from '../../../public/data/narration.json';
import { Narration } from '../core/models';
import { TestBed } from '@angular/core/testing';
import { StateService } from '../core/state.service';
import { AudioService, speechChunks } from './audio.service';

describe('speechChunks', () => {
  it('keeps short text in one piece', () => {
    expect(speechChunks('  Hello   world. ')).toEqual(['Hello world.']);
    expect(speechChunks('')).toEqual([]);
  });

  it('splits every Arabic narration line into short clauses without losing words', () => {
    const narr = narrationJson as Narration;
    for (const b of [...narr.imagine, ...narr.tour]) {
      const parts = speechChunks(b.arSpeech, 80);
      expect(parts.every(p => p.length <= 80 || !/[،,.!?؟؛:]/.test(p.slice(0, -1)))).toBe(true);
      expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(b.arSpeech.replace(/\s+/g, ' ').trim());
    }
  });
});

describe('narration voice and cancellation', () => {
  const voice = (name: string, lang: string): SpeechSynthesisVoice =>
    ({ name, lang, voiceURI: name, localService: false, default: false });
  const voices = [voice('English', 'en-GB'), voice('Arabic local', 'ar-EG'), voice('Hamed Natural', 'ar-SA')];
  let spoken: SpeechSynthesisUtterance[];
  let audio: AudioService;
  let previous: PropertyDescriptor | undefined;

  beforeEach(async () => {
    spoken = [];
    previous = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => voices, addEventListener: () => undefined,
      cancel: () => undefined, speak: (u: SpeechSynthesisUtterance) => spoken.push(u), paused: false
    } });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    TestBed.configureTestingModule({});
    audio = TestBed.inject(AudioService);
    await audio.init();
  });

  afterEach(() => {
    audio.stop();
    vi.unstubAllGlobals();
    if (previous) Object.defineProperty(window, 'speechSynthesis', previous);
    else Reflect.deleteProperty(window, 'speechSynthesis');
  });

  it('selects Arabic voices only and honors an explicit Arabic voice choice', () => {
    expect(audio.pickVoice('ar')?.name).toBe('Hamed Natural');
    audio.selectedVoice.set('Arabic local');
    expect(audio.pickVoice('ar')?.lang).toBe('ar-EG');
    expect(audio.pickVoice('en')?.lang).toBe('en-GB');
    TestBed.inject(StateService).lang.set('ar');
    expect(audio.languageVoices().map(v => v.lang)).toEqual(['ar-EG', 'ar-SA']);
  });

  it('prefers the neural narration server and falls back to an explicitly chosen browser voice', async () => {
    const played: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => url === 'tts/health'
      ? new Response(JSON.stringify({
        ok: true, defaults: { ar: 'ar-SA-HamedNeural', en: 'en-GB-RyanNeural' },
        voices: [{ id: 'ar-SA-HamedNeural', name: 'Hamed', lang: 'ar' }, { id: 'en-GB-RyanNeural', name: 'Ryan', lang: 'en' }]
      }), { headers: { 'content-type': 'application/json' } })
      : new Response(new ArrayBuffer(8)));
    vi.stubGlobal('Audio', class {
      src = ''; onended: (() => void) | null = null; onerror: (() => void) | null = null;
      play() { played.push(this.src); setTimeout(() => this.onended?.()); return Promise.resolve(); }
      pause() { /* noop */ } removeAttribute() { /* noop */ }
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const a = TestBed.inject(AudioService);
    await a.init();
    expect(a.neuralVoices().map(v => v.id)).toEqual(['ar-SA-HamedNeural', 'en-GB-RyanNeural']);
    await a.speak('مَرْحَبًا بِكُمْ', 'ar');
    expect(played).toHaveLength(1);
    // relative URL, so it works under a sub-path such as GitHub Pages /repo-name/
    expect(played[0]).toMatch(/^tts\?lang=ar&voice=ar-SA-HamedNeural&text=/);
    expect(decodeURIComponent(played[0].split('text=')[1])).toBe('مَرْحَبًا بِكُمْ');
    // English text must arrive unchanged (only runs of whitespace collapse)
    await a.speak('This is   the Expo site.\nStreets and services.', 'en');
    expect(played).toHaveLength(2);
    expect(decodeURIComponent(played[1].split('text=')[1])).toBe('This is the Expo site. Streets and services.');
    expect(spoken).toHaveLength(0);
    a.selectedVoice.set('Arabic local');
    const p = a.speak('سِتّ دَقائِق', 'ar');
    await Promise.resolve();
    expect(played).toHaveLength(2);
    expect(spoken[0]?.voice?.lang).toBe('ar-EG');
    a.stop();
    await p;
  });

  it('plays the pre-recorded neural clip when no narration server runs, unless a browser voice was chosen', async () => {
    const played: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => url === 'voice/index.json'
      ? new Response(JSON.stringify({ ar: { voice: 'ar-SA-HamedNeural', clips: { 'مَرْحَبًا بِكُمْ': 'abc.mp3' } } }),
        { headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 }));
    vi.stubGlobal('Audio', class {
      src = ''; onended: (() => void) | null = null; onerror: (() => void) | null = null;
      play() { played.push(this.src); setTimeout(() => this.onended?.()); return Promise.resolve(); }
      pause() { /* noop */ } removeAttribute() { /* noop */ }
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const a = TestBed.inject(AudioService);
    await a.init();
    expect(a.neuralVoices()).toEqual([]);
    await a.speak('مَرْحَبًا   بِكُمْ\n', 'ar');
    expect(played).toEqual(['voice/abc.mp3']);
    expect(spoken).toHaveLength(0);
    // a line without a recording falls back to the browser voice
    const p1 = a.speak('سِتّ دَقائِق', 'ar');
    await new Promise(r => setTimeout(r));
    expect(spoken.map(u => u.text)).toEqual(['سِتّ دَقائِق']);
    a.stop();
    await p1;
    a.selectedVoice.set('Arabic local');
    const p2 = a.speak('مَرْحَبًا بِكُمْ', 'ar');
    await new Promise(r => setTimeout(r));
    expect(played).toHaveLength(1);
    expect(spoken[1]?.voice?.lang).toBe('ar-EG');
    a.stop();
    await p2;
  });

  it('captures the requested language and settles canceled speech without an engine callback', async () => {
    const speaking = audio.speak('سِتّ دَقائِق', 'ar');
    await Promise.resolve();
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('ar-SA');
    expect(spoken[0].voice?.lang).toBe('ar-SA');
    audio.stop();
    await speaking;
    expect(spoken).toHaveLength(1);
  });
});
