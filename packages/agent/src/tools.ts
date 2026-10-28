import {
  IMPACTS,
  IMPACT_LABEL,
  INTENTS,
  PRIORITY_LABEL,
  SLA_LABEL,
  TICKET_CATEGORIES,
  TICKET_TYPES,
  TRANSFER_REASON_LABEL,
  URGENCIES,
  classifyPriority,
  computeDueAt,
  findSimilarTickets,
  formatDue,
  slaStatus,
  toTicketView,
  type ActionStep,
  type TicketView,
  type TransferReason,
} from '@nexo/core';
import { TicketsUnavailableError } from '@nexo/tickets-client';
import { z } from 'zod';
import type { TurnContext } from './context';
import { searchArticles } from './help-center';

export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input: S;
  /** Ferramentas silenciosas não aparecem na linha de ações (ex.: registrar decisão). */
  silent?: boolean;
  execute: (input: z.infer<S>, step: StepReporter) => Promise<unknown>;
}

/** Permite a uma ferramenta publicar um ou mais passos visíveis ("consultou o INC-20311", "calculou o prazo"). */
export interface StepReporter {
  step(label: string, detail?: string): void;
}

function defineTool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

const QUEUE_BY_REASON: Record<TransferReason, string> = {
  user_request: 'Suporte N1',
  critical: 'Suporte N2',
  overdue: 'Suporte N2',
  low_confidence: 'Suporte N1',
};

export function queueFor(reason: TransferReason): string {
  return QUEUE_BY_REASON[reason];
}

function compact(t: TicketView) {
  return {
    number: t.number,
    title: t.title,
    category: t.category,
    priority: t.priorityLabel,
    status: t.statusLabel,
    open: t.open,
    lastUpdate: t.lastUpdateLabel,
    sla: t.slaLabel,
    due: t.dueLabel,
    overdue: t.overdue,
    reopenable: t.reopenable,
  };
}

