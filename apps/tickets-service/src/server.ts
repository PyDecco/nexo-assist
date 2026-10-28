import { buildApp } from './app';
import { config } from './config';
import { openDb } from './db';
import { OutageSimulator } from './outage';
import { TicketRepository } from './repository';
import { seedIfEmpty } from './seed';

const repo = new TicketRepository(openDb(config.dbPath));
if (seedIfEmpty(repo)) console.log('[tickets-service] dados de exemplo criados');

const app = buildApp({
  repo,
  outage: new OutageSimulator(config.outageRate, config.outageMs),
  serviceToken: config.token,
  logger: process.env.NODE_ENV !== 'test',
});

await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`[tickets-service] ouvindo em :${config.port} (indisponibilidade simulada: ${config.outageRate * 100}% por ${config.outageMs} ms)`);
