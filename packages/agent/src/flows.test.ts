import type { Card } from '@nexo/core';
import { describe, expect, it } from 'vitest';
import { searchArticles } from './help-center';
import { ScriptedRunner } from './scripted-runner';
import { createSession } from './test-utils';

const runner = new ScriptedRunner();
const cardKinds = (cards: Card[]) => cards.map((c) => c.kind);

describe('fluxos do agent (runner determinístico)', () => {
  it('história 1: responde dúvida pela central sem abrir chamado', async () => {
    const s = createSession(runner);
    const r = await s.send('Qual o horário do service desk?');
    expect(r.actions).toContain('buscou na central de ajuda');
    expect(r.text).toMatch(/8h às 18h/);
    expect(s.getDraft()).toBeNull();
    expect(r.decision).toMatchObject({ decision: { intent: 'question' } });
  });

  it('história 2: consulta sem número → seletor → vencido → oferta de analista', async () => {
    const s = createSession(runner);
    const r1 = await s.send('Qual o status do meu chamado?');
    expect(r1.actions).toContain('consultou seus chamados');
    expect(cardKinds(r1.cards)).toEqual(['ticket-selector']);
    expect(r1.text).toMatch(/3 chamados abertos/);

    const r2 = await s.send('INC-20311 · Notebook lento após atualização');
    expect(r2.actions).toEqual(['consultou o INC-20311', 'calculou o prazo']);
    const ticketCard = r2.cards.find((c) => c.kind === 'ticket');
    expect(ticketCard?.kind === 'ticket' && ticketCard.ticket.overdue).toBe(true);
    expect(r2.text).toMatch(/acima do prazo de 3 dias úteis/);
    expect(r2.cards.find((c) => c.kind === 'options')).toMatchObject({ options: ['Falar com um analista', 'Adicionar informação', 'Não, obrigado'] });

    const r3 = await s.send('Falar com um analista');
    expect(r3.transfer).toMatchObject({ request: { reason: 'overdue', ticketNumber: 'INC-20311', queue: 'Suporte N2' } });
  });

  it('história 3: complementa chamado aberto com rascunho para confirmação', async () => {
    const s = createSession(runner);
    await s.send('INC-20298');
    const r1 = await s.send('Adicionar informação');
    expect(r1.text).toMatch(/acrescentar ao INC-20298/);
    const r2 = await s.send('O gestor da pasta já aprovou por e-mail');
    expect(cardKinds(r2.cards)).toEqual(['update-draft']);
    expect(s.getDraft()).toMatchObject({ kind: 'update', draft: { kind: 'comment', ticketNumber: 'INC-20298' } });
  });

  it('história 4: VPN 809 no Windows 11 → pergunta afetados → rascunho com prioridade alta', async () => {
    const s = createSession(runner);
    const r1 = await s.send('Meu notebook não conecta na VPN desde ontem. Aparece o erro 809. Uso Windows 11.');
    expect(r1.actions).toContain('buscou na central de ajuda');
    expect(r1.text).toMatch(/só para Windows 10/);
    expect(r1.cards.find((c) => c.kind === 'options')).toMatchObject({ question: 'Quem está sendo afetado?' });

    const r2 = await s.send('Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.');
    expect(r2.actions).toEqual(['classificou a prioridade', 'consultou o SLA', 'montou o rascunho']);
    const draft = s.getDraft();
    expect(draft).toMatchObject({ kind: 'new', draft: { type: 'INC', category: 'Rede e VPN', priority: 'high', impact: 'individual', status: 'pending' } });
    // Nada foi criado ainda: o chamado só nasce na confirmação.
    const open = await s.tickets.listTickets('ana.souza@nexo.com.br', 'open');
    expect(open.some((t) => t.category === 'Rede e VPN')).toBe(false);
  });

  it('sem duplicidade: problema igual a chamado aberto propõe complemento', async () => {
    const s = createSession(runner);
    const r = await s.send('Meu notebook está muito lento depois da atualização do Windows, só eu, mas dá para trabalhar');
    expect(r.actions).toContain('consultou seus chamados');
    expect(r.text).toMatch(/INC-20311/);
    expect(s.getDraft()).toBeNull();
    const r2 = await s.send('Complementar o chamado');
    expect(s.getDraft()).toMatchObject({ kind: 'update', draft: { kind: 'comment', ticketNumber: 'INC-20311' } });
    expect(cardKinds(r2.cards)).toEqual(['update-draft']);
  });

  it('reabertura: senha do SAP bloqueada de novo (resolvido há 4 dias)', async () => {
    const s = createSession(runner);
    const r = await s.send('A senha do SAP bloqueou de novo, só eu, não consigo trabalhar');
    expect(r.text).toMatch(/INC-20150/);
    await s.send('Quero reabrir');
    expect(s.getDraft()).toMatchObject({ kind: 'update', draft: { kind: 'reopen', ticketNumber: 'INC-20150' } });
  });

  it('privacidade: chamado de outra pessoa não é revelado', async () => {
    const s = createSession(runner);
    const r = await s.send('Qual o status do REQ-10458?');
    expect(r.text).toMatch(/Não encontrei o REQ-10458 entre os seus chamados/);
    expect(r.cards).toEqual([]);
    expect(JSON.stringify(r.events)).not.toMatch(/SAP módulo FI/);
  });

  it('fora de escopo: RH é redirecionado', async () => {
    const s = createSession(runner);
    const r = await s.send('Como faço para marcar minhas férias?');
    expect(r.actions).toEqual(['identificou assunto fora de TI']);
    expect(r.text).toMatch(/Portal do RH/);
  });

  it('caso crítico: equipe parada gera rascunho com prioridade crítica', async () => {
    const s = createSession(runner);
    await s.send('A impressora do financeiro parou, minha equipe toda está parada e não consegue trabalhar');
    expect(s.getDraft()).toMatchObject({ kind: 'new', draft: { priority: 'critical' } });
  });

  it('pedido explícito de analista transfere com resumo', async () => {
    const s = createSession(runner);
    const r = await s.send('Quero falar com um analista');
    expect(r.transfer).toMatchObject({ request: { reason: 'user_request' } });
    expect(r.transfer?.type === 'transfer' && r.transfer.request.summary).toMatch(/Ana Souza/);
  });

  it('sem segurança: decisão com confiança baixa', async () => {
    const s = createSession(runner);
    const r = await s.send('xpto blah');
    expect(r.decision?.type === 'decision' && r.decision.decision.confidence).toBeLessThan(0.5);
  });

  it('legado instável: falha visível e resposta honesta', async () => {
    const s = createSession(runner);
    s.service.outage.forceOutage(60_000);
    const r = await s.send('Qual o status do meu chamado?');
    expect(r.actions.some((a) => a.startsWith('serviço de chamados instável'))).toBe(true);
    expect(r.actions).toContain('sistema de chamados indisponível');
    expect(r.text).toMatch(/fora do ar/);
  });
});

describe('central de ajuda', () => {
  it('encontra o artigo da VPN 809', () => {
    expect(searchArticles('vpn erro 809')[0]?.id).toBe('KB-001');
  });
});
