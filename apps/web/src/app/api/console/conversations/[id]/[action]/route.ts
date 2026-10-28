import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/server/container';
import { errorResponse, requireUser } from '@/server/http';

const actions = z.enum(['assume', 'return', 'close', 'message']);
const messageBody = z.object({ text: z.string().min(1).max(2000) });

/** Ações do analista: assumir (agent pausado), responder, devolver ao agent e encerrar. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const analyst = await requireUser('analyst');
  if (analyst instanceof NextResponse) return analyst;
  try {
    const { id, action: rawAction } = await params;
    const action = actions.safeParse(rawAction);
    if (!action.success) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Ação inexistente' } }, { status: 404 });
    const { chat } = container();
    switch (action.data) {
      case 'assume':
        await chat.assume(id, analyst);
        break;
      case 'return':
        chat.returnToAgent(id, analyst);
        break;
      case 'close':
        chat.close(id, analyst);
        break;
      case 'message': {
        const parsed = messageBody.safeParse(await req.json().catch(() => ({})));
        if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID', message: 'Mensagem inválida' } }, { status: 400 });
        chat.analystMessage(id, analyst, parsed.data.text);
        break;
      }
    }
    return NextResponse.json(await chat.consoleDetail(id, analyst));
  } catch (err) {
    return errorResponse(err);
  }
}
