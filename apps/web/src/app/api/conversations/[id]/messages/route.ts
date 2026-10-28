import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { errorResponse, requireUser } from '@/server/http';
import { publicConversation } from '@/server/views';

export const dynamic = 'force-dynamic';

/** Usado em polling enquanto a conversa está com um analista. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('employee');
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    const { conversation, messages } = container().chat.getForEmployee(id, user);
    return NextResponse.json({ conversation: publicConversation(conversation), messages });
  } catch (err) {
    return errorResponse(err);
  }
}
