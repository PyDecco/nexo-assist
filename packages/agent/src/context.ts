import type { AgentEvent, PendingDraft, User } from '@nexo/core';
import type { TicketsClient } from '@nexo/tickets-client';

/** Memória curta do agent, persistida junto da conversa. */
export interface AgentMemory {
  /** Chamado em foco na conversa (último consultado/selecionado). */
  focusTicket?: string | undefined;
  /** O que o agent perguntou por último e espera como resposta. */
  awaiting?: 'impact' | 'ticket_choice' | 'note' | 'similar_choice' | undefined;
  /** Chamado em construção pelo runner determinístico. */
  partialTicket?:
    | {
        title: string;
        description: string;
        type: 'INC' | 'REQ';
        category: string;
        urgency: string;
      }
    | undefined;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  /** Texto + resumo compacto de ações/cards (contexto enxuto para o modelo). */
  content: string;
}

/**
 * Tudo que um turno do agent pode ver e fazer.
 * A identidade do funcionário vem da sessão e fica em closure: nenhuma tool recebe e-mail como argumento.
 */
export interface TurnContext {
  user: Pick<User, 'email' | 'name' | 'department'>;
  tickets: TicketsClient;
  now: () => Date;
  emit: (event: AgentEvent) => void;
  memory: AgentMemory;
  pendingDraft: PendingDraft | null;
  setPendingDraft: (draft: PendingDraft | null) => void;
  newId: () => string;
}

export interface TurnInput {
  message: string;
  history: HistoryMessage[];
}

export interface AgentRunner {
  readonly name: string;
  readonly model: string;
  run(ctx: TurnContext, input: TurnInput): Promise<void>;
}
