import type { ActionStep, Card, ConversationState, Decision } from '@nexo/core';

/** Formatos que chegam da API (espelham apps/web/src/server/types.ts). */
export interface UiMessage {
  id: string;
  role: 'user' | 'agent' | 'analyst' | 'system';
  authorName: string;
  text: string;
  actions: ActionStep[];
  cards: Card[];
  decision?: Decision;
  meta?: { runner?: string; model?: string; latencyMs?: number; error?: boolean };
  createdAt: string;
  /** Somente no cliente: resposta ainda chegando pelo stream. */
  streaming?: boolean;
}

export interface UiConversation {
  id: string;
  state: ConversationState;
  userMessageCount: number;
  hasPendingDraft: boolean;
  transfer: { queue: string; reason: string } | null;
}

export interface ApiError {
  error?: { code: string; message: string };
}
