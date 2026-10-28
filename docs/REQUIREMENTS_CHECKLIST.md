# Checklist de requisitos — Nexo Assist

Fonte: `docs/PRD.pdf` (5 páginas) + `docs/prototype.pen.json`. Cada linha cita o requisito e diz onde foi atendido.

Legenda de status: ✅ feito · 🟡 parcial · ⏳ pendente · ➖ não feito (opcional)

## 1. Critérios de sucesso (Contexto e objetivo)

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| S1 | Resolução sem fila: dúvidas e consultas resolvidas no próprio chat | ⏳ | |
| S2 | Chamados bem abertos: completos, com tipo, categoria e prioridade corretos, sem duplicidade | ⏳ | |
| S3 | Encaminhamento certo: o que precisa de pessoa chega ao analista na hora certa e com contexto | ⏳ | |
| S4 | Transparência: entender o que o agent fez e por quê em cada resposta | ⏳ | |

## 2. Histórias

| ID | História | Status | Onde |
|----|----------|--------|------|
| F1 | Funcionário: tirar uma dúvida sem abrir chamado | ⏳ | |
| F2 | Funcionário: saber como está um chamado, sem lembrar o número, e se está atrasado | ⏳ | |
| F3 | Funcionário: complementar um chamado aberto com novas informações | ⏳ | |
| F4 | Funcionário: abrir chamado só conversando, conferindo os dados antes da criação | ⏳ | |
| F5 | Funcionário: falar com um analista quando preferir ou quando o problema for grave | ⏳ | |
| F6 | Funcionário: voltar outro dia e continuar de onde parou | ⏳ | |
| A1 | Analista: receber chamados com tipo, categoria, prioridade corretos e descrição completa | ⏳ | |
| A2 | Analista: ver conversas que precisam dele, incluindo casos em que o agent não teve segurança | ⏳ | |
| A3 | Analista: assumir conversa com agent pausado, devolver ao agent ou encerrar | ⏳ | |
| L1 | "O sistema de chamados é legado e, de vez em quando, fica indisponível por alguns segundos" (falhas simuladas + retry/timeout/tratamento de erro) | ⏳ | |

## 3. O que construir

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| B1 | Login (Tela 1): e-mail corporativo e senha, aceitando funcionários dos dados de exemplo com qualquer senha | ⏳ | |
| B2 | Chat (Telas 2 e 3): respostas em tempo real (streaming) | ⏳ | |
| B2a | Chat: cards de chamado | ⏳ | |
| B2b | Chat: seleção de chamado | ⏳ | |
| B2c | Chat: rascunho para confirmação | ⏳ | |
| B2d | Chat: perguntas com opções rápidas | ⏳ | |
| B2e | Chat: limite de 30 mensagens por sessão | ⏳ | |
| B3 | Agent decide o que fazer a cada mensagem usando central de ajuda e serviço de chamados, seguindo Anexo A | ⏳ | |
| B4 | Serviço de chamados simulado, dados de exemplo, separado do agent: consultar, criar, atualizar, transferir | ⏳ | |
| B5 | Transferência: conversa marcada como aguardando atendente, agent para de responder até ser liberado | ⏳ | |
| B6 | Console do analista (Telas 4 e 5): lista de conversas com filtros e status | ⏳ | |
| B6a | Console: histórico da conversa | ⏳ | |
| B6b | Console: assumir atendimento (agent pausado) | ⏳ | |
| B6c | Console: devolver ao agent e encerrar | ⏳ | |
| B6d | Console: painel com os chamados do funcionário | ⏳ | |
| B7 | Visibilidade: ações do agent acima de cada resposta | ⏳ | |
| B7a | Visibilidade: detalhe do que entendeu, ação, grau de segurança e por quê (fácil de ler) | ⏳ | |

## 4. Requisitos técnicos

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| T1 | TypeScript com tipagem estrita | ⏳ | |
| T2 | Agent com Mastra (preferência) ou LangGraph.js | ⏳ | |
| T3 | Qualquer LLM; explicar a escolha no README | ⏳ | |
| T4 | Interface seguindo o protótipo (Next.js/React) | ⏳ | |
| T5 | Serviço de chamados simulado, separado do agent | ⏳ | |
| T6 | Persistência: conversas, chamados e estado (agent/analista) sobrevivem a reinício | ⏳ | |
| T7 | Rodar localmente com poucos comandos documentados + `.env.example` | ⏳ | |

## 5. Também esperamos

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| E1 | Arquitetura clara: separação interface / agent / serviços, decisões justificadas | ⏳ | |
| E2 | Boas práticas: código organizado, testes onde fazem diferença, tratamento de erros, commits que contam a história | ⏳ | |
| E3 | Eficiência: respostas rápidas, uso consciente do modelo, custo por conversa | ⏳ | |
| E4 | Segurança: chaves fora do código | ⏳ | |
| E5 | Privacidade: chamados de um funcionário nunca expostos a outro | ⏳ | |

## 6. Diferenciais

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| D1 | Deploy com link público, chaves protegidas e limite de uso | ⏳ | |

