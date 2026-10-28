import type { AgentRunner, TurnContext, TurnInput } from './context';

/**
 * Usa o runner principal (Gemini) e, se ele falhar antes de produzir qualquer saída
 * (cota, rede, chave inválida), responde o turno com o runner de regras.
 * Falhas depois de saída parcial são repassadas: repetir duplicaria cards e ações.
 */
export class FallbackRunner implements AgentRunner {
  readonly name: string;

  constructor(
    private readonly primary: AgentRunner,
    private readonly fallback: AgentRunner,
    private readonly onFallback: (err: unknown) => void = () => {},
  ) {
    this.name = primary.name;
  }

  get model(): string {
    return this.primary.model;
  }

  async run(ctx: TurnContext, input: TurnInput): Promise<void> {
    let emitted = 0;
    const counting: TurnContext = {
      ...ctx,
      emit: (e) => {
        emitted++;
        ctx.emit(e);
      },
      setPendingDraft: (d) => {
        ctx.setPendingDraft(d);
        counting.pendingDraft = d;
      },
    };
    try {
      await this.primary.run(counting, input);
    } catch (err) {
      if (emitted > 0) throw err;
      this.onFallback(err);
      ctx.emit({
        type: 'action',
        step: { id: ctx.newId(), tool: 'fallback', label: 'modelo indisponível, respondi por regras', status: 'error', detail: err instanceof Error ? err.message.split('\n')[0] : String(err) },
      });
      await this.fallback.run(ctx, input);
    }
  }
}
