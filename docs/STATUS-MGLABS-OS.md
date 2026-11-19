# MGLABS OS — estado da implementação

Atualizado em 18/11/2026 (primeira versão funcional). Este arquivo diz **o que existe de verdade**, o que é inicial e o que falta. Atualize-o a cada entrega.

Legenda: ✅ funcional com persistência real · 🟡 inicial (funciona, mas falta lapidar; a tela diz o que falta) · ⬜ não existe ainda.

## Por módulo

| Módulo | Estado | O que existe | O que falta |
| --- | --- | --- | --- |
| **Shell / design** | ✅ | Marca oficial (`public/brand`), tema **claro padrão** (linguagem Chiarelli: névoa/floresta, Fraunces + Inter + JetBrains Mono) + escuro, sidebar enxuta (Início, Radar, CRM, Mensagens, Agenda, Projetos + Configurações) recolhível e responsiva (gaveta no celular), busca global `Ctrl/Cmd+K`, atalhos `g`+letra, `loading.tsx`/skeletons, estados vazios, erro/404, foco visível, `prefers-reduced-motion`, impressão | Notificações no topo (ícone); validação visual autenticada em navegador real |
| **Dashboard (Início)** | ✅ | Leads, oportunidades ativas, tarefas (atrasadas/hoje), fechados, valor do funil (previsto e ponderado), recebido, cobertura de contatos, taxa de resposta e aprovação de propostas por SQL, fila de follow-up guiada pelo histórico (`attentionQueue`), filtro 7/30/90 dias e visão integrada de relatórios (`visao=relatorios`) | Metas editáveis; período personalizado |
| **Radar** | ✅ | Busca Overture, clustering WebGL GeoJSON em `RadarMap`, paginação progressiva (`600+`), oferta "Você vende" propagada ao Estúdio, fila diária determinística ("Fila inteligente do dia"), ignorar/adiar 7 dias/já contatei, Lead Score sem falsos negativos (`=== false`, estados explícitos sem inventar evidência), linguagem neutra para site/WhatsApp não confirmado, polling com backoff/cancelamento/retry | Fotos do negócio e horário (não há fonte aberta); validação com PostGIS real no Neon |
| **CRM** | ✅ | Unificado em abas (`Funil`, `Empresas e contatos`, `Clientes`, `Propostas`), quadro arrastável + tabela, ficha em painel com criação de proposta no contexto da oportunidade, notas/ligação/resposta/reunião, próximo passo, motivo de perda obrigatório, "fechar e criar projeto", "não contatar mais", export CSV, permissões verificadas por módulo | Importação CSV com revisão/deduplicação; pipelines múltiplos; responsável por oportunidade na UI |
| **Empresas e contatos** | ✅ | Incorporado ao CRM (`/crm?aba=empresas` e `/crm?aba=clientes`, mantendo ficha 360° `/empresas/[id]` e redirects de rotas antigas), contatos, opt-out, timeline | Mesclar duplicadas; consentimento detalhado (LGPD) |
| **Estúdio de Mensagens** | ✅ | Empresa/oportunidade → fatos verificados (Radar), oferta pré-selecionada do Radar, templates comerciais por oferta (`pickTemplateForOffer`) com preenchimento em 1 clique, editor livre, rascunhos, `wa.me`, confirmação "Mandou?" transacional e idempotente (`idempotencyKey`), IA Gemini opcional | Rascunho de e-mail por integração |
| **Agenda (Tarefas)** | ✅ | Hoje, atrasadas, 7 dias (agrupadas por dia), abertas, sem data, concluídas (histórico); prioridade, vencimento/horário, vínculo com oportunidade/cliente/projeto; chave de deduplicação | Calendário mensal; recorrência; lembretes/notificações fora do app |
| **Propostas** | ✅ | Integrada ao CRM (`/crm?aba=propostas`) e à ficha da oportunidade (`DealDrawer`), catálogo editável, versões congeladas ao enviar, eventos, pré-visualização imprimível responsiva | Link compartilhável com validade/visualização; PDF; assinatura; geração de escopo por IA |
| **Projetos** | ✅ | Conversão idempotente do negócio, escopo, status, fase, prazo, tarefas, anotações, links, documentos com direito de uso, seções editáveis com `[CONFIRMAR]`, linha do tempo, financeiro do projeto, "copiar briefing (Markdown)" | Upload de arquivos; exportar ZIP para o Claude Code; versões/aprovações do briefing |
| **Conhecimento** | 🟡 | Oculto da navegação principal e da busca global; rota `/conhecimento` preservada para não perder acesso caso usada manualmente | Sincronização com o Second Brain (Obsidian) |
| **Financeiro** | ✅ | Em **Configurações → Financeiro** (`/financeiro`), cobranças em centavos, pagamentos concorrente-seguros (`SELECT ... FOR UPDATE` em transação), estados derivados, resumo | Despesas; comprovantes; gateway/webhook/conciliação; nota fiscal; reembolso |
| **Configurações / Sistema** | ✅ | Navegação agrupada (`Integrações e IA`, `Funil e catálogo`, `Financeiro`, `Sistema` `/status`), tokens MCP, etapas editáveis, status da IA, atualização manual do Overture restrita a `owner`/`admin` | Convite de membros; retenção/LGPD |
| **IA (Gemini)** | ✅ | `lib/ai/*`: falha rápida quando `GEMINI_API_KEY` está ausente (`assertAiEnabled`), reserva atômica de cota diária por workspace/dia (`pg_advisory_xact_lock`), dados anonimizados, autorização explícita | Testar chamadas reais com `GEMINI_API_KEY` configurada |
| **MCP** | ✅ | `/api/mcp`, tokens Bearer escopados (leitura vs escrita), 9 ferramentas de leitura e 4 de escrita controlada, bloqueio de escrita em token `read` e omissão de canais em opt-out | Testar conexão real do Claude Code em ambiente publicado |

