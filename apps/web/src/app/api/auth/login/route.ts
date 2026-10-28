import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/server/container';
import { env } from '@/server/env';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/server/session';

const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

/** Login do protótipo: aceita os usuários dos dados de exemplo com qualquer senha. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'INVALID', message: 'Informe e-mail corporativo e senha.' } }, { status: 400 });
  }
  const user = container().store.findUser(parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNKNOWN_USER', message: 'E-mail não encontrado na Nexo. Use seu e-mail corporativo.' } }, { status: 401 });
  }
  const res = NextResponse.json({ redirect: user.role === 'analyst' ? '/console' : '/atendimento' });
  res.cookies.set(SESSION_COOKIE, signSession(user.email, env.sessionSecret), sessionCookieOptions);
  return res;
}
