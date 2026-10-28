import { fileURLToPath } from 'node:url';

export const env = {
  ticketsUrl: process.env.TICKETS_SERVICE_URL ?? 'http://localhost:4001',
  ticketsToken: process.env.TICKETS_SERVICE_TOKEN ?? 'dev-service-token',
  sessionSecret: process.env.SESSION_SECRET ?? 'troque-este-segredo-local',
  dbPath: process.env.WEB_DB_PATH ?? fileURLToPath(new URL('../../../../data/web.db', import.meta.url)),
};

/** Limite do PRD: 30 mensagens do funcionário por sessão (conversa). */
export const MESSAGE_LIMIT = 30;
/** Abaixo disso o agent "não tem segurança" e a conversa vai para um analista (Anexo A). */
export const CONFIDENCE_THRESHOLD = 0.5;
/** Janela de histórico enviada ao modelo: contexto enxuto, custo previsível. */
export const HISTORY_WINDOW = 10;
