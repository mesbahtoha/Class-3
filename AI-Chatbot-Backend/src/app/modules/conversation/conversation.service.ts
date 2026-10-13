import { Types } from 'mongoose';
import { conversationRepository } from '../../../repositories/conversation.repository';
import { messageRepository } from '../../../repositories/message.repository';
import { generateRandomToken } from '../../../utils/token.utils';
import { UserModel } from '../../../database/models/User.model';

/**
 * Conversation service - CRUD, export and sharing of chat threads.
 */
export const conversationService = {
  async listForUser(userId: string, options: { search?: string; page?: number; limit?: number }) {
    return conversationRepository.listByUser(userId, options);
  },

  async create(userId: string, title?: string) {
    return conversationRepository.create({
      userId: new Types.ObjectId(userId),
      title,
    });
  },

  async getOwned(conversationId: string, userId: string) {
    return conversationRepository.findOwned(conversationId, userId);
  },

  async getWithMessages(conversationId: string, userId: string, options: { limit?: number; before?: Date }) {
    const conversation = await conversationRepository.findOwned(conversationId, userId);
    if (!conversation) return null;

    const messages = await messageRepository.listByConversation(conversation._id, {
      limit: options.limit,
      before: options.before,
    });

    return { conversation, messages };
  },

  async update(
    conversationId: string,
    userId: string,
    data: { title?: string; pinned?: boolean; isArchived?: boolean }
  ) {
    const conversation = await conversationRepository.findOwned(conversationId, userId);
    if (!conversation) return null;

    return conversationRepository.update(conversation._id, data);
  },

  async delete(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await conversationRepository.findOwned(conversationId, userId);
    if (!conversation) return false;

    await messageRepository.deleteByConversation(conversation._id);
    await conversationRepository.delete(conversation._id);
    return true;
  },

  async clearAll(userId: string): Promise<number> {
    // Bulk deletes: one statement per collection instead of one per conversation.
    const [conversationCount, messageCount] = await Promise.all([
      conversationRepository.deleteManyByUser(userId),
      messageRepository.deleteManyByUser(userId),
    ]);
    return conversationCount + messageCount;
  },

  async exportChat(conversationId: string, userId: string, format: 'json' | 'markdown') {
    const conversation = await conversationRepository.findOwned(conversationId, userId);
    if (!conversation) return null;

    const messages = await messageRepository.listByConversation(conversation._id, { limit: 500 });

    if (format === 'markdown') {
      const lines: string[] = [];
      lines.push(`# ${conversation.title}`);
      lines.push('');
      lines.push(`*Exported on ${new Date().toISOString()}*`);
      lines.push('');

      for (const message of messages) {
        const author = message.role === 'user' ? '**You**' : '**Assistant**';
        lines.push(`${author}:`);
        lines.push('');
        lines.push(message.content || '*(empty)*');
        lines.push('');
        lines.push('NEXT MESSAGE');
        lines.push('');
      }

      return { conversation, content: lines.join('\n'), format: 'markdown' };
    }

    return {
      conversation,
      content: JSON.stringify(
        {
          title: conversation.title,
          exportedAt: new Date().toISOString(),
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            model: m.model,
            createdAt: m.createdAt,
            feedback: m.feedback,
          })),
        },
        null,
        2
      ),
      format: 'json',
    };
  },

  /** Creates or removes a public share link for a conversation. */
  async toggleShare(conversationId: string, userId: string, enabled: boolean) {
    const conversation = await conversationRepository.findOwned(conversationId, userId);
    if (!conversation) return null;

    if (!enabled) {
      await conversationRepository.setShareToken(conversation._id, null);
      return { shareToken: null, shareUrl: null };
    }

    let token = conversation.shareToken;
    if (!token) {
      token = generateRandomToken(16);
      await conversationRepository.setShareToken(conversation._id, token);
    }

    return { shareToken: token, shareUrl: `/share/${token}` };
  },

  /** Public: reads a shared conversation (no auth required). */
  async getShared(token: string) {
    const conversation = await conversationRepository.findByShareToken(token);
    if (!conversation) return null;

    const messages = await messageRepository.listByConversation(conversation._id, { limit: 500 });
    const user = await UserModel.findById(conversation.userId).lean();

    return {
      title: conversation.title,
      ownerName: user?.name || 'Anonymous',
      createdAt: conversation.createdAt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };
  },
};

export default conversationService;
