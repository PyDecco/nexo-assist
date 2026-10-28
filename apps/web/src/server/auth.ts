import 'server-only';
import type { User } from '@nexo/core';
import { cookies } from 'next/headers';
import { container } from './container';
import { env } from './env';
import { SESSION_COOKIE, verifySession } from './session';

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const email = verifySession(jar.get(SESSION_COOKIE)?.value, env.sessionSecret);
  return email ? container().store.findUser(email) : null;
}
