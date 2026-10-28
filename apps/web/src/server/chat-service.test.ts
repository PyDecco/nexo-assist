import { ScriptedRunner, type AgentRunner } from '@nexo/agent';
import { SEED_USERS, type ChatStreamEvent, type User } from '@nexo/core';
import { TicketsClient } from '@nexo/tickets-client';
import { createTestTicketsService } from '@nexo/tickets-service/testing';
import { describe, expect, it } from 'vitest';
import { ChatError, ChatService } from './chat-service';
import { openWebDb } from './db';
import { MESSAGE_LIMIT } from './env';
import { signSession, verifySession } from './session';
import { Store } from './store';

const now = new Date('2026-10-28T13:00:00Z');
const user = (email: string) => SEED_USERS.find((u) => u.email === email) as User;
const ana = user('ana.souza@nexo.com.br');
const carla = user('carla.mendes@nexo.com.br');
const rafael = user('rafael.lima@nexo.com.br');

function setup(runner: AgentRunner = new ScriptedRunner(), dbPath = ':memory:') {
  const service = createTestTicketsService(now);
  const tickets = new TicketsClient({ baseUrl: service.baseUrl, token: service.token, fetch: service.fetch, backoffMs: [1], sleep: async () => {} });
  const store = new Store(openWebDb(dbPath), () => now);
  const chat = new ChatService({ store, tickets, runner, now: () => now });
  const send = async (convId: string, text: string, who = ana) => {
    const events: ChatStreamEvent[] = [];
    await chat.sendMessage(convId, who, text, (e) => events.push(e));
    return events;
  };
  return { chat, store, send, service, tickets };
}

