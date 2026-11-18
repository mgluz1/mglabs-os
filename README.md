# MGLABS OS (radarMGLABS)

Centro de operações privado do estúdio **mglabs** (Goiânia/GO): prospecção → CRM → mensagens → propostas → clientes → projetos → financeiro. O **Radar** (negócios no mapa, contatos comerciais e Lead Score) é o mecanismo de descoberta; o CRM funciona sem ele.

- Especificação do produto: [`docs/CRM-MGLABS-OS-PRD.md`](docs/CRM-MGLABS-OS-PRD.md) (PR #5) · design system: [`docs/DESIGN-SYSTEM-MGLABS-OS.md`](docs/DESIGN-SYSTEM-MGLABS-OS.md)
- **Estado real da implementação (o que existe, o que falta, decisões): [`docs/STATUS-MGLABS-OS.md`](docs/STATUS-MGLABS-OS.md)**
- Especificação histórica do Radar v0: [`docs/PROMPT-v0.md`](docs/PROMPT-v0.md)

## Módulos

| Área | Telas |
| --- | --- |
| Visão geral | `/dashboard` — números reais do banco, funil, follow-ups, atividades |
| Comercial | `/radar` · `/crm` (quadro + tabela, ficha completa) · `/empresas` (+ ficha 360°) · `/mensagens` (Estúdio) · `/tarefas` · `/propostas` (+ catálogo) |
| Operação | `/clientes` · `/projetos` (briefing, materiais, direção criativa, desenvolvimento, entrega) · `/conhecimento` |
| Gestão | `/financeiro` · `/relatorios` · `/configuracoes` · `/status` |

Atalhos: `Ctrl/Cmd+K` busca global · `Ctrl/Cmd+B` recolhe o menu · `g` + letra navega (ex.: `g c` = CRM, `g t` = tarefas).

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind 4 · Neon (Postgres + PostGIS + pg_trgm) via `pg` + Drizzle · Neon Auth · MapLibre + OpenFreeMap + Overture Maps · Gemini (opcional) · MCP (Claude Code). Fontes Inter e Space Grotesk self-hosted (`@fontsource-variable`). Marca oficial em `public/brand` (copiada de `mgluz1/mglabs`).

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencha (ver abaixo)
npm run db:migrate           # aplica as migrations (inclui a 0005 do MGLABS OS)
npm run dev
```

Abra http://localhost:3000 e entre com a sua conta (`/auth/sign-in`).

### Variáveis

Veja `.env.example`. As do Neon vêm do Console (**Connect** e **Auth**) ou da CLI (`neon init` + `neon deploy`). `NEON_AUTH_COOKIE_SECRET`: `openssl rand -base64 32`. `CRON_SECRET`: `openssl rand -hex 24`.

**Acesso e privacidade.** O app é privado: cada dado pertence a um *espaço de trabalho* e só quem é membro enxerga. No primeiro acesso após a migration, o primeiro usuário vira proprietário — defina `OWNER_EMAIL` para travar isso no seu e-mail e **desligue o cadastro público no Neon Auth**. Qualquer outra conta criada fica sem acesso a nenhum dado.

## Migração do mini-CRM antigo

A migration `0005_mglabs_os_crm.sql` é **aditiva**: cria as tabelas novas (`crm_*`, `workspaces`, …) e copia `leads` → empresas + oportunidades e `activities` → histórico, mapeando as etapas (abordado → Primeiro contato, respondeu → Conversa, fechado → Fechado ganho…). Guarda `legacy_lead_id`/`legacy_activity_id`, é idempotente e **não altera nem apaga** `leads`/`activities`. Antes de aplicar em produção, faça um branch/snapshot do Neon e compare as contagens (`select count(*) from leads` = `select count(*) from crm_deals where legacy_lead_id is not null`).

## IA opcional (Gemini)

Defina `GEMINI_API_KEY` (só servidor). Recursos: variações de mensagem, resumo da oportunidade, próxima ação e sugestão de tarefas — sempre sugestões editáveis. Sem a chave, nada quebra. Limite diário (`GEMINI_DAILY_LIMIT`), erros 429/503 viram mensagem clara, logs sem conteúdo. **Privacidade:** o plano gratuito do Gemini pode usar os dados enviados para melhorar produtos; o app envia o mínimo (sem nomes de contatos, telefones, e-mails, links, valores ou histórico completo) e exige autorização explícita. Confirme o modelo (`GEMINI_MODEL`) e as cotas da sua conta em aistudio.google.com/rate-limit.

## Claude Code via MCP

Servidor MCP remoto em `/api/mcp` (Streamable HTTP). **Configurações → Claude Code (MCP)** gera um token do próprio MGLABS OS (somente leitura, ou leitura + rascunhos/tarefas), mostrado uma vez e guardado só como hash. Conecte o Claude Code oficial:

```bash
claude mcp add --transport http mglabs https://SEU-DOMINIO/api/mcp --header "Authorization: Bearer mglabs_..."
```

Ferramentas: `search`, `list_leads`, `get_lead`, `list_companies`, `get_company`, `get_pipeline`, `list_due_tasks`, `list_projects`, `get_project_briefing` (leitura) e `create_message_draft`, `create_task`, `append_activity`, `update_deal_stage` (escrita, só com token de escrita). As ferramentas chamam os **mesmos serviços** da interface (autorização por espaço, validação, auditoria e bloqueio de quem pediu para não ser contatado). Nada é enviado: mensagens só viram rascunho; fechar ganho/perdido e o financeiro ficam na interface. O app não guarda credenciais da assinatura Claude.

## Mapa e dados dos negócios (grátis)

- **Mapa**: o OpenStreetMap padrão (os mesmos tiles de openstreetmap.org), desenhado com MapLibre, com atribuição. Uso leve, conforme a [política de tiles da OSMF](https://operations.osmfoundation.org/policies/tiles/); se o volume crescer, aponte `NEXT_PUBLIC_MAP_TILES` para outro servidor de tiles (ou `NEXT_PUBLIC_MAP_STYLE` para um estilo vetorial). O worker do MapLibre é copiado para `public/maplibre` no `predev`/`prebuild`.
- **Negócios**: [Overture Maps](https://overturemaps.org) (CDLA Permissive 2.0), recortados para Goiânia e Aparecida por `scripts/overture_ingest.py`. O GitHub Action `overture-ingest` roda todo dia 25 e publica na branch `data-overture`; o cron `/api/cron/overture` importa no dia 26 (ou em **/status → Atualizar base agora**).
- Dados só do Overture e da página inicial do site oficial da empresa. Nada de scraping do Google Maps/Instagram. O WhatsApp nunca é automatizado: o app só abre um link `wa.me` com o texto pronto.

## Banco

- Esquema: `db/schema.ts`. Migrations: `db/migrations`. Nova migration: `npm run db:generate` → revise o SQL (remova aspas dos tipos PostGIS) → `npm run db:migrate` (usa `DATABASE_URL_UNPOOLED`).
- Dinheiro sempre em centavos (`bigint`); datas em `timestamptz` (UTC), exibidas em America/Sao_Paulo.

## Testes

```bash
npm test                      # regras puras (dinheiro, mensagens, sanitização, funil, Radar)
npm run lint && npx tsc --noEmit
TEST_DATABASE_URL=postgres://... npx vitest run tests/integration-crm.test.ts   # integração com Postgres real
```

O teste de integração cobre: cadastro manual → funil → tarefa → proposta versionada → projeto idempotente → pagamento; isolamento entre espaços de trabalho; opt-out; e o servidor MCP (token, leitura × escrita, revogação). Precisa de um Postgres com as migrations aplicadas (em Postgres sem PostGIS, use um banco só de testes).

## Publicar

Vercel (região `gru1` em `vercel.json`): cadastre as variáveis, adicione o domínio como **trusted domain** no Neon Auth, aplique a migration e confira `/status`. Crons: `/api/cron/purge` (diário) e `/api/cron/overture` (mensal).
