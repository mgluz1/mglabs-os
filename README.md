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

## Banco

- Esquema: `db/schema.ts`. Migrations: `db/migrations` (já aplicadas no `production`).
- Nova migration: `npm run db:generate` → revise o SQL → `npm run db:migrate` (usa `DATABASE_URL_UNPOOLED`).

## Verificar

- `/` sem login → redireciona para `/auth/sign-in`.
- Depois de entrar, `/` mostra a versão do Postgres, PostGIS, pg_trgm e as 9 tabelas do radar.
- `GET /api/health` (logado) → JSON com usuário e estado do banco.

## Publicar

Na hospedagem (Vercel Pro, Netlify…), cadastre as mesmas variáveis do `.env.local` e adicione o domínio final como **trusted domain** no Neon Auth (`neon neon-auth domain add https://seu-dominio`).
