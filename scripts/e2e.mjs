/**
 * Teste ponta a ponta da API contra os servidores rodando (web :3000 + tickets :4001).
 * Usa o runner determinístico (AGENT_RUNNER=scripted) para ser reprodutível sem chave.
 *
 *   AGENT_RUNNER=scripted TICKETS_OUTAGE_RATE=0 pnpm start   # em outro terminal
 *   node scripts/e2e.mjs
 */
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
let step = 0;
const log = (msg) => console.log(`  ${String(++step).padStart(2, '0')}. ${msg}`);

function client() {
  let cookie = '';
  async function call(path, init = {}) {
    const res = await fetch(BASE + path, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  }
  return {
    async login(email) {
      const res = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'qualquer' }) });
      assert.equal(res.status, 200, `login ${email}`);
      return res.json();
    },
    async json(path, init) {
      const res = await call(path, init);
      return { status: res.status, body: await res.json() };
    },
    /** Envia mensagem e consome o SSE, devolvendo os eventos. */
    async chat(conversationId, message) {
      const res = await call('/api/chat', { method: 'POST', body: JSON.stringify({ conversationId, message }) });
      assert.equal(res.status, 200, `chat "${message}"`);
      const text = await res.text();
      const events = text.split('\n\n').filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)));
      const fatal = events.find((e) => e.type === 'fatal');
      assert.ok(!fatal, `fatal: ${fatal?.message}`);
      return {
        events,
        text: events.filter((e) => e.type === 'text').map((e) => e.delta).join(''),
        actions: events.filter((e) => e.type === 'action').map((e) => e.step.label),
        cards: events.filter((e) => e.type === 'card').map((e) => e.card),
        decision: events.find((e) => e.type === 'decision')?.decision,
        state: events.findLast((e) => e.type === 'state')?.state,
      };
    },
  };
}

const ana = client();
const rafael = client();
const carla = client();

console.log(`E2E contra ${BASE}`);

assert.equal((await ana.json('/api/conversations/current')).status, 401);
log('sem sessão → 401');

const unknown = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nao.existe@nexo.com.br', password: 'x' }) });
assert.equal(unknown.status, 401);
log('e-mail fora da base é recusado');

assert.equal((await ana.login('ana.souza@nexo.com.br')).redirect, '/atendimento');
assert.equal((await rafael.login('rafael.lima@nexo.com.br')).redirect, '/console');
await carla.login('carla.mendes@nexo.com.br');
log('login de funcionária e analista');

// Começa uma sessão limpa para o teste.
const { body: fresh } = await ana.json('/api/conversations/new', { method: 'POST' });
const conv = fresh.conversation.id;

let r = await ana.chat(conv, 'Qual o horário do service desk?');
assert.match(r.text, /8h às 18h/);
assert.ok(r.actions.includes('buscou na central de ajuda'));
assert.ok(r.decision && r.decision.confidence >= 0.5);
log('dúvida respondida pela central, com decisão registrada');

r = await ana.chat(conv, 'Qual o status do meu chamado?');
assert.ok(r.cards.some((c) => c.kind === 'ticket-selector'));
r = await ana.chat(conv, 'INC-20311 · Notebook lento após atualização');
const ticket = r.cards.find((c) => c.kind === 'ticket');
assert.equal(ticket?.ticket.overdue, true);
assert.ok(r.cards.some((c) => c.kind === 'options'));
log('consulta sem número → seleção → chamado vencido com oferta de analista');

r = await ana.chat(conv, 'Meu notebook não conecta na VPN desde ontem, erro 809. Uso Windows 11.');
assert.ok(r.cards.some((c) => c.kind === 'options' && /afetado/.test(c.question)));
r = await ana.chat(conv, 'Só eu. Tenho reunião com um cliente às 14h.');
const draft = r.cards.find((c) => c.kind === 'draft');
assert.equal(draft?.draft.priority, 'high');
log('abertura conversando → pergunta afetados → rascunho com prioridade alta');

let res = await ana.json(`/api/conversations/${conv}/draft`, { method: 'POST', body: JSON.stringify({ action: 'confirm' }) });
assert.equal(res.status, 200);
const created = res.body.messages.at(-1);
assert.match(created.text, /Pronto: abri o INC-\d+ com prioridade alta/);
res = await ana.json(`/api/conversations/${conv}/draft`, { method: 'POST', body: JSON.stringify({ action: 'confirm' }) });
assert.equal(res.status, 400, 'segunda confirmação não cria outro chamado');
log('confirmação cria o chamado uma única vez');

r = await ana.chat(conv, 'Qual o status do REQ-10458?');
assert.match(r.text, /Não encontrei o REQ-10458/);
assert.equal((await carla.json(`/api/conversations/${conv}/messages`)).status, 403);
assert.equal((await carla.json('/api/console/conversations')).status, 403);
log('privacidade: chamado e conversa de outra pessoa não são expostos');

r = await ana.chat(conv, 'Quero falar com um analista');
assert.equal(r.state, 'waiting_analyst');
r = await ana.chat(conv, 'Alguém aí?');
assert.deepEqual(r.events.map((e) => e.type), ['state']);
log('transferência → agent pausado (não responde)');

const list = (await rafael.json('/api/console/conversations?filter=for_you')).body;
const item = list.items.find((i) => i.id === conv);
assert.ok(item, 'conversa aparece em "Para você"');
assert.match(item.tag, /Transferida/);
res = await rafael.json(`/api/console/conversations/${conv}/assume`, { method: 'POST' });
assert.equal(res.body.item.state, 'with_analyst');
assert.ok(res.body.tickets.length > 0, 'painel com chamados da funcionária');
await rafael.json(`/api/console/conversations/${conv}/message`, { method: 'POST', body: JSON.stringify({ text: 'Oi, Ana! Aqui é o Rafael.' }) });
const seen = (await ana.json(`/api/conversations/${conv}/messages`)).body.messages;
assert.ok(seen.some((m) => m.role === 'analyst' && m.text.includes('Rafael')));
log('analista assume, vê os chamados e responde; funcionária recebe');

await rafael.json(`/api/console/conversations/${conv}/return`, { method: 'POST' });
r = await ana.chat(conv, 'Qual o horário do service desk?');
assert.ok(r.text.length > 0);
log('devolvida ao agent → agent volta a responder');

await rafael.json(`/api/console/conversations/${conv}/close`, { method: 'POST' });
res = await ana.json('/api/chat', { method: 'POST', body: JSON.stringify({ conversationId: conv, message: 'oi' }) });
assert.equal(res.status, 409);
log('encerrada → não aceita novas mensagens');

console.log(`\nOK: ${step} verificações ponta a ponta`);
