import { describe, expect, it } from 'vitest';
import { findSimilarTickets } from './similarity';
import type { Ticket } from './types';

const now = new Date('2026-10-28T13:00:00Z');
const base: Omit<Ticket, 'number' | 'title' | 'category' | 'status'> = {
  type: 'INC',
  description: '',
  priority: 'medium',
  impact: 'individual',
  requesterEmail: 'ana.souza@nexo.com.br',
  createdAt: '2026-10-20T13:00:00Z',
  updatedAt: '2026-10-22T13:00:00Z',
  events: [],
};

const tickets: Ticket[] = [
  { ...base, number: 'INC-20311', title: 'Notebook lento após atualização do Windows', category: 'Hardware', status: 'waiting_analyst' },
  { ...base, number: 'INC-20150', title: 'Senha do SAP bloqueada', category: 'Acesso', status: 'resolved', resolvedAt: '2026-10-24T13:00:00Z' },
  { ...base, number: 'REQ-10442', title: 'Segundo monitor para home office', category: 'Hardware', status: 'approved' },
];

describe('findSimilarTickets (sem duplicidade)', () => {
  it('encontra chamado aberto sobre o mesmo problema', () => {
    const r = findSimilarTickets(tickets, { category: 'Hardware', title: 'Notebook muito lento', description: 'depois da atualização' }, now);
    expect(r.open.map((t) => t.number)).toEqual(['INC-20311']);
  });

  it('sugere reabrir resolvido recente', () => {
    const r = findSimilarTickets(tickets, { category: 'Acesso', title: 'SAP bloqueado de novo', description: 'senha do SAP bloqueada' }, now);
    expect(r.reopenable.map((t) => t.number)).toEqual(['INC-20150']);
    expect(r.open).toEqual([]);
  });

  it('não confunde problemas diferentes', () => {
    const r = findSimilarTickets(tickets, { category: 'Rede e VPN', title: 'VPN erro 809', description: 'não conecta' }, now);
    expect(r.open).toEqual([]);
    expect(r.reopenable).toEqual([]);
  });
});
