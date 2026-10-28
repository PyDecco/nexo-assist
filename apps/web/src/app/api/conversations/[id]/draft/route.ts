import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/server/container';
import { errorResponse, requireUser } from '@/server/http';
import { publicConversation } from '@/server/views';

const body = z.object({ action: z.enum(['confirm', 'cancel']) });

/** Confirmar/Cancelar o rascunho: caminho determinístico, sem LLM. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('employee');
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID', message: 'Ação inválida' } }, { status: 400 });
    const { chat } = container();
    if (parsed.data.action === 'confirm') await chat.confirmDraft(id, user);
    else chat.cancelDraft(id, user);
    const { conversation, messages } = chat.getForEmployee(id, user);
    return NextResponse.json({ conversation: publicConversation(conversation), messages });
  } catch (err) {
    return errorResponse(err);
  }
}
