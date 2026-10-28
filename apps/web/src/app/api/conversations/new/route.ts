import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { MESSAGE_LIMIT } from '@/server/env';
import { errorResponse, requireUser } from '@/server/http';
import { publicConversation } from '@/server/views';

/** Nova sessão de conversa (ex.: ao atingir o limite de 30 mensagens). */
export async function POST() {
  const user = await requireUser('employee');
  if (user instanceof NextResponse) return user;
  try {
    const conv = container().chat.newConversation(user);
    return NextResponse.json({ conversation: publicConversation(conv), messages: [], limit: MESSAGE_LIMIT });
  } catch (err) {
    return errorResponse(err);
  }
}
