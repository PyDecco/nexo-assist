import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { openDb } from './db';
import { OutageSimulator } from './outage';
import { TicketRepository } from './repository';
import { seedIfEmpty } from './seed';

const TOKEN = 'test-token';
const ANA = 'ana.souza@nexo.com.br';
const CARLA = 'carla.mendes@nexo.com.br';
const headers = { 'x-service-token': TOKEN };

function setup() {
  const repo = new TicketRepository(openDb(':memory:'));
  seedIfEmpty(repo);
  const outage = new OutageSimulator(0, 1000);
  return { app: buildApp({ repo, outage, serviceToken: TOKEN }), outage };
}

describe('tickets-service', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('exige token de serviço', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/tickets?requester=${ANA}` });
    expect(res.statusCode).toBe(401);
  });

  it('lista só os chamados do solicitante', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/tickets?requester=${ANA}&status=open`, headers });
    const numbers = res.json().tickets.map((t: { number: string }) => t.number).sort();
    expect(numbers).toEqual(['INC-20298', 'INC-20311', 'REQ-10442']);
  });

  it('privacidade: chamado de outra pessoa responde 404', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/tickets/REQ-10458?requester=${ANA}`, headers });
    expect(res.statusCode).toBe(404);
    const own = await ctx.app.inject({ method: 'GET', url: `/tickets/REQ-10458?requester=${CARLA}`, headers });
    expect(own.statusCode).toBe(200);
  });

  it('cria chamado com número sequencial', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/tickets',
      headers,
      payload: { requester: ANA, type: 'INC', category: 'Rede e VPN', title: 'VPN erro 809', description: 'Windows 11', priority: 'high', impact: 'individual' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ticket.number).toBe('INC-20517');
    expect(res.json().ticket.status).toBe('open');
  });

  it('valida o corpo da criação', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/tickets', headers, payload: { requester: ANA, type: 'XYZ' } });
    expect(res.statusCode).toBe(400);
  });

  it('complementa chamado aberto sem reiniciar o prazo', async () => {
    const before = (await ctx.app.inject({ method: 'GET', url: `/tickets/INC-20311?requester=${ANA}`, headers })).json().ticket;
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/tickets/INC-20311/comments',
      headers,
      payload: { requester: ANA, author: 'Ana Souza', text: 'Agora também trava ao abrir o Excel' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.updatedAt).toBe(before.updatedAt);
    expect(res.json().ticket.events.at(-1).text).toMatch(/Excel/);
  });

  it('reabre resolvido há 4 dias e recusa resolvido há 56 dias', async () => {
    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/tickets/INC-20150/reopen',
      headers,
      payload: { requester: ANA, author: 'Ana Souza', text: 'Bloqueou de novo' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().ticket.status).toBe('open');
    const old = await ctx.app.inject({
      method: 'POST',
      url: '/tickets/INC-19877/reopen',
      headers,
      payload: { requester: ANA, author: 'Ana Souza', text: 'De novo' },
    });
    expect(old.statusCode).toBe(409);
  });

  it('transfere chamado para analista', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/tickets/INC-20298/transfer',
      headers,
      payload: { requester: ANA, queue: 'Suporte N2', summary: 'Funcionária pediu analista' },
    });
    expect(res.json().ticket.status).toBe('waiting_analyst');
  });

  it('simula indisponibilidade de alguns segundos', async () => {
    ctx.outage.forceOutage(10_000);
    const res = await ctx.app.inject({ method: 'GET', url: `/tickets?requester=${ANA}`, headers });
    expect(res.statusCode).toBe(503);
    const health = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
  });
});

describe('OutageSimulator', () => {
  it('mantém a janela de indisponibilidade e depois volta', () => {
    let t = 0;
    const sim = new OutageSimulator(1, 2000, () => 0, () => t);
    expect(sim.shouldFail()).toBe(true);
    t = 1500;
    expect(sim.shouldFail()).toBe(true);
    const healthy = new OutageSimulator(0, 2000, () => 0, () => t);
    expect(healthy.shouldFail()).toBe(false);
  });
});
