import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import type { AgentRunner, TurnContext, TurnInput } from './context';
import { SYSTEM_PROMPT, turnContextNote } from './prompt';
import { createTools, runTool } from './tools';

export interface MastraRunnerOptions {
  apiKey: string;
  model: string;
  /** Limite de passos (chamadas de ferramenta + resposta) por turno. */
  maxSteps?: number;
}

/** Runner de produção: agent Mastra com Gemini e tool-calling. */
export class MastraRunner implements AgentRunner {
  readonly name = 'gemini';
  constructor(private readonly options: MastraRunnerOptions) {}

  get model(): string {
    return this.options.model;
  }

  async run(ctx: TurnContext, input: TurnInput): Promise<void> {
    const tools = Object.fromEntries(
      createTools(ctx).map((def) => [
        def.name,
        createTool({
          id: def.name,
          description: def.description,
          inputSchema: def.input,
          execute: async (args: unknown) => runTool(ctx, def, args),
        }),
      ]),
    );

    // O agent é criado por turno: as ferramentas carregam a identidade da sessão em closure.
    const agent = new Agent({
      id: 'nexo-assist',
      name: 'Nexo Assist',
      instructions: SYSTEM_PROMPT,
      model: { id: `google/${this.options.model}` as `${string}/${string}`, apiKey: this.options.apiKey },
      tools,
    });

    const messages = [
      { role: 'system' as const, content: turnContextNote(ctx) },
      ...input.history.map((m) =>
        m.role === 'user' ? { role: 'user' as const, content: m.content } : { role: 'assistant' as const, content: m.content },
      ),
      { role: 'user' as const, content: input.message },
    ];

    const stream = await agent.stream(messages, {
      maxSteps: this.options.maxSteps ?? 6,
      providerOptions: { google: { thinkingConfig: { thinkingLevel: 'minimal' } } },
    });

    for await (const chunk of stream.fullStream) {
      if (chunk.type === 'text-delta') {
        ctx.emit({ type: 'text', delta: chunk.payload.text });
      } else if (chunk.type === 'error') {
        throw new Error(describeError(chunk.payload.error));
      }
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message);
  return 'Falha ao consultar o modelo';
}
