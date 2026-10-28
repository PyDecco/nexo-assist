import type { Ticket } from '@nexo/core';
import type { TicketRepository } from './repository';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Data "N dias atrás" num horário fixo de Brasília (UTC−3), para os dados parecerem reais. */
function daysAgo(now: Date, days: number, hour = 10, minute = 0): string {
  const d = new Date(now.getTime() - days * DAY);
  d.setUTCHours(hour + 3, minute, 0, 0);
  return d.toISOString();
}

type SeedTicket = Omit<Ticket, 'events'> & { events?: Ticket['events'] };

/** Dados do Anexo B + situações variadas (aberto, vencido, resolvido recente, de outros funcionários). */
export function buildSeedTickets(now: Date): Ticket[] {
  const ana = 'ana.souza@nexo.com.br';
  const tickets: SeedTicket[] = [
    {
      number: 'INC-20311',
      type: 'INC',
      category: 'Hardware',
      subcategory: 'Notebook',
      title: 'Notebook lento após atualização do Windows',
      description: 'Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.',
      priority: 'medium',
      impact: 'individual',
      status: 'waiting_analyst',
      requesterEmail: ana,
      createdAt: daysAgo(now, 12, 14, 20),
      updatedAt: daysAgo(now, 6, 9, 30),
      events: [
        { at: daysAgo(now, 12, 14, 20), kind: 'created', author: 'Ana Souza', text: 'Chamado aberto' },
        { at: daysAgo(now, 6, 9, 30), kind: 'status', author: 'Suporte N1', text: 'Encaminhado para análise de drivers' },
      ],
    },
    {
      number: 'INC-20298',
      type: 'INC',
      category: 'Acesso',
      title: 'Acesso à pasta Financeiro no SharePoint',
      description: 'Sem permissão para abrir a pasta Financeiro/Fechamento no SharePoint.',
      priority: 'medium',
      impact: 'individual',
      status: 'in_progress',
      requesterEmail: ana,
      createdAt: daysAgo(now, 14, 11),
      updatedAt: daysAgo(now, 1, 15),
      events: [{ at: daysAgo(now, 1, 15), kind: 'status', author: 'Suporte N1', text: 'Solicitada aprovação do gestor da pasta' }],
    },
    {
      number: 'REQ-10442',
      type: 'REQ',
      category: 'Hardware',
      title: 'Segundo monitor para home office',
      description: 'Pedido de um segundo monitor de 24" para o home office.',
      priority: 'low',
      impact: 'individual',
      status: 'approved',
      requesterEmail: ana,
      createdAt: daysAgo(now, 19, 9),
      updatedAt: daysAgo(now, 7, 16),
      events: [{ at: daysAgo(now, 7, 16), kind: 'status', author: 'Suporte N1', text: 'Aprovado pelo gestor; entrega agendada' }],
    },
    {
      number: 'INC-20150',
      type: 'INC',
      category: 'Acesso',
      title: 'Senha do SAP bloqueada',
      description: 'Senha do SAP bloqueada após tentativas erradas.',
      priority: 'medium',
      impact: 'individual',
      status: 'resolved',
      requesterEmail: ana,
      createdAt: daysAgo(now, 5, 9),
      updatedAt: daysAgo(now, 4, 11),
      resolvedAt: daysAgo(now, 4, 11),
      events: [{ at: daysAgo(now, 4, 11), kind: 'status', author: 'Suporte N1', text: 'Senha desbloqueada e redefinida' }],
    },
    {
      number: 'INC-19877',
      type: 'INC',
      category: 'E-mail',
      title: 'Outlook não sincroniza no celular',
      description: 'O app do Outlook no celular parou de sincronizar.',
      priority: 'low',
      impact: 'individual',
      status: 'resolved',
      requesterEmail: ana,
      createdAt: daysAgo(now, 60),
      updatedAt: daysAgo(now, 56),
      resolvedAt: daysAgo(now, 56),
    },
    {
      number: 'INC-19410',
      type: 'INC',
      category: 'Acesso',
      title: 'Troca de senha da rede',
      description: 'Senha da rede expirada.',
      priority: 'medium',
      impact: 'individual',
      status: 'closed',
      requesterEmail: ana,
      createdAt: daysAgo(now, 110),
      updatedAt: daysAgo(now, 109),
      resolvedAt: daysAgo(now, 109),
    },
    // Chamados de outros funcionários: nunca podem aparecer para a Ana.
    {
      number: 'REQ-10458',
      type: 'REQ',
      category: 'Acesso',
      title: 'Acesso ao SAP módulo FI',
      description: 'Preciso de acesso ao módulo FI do SAP para o fechamento de hoje.',
      priority: 'high',
      impact: 'individual',
      status: 'open',
      requesterEmail: 'carla.mendes@nexo.com.br',
      createdAt: new Date(now.getTime() - 2 * HOUR).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * HOUR).toISOString(),
    },
    {
      number: 'INC-20402',
      type: 'INC',
      category: 'Hardware',
      title: 'Impressora do 3º andar não imprime',
      description: 'A impressora do 3º andar mostra erro de papel, mas a bandeja está cheia.',
      priority: 'medium',
      impact: 'team',
      status: 'open',
      requesterEmail: 'bruno.tavares@nexo.com.br',
      createdAt: daysAgo(now, 2, 10),
      updatedAt: daysAgo(now, 2, 10),
    },
    {
      number: 'INC-20488',
      type: 'INC',
      category: 'Software',
      title: 'Adobe Creative Cloud não abre',
      description: 'O Creative Cloud fecha logo após abrir.',
      priority: 'medium',
      impact: 'individual',
      status: 'in_progress',
      requesterEmail: 'diego.ramos@nexo.com.br',
      createdAt: daysAgo(now, 3, 14),
      updatedAt: daysAgo(now, 1, 9),
    },
    {
      number: 'INC-20501',
      type: 'INC',
      category: 'E-mail',
      title: 'Caixa de e-mail cheia',
      description: 'Recebo aviso de caixa cheia e não consigo enviar e-mails.',
      priority: 'high',
      impact: 'individual',
      status: 'resolved',
      requesterEmail: 'elisa.prado@nexo.com.br',
      createdAt: daysAgo(now, 2, 9),
      updatedAt: daysAgo(now, 2, 12),
      resolvedAt: daysAgo(now, 2, 12),
    },
  ];

  return tickets.map((t) => ({
    ...t,
    events: t.events ?? [{ at: t.createdAt, kind: 'created', author: 'Sistema', text: 'Chamado aberto' }],
  }));
}

export function seedIfEmpty(repo: TicketRepository, now: Date = new Date()): boolean {
  if (repo.count() > 0) return false;
  for (const ticket of buildSeedTickets(now)) repo.insertRaw(ticket);
  repo.setCounter('INC', 20517);
  repo.setCounter('REQ', 10461);
  return true;
}
