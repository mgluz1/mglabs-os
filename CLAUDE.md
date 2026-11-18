# radarMGLABS (MGLABS OS)

Plataforma interna do estúdio mglabs (Miguel, Goiânia/GO): Radar de negócios no mapa, CRM, Estúdio de Mensagens, tarefas, propostas, projetos, financeiro, IA opcional (Gemini) e servidor MCP para o Claude Code.

## Especificação

Produto: `docs/CRM-MGLABS-OS-PRD.md` e `docs/DESIGN-SYSTEM-MGLABS-OS.md`. **Estado real do que existe e do que falta: `docs/STATUS-MGLABS-OS.md`** (atualize ao entregar algo). A especificação histórica do Radar v0 está em `docs/PROMPT-v0.md`.

## Regras do projeto

- Responder e escrever textos de interface em português do Brasil.
- Stack: Next.js (App Router) + TypeScript + Tailwind + Neon (Postgres serverless com PostGIS e pg_trgm) via `pg` (node-postgres, pool + `attachDatabasePool`) + Drizzle; Neon Auth gerenciado via `@neon/auth`. Mapa OpenStreetMap padrão (tiles raster de openstreetmap.org + MapLibre via `react-map-gl/maplibre`; worker em `/public/maplibre`, copiado no predev/prebuild); negócios da base aberta Overture Maps (tabela `ov_places`). Gemini (`@google/genai`, opcional) para sugestões de IA; MCP (`@modelcontextprotocol/sdk`) para o Claude Code.
- Chaves de API só no servidor (nenhuma chave vai para o navegador).
- Dados de negócios só do Overture Maps (dados abertos) e da página inicial do site oficial da empresa. Nada de scraping do Google Maps, Instagram ou outras plataformas.
- Não misturar conteúdo da Places API do Google com o mapa OSM (os termos do Google proíbem). O código antigo `lib/places/google.ts` fica sem uso.
- Nunca enviar WhatsApp automaticamente nem automatizar o WhatsApp Web. O app só abre um link `wa.me` com o texto pronto.
- Base aberta: `scripts/overture_ingest.py` (GitHub Action mensal → branch `data-overture`) e `lib/overture/import.ts` (cron `/api/cron/overture`).
- Checar `optouts` antes de exibir qualquer botão de contato.
- Migrations SQL ficam versionadas no repositório (`db/migrations`).
- Next.js 16 com Cache Components: nada de `export const dynamic`; leitura de sessão/banco fica em componente dentro de `<Suspense>` com `await connection()`. Consulte `node_modules/next/dist/docs/` antes de usar APIs do Next.
- Neon Auth: `lib/auth/server.ts` (servidor), `lib/auth/client.ts` (navegador), proxy em `app/api/auth/[...path]`, proteção de rotas em `proxy.ts`. Não chamar `betterAuth()` nem criar tabelas de auth.
- Migrations: editar `db/schema.ts`, rodar `npm run db:generate` e conferir o SQL (o drizzle-kit põe tipos PostGIS entre aspas; remova as aspas), depois `npm run db:migrate`.

## Arquitetura do MGLABS OS

- **Serviços de domínio** em `lib/services/*` são a única fonte de regras de negócio (validação com zod, autorização por `Ctx`, auditoria, opt-out). Interface (`lib/actions/*` → Server Actions via `act()`), IA (`lib/ai/*`) e MCP (`lib/mcp/server.ts`) chamam os mesmos serviços. Nunca duplicar regra em ação, rota ou ferramenta MCP.
- Todo dado do CRM tem `workspace_id`; todo serviço recebe `Ctx` (`requireCtx()` na sessão, `ctxFromToken()` no MCP) e filtra por `ctx.workspaceId`. Escritas chamam `assertWrite(ctx)`.
- Páginas: `<Gate>{async (ctx) => …}</Gate>` (`components/shell/gate.tsx`) cuida de sessão, Suspense e "sem acesso". Ao criar rota nova, rode `npx next typegen`.
- Dinheiro em centavos (`lib/money.ts`), datas no fuso de São Paulo (`lib/dates.ts`). Previsto × contratado × a receber × recebido nunca se misturam; "paga/vencida" são derivados dos pagamentos.
- IA: sempre opcional e desacoplada (`lib/ai/gemini.ts`); `sanitizeForAi()` antes de enviar; nunca enviar nomes de contatos, telefones, e-mails, valores ou histórico completo; sugestões nunca são gravadas sem ação humana; nada de envio automático de mensagens.
- Cores só por tokens (`bg-surface`, `text-fg`, `text-muted`, `border-line`, `bg-brand`, `bg-brand-soft`…) definidos em `app/globals.css`; tema claro (padrão, linguagem Chiarelli) e escuro. Títulos em Fraunces (`h1`/`.font-heading`), rótulos de seção com `.eyebrow` (mono). Classes `.btn`, `.input`, `.card` ficam em `@layer components`.
- Migration `0005` guarda os dados antigos (`leads`, `activities`) intactos; não removê-los sem plano de migração revisado.
- Testes: `npm test` (puros) e `tests/integration-crm.test.ts` com `TEST_DATABASE_URL`. Não criar bypass de autenticação nem para testes locais: a revisão visual usa `/dev-preview/os` (só em desenvolvimento com `UI_PREVIEW=1`, dados fictícios).
