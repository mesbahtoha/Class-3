/**
 * Text normalization & search utilities.
 * Ported 1:1 from the legacy monolith (index.js) to preserve exact behavior.
 */

export function normalizeText(text: unknown): string {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeForSearch(text: unknown): string {
  return normalizeText(text).toLowerCase();
}

/**
 * Keywords that indicate a question is about notices (exams, routines, fees,
 * scholarships, admission, results, etc.). Sources/RAG context should only be
 * surfaced when the query is notice-related. Covers English, Bengali, and
 * Banglish (Bengali written in Latin letters).
 */
const NOTICE_KEYWORDS = [
  // English
  'exam', 'exams', 'test', 'tests', 'routine', 'timetable', 'time table', 'schedule', 'class', 'classes',
  'fee', 'fees', 'scholarship', 'waiver', 'admission', 'result', 'results',
  'notice', 'notices', 'deadline', 'credit', 'credits', 'semester', 'course',
  'courses', 'attendance', 'lab', 'viva', 'thesis', 'syllabus', 'academic',
  'calendar', 'holiday', 'registration', 'withdraw', 'date sheet', 'marksheet',
  'transcript', 'bus', 'room', 'section', 'teacher', 'faculty', 'department',
  'session', 'stipend', 'tuition', 'fee waiver', 'admit card', 'hall',
  'dues', 'pay', 'payment', 'financial', 'aid', 'grant',
  'upload', 'uploads', 'uploaded', 'document', 'documents', 'file', 'files',
  'pdf', 'pdfs', 'attachment', 'attachments', 'official', 'academic',
  // Bengali
  'পরীক্ষা', 'রুটিন', 'ফি', 'বৃত্তি', 'ভর্তি', 'ফলাফল', 'নোটিশ', 'ক্লাস',
  'শিক্ষার্থী', 'বাস', 'রুম', 'সেমিস্টার', 'কোর্স', 'ডেডলাইন', 'অ্যাডমিশন',
  'রেজাল্ট', 'সময়সূচি', 'তফসিল', 'নোটিশ', 'অনুমতি', 'ল্যাব', 'বিভাগ',
  'শিক্ষক', 'ভর্তি পরীক্ষা', 'বেতন', 'টিউশন', 'হল', 'আবেদন', 'ফরম',
  'ডকুমেন্ট', 'ফাইল', 'আপলোড', 'নথি', 'বিজ্ঞপ্তি',
  // Banglish
  'porikkha', 'exam', 'rutin', 'routine', 'fee', 'britti', 'scholarship',
  'vorti', 'admission', 'result', 'rezult', 'notis', 'notice', 'bus', 'room',
  'class', 'clas', 'semester', 'course', 'deadline', 'taka', 'bivag',
  'shikkhok', 'lab', 'dealine', 'fees', 'upload', 'document', 'file', 'pdf',
  'dokument', 'nail', 'download',
];

/**
 * Academic synonyms across English / Bengali / Banglish. Used to expand a
 * search query so an English question can find Bengali notices (and vice
 * versa) with plain keyword matching - no embedding infra required.
 */
const ACADEMIC_SYNONYMS: Record<string, string[]> = {
  exam: ['পরীক্ষা', 'porikkha', 'porikha', 'parikkha'],
  exams: ['পরীক্ষা', 'পরীক্ষাসমূহ', 'porikkha'],
  test: ['পরীক্ষা', 'টেস্ট', 'porikkha'],
  routine: ['রুটিন', 'rutin', 'সময়সূচি', 'time table'],
  timetable: ['রুটিন', 'rutin', 'সময়সূচি', 'time table'],
  schedule: ['সময়সূচি', 'তফসিল', 'rutin'],
  result: ['ফলাফল', 'রেজাল্ট', 'rezult', 'resalt'],
  results: ['ফলাফল', 'রেজাল্ট', 'rezult'],
  admission: ['ভর্তি', 'vorti', 'অ্যাডমিশন', 'addmission'],
  scholarship: ['বৃত্তি', 'britti', 'স্কলারশিপ'],
  fee: ['ফি', 'বেতন', 'টিউশন', 'tuition', 'tution'],
  fees: ['ফি', 'বেতন', 'টিউশন'],
  tuition: ['ফি', 'বেতন', 'টিউশন', 'tution'],
  notice: ['নোটিশ', 'notis', 'বিজ্ঞপ্তি', 'বিজ্ঞাপন'],
  notices: ['নোটিশ', 'notis', 'বিজ্ঞপ্তি'],
  class: ['ক্লাস', 'clas', 'শ্রেণি'],
  classes: ['ক্লাস', 'clas'],
  lab: ['ল্যাব', 'লেব'],
  teacher: ['শিক্ষক', 'shikkhok'],
  teachers: ['শিক্ষক', 'শিক্ষকগণ'],
  department: ['বিভাগ', 'bivag', 'ডিপার্টমেন্ট'],
  hall: ['হল', 'হোস্টেল'],
  bus: ['বাস'],
  room: ['রুম', 'কক্ষ'],
  deadline: ['ডেডলাইন', 'শেষ তারিখ', 'শেষ সময়'],
  registration: ['রেজিস্ট্রেশন', 'নিবন্ধন', 'registration'],
  semester: ['সেমিস্টার', 'semester'],
  course: ['কোর্স', 'course', 'বিষয়'],
  courses: ['কোর্স', 'বিষয়সমূহ'],
  attendance: ['উপস্থিতি', 'উপস্থিত'],
  syllabus: ['সিলেবাস', 'syllabus', 'পাঠ্যসূচি'],
  date: ['তারিখ', 'কবে', 'কখন'],
  time: ['সময়', 'কখন', 'কয়টা'],
  day: ['দিন', 'তারিখ', 'কবে'],
  viva: ['ভাইভা', 'viva'],
  thesis: ['থিসিস', 'থিসিস/প্রজেক্ট'],
  marksheet: ['মার্কশিট', 'নম্বরপত্র'],
  transcript: ['ট্রান্সক্রিপ্ট'],
  stipend: ['স্টাইপেন্ড', 'britti'],
  waiver: ['ওয়েভার', 'ছাড়'],
  admissiontest: ['ভর্তি পরীক্ষা', 'vorti porikkha'],
  resultdate: ['ফলাফলের তারিখ', 'rezult date'],
  classroutine: ['ক্লাস রুটিন', 'clas rutin'],
  upload: ['আপলোড', 'upload'],
  uploaded: ['আপলোড', 'upload'],
  document: ['ডকুমেন্ট', 'dokument', 'নথি', 'কাগজ'],
  documents: ['ডকুমেন্ট', 'নথি', 'কাগজপত্র'],
  file: ['ফাইল', 'নথি'],
  files: ['ফাইল', 'নথি'],
  pdf: ['পিডিএফ', 'pdf'],
  download: ['ডাউনলোড', 'download'],
  bangla: ['বাংলা', 'bangla'],
  bengali: ['বাংলা', 'bangla'],
  english: ['ইংরেজি', 'english'],
  ভর্তি: ['admission', 'vorti'],
  পরীক্ষা: ['exam', 'porikkha'],
  রুটিন: ['routine', 'rutin'],
  ফলাফল: ['result', 'rezult'],
  রেজাল্ট: ['result', 'rezult'],
  বৃত্তি: ['scholarship', 'britti'],
  ফি: ['fee', 'tuition'],
  বেতন: ['fee', 'tuition'],
  নোটিশ: ['notice', 'notis'],
  বিজ্ঞপ্তি: ['notice', 'notis'],
  ক্লাস: ['class', 'clas'],
  শিক্ষক: ['teacher', 'shikkhok'],
  বিভাগ: ['department', 'bivag'],
  ডকুমেন্ট: ['document', 'dokument'],
  ফাইল: ['file'],
  নথি: ['document', 'file'],
  আপলোড: ['upload', 'uploaded'],
  তারিখ: ['date', 'day'],
  সময়: ['time', 'schedule'],
  কবে: ['when', 'date'],
  কখন: ['when', 'time'],
};

/** Returns the query tokens plus their academic synonyms (deduplicated). */
export function expandQueryForSearch(query: unknown): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string) => {
    const key = normalizeForSearch(term);
    if (key && !seen.has(key)) {
      seen.add(key);
      terms.push(key);
    }
  };

  for (const token of tokenize(query)) {
    add(token);
    const stem = bengaliStem(token);
    if (stem !== token) add(stem);
    for (const candidate of [token, stem]) {
      for (const synonym of ACADEMIC_SYNONYMS[candidate] || []) {
        add(synonym);
      }
    }
  }

  // Also add the raw normalized query (phrase) so exact matches still win.
  const raw = normalizeForSearch(query);
  if (raw) {
    add(raw);
  }

  return terms;
}

