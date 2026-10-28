# Nexo Assist

Agent de atendimento do service desk de TI da Nexo — desafio técnico da Beyond the Bytes.

O funcionário descreve o problema com as próprias palavras; o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados (sempre com confirmação) e chama um analista quando precisa. O analista atende pelo console. Cada resposta mostra **o que o agent fez e por quê**.

- Repositório: https://github.com/PyDecco/nexo-assist
- Deploy: não feito (opcional no PRD). Veja [O que faria com mais tempo](#o-que-faria-com-mais-tempo).

---

## Como rodar

Pré-requisitos: **Node.js 24+** (usa o `node:sqlite` embutido) e **pnpm 11** (`corepack enable` ou `brew install pnpm`).

```bash
cp .env.example .env        # opcional: preencha GEMINI_API_KEY
pnpm install
pnpm dev                    # web em http://localhost:3000 + serviço de chamados em :4001
```

Entre com qualquer senha:

| Papel | E-mail | Vai para |
|---|---|---|
| Funcionária | `ana.souza@nexo.com.br` | Atendimento (chat) |
| Funcionária | `carla.mendes@nexo.com.br` (outros: bruno.tavares, diego.ramos, elisa.prado) | Atendimento |
| Analista N2 | `rafael.lima@nexo.com.br` | Console |
| Analista N1 | `julia.costa@nexo.com.br` | Console |

Sem `GEMINI_API_KEY` o agent roda com o **runner determinístico** (regras), útil para testar sem custo. Com a chave, usa o Gemini.

Outros comandos:

```bash
pnpm test            # todos os testes (sem chave de LLM)
pnpm lint && pnpm typecheck
pnpm seed:reset      # apaga os bancos em ./data; os dados de exemplo voltam no próximo start
pnpm build && pnpm start   # modo produção
pnpm --filter @nexo/agent smoke   # conversas reais contra o Gemini, imprime ações e decisões
```

Variáveis (todas em `.env.example`): `GEMINI_API_KEY`, `GEMINI_MODEL` (padrão `gemini-3.5-flash-lite`), `AGENT_RUNNER` (`auto`/`gemini`/`scripted`), `SESSION_SECRET`, `TICKETS_SERVICE_URL`, `TICKETS_SERVICE_TOKEN`, `TICKETS_OUTAGE_RATE` (chance de derrubar o legado, padrão 10%), `TICKETS_OUTAGE_MS` (duração da queda, padrão 2,5 s).

### Roteiro rápido de teste

1. **Dúvida** — "Qual o horário do service desk?" → responde pela central, sem chamado.
2. **Consulta sem número** — "Qual o status do meu chamado?" → lista para escolher → INC-20311 aparece **vencido** e o agent oferece um analista.
3. **Abertura** — "Meu notebook não conecta na VPN, erro 809, uso Windows 11" → o artigo não vale para Windows 11 → pergunta quem é afetado (opções) → "Só eu, reunião com cliente às 14h" → rascunho com prioridade **Alta** e prazo → **Confirmar** cria o chamado.
4. **Duplicidade/reabertura** — "A senha do SAP bloqueou de novo" → propõe reabrir o INC-20150 (resolvido há 4 dias) em vez de abrir outro.
5. **Privacidade** — "Status do REQ-10458" (é da Carla) → não revela.
6. **Fora de escopo** — "Como peço férias?" → indica o RH.
7. **Analista** — peça um analista, entre como `rafael.lima@…` em outra janela anônima: a conversa está em "Para você", com o resumo; **Assumir** pausa o agent; responda; **Devolver ao agent** ou **Encerrar**.
8. Em qualquer resposta, clique em **por quê?** para ver o que o agent entendeu, a ação, o grau de segurança e o rastro das ferramentas.

---

## Visão geral da arquitetura

```
apps/web               Next.js 16: telas + rotas /api + orquestração do chat + SQLite de conversas
apps/tickets-service   Fastify: o "legado" simulado, processo separado, SQLite de chamados, quedas simuladas
packages/agent         Mastra Agent + Gemini, tools, prompt, central de ajuda, runner determinístico e fallback
packages/tickets-client  cliente HTTP do legado: timeout, retry com backoff, erros tipados
packages/core          domínio puro: regras do Anexo A (prioridade, prazos em horas úteis, duplicidade,
                       reabertura), protocolo de eventos, rótulos, dados de usuários
```

```
navegador ──SSE──▶ web /api/chat ──▶ ChatService ──▶ Runner (Mastra+Gemini | regras)
                                          │                 │ tools
                                          │                 ▼
                                          └──────────▶ tickets-client ──HTTP──▶ tickets-service
```

Decisões principais (detalhes em `_bmad-output/planning-artifacts/architecture/…/architecture.md`):

- **O LLM decide, o código executa.** As tools do modelo só leem, montam rascunhos ou pedem transferência. Criar, complementar e reabrir chamado acontece em `POST /api/conversations/:id/draft` (sem LLM), depois do clique em **Confirmar**. "Só cria depois da confirmação" é garantido pela estrutura, não pelo prompt.
- **Regras do Anexo A em código.** Prioridade, prazo, "vencido", janela de 7 dias e duplicidade são funções puras e testadas em `packages/core`. O modelo escolhe impacto e urgência; a prioridade sai da função.
- **Privacidade por construção.** As tools são criadas a cada turno com o e-mail da sessão em closure; nenhuma tool aceita e-mail como argumento. O serviço de chamados filtra tudo por solicitante e responde 404 para chamado alheio.
- **Um protocolo de eventos.** O runner com Gemini e o determinístico emitem os mesmos eventos (`action`, `text`, `card`, `decision`, `transfer`). A UI e os testes não sabem qual está rodando.
- **Estado da conversa é a trava.** `with_agent | waiting_analyst | with_analyst | closed`. Fora de `with_agent` o orquestrador grava a mensagem e não chama o agent.
- **Cada serviço com seu banco.** O serviço de chamados é dono de chamados; a web, de conversas, mensagens e estado. Comunicação só por HTTP. Tudo em SQLite em `./data`, que sobrevive a reinício.
- **Legado instável é esperado.** Timeout de 3 s e até 3 novas tentativas com backoff; cada tentativa aparece na linha de ações ("serviço de chamados instável, tentando de novo"); se esgotar, o agent avisa e o rascunho fica salvo para confirmar de novo.
- **NestJS vs Fastify.** Considerei NestJS para o serviço de chamados, mas DI por decorators depende de `emitDecoratorMetadata`, que não é suportado pelo esbuild usado por `tsx` e Vitest. Fastify + zod deu o mesmo resultado (rotas validadas, hooks, injeção via `inject` nos testes) com menos atrito.

## Como o agent decide o que fazer

A cada mensagem, o `ChatService`:

1. Verifica o estado (agent pausado? conversa encerrada?) e o limite de 30 mensagens.
2. Monta um contexto **enxuto**: as últimas 10 mensagens (texto + resumo dos cards, nunca payloads) e uma nota com data/hora, nome, chamado em foco, pergunta pendente e rascunho pendente.
3. Roda o agent Mastra com o prompt de sistema (as regras do Anexo A escritas como procedimento) e as tools:

| Tool | Quando | Ação visível |
|---|---|---|
| `searchHelpCenter` | dúvidas e antes de abrir chamado | buscou na central de ajuda |
| `listMyTickets` | "meu chamado" sem número; checar duplicidade | consultou seus chamados |
| `getTicket` | número informado ou escolhido | consultou o INC-…, calculou o prazo |
| `askWithOptions` | falta informação com respostas previsíveis | (opções clicáveis) |
| `draftTicket` | problema/pedido novo com dados completos | verificou duplicidade, classificou a prioridade, consultou o SLA, montou o rascunho |
| `draftTicketUpdate` | complemento de aberto / reabertura até 7 dias | preparou o complemento / a reabertura |
| `transferToAnalyst` | pedido do funcionário, crítico, vencido, sem segurança | transferiu para o Suporte N1/N2 |
| `redirectOutOfScope` | RH, financeiro, facilities | identificou assunto fora de TI |
| `recordDecision` | **uma vez por resposta** | entendeu · ação · confiança · porquê |

4. Guardrails em código, não só no prompt:
   - `draftTicket` recusa montar rascunho se o funcionário não informou quem é afetado (`impactConfirmedByUser`) e devolve a instrução de perguntar.
   - `draftTicket` procura chamados semelhantes (aberto ou resolvido há até 7 dias) e, se achar, devolve `similar_found` em vez de rascunho.
   - `transferToAnalyst` promove o motivo para "chamado vencido" (fila N2) quando o chamado citado está vencido.
   - Se o modelo não registrar a decisão, o orquestrador **sintetiza** uma a partir do rastro (marcada como "inferida").
   - **Confiança < 50% → analista**: o orquestrador transfere com motivo "Agent pediu ajuda · confiança N%" (como no protótipo).
   - Rascunho de chamado **Crítico** confirmado → transferência automática para o N2.
5. Tudo é transmitido por SSE e salvo na mensagem (ações, cards, decisão, modelo e latência), então o detalhe continua visível ao voltar outro dia e também no console do analista.

## Como garanti a qualidade das decisões

- **Regras determinísticas testadas** (`packages/core`): todas as faixas de prioridade, prazos com fim de expediente, fim de semana, madrugada e plantão de críticos, vencimento a partir da última atualização, janela de reabertura e duplicidade.
- **Fluxos do agent testados ponta a ponta** com o runner determinístico contra o serviço de chamados real em memória (`packages/agent/src/flows.test.ts`): dúvida, consulta com seleção, vencido → analista, abertura com rascunho (nada criado antes de confirmar), duplicidade, reabertura, privacidade, fora de escopo, crítico, pedido de analista, baixa confiança e legado fora do ar.
- **Orquestração testada** (`apps/web/src/server/chat-service.test.ts`): transferência pausa o agent até devolver, analista só responde após assumir, limite de 30 mensagens, privacidade entre funcionários, decisão sintetizada, falha do modelo, confirmação com o legado fora do ar, persistência após reinício.
- **Avaliação com o Gemini real** (`pnpm --filter @nexo/agent smoke`): rodei os cenários do roteiro e corrigi o que falhou com guardrails em código em vez de só mexer no prompt — o modelo não dizia "vencido" (a tool passou a devolver `replyHint`), pulava a pergunta de afetados (virou `impactConfirmedByUser`), transferia vencido para a fila errada (promoção automática do motivo) e reportava sempre 100% de confiança (instrução de calibração).
- **Transparência como mecanismo de revisão**: cada resposta guarda a decisão e o rastro; o analista vê o mesmo detalhe no console.

## Escolha do modelo

**Google Gemini `gemini-3.5-flash-lite`** via Mastra (model router `google/...`), com `thinkingLevel: minimal`.

- **Latência**: no teste, ~2,5 s por turno com tool-call, contra 12–17 s do `gemini-3.5-flash` com raciocínio. Para chat, isso pesa mais que a diferença de qualidade, porque as decisões críticas (prioridade, prazo, duplicidade, confirmação) estão em código.
- **Custo por conversa**: contexto enxuto (janela de 10 mensagens resumidas, prompt de ~600 tokens, tools com schemas curtos), raciocínio mínimo e `maxSteps: 6`. Um turno típico usa 2–4 chamadas ao modelo com poucas centenas de tokens cada; o limite de 30 mensagens por sessão põe um teto no custo por conversa.
- **Configurável** por `GEMINI_MODEL`. Trocar de provedor é trocar o id do model router do Mastra.
- **Resiliência**: o free tier tem 15 requisições/min. Se o Gemini falhar antes de responder (cota, rede, chave), o `FallbackRunner` responde aquele turno pelas regras e marca a ação "modelo indisponível, respondi por regras".

## Principais trade-offs

- **Confirmação determinística** (mais seguro e barato) em vez de deixar o LLM chamar "criar chamado" — perde-se um pouco de flexibilidade (editar é pedir de novo em texto).
- **Polling de 3 s** no console e no chat durante atendimento humano, em vez de WebSocket: simples e suficiente para a escala do desafio.
- **SQLite embutido (`node:sqlite`)**: zero dependências nativas e persiste entre reinícios; não escala horizontalmente.
- **Login sem senha real** (o PRD pede "qualquer senha"); a sessão é um cookie assinado.
- **Duplicidade por sobreposição de termos + categoria**: transparente e testável, mas menos esperto que embeddings; por isso o agent pergunta antes de decidir.
- **Horário útil fixo** (seg–sex 8h–18h, UTC−3), sem feriados.
- **Runner determinístico** cobre os fluxos do roteiro, não linguagem livre arbitrária; serve para CI e para rodar sem chave, não substitui o modelo.

## O que faria com mais tempo

- Deploy (Fly.io/Render com volume para o SQLite, chave em secret, rate limit por sessão e teto diário de tokens).
- Conjunto de avaliação maior com o modelo real (dezenas de conversas rotuladas, métrica de acerto de intenção/ação/prioridade) rodando antes de cada mudança de prompt.
- Push em tempo real (SSE/WebSocket) para o console e notificações ao analista.
- Edição do rascunho campo a campo no próprio card.
- Busca semântica na central de ajuda e na detecção de duplicidade.
- Feriados no cálculo de prazos e SLA por fila (N1/N2).
- Testes E2E de navegador (Playwright) para as telas.

## Processo

Feito com o método BMAD de forma enxuta: PRD → arquitetura → épicos/stories → implementação por story → review. Artefatos em `_bmad-output/`, checklist de requisitos em `docs/REQUIREMENTS_CHECKLIST.md`. Uma branch e um PR por story, com CI (lint, typecheck, testes) e squash merge.
