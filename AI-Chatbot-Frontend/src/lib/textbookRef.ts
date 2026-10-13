/** Shared helper for short textbook references like Unit 3, Lesson 5, Page 45, Activity C.
 * Used by Tutor, Landing and Practice so a vague query never feels lost.
 * Copy rules: short sentences, commas and periods only, no dash symbols.
 */

export interface TextbookRef {
  unit?: string;
  lesson?: string;
  page?: string;
  activity?: string;
  label: string;
  isMatchRequests: boolean;
}

function norm(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseTextbookRef(question: string): TextbookRef | null {
  const q = norm(question);
  const unit = q.match(/unit\s*(\d+)/)?.[1];
  const lesson = q.match(/lesson\s*(\d+)/)?.[1];
  const page = q.match(/(?:page|pg|pista|pristha|পৃষ্ঠা)\s*(\d+)/)?.[1];
  const activity = q.match(/activity\s*([a-z])/)?.[1]?.toUpperCase()
    ?? q.match(/(?:number|no)\s*:?\s*([a-z])/)?.[1]?.toUpperCase();
  if (!unit && !lesson && !page) return null;
  const parts: string[] = [];
  if (unit) parts.push(`Unit ${unit}`);
  if (lesson) parts.push(`Lesson ${lesson}`);
  if (page) parts.push(`Page ${page}`);
  if (activity) parts.push(`Activity ${activity}`);
  const hasMatchWord = /\bmatch\b/.test(q) && /\brequest\b/.test(q);
  const isMatchRequests =
    (unit === '3' && lesson === '5') ||
    (hasMatchWord && (unit === '3' || lesson === '5' || page === '45')) ||
    (q.includes('could you please call me') || q.includes('can you repeat that'));
  return { unit, lesson, page, activity, label: parts.join(', '), isMatchRequests };
}

export function isTextbookRefQuery(question: string): boolean {
  const q = norm(question);
  const hits = [
    /unit\s*\d+/.test(q),
    /lesson\s*\d+/.test(q),
    /page\s*\d+|pg\s*\d+/.test(q),
    /activity\s*[a-z]/.test(q),
    /(?:number|no)\s*:?\s*[a-z]\b/.test(q),
    /\bmatch\b.*\brequest\b/.test(q),
  ].filter(Boolean).length;
  return hits >= 2 || (/\bmatch\b/.test(q) && /\brequest\b/.test(q));
}

export const MATCH_REQUESTS_PATH = '/exercise/match-requests';
export const MATCH_REQUESTS_LABEL = 'Unit 3, Lesson 5, Page 45, Activity C';
