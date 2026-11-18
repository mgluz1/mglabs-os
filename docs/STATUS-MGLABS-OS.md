# MGLABS OS — estado da implementação

Atualizado em 18/11/2026 (primeira versão funcional). Este arquivo diz **o que existe de verdade**, o que é inicial e o que falta. Atualize-o a cada entrega.

Legenda: ✅ funcional com persistência real · 🟡 inicial (funciona, mas falta lapidar; a tela diz o que falta) · ⬜ não existe ainda.

## Por módulo

| Módulo | Estado | O que existe | O que falta |
| --- | --- | --- | --- |
| **Shell / design** | ✅ | Marca oficial (`public/brand`), tema **claro padrão** (linguagem Chiarelli: névoa/floresta, Fraunces + Inter + JetBrains Mono) + escuro, sidebar recolhível e responsiva (gaveta no celular), busca global `Ctrl/Cmd+K`, atalhos `g`+letra, skeletons, estados vazios, erro/404, foco visível, `prefers-reduced-motion`, impressão | Fraunces em onboarding/empty states; notificações no topo (ícone) |
| **Dashboard** | ✅ | Leads, oportunidades ativas, tarefas (atrasadas/hoje), fechados, valor do funil (previsto e ponderado), recebido, quatro números do dinheiro, funil por etapa, follow-ups, atividades, filtro 7/30/90 dias. Tudo por SQL, vazio mostra ações para começar | Metas; conversão contato→resposta→proposta→fechamento; período personalizado |
| **Radar** | ✅ | Fluxo no padrão ProspecZ (Encontre clientes → resultados com Dinheiro em jogo e Abordar agora → ficha com anel da nota, etapas e cartões). Mapa **OpenStreetMap padrão** (tiles raster; worker do MapLibre servido de `/public/maplibre`). Busca Overture, Lead Score, contatos com origem, opt-out e integração com CRM/Estúdio preservados. Celular em folha inferior | Fotos do negócio e horário (não há fonte aberta); listas salvas/favoritos; confirmar contato manualmente |
| **CRM** | ✅ | Empresas, contatos, oportunidades independentes do Radar; quadro arrastável (mouse/teclado) + tabela; ficha em painel (visão geral, histórico, tarefas, propostas); notas, ligação, resposta, reunião; valor, probabilidade, próximo passo, prazo, motivo de perda obrigatório, origem; busca e filtros; histórico persistente com antes/depois; "fechar e criar projeto"; "não contatar mais"; export CSV | Importação CSV com revisão/deduplicação; pipelines múltiplos (hoje um pipeline, etapas renomeáveis); responsável por oportunidade na UI |
| **Empresas e contatos** | ✅ | Lista, ficha 360° (dados, contatos, oportunidades, tarefas, propostas, projetos, financeiro, timeline), arquivar, opt-out | Mesclar duplicadas; consentimento detalhado (LGPD) |
| **Estúdio de Mensagens** | ✅ | Empresa/oportunidade → fatos verificados (Radar), 7 objetivos, serviço, tom, canal, destinatário, modelos versionados com variáveis, editor livre, copiar, rascunhos, salvar como modelo, abrir `wa.me`, confirmação "Mandou?" → histórico + follow-up em 3 dias; IA opcional (3 variações) | Anexar versão/fatos à atividade além do que já vai em `meta`; rascunho de e-mail por integração |
| **Tarefas e agenda** | ✅ | Hoje, atrasadas, 7 dias (agrupadas por dia), abertas, sem data, concluídas (histórico); prioridade, vencimento/horário, vínculo com oportunidade/cliente/projeto; chave de deduplicação para automações | Calendário mensal; recorrência; lembretes/notificações fora do app; cadências automáticas |
| **Propostas** | ✅ | Catálogo editável (preço de referência opcional), rascunho com diagnóstico/escopo/entregáveis/prazos/itens/desconto/parcelas/validade, totais em centavos, status com transições, **congelada ao enviar** (nova versão a partir da anterior), eventos, pré-visualização imprimível | Link compartilhável com validade/visualização; PDF; assinatura (sem validade jurídica); geração de escopo por IA |
| **Clientes** | 🟡 | Empresas com status "cliente", projetos e recebido × a receber | Portal do cliente (fora do escopo); pós-venda/indicação |
| **Projetos** | ✅ | Conversão idempotente do negócio (cliente + projeto + checklist por fase + cobranças planejadas, com confirmação); escopo, status, fase, prazo, tarefas, anotações, links, documentos com direito de uso, seções Briefing/Materiais/Direção criativa/Desenvolvimento/Entrega (marca `[CONFIRMAR]`), linha do tempo, financeiro do projeto, "copiar briefing (Markdown)" | Upload de arquivos; exportar ZIP para o Claude Code; versões/aprovações do briefing; importar `PLAN.md`/QA |
| **Conhecimento** | 🟡 | Itens manuais (processo, template, referência, projeto, nota) com texto, link, tags e cliente; busca | Sincronização com o Second Brain (Obsidian) — o modelo já guarda `source`/`external_path` |
| **Financeiro** | ✅ | Cobranças (parcelas mensais sem perder centavos), pagamentos manuais (não passam do saldo), estados derivados (a vencer/parcial/paga/vencida), resumo: pipeline × contratado × a receber × recebido, vencido, recebido por mês | Despesas; comprovantes; gateway/webhook/conciliação; nota fiscal; reembolso |
| **Relatórios** | 🟡 | Origem, distribuição por etapa, taxa de ganho, ticket médio, tempo até fechar, motivos de perda, recebido por mês, CSV de oportunidades | Conversão histórica entre etapas, cobertura de contatos, taxa de resposta |
| **Configurações** | ✅ | Espaço/equipe (leitura), etapas (nome e probabilidade), status da IA e uso diário, tokens do MCP, atalhos | Convite de membros; retenção/LGPD; edição do catálogo aqui (hoje em Propostas) |
| **IA (Gemini)** | ✅ | `lib/ai/*`: variações de mensagem (Estúdio) e, na ficha da oportunidade, resumo, próxima ação e sugestão de tarefas — tudo editável, com autorização explícita, dados anonimizados e limite diário | Propostas (escopo), Radar (explicar o lead) e análises do dashboard por IA |
| **MCP** | ✅ | `/api/mcp`, tokens próprios escopados, 9 ferramentas de leitura e 4 de escrita controlada | Criar rascunho de proposta; ferramentas de Conhecimento; OAuth em vez de token manual |

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

