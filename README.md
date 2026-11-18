# radarMGLABS

Radar de prospecção da MG Labs: negócios no mapa, contatos comerciais, Lead Score, mensagem com IA e mini-CRM. Especificação em [`docs/PROMPT-v0.md`](docs/PROMPT-v0.md).

## Stack

- Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind
- Neon (projeto `mglabs`, branch `production`, região São Paulo)
  - Postgres 18 + PostGIS + pg_trgm, via `pg` + Drizzle
  - Neon Auth gerenciado (Better Auth), via `@neon/auth`

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencha com os valores do Neon (ver abaixo)
npm run dev
```

Abra http://localhost:3000, crie sua conta em `/auth/sign-up` e entre.

### Variáveis do Neon

Com a CLI (`npm i -g neon`, depois `neon login`):

```bash
neon init -y --org-id org-royal-fog-15690863 --project-id summer-wildflower-93011864 --branch production --services postgres,auth
neon deploy        # aplica neon.ts e grava DATABASE_URL, NEON_AUTH_* no .env.local
```

Sem a CLI: Console do Neon → projeto `mglabs` → **Connect** (connection string pooled e direta) e **Auth** (Auth URL). Gere `NEON_AUTH_COOKIE_SECRET` com `openssl rand -base64 32`.

## Chaves do Google (obrigatórias para o radar)

1. Google Cloud → novo projeto → ative **faturamento** e as APIs **Places API (New)**, **Maps JavaScript API** e **PageSpeed Insights API**.
2. Crie 3 chaves em *Credenciais*:
   - `GOOGLE_PLACES_API_KEY`: restrita à Places API (New). Sem restrição de origem (é usada no servidor).
   - `NEXT_PUBLIC_GOOGLE_MAPS_KEY`: restrita à Maps JavaScript API e aos referenciadores `http://localhost:3000/*` e ao seu domínio.
   - `PAGESPEED_API_KEY`: restrita à PageSpeed Insights API.
3. Em *Cotas*, limite a Places API (New) por dia, e crie um **alerta de orçamento**. O app também trava em `PLACES_MONTHLY_CAP` chamadas por mês (padrão 900, dentro das ~1.000 grátis do SKU Enterprise).

`ANTHROPIC_API_KEY` vem do console da Anthropic. `CRON_SECRET`: `openssl rand -hex 24`.

## Como usar

1. **Radar**: escolha a categoria, a cidade (ou clique no mapa) e o raio. A tela mostra quantas chamadas a busca vai gastar. Clique em **Buscar**.
2. Os resultados aparecem na hora; a análise dos sites roda em seguida (faixa azul "Analisando sites…"). Franquias, fechados e duplicados são descartados automaticamente.
3. Clique num negócio: painel com a nota, o porquê de cada ponto, os contatos e a origem de cada um.
4. **Gerar com IA** → revise o texto → **Abrir no WhatsApp** (abre o seu WhatsApp com a mensagem pronta; nada é enviado sozinho) → confirme **Mandou?** para registrar no CRM com follow-up em 3 dias.
5. **Não contatar mais** tira o negócio de todas as buscas futuras.
6. **CRM**: arraste os cards entre as etapas, edite valor e próximo passo, veja os follow-ups do dia e exporte CSV.

Ajustes rápidos: pesos do Lead Score em `lib/config/score.ts`, franquias em `lib/config/franquias.ts`, categorias e tipos do Google em `lib/config/categories.ts`.

## Banco

- Esquema: `db/schema.ts`. Migrations: `db/migrations` (já aplicadas no `production`).
- Nova migration: `npm run db:generate` → revise o SQL → `npm run db:migrate` (usa `DATABASE_URL_UNPOOLED`).

## Verificar

- Sem login, qualquer página redireciona para `/auth/sign-in`.
- `/status` mostra a versão do Postgres, PostGIS, pg_trgm e as tabelas do radar.
- `npm test` roda os testes das regras (telefone, grade de busca, análise de site, Lead Score).
- `GET /api/health` (logado) → JSON com usuário e estado do banco.

## Publicar

Na hospedagem (Vercel Pro, Netlify…), cadastre as mesmas variáveis do `.env.local` e adicione o domínio final como **trusted domain** no Neon Auth (`neon neon-auth domain add https://seu-dominio`).

O `vercel.json` fixa a região `gru1` (São Paulo, perto do banco) e agenda o cron diário `/api/cron/purge`, que apaga dados do Google com mais de 30 dias de lugares fora do CRM.
