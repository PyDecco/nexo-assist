---
title: Nexo Assist — Épicos e stories
sources: [prd.md, architecture.md]
stepsCompleted: [requirements, epics, stories, validation]
---

# Épicos e stories — Nexo Assist

Cada épico vira uma branch e um PR pequeno (`feat/...`). Critérios de aceite em Dado/Quando/Então resumido.

## Epic 1: Fundação do monorepo e CI

### Story 1.1: Monorepo, tooling e CI
Como dev, quero pnpm workspaces com TypeScript estrito, ESLint, Vitest e GitHub Actions rodando lint + typecheck + testes em PRs.
- CI não depende de `GEMINI_API_KEY`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` funcionam na raiz.

## Epic 2: Domínio e serviço de chamados

### Story 2.1: Regras do Anexo A em `packages/core`
- Prioridade a partir de impacto × urgência (Crítica/Alta/Média/Baixa) com prazo (1 h, 4 h úteis, 3 e 5 dias úteis).
- Prazo vencido calculado a partir da última atualização; horário útil seg–sex 8h–18h.
- Reabertura permitida até 7 dias após resolução; detecção de chamado semelhante aberto.
- Testes unitários cobrindo cada faixa e bordas (fim de semana, fim do expediente).

### Story 2.2: Serviço de chamados simulado (legado)
- Fastify + SQLite; seed do Anexo B (INC-20311, REQ-10442, INC-20150 da Ana) + chamados de outros funcionários.
- Endpoints: listar por solicitante, detalhar (404 se de outra pessoa), criar, comentar, reabrir, transferir.
- Falhas intermitentes configuráveis (janela de indisponibilidade de alguns segundos) e forçáveis por header em teste.

### Story 2.3: Cliente HTTP resiliente
- Timeout, retry com backoff para 5xx/timeout, callback de tentativa para a UI, erro tipado ao esgotar.

## Epic 3: Agent

### Story 3.1: Tools e central de ajuda
- Tools: buscar na central, listar chamados, consultar chamado, montar rascunho (com duplicidade), montar complemento/reabertura, pedir transferência, redirecionar fora de escopo, opções rápidas, registrar decisão.
- Identidade só por closure (AD-3).

### Story 3.2: Agent Mastra com Gemini e runner determinístico
- `MastraRunner` com `gemini-3.5-flash-lite`, pensamento mínimo, histórico curto.
- `ScriptedRunner` determinístico emitindo o mesmo protocolo de eventos.
- Testes dos fluxos: dúvida, consulta com seleção, vencido → oferta de analista, abertura com rascunho, duplicidade, reabertura, privacidade, fora de escopo, transferência.

## Epic 4: Aplicação web

### Story 4.1: Login, sessão e Meu perfil
- Tela 1 fiel ao protótipo; qualquer senha para usuários da base; analista vai ao console.

### Story 4.2: Chat do funcionário com streaming e transparência
- Telas 2 e 3: SSE, linha de ações, cards (chamado, seletor, rascunho, opções), detalhe da decisão expansível, contador 30 mensagens, estados de carregamento/erro, retomada da conversa.
- Confirmar/Cancelar rascunho por endpoint determinístico.

### Story 4.3: Console do analista
- Telas 4 e 5: lista com filtros e busca, histórico com decisões, assumir (agent pausado), responder, devolver ao agent, encerrar, painel de chamados do funcionário.

## Epic 5: Qualidade e entrega

### Story 5.1: Testes ponta a ponta e README
- E2E de API com runner determinístico (login → chat → rascunho → confirmar → transferir → console assume → devolve).
- README em português com tudo que o PRD pede; checklist de requisitos atualizado.
