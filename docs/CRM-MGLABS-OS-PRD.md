# MGLABS OS — PRD e plano de implementação

**Status:** proposta de evolução do Radar v0; esta documentação não representa funcionalidades já implementadas.
**Destino:** repositório radarMGLABS, mantendo Next.js 16, Neon PostgreSQL/PostGIS, Drizzle, Neon Auth e Overture Maps.
**Escopo:** ferramenta interna de operação comercial e projetos da MGLABS, em português do Brasil, com potencial de equipe no futuro.
**Referências:** repositórios mgluz1/mglabs (marca comercial) e mgluz1/miguelluz (portfólio e design tokens). Guia de identidade: [DESIGN-SYSTEM-MGLABS-OS.md](DESIGN-SYSTEM-MGLABS-OS.md).

## 1. Produto e princípio central

O Radar é o **mecanismo de descoberta**, não o cadastro mestre do CRM.

Fluxo: Radar ou indicação/formulário → Empresa/Contato → Oportunidade → Interações/Tarefas → Proposta → Fechado ganho → Cliente/Projeto → Entrega → Cobrança → Pós-venda/Indicação.

Requisitos:
- Um negócio pode existir no CRM sem nenhum registro no Overture ou no Google.
- Uma empresa pode possuir vários contatos, oportunidades, propostas e projetos.
- Diferenciar valor previsto, valor contratado, valor faturado e valor efetivamente recebido.
- Preservar histórico, fonte dos dados, permissão de contato e motivo de perda.
- Usar a marca real da MGLABS. Não copiar interface/código proprietário do ProspecZ.
- Desenvolvimento incremental, sem reescrever a base existente e sem perda de dados.

## 2. Estado existente — preservar

