import type { Priority, Ticket, TicketStatus } from './types';

/**
 * Horário útil do service desk (artigo da central): seg–sex, 8h às 18h, horário de Brasília.
 * O Brasil não tem horário de verão desde 2019, então usamos UTC−3 fixo.
 */
const OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const HOUR_MS = 60 * 60 * 1000;
export const BUSINESS_HOURS_PER_DAY = DAY_END_HOUR - DAY_START_HOUR;

/** Prazo de cada prioridade em horas úteis (Crítica é 1 hora corrida — plantão 24 h). */
export const SLA_BUSINESS_HOURS: Record<Exclude<Priority, 'critical'>, number> = {
  high: 4,
  medium: 3 * BUSINESS_HOURS_PER_DAY,
  low: 5 * BUSINESS_HOURS_PER_DAY,
};

/** Status em que o relógio do prazo corre. "Aprovado" aguarda entrega agendada e fica pausado. */
export const SLA_RUNNING_STATUSES: readonly TicketStatus[] = ['open', 'waiting_analyst', 'in_progress'];
export const OPEN_STATUSES: readonly TicketStatus[] = ['open', 'waiting_analyst', 'in_progress', 'approved'];

export function isOpenStatus(status: TicketStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

function toLocal(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}
function fromLocal(local: Date): Date {
  return new Date(local.getTime() - OFFSET_MS);
}
function isBusinessDay(local: Date): boolean {
  const d = local.getUTCDay();
  return d !== 0 && d !== 6;
}
function atHour(local: Date, hour: number): Date {
  const copy = new Date(local);
  copy.setUTCHours(hour, 0, 0, 0);
  return copy;
}
function nextDayStart(local: Date): Date {
  const next = atHour(local, DAY_START_HOUR);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Move o instante para o próximo momento dentro do horário útil (ou mantém, se já estiver). */
function clampToBusiness(local: Date): Date {
  let cursor = new Date(local);
  for (;;) {
    if (!isBusinessDay(cursor)) {
      cursor = nextDayStart(cursor);
      continue;
    }
    const start = atHour(cursor, DAY_START_HOUR);
    const end = atHour(cursor, DAY_END_HOUR);
    if (cursor < start) return start;
    if (cursor >= end) {
      cursor = nextDayStart(cursor);
      continue;
    }
    return cursor;
  }
}

export function addBusinessHours(start: Date, hours: number): Date {
  let remaining = hours * HOUR_MS;
  let cursor = clampToBusiness(toLocal(start));
  while (remaining > 0) {
    const end = atHour(cursor, DAY_END_HOUR);
    const available = end.getTime() - cursor.getTime();
    if (remaining <= available) {
      return fromLocal(new Date(cursor.getTime() + remaining));
    }
    remaining -= available;
    cursor = clampToBusiness(nextDayStart(cursor));
  }
  return fromLocal(cursor);
}

/** Prazo a partir de um instante (primeira resposta ou última atualização). */
export function computeDueAt(anchor: Date, priority: Priority): Date {
  if (priority === 'critical') return new Date(anchor.getTime() + HOUR_MS);
  return addBusinessHours(anchor, SLA_BUSINESS_HOURS[priority]);
}

export interface SlaStatus {
  /** null quando o relógio está parado (resolvido, fechado ou aprovado). */
  dueAt: string | null;
  overdue: boolean;
}

export function slaStatus(ticket: Pick<Ticket, 'status' | 'priority' | 'updatedAt'>, now: Date): SlaStatus {
  if (!SLA_RUNNING_STATUSES.includes(ticket.status)) return { dueAt: null, overdue: false };
  const due = computeDueAt(new Date(ticket.updatedAt), ticket.priority);
  return { dueAt: due.toISOString(), overdue: now.getTime() > due.getTime() };
}

export const REOPEN_WINDOW_DAYS = 7;

/** Chamados resolvidos há até 7 dias podem ser reabertos (Anexo A). */
export function canReopen(ticket: Pick<Ticket, 'status' | 'resolvedAt'>, now: Date): boolean {
  if (ticket.status !== 'resolved' || !ticket.resolvedAt) return false;
  const ageMs = now.getTime() - new Date(ticket.resolvedAt).getTime();
  return ageMs >= 0 && ageMs <= REOPEN_WINDOW_DAYS * 24 * HOUR_MS;
}
