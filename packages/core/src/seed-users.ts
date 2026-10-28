import type { User } from './types';

/** Funcionários e analistas de exemplo (Anexo B). Qualquer senha é aceita no login. */
export const SEED_USERS: User[] = [
  { email: 'ana.souza@nexo.com.br', name: 'Ana Souza', role: 'employee', department: 'Financeiro' },
  { email: 'carla.mendes@nexo.com.br', name: 'Carla Mendes', role: 'employee', department: 'Controladoria' },
  { email: 'bruno.tavares@nexo.com.br', name: 'Bruno Tavares', role: 'employee', department: 'Comercial' },
  { email: 'diego.ramos@nexo.com.br', name: 'Diego Ramos', role: 'employee', department: 'Marketing' },
  { email: 'elisa.prado@nexo.com.br', name: 'Elisa Prado', role: 'employee', department: 'Jurídico' },
  { email: 'rafael.lima@nexo.com.br', name: 'Rafael Lima', role: 'analyst', department: 'TI', team: 'Suporte N2' },
  { email: 'julia.costa@nexo.com.br', name: 'Júlia Costa', role: 'analyst', department: 'TI', team: 'Suporte N1' },
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}
