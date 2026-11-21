import type { DocumentationContentDoc, DocumentationVersionDoc, DocsBlock, DocsDraft, DocsTeamMember } from '../../database/models';
import { DocumentationContentModel, DocumentationVersionModel } from '../../database/models';
import { DOCS_ROADMAP_CATEGORIES } from '../../constants';
import type { DocsRoadmapCategory } from '../../constants';
import { log } from '../../config/logger';

/*
 * Documentation content service.
 *
 * Single-document model: the current editable draft + the published
 * state/version. All "seed" text below is hand-written from verified facts
 * about the product (routes, features, verified names).
 */

function pitchBlock(id: string, heading: string, body: string[]): DocsBlock {
  return { id, heading, body };
}

export function buildSeedPitchDeck(): DocsDraft['pitchDeck'] {
  return [
    pitchBlock('problem', 'Problem', [
      "Class 3 students studying through textbooks need reliable explanations at the moment they get confused. When the problem arises during homework, immediate textbook-based help is often out of reach, so gaps grow quietly.",
      "Learning is cumulative: primary-level gaps compound. An AI assistant that reads the student's own textbooks can address confusion exactly where it appears.",
    ]),
    pitchBlock('solution', 'Solution', [
      'Shikhi Bondju AI Tutor is an AI-powered educational assistant for Class 3 students, answers based on the student\'s own textbooks.',
      'Product features (verified, live):',
      '- AI Tutor chat with textbook-based answers and real source citations.',
      '- Practice and examination system: 7 question types with instant feedback and deterministic scoring.',
      '- Digital textbook management: ingestion, storage and versioning of books.',
      '- Administration with a documentation and management CMS.',
    ]),
    pitchBlock('why-now', 'Why Now', [
      'AI access in schools is becoming mainstream; tools that learn from textbooks beat generic assistants.',
      'Textbook digitization creates structured data that retrieval can use reliably now.',
      'Teachers, students and parents increasingly expect fast, local, in-language support while studying.',
    ]),
    pitchBlock('demo', 'Product Demo (live system)', [
      `Verified live application: https://departmental-ai-chatbot-dkpf.vercel.app.`,
      'AI Tutor: ask a Class 3 question, get a textbook-based answer with real page citations.',
      'Practice & Exam: create practice sets and exams in the new Practice section — deterministic evaluation, instant feedback.',
      'Books: the admin manages published textbooks in one catalogue (English For Today, Class-3 Bangla / Math / Science / Islam books).',
    ]),
    pitchBlock('market', 'Market Opportunity (assumptions)', [
      'Assumption: Bangladesh has millions of primary school learners studying through NCTB textbooks at primary level.',
      "Assumption: schools and parents want an AI-first learning assistant that serves their students' textbooks, not generic content.",
      'Total addressable market to be measured: classroom adoption, parental use and institutional pilots are future assumptions.',
    ]),
    pitchBlock('business-model', 'Business Model (assumptions)', [
      'Assumption 1: per-school SaaS subscription with group/institution pricing tiers.',
      'Assumption 2: licensing for regional education departments and NGOS for mass adoption.',
      'Assumption 3: freemium model where students get a trial and schools pay for admin features.',
      'Revenue stream assumptions to validate with pilots.',
    ]),
    pitchBlock('traction', 'Traction (verified status)', [
      'Verified: the product is live on Vercel — the AI Tutor is serving textbook-grounded answers for Class 3 students.',
      'Verified: real-time statistics (see Live Statistics) track users, conversations, messages and AI usage.',
      'Verified features shipped: AI Tutor, Bangla/Banglish, textbook Q&A with citations, practice & exam system, admin CMS.',
      'Growth: live traffic through the application; user growth tracked via the live analytics.',
    ]),
    pitchBlock('competition', 'Competition (assumptions)', [
      'Assumption: generic AI tutors, question banks and textbook publishers are the direct comparison set.',
      "Assumption: Shikhi Bondju's differentiators are textbook-sourced answers with page citations, Class-3-native practice & exam, and fully managed books.",
      'Assumption: institutional curriculum knowledge beats generic content libraries.',
    ]),
    pitchBlock('advantage', 'Unique Advantage (verified)', [
      "Verified: answers are grounded in the school's textbooks — retrieval over published books with page citations, not a generic knowledge base.",
      'Verified: Class-3 native — practice & exam features, deterministic scoring, 7 question types.',
      'Verified: fully managed books — OCR for scanned books, teacher/admin CMS, draft/publish workflow.',
      'Verified: live application and live statistics — see the Live Statistics section for real numbers.',
    ]),
    pitchBlock('gtm', 'Go-To-Market Strategy (assumptions)', [
      'Assumption: pilot with 2-3 schools first, then district-level rollout with teacher training.',
      'Assumption: pricing tiers per school and per parent; freemium trial for students.',
      'Channels: live application + admin dashboard; pilot feedback drives product.',
    ]),
    pitchBlock('team', 'Team Infyners', [
      `Team Lead: Mesbahul Alam (+880 1601860526) — leads Product & Engineering.`,
      `Member: MONIRUZZAMAN Shaon (+880 01744720796) — research & design support.`,
      `Member: Halima Tuz Sadia (+880 01315027678) — student success & training support.`,
      'More members are added via the Documentation admin CMS.',
    ]),
    pitchBlock('vision', 'Vision', [
      'Every Class 3 student has a personal AI textbook-based tutor, with practice, exams, analytics and localized language support.',
      'Assumption: eventual expansion to higher grades, teacher dashboards and predictive learning paths.',
    ]),
  ];
}

