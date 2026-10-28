# Checklist de requisitos — Nexo Assist

Fonte: `docs/PRD.pdf` (5 páginas) + `docs/prototype.pen.json`. Cada linha cita o requisito e diz onde foi atendido.

Legenda de status: ✅ feito · 🟡 parcial · ⏳ pendente · ➖ não feito (opcional)

## 1. Critérios de sucesso (Contexto e objetivo)

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| S1 | Resolução sem fila: dúvidas e consultas resolvidas no próprio chat | ✅ | Central de ajuda + consulta no chat (`searchHelpCenter`, `getTicket`); e2e passo 4–5 |
| S2 | Chamados bem abertos: completos, com tipo, categoria e prioridade corretos, sem duplicidade | ✅ | `draftTicket` com afetados obrigatórios, duplicidade e prioridade em `packages/core` |
| S3 | Encaminhamento certo: o que precisa de pessoa chega ao analista na hora certa e com contexto | ✅ | `transferToAnalyst` + resumo; regras em `chat-service.ts`; fila N1/N2 |
| S4 | Transparência: entender o que o agent fez e por quê em cada resposta | ✅ | Linha de ações + painel "por quê?" (`DecisionPanel.tsx`) |

## 2. Histórias

| ID | História | Status | Onde |
|----|----------|--------|------|
| F1 | Funcionário: tirar uma dúvida sem abrir chamado | ✅ | `searchHelpCenter`; teste "história 1" em `flows.test.ts` |
| F2 | Funcionário: saber como está um chamado, sem lembrar o número, e se está atrasado | ✅ | `listMyTickets` seletor + `getTicket` com prazo/vencido |
| F3 | Funcionário: complementar um chamado aberto com novas informações | ✅ | `draftTicketUpdate(kind=comment)` + confirmação |
| F4 | Funcionário: abrir chamado só conversando, conferindo os dados antes da criação | ✅ | `draftTicket` → card de rascunho → `POST /draft` confirm |
| F5 | Funcionário: falar com um analista quando preferir ou quando o problema for grave | ✅ | `transferToAnalyst` (pedido, crítico, vencido, baixa confiança) |
| F6 | Funcionário: voltar outro dia e continuar de onde parou | ✅ | `currentConversation` retoma a última conversa; SQLite |
| A1 | Analista: receber chamados com tipo, categoria, prioridade corretos e descrição completa | ✅ | Descrição completa + afetados + justificativa da prioridade no chamado criado |
| A2 | Analista: ver conversas que precisam dele, incluindo casos em que o agent não teve segurança | ✅ | Console, filtro "Para você", tag "Agent pediu ajuda · confiança N%" |
| A3 | Analista: assumir conversa com agent pausado, devolver ao agent ou encerrar | ✅ | `assume`/`returnToAgent`/`close` em `chat-service.ts`; e2e passos 9–12 |
| L1 | "O sistema de chamados é legado e, de vez em quando, fica indisponível por alguns segundos" (falhas simuladas + retry/timeout/tratamento de erro) | ✅ | `OutageSimulator` + `TicketsClient` (timeout/retry/backoff) + ação visível de nova tentativa |

## 3. O que construir

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| B1 | Login (Tela 1): e-mail corporativo e senha, aceitando funcionários dos dados de exemplo com qualquer senha | ✅ | `/login`, `POST /api/auth/login` (qualquer senha para usuários da base) |
| B2 | Chat (Telas 2 e 3): respostas em tempo real (streaming) | ✅ | SSE em `/api/chat`, leitura incremental em `ChatView.tsx` |
| B2a | Chat: cards de chamado | ✅ | `TicketCard` |
| B2b | Chat: seleção de chamado | ✅ | `TicketSelector` |
| B2c | Chat: rascunho para confirmação | ✅ | `DraftCard`/`UpdateDraftCard` com Confirmar/Editar/Cancelar |
| B2d | Chat: perguntas com opções rápidas | ✅ | `askWithOptions` + `Options` (atalhos 1–5) |
| B2e | Chat: limite de 30 mensagens por sessão | ✅ | `MESSAGE_LIMIT=30`, contador e bloqueio com "Nova conversa" |
| B3 | Agent decide o que fazer a cada mensagem usando central de ajuda e serviço de chamados, seguindo Anexo A | ✅ | `packages/agent` (Mastra + Gemini) com tools e prompt das regras |
| B4 | Serviço de chamados simulado, dados de exemplo, separado do agent: consultar, criar, atualizar, transferir | ✅ | `apps/tickets-service` (processo separado, seed, consultar/criar/atualizar/transferir) |
| B5 | Transferência: conversa marcada como aguardando atendente, agent para de responder até ser liberado | ✅ | Estado `waiting_analyst`; orquestrador não chama o agent |
| B6 | Console do analista (Telas 4 e 5): lista de conversas com filtros e status | ✅ | `ConsoleView.tsx`: filtros Todas/Para você/Com o agent/Minhas + busca |
| B6a | Console: histórico da conversa | ✅ | Histórico com decisões do agent por mensagem |
| B6b | Console: assumir atendimento (agent pausado) | ✅ | "Assumir atendimento" |
| B6c | Console: devolver ao agent e encerrar | ✅ | "Devolver ao agent" e "Encerrar atendimento" |
| B6d | Console: painel com os chamados do funcionário | ✅ | Painel "Chamados de …" (desta conversa + outros) |
| B7 | Visibilidade: ações do agent acima de cada resposta | ✅ | `status-line` em `AgentMessage.tsx` |
| B7a | Visibilidade: detalhe do que entendeu, ação, grau de segurança e por quê (fácil de ler) | ✅ | `DecisionPanel`: intenção, entendeu, ação, segurança (%), porquê, rastro, modelo/latência |

