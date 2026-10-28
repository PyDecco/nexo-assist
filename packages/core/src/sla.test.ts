import { describe, expect, it } from 'vitest';
import { addBusinessHours, canReopen, computeDueAt, slaStatus } from './sla';

// Horários em UTC; Brasília = UTC−3. 2026-10-28 é quarta-feira.
const brt = (isoLocal: string) => new Date(`${isoLocal}-03:00`);

describe('prazos em horas úteis', () => {
  it('Alta: 4 horas úteis no mesmo dia', () => {
    expect(computeDueAt(brt('2026-10-28T09:43:00'), 'high')).toEqual(brt('2026-10-28T13:43:00'));
  });

  it('Alta: atravessa o fim do expediente para o dia seguinte', () => {
    expect(computeDueAt(brt('2026-10-28T16:00:00'), 'high')).toEqual(brt('2026-10-29T10:00:00'));
  });

  it('Alta aberta na sexta à noite vence na segunda às 12h', () => {
    expect(computeDueAt(brt('2026-10-30T20:00:00'), 'high')).toEqual(brt('2026-11-02T12:00:00'));
  });

  it('Crítica: 1 hora corrida, mesmo fora do expediente (plantão 24 h)', () => {
    expect(computeDueAt(brt('2026-10-31T23:30:00'), 'critical')).toEqual(brt('2026-11-01T00:30:00'));
  });

  it('Média: 3 dias úteis, pulando o fim de semana', () => {
    expect(computeDueAt(brt('2026-10-29T14:20:00'), 'medium')).toEqual(brt('2026-11-03T14:20:00'));
  });

  it('Baixa: 5 dias úteis', () => {
    expect(computeDueAt(brt('2026-10-26T10:00:00'), 'low')).toEqual(brt('2026-11-02T10:00:00'));
  });

  it('começa a contar no próximo horário útil quando aberto de madrugada', () => {
    expect(addBusinessHours(brt('2026-10-28T03:00:00'), 1)).toEqual(brt('2026-10-28T09:00:00'));
  });
});

describe('slaStatus', () => {
  const now = brt('2026-10-28T10:00:00');

  it('chamado médio sem atualização há 6 dias está vencido', () => {
    const s = slaStatus({ status: 'waiting_analyst', priority: 'medium', updatedAt: brt('2026-10-22T10:00:00').toISOString() }, now);
    expect(s.overdue).toBe(true);
  });

  it('chamado médio atualizado ontem está no prazo', () => {
    const s = slaStatus({ status: 'in_progress', priority: 'medium', updatedAt: brt('2026-10-27T10:00:00').toISOString() }, now);
    expect(s.overdue).toBe(false);
    expect(s.dueAt).not.toBeNull();
  });

  it('resolvido ou aprovado não tem prazo correndo', () => {
    const old = brt('2026-09-01T10:00:00').toISOString();
    expect(slaStatus({ status: 'resolved', priority: 'high', updatedAt: old }, now)).toEqual({ dueAt: null, overdue: false });
    expect(slaStatus({ status: 'approved', priority: 'low', updatedAt: old }, now).overdue).toBe(false);
  });
});

describe('reabertura (até 7 dias)', () => {
  const now = brt('2026-10-28T10:00:00');
  it('permite reabrir resolvido há 4 dias', () => {
    expect(canReopen({ status: 'resolved', resolvedAt: brt('2026-10-24T10:00:00').toISOString() }, now)).toBe(true);
  });
  it('não permite reabrir resolvido há 8 dias', () => {
    expect(canReopen({ status: 'resolved', resolvedAt: brt('2026-10-20T09:00:00').toISOString() }, now)).toBe(false);
  });
  it('não reabre chamado que não está resolvido', () => {
    expect(canReopen({ status: 'closed', resolvedAt: brt('2026-10-27T10:00:00').toISOString() }, now)).toBe(false);
  });
});
