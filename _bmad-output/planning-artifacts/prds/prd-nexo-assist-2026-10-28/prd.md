---
title: Nexo Assist — PRD
status: final
created: 2026-10-28
updated: 2026-10-28
source: docs/PRD.pdf (prevalece em caso de conflito)
---

# Nexo Assist — PRD

## Visão

Um agent de atendimento em chat para o service desk de TI da Nexo (~2.000 funcionários). O funcionário descreve o problema com as próprias palavras; o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e chama um analista quando precisa. Do outro lado, analistas N1/N2 recebem chamados bem classificados e conversas transferidas num console.

## Métricas de sucesso

| Métrica | Sinal no produto | Contra-métrica |
|---|---|---|
| Resolução sem fila | Conversa encerrada sem chamado nem transferência | Funcionário reabre o mesmo assunto em seguida |
| Chamados bem abertos | Chamado criado com todos os campos do Anexo A e sem duplicata | Excesso de perguntas antes do rascunho |
| Encaminhamento certo | Transferência com resumo e motivo (pedido, crítico, vencido, baixa confiança) | Transferências desnecessárias |
| Transparência | Toda resposta do agent traz ações + decisão (entendeu, ação, confiança, porquê) | — |

## Usuários

- **Funcionário** (ex.: Ana Souza, Financeiro) — entra com e-mail corporativo.
- **Analista** (ex.: Rafael Lima, Suporte N2) — usa o console.

## Funcionalidades e requisitos

### F1. Identificação
- **FR1** Login com e-mail corporativo e senha; aceita qualquer senha para os funcionários e analistas da base de exemplo; e-mail desconhecido é recusado com mensagem clara.
- **FR2** Funcionário vai para o Atendimento; analista vai para o Console.
- **FR3** Página "Meu perfil" com nome e e-mail (Tela 6 do protótipo).

### F2. Chat do funcionário
- **FR4** Respostas em tempo real (streaming de texto e das ações).
- **FR5** Linha de ações acima de cada resposta ("consultou seus chamados", "classificou a prioridade"…).
- **FR6** Detalhe da decisão por resposta: o que entendeu, ação tomada, grau de segurança (%) e por quê, além do rastro de ferramentas.
- **FR7** Cards: chamado, seletor de chamados, rascunho com Confirmar/Editar/Cancelar, opções rápidas numeradas.
- **FR8** Limite de 30 mensagens do funcionário por sessão (conversa), com contador "N/30 mensagens nesta sessão" e bloqueio ao atingir.
- **FR9** Ao voltar outro dia, a última conversa não encerrada é retomada com histórico e estado.
- **FR10** Estados de carregamento e erro (serviço instável, LLM indisponível) visíveis e recuperáveis.

### F3. Agent
- **FR11** Responde dúvidas pela central de ajuda sem abrir chamado quando o artigo resolve (respeitando condições do artigo, ex.: só Windows 10).
- **FR12** Consulta chamados do próprio funcionário sem exigir número; quando há vários abertos, pede para escolher.
- **FR13** Informa status e se o chamado está vencido (prazo do Anexo A a partir da última atualização).
- **FR14** Abre chamado conversando: pergunta o que falta (afetados, urgência), classifica tipo, categoria e prioridade, mostra rascunho; só cria após Confirmar.
- **FR15** Sem duplicidade: se há chamado aberto sobre o mesmo problema, propõe complementar; resolvido há ≤ 7 dias pode ser reaberto; ambos após confirmação.
- **FR16** Transfere para analista quando o funcionário pede, em caso crítico, em chamado vencido ou com baixa confiança, levando resumo do caso.
- **FR17** Assuntos fora de TI (RH, financeiro, facilities) são redirecionados ao canal certo.
- **FR18** Nunca revela chamado de outra pessoa.

### F4. Serviço de chamados (legado simulado)
- **FR19** Processo separado do agent; consultar, criar, comentar, reabrir e transferir chamados.
- **FR20** Simula indisponibilidade de alguns segundos; o cliente usa timeout, retry com backoff e erro amigável.
- **FR21** Dados de exemplo do Anexo B (incluindo INC-20311, REQ-10442, INC-20150) e de outros funcionários.

### F5. Transferência e console do analista
- **FR22** Ao transferir, a conversa fica "Aguardando atendente" e o agent não responde até ser liberada.
- **FR23** Lista de conversas com filtros (Todas, Para você, Com o agent, Minhas), busca e status/motivo (ex.: "Agent pediu ajuda · confiança 41%").
- **FR24** Histórico completo da conversa com resumo da transferência e decisões do agent.
- **FR25** Assumir atendimento (agent pausado), responder, devolver ao agent ou encerrar.
- **FR26** Painel com os chamados do funcionário (desta conversa e outros).

## Regras de negócio (Anexo A)

- Tipos INC/REQ; categorias Acesso, Rede e VPN, Hardware, Software, E-mail, Outros.
- Campos obrigatórios: título, descrição, tipo, categoria, prioridade, afetados.
- Prioridade = impacto × urgência. Crítica 1 h · Alta 4 h úteis · Média 3 dias úteis · Baixa 5 dias úteis. Prazo vale para primeira resposta e cada atualização; passado, o chamado está vencido.

## Requisitos não funcionais

- **NFR1** TypeScript estrito em todo o código.
- **NFR2** Persistência de conversas, chamados e estado da conversa que sobrevive a reinício.
- **NFR3** Custo: modelo flash-lite, contexto enxuto (janela de histórico curta + estado resumido); primeira resposta em poucos segundos.
- **NFR4** Chaves só em `.env`; `.env.example` versionado.
- **NFR5** Rodar com poucos comandos; CI com lint, typecheck e testes sem depender da chave do LLM (agent determinístico de teste).

## Fora de escopo

Deploy (opcional, não pago), SSO real, notificações por e-mail, SLA com feriados.

## Open questions

Nenhuma bloqueante. Premissas registradas em `.memlog.md`.
