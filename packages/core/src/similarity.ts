import { canReopen, isOpenStatus } from './sla';
import type { Ticket, TicketCategory } from './types';

const STOPWORDS = new Set(
  'a o as os um uma uns umas de da do das dos em no na nos nas para por com sem que e ou meu minha meus minhas seu sua não nao esta está estou tem ter foi ser ao aos à às se mais muito pelo pela isso este essa esse desde ontem hoje'.split(' '),
);

export function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ');
  return new Set(normalized.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)));
}

/** Coeficiente de sobreposição: |A∩B| / min(|A|,|B|). Robusto para títulos curtos. */
export function overlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export interface SimilarTickets {
  /** Chamados abertos sobre o mesmo problema: devem ser atualizados, não duplicados. */
  open: Ticket[];
  /** Resolvidos há até 7 dias sobre o mesmo problema: podem ser reabertos. */
  reopenable: Ticket[];
}

const SIMILARITY_THRESHOLD = 0.34;

/**
 * Detecta duplicidade (Anexo A). Mesma categoria + sobreposição de termos do título/descrição.
 * A regra é conservadora de propósito: o agent pergunta ao funcionário antes de decidir.
 */
export function findSimilarTickets(
  tickets: Ticket[],
  draft: { category: TicketCategory; title: string; description: string },
  now: Date,
): SimilarTickets {
  const text = `${draft.title} ${draft.description}`;
  const scored = tickets
    .filter((t) => t.category === draft.category)
    .map((t) => ({ t, score: Math.max(overlap(draft.title, t.title), overlap(text, `${t.title} ${t.description}`)) }))
    .filter(({ score }) => score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(({ t }) => t);
  return {
    open: scored.filter((t) => isOpenStatus(t.status)),
    reopenable: scored.filter((t) => canReopen(t, now)),
  };
}
