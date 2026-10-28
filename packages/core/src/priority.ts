import type { Impact, Priority, Urgency } from './types';

export interface PriorityDecision {
  priority: Priority;
  rationale: string;
}

/**
 * Prioridade = impacto × urgência (Anexo A).
 * - Crítica: algo parado para uma equipe ou para a empresa.
 * - Alta: impede uma pessoa de trabalhar, ou há compromisso no mesmo dia.
 * - Média: atrapalha, mas há alternativa.
 * - Baixa: pedidos e melhorias sem urgência.
 */
export function classifyPriority(impact: Impact, urgency: Urgency): PriorityDecision {
  const collective = impact !== 'individual';
  const who = impact === 'company' ? 'a empresa' : impact === 'team' ? 'uma equipe' : 'uma pessoa';

  switch (urgency) {
    case 'blocked':
    case 'deadline_today':
      if (collective) {
        return { priority: 'critical', rationale: `Trabalho parado para ${who}.` };
      }
      return {
        priority: 'high',
        rationale:
          urgency === 'deadline_today'
            ? 'Há um compromisso no mesmo dia em risco.'
            : 'Impede uma pessoa de trabalhar.',
      };
    case 'has_workaround':
      return collective
        ? { priority: 'high', rationale: `Atrapalha ${who}, ainda que haja alternativa.` }
        : { priority: 'medium', rationale: 'Atrapalha, mas há alternativa.' };
    case 'no_urgency':
      return collective
        ? { priority: 'medium', rationale: `Pedido sem urgência que afeta ${who}.` }
        : { priority: 'low', rationale: 'Pedido ou melhoria sem urgência.' };
  }
}
