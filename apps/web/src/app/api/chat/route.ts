import type { ChatStreamEvent } from '@nexo/core';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ChatError } from '@/server/chat-service';
import { container } from '@/server/container';
import { errorResponse, requireUser } from '@/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const body = z.object({ conversationId: z.string().uuid(), message: z.string().min(1).max(2000) });

/**
 * Envia uma mensagem e devolve a resposta do agent em tempo real (Server-Sent Events):
 * ações, trechos de texto, cards e a decisão chegam conforme acontecem.
 */
export async function POST(req: Request) {
  const user = await requireUser('employee');
  if (user instanceof NextResponse) return user;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID', message: 'Mensagem inválida' } }, { status: 400 });

  const { chat } = container();
  // Validações rápidas antes de abrir o stream, para responder com o status HTTP certo.
  try {
    const { conversation } = chat.getForEmployee(parsed.data.conversationId, user);
    if (conversation.state === 'closed') throw new ChatError('CLOSED', 'Esta conversa foi encerrada. Inicie uma nova.');
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Se o navegador desconectar, o turno continua e é salvo; só paramos de enviar.
      let open = true;
      const send = (event: ChatStreamEvent | { type: 'fatal'; code: string; message: string }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        await chat.sendMessage(parsed.data.conversationId, user, parsed.data.message, send);
      } catch (err) {
        const code = err instanceof ChatError ? err.code : 'INTERNAL';
        const message = err instanceof ChatError ? err.message : 'Erro inesperado. Tente de novo.';
        if (!(err instanceof ChatError)) console.error('[chat] erro no stream:', err);
        send({ type: 'fatal', code, message });
      } finally {
        try {
          controller.close();
        } catch {
          // stream já cancelado pelo cliente
        }
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