## Design atual (18/11/2026)

Os documentos `docs/DESIGN-SYSTEM-MGLABS-OS.md` e o PRD ainda estão no PR #5 (só documentação). Até lá, o que vale é isto:

**Modo claro como padrão, inspirado no Chiarelli Core** (o escuro continua no botão do topo), mantendo o verde e a marca mglabs:
- Cores (claro): fundo névoa `#f4f5ef`, superfície `#ffffff`, texto floresta `#0f1f17`, secundário `#5a6356`, linhas finas `#e2e5da` (fortes `#c7cbb8`), marca `#0b5a3e` (hover `#08734c`), tom suave `#e8f2ec`, sucesso `#1f7a4d`, alerta `#a9481b`, erro `#a8283f`, info `#2f6690`.
- Tipografia: títulos de página e números grandes em **Fraunces**; interface em **Inter**; rótulos de seção em **JetBrains Mono** caixa alta (`.eyebrow`); o nome "mglabs." segue em Space Grotesk, como na logo.
- Forma: cartões com raio 12 px e borda fina, controles com 8 px, sombra só em elementos flutuantes (`--shadow-float`).

**Radar no fluxo do ProspecZ** (busca → resultados no mapa → ficha), com marca, código e ícones próprios:
- Mapa: OpenStreetMap padrão (tiles raster de openstreetmap.org, com atribuição), círculo do raio em verde, pinos brancos com anel colorido pela nota; atenuado no tema escuro.
- Busca: cartão "Encontre clientes" — Você vende, Para quem (campo com sugestões + atalhos), Onde (cidade ou clique no mapa), Raio e o botão principal.
- Resultados: "‹ Nova busca", total, **Dinheiro em jogo** (preço editável), **Abordar agora** (abre o próximo negócio com contato no Estúdio), filtros e lista com a nota em anel.
- Ficha: anel da nota, etiquetas, **etapas do funil em pílulas** (escolher uma adiciona ao CRM), cartões "Por que é uma oportunidade" e "Contato", "Pediu para não ser contatado".
- Celular: mapa em cima, resultados numa folha inferior, ficha em tela cheia.
- Diferenças inevitáveis: a base aberta (Overture) não tem fotos, nota do Google nem horário de funcionamento; no lugar aparecem a confiança e o número de fontes.

## Decisões e desvios (com justificativa)

- **Modelo de dados**: seguiu o PRD (`crm_companies`, `crm_contacts`, `crm_deals`, `crm_activities`, `crm_tasks`, …), com `workspace_id` em tudo. Sem tabela `crm_pipelines`: um pipeline por espaço, etapas em `crm_stages` (renomeáveis). `leads`/`activities` antigos continuam no banco; o app lê só das tabelas novas.
- **Etapas**: Novo → Qualificado → Primeiro contato → Conversa → Reunião → Proposta → Negociação → Fechado ganho / Perdido. Antigas: abordado→Primeiro contato, respondeu→Conversa, fechado→Fechado ganho.
- **Anthropic removido** (`lib/ai/message.ts` e `@anthropic-ai/sdk`): a geração de mensagens migrou para o Estúdio com Gemini opcional. Era a única dependência paga; o app agora funciona sem nenhuma chave de IA.
- **Opt-out é global** (por telefone/lugar, não por espaço de trabalho): é a escolha mais segura e mantém a tabela `optouts` existente.
- **Acesso**: autorização no servidor por membro do espaço de trabalho (`lib/services/ctx.ts`); contas sem vínculo não veem nada. Papéis (owner/admin/comercial/produção/financeiro) já limitam módulos; falta tela de convite.
- **Valor "contratado"** = total da proposta aprovada do negócio ganho (ou, sem proposta, o valor previsto). **Recebido** = soma de pagamentos. **A receber** = cobranças em aberto menos pagamentos.
- **Modelo Gemini**: padrão `gemini-3.5-flash-lite` (conforme `docs/ARQUITETURA-IA-MCP-GEMINI.md`), configurável em `GEMINI_MODEL`. **Não consegui confirmar o nome do modelo nem as cotas gratuitas da sua conta** (sem acesso à documentação do Google nem à chave neste ambiente): confira em aistudio.google.com/rate-limit. Se o modelo não existir, o app mostra um erro claro e segue no modo manual.