## 7. Entregáveis

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| R1 | Link do repositório no GitHub | ⏳ | |
| R2a | README: como rodar | ⏳ | |
| R2b | README: visão geral da arquitetura | ⏳ | |
| R2c | README: como o agent decide o que fazer | ⏳ | |
| R2d | README: como garantiu a qualidade das decisões | ⏳ | |
| R2e | README: principais trade-offs | ⏳ | |
| R2f | README: o que faria com mais tempo | ⏳ | |
| R2g | README: escolha do modelo (Requisitos técnicos) | ⏳ | |
| R3 | Link do deploy, se houver | ⏳ | |

## 8. Critérios de avaliação

| ID | Critério | Status | Onde |
|----|----------|--------|------|
| C1 | Qualidade das decisões: entende e escolhe a ação certa seguindo as regras | ⏳ | |
| C2 | Condução: pergunta quando falta info, confirma antes de agir, mantém contexto, responde claro | ⏳ | |
| C3 | Transparência: fácil ver o que o agent fez e por quê | ⏳ | |
| C4 | Interface: fidelidade ao protótipo, estados de carregamento e erro | ⏳ | |
| C5 | Arquitetura e boas práticas: responsabilidades, tipagem, erros, organização, commits | ⏳ | |
| C6 | Comunicação: clareza do README | ⏳ | |
| C7 | Diferenciais: deploy (opcional) | ⏳ | |

## 9. Anexo A — regras do service desk

| ID | Regra | Status | Onde |
|----|-------|--------|------|
| AA1 | Tipos: INC (algo parou/não funciona) e REQ (pedido de acesso, equipamento, software) | ⏳ | |
| AA2 | Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail, Outros | ⏳ | |
| AA3 | Abertura exige título, descrição, tipo, categoria, prioridade e afetados | ⏳ | |
| AA4 | Rascunho mostrado; só cria/atualiza após confirmação do funcionário | ⏳ | |
| AA5 | Sem duplicidade: chamado aberto sobre o mesmo problema é atualizado, não duplicado | ⏳ | |
| AA6 | Chamados resolvidos há até 7 dias podem ser reabertos | ⏳ | |
| AA7 | Transferência quando: funcionário pede / caso crítico / chamado vencido / agent sem segurança | ⏳ | |
| AA8 | Transferência leva resumo do caso | ⏳ | |
| AA9 | Agent não responde enquanto a conversa está com analista | ⏳ | |
| AA10 | Privacidade: informação de chamado só para quem o abriu | ⏳ | |
| AA11 | Escopo: só TI; RH, financeiro, facilities são redirecionados | ⏳ | |
| AA12 | Prioridade = impacto (quantos afetados) × urgência (compromisso em risco) | ⏳ | |
| AA13 | Crítica: algo parado para equipe/empresa — 1 hora | ⏳ | |
| AA14 | Alta: impede uma pessoa de trabalhar ou compromisso no mesmo dia — 4 horas úteis | ⏳ | |
| AA15 | Média: atrapalha, mas há alternativa — 3 dias úteis | ⏳ | |
| AA16 | Baixa: pedidos e melhorias sem urgência — 5 dias úteis | ⏳ | |
| AA17 | Prazo vale para primeira resposta e para cada atualização; passado o prazo, chamado vencido | ⏳ | |

## 10. Anexo B — dados de exemplo

| ID | Requisito | Status | Onde |
|----|-----------|--------|------|
| AB1 | Alguns funcionários | ⏳ | |
| AB2 | 5 a 10 artigos curtos na central de ajuda | ⏳ | |
| AB3 | Artigo "VPN com erro 809 … só Windows 10; no Windows 11, abra um chamado" | ⏳ | |
| AB4 | Artigo "Horário do service desk: seg–sex, 8h–18h; críticos com plantão 24h" | ⏳ | |
| AB5 | Chamados em situações variadas: aberto, vencido, resolvido recentemente, de outros funcionários | ⏳ | |
| AB6 | INC-20311 Notebook lento após atualização do Windows · Hardware · Média · Aguardando analista · há 6 dias | ⏳ | |
| AB7 | REQ-10442 Segundo monitor para home office · Hardware · Baixa · Aprovado · há 1 semana | ⏳ | |
| AB8 | INC-20150 Senha do SAP bloqueada · Acesso · Média · Resolvido · há 4 dias | ⏳ | |

## 11. Anexo C — telas do protótipo

| ID | Tela | Status | Onde |
|----|------|--------|------|
| AC1 | 1. Login: e-mail e senha, com apresentação do Nexo Assist | ⏳ | |
| AC2 | 2. Abertura de chamado: perguntas para completar, prioridade com prazo, rascunho para confirmação | ⏳ | |
| AC3 | 3. Consulta: seleção entre chamados abertos, status com prazo vencido, oferta de chamar analista | ⏳ | |
| AC4 | 4. Console — conversa transferida: lista, aguardando atendente com agent pausado, chamados do funcionário | ⏳ | |
| AC5 | 5. Console — analista atendendo: assumiu e pode devolver ao agent ou encerrar | ⏳ | |
| AC6 | (protótipo) Cliente — Meu perfil | ⏳ | |
