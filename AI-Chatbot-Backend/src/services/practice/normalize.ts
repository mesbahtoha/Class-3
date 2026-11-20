const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

/**
 * Normalize a free-text answer for deterministic comparison.
 * Handles whitespace, case, Bengali/ASCII digits and common punctuation so
 * "  Dhaka! " and "dhaka" are treated as the same answer.
 */
export function normalizeAnswerText(input: unknown): string {
  let text = typeof input === 'string' ? input : input == null ? '' : String(input);

  text = text.normalize('NFKC');

  // Bengali digits -> ASCII digits
  text = text.replace(/[০-৯]/g, (ch) => String(BENGALI_DIGITS.indexOf(ch)));

  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[।!?.,;:"'“”‘’()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the normalized value is empty (i.e. the student left it blank). */
export function isEmptyAnswer(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input === 'string') return normalizeAnswerText(input).length === 0;
  if (Array.isArray(input)) return input.every((item) => isEmptyAnswer(item));
  if (typeof input === 'object') return Object.keys(input as object).length === 0;
  return false;
}

export function roundMarks(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}
