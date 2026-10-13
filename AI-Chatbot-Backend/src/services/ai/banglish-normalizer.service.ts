import { normalizeForSearch, normalizeText } from '../../utils/text.utils';

export type DetectedLanguage = 'bn' | 'en' | 'banglish' | 'mixed';

/**
 * Banglish (Romanized Bangla) handling for Class 3 retrieval.
 * Strategy: keep the original query always; detect script; generate
 * conservative normalized variants for retrieval only. Never rewrite the
 * learner's visible message.
 */

const BN_SCRIPT = /[\u0980-\u09FF]/;

// Common Class-3 Banglish words -> Bengali script equivalents (conservative,
// high-precision subset used only to expand retrieval, not to rewrite answers).
const BANGLISH_MAP: Record<string, string[]> = {
  vognangsho: ['ভগ্নাংশ'],
  bhognangsho: ['ভগ্নাংশ'],
  vagnangso: ['ভগ্নাংশ'],
  onko: ['অঙ্ক', 'অংক'],
  onka: ['অঙ্ক'],
  gonit: ['গণিত'],
  gonith: ['গণিত'],
  jog: ['যোগ'],
  biyog: ['বিয়োগ'],
  gun: ['গুণ'],
  vag: ['ভাগ'],
  bujhao: ['বুঝিয়ে দাও', 'বোঝাও'],
  bujhaw: ['বুঝিয়ে দাও'],
  bojhao: ['বোঝাও'],
  sekhao: ['শেখাও'],
  ki: ['কী', 'কি'],
  kivabe: ['কীভাবে', 'কিভাবে'],
  keno: ['কেন'],
  kano: ['কেন'],
  amar: ['আমার'],
  tomar: ['তোমার'],
  vul: ['ভুল'],
  bhul: ['ভুল'],
  sothik: ['সঠিক'],
  sahaj: ['সহজ'],
  sohoj: ['সহজ'],
  kore: ['করে'],
  korbo: ['করব'],
  koro: ['করো'],
  holo: ['হলো', 'হল'],
  hoy: ['হয়'],
  gacher: ['গাছের'],
  gach: ['গাছ'],
  khabar: ['খাবার'],
  toiri: ['তৈরি'],
  pani: ['পানি'],
  jol: ['জল'],
  alo: ['আলো'],
  mati: ['মাটি'],
  prani: ['প্রাণী'],
  pakhi: ['পাখি'],
  mach: ['মাছ'],
  boi: ['বই'],
  golpo: ['গল্প'],
  kobita: ['কবিতা'],
  shobdo: ['শব্দ'],
  bakko: ['বাক্য'],
  pora: ['পড়া'],
  lekha: ['লেখা'],
  shikhi: ['শিখি'],
  khelna: ['খেলনা'],
  bondhu: ['বন্ধু'],
  baba: ['বাবা'],
  ma: ['মা'],
  shikkhok: ['শিক্ষক'],
  bidyaloy: ['বিদ্যালয়'],
  class: ['শ্রেণি'],
  tritio: ['তৃতীয়'],
  prothom: ['প্রথম'],
  ditiyo: ['দ্বিতীয়'],
  nam: ['নাম'],
  ortho: ['অর্থ'],
  udahoron: ['উদাহরণ'],
  sohoje: ['সহজে'],
  dao: ['দাও'],
  daw: ['দাও'],
  bolo: ['বলো'],
  likho: ['লিখো'],
  dekhao: ['দেখাও'],
  shonao: ['শোনাও'],
  abar: ['আবার'],
  ekhon: ['এখন'],
  jemon: ['যেমন'],
  temon: ['তেমন'],
};

const ENGLISH_STOP = new Set(['what', 'how', 'why', 'is', 'are', 'the', 'a', 'an', 'do', 'does', 'please', 'me', 'my', 'to', 'in', 'of', 'easy']);

export function detectScript(text: string): DetectedLanguage {
  const clean = normalizeText(text);
  if (!clean) return 'en';
  const hasBn = BN_SCRIPT.test(clean);
  const letters = clean.replace(/[^A-Za-z\u0980-\u09FF\s]/g, ' ').split(/\s+/).filter(Boolean);
  const latinWords = letters.filter((w) => /^[A-Za-z]+$/.test(w));
  const banglishHits = latinWords.filter((w) => BANGLISH_MAP[w.toLowerCase()] || isBanglishShaped(w)).length;
  if (hasBn && (banglishHits > 0 || latinWords.length > 0)) return 'mixed';
  if (hasBn) return 'bn';
  if (banglishHits > 0) return 'banglish';
  return 'en';
}

function isBanglishShaped(word: string): boolean {
  // Heuristic: latin words with characteristic Bangla phonetics.
  return /(aa|ee|oo|sho|chh|bh|dh|gh|kho|tho|ngsh|sh|ao|eo)/i.test(word) && word.length >= 2;
}

/** Conservative transliteration variants for retrieval only. */
export function banglishVariants(query: string): string[] {
  const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  const variants: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase().replace(/[^a-z]/g, '');
    const mapped = BANGLISH_MAP[key];
    if (mapped) variants.push(...mapped);
  }
  // Common spelling normalizations.
  const normalized = normalizeForSearch(query)
    .replace(/vognangsho|bhognangsho|vagnangso/gi, 'ভগ্নাংশ')
    .replace(/\bonko\b/gi, 'অঙ্ক');
  if (normalized !== normalizeForSearch(query)) variants.push(normalized);
  return Array.from(new Set(variants)).slice(0, 12);
}

/** All query forms to try during retrieval: original first, then variants. */
export function retrievalQueryForms(original: string): string[] {
  const forms = [normalizeText(original)];
  for (const v of banglishVariants(original)) {
    if (v && !forms.includes(v)) forms.push(v);
  }
  // Whitespace/punctuation-tolerant form.
  const collapsed = normalizeText(original).replace(/\s+/g, ' ').trim();
  if (collapsed && !forms.includes(collapsed)) forms.push(collapsed);
  return forms.slice(0, 6);
}

/**
 * Mandatory answer-language rule:
 * - Banglish input -> Bengali script (bn) by default.
 * - Pure Bangla -> bn. Pure English -> honour preference (default en).
 * - Mixed -> bn by default (child-friendly for Bangladesh Class 3).
 * - Explicit learner preference ('en') overrides only pure-English queries.
 */
export function decideAnswerLanguage(detected: DetectedLanguage, preference?: string): 'bn' | 'en' {
  if (preference === 'bn') return 'bn';
  if (detected === 'banglish' || detected === 'mixed' || detected === 'bn') return 'bn';
  if (detected === 'en' && preference === 'en') return 'en';
  if (detected === 'en') return preference === 'bn' ? 'bn' : 'en';
  return 'bn';
}

export function isBanglishQuery(text: string): boolean {
  const d = detectScript(text);
  return d === 'banglish' || d === 'mixed';
}

export { ENGLISH_STOP };
