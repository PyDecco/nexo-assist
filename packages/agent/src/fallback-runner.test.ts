import { describe, expect, it } from 'vitest';
import type { AgentRunner } from './context';
import { FallbackRunner } from './fallback-runner';
import { ScriptedRunner } from './scripted-runner';
import { createSession } from './test-utils';

const failing = (emitFirst: boolean): AgentRunner => ({
  name: 'gemini',
  model: 'fake',
  async run(ctx) {
    if (emitFirst) ctx.emit({ type: 'text', delta: 'parcial' });
    throw new Error('quota exceeded');
  },
});

describe('FallbackRunner', () => {
  it('usa as regras quando o modelo falha antes de responder', async () => {
    const s = createSession(new FallbackRunner(failing(false), new ScriptedRunner()));
    const r = await s.send('Qual o horário do service desk?');
    expect(r.actions[0]).toBe('modelo indisponível, respondi por regras');
    expect(r.text).toMatch(/8h às 18h/);
  });

  it('não repete o turno se o modelo já tinha respondido parcialmente', async () => {
    const s = createSession(new FallbackRunner(failing(true), new ScriptedRunner()));
    await expect(s.send('oi')).rejects.toThrow('quota exceeded');
  });
});
