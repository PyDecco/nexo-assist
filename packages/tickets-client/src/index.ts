import type { NewTicketInput, Ticket, TicketStatus } from '@nexo/core';

export class TicketsUnavailableError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'TicketsUnavailableError';
  }
}

export class TicketsRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TicketsRequestError';
  }
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: string;
}

export interface CallOptions {
  /** Avisado antes de cada nova tentativa: a UI mostra "serviço instável, tentando de novo". */
  onRetry?: (info: RetryInfo) => void;
}

export interface TicketsClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  /** Atrasos entre tentativas; o número de tentativas é length + 1. */
  backoffMs?: number[];
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

/**
 * Cliente do sistema de chamados legado. O legado fica indisponível por alguns segundos
 * de vez em quando, então toda chamada tem timeout e retry com backoff para 5xx/timeout.
 * Erros 4xx não são repetidos.
 */
export class TicketsClient {
  private readonly timeoutMs: number;
  private readonly backoffMs: number[];
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TicketsClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.backoffMs = options.backoffMs ?? [400, 1000, 2000];
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async listTickets(requester: string, status: 'open' | 'all' = 'all', opts?: CallOptions): Promise<Ticket[]> {
    const q = new URLSearchParams({ requester, status });
    const body = await this.request<{ tickets: Ticket[] }>('GET', `/tickets?${q}`, undefined, opts);
    return body.tickets;
  }

  /** null quando o chamado não existe ou não pertence ao solicitante (o serviço não diferencia). */
  async getTicket(number: string, requester: string, opts?: CallOptions): Promise<Ticket | null> {
    try {
      const q = new URLSearchParams({ requester });
      const body = await this.request<{ ticket: Ticket }>('GET', `/tickets/${encodeURIComponent(number)}?${q}`, undefined, opts);
      return body.ticket;
    } catch (err) {
      if (err instanceof TicketsRequestError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  }

  async createTicket(requester: string, input: NewTicketInput, opts?: CallOptions): Promise<Ticket> {
    return (await this.request<{ ticket: Ticket }>('POST', '/tickets', { requester, ...input }, opts)).ticket;
  }

  async addComment(number: string, requester: string, author: string, text: string, opts?: CallOptions): Promise<Ticket> {
    return (await this.request<{ ticket: Ticket }>('POST', `/tickets/${number}/comments`, { requester, author, text }, opts)).ticket;
  }

  async reopen(number: string, requester: string, author: string, text: string, opts?: CallOptions): Promise<Ticket> {
    return (await this.request<{ ticket: Ticket }>('POST', `/tickets/${number}/reopen`, { requester, author, text }, opts)).ticket;
  }

  async transfer(number: string, requester: string, queue: string, summary: string, opts?: CallOptions): Promise<Ticket> {
    return (await this.request<{ ticket: Ticket }>('POST', `/tickets/${number}/transfer`, { requester, queue, summary }, opts)).ticket;
  }

  async supportUpdate(
    number: string,
    requester: string,
    author: string,
    text: string,
    status?: TicketStatus,
    opts?: CallOptions,
  ): Promise<Ticket> {
    return (
      await this.request<{ ticket: Ticket }>('POST', `/tickets/${number}/support-update`, { requester, author, text, status }, opts)
    ).ticket;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body: unknown, opts?: CallOptions): Promise<T> {
    const maxAttempts = this.backoffMs.length + 1;
    let lastReason = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
          method,
          headers: {
            'x-service-token': this.options.token,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.ok) return (await res.json()) as T;
        const payload = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
        const message = payload.error?.message ?? `HTTP ${res.status}`;
        if (!RETRYABLE_STATUS.has(res.status)) {
          throw new TicketsRequestError(res.status, payload.error?.code ?? 'ERROR', message);
        }
        lastReason = message;
      } catch (err) {
        if (err instanceof TicketsRequestError) throw err;
        lastReason = controller.signal.aborted ? `sem resposta em ${this.timeoutMs} ms` : 'falha de conexão';
      } finally {
        clearTimeout(timer);
      }
      const delayMs = this.backoffMs[attempt - 1];
      if (delayMs === undefined) break;
      opts?.onRetry?.({ attempt: attempt + 1, maxAttempts, delayMs, reason: lastReason });
      await this.sleep(delayMs);
    }
    throw new TicketsUnavailableError(`Sistema de chamados indisponível (${lastReason})`, maxAttempts);
  }
}
