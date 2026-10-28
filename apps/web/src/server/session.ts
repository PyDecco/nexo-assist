import { createHmac, timingSafeEqual } from 'node:crypto';

/** Cookie de sessão assinado (HMAC-SHA256). Guarda só o e-mail e a validade. */
export const SESSION_COOKIE = 'nexo_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function signSession(email: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: now + MAX_AGE_SECONDS * 1000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email?: string; exp?: number };
    if (!data.email || !data.exp || data.exp < now) return null;
    return data.email;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === 'production',
};
