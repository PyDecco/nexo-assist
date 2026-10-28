/**
 * Roda conversas reais contra o Gemini e imprime ações, decisões e textos.
 * Uso: pnpm --filter @nexo/agent smoke   (lê GEMINI_API_KEY do .env; a chave nunca é impressa)
 */
import { MastraRunner } from '../src/mastra-runner';
import { createSession } from '../src/test-utils';

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('Defina GEMINI_API_KEY no .env');
  process.exit(1);
}
const runner = new MastraRunner({ apiKey: key, model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' });

const scripts: string[][] = [
  ['Qual o horário do service desk?'],
  ['Qual o status do meu chamado?', 'INC-20311 · Notebook lento após atualização', 'Falar com um analista'],
  ['Meu notebook não conecta na VPN desde ontem. Aparece o erro 809. Uso Windows 11.', 'Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.'],
  ['A senha do SAP bloqueou de novo'],
  ['Me mostra o chamado REQ-10458'],
  ['Como faço para pedir férias?'],
];

for (const turns of scripts) {
  const session = createSession(runner);
  console.log('\n==============================');
  for (const message of turns) {
    // Free tier do Gemini: 15 req/min. Cada turno faz de 2 a 4 chamadas ao modelo.
    await new Promise((res) => setTimeout(res, Number(process.env.SMOKE_PAUSE_MS ?? 12000)));
    const started = Date.now();
    const r = await session.send(message).catch((err: unknown) => {
      console.log(`\n> ${message}\n  ERRO: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
      return null;
    });
    if (!r) continue;
    console.log(`\n> ${message}`);
    console.log(`  ações: ${r.actions.join(' · ') || '—'}`);
    console.log(`  cards: ${r.cards.map((c) => c.kind).join(', ') || '—'}`);
    if (r.decision?.type === 'decision') {
      const d = r.decision.decision;
      console.log(`  decisão: [${d.intent} ${Math.round(d.confidence * 100)}%] ${d.understood} → ${d.action} (${d.reasoning})`);
    } else console.log('  decisão: (não registrada)');
    if (r.transfer?.type === 'transfer') console.log(`  transferência: ${r.transfer.request.reason} → ${r.transfer.request.queue}`);
    console.log(`  texto (${Date.now() - started} ms): ${r.text.trim()}`);
    const err = r.events.find((e) => e.type === 'error');
    if (err) console.log('  ERRO', err);
  }
}