describe('ChatService', () => {
  it('abre o chamado só depois de Confirmar (rascunho → confirmação)', async () => {
    const { chat, send, tickets } = setup();
    const conv = chat.currentConversation(ana);
    await send(conv.id, 'Meu notebook não conecta na VPN, erro 809, uso Windows 11');
    await send(conv.id, 'Só eu, tenho reunião com cliente às 14h');
    expect((await tickets.listTickets(ana.email, 'open')).some((t) => t.category === 'Rede e VPN')).toBe(false);

    const created = await chat.confirmDraft(conv.id, ana);
    expect(created[0]?.text).toMatch(/Pronto: abri o INC-20517 com prioridade alta/);
    const vpn = (await tickets.listTickets(ana.email, 'open')).find((t) => t.number === 'INC-20517');
    expect(vpn).toMatchObject({ category: 'Rede e VPN', priority: 'high', type: 'INC' });
    // O card do rascunho fica marcado como confirmado.
    const draftMsg = chat.getForEmployee(conv.id, ana).messages.find((m) => m.cards.some((c) => c.kind === 'draft'));
    expect(draftMsg?.cards.find((c) => c.kind === 'draft')).toMatchObject({ draft: { status: 'confirmed', createdTicket: 'INC-20517' } });
    await expect(chat.confirmDraft(conv.id, ana)).rejects.toBeInstanceOf(ChatError);
  });

  it('cancelar descarta o rascunho sem criar nada', async () => {
    const { chat, send, tickets } = setup();
    const conv = chat.currentConversation(ana);
    await send(conv.id, 'Preciso de um mouse novo, o meu quebrou, só eu, dá para trabalhar');
    const before = (await tickets.listTickets(ana.email)).length;
    chat.cancelDraft(conv.id, ana);
    expect((await tickets.listTickets(ana.email)).length).toBe(before);
    expect(chat.getForEmployee(conv.id, ana).conversation.pendingDraft).toBeNull();
  });

  it('transferência pausa o agent até o analista devolver', async () => {
    const { chat, send } = setup();
    const conv = chat.currentConversation(ana);
    const events = await send(conv.id, 'Quero falar com um analista');
    expect(events).toContainEqual({ type: 'state', state: 'waiting_analyst' });

    // Enquanto aguarda/está com analista, o agent não responde.
    const silent = await send(conv.id, 'Alguém aí?');
    expect(silent).toEqual([{ type: 'state', state: 'waiting_analyst' }]);

    await chat.assume(conv.id, rafael);
    chat.analystMessage(conv.id, rafael, 'Oi, Ana! Aqui é o Rafael.');
    expect(await send(conv.id, 'Oi Rafael')).toEqual([{ type: 'state', state: 'with_analyst' }]);

    chat.returnToAgent(conv.id, rafael);
    const back = await send(conv.id, 'Qual o horário do service desk?');
    expect(back.some((e) => e.type === 'text')).toBe(true);

    const msgs = chat.getForEmployee(conv.id, ana).messages.map((m) => `${m.role}:${m.text}`);
    expect(msgs).toContain('system:Transferida para Suporte N1 · 10:00');
    expect(msgs.some((m) => m.startsWith('system:Rafael Lima assumiu · agent pausado'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('system:Rafael Lima devolveu a conversa ao agent'))).toBe(true);
  });

  it('analista só responde depois de assumir; encerrar fecha a conversa', async () => {
    const { chat, send } = setup();
    const conv = chat.currentConversation(ana);
    await send(conv.id, 'Quero falar com um analista');
    expect(() => chat.analystMessage(conv.id, rafael, 'oi')).toThrow(/Assuma/);
    await chat.assume(conv.id, rafael);
    chat.close(conv.id, rafael);
    await expect(send(conv.id, 'oi?')).rejects.toMatchObject({ code: 'CLOSED' });
    expect(chat.currentConversation(ana).id).not.toBe(conv.id);
  });

  it('limite de 30 mensagens por sessão', async () => {
    const { chat, send, store } = setup();
    const conv = chat.currentConversation(ana);
    store.updateConversation(conv.id, { userMessageCount: MESSAGE_LIMIT - 1 });
    await send(conv.id, 'oi');
    await expect(send(conv.id, 'oi de novo')).rejects.toMatchObject({ code: 'LIMIT' });
  });

  it('privacidade: funcionário não acessa conversa de outro', async () => {
    const { chat, send } = setup();
    const conv = chat.currentConversation(ana);
    await expect(send(conv.id, 'oi', carla)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(() => chat.getForEmployee(conv.id, carla)).toThrow(ChatError);
  });

  it('confiança baixa transfere e aparece no console como "Agent pediu ajuda"', async () => {
    const { chat, send } = setup();
    const conv = chat.currentConversation(ana);
    const events = await send(conv.id, 'xpto blah');
    expect(events.some((e) => e.type === 'card' && e.card.kind === 'transfer')).toBe(true);
    const { items, counts } = chat.listForConsole(rafael, 'for_you');
    expect(counts.for_you).toBe(1);
    expect(items[0]?.tag).toBe('Agent pediu ajuda · confiança 35%');
  });

  it('decisão sintetizada quando o modelo não registra', async () => {
    const silentRunner: AgentRunner = {
      name: 'fake',
      model: 'fake',
      async run(ctx) {
        ctx.emit({ type: 'text', delta: 'Olá!' });
      },
    };
    const { chat, send } = setup(silentRunner);
    const conv = chat.currentConversation(ana);
    const events = await send(conv.id, 'oi');
    const decision = events.find((e) => e.type === 'decision');
    expect(decision).toMatchObject({ decision: { source: 'synthesized' } });
  });

  it('falha do modelo vira mensagem amigável, sem derrubar a conversa', async () => {
    const broken: AgentRunner = { name: 'fake', model: 'fake', run: async () => { throw new Error('boom'); } };
    const { chat, send } = setup(broken);
    const conv = chat.currentConversation(ana);
    const events = await send(conv.id, 'oi');
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(chat.getForEmployee(conv.id, ana).conversation.state).toBe('with_agent');
  });

  it('confirmar com o legado fora do ar mantém o rascunho para tentar de novo', async () => {
    const { chat, send, service } = setup();
    const conv = chat.currentConversation(ana);
    await send(conv.id, 'Preciso de um mouse novo, o meu quebrou, só eu, dá para trabalhar');
    service.outage.forceOutage(60_000);
    await expect(chat.confirmDraft(conv.id, ana)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(chat.getForEmployee(conv.id, ana).conversation.pendingDraft).not.toBeNull();
  });

  it('estado sobrevive a reinício (mesmo arquivo SQLite)', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const file = join(mkdtempSync(join(tmpdir(), 'nexo-')), 'web.db');
    const first = setup(new ScriptedRunner(), file);
    const conv = first.chat.currentConversation(ana);
    await first.send(conv.id, 'Quero falar com um analista');

    const second = setup(new ScriptedRunner(), file); // "reinício"
    const resumed = second.chat.currentConversation(ana);
    expect(resumed.id).toBe(conv.id);
    expect(resumed.state).toBe('waiting_analyst');
    expect(second.chat.getForEmployee(conv.id, ana).messages.length).toBeGreaterThan(2);
  });
});

describe('ChatService — corridas e permissões (revisão)', () => {
  const julia = user('julia.costa@nexo.com.br');

  it('duas confirmações simultâneas criam um único chamado', async () => {
    const { chat, send, tickets } = setup();
    const conv = chat.currentConversation(ana);
    await send(conv.id, 'Preciso de um mouse novo, o meu quebrou, só eu, dá para trabalhar');
    const before = (await tickets.listTickets(ana.email)).length;
    const results = await Promise.allSettled([chat.confirmDraft(conv.id, ana), chat.confirmDraft(conv.id, ana)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await tickets.listTickets(ana.email)).length).toBe(before + 1);
  });

  it('analista que assume durante o turno não é atropelado pela transferência do agent', async () => {
    const ref: { chat?: ChatService; convId: string } = { convId: '' };
    const racing: AgentRunner = {
      name: 'fake',
      model: 'fake',
      async run(ctx) {
        await ref.chat!.assume(ref.convId, rafael); // analista assume enquanto o agent "pensa"
        ctx.emit({ type: 'transfer', request: { reason: 'user_request', summary: 'x', queue: 'Suporte N1' } });
        ctx.emit({ type: 'decision', decision: { intent: 'talk_to_analyst', understood: 'x', action: 'x', confidence: 0.9, reasoning: 'x', source: 'model' } });
      },
    };
    const { chat, send } = setup(racing);
    ref.chat = chat;
    const conv = chat.currentConversation(ana);
    ref.convId = conv.id;
    const events = await send(conv.id, 'Quero um analista');
    expect(events).toContainEqual({ type: 'state', state: 'with_analyst' });
    const after = chat.getForEmployee(conv.id, ana).conversation;
    expect(after.state).toBe('with_analyst');
    expect(after.assignedAnalyst).toBe(rafael.email);
    expect(() => chat.analystMessage(conv.id, rafael, 'Oi')).not.toThrow();
  });

  it('mensagens para o analista não consomem o limite de 30', async () => {
    const { chat, send, store } = setup();
    const conv = chat.currentConversation(ana);
    await send(conv.id, 'Quero falar com um analista');
    store.updateConversation(conv.id, { userMessageCount: MESSAGE_LIMIT });
    await chat.assume(conv.id, rafael);
    await expect(send(conv.id, 'Ainda está aí?')).resolves.toEqual([{ type: 'state', state: 'with_analyst' }]);
    expect(() => chat.newConversation(ana)).toThrow(/analista/);
  });

  it('só quem assumiu pode devolver ou encerrar', async () => {
    const { chat, send } = setup();
    const conv = chat.currentConversation(ana);
    await send(conv.id, 'Quero falar com um analista');
    await chat.assume(conv.id, rafael);
    expect(() => chat.returnToAgent(conv.id, julia)).toThrow(/Outro analista/);
    expect(() => chat.close(conv.id, julia)).toThrow(/Outro analista/);
    chat.close(conv.id, rafael);
    expect(() => chat.close(conv.id, rafael)).toThrow(/encerrada/);
    expect(() => chat.analystMessage(conv.id, rafael, 'oi')).toThrow(/encerrada/);
  });
});

describe('sessão', () => {
  it('assina e valida o cookie; rejeita adulteração e expiração', () => {
    const token = signSession('ana.souza@nexo.com.br', 's3', 1000);
    expect(verifySession(token, 's3', 2000)).toBe('ana.souza@nexo.com.br');
    expect(verifySession(token, 'outro', 2000)).toBeNull();
    expect(verifySession(`${token}x`, 's3', 2000)).toBeNull();
    expect(verifySession(token, 's3', 1000 + 8 * 24 * 3600 * 1000)).toBeNull();
  });
});
