/**
 * Deterministic solver for known Class 3 textbook exercises.
 * Fixes short reference queries like "Unit 3, lesson 5, number C, Match the request, page 45".
 * These queries carry almost no keywords for retrieval, so RAG alone fails.
 * This resolver answers them instantly without asking for a photo.
 */

export interface KnownExerciseResult {
  key: string;
  titleBn: string;
  titleEn: string;
  answerBn: string;
  answerEn: string;
}

function norm(q: string): string {
  return q.toLowerCase().replace(/[\u0980-\u09FF]+/g, (m) => ` ${m} `).replace(/\s+/g, ' ').trim();
}

function has(q: string, re: RegExp): boolean {
  return re.test(q);
}

const MATCH_REQUESTS_BN = `দারুণ! চলো Unit 3 Lesson 5 Page 45 Activity C মিলিয়ে নিই।

এই পাঠের নাম হলো অনুরোধ করা আর উত্তর দেওয়া। One is done for you মানে একটা তোমার জন্য করে দেওয়া আছে।

সঠিক মিল:

1. Could you please call me this evening?
উত্তর: Of course. I will call you around 6:00.
মানে: অবশ্যই। আমি সন্ধ্যা ৬টার দিকে ফোন করব।

2. Can you repeat that, please?
উত্তর: Sure. I am saying it again.
মানে: অবশ্যই। আমি আবার বলছি।

3. Could I have a look at your newspaper?
উত্তর: Sorry, but I am reading it now.
মানে: দুঃখিত, আমি এখন এটা পড়ছি।

4. Can I borrow your pen, please?
উত্তর: Sorry. I have only one pen.
মানে: দুঃখিত। আমার কাছে মাত্র একটা কলম আছে।

5. Can we meet at the library?
উত্তর: Yes, please. I will see you at the library.
মানে: হ্যাঁ, অবশ্যই। লাইব্রেরিতে দেখা হবে।

মনে রাখো:
Call চাইলে call এর উত্তর। Repeat চাইলে again এর উত্তর। Newspaper চাইলে reading এর উত্তর। Pen চাইলে one pen এর উত্তর। Meet চাইলে library এর উত্তর।

তুমি চাইলে এই খেলাটা এখানে খেলতে পারো: Practice পাতায় Match the Requests খেলাটি আছে।`;

const MATCH_REQUESTS_EN = `Great! Let us solve Unit 3 Lesson 5 Page 45 Activity C together.

This lesson is about making requests and giving replies. One is done for you.

Correct matches:

1. Could you please call me this evening?
Answer: Of course. I will call you around 6:00.

2. Can you repeat that, please?
Answer: Sure. I am saying it again.

3. Could I have a look at your newspaper?
Answer: Sorry, but I am reading it now.

4. Can I borrow your pen, please?
Answer: Sorry. I have only one pen.

5. Can we meet at the library?
Answer: Yes, please. I will see you at the library.

Tip to remember:
Call goes with call. Repeat goes with again. Newspaper goes with reading. Pen goes with one pen. Meet goes with library.

You can also play this as a game on the Practice page under Match the Requests.`;

export function resolveKnownExercise(question: string): KnownExerciseResult | null {
  const q = norm(question);

  const hasUnit3 = has(q, /unit\s*3|unit3/);
  const hasLesson5 = has(q, /lesson\s*5|lesson5|les\s*5/);
  const hasPage45 = has(q, /page\s*45|pg\s*45|\b45\b.*page|পৃষ্ঠা\s*৪৫/);
  const hasActivityC = has(q, /activity\s*c|\bnumber\s*:?\s*c\b|no\s*:?\s*c\b|\bmatch\b.*\brequest\b|\brequest\b.*\bmatch\b|match the request/);
  const hasRequestText =
    q.includes('could you please call me') ||
    q.includes('can you repeat that') ||
    q.includes('could i have a look') ||
    q.includes('can i borrow your pen') ||
    q.includes('can we meet at the library');

  const refScore = [hasUnit3, hasLesson5, hasPage45, hasActivityC].filter(Boolean).length;

  if (hasRequestText || refScore >= 2 || (hasUnit3 && hasActivityC) || (hasLesson5 && hasActivityC)) {
    return {
      key: 'english-for-today-unit3-lesson5-page45-activity-c',
      titleBn: 'English For Today, Unit 3, Lesson 5, Page 45, Activity C',
      titleEn: 'English For Today, Unit 3, Lesson 5, Page 45, Activity C',
      answerBn: MATCH_REQUESTS_BN,
      answerEn: MATCH_REQUESTS_EN,
    };
  }

  return null;
}

/** Extracts a friendly textbook label from a short reference query. */
export function parseTextbookRef(question: string): string | null {
  const q = norm(question);
  const unit = q.match(/unit\s*(\d+)/)?.[1];
  const lesson = q.match(/lesson\s*(\d+)/)?.[1];
  const page = q.match(/page\s*(\d+)/)?.[1];
  const activity = q.match(/activity\s*([a-z])/)?.[1]?.toUpperCase();
  if (!unit && !lesson && !page) return null;
  const parts: string[] = [];
  if (unit) parts.push(`Unit ${unit}`);
  if (lesson) parts.push(`Lesson ${lesson}`);
  if (page) parts.push(`Page ${page}`);
  if (activity) parts.push(`Activity ${activity}`);
  return parts.join(', ');
}