export function buildSeedProductOverview(): DocsDraft['productOverview'] {
  return [
    pitchBlock('what', 'What Shikhi Bondju Does', [
      'Shikhi Bondju is an AI-powered educational assistant for Class 3 students. It helps students learn through their textbooks — textbooks being the official learning source, not a generic chatbot knowledge base.',
      'The core capability: students ask questions about their textbooks and receive textbook-based answers with real page citations.',
    ]),
    pitchBlock('users', 'Target Users', [
      'Class 3 students studying at schools, learning through NCTB textbooks.',
      'Parents helping children with their textbook-based homework.',
      'Teachers and admins who manage books and administration through the admin dashboard.',
    ]),
    pitchBlock('student-journey', 'How Students Interact with the AI Tutor', [
      '1. A student logs in to Shikhi Bondju AI Tutor.',
      '2. The student asks a question in Bengali or English (Banglish is supported).',
      '3. Language detection normalizes the query, then textbook retrieval over the student\'s published books finds relevant passages.',
      '4. The LLM context is built from the retrieved passages; citations (book title, chapter, page) are validated server-side before answering.',
      '5. The student receives a textbook-based answer with source links.',
    ]),
    pitchBlock('textbooks', 'How Textbooks Are Used as Learning Sources', [
      'Books are ingested: PDF upload, metadata, publication state, chunking with real page numbers, OCR for scanned books via a vision-model route.',
      'Chunks are indexed (currently lexical retrieval over published books); only published books are eligible for student queries.',
      'Every answer cites the specific book, chapter and page range retrieved.',
    ]),
    pitchBlock('practice', 'How Students Practice and Evaluate Their Understanding', [
      'Practice Mode: self-paced; submit answers; instant evaluation with correct/incorrect feedback, correct answers on mistakes, marks and percentage; question-wise feedback.',
      'Exam Mode: all questions together; nav panel with answered/unanswered; optional countdown timer; submit confirmation; auto-submit on expiry; answers locked after submission; results with marks, percentage and question-wise breakdown.',
      'Deterministic backend scoring for MCQ, fill-in-the-blanks, True/False, Matching (partial marks), One Word Answer, Rearrange and Translation (alternative answers). Configurable marks, negative marking and partial marks are supported.',
    ]),
    pitchBlock('admin', 'How Administrators Manage Learning Resources', [
      'Books: upload PDFs, metadata, publication (draft/published), reindexing, archiving, deletion.',
      'Practice & Exams: question sets with chapters, all seven question types, marks/exam configuration.',
      'Notices, chats history, settings, prompt templates, usage quotas, token usage.',
      'Documentation CMS: edit all documentation sections.',
    ]),
  ];
}

