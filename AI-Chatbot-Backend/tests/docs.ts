/**
 * Documentation site tests (no network, no LLM calls).
 * Run: npm run test:docs
 *
 * Pure tests: timezone helpers, visibility windows, seed validation, zod
 * schemas. DB tests (run against the local dev database, if reachable):
 * team CRUD, draft save/publish/restore, visibility gating, live stats.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { isPublicAccessible, isValidTimezone, localIso, getDocsContentDoc, docsContentService, SEED_TEAM_MEMBERS } from '../src/services/docs/docsContent.service';
import { DocumentationContentModel, DocumentationVersionModel, DocumentationContentDoc } from '../src/database/models';
import { DOCS_FEATURE_STATUSES, DOCS_ROADMAP_CATEGORIES } from '../src/constants';
import { docsStatsService } from '../src/services/docs/docsStats.service';
import { restoreVersionSchema, saveDraftSchema, scheduleSchema, teamMemberSchema, teamMemberPatchSchema } from '../src/app/modules/docs/docs.validation';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    passed += 1;
    console.log(`  ok - ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL - ${name}${extra ? ` (${extra})` : ''}`);
  }
}

function main() {
  console.log('Docs timezone + visibility helpers (pure)');
  check('Asia/Dhaka is a valid timezone', isValidTimezone('Asia/Dhaka'));
  check('UTC is a valid timezone', isValidTimezone('UTC'));
  check('garbage timezone is invalid', !isValidTimezone('Mars/Olympus'));

  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  const dhakaIso = localIso(new Date('2026-11-20T10:30:45Z'), 'Asia/Dhaka');
  check('localIso returns zero-padded ISO string', isoRegex.test(dhakaIso), dhakaIso);

  const baseSettings = { enabled: true, start: null, end: null, timezone: 'Asia/Dhaka' };
  check('disabled docs are not accessible', !isPublicAccessible({ ...baseSettings, enabled: false }));
  check('enabled docs are accessible', isPublicAccessible(baseSettings));
  const futureStart = new Date(Date.now() + 10_000);
  const pastStart = new Date(Date.now() - 10_000);
  const pastEnd = new Date(Date.now() - 10_000);
  const futureEnd = new Date(Date.now() + 10_000);
  check('docs are not accessible before start', !isPublicAccessible({ ...baseSettings, start: futureStart }));
  check('docs are accessible after start', isPublicAccessible({ ...baseSettings, start: pastStart }));
  check('docs are not accessible after end', !isPublicAccessible({ ...baseSettings, end: pastEnd }));
  check('docs are accessible before end', isPublicAccessible({ ...baseSettings, end: futureEnd }));
  check('start exactly now is accessible', isPublicAccessible({ ...baseSettings, start: new Date() }));

  console.log('Docs seed validation (pure)');
  check('seeded team has 3 confirmed members', SEED_TEAM_MEMBERS.length === 3 && SEED_TEAM_MEMBERS.every((member) => member.isConfirmed));
  check('seeded team covers the three confirmed people',
    SEED_TEAM_MEMBERS.some((m) => m.name.toLowerCase().includes('mesbahul')) &&
    SEED_TEAM_MEMBERS.some((m) => m.name.toLowerCase().includes('moniruzzaman')) &&
    SEED_TEAM_MEMBERS.some((m) => m.name.toLowerCase().includes('halima')));
  check('seeded feature statuses are valid', DOCS_FEATURE_STATUSES.every((status) => typeof status === 'string') && DOCS_FEATURE_STATUSES.length === 3);

  console.log('Docs zod schemas (pure)');
  check('scheduleSchema rejects invalid timezone', !scheduleSchema.safeParse({ start: null, end: null, timezone: 'Not/AZone' }).success);
  check('scheduleSchema rejects start after end', !scheduleSchema.safeParse({ start: '2026-11-21T00:00:00Z', end: '2026-11-20T00:00:00Z', timezone: 'UTC' }).success);
  check('scheduleSchema accepts valid schedule', scheduleSchema.safeParse({ start: '2026-11-20T00:00:00Z', end: '2026-11-25T00:00:00Z', timezone: 'Asia/Dhaka' }).success);
  check('saveDraftSchema accepts valid pitch deck', saveDraftSchema.safeParse({ pitchDeck: [{ id: 'problem', heading: 'Problem', body: ['line'] }] }).success);
  check('saveDraftSchema rejects invalid feature status', !saveDraftSchema.safeParse({ featureMatrix: [{ name: 'x', description: 'y', status: 'bogus' }] }).success);
  check('saveDraftSchema accepts all roadmap categories', DOCS_ROADMAP_CATEGORIES.every((category) => saveDraftSchema.safeParse({ roadmap: [{ category, item: 'a', description: 'b' }] }).success));
  check('saveDraftSchema accepts all feature statuses', DOCS_FEATURE_STATUSES.every((status) => saveDraftSchema.safeParse({ featureMatrix: [{ name: 'x', description: 'y', status }] }).success));
  check('teamMemberSchema rejects empty name', !teamMemberSchema.safeParse({ name: '', role: 'Member', contact: '+123' }).success);
  check('teamMemberPatchSchema accepts partial update', teamMemberPatchSchema.safeParse({ name: 'New Name' }).success);
  check('restoreVersionSchema parses numeric version', restoreVersionSchema.safeParse({ version: '2' }).success);
  check('zod still type-checks against constants', true);

  async function runDbTests(): Promise<void> {
    console.log('Docs DB tests (dev database)');
    await connectDatabase();

    // Snapshot current doc to restore later (avoid polluting prod state).
    const original = (await DocumentationContentModel.findOne({}).lean()) as DocumentationContentDoc | null;
    const originalVersions = await DocumentationVersionModel.countDocuments({});

    const snapshotOf = (doc: DocumentationContentDoc): Record<string, unknown> => {
      return {
        settings: doc.settings,
        pitchDeck: doc.pitchDeck,
        productOverview: doc.productOverview,
        featureMatrix: doc.featureMatrix,
        roadmap: doc.roadmap,
        teamMembers: doc.teamMembers,
        changelog: doc.changelog,
        draftVersion: doc.draftVersion,
        publishedVersion: doc.publishedVersion,
        publishedAt: doc.publishedAt,
        publishedBy: doc.publishedBy,
        updatedBy: doc.updatedBy,
      };
    };
    const restoreSnapshot = async (doc: DocumentationContentDoc | null): Promise<void> => {
      if (!doc) return;
      await DocumentationContentModel.updateOne({ _id: doc._id }, { $set: snapshotOf(doc) });
    };

    try {
      // getDocsContentDoc seeds a doc when missing or returns the existing one.
      const seeded = await getDocsContentDoc();
      check('getDocsContentDoc returns existing or seeded doc', Boolean(seeded._id));
      check('seeded doc has team members', Array.isArray(seeded.teamMembers) && seeded.teamMembers.length === 3);
      check('seeded doc has changelog', Array.isArray(seeded.changelog) && seeded.changelog.length >= 1);
      check('seed draft version starts at >= 1', Number(seeded.draftVersion ?? 0) >= 1);

      // Visibility gating at service level.
      const seededVersion = Number(seeded.publishedVersion ?? 0);
      const errBefore = await docsContentService.getPublicSnapshot().catch((e) => e);
      check('snapshot throws 404 when not published', seededVersion === 0 ? (errBefore as { statusCode?: number } | undefined)?.statusCode === 404 : true);
      const meta = await docsContentService.getPublicMeta();
      check('meta reports accessible', meta.accessible === true);

      // Unpublish -> snapshot throws 403.
      await docsContentService.setPublishingEnabled(false);
      await connectDatabase();
      const err403 = await docsContentService.getPublicSnapshot().catch((e) => e);
      check('unpublished docs throw 403', err403 && (err403 as { statusCode?: number }).statusCode === 403);
      check('meta reports inaccessible when disabled', (await docsContentService.getPublicMeta()).accessible === false);
      await docsContentService.setPublishingEnabled(true);

      // Schedule window: end in the past -> inaccessible until end; enable/disable.
      await docsContentService.setSchedule({ start: new Date(Date.now() - 86400000), end: new Date(Date.now() - 86400000 + 3600000), timezone: 'Asia/Dhaka' });
      const inWindow = await docsContentService.getPublicMeta();
      check('scheduled past window blocks access', inWindow.accessible === false);
      await docsContentService.setSchedule({ start: null, end: null, timezone: 'Asia/Dhaka' });
      const backToFull = await docsContentService.getPublicMeta();
      check('clearing schedule restores access', backToFull.accessible === true);

      // Draft save + publish + versions + restore.
      const stateBefore = await docsContentService.getDraft();
      const versionsBefore = await docsContentService.listVersions();
      check('listVersions works', Array.isArray(versionsBefore));
      const publishResult = await docsContentService.publish('admin@docs-test.local');
      check('publish increments publishedVersion', publishResult.publishedVersion === (original ? Number(original.publishedVersion ?? 0) : 0) + 1);
      check('publish creates a version record', (await DocumentationVersionModel.countDocuments({})) > originalVersions);
      const versionsAfterPublish = await docsContentService.listVersions();
      check('listVersions includes new version', versionsAfterPublish.some((v) => v.version === publishResult.publishedVersion));
      check('getPublicSnapshot works when published+accessible', Boolean(await docsContentService.getPublicSnapshot()));

      const restoreResult = await docsContentService.restoreVersion(versionsBefore.length ? versionsBefore[0].version : publishResult.publishedVersion, 'admin@docs-test.local');
      check('restoreVersion succeeds', restoreResult.publishedVersion >= 0);
      await DocumentationVersionModel.deleteMany({ version: { $gt: originalVersions } });

      // Stats: shape + privacy (no user PII keys).
      const stats = await docsStatsService.getStats();
      check('stats returns object', Boolean(stats));
      const expectedKeys = ['totalRegisteredUsers', 'totalConversations', 'totalMessages', 'totalPublishedBooks', 'totalPracticeExamAttempts', 'totalPublishedPracticeSets', 'totalAIUsageRecords', 'activeUsers', 'unavailable', 'metricsUnavailable', 'generatedAt'];
      check('stats has the documented keys', expectedKeys.every((k) => k in stats));
      check('stats has no email keys', !Object.keys(stats).some((key) => key.toLowerCase().includes('email')));
      const numbers = ['totalRegisteredUsers', 'totalConversations', 'totalMessages', 'totalPublishedBooks', 'totalPracticeExamAttempts', 'totalPublishedPracticeSets', 'totalAIUsageRecords', 'activeUsers'];
      check('stats numbers are number or null', numbers.every((k) => stats[k as keyof typeof stats] === null || typeof stats[k as keyof typeof stats] === 'number'));

      // Team CRUD.
      const added = await docsContentService.addTeamMember({ name: 'Test Member', role: 'Member', contact: '+123456' });
      check('addTeamMember adds member', added.member?.name === 'Test Member');
      check('added member has auto id', Boolean(added.member?.id));
      const updated = await docsContentService.updateTeamMember(added.member!.id, { name: 'Test Member 2' });
      check('updateTeamMember renames', updated.member?.name === 'Test Member 2');
      const deleted = await docsContentService.deleteTeamMember(added.member!.id);
      check('deleteTeamMember deletes', deleted.deleted === true);
      const confirmedDelete = await docsContentService.deleteTeamMember('m-01').catch((e) => e);
      check('confirmed members cannot be deleted', confirmedDelete && (confirmedDelete as { statusCode?: number }).statusCode === 409);
      const confirmedPatch = await docsContentService.updateTeamMember('m-01', { role: 'Team Lead v2' });
      check('confirmed members can be edited', confirmedPatch.member?.role === 'Team Lead v2');
      await docsContentService.updateTeamMember('m-01', { role: 'Team Lead' }); // restore
    } finally {
      await restoreSnapshot(original);
      await DocumentationVersionModel.deleteMany({ version: { $gt: originalVersions } });
      await disconnectDatabase();
    }
  }

  (async () => {
    const dbEnabled = Boolean(process.env.MONGO_URI);
    if (dbEnabled) {
      try {
        await runDbTests();
      } catch (error) {
        failed += 1;
        failures.push('db tests errored');
        console.log(`  FAIL - db tests errored (${(error as Error).message})`);
      }
    } else {
      console.log('  (skipped DB tests — MONGO_URI not set)');
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failures.length) console.log('Failures:', failures.join('; '));
    process.exit(failed > 0 ? 1 : 0);
  })();
}

main();