Verificado aqui: `tsc` limpo, `eslint` limpo, `next build` ok, testes puros (dinheiro, datas, mensagens, sanitização, funil) e **integração contra Postgres 16 real** (fluxo completo, isolamento entre espaços, opt-out, MCP ponta a ponta com token). A migration `0005` foi aplicada sobre dados antigos simulados (3 leads → 3 negócios, 3 atividades; reaplicar o backfill não duplica). Revisão visual (desktop 1440 e celular 390, escuro e claro) do shell, dashboard, CRM, Radar e login via `/dev-preview/os` e `/dev-preview/radar`.

**Não verificado** (sem credenciais/rede neste ambiente): login e telas autenticadas num navegador real com o Neon; migration no Neon de produção (testada num Postgres local **sem PostGIS**, com `geography` simulado como `text`); busca real do Radar (PostGIS) após a troca do join com o CRM (`lib/queries.ts`); chamadas reais ao Gemini; conexão do Claude Code real ao `/api/mcp` (testado direto no handler com JSON-RPC); telas Mensagens, Propostas, Projetos, Financeiro, Tarefas, Empresas, Conhecimento, Relatórios e Configurações só foram compiladas e testadas pela camada de serviços, **não vistas renderizadas**. Esperem-se ajustes visuais nelas.

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