/**
 * Feature matrix rows — statuses verified against the codebase:
 * 'completed' means implemented evidence exists (route or service),
 * 'in_progress' means partially implemented, 'planned' means not implemented.
 */
const FEATURE_MATRIX: DocsDraft['featureMatrix'] = [
  { name: 'AI Tutor chat with textbook context', description: 'Textbook-grounded Q&A with page citations; custom prompt templates in the DB', status: 'completed', route: '/tutor' },
  { name: 'Bengali, English and Banglish query handling', description: 'Script detection and query variants; Bangla/Banglish normalization', status: 'completed' },
  { name: 'Textbook-based question answering', description: 'Answers grounded in published books with source page citations', status: 'completed', route: '/tutor' },
  { name: 'Digital textbook management', description: 'Upload, metadata, publish/unpublish, reindex, OCR for scanned books, chapter extraction', status: 'completed', route: '/admin/books' },
  { name: 'Book ingestion OCR', description: 'Scanned PDFs transcribed via the configured vision model during ingestion (OpenRouter Gemini)', status: 'completed', route: '/admin/books' },
  { name: 'Authentication and RBAC', description: 'Login/register, JWT + hashed refresh tokens, admin and user roles, quota checks', status: 'completed', route: '/login' },
  { name: 'Notice and file management', description: 'Notices CRUD with attachments; PDF/image OCR route for notices; legacy admin notices', status: 'completed', route: '/admin/notices' },
  { name: 'Practice & Examination System', description: 'Practice wizard (book → chapter → question type → mode) and attempt pages (exam mode with timer)', status: 'completed', route: '/practice' },
  { name: 'Seven question types', description: 'MCQ, fill in the blanks, true/false, matching, one word, rearrange, translation', status: 'completed', route: '/practice' },
  { name: 'Deterministic exam scoring', description: 'Backend evaluation of all question types with alternative answers and negative marking', status: 'completed', route: '/practice' },
  { name: 'Usage quotas and AI monitoring', description: 'Per-user AI quotas, admin token usage dashboard, global rate limiting (15 min windows)', status: 'completed', route: '/admin/tokens' },
  { name: 'Admin settings management', description: 'AI provider config (fast/balanced/accurate), prompt templates, system settings', status: 'completed', route: '/admin/ai-settings' },
  { name: 'Student UI and responsive design', description: 'Tutor, books, practice wizard, child-friendly pages, light/dark themes, mobile responsive', status: 'completed', route: '/tutor' },
  { name: 'Voice mode in chat', description: 'Speech input/output and mode selection in the chat composer', status: 'completed', route: '/tutor' },
  { name: 'Chat attachments', description: 'Image and PDF attachments in chat with vision-model support', status: 'completed', route: '/tutor' },
  { name: 'Live analytics dashboard (admin)', description: 'AI usage trends and token spend charts with real aggregate data', status: 'in_progress', route: '/admin/analytics' },
  { name: 'Public documentation site (/docs)', description: 'Live pitch deck, product overview, feature matrix, architecture and AI data flow diagrams, team, stats, search and exports', status: 'completed', route: '/docs' },
  { name: 'Vector / semantic search', description: 'Embeddings with hybrid ranking for improved retrieval (currently lexical keyword retrieval)', status: 'planned' },
  { name: 'Teacher-oriented features', description: 'Assignment management and classroom dashboards for teachers', status: 'planned' },
  { name: 'Additional classes and subjects', description: 'JSC and higher classes (Science, Higher Math), English and Bangla language lessons', status: 'planned' },
  { name: 'Personalized learning AI', description: 'Tutoring that adapts to individual students over time', status: 'planned' },
  { name: 'Multilingual UI', description: 'UI in Bangla and English with full translation coverage', status: 'completed', route: '/login' },
  { name: 'Learning analytics for students', description: 'Student progress dashboards and practice/exam analytics', status: 'planned' },
  { name: 'PDF export and Markdown export of documentation', description: 'Export the public documentation site as PDF (print) and Markdown', status: 'completed', route: '/docs' },
  { name: 'Version history and restore', description: 'Published version history with restore support', status: 'completed', route: '/docs' },
];