/** Cria as ferramentas do turno. Todas leem a identidade do contexto, nunca do modelo. */
export function createTools(ctx: TurnContext) {
  const me = ctx.user.email;
  const retry = {
    onRetry: (info: { attempt: number; maxAttempts: number; reason: string }) =>
      ctx.emit({
        type: 'action',
        step: {
          id: ctx.newId(),
          tool: 'tickets-retry',
          label: `serviço de chamados instável, tentando de novo (${info.attempt}/${info.maxAttempts})`,
          status: 'done',
          detail: info.reason,
        },
      }),
  };

  const searchHelpCenter = defineTool({
    name: 'searchHelpCenter',
    description:
      'Busca artigos na central de ajuda de TI. Use antes de abrir chamado e para responder dúvidas. Leia as condições do artigo (ex.: vale só para Windows 10).',
    input: z.object({ query: z.string().describe('Termos do problema ou da dúvida, em português') }),
    async execute({ query }, r) {
      const hits = searchArticles(query);
      r.step('buscou na central de ajuda', hits.length ? hits.map((h) => `${h.id} ${h.title}`).join('; ') : 'nenhum artigo relevante');
      return { articles: hits.map(({ id, title, body }) => ({ id, title, body })) };
    },
  });

  const listMyTickets = defineTool({
    name: 'listMyTickets',
    description:
      'Lista os chamados do funcionário logado. Use quando ele perguntar sobre "meu chamado" sem número, ou para checar duplicidade. Com presentation="selector" mostra uma lista para ele escolher.',
    input: z.object({
      filter: z.enum(['open', 'all']).describe('"open" para abertos, "all" inclui resolvidos'),
      presentation: z.enum(['selector', 'none']).describe('"selector" mostra os chamados na tela para escolha'),
    }),
    async execute({ filter, presentation }, r) {
      const now = ctx.now();
      const tickets = (await ctx.tickets.listTickets(me, filter, retry)).map((t) => toTicketView(t, now));
      r.step('consultou seus chamados', `${tickets.length} chamado(s) ${filter === 'open' ? 'abertos' : 'no total'}`);
      if (presentation === 'selector' && tickets.length > 1) {
        ctx.emit({ type: 'card', card: { kind: 'ticket-selector', tickets } });
        ctx.memory.awaiting = 'ticket_choice';
      } else if (presentation === 'selector' && tickets.length === 1 && tickets[0]) {
        ctx.emit({ type: 'card', card: { kind: 'ticket', ticket: tickets[0] } });
        ctx.memory.focusTicket = tickets[0].number;
      }
      return { count: tickets.length, tickets: tickets.map(compact) };
    },
  });

  const getTicket = defineTool({
    name: 'getTicket',
    description:
      'Consulta um chamado do funcionário pelo número (ex.: INC-20311) e calcula o prazo. Mostra o card do chamado. Só funciona para chamados abertos por ele.',
    input: z.object({ number: z.string().describe('Número do chamado, ex.: INC-20311 ou REQ-10442') }),
    async execute({ number }, r) {
      const id = number.trim().toUpperCase();
      const ticket = await ctx.tickets.getTicket(id, me, retry);
      if (!ticket) {
        r.step(`procurou o ${id}`, 'não encontrado entre os chamados do funcionário');
        return { found: false, message: `Não há chamado ${id} entre os chamados deste funcionário. Não revele se ele existe para outra pessoa.` };
      }
      const view = toTicketView(ticket, ctx.now());
      r.step(`consultou o ${view.number}`, `${view.statusLabel} · prioridade ${view.priorityLabel.toLowerCase()}`);
      r.step(
        'calculou o prazo',
        view.dueAt ? `prazo de ${view.slaLabel} a partir da última atualização (${view.lastUpdateLabel}) → ${view.overdue ? 'vencido' : view.dueLabel}` : 'sem prazo correndo neste status',
      );
      ctx.emit({ type: 'card', card: { kind: 'ticket', ticket: view } });
      ctx.memory.focusTicket = view.number;
      ctx.memory.awaiting = undefined;
      return {
        found: true,
        replyHint: view.overdue
          ? `VENCIDO: diga que está sem atualização ${view.lastUpdateLabel}, acima do prazo de ${view.slaLabel} para prioridade ${view.priorityLabel.toLowerCase()}, e pergunte se quer chamar um analista com askWithOptions(["Falar com um analista","Adicionar informação","Não, obrigado"]).`
          : view.open
            ? `Dentro do prazo (${view.dueLabel ?? 'sem prazo correndo'}). Diga o status em uma frase.`
            : view.reopenable
              ? 'Resolvido há até 7 dias: pode ser reaberto se o problema voltou.'
              : 'Encerrado.',
        ticket: { ...compact(view), description: view.description, lastEvent: view.lastEvent?.text },
      };
    },
  });

  const draftTicket = defineTool({
    name: 'draftTicket',
    description:
      'Monta o rascunho de um NOVO chamado para o funcionário conferir. Não cria o chamado: ele só é criado quando o funcionário clicar em Confirmar. Verifica duplicidade antes; se houver chamado parecido aberto ou resolvido há até 7 dias, devolve similar_found e você deve oferecer complementar/reabrir em vez de duplicar.',
    input: z.object({
      type: z.enum(TICKET_TYPES).describe('INC quando algo parou ou não funciona; REQ para pedido de acesso, equipamento ou software'),
      category: z.enum(TICKET_CATEGORIES),
      title: z.string().describe('Título curto e específico, ex.: "VPN não conecta no notebook — erro 809"'),
      description: z
        .string()
        .describe('Descrição completa para o analista não precisar perguntar de novo: o que acontece, desde quando, ambiente, o que já foi tentado, impacto'),
      impact: z.enum(IMPACTS).describe('Quem é afetado: individual (só a pessoa), team (equipe), company (empresa)'),
      urgency: z
        .enum(URGENCIES)
        .describe('deadline_today: compromisso hoje em risco; blocked: não consegue trabalhar; has_workaround: atrapalha mas há alternativa; no_urgency: pedido sem urgência'),
      impactConfirmedByUser: z
        .boolean()
        .describe('true somente se o funcionário disse quem é afetado nesta conversa; nunca suponha'),
      ignoreSimilar: z.boolean().default(false).describe('true apenas se o funcionário já disse que é um problema diferente do chamado parecido'),
    }),
    async execute(input, r) {
      const now = ctx.now();
      if (!input.impactConfirmedByUser) {
        ctx.memory.awaiting = 'impact';
        return {
          status: 'need_impact',
          instruction:
            'Falta saber quem é afetado (Anexo A). Chame askWithOptions com question "Quem está sendo afetado?", options ["Só eu","Minha equipe","Toda a empresa","Não sei"], expects "impact". Não monte o rascunho ainda.',
        };
      }
      if (!input.ignoreSimilar) {
        const mine = await ctx.tickets.listTickets(me, 'all', retry);
        const similar = findSimilarTickets(mine, input, now);
        const found = similar.open.length + similar.reopenable.length;
        r.step('verificou duplicidade', found ? `parecido(s): ${[...similar.open, ...similar.reopenable].map((t) => t.number).join(', ')}` : 'nenhum chamado parecido');
        if (found) {
          const first = similar.open[0] ?? similar.reopenable[0];
          if (first) ctx.memory.focusTicket = first.number;
          ctx.memory.awaiting = 'similar_choice';
          return {
            status: 'similar_found',
            instruction: 'Não crie outro chamado. Mostre o chamado parecido e pergunte se ele quer complementá-lo (aberto) ou reabri-lo (resolvido há até 7 dias).',
            open: similar.open.map((t) => compact(toTicketView(t, now))),
            reopenable: similar.reopenable.map((t) => compact(toTicketView(t, now))),
          };
        }
      }
      const { priority, rationale } = classifyPriority(input.impact, input.urgency);
      r.step('classificou a prioridade', `${PRIORITY_LABEL[priority]}: ${rationale}`);
      const dueAt = computeDueAt(now, priority);
      r.step('consultou o SLA', `${SLA_LABEL[priority]} → resposta ${formatDue(dueAt.toISOString(), now)}`);
      const draft = {
        id: `D-${ctx.newId().slice(0, 3).toUpperCase()}`,
        type: input.type,
        category: input.category,
        title: input.title,
        description: input.description,
        impact: input.impact,
        affectedLabel: IMPACT_LABEL[input.impact],
        priority,
        priorityLabel: PRIORITY_LABEL[priority],
        priorityRationale: rationale,
        slaLabel: SLA_LABEL[priority],
        dueAt: dueAt.toISOString(),
        dueLabel: formatDue(dueAt.toISOString(), now),
        status: 'pending' as const,
      };
      ctx.setPendingDraft({ kind: 'new', draft });
      ctx.emit({ type: 'card', card: { kind: 'draft', draft } });
      r.step('montou o rascunho', `${draft.type} · ${draft.category} · ${draft.priorityLabel}`);
      ctx.memory.awaiting = undefined;
      ctx.memory.partialTicket = undefined;
      return {
        status: 'draft_shown',
        draft: { title: draft.title, priority: draft.priorityLabel, rationale, sla: draft.slaLabel, due: draft.dueLabel },
        instruction: 'Explique a prioridade em uma frase e peça para conferir o rascunho e clicar em Confirmar. Não diga que o chamado foi criado.',
      };
    },
  });

  const draftTicketUpdate = defineTool({
    name: 'draftTicketUpdate',
    description:
      'Monta, para confirmação, um complemento (kind="comment") a um chamado ABERTO do funcionário ou a reabertura (kind="reopen") de um chamado resolvido há até 7 dias. Nada muda até ele clicar em Confirmar.',
    input: z.object({
      number: z.string(),
      kind: z.enum(['comment', 'reopen']),
      note: z.string().describe('Texto que será registrado no chamado, escrito para o analista'),
    }),
    async execute({ number, kind, note }, r) {
      const ticket = await ctx.tickets.getTicket(number.trim().toUpperCase(), me, retry);
      if (!ticket) return { status: 'not_found' };
      const view = toTicketView(ticket, ctx.now());
      if (kind === 'comment' && !view.open) {
        return { status: 'not_open', reopenable: view.reopenable, instruction: view.reopenable ? 'Ofereça reabrir.' : 'Ofereça abrir um novo chamado.' };
      }
      if (kind === 'reopen' && !view.reopenable) {
        return { status: 'cannot_reopen', instruction: 'Só é possível reabrir chamados resolvidos há até 7 dias. Ofereça abrir um novo chamado.' };
      }
      const draft = { id: `U-${ctx.newId().slice(0, 3).toUpperCase()}`, kind, ticketNumber: view.number, ticketTitle: view.title, note, status: 'pending' as const };
      ctx.setPendingDraft({ kind: 'update', draft });
      ctx.emit({ type: 'card', card: { kind: 'update-draft', draft } });
      r.step(kind === 'comment' ? `preparou o complemento do ${view.number}` : `preparou a reabertura do ${view.number}`, note);
      ctx.memory.focusTicket = view.number;
      ctx.memory.awaiting = undefined;
      return { status: 'draft_shown', instruction: 'Peça para conferir e clicar em Confirmar.' };
    },
  });

  const askWithOptions = defineTool({
    name: 'askWithOptions',
    description:
      'Mostra uma pergunta com opções rápidas clicáveis. Use quando faltar uma informação com respostas previsíveis (ex.: quem está sendo afetado: "Só eu", "Minha equipe", "Toda a empresa", "Não sei").',
    input: z.object({
      question: z.string(),
      options: z.array(z.string()).min(2).max(5),
      expects: z.enum(['impact', 'ticket_choice', 'note', 'similar_choice', 'other']).default('other'),
    }),
    silent: true,
    async execute({ question, options, expects }) {
      ctx.emit({ type: 'card', card: { kind: 'options', question, options } });
      ctx.memory.awaiting = expects === 'other' ? undefined : expects;
      return { shown: true, instruction: 'Não repita a pergunta no texto; ela já aparece com as opções.' };
    },
  });

  const transferToAnalyst = defineTool({
    name: 'transferToAnalyst',
    description:
      'Transfere a conversa para um analista humano. Use quando o funcionário pedir, em caso crítico (algo parado para equipe/empresa), quando um chamado dele estiver vencido e ele aceitar, ou quando você não tiver segurança sobre o que fazer. Depois disso você para de responder.',
    input: z.object({
      reason: z.enum(['user_request', 'critical', 'overdue', 'low_confidence']),
      summary: z.string().describe('Resumo do caso para o analista: quem, o quê, desde quando, o que já foi feito, chamado relacionado'),
      ticketNumber: z.string().optional(),
    }),
    async execute({ reason: requested, summary, ticketNumber }, r) {
      let reason: TransferReason = requested;
      // Chamado vencido é motivo de transferência por si só (Anexo A): vai para o N2 com o motivo certo.
      if (ticketNumber && (reason === 'user_request' || reason === 'low_confidence')) {
        const t = await ctx.tickets.getTicket(ticketNumber.toUpperCase(), me, retry).catch(() => null);
        if (t && slaStatus(t, ctx.now()).overdue) reason = 'overdue';
      }
      const queue = queueFor(reason);
      ctx.emit({ type: 'transfer', request: { reason, summary, ticketNumber: ticketNumber?.toUpperCase(), queue } });
      r.step(`transferiu para o ${queue}`, `${TRANSFER_REASON_LABEL[reason]} — ${summary}`);
      return { transferred: true, queue, instruction: `Avise que um analista do ${queue} vai assumir e que o prazo de primeira resposta segue o SLA. Não faça mais perguntas.` };
    },
  });

  const redirectOutOfScope = defineTool({
    name: 'redirectOutOfScope',
    description: 'Use quando o assunto não é de TI (RH, financeiro, facilities etc.). Retorna o canal certo para indicar.',
    input: z.object({ area: z.enum(['RH', 'Financeiro', 'Facilities', 'Outro']) }),
    async execute({ area }, r) {
      const channels: Record<typeof area, string> = {
        RH: 'Portal do RH (rh.nexo.com.br) ou ramal 4100',
        Financeiro: 'Central do Financeiro (financeiro@nexo.com.br) ou ramal 4200',
        Facilities: 'Facilities pelo app Nexo Predial ou ramal 4300',
        Outro: 'a Central do Colaborador (ramal 4500)',
      };
      r.step('identificou assunto fora de TI', `${area} → ${channels[area]}`);
      return { channel: channels[area] };
    },
  });

  const recordDecision = defineTool({
    name: 'recordDecision',
    description:
      'OBRIGATÓRIO uma vez por resposta, antes do texto final: registra o que você entendeu, a ação tomada, sua confiança (0 a 1) e o porquê. Confiança abaixo de 0.5 leva a conversa para um analista.',
    input: z.object({
      intent: z.enum(INTENTS),
      understood: z.string().describe('O que o funcionário quer, em uma frase'),
      action: z.string().describe('O que você fez nesta resposta, em uma frase'),
      confidence: z.number().min(0).max(1),
      reasoning: z.string().describe('Por que essa ação, citando a regra do service desk ou o artigo usado'),
    }),
    silent: true,
    async execute(input) {
      ctx.emit({ type: 'decision', decision: { ...input, source: 'model' } });
      return { recorded: true };
    },
  });

  return [searchHelpCenter, listMyTickets, getTicket, draftTicket, draftTicketUpdate, askWithOptions, transferToAnalyst, redirectOutOfScope, recordDecision];
}

