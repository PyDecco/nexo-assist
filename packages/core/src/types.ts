export const TICKET_TYPES = ['INC', 'REQ'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Impacto: quantas pessoas são afetadas (Anexo A). */
export const IMPACTS = ['individual', 'team', 'company'] as const;
export type Impact = (typeof IMPACTS)[number];

/** Urgência: há trabalho parado ou compromisso em risco? (Anexo A). */
export const URGENCIES = ['deadline_today', 'blocked', 'has_workaround', 'no_urgency'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const TICKET_STATUSES = ['open', 'waiting_analyst', 'in_progress', 'approved', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketEventKind = 'created' | 'comment' | 'status' | 'transfer' | 'reopened';

export interface TicketEvent {
  at: string;
  kind: TicketEventKind;
  author: string;
  text: string;
}

export interface Ticket {
  number: string;
  type: TicketType;
  category: TicketCategory;
  subcategory?: string | undefined;
  title: string;
  description: string;
  priority: Priority;
  impact: Impact;
  status: TicketStatus;
  requesterEmail: string;
  createdAt: string;
  /** Última atualização do suporte: âncora do prazo (Anexo A). */
  updatedAt: string;
  resolvedAt?: string | undefined;
  events: TicketEvent[];
}

export interface NewTicketInput {
  type: TicketType;
  category: TicketCategory;
  title: string;
  description: string;
  priority: Priority;
  impact: Impact;
}

export type UserRole = 'employee' | 'analyst';

export interface User {
  email: string;
  name: string;
  role: UserRole;
  department: string;
  /** Nome da fila/nível do analista (ex.: "Suporte N2"). */
  team?: string | undefined;
}

export type ConversationState = 'with_agent' | 'waiting_analyst' | 'with_analyst' | 'closed';

export type TransferReason = 'user_request' | 'critical' | 'overdue' | 'low_confidence';