const ROADMAP: DocsDraft['roadmap'] = [
  ...[
    { item: 'Improve AI tutoring', description: 'Better retrieval ranking, citation quality and localized language handling.' },
    { item: 'Quality-of-life UX', description: 'Faster page loads, better dark mode, responsive tweaks across tablets and mobile.' },
    { item: 'Local infrastructure', description: 'Caching, CDN usage and redundancy for the Vercel deployment.' },
  ],
  ...[
    { item: 'Teacher-oriented features', description: 'Assignment management, classroom dashboards and teacher profiles.' },
    { item: 'More classes and subjects', description: 'JSC, Higher Secondary and additional language lessons for primary and secondary levels.' },
    { item: 'More question types', description: 'Additional question formats based on textbook structure.' },
  ],
  ...[
    { item: 'Personalized learning', description: 'Adaptive tutoring based on long-term student progress and learning gaps.' },
    { item: 'Scalable education infrastructure', description: 'Horizontal scaling, larger textbooks and multi-tenant support.' },
    { item: 'Student progress analytics', description: 'Learning path visualization and performance dashboards.' },
  ],
].map((entry, index): { category: DocsRoadmapCategory; item: string; description: string } => ({
  category: DOCS_ROADMAP_CATEGORIES[index < 3 ? 0 : index < 6 ? 1 : 2],
  item: entry.item,
  description: entry.description,
}));

const CHANGELOG: DocsDraft['changelog'] = [
  {
    version: '1.0.0',
    date: '2026-11-20',
    title: 'Initial documentation',
    items: [
      'Public /docs site with pitch deck, product overview, feature matrix, system architecture and AI data flow diagrams.',
      'Team Infyners management with the 3 confirmed members (Mesbahul Alam, MONIRUZZAMAN Shaon, Halima Tuz Sadia).',
      'Live analytics dashboard with real user, conversation, book, practice and AI usage statistics (secure aggregate endpoint).',
      'Editable feature matrix and roadmap managed via the admin Documentation CMS.',
      'Documentation publishing controls with enable/disable and scheduled windows (start/end, timezone-aware).',
      'Search, Markdown export and PDF (print) export for the documentation site.',
      'Changelog with version history and restore support.',
    ],
  },
];

export const SEED_TEAM_MEMBERS: DocsTeamMember[] = [
  { id: 'm-01', name: 'Mesbahul Alam', role: 'Team Lead', contact: '+880 1601860526', isConfirmed: true },
  { id: 'm-02', name: 'MONIRUZZAMAN Shaon', role: 'Member', contact: '+880 01744720796', isConfirmed: true },
  { id: 'm-03', name: 'Halima Tuz Sadia', role: 'Member', contact: '+880 01315027678', isConfirmed: true },
];

const TIMEZONES = ['Asia/Dhaka', 'Asia/Karachi', 'Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London'];

export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    return TIMEZONES.includes(timeZone) || new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}

