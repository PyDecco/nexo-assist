import type { AgentEvent, PendingDraft } from '@nexo/core';
import { TicketsClient } from '@nexo/tickets-client';
import { createTestTicketsService } from '@nexo/tickets-service/testing';
import type { AgentMemory, AgentRunner, HistoryMessage, TurnContext } from './context';

export const ANA = { email: 'ana.souza@nexo.com.br', name: 'Ana Souza', department: 'Financeiro' };

/** Sessão de teste: serviço de chamados real em memória + contexto de turno persistente entre mensagens. */
export function createSession(runner: AgentRunner, now = new Date('2026-10-28T13:00:00Z')) {
  const service = createTestTicketsService(now);
  const tickets = new TicketsClient({ baseUrl: service.baseUrl, token: service.token, fetch: service.fetch, backoffMs: [1, 1], sleep: async () => {} });
  const memory: AgentMemory = {};
  let pendingDraft: PendingDraft | null = null;
  const history: HistoryMessage[] = [];
  let seq = 0;

  async function send(message: string) {
    const events: AgentEvent[] = [];
    const ctx: TurnContext = {
      user: ANA,
      tickets,
      now: () => now,
      emit: (e) => events.push(e),
      memory,
      pendingDraft,
      setPendingDraft: (d) => {
        pendingDraft = d;
        ctx.pendingDraft = d;
      },
      newId: () => `id${++seq}abcdef`,
    };
    await runner.run(ctx, { message, history: [...history] });
    const text = events.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('');
    history.push({ role: 'user', content: message }, { role: 'assistant', content: text });
    return {
      events,
      text,
      actions: events.flatMap((e) => (e.type === 'action' ? [e.step.label] : [])),
      cards: events.flatMap((e) => (e.type === 'card' ? [e.card] : [])),
      decision: events.find((e) => e.type === 'decision'),
      transfer: events.find((e) => e.type === 'transfer'),
    };
  }

  return { send, service, tickets, memory, getDraft: () => pendingDraft };
}