## Segurança

- Chaves só no servidor (nenhuma `NEXT_PUBLIC_` nova); `GEMINI_API_KEY` nunca vai ao navegador, HTML ou log.
- Toda Server Action passa por `act()` → `requireCtx()`; erros inesperados viram mensagem genérica (sem vazar SQL). Rotas de API usam sessão ou token; o MCP usa token Bearer próprio (hash SHA-256, escopo leitura/escrita, validade, revogação, limite de 60 chamadas/min por instância).
- Opt-out é checado antes de exibir botões de contato, gerar/salvar mensagem, abrir `wa.me` e no MCP.
- IA: `sanitizeForAi()` remove e-mail, telefone, CPF/CNPJ, links, @perfis e valores; nomes de contatos nunca vão ao Gemini (marcadores `{{contato}}`/`{{remetente}}` são preenchidos no servidor); autorização explícita; limite diário; sem retry em 429/503; detector de promessas/urgência/desconto nas sugestões.
- Nada é enviado automaticamente: WhatsApp só abre `wa.me` com texto pronto; o registro no histórico exige confirmação.
- **Faça**: desligar o cadastro público no Neon Auth e definir `OWNER_EMAIL`.

## O que foi verificado — e o que não foi

Verificado localmente após as entregas P0–P4:
- `npx next typegen`, `npx tsc --noEmit` e `npm run lint` limpos.
- `npm test` + `CAPTURE_SQL=1 npx vitest run tests/sql-capture.test.ts` aprovados (`tests/domain.test.ts`, `tests/pure.test.ts`, `tests/p0-security.test.ts`, `tests/p1-radar.test.ts`, `tests/p2-navigation.test.ts`, `tests/p3-prospecting.test.ts`, `tests/p4-qa.test.ts` e `tests/sql-capture.test.ts`):
  - **P0**: atomicidade/staging Overture e bloqueio para não-admins, SSRF/DNS rebinding (`resolvePublicAddresses`, `requestPinned`, redirects), matriz de permissões por módulo/papel, bloqueio concorrente de pagamentos, idempotência no registro de envio de mensagem e reserva atômica da cota diária do Gemini.
  - **P1**: `null` vs `false` no score, linguagem neutra de auditoria/WhatsApp, propagação de "Você vende" até o Estúdio, filtros separados (`Prioritários` vs `Com contato`) e paginação/clustering.
  - **P2**: redução do menu principal para 6 entradas + Configurações e exclusão de Conhecimento da busca global.
  - **P3**: fila diária determinística (`buildProspectQueue`), ignorar/adiar/já contatei e matching de templates comerciais por oferta.
  - **P4**: benchmark de 5.000 pontos GeoJSON + fila de prospecção, smoke JSON-RPC do servidor MCP (auth, 405, lista de ferramentas, bloqueio de escrita read-only, omissão por opt-out), degradação segura do Gemini sem `GEMINI_API_KEY`, existência de rotas + `loading.tsx`/`error.tsx`/`not-found.tsx` + `401` em `/api/health`.

**Não verificado neste ambiente** (sem Postgres local, credenciais Neon, API key do Gemini ou navegador autenticado):
- `tests/integration-crm.test.ts` (ignorado sem `TEST_DATABASE_URL`, incluindo testes concorrentes contra Postgres real).
- Busca real do Radar sobre PostGIS no Neon, aplicação da migration `0006_p0_idempotency.sql` em banco Neon e cron de atualização Overture.
- Chamadas reais ao Gemini (`GEMINI_API_KEY`) e conexão real do Claude Code ao `/api/mcp`.
- Renderização e interação autenticada no navegador (desktop 1440 e celular 390) e `npm run build` (no ambiente atual, `next build` com Turbopack falha ao abrir worker para `node_modules/maplibre-gl/dist/maplibre-gl.css`).

## Para colocar no ar

1. Branch/snapshot do Neon `production`; aplicar `npm run db:migrate` (ou rodar o SQL `0005` no branch e comparar contagens).
2. Variáveis: `OWNER_EMAIL`, `MEU_NOME`; opcionais `GEMINI_*`. Desligar sign-up público no Neon Auth.
3. Entrar, abrir **/status**, **/radar** (uma busca real) e **/crm** (conferir os leads migrados).
4. Em **Configurações → Claude Code (MCP)** gerar um token de leitura e conectar o Claude Code.
5. Testar o fluxo: Radar → Adicionar ao CRM → Estúdio → WhatsApp → "Mandou?" → proposta → fechar e criar projeto → cobrança → pagamento.

## Próximos passos sugeridos (nesta ordem)

1. Revisão visual autenticada de todas as telas e correções.
2. Importação CSV com revisão e deduplicação; mesclar empresas duplicadas.
3. Upload de arquivos (projetos/propostas) e exportação do pacote para o Claude Code.
4. Cadências e notificações (com aprovação humana para contato externo); Second Brain/Obsidian.
