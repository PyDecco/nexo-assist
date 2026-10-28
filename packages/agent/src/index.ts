export type { AgentMemory, AgentRunner, HistoryMessage, TurnContext, TurnInput } from './context';
export { ARTICLES, searchArticles } from './help-center';
export { FallbackRunner } from './fallback-runner';
export { MastraRunner } from './mastra-runner';
export { SYSTEM_PROMPT } from './prompt';
export { ScriptedRunner } from './scripted-runner';
export { createTools, queueFor, runTool } from './tools';
import type { AgentRunner } from './context';
import { FallbackRunner } from './fallback-runner';
import { MastraRunner } from './mastra-runner';
import { ScriptedRunner } from './scripted-runner';

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/**
 * Escolhe o runner: Gemini quando há chave (ou AGENT_RUNNER=gemini), determinístico caso contrário.
 * A chave nunca é logada.
 */
export function createRunner(env: Record<string, string | undefined> = process.env): AgentRunner {
  const mode = env.AGENT_RUNNER ?? 'auto';
  const key = env.GEMINI_API_KEY?.trim();
  if (mode === 'scripted' || (mode === 'auto' && !key)) return new ScriptedRunner({ chunkDelayMs: 12 });
  if (!key) throw new Error('AGENT_RUNNER=gemini exige GEMINI_API_KEY no .env');
  const gemini = new MastraRunner({ apiKey: key, model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL });
  return new FallbackRunner(gemini, new ScriptedRunner({ chunkDelayMs: 12 }), (err) =>
    console.warn('[agent] Gemini indisponível, usando regras:', err instanceof Error ? err.message.split('\n')[0] : err),
  );
}
