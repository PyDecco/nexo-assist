import type { AgentMemory } from '@nexo/agent';
import type { ActionStep, Card, ConversationState, Decision, PendingDraft, TransferReason, User } from '@nexo/core';

export type MessageRole = 'user' | 'agent' | 'analyst' | 'system';

export interface MessageMeta {
  runner?: string;
  model?: string;
  latencyMs?: number;
  error?: boolean;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  authorName: string;
  text: string;
  actions: ActionStep[];
  cards: Card[];
  decision?: Decision | undefined;
  meta?: MessageMeta | undefined;
  createdAt: string;
}

export interface TransferInfo {
  reason: TransferReason;
  summary: string;
  queue: string;
  ticketNumber?: string | undefined;
  confidence?: number | undefined;
  at: string;
}

export interface Conversation {
  id: string;
  userEmail: string;
  state: ConversationState;
  assignedAnalyst: string | null;
  transfer: TransferInfo | null;
  pendingDraft: PendingDraft | null;
  draftMessageId: string | null;
  memory: AgentMemory;
  userMessageCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export type SessionUser = User;
