import 'server-only';
import type { User, UserRole } from '@nexo/core';
import { NextResponse } from 'next/server';
import { currentUser } from './auth';
import { ChatError } from './chat-service';

const STATUS: Record<ChatError['code'], number> = {
  LIMIT: 429,
  CLOSED: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID: 400,
  UNAVAILABLE: 503,
};

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ChatError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] });
  console.error('[web] erro inesperado:', err);
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Erro inesperado. Tente de novo.' } }, { status: 500 });
}

/** Garante sessão e papel; devolve o usuário ou uma resposta 401/403. */
export async function requireUser(role?: UserRole): Promise<User | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Faça login.' } }, { status: 401 });
  if (role && user.role !== role) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Sem permissão.' } }, { status: 403 });
  return user;
}
