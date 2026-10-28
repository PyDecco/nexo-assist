import { findSimilarTickets, slaStatus, type Impact, type Intent, type TicketCategory, type TicketType, type Urgency } from '@nexo/core';
import type { AgentRunner, TurnContext, TurnInput } from './context';
import { searchArticles } from './help-center';
import { createTools, runTool, type ToolDef } from './tools';

/**
 * Runner determinístico: mesmas ferramentas e mesmo protocolo de eventos do agent com LLM,
 * mas decisões por regras. Usado sem chave do Gemini, no CI e nos testes de fluxo.
 */
export class ScriptedRunner implements AgentRunner {
  readonly name = 'scripted';
  readonly model = 'regras determinísticas';

  constructor(private readonly options: { chunkDelayMs?: number } = {}) {}

  async run(ctx: TurnContext, input: TurnInput): Promise<void> {
    const tools = new Map(createTools(ctx).map((t) => [t.name, t as ToolDef]));
    const call = async <T = Record<string, unknown>>(name: string, args: unknown) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`ferramenta ${name} inexistente`);
      return (await runTool(ctx, tool, args)) as T;
    };
    const say = async (text: string) => {
      for (const chunk of text.match(/.{1,24}(\s|$)/g) ?? [text]) {
        ctx.emit({ type: 'text', delta: chunk });
        if (this.options.chunkDelayMs) await new Promise((r) => setTimeout(r, this.options.chunkDelayMs));
      }
    };
    const decide = (intent: Intent, understood: string, action: string, confidence: number, reasoning: string) =>
      call('recordDecision', { intent, understood, action, confidence, reasoning });

    const raw = input.message.trim();
    const m = normalize(raw);
    const mem = ctx.memory;
    const number = raw.match(/\b(INC|REQ)-\d{4,6}\b/i)?.[0]?.toUpperCase();

    // 1. Resposta à pergunta de impacto de um chamado em construção.
    if (mem.awaiting === 'impact' && mem.partialTicket) {
      const impact = parseImpact(m) ?? 'individual';
      const p = mem.partialTicket;
      const urgency = parseUrgency(m) ?? (p.urgency as Urgency);
      const description = `${p.description}${parseUrgency(m) ? ` ${raw}` : ''}`.trim();
      await decide('new_ticket', `Afetados: ${impact}. Quer abrir um chamado sobre "${p.title}".`, 'Classifiquei a prioridade e montei o rascunho.', parseImpact(m) ? 0.85 : 0.6, 'Anexo A: prioridade combina impacto e urgência; o chamado só é criado após confirmação.');
      const res = await call('draftTicket', { type: p.type, category: p.category, title: p.title, description, impact, urgency, impactConfirmedByUser: true, ignoreSimilar: true });
      if (res.status === 'draft_shown') {
        const draft = ctx.pendingDraft?.kind === 'new' ? ctx.pendingDraft.draft : undefined;
        await say(`Coloquei prioridade ${draft?.priorityLabel.toLowerCase() ?? ''}: ${draft?.priorityRationale ?? ''} A resposta chega ${draft?.dueLabel ?? 'no prazo'}. Confira antes de eu criar:`);
      } else {
        await say('Não consegui montar o rascunho agora. Pode tentar de novo em instantes?');
      }
      return;
    }

    // 2. Fora do escopo de TI.
    const area = outOfScopeArea(m);
    if (area) {
      await decide('out_of_scope', `Assunto de ${area}, não de TI.`, `Indiquei o canal de ${area}.`, 0.9, 'Anexo A: apenas assuntos de TI; outros são redirecionados.');
      const res = await call<{ channel: string }>('redirectOutOfScope', { area });
      await say(`Esse assunto não é de TI, então não consigo resolver por aqui. Procure ${res.channel}. Se tiver algo de TI, estou à disposição.`);
      return;
    }

    // 3. Pedido de analista.
    if (/\b(analista|atendente|humano|falar com (alguem|uma pessoa))\b/.test(m)) {
      const ticket = number ?? mem.focusTicket;
      const recent = input.history.filter((h) => h.role === 'user').slice(-3).map((h) => h.content);
      const summary = `${ctx.user.name} (${ctx.user.department}) pediu um analista.${ticket ? ` Chamado relacionado: ${ticket}.` : ''} Últimas mensagens: ${[...recent, raw].join(' | ')}`;
      const reason = ticket && (await isOverdue(ctx, ticket)) ? 'overdue' : 'user_request';
      await decide('talk_to_analyst', 'Quer falar com um analista.', 'Transferi a conversa com um resumo do caso.', 0.95, `Anexo A: transferir quando o funcionário pede${reason === 'overdue' ? ' e o chamado está vencido' : ''}.`);
      const res = await call<{ queue: string }>('transferToAnalyst', { reason, summary, ticketNumber: ticket });
      await say(`Encaminhei para o ${res.queue}. Um analista vai falar com você por aqui; enquanto isso, eu fico em pausa.`);
      return;
    }

    // 4. Complemento de chamado.
    if (/adicionar informac/.test(m) && mem.focusTicket) {
      mem.awaiting = 'note';
      await decide('ticket_update', `Quer complementar o ${mem.focusTicket}.`, 'Perguntei o que acrescentar.', 0.9, 'Anexo A: chamado aberto é atualizado, não duplicado.');
      await say(`Claro. O que você quer acrescentar ao ${mem.focusTicket}?`);
      return;
    }
    if (mem.awaiting === 'note' && mem.focusTicket) {
      await decide('ticket_update', `Complemento para o ${mem.focusTicket}.`, 'Montei o complemento para confirmação.', 0.88, 'Anexo A: só atualiza após confirmação do funcionário.');
      await call('draftTicketUpdate', { number: mem.focusTicket, kind: 'comment', note: raw });
      await say('Confira o complemento antes de eu registrar no chamado:');
      return;
    }

    // 5. Escolha diante de chamado parecido (duplicidade).
    if (mem.awaiting === 'similar_choice' && mem.focusTicket && mem.partialTicket) {
      const p = mem.partialTicket;
      if (/reabr/.test(m) || /complement|mesmo|sim/.test(m)) {
        const kind = /reabr/.test(m) ? 'reopen' : 'comment';
        await decide('ticket_update', `É o mesmo problema do ${mem.focusTicket}.`, kind === 'reopen' ? 'Preparei a reabertura.' : 'Preparei o complemento.', 0.85, 'Anexo A: sem duplicidade; resolvidos há até 7 dias podem ser reabertos.');
        const res = await call('draftTicketUpdate', { number: mem.focusTicket, kind, note: p.description });
        await say(res.status === 'draft_shown' ? 'Confira antes de eu registrar:' : 'Não foi possível preparar isso para esse chamado.');
        return;
      }
      if (/diferente|outro|novo/.test(m)) {
        mem.awaiting = 'impact';
        mem.focusTicket = undefined;
        await decide('new_ticket', 'É um problema diferente do chamado parecido.', 'Perguntei quem é afetado.', 0.8, 'Anexo A: todo chamado precisa de afetados.');
        await call('askWithOptions', { question: 'Quem está sendo afetado?', options: ['Só eu', 'Minha equipe', 'Toda a empresa', 'Não sei'], expects: 'impact' });
        await say('Entendi, vou abrir um chamado novo.');
        return;
      }
    }

    if (/^n(a|ã)o,? obrigad/.test(m) || /^(obrigad|valeu|resolveu)/.test(m)) {
      await decide('smalltalk', 'Encerrando o assunto.', 'Agradeci e fiquei à disposição.', 0.9, 'Nada a fazer.');
      await say('Por nada! Se precisar de algo de TI, é só chamar.');
      return;
    }

    // 6. Consulta de chamado por número.
    if (number) {
      const res = await call<{ found?: boolean; ticket?: { overdue: boolean; status: string; lastUpdate: string; sla: string; priority: string; open: boolean } }>('getTicket', { number });
      if (!res.found || !res.ticket) {
        await decide('ticket_status', `Quer saber do ${number}.`, 'Não encontrei entre os chamados dele.', 0.8, 'Anexo A: informações de um chamado só para quem o abriu.');
        await say(`Não encontrei o ${number} entre os seus chamados. Só consigo mostrar chamados abertos por você.`);
        return;
      }
      const t = res.ticket;
      if (t.overdue) {
        await decide('ticket_status', `Quer saber do ${number}.`, 'Mostrei o status e ofereci um analista porque o prazo venceu.', 0.9, `Anexo A: prazo de ${t.sla} para prioridade ${t.priority.toLowerCase()} vale para cada atualização; vencido → oferecer transferência.`);
        await say(`Está sem atualização ${t.lastUpdate}, acima do prazo de ${t.sla} para prioridade ${t.priority.toLowerCase()}. Quer que eu chame um analista?`);
        await call('askWithOptions', { question: 'Como prefere seguir?', options: ['Falar com um analista', 'Adicionar informação', 'Não, obrigado'], expects: 'other' });
      } else {
        await decide('ticket_status', `Quer saber do ${number}.`, 'Mostrei o status do chamado.', 0.9, 'Consulta direta ao serviço de chamados.');
        await say(t.open ? `Está ${t.status.toLowerCase()}, atualizado ${t.lastUpdate}, dentro do prazo.` : `Esse chamado está ${t.status.toLowerCase()}.`);
      }
      return;
    }

    // 7. Status sem número.
    if (/(status|andamento|meus? chamados?|como (esta|anda))/.test(m)) {
      const res = await call<{ count?: number; error?: boolean }>('listMyTickets', { filter: 'open', presentation: 'selector' });
      await decide('ticket_status', 'Quer saber de um chamado, sem informar o número.', 'Listei os chamados abertos para ele escolher.', 0.9, 'História 2: consultar sem lembrar o número.');
      if (res.error) await say('O sistema de chamados está fora do ar por alguns instantes. Pode tentar de novo daqui a pouco?');
      else if (!res.count) await say('Você não tem chamados abertos no momento.');
      else if (res.count === 1) await say('Você tem 1 chamado aberto:');
      else await say(`Você tem ${res.count} chamados abertos. Sobre qual deles quer saber?`);
      return;
    }

    if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai)\b/.test(m) && m.length < 25) {
      await decide('smalltalk', 'Cumprimento.', 'Me apresentei.', 0.95, 'Início de conversa.');
      await say(`Olá, ${ctx.user.name.split(' ')[0]}! Sou o Nexo Assist. Me conte o que está acontecendo, ou pergunte sobre um chamado seu.`);
      return;
    }

    // 8. Dúvida ou problema novo.
    const problem = /(nao (conecta|funciona|abre|liga|imprime|consigo|sincroniza)|erro|parou|lent|trav|caiu|bloque|quebr|nao entra)/.test(m);
    const request = /(preciso de|quero (um|uma|acesso)|solicit|pedido|instalar|acesso (a|ao))/.test(m);
    const hits = searchArticles(raw);
    const top = hits[0];
    const kbExcluded = top?.id === 'KB-001' && /windows 11|win 11/.test(m);
    const declinedArticle = /nao resolveu|abrir (um )?chamado/.test(m);

    // Problema ou pedido: primeiro os chamados dele (sem duplicidade), depois a central de ajuda.
    if ((problem || request) && !declinedArticle) {
      const partial = buildPartial(raw);
      const listed = await call<{ error?: boolean }>('listMyTickets', { filter: 'all', presentation: 'none' });
      const mine = listed.error ? [] : await ctx.tickets.listTickets(ctx.user.email, 'all').catch(() => []);
      const similar = findSimilarTickets(mine, partial, ctx.now());
      const match = similar.open[0] ?? similar.reopenable[0];
      if (match) {
        const isOpen = similar.open.includes(match);
        mem.partialTicket = partial;
        mem.focusTicket = match.number;
        mem.awaiting = 'similar_choice';
        await decide('ticket_update', `Mesmo problema do ${match.number}.`, isOpen ? 'Ofereci complementar o chamado aberto.' : 'Ofereci reabrir o chamado resolvido.', 0.8, isOpen ? 'Anexo A: chamado aberto sobre o mesmo problema é atualizado, não duplicado.' : 'Anexo A: resolvidos há até 7 dias podem ser reabertos.');
        await say(isOpen ? `Você já tem o ${match.number} aberto sobre isso ("${match.title}"). Quer que eu complemente esse chamado em vez de abrir outro?` : `O ${match.number} ("${match.title}") foi resolvido há poucos dias. Quer reabrir esse chamado?`);
        await call('askWithOptions', { question: 'O que prefere?', options: isOpen ? ['Complementar o chamado', 'É um problema diferente'] : ['Reabrir o chamado', 'É um problema diferente'], expects: 'similar_choice' });
        return;
      }
    }

    if (top && !kbExcluded && !declinedArticle && (!problem || /\?$/.test(raw) || !request)) {
      await call('searchHelpCenter', { query: raw });
      await decide('question', 'Dúvida que a central de ajuda responde.', `Respondi com o artigo ${top.id}.`, 0.85, `Artigo "${top.title}" cobre o caso; não é preciso abrir chamado.`);
      await say(`Pela central de ajuda (${top.title}): ${top.body}`);
      if (problem) {
        mem.partialTicket = buildPartial(raw);
        await call('askWithOptions', { question: 'Isso resolveu?', options: ['Resolveu, obrigado', 'Não resolveu, abrir chamado'], expects: 'other' });
      }
      return;
    }

    if (problem || request || declinedArticle) {
      if (!declinedArticle) await call('searchHelpCenter', { query: raw });
      const partial = declinedArticle && mem.partialTicket ? mem.partialTicket : buildPartial(raw);
      mem.partialTicket = partial;
      const impact = parseImpact(m);
      if (!impact) {
        mem.awaiting = 'impact';
        await decide('new_ticket', `Problema/pedido novo: ${partial.title}.`, 'Perguntei quem é afetado para classificar a prioridade.', 0.8, `${kbExcluded ? 'O artigo do erro 809 vale só para Windows 10. ' : ''}Anexo A: todo chamado precisa de afetados.`);
        await say(kbExcluded ? 'O artigo do erro 809 vale só para Windows 10 — o seu é Windows 11. Vou abrir um chamado.' : 'Vou abrir um chamado para isso.');
        await call('askWithOptions', { question: 'Quem está sendo afetado?', options: ['Só eu', 'Minha equipe', 'Toda a empresa', 'Não sei'], expects: 'impact' });
        return;
      }
      const urgency = parseUrgency(m) ?? (partial.urgency as Urgency);
      const collectiveStop = impact !== 'individual' && (urgency === 'blocked' || urgency === 'deadline_today');
      await decide('new_ticket', `Problema/pedido novo afetando ${impact}.`, collectiveStop ? 'Montei o rascunho e vou chamar um analista (crítico).' : 'Montei o rascunho.', 0.85, 'Anexo A: prioridade = impacto × urgência; crítico também é transferido.');
      const res = await call('draftTicket', { type: partial.type, category: partial.category, title: partial.title, description: partial.description, impact, urgency, impactConfirmedByUser: true, ignoreSimilar: false });
      if (res.status === 'similar_found') {
        await say(`Já existe um chamado parecido (${mem.focusTicket}). Quer complementar esse chamado em vez de abrir outro?`);
        await call('askWithOptions', { question: 'O que prefere?', options: ['Complementar o chamado', 'É um problema diferente'], expects: 'similar_choice' });
        return;
      }
      await say('Confira o rascunho antes de eu criar:');
      return;
    }

    // 9. Sem segurança: o orquestrador transfere (confiança < 0,5).
    await decide('unclear', 'Não consegui identificar o pedido.', 'Pedi ajuda de um analista.', 0.35, 'Anexo A: transferir quando o agent não tem segurança sobre o que fazer.');
    await say('Não tenho certeza de como ajudar com isso.');
  }
}

