import { randomUUID } from 'node:crypto';
import { queueFor, type AgentRunner, type HistoryMessage, type TurnContext } from '@nexo/agent';
import {
  CONVERSATION_STATE_LABEL,
  PRIORITY_LABEL,
  TRANSFER_REASON_LABEL,
  formatTime,
  initials,
  toTicketView,
  type ActionStep,
  type Card,
  type ChatStreamEvent,
  type Decision,
  type PendingDraft,
  type Ticket,
  type TransferRequest,
  type User,
} from '@nexo/core';
import { TicketsUnavailableError, type TicketsClient } from '@nexo/tickets-client';
import { CONFIDENCE_THRESHOLD, HISTORY_WINDOW, MESSAGE_LIMIT } from './env';
import type { Store } from './store';
import type { Conversation, StoredMessage, TransferInfo } from './types';

export type ChatErrorCode = 'LIMIT' | 'CLOSED' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'UNAVAILABLE';

export class ChatError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ChatServiceDeps {
  store: Store;
  tickets: TicketsClient;
  runner: AgentRunner;
  now?: () => Date;
}

export type Emit = (event: ChatStreamEvent) => void;

export type ConsoleFilter = 'all' | 'for_you' | 'with_agent' | 'mine';

/**
 * Orquestra cada turno: aplica o limite de mensagens, respeita a pausa do agent durante o
 * atendimento humano, roda o agent, garante uma decisão registrada, transfere quando a confiança
 * é baixa e executa — de forma determinística — o que o funcionário confirmou.
 */
export class ChatService {
  private readonly now: () => Date;