export function isNoticeRelatedQuery(query: unknown): boolean {
  const q = normalizeForSearch(query);
  if (!q) return false;
  return NOTICE_KEYWORDS.some((keyword) => q.includes(keyword));
}

export function buildPreview(text: unknown, maxLength = 280): string {
  const clean = normalizeText(text).replace(/\n/g, ' ');
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}...`;
}

export function uniqueArray<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function tokenize(text: unknown): string[] {
  return normalizeForSearch(text)
    .replace(/[^\p{L}\p{M}\p{N}\s/-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'am', 'i', 'you', 'he', 'she',
  'it', 'they', 'we', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or', 'from',
  'with', 'by', 'about', 'what', 'when', 'where', 'which', 'who', 'how', 'do',
  'does', 'did', 'can', 'could', 'please', 'tell', 'me', 'my', 'our', 'your',
  'notice', 'notices', 'department', 'university', 'give', 'show',
]);

export function removeStopWords(words: string[]): string[] {
  return words.filter((w) => !STOP_WORDS.has(w));
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Splits a large document into overlapping chunks for keyword retrieval. */
export function chunkText(text: unknown, chunkWordSize = 180, overlapWords = 40): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return [];

  const chunks: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (!buffer.length) return;
    const piece = buffer.join('\n\n').trim();
    if (piece) chunks.push(piece);
    buffer = [];
  };

  for (const paragraph of paragraphs) {
    const paraWords = paragraph.split(/\s+/);
    if (paraWords.length > chunkWordSize * 1.4) {
      flushBuffer();
      let start = 0;
      while (start < paraWords.length) {
        const end = Math.min(start + chunkWordSize, paraWords.length);
        const chunk = paraWords.slice(start, end).join(' ').trim();
        if (chunk) chunks.push(chunk);
        if (end === paraWords.length) break;
        start = Math.max(end - overlapWords, start + 1);
      }
      continue;
    }

    const currentWords = buffer.join(' ').split(/\s+/).filter(Boolean).length;
    if (currentWords + paraWords.length <= chunkWordSize) {
      buffer.push(paragraph);
    } else {
      flushBuffer();
      buffer.push(paragraph);
    }
  }

  flushBuffer();
  return uniqueArray(chunks);
}

/** Counts case-insensitive occurrences of a term in text (any Unicode script). */
function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  const t = normalizeForSearch(text);
  const key = normalizeForSearch(term);
  if (!t || !key) return 0;
  let count = 0;
  let index = t.indexOf(key);
  while (index !== -1) {
    count += 1;
    index = t.indexOf(key, index + key.length);
  }
  return count;
}

/** Common Bengali suffixes to strip when looking up academic synonyms. */
const BN_INFLECTION_SUFFIXES = ['গুলোর', 'গুলো', 'টির', 'এর', 'ের', 'তে', 'টা', 'টি', 'র', 'ও'];

/**
 * Light stemmer for Bengali words used ONLY for synonym lookup, e.g.
 * "পরীক্ষার" -> "পরীক্ষা", "ফিতে" -> "ফি". Keeps the word if stripping
 * produces nothing meaningful.
 */
export function bengaliStem(word: unknown): string {
  const w = String(word ?? '').trim();
  if (!/[\u0980-\u09FF]/.test(w)) return w;
  let stem = w;
  for (const suffix of BN_INFLECTION_SUFFIXES) {
    if (stem.length > suffix.length + 1 && stem.endsWith(suffix)) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }
  return stem;
}

/** Synonym aliases for a single token (direct lookups only). */
function synonymAliases(token: string): string[] {
  const candidates = [token, bengaliStem(token)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    for (const alias of ACADEMIC_SYNONYMS[candidate] || []) {
      const key = normalizeForSearch(alias);
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/**
 * Ranks how strongly a query matches a piece of text.
 * - Whole-phrase match: big bonus (exact phrasing wins).
 * - Per-token overlap: Unicode-safe counting (works for Bengali script,
 *   English, and Banglish) with cross-language academic synonyms.
 */
export function computeKeywordScore(haystack: unknown, query: unknown): number {
  const text = normalizeForSearch(haystack);
  const q = normalizeForSearch(query);

  if (!text || !q) return 0;

  let score = 0;
  if (text.includes(q)) score += 50;

  const queryTokens = removeStopWords(tokenize(q));
  for (const token of queryTokens) {
    score += countOccurrences(text, token) * 6;
    for (const alias of synonymAliases(token)) {
      score += countOccurrences(text, alias) * 5;
    }
  }

  return score;
}

/* ------------------------------------------------------------------ */
/* Content retrieval helpers (BM25)                                   */
/* ------------------------------------------------------------------ */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Converts Bengali digits to ASCII so queries and books compare equally. */
export function normalizeDigits(text: unknown): string {
  return String(text ?? '').replace(/[০-৯]/g, (digit) => String(BN_DIGITS.indexOf(digit)));
}

/**
 * Aggressive, script-aware normalization used for search indexing only.
 * Display text is never changed by this function.
 */
export function normalizeForIndex(text: unknown): string {
  return normalizeText(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[০-৯]/g, (digit) => String(BN_DIGITS.indexOf(digit)))
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that carry no topic signal in a Class 3 textbook question. */
const CONTENT_STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall',
  'may', 'might', 'must', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with',
  'from', 'about', 'into', 'over', 'under', 'and', 'or', 'but', 'if', 'then',
  'than', 'so', 'as', 'this', 'that', 'these', 'those', 'it', 'its', 'i',
  'you', 'he', 'she', 'we', 'they', 'me', 'my', 'your', 'his', 'her', 'our',
  'their', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why',
  'how', 'please', 'tell', 'show', 'give', 'explain', 'help', 'want', 'need',
  'know', 'read', 'write', 'say', 'said', 'also', 'very', 'just', 'some',
  'any', 'all', 'more', 'most', 'much', 'many', 'one', 'two', 'three',
  'class', 'book', 'page', 'chapter', 'unit', 'lesson', 'question', 'answer',
  'activity', 'exercise', 'textbook', 'subject', 'topic',
  // Bengali
  'কি', 'কী', 'কেন', 'কিভাবে', 'কীভাবে', 'কোথায়', 'কোথায়', 'কত', 'কতটা',
  'কে', 'কার', 'কোন', 'কোনটি', 'কোনটা', 'এবং', 'বা', 'ও', 'এর', 'এই', 'সেই',
  'একটি', 'একটা', 'আমি', 'আমার', 'আমরা', 'তুমি', 'তোমার', 'সে', 'তার',
  'তারা', 'এটা', 'সেটা', 'এখানে', 'সেখানে', 'করে', 'কর', 'করো', 'করব', 'হয়',
  'হয়', 'হবে', 'হল', 'হলো', 'আছে', 'নেই', 'থেকে', 'জন্য', 'সাথে', 'মধ্যে',
  'ব্যাখ্যা', 'বুঝিয়ে', 'বুঝাও', 'বল', 'বলো', 'দাও', 'দেখাও', 'শেখাও', 'সহজ',
  'ছোট', 'বড়', 'ভালো', 'আবার', 'এখন', 'তাহলে', 'কারণ', 'যেমন', 'তেমন',
  'বই', 'পৃষ্ঠা', 'অধ্যায়', 'অধ্যায়', 'পাঠ', 'ইউনিট', 'প্রশ্ন', 'উত্তর',
  'অনুশীলনী', 'কাজ', 'লেখা', 'পড়া', 'পড়া', 'মানে',
]);

/**
 * Cross-language topic aliases. Keys and values are normalized before lookup.
 * This is deliberately about Class 3 textbook topics, not general synonyms.
 */
const CONTENT_SYNONYMS: Record<string, string[]> = {
  // Subjects
  bangla: ['বাংলা', 'bangla', 'bengali'],
  বাংলা: ['bangla', 'bengali'],
  english: ['ইংরেজি', 'english'],
  ইংরেজি: ['english'],
  math: ['গণিত', 'gonit', 'অঙ্ক', 'অংক', 'mathematics'],
  mathematics: ['গণিত', 'math', 'gonit'],
  গণিত: ['math', 'mathematics', 'gonit', 'অঙ্ক', 'অংক'],
  অঙ্ক: ['গণিত', 'math', 'gonit'],
  science: ['বিজ্ঞান', 'biggan'],
  বিজ্ঞান: ['science', 'biggan'],
  islam: ['ইসলাম', 'ইসলাম শিক্ষা', 'dhormo'],
  ইসলাম: ['islam', 'ইসলাম শিক্ষা'],
  religion: ['ধর্ম', 'ইসলাম', 'islam'],
  ধর্ম: ['religion', 'ইসলাম', 'islam'],

  // Math concepts
  fraction: ['ভগ্নাংশ', 'vognangsho', 'bhognangsho'],
  ভগ্নাংশ: ['fraction', 'vognangsho', 'bhognangsho'],
  addition: ['যোগ', 'jog', 'plus'],
  যোগ: ['addition', 'jog', 'plus'],
  subtraction: ['বিয়োগ', 'biyog', 'minus'],
  বিয়োগ: ['subtraction', 'biyog', 'minus'],
  multiplication: ['গুণ', 'gun', 'times'],
  গুণ: ['multiplication', 'gun', 'times'],
  division: ['ভাগ', 'vag', 'divide'],
  ভাগ: ['division', 'vag', 'divide'],
  number: ['সংখ্যা', 'songkha', 'numbers'],
  সংখ্যা: ['number', 'songkha', 'numbers'],
  decimal: ['দশমিক', 'doshomik'],
  দশমিক: ['decimal', 'doshomik'],
  geometry: ['জ্যামিতি', 'geometry'],
  জ্যামিতি: ['geometry'],
  circle: ['বৃত্ত', 'britto'],
  বৃত্ত: ['circle', 'britto'],
  triangle: ['ত্রিভুজ', 'tribhuj'],
  ত্রিভুজ: ['triangle', 'tribhuj'],
  rectangle: ['আয়তক্ষেত্র', 'ayotkkhetro'],
  আয়তক্ষেত্র: ['rectangle'],
  square: ['বর্গ', 'borgo'],
  বর্গ: ['square', 'borgo'],
  length: ['দৈর্ঘ্য', 'doirgho'],
  দৈর্ঘ্য: ['length', 'doirgho'],
  width: ['প্রস্থ', 'prostho'],
  প্রস্থ: ['width', 'prostho'],
  weight: ['ওজন', 'ojon'],
  ওজন: ['weight', 'ojon'],
  measurement: ['পরিমাপ', 'porimap'],
  পরিমাপ: ['measurement', 'porimap'],
  money: ['টাকা', 'taka', 'poisa'],
  টাকা: ['money', 'taka'],
  time: ['সময়', 'shomoy'],
  সময়: ['time', 'shomoy'],

  // Bangla language
  letter: ['বর্ণ', 'borno', 'অক্ষর'],
  বর্ণ: ['letter', 'borno', 'অক্ষর'],
  alphabet: ['বর্ণমালা', 'bornomala'],
  বর্ণমালা: ['alphabet', 'bornomala'],
  word: ['শব্দ', 'shobdo'],
  শব্দ: ['word', 'shobdo'],
  sentence: ['বাক্য', 'bakko'],
  বাক্য: ['sentence', 'bakko'],
  poem: ['কবিতা', 'kobita'],
  কবিতা: ['poem', 'kobita'],
  story: ['গল্প', 'golpo'],
  গল্প: ['story', 'golpo'],

  // Science
  plant: ['গাছ', 'উদ্ভিদ', 'gach', 'udbhid'],
  গাছ: ['plant', 'tree', 'gach', 'উদ্ভিদ'],
  উদ্ভিদ: ['plant', 'গাছ', 'udbhid'],
  tree: ['গাছ', 'plant', 'gach'],
  animal: ['প্রাণী', 'পশু', 'prani'],
  প্রাণী: ['animal', 'prani', 'পশু'],
  পশু: ['animal', 'প্রাণী', 'prani'],
  water: ['পানি', 'জল', 'pani', 'jol'],
  পানি: ['water', 'জল', 'pani', 'jol'],
  জল: ['water', 'পানি', 'pani', 'jol'],
  air: ['বাতাস', 'বায়ু', 'batash'],
  বাতাস: ['air', 'বায়ু', 'batash'],
  বায়ু: ['air', 'বাতাস', 'batash'],
  food: ['খাবার', 'খাদ্য', 'khabar'],
  খাবার: ['food', 'খাদ্য', 'khabar'],
  sky: ['আকাশ', 'akash'],
  আকাশ: ['sky', 'akash'],
  sun: ['সূর্য', 'suryo'],
  সূর্য: ['sun', 'suryo'],
  moon: ['চাঁদ', 'chand'],
  চাঁদ: ['moon', 'chand'],
  earth: ['পৃথিবী', 'prithibi'],
  পৃথিবী: ['earth', 'prithibi'],
  river: ['নদী', 'nodi'],
  নদী: ['river', 'nodi'],
  fish: ['মাছ', 'mach'],
  মাছ: ['fish', 'mach'],
  bird: ['পাখি', 'pakhi'],
  পাখি: ['bird', 'pakhi'],
  flower: ['ফুল', 'phul'],
  ফুল: ['flower', 'phul'],
  fruit: ['ফল', 'phol'],
  ফল: ['fruit', 'phol'],
  weather: ['আবহাওয়া', 'abohawa'],
  আবহাওয়া: ['weather', 'abohawa'],
  environment: ['পরিবেশ', 'poribesh'],
  পরিবেশ: ['environment', 'poribesh'],
  body: ['শরীর', 'shorir'],
  শরীর: ['body', 'shorir'],
  health: ['স্বাস্থ্য', 'shastho'],
  স্বাস্থ্য: ['health', 'shastho'],

  // Islam
  allah: ['আল্লাহ', 'allah'],
  আল্লাহ: ['allah'],
  quran: ['কুরআন', 'কোরআন', 'quran'],
  কুরআন: ['quran', 'কোরআন'],
  কোরআন: ['quran', 'কুরআন'],
  prayer: ['নামাজ', 'সালাত', 'namaz', 'salat'],
  নামাজ: ['prayer', 'salat', 'namaz'],
  সালাত: ['prayer', 'নামাজ', 'salat'],
  fasting: ['রোজা', 'সিয়াম', 'roja'],
  রোজা: ['fasting', 'সিয়াম', 'roja'],
  zakat: ['যাকাত', 'jakat'],
  যাকাত: ['zakat', 'jakat'],
  hajj: ['হজ', 'হজ্জ', 'hajj'],
  হজ: ['hajj', 'হজ্জ'],
  prophet: ['নবী', 'রাসূল', 'nobi', 'rasul'],
  নবী: ['prophet', 'রাসূল', 'nobi'],
  রাসূল: ['prophet', 'নবী', 'rasul'],
  hadith: ['হাদিস', 'হাদীস', 'hadis'],
  হাদিস: ['hadith', 'হাদীস', 'hadis'],
  mosque: ['মসজিদ', 'masjid'],
  মসজিদ: ['mosque', 'masjid'],

  // Bangladesh / general
  bangladesh: ['বাংলাদেশ', 'bangladesh'],
  বাংলাদেশ: ['bangladesh'],
  flag: ['পতাকা', 'potaka'],
  পতাকা: ['flag', 'potaka'],
  national: ['জাতীয়', 'jatiyo'],
  জাতীয়: ['national', 'jatiyo'],
  family: ['পরিবার', 'poribar'],
  পরিবার: ['family', 'poribar'],
  mother: ['মা', 'আম্মু', 'ma'],
  মা: ['mother', 'ma'],
  father: ['বাবা', 'আব্বু', 'baba'],
  বাবা: ['father', 'baba'],
  teacher: ['শিক্ষক', 'শিক্ষিকা', 'shikkhok'],
  শিক্ষক: ['teacher', 'shikkhok'],
  school: ['বিদ্যালয়', 'স্কুল', 'bidyaloy'],
  বিদ্যালয়: ['school', 'bidyaloy'],
  friend: ['বন্ধু', 'bondhu'],
  বন্ধু: ['friend', 'bondhu'],
};

/** Conservative suffix stripping for Bengali search tokens. */
export function stemForSearch(token: string): string {
  const word = String(token ?? '').trim();
  if (!/[\u0980-\u09FF]/.test(word) || word.length < 4) return word;
  const suffixes = ['গুলোর', 'গুলো', 'দেরকে', 'দের', 'টির', 'টিতে', 'টার', 'টাতে', 'ের', 'এর', 'তে', 'টি', 'টা', 'কে'];
  for (const suffix of suffixes) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Very light English stemmer for search recall only. */
export function stemEnglish(token: string): string {
  const word = String(token ?? '').toLowerCase();
  if (!/^[a-z]+$/.test(word) || word.length < 5) return word;
  if (word.endsWith('ies') && word.length > 6) return `${word.slice(0, -3)}y`;
  if (word.endsWith('es') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  return word;
}

export function contentTokens(text: unknown): string[] {
  return normalizeForIndex(text)
    .split(/\s+/)
    .filter((token) => (token.length >= 2 || /^\d$/.test(token)) && !CONTENT_STOP_WORDS.has(token));
}

export interface QueryTerm {
  term: string;
  weight: number;
  /** True when the term comes from the learner's own words (or a stem of them). */
  original: boolean;
}

/**
 * Expands a question into weighted search terms: original words, light stems,
 * cross-language topic aliases and Banglish variants. No LLM call required.
 */
export function buildQueryTerms(query: string, extraForms: string[] = []): QueryTerm[] {
  const terms = new Map<string, QueryTerm>();
  const add = (term: string, weight: number, original: boolean) => {
    const clean = normalizeForIndex(term);
    if (!clean || (clean.length < 2 && !/^\d$/.test(clean)) || CONTENT_STOP_WORDS.has(clean)) return;
    const existing = terms.get(clean);
    if (!existing) terms.set(clean, { term: clean, weight, original });
    else {
      existing.weight = Math.max(existing.weight, weight);
      existing.original = existing.original || original;
    }
  };

  const forms = [query, ...extraForms];
  for (const form of forms) {
    const tokens = contentTokens(form);
    for (const token of tokens) {
      add(token, 1, true);
      const stem = /[\u0980-\u09FF]/.test(token) ? stemForSearch(token) : stemEnglish(token);
      if (stem !== token) add(stem, 0.9, true);
      for (const alias of CONTENT_SYNONYMS[token] ?? []) add(alias, 0.62, false);
      for (const alias of CONTENT_SYNONYMS[stem] ?? []) add(alias, 0.55, false);
    }
  }

  return Array.from(terms.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 48);
}

/** Tokens stored on each chunk for indexed candidate lookup. */
export function chunkSearchTerms(text: unknown, extra?: string): string[] {
  const tokens = contentTokens(`${String(extra ?? '')} ${String(text ?? '')}`);
  const out = new Set<string>();
  for (const token of tokens) {
    out.add(token);
    const stem = /[\u0980-\u09FF]/.test(token) ? stemForSearch(token) : stemEnglish(token);
    if (stem !== token) out.add(stem);
  }
  return Array.from(out).slice(0, 500);
}

export interface MatchStats {
  matchedOriginal: number;
  matchedTotal: number;
  coverage: number;
}

export function matchStats(docTokens: Set<string>, queryTerms: QueryTerm[]): MatchStats {
  const original = new Set<string>();
  let matchedOriginal = 0;
  let matchedTotal = 0;
  for (const term of queryTerms) {
    if (term.original) original.add(term.term);
    if (!docTokens.has(term.term)) continue;
    matchedTotal += 1;
    if (term.original) matchedOriginal += 1;
  }
  return {
    matchedOriginal,
    matchedTotal,
    coverage: original.size ? matchedOriginal / original.size : 0,
  };
}

/** BM25 ranking over an in-memory candidate set. */
export function bm25Score(
  docTokens: string[],
  queryTerms: QueryTerm[],
  documentFrequency: Map<string, number>,
  documentCount: number,
  averageLength: number
): number {
  if (!docTokens.length || !queryTerms.length || !documentCount) return 0;
  const k1 = 1.2;
  const b = 0.75;
  const length = docTokens.length;
  const frequencies = new Map<string, number>();
  for (const token of docTokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);

  let score = 0;
  for (const term of queryTerms) {
    const frequency = frequencies.get(term.term);
    if (!frequency) continue;
    const df = documentFrequency.get(term.term) ?? 0;
    if (!df) continue;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const denominator = frequency + k1 * (1 - b + (b * length) / Math.max(1, averageLength));
    score += term.weight * idf * ((frequency * (k1 + 1)) / denominator);
  }
  return score;
}

export function detectLanguage(query: string): 'bn' | 'en' {
  const bnRegex = /[\u0980-\u09FF]/;
  return bnRegex.test(query) ? 'bn' : 'en';
}

export function isGreetingIntent(query: string): boolean {
  const q = normalizeForSearch(query);
  return /^(hi|hello|hey|assalamu alaikum|salam|good morning|good evening|good afternoon)\b/.test(q);
}

export function isSummaryIntent(query: string): boolean {
  const q = normalizeForSearch(query);
  const patterns = [
    /\bsummar(y|ize|ise)\b/,
    /\bbrief\b/,
    /\bshort\b/,
    /\boverview\b/,
    /\bgist\b/,
    /সংক্ষেপ/,
    /সারাংশ/,
    /ছোট করে/,
  ];
  return patterns.some((pattern) => pattern.test(q));
}

export function isFullNoticeIntent(query: string): boolean {
  const q = normalizeForSearch(query);
  const patterns = [
    /\bfull\b/,
    /\bcomplete\b/,
    /\boriginal\b/,
    /\bopen\b/,
    /\bshow\b.*\b(pdf|image|notice|routine|document|file)\b/,
    /\bgive\b.*\b(pdf|image|notice|routine|document|file)\b/,
    /পুরো/,
    /ফুল/,
    /সম্পূর্ণ/,
    /নোটিশটা দাও/,
    /রুটিনটা দাও/,
    /পিডিএফ/,
    /ইমেজ/,
    /ছবিটা দাও/,
    /পুরোটা/,
  ];
  return patterns.some((pattern) => pattern.test(q));
}

export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Estimates tokens from character count (used when the API omits usage). */
export function estimateTokens(text: string): number {
  const clean = normalizeText(text);
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / 4));
}

/** Rough USD cost estimate per 1k tokens for common cheap models. */
export function estimateCostUsd(totalTokens: number): number {
  return (totalTokens / 1000) * 0.00015;
}

export function now(): Date {
  return new Date();
}
