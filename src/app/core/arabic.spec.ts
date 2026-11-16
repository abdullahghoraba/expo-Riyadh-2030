/** Arabic voice-over checks (port of reference tools/test-arabic.js). */
import narrationJson from '../../../public/data/narration.json';
import { ArabicNoun, NOUNS as N, beatText, counted, narrationVars, plotName, shown, spokenArabic, words } from './arabic';
import { Narration } from './models';

const strip = (s: string): string => s.replace(/[ً-ْ]/g, '');

describe('arabic number agreement', () => {
  it('counts minutes (genitive)', () => {
    const cases: [number, string][] = [[1, 'دقيقة واحدة'], [2, 'دقيقتين'], [3, 'ثلاث دقائق'], [5, 'خمس دقائق'], [10, 'عشر دقائق'], [11, 'إحدى عشرة دقيقة'], [12, 'اثنتي عشرة دقيقة'], [15, 'خمس عشرة دقيقة'], [20, 'عشرين دقيقة']];
    cases.forEach(([n, w]) => expect(counted(n, N.minute, 'gen')).toBe(w));
  });

  it('accepts a noun spelled with tanween in the tamyiz', () => {
    const minuteSpec: ArabicNoun = { gender: 'f', singular: 'دقيقة', dual: { nom: 'دقيقتان', accGen: 'دقيقتين' }, plural: 'دقائق', tamyiz: 'دقيقةً' };
    [1, 2, 3, 11, 12, 20].forEach(n => expect(strip(counted(n, minuteSpec, 'gen'))).toBe(strip(counted(n, N.minute, 'gen'))));
  });

  it('counts metres (genitive)', () => {
    const cases: [number, string][] = [[1, 'متر واحد'], [2, 'مترين'], [3, 'ثلاثة أمتار'], [10, 'عشرة أمتار'], [11, 'أحد عشر مترًا'], [20, 'عشرين مترًا'], [100, 'مئة متر'], [250, 'مئتين وخمسين مترًا'], [1000, 'ألف متر'], [1280, 'ألف ومئتين وثمانين مترًا']];
    cases.forEach(([n, w]) => expect(counted(n, N.metre, 'gen')).toBe(w));
  });

  it('counts floors (nominative)', () => {
    const cases: [number, string][] = [[1, 'طابق واحد'], [2, 'طابقان'], [3, 'ثلاثة طوابق'], [4, 'أربعة طوابق'], [11, 'أحد عشر طابقًا']];
    cases.forEach(([n, w]) => expect(counted(n, N.floor, 'nom')).toBe(w));
  });

  it('handles construct state, thousands and case', () => {
    expect(counted(200, N.metre, 'gen')).toBe('مئتي متر');
    expect(counted(2000, N.metre, 'nom')).toBe('ألفا متر');
    expect(counted(3000, N.metre, 'gen')).toBe('ثلاثة آلاف متر');
    expect(counted(1600, N.sqm, 'gen')).toBe('ألف وستمئة متر مربع');
    expect(counted(1280, N.sqm, 'gen')).toBe('ألف ومئتين وثمانين مترًا مربعًا');
    expect(counted(2, N.sqm, 'nom')).toBe('متران مربعان');
    expect(counted(1, N.metre, 'acc')).toBe('مترًا واحدًا');
    expect(counted(21, N.minute, 'nom')).toBe('إحدى وعشرون دقيقة');
    expect(counted(23, N.metre, 'gen')).toBe('ثلاثة وعشرين مترًا');
    expect(counted(12, N.floor, 'nom')).toBe('اثنا عشر طابقًا');
    expect(counted(18, N.minute, 'gen')).toBe('ثماني عشرة دقيقة');
  });

  it('spells numbers', () => {
    expect(words(0)).toBe('صفر');
    expect(words(2030, 'm', 'gen')).toBe('ألفين وثلاثين');
    expect(words(11000)).toBe('أحد عشر ألفًا');
    expect(words(999999)).toBe('تسعمئة وتسعة وتسعون ألفًا وتسعمئة وتسعة وتسعون');
    expect(words(3, 'f')).toBe('ثلاث');
    expect(words(3, 'm')).toBe('ثلاثة');
  });

  it('keeps the agreement in digit subtitles', () => {
    expect(shown(6, N.minute, 'gen')).toBe('6 دقائق');
    expect(shown(1280, N.sqm, 'gen')).toBe('1,280 مترًا مربعًا');
    expect(shown(1000, N.sqm, 'gen')).toBe('1,000 متر مربع');
    expect(shown(2, N.metre, 'gen')).toBe('مترين');
  });

  it('says plot ids as numbers', () => {
    expect(plotName('NE-01')).toBe('رقم واحد');
    expect(plotName('SW-06')).toBe('رقم ستة');
  });
});

describe('arabic narration', () => {
  const narr = narrationJson as Narration;
  const fmt = (n: number): string => Number(n).toLocaleString('en-US');
  const SETS = {
    small: { walk: 1, floors: 1, gfa: 1000, restroom: 2, prayer: 3, aid: 11, plot: 'NE-01', district: 'North-east district', districtAr: 'المنطقة الشمالية الشرقية' },
    typical: { walk: 6, floors: 3, gfa: 1280, restroom: 120, prayer: 250, aid: 90, plot: 'NE-01', district: 'North-east district', districtAr: 'المنطقة الشمالية الشرقية' }
  };

  for (const [name, x] of Object.entries(SETS)) {
    it(`fills every beat with spoken words only (${name})`, () => {
      const v = { ...x, gfa: fmt(x.gfa), ...narrationVars(x) };
      for (const part of ['imagine', 'tour'] as const) {
        for (const b of narr[part]) {
          expect(b.arSpeech, `${part}.${b.id}: missing arSpeech`).toBeTruthy();
          const t = beatText(b, v);
          expect(/[{}]/.test(t.shown + t.spoken), `${part}.${b.id}: unfilled placeholder`).toBe(false);
          expect(/[A-Za-z0-9٠-٩]/.test(t.spoken), `${part}.${b.id}: Latin letters or digits in speech: ${t.spoken}`).toBe(false);
        }
      }
    });
  }

  it('produces the expected typical walk sentence', () => {
    const x = SETS.typical, v = { ...x, gfa: fmt(x.gfa), ...narrationVars(x) };
    const walk = narr.imagine.find(b => b.id === 'walk')!;
    const t = beatText(walk, v);
    expect(t.shown).toContain('6 دقائق');
    expect(strip(t.spoken)).toContain('ست دقائق');
    expect(strip(t.spoken)).toContain('رقم واحد');
  });

  it('vocalizes ambiguous speech words while keeping subtitles readable', () => {
    expect(spokenArabic('ست دقائق ومئتين مترًا مربعًا')).toBe('سِتّ دَقائِق وَمِئَتَيْن مِتْرًا مُرَبَّعًا');
    const v = { ...SETS.typical, ...narrationVars(SETS.typical) };
    const t = beatText(narr.imagine.find(b => b.id === 'walk')!, v);
    expect(t.shown).toContain('6 دقائق');
    expect(t.spoken).toContain('سِتّ دَقائِق');
    expect(t.spoken).not.toMatch(/[\u2066-\u2069]/);
  });

  it('keeps Latin plot ids unbroken in RTL subtitles', () => {
    const x = SETS.typical, v = { ...x, gfa: fmt(x.gfa), ...narrationVars(x) };
    const t = beatText(narr.tour.find(b => b.id === 'plot')!, v);
    expect(t.shown).toContain('⁦NE‑01⁩');
    expect(t.shown).not.toContain('NE-01');
  });
});
