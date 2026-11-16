/**
 * Arabic (MSA) number words, number–noun agreement and narration variables for the voice-over
 * (port of reference js/arabic.js).
 *
 * gender = gender of the COUNTED noun ('m' | 'f'); case = 'nom' | 'acc' | 'gen'.
 * Subtitles keep Western digits (`shown`), speech uses words (`counted`) so the TTS voice never
 * has to guess how to read "1,280" or "NE-01".
 */
import { NarrationStep } from './models';

export type Gender = 'm' | 'f';
export type GrammaticalCase = 'nom' | 'acc' | 'gen';

export interface ArabicNoun {
  gender: Gender;
  singular: string;
  dual: { nom: string; accGen: string };
  plural: string;
  /** Accusative singular used after 11–99 (تمييز). */
  tamyiz: string;
}

const TA = ['', '', '', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']; // with masculine nouns
const NO_TA = ['', '', '', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر']; // with feminine nouns
const TENS = ['', '', 'عشر', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع'];
const HUN = ['', 'مئة', '', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
const CONSTRUCT: Record<string, string> = { 'ألفًا': 'ألف', 'ألفان': 'ألفا', 'ألفين': 'ألفي', 'مئتان': 'مئتا', 'مئتين': 'مئتي' };

export const NOUNS = {
  minute: { gender: 'f', singular: 'دقيقة', dual: { nom: 'دقيقتان', accGen: 'دقيقتين' }, plural: 'دقائق', tamyiz: 'دقيقة' },
  metre: { gender: 'm', singular: 'متر', dual: { nom: 'متران', accGen: 'مترين' }, plural: 'أمتار', tamyiz: 'مترًا' },
  sqm: { gender: 'm', singular: 'متر مربع', dual: { nom: 'متران مربعان', accGen: 'مترين مربعين' }, plural: 'أمتار مربعة', tamyiz: 'مترًا مربعًا' },
  floor: { gender: 'm', singular: 'طابق', dual: { nom: 'طابقان', accGen: 'طابقين' }, plural: 'طوابق', tamyiz: 'طابقًا' }
} as const satisfies Record<string, ArabicNoun>;
export type NounId = keyof typeof NOUNS;

const ALF: ArabicNoun = { gender: 'm', singular: 'ألف', dual: { nom: 'ألفان', accGen: 'ألفين' }, plural: 'آلاف', tamyiz: 'ألفًا' };

/**
 * Converts single units (1 to 10) into Modern Standard Arabic words with correct gender and case agreement.
 *
 * @param n Integer unit from 1 to 10.
 * @param g Gender of the counted noun ('m' for masculine, 'f' for feminine).
 * @param c Grammatical case ('nom', 'acc', or 'gen').
 * @returns Arabic word string for the unit.
 */
function unit(n: number, g: Gender, c: GrammaticalCase): string {
  const obl = c !== 'nom', m = g !== 'f';
  if (n === 1) return m ? 'واحد' : 'واحدة';
  if (n === 2) return m ? (obl ? 'اثنين' : 'اثنان') : (obl ? 'اثنتين' : 'اثنتان');
  return m ? TA[n] : NO_TA[n];
}

/**
 * Converts numbers below 100 (1 to 99) into Modern Standard Arabic words with compound numeral agreement.
 *
 * @param n Integer from 1 to 99.
 * @param g Gender of the counted noun.
 * @param c Grammatical case.
 * @returns Arabic numeral string.
 */
function below100(n: number, g: Gender, c: GrammaticalCase): string {
  const obl = c !== 'nom', m = g !== 'f', u = n % 10, t = (n / 10) | 0;
  if (n <= 10) return unit(n, g, c);
  if (n === 11) return m ? 'أحد عشر' : 'إحدى عشرة';
  if (n === 12) return m ? (obl ? 'اثني عشر' : 'اثنا عشر') : (obl ? 'اثنتي عشرة' : 'اثنتا عشرة');
  if (n < 20) return m ? TA[u] + ' عشر' : NO_TA[u] + ' عشرة';
  const tens = TENS[t] + (obl ? 'ين' : 'ون');
  if (!u) return tens;
  return (u === 1 ? (m ? 'واحد' : 'إحدى') : unit(u, g, c)) + ' و' + tens;
}

/**
 * Converts numbers below 1,000 (1 to 999) into Modern Standard Arabic words including hundreds.
 *
 * @param n Integer from 1 to 999.
 * @param g Gender of the counted noun.
 * @param c Grammatical case.
 * @returns Arabic numeral string with conjunctions.
 */
function below1000(n: number, g: Gender, c: GrammaticalCase): string {
  const h = (n / 100) | 0, r = n % 100, parts: string[] = [];
  if (h) parts.push(h === 2 ? (c !== 'nom' ? 'مئتين' : 'مئتان') : HUN[h]);
  if (r) parts.push(below100(r, g, c));
  return parts.join(' و');
}

/**
 * Converts thousands (1 to 999 thousands) into Modern Standard Arabic words.
 * Note that the noun 'ألف' (thousand) is masculine.
 *
 * @param k Number of thousands (1 to 999).
 * @param c Grammatical case.
 * @returns Arabic phrase for the thousands component.
 */
function thousands(k: number, c: GrammaticalCase): string {
  if (k === 1) return c === 'acc' ? 'ألفًا' : 'ألف';
  if (k === 2) return c !== 'nom' ? 'ألفين' : 'ألفان';
  if (k <= 10) return unit(k, 'm', c) + ' آلاف';
  return counted(k, ALF, c);
}

/**
 * Converts an integer (from 0 up to 999,999) into full Arabic words with gender and grammatical case.
 *
 * @param n Numeric value or string representation to format.
 * @param gender Gender of the counted noun ('m' by default).
 * @param grammaticalCase Grammatical case ('nom' by default).
 * @returns Arabic words string for the number.
 */
export function words(n: number | string, gender: Gender = 'm', grammaticalCase: GrammaticalCase = 'nom'): string {
  const v = Math.round(Math.abs(+n));
  if (!v) return 'صفر';
  if (v > 999999) return String(v);
  const k = (v / 1000) | 0, r = v % 1000, parts: string[] = [];
  if (k) parts.push(thousands(k, grammaticalCase));
  if (r) parts.push(below1000(r, gender, grammaticalCase));
  return parts.join(' و');
}

/**
 * Applies Arabic construct state (Idafa) transformations by stripping trailing nunation or dual suffixes
 * when a number word is directly followed by its counted noun (e.g., ألفا/ألفي, مئتا/مئتي).
 *
 * @param s Arabic number word string.
 * @returns Adjusted construct state string.
 */
const construct = (s: string): string => s.replace(/(ألفًا|ألفان|ألفين|مئتان|مئتين)$/, x => CONSTRUCT[x]);

/**
 * Generates a full spoken Arabic phrase combining a number and a counted noun with grammatical agreement,
 * dual forms, plural/singular rules, and accusative specification (tamyiz).
 *
 * @param n Numeric quantity.
 * @param noun Target Arabic noun definition containing singular, dual, plural, and tamyiz forms.
 * @param grammaticalCase Grammatical case ('nom', 'acc', or 'gen').
 * @returns Complete phrase in spoken Arabic words.
 */
export function counted(n: number | string, noun: ArabicNoun, grammaticalCase: GrammaticalCase = 'nom'): string {
  const v = Math.round(Math.abs(+n)), c = grammaticalCase, g = noun.gender, r = v % 100;
  if (!v) return 'صفر ' + noun.singular;
  if (v === 1) return c === 'acc' ? noun.tamyiz + ' ' + (g === 'f' ? 'واحدة' : 'واحدًا') : noun.singular + ' ' + (g === 'f' ? 'واحدة' : 'واحد');
  if (v === 2) return c === 'nom' ? noun.dual.nom : noun.dual.accGen;
  if (v > 100 && (r === 1 || r === 2)) return words(v - r, g, c) + ' و' + counted(r, noun, c); // follows the last part
  if (!r) return construct(words(v, g, c)) + ' ' + noun.singular; // 100, 1000, 1600 … + singular genitive
  if (r <= 10) return words(v, g, c) + ' ' + noun.plural; // 3–10 + genitive plural
  return words(v, g, c) + ' ' + noun.tamyiz; // 11–99 + accusative singular
}

/**
 * Formats a number with comma thousands separators using regex.
 *
 * @param n Integer value.
 * @returns Comma-separated digit string.
 */
const digits = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Generates a subtitle-friendly Arabic phrase combining Western digits with grammatically correct
 * Arabic noun forms (e.g., "6 دقائق", "1,280 مترًا مربعًا").
 *
 * @param n Number or numeric string.
 * @param noun Arabic noun structure.
 * @param grammaticalCase Grammatical case.
 * @returns Formatted phrase with digits and noun.
 */
export function shown(n: number | string, noun: ArabicNoun, grammaticalCase: GrammaticalCase = 'nom'): string {
  const v = Math.round(Math.abs(+n)), r = v % 100;
  if (v === 1 || v === 2) return counted(v, noun, grammaticalCase);
  if (r <= 2) return digits(v) + ' ' + noun.singular;
  return digits(v) + ' ' + (r <= 10 ? noun.plural : noun.tamyiz);
}

/**
 * Converts a plot identifier like "NE-01" into an Arabic spoken format (e.g., "رقم واحد").
 *
 * @param pid Plot identifier code.
 * @returns Spoken Arabic name string for the plot number.
 */
export function plotName(pid: string | null | undefined): string {
  const m = String(pid || '').match(/(\d+)\s*$/);
  return m ? 'رقم ' + words(+m[1], 'm', 'nom') : '';
}

/**
 * Placeholder → [noun, case]. Every placeholder sits after a preposition in narration.json
 * (خلال / من / بمساحة / على بُعد / في حدود), so all are genitive.
 */
const SLOTS: [string, NounId, GrammaticalCase][] = [
  ['walk', 'minute', 'gen'], ['floors', 'floor', 'gen'], ['gfa', 'sqm', 'acc'] /* object of «تبلغ» */,
  ['restroom', 'metre', 'gen'], ['prayer', 'metre', 'gen'], ['aid', 'metre', 'gen']
];

export type NarrationValues = Record<string, string | number | undefined>;

/**
 * Populates Arabic template variables:
 * - `xxxAr`: spoken Arabic words with full number-noun agreement for voice-over
 * - `xxxArTxt`: Western digits with agreed noun for on-screen subtitles
 * - `plotAr`: vocalized plot number
 *
 * @param x Input narrative values map.
 * @returns Enriched dictionary with derived Arabic variables.
 */
export function narrationVars(x: NarrationValues): Record<string, string> {
  const o: Record<string, string> = {};
  SLOTS.forEach(([k, noun, c]) => {
    const raw = x[k];
    const n = +String(raw === undefined ? '' : raw).replace(/,/g, '');
    if (raw === undefined || raw === '' || isNaN(n)) return;
    o[k + 'Ar'] = counted(n, NOUNS[noun], c);
    o[k + 'ArTxt'] = shown(n, NOUNS[noun], c);
  });
  if (x['plot']) o['plotAr'] = plotName(String(x['plot']));
  return o;
}

/**
 * Replaces `{name}` placeholders in template text with matching values from a dictionary.
 * Unrecognized tokens are left intact.
 *
 * @param text Template string with `{placeholder}` tokens.
 * @param v Dictionary of replacement values.
 * @returns Substituted text string.
 */
export const fill = (text: string, v: NarrationValues): string =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] !== undefined ? String(v[k]) : m));

/**
 * Wraps a Latin or alphanumeric token (e.g. plot id "NE-01") in Unicode Left-to-Right Isolate marks
 * (U+2066 ... U+2069) and replaces hyphens with non-breaking hyphens to prevent bidirectional reordering.
 *
 * @param s String containing Latin text or identifiers.
 * @returns LTR-isolated string.
 */
export const ltrIsolate = (s: string): string => '⁦' + s.replace(/-/g, '‑') + '⁩';

/**
 * Vocalizes ambiguous words in generated Arabic phrases with diacritical marks (harakat)
 * to ensure accurate text-to-speech pronunciation without altering subtitle spelling.
 *
 * @param text Arabic text string.
 * @returns Vocalized Arabic text with vowel diacritics.
 */
export function spokenArabic(text: string): string {
  const vowels: Record<string, string> = {
    'إكسبو': 'إِكْسْبُو', 'ألفين': 'أَلْفَيْن', 'ثلاثين': 'ثَلاثِين',
    'ست': 'سِتّ', 'ستة': 'سِتَّة', 'ستمئة': 'سِتّمِئَة',
    'مئة': 'مِئَة', 'مئتين': 'مِئَتَيْن', 'مئتي': 'مِئَتَيْ',
    'متر': 'مِتْر', 'مترًا': 'مِتْرًا', 'مربع': 'مُرَبَّع', 'مربعًا': 'مُرَبَّعًا',
    'طابق': 'طابِق', 'طابقًا': 'طابِقًا', 'طوابق': 'طَوابِق',
    'رقم': 'رَقْم', 'واحد': 'واحِد', 'دقيقة': 'دَقيقة', 'دقائق': 'دَقائِق',
    'الشمالية': 'الشَّمالِيَّة', 'الجنوبية': 'الجَنوبِيَّة',
    'الشرقية': 'الشَّرْقِيَّة', 'الغربية': 'الغَرْبِيَّة',
    'الرياض': 'الرِّياض', 'الواحة': 'الواحَة', 'الكرة': 'الكُرَة', 'الأرضية': 'الأَرْضِيَّة',
    'محطة': 'مَحَطَّة', 'المترو': 'المِتْرو', 'بالمترو': 'بالمِتْرو', 'المطار': 'المَطار',
    'البوابة': 'البَوّابَة', 'المملكة': 'المَمْلَكَة', 'الأجنحة': 'الأَجْنِحَة',
    'المصلّى': 'المُصَلّى', 'المصلى': 'المُصَلّى', 'الإسعافات': 'الإسْعافات', 'الأولية': 'الأَوَّلِيَّة',
    'الزوار': 'الزُّوّار', 'السطح': 'السَّطْح', 'شرفة': 'شُرْفَة', 'المساء': 'المَساء', 'المستقبل': 'المُسْتَقْبَل'
  };
  return text.replace(/[\u0621-\u064A\u064B-\u0652]+/g, word =>
    vowels[word] ?? (word.startsWith('و') && vowels[word.slice(1)] ? 'وَ' + vowels[word.slice(1)] : word));
}

/**
 * Prepares the displayed subtitle and vocalized speech text for a single narration beat.
 *
 * @param b Narration step specification.
 * @param v Dictionary of variable values.
 * @returns Object with `shown` (subtitle) and `spoken` (diacritized TTS audio text).
 */
export function beatText(b: Pick<NarrationStep, 'ar' | 'en'> & { arSpeech?: string }, v: NarrationValues): { shown: string; spoken: string } {
  const shownVals: NarrationValues = {};
  for (const [k, x] of Object.entries(v)) shownVals[k] = typeof x === 'string' && /[A-Za-z]/.test(x) ? ltrIsolate(x) : x;
  const shownText = fill(b.ar || b.en, shownVals);
  return { shown: shownText, spoken: spokenArabic(b.arSpeech ? fill(b.arSpeech, v) : fill(b.ar || b.en, v)) };
}
