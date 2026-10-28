import { formatDateTime, formatDue, relativeTime } from './format';
import { PRIORITY_LABEL, SLA_LABEL, STATUS_LABEL } from './labels';
import { canReopen, isOpenStatus, slaStatus } from './sla';
import type { Ticket } from './types';

/** Projeção de um chamado pronta para a UI e para o prompt (sem dados de outros usuários). */
export interface TicketView {
  number: string;
  type: Ticket['type'];
  title: string;
  description: string;
  category: Ticket['category'];
  subcategory?: string | undefined;
  priority: Ticket['priority'];
  priorityLabel: string;
  slaLabel: string;
  status: Ticket['status'];
  statusLabel: string;
  open: boolean;
  createdAt: string;
  createdLabel: string;
  updatedAt: string;
  lastUpdateLabel: string;
  dueAt: string | null;
  dueLabel: string | null;
  overdue: boolean;
  reopenable: boolean;
  resolvedAt?: string | undefined;
  lastEvent?: { text: string; at: string } | undefined;
}

export function toTicketView(ticket: Ticket, now: Date): TicketView {
  const sla = slaStatus(ticket, now);
  const last = ticket.events.at(-1);
  return {
    number: ticket.number,
    type: ticket.type,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    subcategory: ticket.subcategory,
    priority: ticket.priority,
    priorityLabel: PRIORITY_LABEL[ticket.priority],
    slaLabel: SLA_LABEL[ticket.priority],
    status: ticket.status,
    statusLabel: STATUS_LABEL[ticket.status],
    open: isOpenStatus(ticket.status),
    createdAt: ticket.createdAt,
    createdLabel: formatDateTime(ticket.createdAt),
    updatedAt: ticket.updatedAt,
    lastUpdateLabel: relativeTime(ticket.updatedAt, now),
    dueAt: sla.dueAt,
    dueLabel: sla.dueAt ? formatDue(sla.dueAt, now) : null,
    overdue: sla.overdue,
    reopenable: canReopen(ticket, now),
    resolvedAt: ticket.resolvedAt,
    lastEvent: last ? { text: last.text, at: last.at } : undefined,
  };
}