  constructor(private readonly deps: ChatServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get runnerInfo() {
    return { name: this.deps.runner.name, model: this.deps.runner.model };
  }

  // ---------- Funcionário ----------

  /** Retoma a última conversa não encerrada (história 6) ou abre uma nova. */
  currentConversation(user: User): Conversation {
    const latest = this.deps.store.latestConversation(user.email);
    if (latest && latest.state !== 'closed') return latest;
    return this.deps.store.createConversation(user.email);
  }

  newConversation(user: User): Conversation {
    const latest = this.deps.store.latestConversation(user.email);
    if (latest && latest.state !== 'closed') {
      this.deps.store.updateConversation(latest.id, { state: 'closed', closedAt: this.now().toISOString() });
      this.system(latest.id, 'Conversa encerrada pelo funcionário');
    }
    return this.deps.store.createConversation(user.email);
  }

  getForEmployee(conversationId: string, user: User): { conversation: Conversation; messages: StoredMessage[] } {
    const conversation = this.owned(conversationId, user);
    return { conversation, messages: this.deps.store.listMessages(conversationId) };
  }

  async sendMessage(conversationId: string, user: User, rawText: string, emit: Emit): Promise<void> {
    const text = rawText.trim().slice(0, 2000);
    if (!text) throw new ChatError('INVALID', 'Mensagem vazia');
    let conv = this.owned(conversationId, user);
    if (conv.state === 'closed') throw new ChatError('CLOSED', 'Esta conversa foi encerrada. Inicie uma nova.');
    if (conv.userMessageCount >= MESSAGE_LIMIT) {
      throw new ChatError('LIMIT', `Limite de ${MESSAGE_LIMIT} mensagens desta sessão atingido. Inicie uma nova conversa.`);
    }

    const previous = this.deps.store.listMessages(conv.id, HISTORY_WINDOW);
    this.deps.store.addMessage({ conversationId: conv.id, role: 'user', authorName: user.name, text, actions: [], cards: [] });
    conv = this.deps.store.updateConversation(conv.id, { userMessageCount: conv.userMessageCount + 1 });

    // Com um analista (ou aguardando um), o agent não responde (Anexo A).
    if (conv.state !== 'with_agent') {
      emit({ type: 'state', state: conv.state });
      return;
    }

    const messageId = randomUUID();
    emit({ type: 'message-start', messageId });
    const actions: ActionStep[] = [];
    const cards: Card[] = [];
    let reply = '';
    let decision: Decision | undefined;
    let transfer: TransferRequest | undefined;
    let pendingDraft: PendingDraft | null = conv.pendingDraft;
    let draftShown = false;
    let failed = false;
    const memory = { ...conv.memory };

    const forward = (event: Exclude<ChatStreamEvent, { type: 'message-start' | 'done' | 'state' }>) => {
      switch (event.type) {
        case 'action':
          actions.push(event.step);
          break;
        case 'card':
          cards.push(event.card);
          if (event.card.kind === 'draft' || event.card.kind === 'update-draft') draftShown = true;
          break;
        case 'text':
          reply += event.delta;
          break;
        case 'decision':
          decision = event.decision;
          break;
        case 'transfer':
          transfer = event.request;
          return; // vira card + mensagem de sistema abaixo
        case 'error':
          break;
      }
      emit(event);
    };

    const ctx: TurnContext = {
      user,
      tickets: this.deps.tickets,
      now: this.now,
      emit: forward,
      memory,
      pendingDraft,
      setPendingDraft: (d) => {
        pendingDraft = d;
        ctx.pendingDraft = d;
      },
      newId: () => randomUUID(),
    };

    const started = Date.now();
    try {
      await this.deps.runner.run(ctx, { message: text, history: toHistory(previous) });
    } catch (err) {
      failed = true;
      console.error('[chat] falha no agent:', err instanceof Error ? err.message.split('\n')[0] : err);
      const msg = 'Desculpe, não consegui responder agora. Tente de novo em instantes.';
      forward({ type: 'error', message: msg });
      forward({ type: 'text', delta: reply ? `\n\n${msg}` : msg });
    }

    if (!decision) {
      decision = synthesizeDecision(actions, transfer, failed);
      emit({ type: 'decision', decision });
    }

    // Agent sem segurança → analista (Anexo A).
    if (!transfer && !failed && decision.confidence < CONFIDENCE_THRESHOLD) {
      transfer = {
        reason: 'low_confidence',
        queue: queueFor('low_confidence'),
        ticketNumber: memory.focusTicket,
        summary: `${decision.understood} Mensagem do funcionário: "${text}". Confiança do agent: ${Math.round(decision.confidence * 100)}%.`,
      };
      forward({ type: 'action', step: { id: randomUUID(), tool: 'policy', label: 'pediu ajuda de um analista', status: 'done', detail: `confiança ${Math.round(decision.confidence * 100)}% < ${CONFIDENCE_THRESHOLD * 100}%` } });
      forward({ type: 'text', delta: `${reply ? '\n\n' : ''}Não tenho segurança para resolver isso sozinho, então chamei um analista. Ele continua por aqui.` });
    }

    if (transfer) {
      const card: Card = { kind: 'transfer', reason: transfer.reason, reasonLabel: TRANSFER_REASON_LABEL[transfer.reason], queue: transfer.queue, summary: transfer.summary };
      cards.push(card);
      emit({ type: 'card', card });
    }

    this.deps.store.addMessage({
      id: messageId,
      conversationId: conv.id,
      role: 'agent',
      authorName: 'Nexo Assist',
      text: reply.trim(),
      actions,
      cards,
      decision,
      meta: { runner: this.deps.runner.name, model: this.deps.runner.model, latencyMs: Date.now() - started, error: failed || undefined },
    });
    conv = this.deps.store.updateConversation(conv.id, {
      memory,
      pendingDraft,
      draftMessageId: draftShown ? messageId : conv.draftMessageId,
    });

    if (transfer) {
      conv = await this.applyTransfer(conv, transfer, decision.confidence);
      emit({ type: 'state', state: conv.state });
    }
    emit({ type: 'done', messageId });
  }

  /** Executa o rascunho confirmado. Código determinístico: o LLM nunca cria nem altera chamados. */
  async confirmDraft(conversationId: string, user: User): Promise<StoredMessage[]> {
    let conv = this.owned(conversationId, user);
    const pending = conv.pendingDraft;
    if (!pending) throw new ChatError('INVALID', 'Não há rascunho aguardando confirmação.');
    if (conv.state !== 'with_agent') throw new ChatError('INVALID', 'A conversa está com um analista.');

    let ticket: Ticket;
    let text: string;
    let action: string;
    try {
      if (pending.kind === 'new') {
        const d = pending.draft;
        ticket = await this.deps.tickets.createTicket(user.email, {
          type: d.type,
          category: d.category,
          title: d.title,
          description: `${d.description}\n\nAfetados: ${d.affectedLabel}. Prioridade ${d.priorityLabel}: ${d.priorityRationale}`,
          priority: d.priority,
          impact: d.impact,
        });
        const view = toTicketView(ticket, this.now());
        action = `criou o ${ticket.number}`;
        text = `Pronto: abri o ${ticket.number} com prioridade ${PRIORITY_LABEL[ticket.priority].toLowerCase()}. Um analista responde ${view.dueLabel ?? 'dentro do prazo'}.`;
      } else {
        const d = pending.draft;
        if (d.kind === 'comment') {
          ticket = await this.deps.tickets.addComment(d.ticketNumber, user.email, user.name, d.note);
          action = `atualizou o ${ticket.number}`;
          text = `Registrei o complemento no ${ticket.number}. O analista vai ver na próxima atualização.`;
        } else {
          ticket = await this.deps.tickets.reopen(d.ticketNumber, user.email, user.name, d.note);
          action = `reabriu o ${ticket.number}`;
          text = `Reabri o ${ticket.number}. O prazo de resposta recomeça a contar agora.`;
        }
      }
    } catch (err) {
      if (err instanceof TicketsUnavailableError) {
        throw new ChatError('UNAVAILABLE', 'O sistema de chamados está instável. Seu rascunho continua salvo — tente confirmar de novo em instantes.');
      }
      throw err;
    }

    this.markDraft(conv, 'confirmed', ticket.number);
    conv = this.deps.store.updateConversation(conv.id, { pendingDraft: null, draftMessageId: null, memory: { ...conv.memory, focusTicket: ticket.number, awaiting: undefined } });

    const view = toTicketView(ticket, this.now());
    const critical = pending.kind === 'new' && ticket.priority === 'critical';
    if (critical) text += ' Por ser crítico, já chamei um analista do Suporte N2.';
    const msg = this.deps.store.addMessage({
      conversationId: conv.id,
      role: 'agent',
      authorName: 'Nexo Assist',
      text,
      actions: [{ id: randomUUID(), tool: 'confirm', label: action, status: 'done', detail: `${ticket.number} · ${view.statusLabel}` }],
      cards: [{ kind: 'ticket', ticket: view }],
      decision: {
        intent: pending.kind === 'new' ? 'new_ticket' : 'ticket_update',
        understood: 'O funcionário conferiu e confirmou o rascunho.',
        action: `${action.charAt(0).toUpperCase()}${action.slice(1)} no sistema de chamados.`,
        confidence: 1,
        reasoning: 'Anexo A: o chamado só é criado ou atualizado depois da confirmação do funcionário.',
        source: 'rule',
      },
    });

    if (critical) {
      await this.applyTransfer(
        conv,
        { reason: 'critical', queue: queueFor('critical'), ticketNumber: ticket.number, summary: `Chamado crítico ${ticket.number}: ${ticket.title}. ${ticket.description}` },
        1,
      );
    }
    const all = this.deps.store.listMessages(conv.id);
    return all.slice(all.findIndex((m) => m.id === msg.id));
  }

  cancelDraft(conversationId: string, user: User): StoredMessage {
    const conv = this.owned(conversationId, user);
    if (!conv.pendingDraft) throw new ChatError('INVALID', 'Não há rascunho aguardando confirmação.');
    this.markDraft(conv, 'cancelled');
    this.deps.store.updateConversation(conv.id, { pendingDraft: null, draftMessageId: null });
    return this.deps.store.addMessage({
      conversationId: conv.id,
      role: 'agent',
      authorName: 'Nexo Assist',
      text: 'Tudo bem, descartei o rascunho. Posso ajudar com mais alguma coisa?',
      actions: [{ id: randomUUID(), tool: 'cancel', label: 'descartou o rascunho', status: 'done' }],
      cards: [],
      decision: {
        intent: 'new_ticket',
        understood: 'O funcionário cancelou o rascunho.',
        action: 'Descartei o rascunho sem criar nada.',
        confidence: 1,
        reasoning: 'Anexo A: nada é criado sem confirmação.',
        source: 'rule',
      },
    });
  }

  // ---------- Analista ----------

  listForConsole(analyst: User, filter: ConsoleFilter, query = '') {
    const q = query.trim().toLowerCase();
    const all = this.deps.store.listConversations().map((c) => this.consoleItem(c, analyst));
    const counts = {
      all: all.length,
      for_you: all.filter((i) => i.needsYou).length,
      with_agent: all.filter((i) => i.state === 'with_agent').length,
      mine: all.filter((i) => i.assignedToMe).length,
    };
    const filtered = all
      .filter((i) => (filter === 'all' ? true : filter === 'for_you' ? i.needsYou : filter === 'with_agent' ? i.state === 'with_agent' : i.assignedToMe))
      .filter((i) => !q || `${i.user.name} ${i.user.email} ${i.preview ?? ''} ${i.transfer?.ticketNumber ?? ''} ${i.tag}`.toLowerCase().includes(q));
    // Quem precisa de atendimento aparece primeiro.
    filtered.sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    return { items: filtered, counts };
  }

  async consoleDetail(conversationId: string, analyst: User) {
    const conv = this.deps.store.getConversation(conversationId);
    if (!conv) throw new ChatError('NOT_FOUND', 'Conversa não encontrada');
    const employee = this.deps.store.findUser(conv.userEmail);
    let tickets: ReturnType<typeof toTicketView>[] = [];
    let ticketsError: string | null = null;
    try {
      const now = this.now();
      tickets = (await this.deps.tickets.listTickets(conv.userEmail, 'all')).map((t) => toTicketView(t, now));
    } catch (err) {
      ticketsError = err instanceof TicketsUnavailableError ? 'Sistema de chamados indisponível no momento.' : 'Não foi possível carregar os chamados.';
    }
    return {
      item: this.consoleItem(conv, analyst),
      conversation: conv,
      employee,
      messages: this.deps.store.listMessages(conv.id),
      tickets,
      ticketsError,
    };
  }

  async assume(conversationId: string, analyst: User): Promise<Conversation> {
    const conv = this.consoleConversation(conversationId);
    if (conv.state === 'closed') throw new ChatError('CLOSED', 'Conversa encerrada.');
    if (conv.state === 'with_analyst' && conv.assignedAnalyst !== analyst.email) throw new ChatError('FORBIDDEN', 'Outro analista já assumiu esta conversa.');
    const next = this.deps.store.updateConversation(conv.id, { state: 'with_analyst', assignedAnalyst: analyst.email });
    this.system(conv.id, `${analyst.name} assumiu · agent pausado · ${formatTime(this.now().toISOString())}`);
    const ticket = conv.transfer?.ticketNumber ?? conv.memory.focusTicket;
    if (ticket) {
      await this.deps.tickets.supportUpdate(ticket, conv.userEmail, analyst.name, `Assumido por ${analyst.name}`, 'in_progress').catch(() => undefined);
    }
    return next;
  }

  analystMessage(conversationId: string, analyst: User, rawText: string): StoredMessage {
    const text = rawText.trim().slice(0, 2000);
    if (!text) throw new ChatError('INVALID', 'Mensagem vazia');
    const conv = this.consoleConversation(conversationId);
    if (conv.state !== 'with_analyst' || conv.assignedAnalyst !== analyst.email) throw new ChatError('FORBIDDEN', 'Assuma o atendimento para responder.');
    return this.deps.store.addMessage({ conversationId: conv.id, role: 'analyst', authorName: `${analyst.name}|${analyst.team ?? 'Suporte'}`, text, actions: [], cards: [] });
  }

  returnToAgent(conversationId: string, analyst: User): Conversation {
    const conv = this.consoleConversation(conversationId);
    if (conv.state === 'closed') throw new ChatError('CLOSED', 'Conversa encerrada.');
    const next = this.deps.store.updateConversation(conv.id, {
      state: 'with_agent',
      assignedAnalyst: null,
      transfer: null,
      memory: { focusTicket: conv.memory.focusTicket },
    });
    this.system(conv.id, `${analyst.name} devolveu a conversa ao agent · ${formatTime(this.now().toISOString())}`);
    return next;
  }

  close(conversationId: string, analyst: User): Conversation {
    const conv = this.consoleConversation(conversationId);
    const next = this.deps.store.updateConversation(conv.id, { state: 'closed', closedAt: this.now().toISOString() });
    this.system(conv.id, `Atendimento encerrado por ${analyst.name} · ${formatTime(this.now().toISOString())}`);
    return next;
  }

  // ---------- internos ----------

  private async applyTransfer(conv: Conversation, request: TransferRequest, confidence: number): Promise<Conversation> {
    const info: TransferInfo = { ...request, confidence, at: this.now().toISOString() };
    const next = this.deps.store.updateConversation(conv.id, { state: 'waiting_analyst', transfer: info });
    this.system(conv.id, `Transferida para ${request.queue} · ${formatTime(info.at)}`);
    if (request.ticketNumber) {
      // Melhor esforço: a conversa já está na fila mesmo se o legado oscilar.
      await this.deps.tickets.transfer(request.ticketNumber, conv.userEmail, request.queue, request.summary).catch((err: unknown) => {
        console.warn('[chat] não foi possível marcar a transferência no chamado:', err instanceof Error ? err.message : err);
      });
    }
    return next;
  }

  private markDraft(conv: Conversation, status: 'confirmed' | 'cancelled', createdTicket?: string) {
    if (!conv.draftMessageId) return;
    const msg = this.deps.store.listMessages(conv.id).find((m) => m.id === conv.draftMessageId);
    if (!msg) return;
    const cards = msg.cards.map((c): Card => {
      if (c.kind === 'draft' && c.draft.status === 'pending') return { ...c, draft: { ...c.draft, status, createdTicket } };
      if (c.kind === 'update-draft' && c.draft.status === 'pending') return { ...c, draft: { ...c.draft, status } };
      return c;
    });
    this.deps.store.updateMessage(msg.id, { cards });
  }

  private system(conversationId: string, text: string) {
    this.deps.store.addMessage({ conversationId, role: 'system', authorName: 'Sistema', text, actions: [], cards: [] });
  }

  private owned(conversationId: string, user: User): Conversation {
    const conv = this.deps.store.getConversation(conversationId);
    if (!conv) throw new ChatError('NOT_FOUND', 'Conversa não encontrada');
    // Privacidade: um funcionário só acessa as próprias conversas.
    if (conv.userEmail !== user.email) throw new ChatError('FORBIDDEN', 'Conversa de outro usuário');
    return conv;
  }

  private consoleConversation(conversationId: string): Conversation {
    const conv = this.deps.store.getConversation(conversationId);
    if (!conv) throw new ChatError('NOT_FOUND', 'Conversa não encontrada');
    return conv;
  }

  private consoleItem(c: Conversation, analyst: User) {
    const employee = this.deps.store.findUser(c.userEmail);
    const assignedToMe = c.state === 'with_analyst' && c.assignedAnalyst === analyst.email;
    const needsYou = c.state === 'waiting_analyst' || assignedToMe;
    let tag: string;
    let tone: 'danger' | 'warning' | 'success' | 'primary' | 'muted';
    if (c.state === 'waiting_analyst' && c.transfer?.reason === 'low_confidence') {
      tag = `Agent pediu ajuda · confiança ${Math.round((c.transfer.confidence ?? 0) * 100)}%`;
      tone = 'warning';
    } else if (c.state === 'waiting_analyst') {
      tag = `Transferida · ${c.transfer?.ticketNumber ?? TRANSFER_REASON_LABEL[c.transfer?.reason ?? 'user_request']}`;
      tone = 'danger';
    } else if (assignedToMe) {
      tag = 'Você está atendendo';
      tone = 'primary';
    } else if (c.state === 'with_analyst') {
      tag = `Em atendimento · ${this.deps.store.findUser(c.assignedAnalyst ?? '')?.name ?? 'analista'}`;
      tone = 'primary';
    } else if (c.state === 'closed') {
      tag = 'Encerrada';
      tone = 'muted';
    } else {
      tag = CONVERSATION_STATE_LABEL.with_agent;
      tone = 'success';
    }
    return {
      id: c.id,
      user: {
        name: employee?.name ?? c.userEmail,
        email: c.userEmail,
        department: employee?.department ?? '',
        initials: initials(employee?.name ?? c.userEmail),
      },
      state: c.state,
      stateLabel: CONVERSATION_STATE_LABEL[c.state],
      tag,
      tone,
      needsYou,
      assignedToMe,
      transfer: c.transfer,
      preview: c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt,
    };
  }
}

export type ConsoleItem = ReturnType<ChatService['listForConsole']>['items'][number];
export type ConsoleDetail = Awaited<ReturnType<ChatService['consoleDetail']>>;

/** Histórico enxuto para o modelo: texto + resumo de cards, nunca os payloads completos. */
export function toHistory(messages: StoredMessage[]): HistoryMessage[] {
  return messages.map((m): HistoryMessage => {
    if (m.role === 'user') return { role: 'user', content: m.text };
    if (m.role === 'analyst') return { role: 'assistant', content: `[Analista ${m.authorName.split('|')[0]}] ${m.text}` };
    if (m.role === 'system') return { role: 'assistant', content: `[Sistema] ${m.text}` };
    const notes = m.cards.map(describeCard).filter(Boolean);
    return { role: 'assistant', content: notes.length ? `${m.text}\n[${notes.join('; ')}]` : m.text };
  });
}

function describeCard(card: Card): string {
  switch (card.kind) {
    case 'ticket':
      return `card do ${card.ticket.number}: ${card.ticket.statusLabel}${card.ticket.overdue ? ', vencido' : ''}`;
    case 'ticket-selector':
      return `lista para escolher: ${card.tickets.map((t) => t.number).join(', ')}`;
    case 'draft':
      return `rascunho "${card.draft.title}" (${card.draft.priorityLabel}) ${card.draft.status}`;
    case 'update-draft':
      return `${card.draft.kind === 'comment' ? 'complemento' : 'reabertura'} do ${card.draft.ticketNumber} ${card.draft.status}`;
    case 'options':
      return `opções: ${card.options.join(' / ')}`;
    case 'transfer':
      return `transferido para ${card.queue}`;
  }
}

function synthesizeDecision(actions: ActionStep[], transfer: TransferRequest | undefined, failed: boolean): Decision {
  const done = actions.filter((a) => a.status === 'done').map((a) => a.label);
  if (failed) {
    return { intent: 'unclear', understood: 'Não foi possível concluir o turno.', action: 'Pedi para tentar novamente.', confidence: 0.5, reasoning: 'Falha técnica ao consultar o modelo.', source: 'synthesized' };
  }
  return {
    intent: transfer ? 'talk_to_analyst' : 'unclear',
    understood: 'O agent respondeu sem registrar o que entendeu.',
    action: done.length ? `Ações: ${done.join(', ')}.` : 'Respondeu apenas em texto.',
    confidence: done.length ? 0.6 : 0.4,
    reasoning: 'Decisão inferida pelo orquestrador a partir do rastro de ferramentas.',
    source: 'synthesized',
  };
}
