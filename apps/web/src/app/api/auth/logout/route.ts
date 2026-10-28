import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/server/session';

export async function POST() {
  const res = NextResponse.json({ redirect: '/login' });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