Verificar novamente antes de codificar; arquivos na main examinados em 18/11/2026:
- lib/places/search.ts, lib/overture/import.ts e components/radar: busca no Overture, mapa MapLibre/OpenFreeMap, score e resultados.
- lib/audit/* e lib/score.ts: análise de sites/Lead Score.
- lib/ai/message.ts e app/actions.ts: geração Anthropic, abertura manual do WhatsApp, histórico e opt-out.
- components/crm/crm-board.tsx e lib/types.ts: Kanban com etapas fixas, próxima ação, valor previsto, atividades, exportação CSV.
- db/schema.ts: places, place_contacts, site_audits, lead_scores, searches, leads, activities, optouts e ov_places.
- app/(app)/layout.tsx: navegação atual Radar/CRM/Status, identidade provisória azul/roxo.

Não excluir tabelas, migrations, dados ou APIs antigas sem migração revisada e backup.

## 3. Navegação e módulos propostos

Navegação agrupada, com cabeçalho compacto, busca global e botão Novo:
- **Início** (/dashboard): resumo, metas, tarefas de hoje, negócios parados, receita recebida e atividades.
- **Prospectar** (/radar, /prospectar/listas): radar atual, filtros, resultados, listas salvas, enriquecimento permitido, inspeção da origem e envio para o CRM.
- **Comercial** (/crm, /empresas, /contatos, /mensagens, /tarefas, /propostas): funil, cadastro 360°, mensagens, follow-ups e propostas.
- **Operação** (/projetos, /clientes): projetos fechados, briefings, entregas e acompanhamento do cliente.
- **Gestão** (/financeiro, /relatorios, /configuracoes): recebíveis, recebimentos, projeções, indicadores, equipe e preferências.
- **Status** (/status): integridade do banco, release do Overture, filas de auditoria; acesso administrativo.

### 3.1 Dashboard
Exibir quatro números com fonte e período: leads novos, tarefas vencidas, valor aberto no pipeline e dinheiro recebido. Incluir funil por etapa, próximas ações, conversão de contato→resposta→proposta→fechamento, origens e receita mensal. Nunca somar previsões como receita recebida. Permitir filtrar 7/30/90 dias e período personalizado.

### 3.2 Radar e prospecção
Preservar toda a busca Overture. Adicionar filtros salvos, lista de favoritos e ação "Criar oportunidade" (evita criar duplicatas). Mostrar score e justificativa, origem e atualidade do contato, possibilidade de confirmar dados manualmente. Telefones móveis são "celular, WhatsApp não confirmado" até que haja evidência. Distinguir site não detectado de site comprovadamente ausente. Limitar e paginar resultados; buscar via fonte aberta autorizada, não contornar paywalls/scraping proibido.

### 3.3 CRM de oportunidades
Pipelines configuráveis, iniciando com: Novo → Qualificado → Primeiro contato → Conversa → Reunião/Briefing → Proposta enviada → Negociação → Fechado ganho / Perdido. Regras de transição e motivo de perda. Kanban arrastável, visualização em tabela e filtros por responsável, origem, prazo, valor, tipo de serviço, score, etapa e cidade.
Cada oportunidade: empresa, contato principal, serviço, valor estimado, probabilidade de fechamento, origem, responsável, última interação, próximo passo, prazo, tags, notas, arquivos, propostas vinculadas, histórico de transições.
Permitir cadastro manual e importação CSV com mapeamento/revisão/deduplicação.
O histórico é persistente (incluir antes/depois em mudanças significativas), não apenas um campo de texto.

### 3.4 Empresas e contatos — visão 360°
Empresa: razão/nome comercial, site, categoria, endereço, fontes, vínculos com places, tags e status de cliente.
Contato: nome, cargo, e-mail/telefone, canal preferido, base/origem, consentimento/oposição quando pertinente, último contato.
Tela 360° com timeline cronológica unificando notas, mensagens registradas, tarefas, propostas, reuniões, projetos e pagamentos. Mensagens via WhatsApp Web só entram na timeline quando registradas pelo usuário; nunca simular sincronização que não existe.

### 3.5 Estúdio de mensagens com IA
Editor independente em /mensagens, acessível também no Radar e oportunidade:
- Objetivo: primeiro contato, follow-up sem resposta, resposta a interesse, reunião, pós-proposta, reativação e pós-venda.
- Canais: WhatsApp e e-mail; canal Instagram apenas como rascunho para envio manual.
- Inputs: serviço (site, landing, agendamento, automação, projeto custom), tom (natural, objetivo, profissional), intensidade, tamanho, CTA, fatos auditados e contexto do histórico.
- Modelos salvos da MGLABS com variáveis permitidas: nome da empresa, contato, categoria, necessidade observada, proposta de valor, nome do remetente.
- Gerar até três variações, editar antes de usar, copiar, abrir wa.me, ou criar rascunho de e-mail quando integração existir.
- Anexar versão, origem dos fatos, data e autor à interação registrada.
- Nunca inventar defeitos, resultados, elogios ou contatos; nunca afirmar "encontrei no Google" se origem foi Overture.
- Sem disparos em massa ou automação de WhatsApp Web. Usar API oficial apenas quando cabível e com política/consentimento atendidos.
- Interromper abordagens em caso de opt-out.

### 3.6 Tarefas e cadências
Tarefas avulsas ou ligadas a oportunidade/cliente/projeto, com responsável, data, prioridade, status, lembrete e comentários. Vistas Hoje, Atrasadas, Semana, Calendário. Cadências de lembretes sugeridas, com aprovação humana para contato externo (ex.: 3 dias após primeiro contato; 5 dias após proposta). Marcar concluída com histórico; deduplicar execuções de cron.

### 3.7 Catálogo, propostas e fechamento
Catálogo com serviço, escopo-padrão, preço-base, prazo, custo estimado, recorrência e personalização. Os preços na landing são referência comercial e nunca devem ser gravados como valores imutáveis.
Editor de proposta: cliente, diagnóstico do negócio, escopo, entregáveis, prazos, revisões, investimento, parcelas, validade e observações. Versão/duplicação, visualização, link compartilhável com token expiráveis, exportação PDF futura, status (rascunho/enviada/visualizada/aprovada/recusada/expirada), trilha de auditoria. Não assumir validade jurídica de assinatura sem integração adequada.
Ao fechar ganho: oferecer conversão idempotente para cliente + projeto + cobranças planejadas, solicitando confirmação.

### 3.8 Projetos e entregas
Projetos conectados a empresas, contato, oportunidade e proposta aceita. Templates: Landing Page, Site Institucional, Site + Agendamento, Custom. Etapas: briefing, conteúdo/ativos, design, desenvolvimento, revisão, publicação e suporte. Tarefas, checklist, responsável, dependências, arquivos/links, status, riscos, aprovações e histórico. Cliente não recebe acesso ao painel interno; portal separado é etapa futura.

### 3.9 Financeiro
Lançamentos com competência e vencimento, contas a receber, parcelas, pagamentos efetivos e despesas. Campos: valor, status, método, data, comprovante, serviço/projeto e contato; opcional recebimento parcial e reembolso. Valores BRL em centavos no banco, sem ponto flutuante. Separar:
1. Pipeline = potencial ponderado / em negociação;
2. Contratado = negócios ganhos;
3. A receber = parcelas emitidas previstas;
4. Recebido = pagamentos conciliados.
Primeiro versão manual; gateways, webhook idempotente e conciliação automáticos em etapa posterior. Dashboard financeiro por mês/cliente/serviço.

### 3.10 Relatórios e configurações
Relatórios: leads por fonte, cobertura de contatos, taxa de resposta, conversão por etapa, tempo para fechar, ticket médio, negócios perdidos por motivo, contratos fechados e recebido. Exportação CSV. Configurações: identidade, catálogo, modelos de mensagem, fases, equipe, lembretes e políticas de retenção/exportação.

## 4. Modelo de dados sugerido

Manter as tabelas atuais e adicionar gradualmente:
- workspaces, workspace_members (futura equipe: owner/admin/comercial/produção/financeiro; pode começar com um workspace).
- crm_companies (id, workspace_id, nome, source, opcional place_id, website, localização, metadata, created_at).
- crm_contacts (id, company_id, nome, cargo, canais, fonte, preferências e indicadores de oposição).
- crm_pipelines, crm_stages (ordem, tipo, probabilidade, is_won, is_lost).
- crm_deals (company_id, primary_contact_id, stage_id, owner_id, name, estimated_value_cents, currency, expected_close_at, source, lost_reason, timestamps).
- crm_activities (deal_id/company_id/contact_id, kind, channel, content, author_id, occurred_at, external_message_id opcional).
- crm_tasks (deal_id/company_id/project_id opcional, assigned_to, due_at, status, priority, recurrence).
- crm_message_templates, crm_message_drafts (texto, campos, origem das evidências, modelo, versão e custos opcionais).
- crm_services, crm_proposals, crm_proposal_items, crm_proposal_events (itens, versões, totais em centavos, status).
- crm_projects, crm_project_tasks (template, owner, prazos, entrega).
- crm_receivables, crm_payments, crm_expenses (parcelas, status, vencimento, pago_em, valores).
- crm_attachments, crm_audit_events, crm_automations, crm_automation_runs.
- Políticas de dados, optout e suppression_list (normalizar telefone/e-mail; consultar antes de sugerir qualquer contato).

**Migração:** manter places como origem de descoberta; criar crm_companies com unique(place_id) parcial, backfill em lote dos leads; mapear stages antigas nas novas, registrar legacy_lead_id; preservar activities e optouts, comparar contagens e hashes antes de cortar leituras; migrações reversíveis quando possível. Nunca alterar a tabela leads para exigir place_id nulo sem plano de migração de todas as queries e testes.

**Integridade:** índices em workspace_id, owner_id, company_id, stage_id, due_at; chaves estrangeiras; timestamps em timestamptz UTC; zone America/Sao_Paulo só na apresentação; unicidade para evitar conversão duplicada; soft-delete ou retenção explícita para dados comerciais relevantes.

## 5. Segurança, conformidade e operação

- Autenticação Neon Auth; autorização por ação e por workspace **no servidor**, sem confiar em filtros client-side.
- Bloquear sign-up público quando o sistema for privado; respeitar permissões em leitura, mutação, exportação e anexos.
- Registro de autoria, data e alteração em propostas, negócios, mensagens, pagamentos e atividades.
- Contatos comerciais públicos não eliminam obrigações LGPD: finalidade, transparência, minimização, retenção e oposição; guarda de origem; exclusão quando cabível.
- Não misturar material sujeito às restrições da Google Places com armazenamento de contatos próprios ou mapas OSM. Usar fontes com licenças compatíveis.
- Webhooks assinados, idempotência, segredo em servidor, logs sem credenciais/dados sensíveis.
- Backups com teste de restauração, logs de falhas, medição de custos de Anthropic/PageSpeed/infra.
- IA apenas sugere; toda mensagem externa exige revisão explícita no MVP.

## 6. Roadmap em PRs independentes

### Fase 0 — Baseline e segurança
**PR 01:** verificar build, tests, env, scripts, sessão, banco, quotas, import Overture e rotas. Registrar estado real; corrigir bugs críticos e riscos de autorização. **Aceite:** lint, typecheck/build, testes e busca real funcionando com usuário autorizado; sem vazamento de segredo.

### Fase 1 — Identidade e fundação
**PR 02:** aplicar design system/brand assets; layout com grupos de navegação, menu responsivo, estados vazios e acessibilidade. **Aceite:** logo verdadeira, dark/light e Radar/CRM preservados.
**PR 03:** migrations de companies/contacts/pipelines/deals com modelo de workspace e backfill seguro. **Aceite:** cadastros manuais + Radar coexistem; nenhuma perda de registros.

### Fase 2 — Comercial
**PR 04:** novo CRM Kanban/tabela, ficha 360°, timeline persistente, filtros, entrada manual/importação revisada. **Aceite:** lead de indicação atravessa funil até ganho sem precisar estar no mapa.
**PR 05:** tarefas, calendário/follow-ups, notificações in-app e cadências internas. **Aceite:** tarefa criada, vencida, concluída, com histórico, sem duplicação por cron.
**PR 06:** estúdio de mensagens, templates versionados, geração IA factual, rascunhos/histórico. **Aceite:** WhatsApp não enviado automaticamente; opt-out bloqueia ação.

### Fase 3 — Da venda à entrega
**PR 07:** catálogo e proposta comercial com versões e status; teste de cálculo BRL. **Aceite:** proposta editada e aprovada, sem alterar propostas anteriores.
**PR 08:** cliente e projeto criados a partir de fechamento com confirmação e idempotência. **Aceite:** templates, tarefas e arquivos vinculados, sem duplicatas.
**PR 09:** contas a receber, pagamentos manuais, despesas e indicadores financeiros. **Aceite:** contratado, faturado e recebido não se confundem.

### Fase 4 — Inteligência operacional
**PR 10:** dashboard, métricas verdadeiras, filtros temporais, exportações e auditoria. **Aceite:** cada indicador tem query documentada e teste.
**PR 11:** automações seguras, notificações e regras internas; integrações oficiais externas opcionais. **Aceite:** logs, retry/idempotência e respeito a opt-out.
**PR 12:** polimento responsivo, performance, onboarding, E2E e revisão LGPD/backup. **Aceite:** fluxos principais testados ponta a ponta.

## 7. Qualidade exigida para cada PR

- Ler AGENTS.md, CLAUDE.md e as referências Next.js 16 locais antes de alterar código.
- Fazer mudanças incrementais e migrações versionadas; manter queries antigas até corte testado.
- UI acessível (teclado, contraste, labels, focus, reduced motion) e responsiva.
- Não inventar dados de clientes; fixtures somente em desenvolvimento.
- Testes unitários para regras, integração para autorização/migrations e E2E para os fluxos comercial/financeiro.
- Descrever arquivos alterados, resultados de lint/test/build, migração, riscos, screenshots e rollback.
- Não aplicar migration destrutiva no Neon production sem revisão explícita.
- Não fazer deploy nem merge automático neste plano.

## 8. Critérios de sucesso do produto

1. Cadastrar uma empresa manualmente e outra via Radar sem duplicidade.
2. Gerar e editar abordagem contextual; registrar uma interação manualmente e bloquear opt-out.
3. Mover o negócio pelo Kanban; ver toda mudança na timeline.
4. Criar tarefa de retorno com vencimento e concluí-la.
5. Criar proposta versionada, marcar como aprovada e converter em projeto.
6. Acompanhar a entrega em tarefas e registrar a entrada de pagamento.
7. Ver valores previstos, contratados e recebidos sem confusão.
8. Exportar informações do próprio workspace, sem vazamento entre usuários.
9. Usar o sistema em celular e desktop com identidade real da MGLABS.

**Próxima ação recomendada:** executar PR 01, depois PR 02 e PR 03. Não começar por módulos financeiros ou automações externas antes de estabilizar modelo e permissões.
