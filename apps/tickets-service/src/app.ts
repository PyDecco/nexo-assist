import { IMPACTS, PRIORITIES, TICKET_CATEGORIES, TICKET_STATUSES, TICKET_TYPES } from '@nexo/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { OutageSimulator } from './outage';
import { TicketConflictError, TicketNotFoundError, type TicketRepository } from './repository';

export interface AppOptions {
  repo: TicketRepository;
  outage: OutageSimulator;
  serviceToken: string;
  logger?: boolean;
}

const requester = z.string().email();
const listQuery = z.object({ requester, status: z.enum(['open', 'all']).default('all') });
const requesterQuery = z.object({ requester });
const numberParams = z.object({ number: z.string().regex(/^(INC|REQ)-\d+$/i) });
const createBody = z.object({
  requester,
  type: z.enum(TICKET_TYPES),
  category: z.enum(TICKET_CATEGORIES),
  title: z.string().min(3).max(140),
  description: z.string().min(3).max(4000),
  priority: z.enum(PRIORITIES),
  impact: z.enum(IMPACTS),
});
const commentBody = z.object({ requester, author: z.string().min(1), text: z.string().min(1).max(4000) });
const transferBody = z.object({ requester, queue: z.string().min(1), summary: z.string().min(1).max(4000) });
const supportBody = z.object({
  requester,
  author: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(TICKET_STATUSES).optional(),
});

/** API do sistema de chamados legado (simulado). Processo separado do agent. */
export function buildApp({ repo, outage, serviceToken, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/health', async () => ({ ok: true }));

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    if (req.headers['x-service-token'] !== serviceToken) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Token de serviço inválido' } });
    }
    const forced = Number(req.headers['x-simulate-outage-ms']);
    if (Number.isFinite(forced) && forced > 0) outage.forceOutage(forced);
    if (outage.shouldFail()) {
      return reply
        .code(503)
        .header('retry-after', '1')
        .send({ error: { code: 'UNAVAILABLE', message: 'Sistema de chamados temporariamente indisponível' } });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
    }
    if (err instanceof TicketNotFoundError) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
    if (err instanceof TicketConflictError) return reply.code(409).send({ error: { code: 'CONFLICT', message: err.message } });
    app.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Erro interno' } });
  });

  app.get('/tickets', async (req) => {
    const q = listQuery.parse(req.query);
    return { tickets: repo.listByRequester(q.requester, q.status) };
  });

  app.get('/tickets/:number', async (req) => {
    const { number } = numberParams.parse(req.params);
    const q = requesterQuery.parse(req.query);
    return { ticket: repo.getForRequester(number, q.requester) };
  });

  app.post('/tickets', async (req, reply) => {
    const { requester: who, ...input } = createBody.parse(req.body);
    return reply.code(201).send({ ticket: repo.create(who, input) });
  });

  app.post('/tickets/:number/comments', async (req) => {
    const { number } = numberParams.parse(req.params);
    const b = commentBody.parse(req.body);
    return { ticket: repo.comment(number, b.requester, b.author, b.text) };
  });

  app.post('/tickets/:number/reopen', async (req) => {
    const { number } = numberParams.parse(req.params);
    const b = commentBody.parse(req.body);
    return { ticket: repo.reopen(number, b.requester, b.author, b.text) };
  });

  app.post('/tickets/:number/transfer', async (req) => {
    const { number } = numberParams.parse(req.params);
    const b = transferBody.parse(req.body);
    return { ticket: repo.transfer(number, b.requester, b.queue, b.summary) };
  });

  app.post('/tickets/:number/support-update', async (req) => {
    const { number } = numberParams.parse(req.params);
    const b = supportBody.parse(req.body);
    return { ticket: repo.supportUpdate(number, b.requester, b.author, b.text, b.status) };
  });

  return app;
}
