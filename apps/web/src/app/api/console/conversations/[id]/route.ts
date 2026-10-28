import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { errorResponse, requireUser } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const analyst = await requireUser('analyst');
  if (analyst instanceof NextResponse) return analyst;
  try {
    const { id } = await params;
    return NextResponse.json(await container().chat.consoleDetail(id, analyst));
  } catch (err) {
    return errorResponse(err);
  }
}
