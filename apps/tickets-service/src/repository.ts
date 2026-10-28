import type { NewTicketInput, Ticket, TicketEvent, TicketEventKind, TicketStatus } from '@nexo/core';
import { canReopen, isOpenStatus } from '@nexo/core';
import type { Db } from './db';

interface TicketRow {
  number: string;
  type: Ticket['type'];
  category: Ticket['category'];
  subcategory: string | null;
  title: string;
  description: string;
  priority: Ticket['priority'];
  impact: Ticket['impact'];
  status: TicketStatus;
  requester_email: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export class TicketNotFoundError extends Error {}
export class TicketConflictError extends Error {}

/** Acesso a chamados. Toda leitura é filtrada pelo solicitante: privacidade por construção. */
export class TicketRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  listByRequester(requester: string, filter: 'open' | 'all' = 'all'): Ticket[] {
    const rows = this.db
      .prepare('SELECT * FROM tickets WHERE requester_email = ? ORDER BY updated_at DESC')
      .all(requester) as unknown as TicketRow[];
    const tickets = rows.map((r) => this.hydrate(r));
    return filter === 'open' ? tickets.filter((t) => isOpenStatus(t.status)) : tickets;
  }

  /** Retorna o chamado só se pertencer ao solicitante; caso contrário, "não encontrado". */
  getForRequester(number: string, requester: string): Ticket {
    const row = this.db
      .prepare('SELECT * FROM tickets WHERE number = ? AND requester_email = ?')
      .get(number.toUpperCase(), requester) as unknown as TicketRow | undefined;
    if (!row) throw new TicketNotFoundError(`Chamado ${number} não encontrado`);
    return this.hydrate(row);
  }

  create(requester: string, input: NewTicketInput, author = 'Nexo Assist'): Ticket {
    const now = this.clock().toISOString();
    const number = this.nextNumber(input.type);
    this.db
      .prepare(
        `INSERT INTO tickets (number, type, category, subcategory, title, description, priority, impact, status, requester_email, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      )
      .run(number, input.type, input.category, input.title, input.description, input.priority, input.impact, requester, now, now);
    this.addEvent(number, 'created', author, 'Chamado aberto pelo Nexo Assist', now);
    return this.getForRequester(number, requester);
  }

  /** Complemento do funcionário. Não reinicia o prazo: o prazo mede a resposta do suporte. */
  comment(number: string, requester: string, author: string, text: string): Ticket {
    const ticket = this.getForRequester(number, requester);
    if (!isOpenStatus(ticket.status)) throw new TicketConflictError(`Chamado ${number} não está aberto`);
    this.addEvent(ticket.number, 'comment', author, text, this.clock().toISOString());
    return this.getForRequester(number, requester);
  }

  reopen(number: string, requester: string, author: string, note: string): Ticket {
    const ticket = this.getForRequester(number, requester);
    const now = this.clock();
    if (!canReopen(ticket, now)) {
      throw new TicketConflictError(`Chamado ${number} só pode ser reaberto até 7 dias após resolvido`);
    }
    this.db
      .prepare("UPDATE tickets SET status = 'open', resolved_at = NULL, updated_at = ? WHERE number = ?")
      .run(now.toISOString(), ticket.number);
    this.addEvent(ticket.number, 'reopened', author, note, now.toISOString());
    return this.getForRequester(number, requester);
  }

  transfer(number: string, requester: string, queue: string, summary: string): Ticket {
    const ticket = this.getForRequester(number, requester);
    if (!isOpenStatus(ticket.status)) throw new TicketConflictError(`Chamado ${number} não está aberto`);
    this.db.prepare("UPDATE tickets SET status = 'waiting_analyst' WHERE number = ?").run(ticket.number);
    this.addEvent(ticket.number, 'transfer', 'Nexo Assist', `Transferido para ${queue}: ${summary}`, this.clock().toISOString());
    return this.getForRequester(number, requester);
  }

  /** Atualização do suporte (ex.: analista assumiu): reinicia o prazo, como pede o Anexo A. */
  supportUpdate(number: string, requester: string, author: string, text: string, status?: TicketStatus): Ticket {
    const ticket = this.getForRequester(number, requester);
    const now = this.clock().toISOString();
    const next = status ?? ticket.status;
    this.db
      .prepare('UPDATE tickets SET status = ?, updated_at = ?, resolved_at = ? WHERE number = ?')
      .run(next, now, next === 'resolved' ? now : null, ticket.number);
    this.addEvent(ticket.number, 'status', author, text, now);
    return this.getForRequester(number, requester);
  }

  insertRaw(ticket: Ticket): void {
    this.db
      .prepare(
        `INSERT INTO tickets (number, type, category, subcategory, title, description, priority, impact, status, requester_email, created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ticket.number,
        ticket.type,
        ticket.category,
        ticket.subcategory ?? null,
        ticket.title,
        ticket.description,
        ticket.priority,
        ticket.impact,
        ticket.status,
        ticket.requesterEmail,
        ticket.createdAt,
        ticket.updatedAt,
        ticket.resolvedAt ?? null,
      );
    for (const e of ticket.events) this.addEvent(ticket.number, e.kind, e.author, e.text, e.at);
  }

  setCounter(type: Ticket['type'], next: number): void {
    this.db.prepare('INSERT OR REPLACE INTO counters (type, next) VALUES (?, ?)').run(type, next);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM tickets').get() as { n: number }).n;
  }

  private nextNumber(type: Ticket['type']): string {
    const row = this.db.prepare('SELECT next FROM counters WHERE type = ?').get(type) as { next: number } | undefined;
    const next = row?.next ?? (type === 'INC' ? 20000 : 10000);
    this.setCounter(type, next + 1);
    return `${type}-${next}`;
  }

  private addEvent(number: string, kind: TicketEventKind, author: string, text: string, at: string): void {
    this.db
      .prepare('INSERT INTO ticket_events (ticket_number, at, kind, author, text) VALUES (?, ?, ?, ?, ?)')
      .run(number, at, kind, author, text);
  }

  private hydrate(row: TicketRow): Ticket {
    const events = this.db
      .prepare('SELECT at, kind, author, text FROM ticket_events WHERE ticket_number = ? ORDER BY at, id')
      .all(row.number) as unknown as TicketEvent[];
    return {
      number: row.number,
      type: row.type,
      category: row.category,
      subcategory: row.subcategory ?? undefined,
      title: row.title,
      description: row.description,
      priority: row.priority,
      impact: row.impact,
      status: row.status,
      requesterEmail: row.requester_email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at ?? undefined,
      events,
    };
  }
}
