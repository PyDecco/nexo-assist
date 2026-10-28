import type { TicketView } from './ticket-view';
import type { ConversationState, Impact, Priority, TicketCategory, TicketType, TransferReason } from './types';

/** Intenções que o agent reconhece. Usadas na decisão e no console do analista. */
export const INTENTS = [
  'question',
  'ticket_status',
  'ticket_update',
  'new_ticket',
  'talk_to_analyst',
  'out_of_scope',
  'smalltalk',
  'unclear',
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABEL: Record<Intent, string> = {
  question: 'Dúvida',
  ticket_status: 'Consulta de chamado',
  ticket_update: 'Complemento de chamado',
  new_ticket: 'Novo chamado',
  talk_to_analyst: 'Falar com analista',
  out_of_scope: 'Fora do escopo de TI',
  smalltalk: 'Conversa',
  unclear: 'Não ficou claro',
};

/** Um passo visível do agent: vira a linha "consultou seus chamados · …" acima da resposta. */
export interface ActionStep {
  id: string;
  tool: string;
  label: string;
  status: 'running' | 'done' | 'error';
  /** Resumo legível do que entrou e saiu da ferramenta (painel de detalhes). */
  detail?: string | undefined;
  durationMs?: number | undefined;
}

/** O que o agent entendeu, o que fez, com que segurança e por quê (requisito 7 do PRD). */
export interface Decision {
  intent: Intent;
  understood: string;
  action: string;
  /** 0 a 1. */
  confidence: number;
  reasoning: string;
  /** "model": registrada pelo agent; "synthesized": inferida do rastro; "rule": ação determinística (ex.: confirmação). */
  source: 'model' | 'synthesized' | 'rule';
}

export interface TicketDraft {
  id: string;
  type: TicketType;
  category: TicketCategory;
  title: string;
  description: string;
  impact: Impact;
  affectedLabel: string;
  priority: Priority;
  priorityLabel: string;
  priorityRationale: string;
  slaLabel: string;
  dueAt: string;
  dueLabel: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdTicket?: string | undefined;
}

export interface TicketUpdateDraft {
  id: string;
  kind: 'comment' | 'reopen';
  ticketNumber: string;
  ticketTitle: string;
  note: string;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export type PendingDraft = { kind: 'new'; draft: TicketDraft } | { kind: 'update'; draft: TicketUpdateDraft };

export interface TransferRequest {
  reason: TransferReason;
  summary: string;
  ticketNumber?: string | undefined;
  queue: string;
}

export type Card =
  | { kind: 'ticket'; ticket: TicketView }
  | { kind: 'ticket-selector'; tickets: TicketView[] }
  | { kind: 'draft'; draft: TicketDraft }
  | { kind: 'update-draft'; draft: TicketUpdateDraft }
  | { kind: 'options'; question: string; options: string[] }
  | { kind: 'transfer'; reason: TransferReason; reasonLabel: string; queue: string; summary: string };

export type AgentEvent =
  | { type: 'action'; step: ActionStep }
  | { type: 'text'; delta: string }
  | { type: 'card'; card: Card }
  | { type: 'decision'; decision: Decision }
  | { type: 'transfer'; request: TransferRequest }
  | { type: 'error'; message: string };

/** Eventos que a rota SSE do chat envia ao navegador. */
export type ChatStreamEvent =
  | AgentEvent
  | { type: 'message-start'; messageId: string }
  | { type: 'done'; messageId: string }
  | { type: 'state'; state: ConversationState };