## 4. Requisitos técnicos

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| T1 | TypeScript com tipagem estrita | ✅ | `tsconfig.base.json` strict + `noUncheckedIndexedAccess` |
| T2 | Agent com Mastra (preferência) ou LangGraph.js | ✅ | `@mastra/core` Agent + createTool |
| T3 | Qualquer LLM; explicar a escolha no README | ✅ | README → "Escolha do modelo" |
| T4 | Interface seguindo o protótipo (Next.js/React) | ✅ | Next.js 16; tokens de `prototype.pen.json` |
| T5 | Serviço de chamados simulado, separado do agent | ✅ | HTTP entre web/agent e `tickets-service` |
| T6 | Persistência: conversas, chamados e estado (agent/analista) sobrevivem a reinício | ✅ | SQLite em `./data` (web.db, tickets.db); teste de reinício |
| T7 | Rodar localmente com poucos comandos documentados + `.env.example` | ✅ | `pnpm install && pnpm dev`; `.env.example` |

## 5. Também esperamos

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| E1 | Arquitetura clara: separação interface / agent / serviços, decisões justificadas | ✅ | README → arquitetura; `_bmad-output/.../architecture.md` |
| E2 | Boas práticas: código organizado, testes onde fazem diferença, tratamento de erros, commits que contam a história | ✅ | 72 testes + 12 verificações E2E no CI; PRs por story com conventional commits |
| E3 | Eficiência: respostas rápidas, uso consciente do modelo, custo por conversa | ✅ | flash-lite, pensamento mínimo, janela de 10 mensagens, limite 30 |
| E4 | Segurança: chaves fora do código | ✅ | `.env` ignorado; chave nunca logada |
| E5 | Privacidade: chamados de um funcionário nunca expostos a outro | ✅ | Identidade por closure nas tools; filtro por solicitante no serviço; 403 entre funcionários |

## 6. Diferenciais

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| D1 | Deploy com link público, chaves protegidas e limite de uso | ➖ | Não feito (opcional); plano no README |

## 7. Entregáveis

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| R1 | Link do repositório no GitHub | ✅ | https://github.com/PyDecco/nexo-assist |
| R2a | README: como rodar | ✅ | README |
| R2b | README: visão geral da arquitetura | ✅ | README |
| R2c | README: como o agent decide o que fazer | ✅ | README |
| R2d | README: como garantiu a qualidade das decisões | ✅ | README |
| R2e | README: principais trade-offs | ✅ | README |
| R2f | README: o que faria com mais tempo | ✅ | README |
| R2g | README: escolha do modelo (Requisitos técnicos) | ✅ | README |
| R3 | Link do deploy, se houver | ➖ | Sem deploy |

## 8. Critérios de avaliação

| ID | Critério | Status | Onde |
|----|----------|--------|------|
| C1 | Qualidade das decisões: entende e escolhe a ação certa seguindo as regras | ✅ | Regras em código + guardrails nas tools + avaliação com Gemini real |
| C2 | Condução: pergunta quando falta info, confirma antes de agir, mantém contexto, responde claro | ✅ | Perguntas com opções, rascunho para confirmar, histórico + estado |
| C3 | Transparência: fácil ver o que o agent fez e por quê | ✅ | Ações + "por quê?" em toda resposta, também no console |
| C4 | Interface: fidelidade ao protótipo, estados de carregamento e erro | ✅ | Telas 1–6; loading, erro, legado instável, limite, encerrada |
| C5 | Arquitetura e boas práticas: responsabilidades, tipagem, erros, organização, commits | ✅ | Camadas core/client/agent/service/web; erros tipados |
| C6 | Comunicação: clareza do README | ✅ | README |
| C7 | Diferenciais: deploy (opcional) | ➖ | Sem deploy |

## 9. Anexo A — regras do service desk