export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

function parseImpact(m: string): Impact | undefined {
  if (/(toda a empresa|empresa toda|todo mundo|ninguem consegue|empresa inteira)/.test(m)) return 'company';
  if (/(minha equipe|meu time|nosso time|equipe toda|setor|departamento|todos da equipe)/.test(m)) return 'team';
  if (/(so eu|somente eu|apenas eu|so comigo|so o meu)/.test(m)) return 'individual';
  return undefined;
}

function parseUrgency(m: string): Urgency | undefined {
  if (/(reuniao|hoje|cliente|apresentacao|prazo|ate as|\d{1,2}h)/.test(m)) return 'deadline_today';
  if (/(nao consigo trabalhar|parad|nada funciona|impedid)/.test(m)) return 'blocked';
  return undefined;
}

function guessCategory(m: string): TicketCategory {
  if (/(vpn|rede|wi-?fi|internet|conexao)/.test(m)) return 'Rede e VPN';
  if (/(senha|acesso|permissao|login|bloque|sap)/.test(m)) return 'Acesso';
  if (/(e-?mail|outlook|caixa)/.test(m)) return 'E-mail';
  if (/(notebook|computador|monitor|mouse|teclado|impressora|tela|bateria)/.test(m)) return 'Hardware';
  if (/(programa|software|instalar|excel|word|teams|aplicativo|licenca)/.test(m)) return 'Software';
  return 'Outros';
}

