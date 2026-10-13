import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler, fail } from '../../../utils/response.utils';
import messageService from './message.service';
import { streamWithFallback } from '../../../services/ai/provider-router';
import quotaService from '../../../services/quota.service';
import { deleteChatAttachments } from '../../../services/attachment.service';
import { estimateCostUsd, estimateTokens } from '../../../utils/text.utils';
import { log } from '../../../config/logger';

const DB_SAVE_THROTTLE_MS = 700;

function writeEvent(res: Response, event: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Streams an AI response to the client over SSE while persisting
 * progress to MongoDB (throttled) and recording token usage.
 */
async function streamAiResponse(
  res: Response,
  prepared: Awaited<ReturnType<typeof messageService.prepareNewMessage>>,
  userId: string,
  conversationId: string,
  role?: string
): Promise<void> {
  const assistantId = prepared.assistantMessage._id;
  const requestType = 'chat';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const abortController = new AbortController();
  const onClose = () => abortController.abort();
  res.on('close', onClose);

  writeEvent(res, {
    type: 'start',
    messageId: String(assistantId),
    conversationId,
  });

  let content = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let model = '';
  let actualProvider = '';
  let actualModel = '';
  let finishReason = 'stop';
  let lastDbSave = Date.now();

  const saveSnapshot = async () => {
    const nowTime = Date.now();
    if (nowTime - lastDbSave < DB_SAVE_THROTTLE_MS) return;
    lastDbSave = nowTime;
    await messageService.finalizeMessage(assistantId, {
      content,
      status: 'streaming',
      model: model || undefined,
    });
  };

  const sourceItems = (prepared.context?.searchResults || []).slice(0, 3).map((item) => {
    const source = item as {
      _id?: unknown;
      title?: string;
      category?: string;
      fileUrl?: string | null;
      fullNoticeUrl?: string | null;
      mimeType?: string | null;
    };
    return {
      noticeId: source._id,
      title: source.title || '',
      category: source.category || '',
      fileUrl: source.fileUrl ?? null,
      fullNoticeUrl: source.fullNoticeUrl ?? null,
      mimeType: source.mimeType ?? null,
    };
  });

  writeEvent(res, {
    type: 'citations',
    citations: prepared.context?.citations || [],
    sources: sourceItems,
  });

  try {
    await messageService.markStreaming(assistantId);

    for await (const chunk of streamWithFallback(prepared.openRouterMessages as never, {
      signal: abortController.signal,
      model: prepared.model || undefined,
    })) {
      if (chunk.type === 'token' && chunk.content) {
        content += chunk.content;
        writeEvent(res, { type: 'token', content: chunk.content });
        if (content.length % 240 < 40) {
          await saveSnapshot();
        }
        continue;
      }

      if (chunk.type === 'done') {
        finishReason = chunk.finishReason || 'stop';
        if (chunk.usage) {
          promptTokens = chunk.usage.promptTokens || 0;
          completionTokens = chunk.usage.completionTokens || 0;
          totalTokens = chunk.usage.totalTokens || 0;
        }
        if (chunk.provider) model = model || '';
        actualProvider = chunk.provider || actualProvider;
        actualModel = (chunk.model as string) || actualModel;
        break;
      }

      if (chunk.type === 'error') {
        throw new Error(chunk.error || 'AI request failed');
      }
    }

    // Fallback token accounting when the provider omitted usage.
    if (totalTokens === 0) {
      promptTokens = prepared.estimatedPromptTokens;
      completionTokens = estimateTokens(content);
      totalTokens = promptTokens + completionTokens;
    }

    model = actualModel || prepared.model || model;

    const stopped = abortController.signal.aborted;
    const status = stopped ? 'stopped' : 'complete';

    // Server-side log of the actual generating provider/model (never sent to children).
    log.info('Chat stream complete', {
      provider: actualProvider || 'unknown',
      model,
      conversationId,
    });

    await messageService.finalizeMessage(assistantId, {
      content,
      status,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      sources: sourceItems,
      citations: prepared.context?.citations || [],
    });

    await quotaService.recordUsage({
      userId: new Types.ObjectId(userId),
      conversationId: new Types.ObjectId(conversationId),
      messageId: assistantId,
      model,
      promptTokens,
      completionTokens,
      requestType,
    });

    const quota = await quotaService.getStatus(userId, role);

    writeEvent(res, {
      type: 'usage',
      promptTokens,
      completionTokens,
      totalTokens,
      remaining: quota.daily.remaining,
      dailyLimit: quota.daily.limit,
      dailyUsed: quota.daily.used,
      exhausted: quota.exhausted,
    });

    writeEvent(res, {
      type: 'done',
      messageId: String(assistantId),
      status,
      finishReason,
      model,
    });
  } catch (error) {
    const err = error as Error;
    // Full error stays server-side; children get a friendly message.
    log.error('Stream failed', { message: err.message });

    const stopped = abortController.signal.aborted;
    const friendly = /rate|429|quota|limit/i.test(err.message)
      ? 'Too many requests right now. Please wait a moment and try again.'
      : /timed out|timeout/i.test(err.message)
        ? 'The answer is taking too long. Please try again.'
        : 'I had trouble answering. Please try again.';

    await messageService.finalizeMessage(assistantId, {
      content: content || friendly,
      status: stopped ? 'stopped' : 'error',
      model: model || undefined,
      errorMessage: stopped ? null : err.message,
      sources: sourceItems,
      citations: prepared.context?.citations || [],
    });

    if (!stopped) {
      if (!content) {
        writeEvent(res, { type: 'token', content: friendly });
      }
      writeEvent(res, { type: 'error', message: friendly });
    }
    writeEvent(res, { type: 'done', messageId: String(assistantId), status: stopped ? 'stopped' : 'error' });
  } finally {
    // Temporary attachments are single-use: free their memory as soon as the
    // response finishes (success, error, or aborted). Nothing is stored.
    if (prepared.attachmentIds.length) {
      deleteChatAttachments(prepared.attachmentIds, userId);
    }
    res.removeListener('close', onClose);
    res.end();
  }
}

export const messageController = {
  /** Sends a message and streams the assistant's reply (SSE). */
  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const { content, language, mode, attachments } = req.body;

    const prepared = await messageService.prepareNewMessage({
      conversationId,
      userId: req.user!.id,
      content,
      language,
      mode,
      attachments,
    });

    await quotaService.assertCanUseAI(req.user!.id, prepared.estimatedPromptTokens, req.user!.role);

    await streamAiResponse(res, prepared, req.user!.id, conversationId, req.user!.role);
  }),

  /** Regenerates a previous assistant response (SSE). */
  regenerate: asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const { messageId, language, mode } = req.body;

    const prepared = await messageService.prepareRegenerate({
      conversationId,
      userId: req.user!.id,
      messageId,
      language,
      mode,
    });

    await quotaService.assertCanUseAI(req.user!.id, prepared.estimatedPromptTokens, req.user!.role);

    await streamAiResponse(res, prepared, req.user!.id, conversationId, req.user!.role);
  }),

  /** Continues the last assistant response (SSE). */
  continue: asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const { language, mode } = req.body;

    const prepared = await messageService.prepareContinue({
      conversationId,
      userId: req.user!.id,
      language,
      mode,
    });

    await quotaService.assertCanUseAI(req.user!.id, prepared.estimatedPromptTokens, req.user!.role);

    await streamAiResponse(res, prepared, req.user!.id, conversationId, req.user!.role);
  }),

  /** Like / dislike feedback on an assistant message. */
  feedback: asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, messageId } = req.params;

    const saved = await messageService.submitFeedback({
      conversationId,
      userId: req.user!.id,
      messageId,
      type: req.body.type,
      comment: req.body.comment,
    });

    if (!saved) return fail(res, 404, 'Message not found');
    res.json({ success: true, message: 'Feedback saved' });
  }),

  /** Token usage status for the authenticated user. */
  usage: asyncHandler(async (req: Request, res: Response) => {
    const status = await quotaService.getStatus(req.user!.id, req.user!.role);
    const cost = estimateCostUsd(status.daily.used);
    res.json({ success: true, usage: { ...status, estimatedDailyCostUsd: cost } });
  }),
};

export default messageController;
