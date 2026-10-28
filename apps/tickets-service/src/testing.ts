import { buildApp } from './app';
import { openDb } from './db';
import { OutageSimulator } from './outage';
import { TicketRepository } from './repository';
import { seedIfEmpty } from './seed';

/**
 * Serviço de chamados em memória para testes de outros pacotes.
 * `fetch` atende requisições via `inject` do Fastify, sem abrir porta.
 */
export function createTestTicketsService(now: Date = new Date()) {
  const repo = new TicketRepository(openDb(':memory:'), () => now);
  seedIfEmpty(repo, now);
  const outage = new OutageSimulator(0, 1000);
  const token = 'test-token';
  const app = buildApp({ repo, outage, serviceToken: token });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST',
      url: url.pathname + url.search,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      payload: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { app, repo, outage, token, baseUrl: 'http://tickets.test', fetch: fetchImpl };
}
