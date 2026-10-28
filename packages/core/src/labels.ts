import type { ConversationState, Impact, Priority, TicketStatus, TransferReason } from './types';

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export const SLA_LABEL: Record<Priority, string> = {
  critical: '1 hora',
  high: '4 horas úteis',
  medium: '3 dias úteis',
  low: '5 dias úteis',
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Aberto',
  waiting_analyst: 'Aguardando analista',
  in_progress: 'Em andamento',
  approved: 'Aprovado',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

export const IMPACT_LABEL: Record<Impact, string> = {
  individual: 'Somente você',
  team: 'Sua equipe',
  company: 'Toda a empresa',
};

export const CONVERSATION_STATE_LABEL: Record<ConversationState, string> = {
  with_agent: 'Agent atendendo',
  waiting_analyst: 'Aguardando atendente',
  with_analyst: 'Em atendimento',
  closed: 'Encerrada',
};

export const TRANSFER_REASON_LABEL: Record<TransferReason, string> = {
  user_request: 'Funcionário pediu um analista',
  critical: 'Caso crítico',
  overdue: 'Chamado com prazo vencido',
  low_confidence: 'Agent pediu ajuda',
};