| ID | Regra | Status | Onde |
|----|-------|--------|------|
| AA1 | Tipos: INC (algo parou/não funciona) e REQ (pedido de acesso, equipamento, software) | ✅ | `draftTicket.type` INC/REQ |
| AA2 | Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail, Outros | ✅ | `TICKET_CATEGORIES` |
| AA3 | Abertura exige título, descrição, tipo, categoria, prioridade e afetados | ✅ | Schema de `draftTicket` + validação zod no serviço |
| AA4 | Rascunho mostrado; só cria/atualiza após confirmação do funcionário | ✅ | Criação só em `confirmDraft` (sem LLM) |
| AA5 | Sem duplicidade: chamado aberto sobre o mesmo problema é atualizado, não duplicado | ✅ | `findSimilarTickets` → `similar_found` |
| AA6 | Chamados resolvidos há até 7 dias podem ser reabertos | ✅ | `canReopen` + `POST /reopen` (409 após 7 dias) |
| AA7 | Transferência quando: funcionário pede / caso crítico / chamado vencido / agent sem segurança | ✅ | Motivos `user_request`/`critical`/`overdue`/`low_confidence` |
| AA8 | Transferência leva resumo do caso | ✅ | `summary` da transferência exibido no console |
| AA9 | Agent não responde enquanto a conversa está com analista | ✅ | Teste "transferência pausa o agent" |
| AA10 | Privacidade: informação de chamado só para quem o abriu | ✅ | 404 no serviço para chamado alheio; teste de privacidade |
| AA11 | Escopo: só TI; RH, financeiro, facilities são redirecionados | ✅ | `redirectOutOfScope` |
| AA12 | Prioridade = impacto (quantos afetados) × urgência (compromisso em risco) | ✅ | `classifyPriority(impacto, urgência)` |
| AA13 | Crítica: algo parado para equipe/empresa — 1 hora | ✅ | `computeDueAt` critical = 1 h |
| AA14 | Alta: impede uma pessoa de trabalhar ou compromisso no mesmo dia — 4 horas úteis | ✅ | 4 horas úteis |
| AA15 | Média: atrapalha, mas há alternativa — 3 dias úteis | ✅ | 3 dias úteis |
| AA16 | Baixa: pedidos e melhorias sem urgência — 5 dias úteis | ✅ | 5 dias úteis |
| AA17 | Prazo vale para primeira resposta e para cada atualização; passado o prazo, chamado vencido | ✅ | `slaStatus` a partir de `updatedAt` (atualização do suporte) |

## 10. Anexo B — dados de exemplo

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| AB1 | Alguns funcionários | ✅ | `SEED_USERS` (5 funcionários, 2 analistas) |
| AB2 | 5 a 10 artigos curtos na central de ajuda | ✅ | 8 artigos em `help-center.ts` |
| AB3 | Artigo "VPN com erro 809 … só Windows 10; no Windows 11, abra um chamado" | ✅ | KB-001 |
| AB4 | Artigo "Horário do service desk: seg–sex, 8h–18h; críticos com plantão 24h" | ✅ | KB-002 |
| AB5 | Chamados em situações variadas: aberto, vencido, resolvido recentemente, de outros funcionários | ✅ | `seed.ts`: aberto, vencido, aprovado, resolvido recente, antigos e de outros funcionários |
| AB6 | INC-20311 Notebook lento após atualização do Windows · Hardware · Média · Aguardando analista · há 6 dias | ✅ | INC-20311 (atualizado há 6 dias → vencido) |
| AB7 | REQ-10442 Segundo monitor para home office · Hardware · Baixa · Aprovado · há 1 semana | ✅ | REQ-10442 |
| AB8 | INC-20150 Senha do SAP bloqueada · Acesso · Média · Resolvido · há 4 dias | ✅ | INC-20150 (resolvido há 4 dias → reabrível) |

## 11. Anexo C — telas do protótipo

| ID | Tela | Status | Onde |
|----|------|--------|------|
| AC1 | 1. Login: e-mail e senha, com apresentação do Nexo Assist | ✅ | `/login` |
| AC2 | 2. Abertura de chamado: perguntas para completar, prioridade com prazo, rascunho para confirmação | ✅ | `/atendimento` (rascunho com prioridade e prazo) |
| AC3 | 3. Consulta: seleção entre chamados abertos, status com prazo vencido, oferta de chamar analista | ✅ | `/atendimento` (seleção, vencido, oferta de analista) |
| AC4 | 4. Console — conversa transferida: lista, aguardando atendente com agent pausado, chamados do funcionário | ✅ | `/console` aguardando atendente |
| AC5 | 5. Console — analista atendendo: assumiu e pode devolver ao agent ou encerrar | ✅ | `/console` analista atendendo |
| AC6 | (protótipo) Cliente — Meu perfil | ✅ | `/perfil` |
