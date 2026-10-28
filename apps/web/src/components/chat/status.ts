import type { TicketStatus } from '@nexo/core';

export const STATUS_DOT: Record<TicketStatus, string> = {
  open: 'var(--primary)',
  waiting_analyst: 'var(--warning)',
  in_progress: 'var(--primary)',
  approved: 'var(--success)',
  resolved: '#1B243140',
  closed: '#1B243140',
};

export const PRIORITY_DOT: Record<string, string> = {
  critical: 'var(--danger)',
  high: 'var(--warning)',
  medium: '#1B243166',
  low: 'var(--success)',
};