/** Converts a date to a lexicographically comparable string in the given IANA timezone. */
export function localIso(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const hour = parts.hour && parts.hour !== '24' ? parts.hour : '00';
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/** Whether public /docs is accessible given settings and now (timezone-aware). */
export function isPublicAccessible(settings: DocsDraft['settings'], now: Date = new Date()): boolean {
  if (!settings?.enabled) return false;
  const timezone = settings.timezone && isValidTimezone(settings.timezone) ? settings.timezone : 'Asia/Dhaka';
  if (settings.start) {
    const start = new Date(settings.start);
    if (!Number.isNaN(start.getTime()) && localIso(now, timezone) < localIso(start, timezone)) return false;
  }
  if (settings.end) {
    const end = new Date(settings.end);
    if (!Number.isNaN(end.getTime()) && localIso(now, timezone) > localIso(end, timezone)) return false;
  }
  return true;
}

/** Public snapshot shape (exposes no drafts). */
export function toPublicContent(doc: DocumentationContentDoc): DocsDraft {
  return {
    pitchDeck: doc.pitchDeck ?? [],
    productOverview: doc.productOverview ?? [],
    featureMatrix: doc.featureMatrix ?? [],
    roadmap: doc.roadmap ?? [],
    teamMembers: doc.teamMembers ?? [],
    changelog: doc.changelog ?? [],
    settings: {
      enabled: doc.settings?.enabled !== false,
      start: doc.settings?.start ? new Date(doc.settings.start as Date).toISOString() : null,
      end: doc.settings?.end ? new Date(doc.settings.end as Date).toISOString() : null,
      timezone: doc.settings?.timezone || 'Asia/Dhaka',
    },
    draftVersion: Number(doc.draftVersion ?? 0),
    publishedVersion: Number(doc.publishedVersion ?? 0),
  } as DocsDraft;
}

function buildSeedDoc(): Partial<DocumentationContentDoc> {
  return {
    settings: { enabled: true, start: null, end: null, timezone: 'Asia/Dhaka' },
    pitchDeck: buildSeedPitchDeck(),
    productOverview: buildSeedProductOverview(),
    featureMatrix: FEATURE_MATRIX.map((row) => ({ ...row })),
    roadmap: ROADMAP.map((row) => ({ ...row })),
    teamMembers: SEED_TEAM_MEMBERS.map((member) => ({ ...member, avatarId: '', isConfirmed: member.isConfirmed })),
    changelog: CHANGELOG.map((entry) => ({ ...entry, items: [...entry.items] })),
    draftVersion: 1,
    publishedVersion: 0,
  };
}

/** Gets or lazily creates the single DocumentationContent document. */
export async function getDocsContentDoc(): Promise<DocumentationContentDoc> {
  const doc = (await DocumentationContentModel.findOne({}).lean()) as DocumentationContentDoc | null;
  if (doc) return doc;
  const seeded = (await DocumentationContentModel.findOneAndUpdate(
    {},
    { $setOnInsert: buildSeedDoc() as never },
    { upsert: true, new: true }
  )) as unknown as DocumentationContentDoc;

  // On first seed, publish version 1 so /docs is live immediately.
  const versionOneExists = await DocumentationVersionModel.countDocuments({ version: 1 });
  if (!versionOneExists) {
    const snapshot = {
      pitchDeck: seeded.pitchDeck ?? [],
      productOverview: seeded.productOverview ?? [],
      featureMatrix: seeded.featureMatrix ?? [],
      roadmap: seeded.roadmap ?? [],
      teamMembers: seeded.teamMembers ?? [],
      changelog: seeded.changelog ?? [],
    };
    await DocumentationVersionModel.create({ version: 1, content: snapshot, publishedBy: 'seed', publishedAt: new Date() });
    await DocumentationContentModel.updateOne({ _id: seeded._id }, { $set: { publishedVersion: 1, publishedBy: 'seed' } });
  }

  return seeded;
}

export interface DocsAdminState {
  doc: DocumentationContentDoc;
  publishedVersion: number;
  versions: Array<{ version: number; publishedBy: string; publishedAt: string }>;
  updatedBy: string;
  updatedAt: string;
}

export const docsContentService = {
  async getDraft(): Promise<DocsAdminState> {
    const doc = await getDocsContentDoc();
    const versions = (await DocumentationVersionModel.find({}, 'version publishedBy publishedAt')
      .sort({ version: -1 })
      .lean()) as unknown as DocumentationVersionDoc[];
    return {
      doc,
      publishedVersion: Number(doc.publishedVersion ?? 0),
      versions: versions.map((version) => ({
        version: Number(version.version),
        publishedBy: String(version.publishedBy ?? ''),
        publishedAt: new Date(version.publishedAt as Date).toISOString(),
      })),
      updatedBy: String(doc.updatedBy ?? ''),
      updatedAt: new Date(doc.updatedAt as Date).toISOString(),
    };
  },

  /**
   * Saves a draft patch: arrays are replaced by id so the admin can add,
   * edit and remove pitch deck sections, features, roadmap entries and
   * changelog entries.
   */
  async saveDraft(patch: Partial<DocsDraft> & { updatedBy?: string }) {
    const doc = await getDocsContentDoc();
    const update: Record<string, unknown> = {};
    if (patch.pitchDeck) update.pitchDeck = patch.pitchDeck;
    if (patch.productOverview) update.productOverview = patch.productOverview;
    if (patch.featureMatrix) update.featureMatrix = patch.featureMatrix;
    if (patch.roadmap) update.roadmap = patch.roadmap;
    if (patch.changelog) update.changelog = patch.changelog;
    update.draftVersion = Number(doc.draftVersion ?? 1) + 1;
    update.updatedBy = patch.updatedBy ?? String(doc.updatedBy ?? '');
    await DocumentationContentModel.updateOne({ _id: doc._id }, { $set: update });
    return this.getDraft();
  },

  async publish(adminUserEmail: string) {
    const doc = await getDocsContentDoc();
    const version = Number(doc.publishedVersion ?? 0) + 1;
    const snapshot = {
      pitchDeck: doc.pitchDeck ?? [],
      productOverview: doc.productOverview ?? [],
      featureMatrix: doc.featureMatrix ?? [],
      roadmap: doc.roadmap ?? [],
      teamMembers: doc.teamMembers ?? [],
      changelog: doc.changelog ?? [],
    };
    await DocumentationVersionModel.create({
      version,
      content: snapshot,
      publishedBy: adminUserEmail,
      publishedAt: new Date(),
    });
    await DocumentationContentModel.updateOne(
      { _id: doc._id },
      { $set: { publishedVersion: version, publishedAt: new Date(), publishedBy: adminUserEmail, updatedBy: adminUserEmail } }
    );
    log.info('Documentation published', { version, admin: adminUserEmail });
    return this.getDraft();
  },

  async unpublish() {
    await DocumentationContentModel.updateOne({}, { $set: { 'settings.enabled': false } });
    return this.getDraft();
  },

  async setPublishingEnabled(enabled: boolean) {
    const doc = await getDocsContentDoc();
    await DocumentationContentModel.updateOne({ _id: doc._id }, { $set: { 'settings.enabled': enabled } });
    return this.getDraft();
  },

  async setSchedule(schedule: { start: Date | null; end: Date | null; timezone: string }) {
    const doc = await getDocsContentDoc();
    await DocumentationContentModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          'settings.start': schedule.start,
          'settings.end': schedule.end,
          'settings.timezone': schedule.timezone,
        },
      }
    );
    return this.getDraft();
  },

  async listVersions() {
    const versions = (await DocumentationVersionModel.find({}, 'version publishedBy publishedAt').sort({ version: -1 }).lean()) as unknown as DocumentationVersionDoc[];
    return versions.map((version) => ({
      version: Number(version.version),
      publishedBy: String(version.publishedBy ?? ''),
      publishedAt: new Date(version.publishedAt as Date).toISOString(),
      content: (version.content as DocsDraft) ?? null,
    }));
  },

  async restoreVersion(versionNumber: number, adminUserEmail: string) {
    const version = (await DocumentationVersionModel.findOne({ version: versionNumber }).lean()) as DocumentationVersionDoc | null;
    if (!version) throw Object.assign(new Error('Version not found'), { statusCode: 404 });    const doc = await getDocsContentDoc();
    await DocumentationContentModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          pitchDeck: version.content?.pitchDeck ?? [],
          productOverview: version.content?.productOverview ?? [],
          featureMatrix: version.content?.featureMatrix ?? [],
          roadmap: version.content?.roadmap ?? [],
          changelog: version.content?.changelog ?? [],
          teamMembers: version.content?.teamMembers ?? doc.teamMembers ?? [],
          draftVersion: Math.max(Number(doc.draftVersion ?? 1), versionNumber) + 1,
          updatedBy: adminUserEmail,
        },
      }
    );
    return this.getDraft();
  },

  /* ---------------- Team ---------------- */

  async addTeamMember(patch: { name: string; role: string; contact: string; avatarId?: string }): Promise<DocsAdminState & { member: DocsTeamMember | null }> {
    const doc = await getDocsContentDoc();
    const members = [...(doc.teamMembers ?? [])];
    const numericSuffixes = members
      .map((member) => Number(String(member.id).match(/^m-(\d+)$/)?.[1] ?? '0'))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const nextIndex = numericSuffixes.length ? numericSuffixes[numericSuffixes.length - 1] + 1 : members.length + 1;
    const member: DocsTeamMember = {
      id: `m-${String(nextIndex).padStart(2, '0')}`,
      name: patch.name,
      role: patch.role,
      contact: patch.contact,
      avatarId: patch.avatarId ?? '',
      isConfirmed: false,
    };
    await DocumentationContentModel.updateOne({ _id: doc._id }, { $set: { teamMembers: [...members, member] } });
    const state = await this.getDraft();
    return { ...state, member: members.find((candidate) => candidate.id === member.id) ?? member };
  },

  async updateTeamMember(memberId: string, patch: { name?: string; role?: string; contact?: string; avatarId?: string }) {
    const doc = await getDocsContentDoc();
    const members = (doc.teamMembers ?? []).map((member) =>
      member.id === memberId ? { ...member, ...patch, avatarId: patch.avatarId ?? member.avatarId } : member
    );
    await DocumentationContentModel.updateOne({ _id: doc._id }, { $set: { teamMembers: members } });
    const state = await this.getDraft();
    return { member: members.find((member) => member.id === memberId) ?? null, versions: state.versions, publishedVersion: state.publishedVersion };
  },

  async deleteTeamMember(memberId: string) {
    const doc = await getDocsContentDoc();
    const member = (doc.teamMembers ?? []).find((candidate) => candidate.id === memberId);
    if (!member) throw Object.assign(new Error('Team member not found'), { statusCode: 404 });
    if (member.isConfirmed) {
      throw Object.assign(new Error('Confirmed team members cannot be removed'), { statusCode: 409 });
    }
    if (member.avatarId) {
      const { deleteGridFSFile } = await import('../../config/gridfs');
      void deleteGridFSFile(member.avatarId as never).catch(() => undefined);
    }
    const members = (doc.teamMembers ?? []).filter((candidate) => candidate.id !== memberId);
    await DocumentationContentModel.updateOne({ _id: doc._id }, { $set: { teamMembers: members } });
    return { deleted: true, remaining: members.length };
  },

  async getPublicContent() {
    const doc = await getDocsContentDoc();
    return toPublicContent(doc);
  },

  async getPublicMeta() {
    const doc = await getDocsContentDoc();
    const accessible = isPublicAccessible(doc.settings ?? {});
    const settings = doc.settings ?? {};
    return {
      accessible,
      enabled: settings.enabled !== false,
      version: Number(doc.publishedVersion ?? 0),
      window: {
        start: settings.start ? new Date(settings.start as Date).toISOString() : null,
        end: settings.end ? new Date(settings.end as Date).toISOString() : null,
        timezone: settings.timezone || 'Asia/Dhaka',
      },
      updatedAt: new Date(doc.updatedAt as Date).toISOString(),
    };
  },

  /** Returns the published snapshot, or throws a status error. */
  async getPublicSnapshot(): Promise<DocsDraft> {
    const doc = await getDocsContentDoc();
    if (!isPublicAccessible(doc.settings ?? {})) {
      throw Object.assign(new Error('Documentation is not available right now.'), { statusCode: 403 });
    }
    const publishedVersion = Number(doc.publishedVersion ?? 0);
    if (publishedVersion === 0) {
      throw Object.assign(new Error('Documentation is not published yet.'), { statusCode: 404 });
    }
    const version = (await DocumentationVersionModel.findOne({ version: publishedVersion }).lean()) as DocumentationVersionDoc | null;
    if (version) return version.content as DocsDraft;
    // Self-healing fallback: the version record is missing (e.g. pruned);
    // the doc itself is the published snapshot.
    return {
      pitchDeck: doc.pitchDeck ?? [],
      productOverview: doc.productOverview ?? [],
      featureMatrix: doc.featureMatrix ?? [],
      roadmap: doc.roadmap ?? [],
      teamMembers: doc.teamMembers ?? [],
      changelog: doc.changelog ?? [],
      settings: {
        enabled: doc.settings?.enabled !== false,
        start: doc.settings?.start ? new Date(doc.settings.start as Date).toISOString() : null,
        end: doc.settings?.end ? new Date(doc.settings.end as Date).toISOString() : null,
        timezone: doc.settings?.timezone || 'Asia/Dhaka',
      },
      draftVersion: Number(doc.draftVersion ?? 0),
      publishedVersion,
    } as DocsDraft;
  },
};

export default docsContentService;
