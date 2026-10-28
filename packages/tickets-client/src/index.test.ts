import { describe, expect, it, vi } from 'vitest';
import { TicketsClient, TicketsRequestError, TicketsUnavailableError } from './index';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(responses: Array<Response | Error>) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('sem resposta configurada');
    if (next instanceof Error) throw next;
    return next;
  });
  const c = new TicketsClient({
    baseUrl: 'http://svc',
    token: 't',
    backoffMs: [10, 20, 30],
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
  });
  return { c, fetchMock };
}

describe('TicketsClient (legado instável)', () => {
  it('repete após 503 e conclui quando o serviço volta', async () => {
    const { c, fetchMock } = client([json(503, { error: { message: 'fora' } }), json(503, {}), json(200, { tickets: [] })]);
    const retries: number[] = [];
    await expect(c.listTickets('a@nexo.com.br', 'open', { onRetry: (i) => retries.push(i.attempt) })).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(retries).toEqual([2, 3]);
  });

  it('repete após falha de conexão', async () => {
    const { c } = client([new TypeError('ECONNREFUSED'), json(200, { tickets: [] })]);
    await expect(c.listTickets('a@nexo.com.br')).resolves.toEqual([]);
  });

  it('desiste após esgotar as tentativas com erro tipado', async () => {
    const { c, fetchMock } = client([json(503, {}), json(503, {}), json(503, {}), json(503, {})]);
    await expect(c.listTickets('a@nexo.com.br')).rejects.toBeInstanceOf(TicketsUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('não repete erros 4xx', async () => {
    const { c, fetchMock } = client([json(409, { error: { code: 'CONFLICT', message: 'não pode reabrir' } })]);
    await expect(c.reopen('INC-1', 'a@nexo.com.br', 'Ana', 'x')).rejects.toBeInstanceOf(TicketsRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getTicket devolve null para chamado inexistente ou de outra pessoa', async () => {
    const { c } = client([json(404, { error: { code: 'NOT_FOUND', message: 'x' } })]);
    await expect(c.getTicket('INC-9', 'a@nexo.com.br')).resolves.toBeNull();
  });

  it('aplica timeout e repete', async () => {
    let calls = 0;
    const slowThenOk = vi.fn((_url: string, init?: RequestInit) => {
      calls++;
      if (calls === 1) {
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return Promise.resolve(json(200, { tickets: [] }));
    });
    const c = new TicketsClient({ baseUrl: 'http://svc', token: 't', timeoutMs: 20, backoffMs: [1], fetch: slowThenOk as unknown as typeof fetch });
    await expect(c.listTickets('a@nexo.com.br')).resolves.toEqual([]);
    expect(calls).toBe(2);
  });
});
