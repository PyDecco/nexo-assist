import { describe, expect, it } from 'vitest';
import { classifyPriority } from './priority';

describe('classifyPriority (Anexo A)', () => {
  it.each([
    ['team', 'blocked', 'critical'],
    ['company', 'deadline_today', 'critical'],
    ['individual', 'blocked', 'high'],
    ['individual', 'deadline_today', 'high'],
    ['individual', 'has_workaround', 'medium'],
    ['team', 'has_workaround', 'high'],
    ['individual', 'no_urgency', 'low'],
    ['company', 'no_urgency', 'medium'],
  ] as const)('impacto %s + urgência %s → %s', (impact, urgency, expected) => {
    expect(classifyPriority(impact, urgency).priority).toBe(expected);
  });

  it('explica o motivo da prioridade', () => {
    expect(classifyPriority('individual', 'deadline_today').rationale).toMatch(/compromisso no mesmo dia/);
  });
});
