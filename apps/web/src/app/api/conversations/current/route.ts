import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { MESSAGE_LIMIT } from '@/server/env';
import { errorResponse, requireUser } from '@/server/http';
import { publicConversation } from '@/server/views';

export const dynamic = 'force-dynamic';

/** Conversa atual do funcionário (retomada entre sessões) com o histórico completo. */
export async function GET() {
  const user = await requireUser('employee');
  if (user instanceof NextResponse) return user;
  try {
    const { chat } = container();
    const conv = chat.currentConversation(user);
    const { conversation, messages } = chat.getForEmployee(conv.id, user);
    return NextResponse.json({ conversation: publicConversation(conversation), messages, limit: MESSAGE_LIMIT });
  } catch (err) {
    return errorResponse(err);
  }
}