function buildPartial(raw: string) {
  const m = normalize(raw);
  const type: TicketType = /(preciso de|quero (um|uma|acesso)|solicit|pedido|instalar|acesso (a|ao))/.test(m) && !/(erro|nao (funciona|conecta))/.test(m) ? 'REQ' : 'INC';
  const first = raw.split(/[.!?\n]/)[0]?.trim() ?? raw;
  const title = first.length > 80 ? `${first.slice(0, 77)}…` : first;
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: raw,
    type,
    category: guessCategory(m),
    urgency: parseUrgency(m) ?? (type === 'REQ' ? 'no_urgency' : 'has_workaround'),
  };
}

function outOfScopeArea(m: string): 'RH' | 'Financeiro' | 'Facilities' | undefined {
  if (/\b(ferias|salario|holerite|beneficio|plano de saude|vale.refeicao|ponto eletronico|rh)\b/.test(m)) return 'RH';
  if (/\b(reembolso|nota fiscal|pagamento de fornecedor|adiantamento)\b/.test(m)) return 'Financeiro';
  if (/\b(ar.condicionado|limpeza|cadeira|estacionamento|copa|lampada|sala de reuniao)\b/.test(m)) return 'Facilities';
  return undefined;
}

async function isOverdue(ctx: TurnContext, number: string): Promise<boolean> {
  try {
    const t = await ctx.tickets.getTicket(number, ctx.user.email);
    return t ? slaStatus(t, ctx.now()).overdue : false;
  } catch {
    return false;
  }
}
