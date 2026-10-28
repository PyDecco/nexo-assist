import 'server-only';
import { createRunner } from '@nexo/agent';
import { TicketsClient } from '@nexo/tickets-client';
import { ChatService } from './chat-service';
import { openWebDb } from './db';
import { env } from './env';
import { Store } from './store';

interface Container {
  store: Store;
  chat: ChatService;
}

const globalForContainer = globalThis as unknown as { __nexo?: Container };

/** Singletons do servidor (sobrevivem ao hot reload do Next em desenvolvimento). */
export function container(): Container {
  if (!globalForContainer.__nexo) {
    const store = new Store(openWebDb(env.dbPath));
    const tickets = new TicketsClient({ baseUrl: env.ticketsUrl, token: env.ticketsToken });
    const runner = createRunner();
    console.log(`[web] agent: ${runner.name} (${runner.model})`);
    globalForContainer.__nexo = { store, chat: new ChatService({ store, tickets, runner }) };
  }
  return globalForContainer.__nexo;
}
