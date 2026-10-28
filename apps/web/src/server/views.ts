import type { Conversation } from './types';

/** O que o navegador do funcionário pode ver da conversa (sem memória interna do agent). */
export function publicConversation(c: Conversation) {
  return {
    id: c.id,
    state: c.state,
    userMessageCount: c.userMessageCount,
    hasPendingDraft: Boolean(c.pendingDraft),
    transfer: c.transfer ? { queue: c.transfer.queue, reason: c.transfer.reason } : null,
  };
}

export type PublicConversation = ReturnType<typeof publicConversation>;
