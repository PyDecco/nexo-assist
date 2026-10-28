import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.TICKETS_SERVICE_PORT ?? 4001),
  token: process.env.TICKETS_SERVICE_TOKEN ?? 'dev-service-token',
  outageRate: Number(process.env.TICKETS_OUTAGE_RATE ?? 0.1),
  outageMs: Number(process.env.TICKETS_OUTAGE_MS ?? 2500),
  dbPath: process.env.TICKETS_DB_PATH ?? fileURLToPath(new URL('../../../data/tickets.db', import.meta.url)),
};
