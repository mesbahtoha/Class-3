import {
  AIUsageModel,
  BookModel,
  ChatLogModel,
  ConversationModel,
  DocumentationContentModel,
  DocumentationVersionModel,
  MessageModel,
  PracticeAttemptModel,
  PracticeQuestionSetModel,
  RefreshTokenModel,
  UserModel,
} from '../../database/models';
import { createTtlCache } from '../../utils/cache';

/**
 * Secure aggregate statistics for the public documentation site.
 * Privacy: only counts of aggregates are exposed — never user PII,
 * private conversations, credentials or sensitive records.
 * Any failing metric is reported as `unavailable` with the metric name;
 * `null` means "not reported yet" (zero vs unavailable is distinct).
 */

const CACHE = createTtlCache<PublicDocStats>(5000);

export interface PublicDocStats {
  totalRegisteredUsers: number | null;
  totalConversations: number | null;
  totalMessages: number | null;
  totalPublishedBooks: number | null;
  totalPracticeExamAttempts: number | null;
  totalPublishedPracticeSets: number | null;
  totalAIUsageRecords: number | null;
  /** Users with a current refresh session (recently active proxy). */
  activeUsers: number | null;
  unavailable: boolean;
  metricsUnavailable: string[];
  generatedAt: string;
}

async function safeCount(fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function safeActiveUserIds(): Promise<number | null> {
  try {
    const ids = (await RefreshTokenModel.distinct('userId', { expiresAt: { $gt: new Date() } })) as unknown as string[];
    return ids.length;
  } catch {
    return null;
  }
}

export const docsStatsService = {
  async getStats(): Promise<PublicDocStats> {
    const cached = CACHE.get('stats');
    if (cached) return cached;

    const [
      totalRegisteredUsers,
      totalConversations,
      totalMessages,
      totalPublishedBooks,
      totalPracticeExamAttempts,
      totalPublishedPracticeSets,
      totalAIUsageRecords,
      activeUsers,
    ] = await Promise.all([
      safeCount(() => UserModel.countDocuments({})),
      safeCount(() => ConversationModel.countDocuments({})),
      safeCount(() => MessageModel.countDocuments({})),
      safeCount(() => BookModel.countDocuments({ publicationState: 'published' })),
      safeCount(() => PracticeAttemptModel.countDocuments({})),
      safeCount(() => PracticeQuestionSetModel.countDocuments({ publicationState: 'published' })),
      safeCount(() => AIUsageModel.countDocuments({})),
      safeActiveUserIds(),
    ]);

    const metricsUnavailable = [
      ['totalRegisteredUsers', totalRegisteredUsers === null],
      ['totalConversations', totalConversations === null],
      ['totalMessages', totalMessages === null],
      ['totalPublishedBooks', totalPublishedBooks === null],
      ['totalPracticeExamAttempts', totalPracticeExamAttempts === null],
      ['totalPublishedPracticeSets', totalPublishedPracticeSets === null],
      ['totalAIUsageRecords', totalAIUsageRecords === null],
      ['activeUsers', activeUsers === null],
    ]
      .filter(([, missing]) => missing)
      .map(([name]) => name);

    const stats: PublicDocStats = {
      totalRegisteredUsers: totalRegisteredUsers ?? null,
      totalConversations: totalConversations ?? null,
      totalMessages: totalMessages ?? null,
      totalPublishedBooks: totalPublishedBooks ?? null,
      totalPracticeExamAttempts: totalPracticeExamAttempts ?? null,
      totalPublishedPracticeSets: totalPublishedPracticeSets ?? null,
      totalAIUsageRecords: totalAIUsageRecords ?? null,
      activeUsers: activeUsers ?? null,
      unavailable: metricsUnavailable.length > 0,
      metricsUnavailable: metricsUnavailable as string[],
      generatedAt: new Date().toISOString(),
    };

    CACHE.set('stats', stats);
    return stats;
  },
};

export default docsStatsService;