export type Toolset = ReturnType<typeof createTools>;

/**
 * Executa uma ferramenta emitindo os passos visíveis e convertendo falhas do legado
 * em resposta estruturada para o modelo (ele avisa o funcionário em vez de travar).
 */
export async function runTool(ctx: TurnContext, tool: ToolDef, rawInput: unknown): Promise<unknown> {
  const started = Date.now();
  const steps: ActionStep[] = [];
  const reporter: StepReporter = {
    step(label, detail) {
      const step: ActionStep = { id: ctx.newId(), tool: tool.name, label, status: 'done', detail, durationMs: Date.now() - started };
      steps.push(step);
      ctx.emit({ type: 'action', step });
    },
  };
  try {
    const input = tool.input.parse(rawInput);
    return await tool.execute(input, reporter);
  } catch (err) {
    const unavailable = err instanceof TicketsUnavailableError;
    const message = unavailable
      ? 'O sistema de chamados está fora do ar por alguns instantes.'
      : err instanceof z.ZodError
        ? `Parâmetros inválidos: ${err.issues.map((i) => i.message).join('; ')}`
        : 'Falha inesperada ao executar a ação.';
    if (!tool.silent) {
      ctx.emit({
        type: 'action',
        step: { id: ctx.newId(), tool: tool.name, label: unavailable ? 'sistema de chamados indisponível' : 'ação falhou', status: 'error', detail: message, durationMs: Date.now() - started },
      });
    }
    return { error: true, message, instruction: unavailable ? 'Peça desculpas e sugira tentar de novo em instantes. Não invente dados.' : 'Corrija os parâmetros ou explique o problema.' };
  }
}
