import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/server/container';
import { errorResponse, requireUser } from '@/server/http';

export const dynamic = 'force-dynamic';

const query = z.object({ filter: z.enum(['all', 'for_you', 'with_agent', 'mine']).default('all'), q: z.string().default('') });

export async function GET(req: Request) {
  const analyst = await requireUser('analyst');
  if (analyst instanceof NextResponse) return analyst;
  try {
    const url = new URL(req.url);
    const { filter, q } = query.parse({ filter: url.searchParams.get('filter') ?? undefined, q: url.searchParams.get('q') ?? undefined });
    return NextResponse.json(container().chat.listForConsole(analyst, filter, q));
  } catch (err) {
    return errorResponse(err);
  }
}
