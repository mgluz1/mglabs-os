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

## Mapa e dados dos negócios (grátis, sem Google)

- **Mapa**: OpenStreetMap via [OpenFreeMap](https://openfreemap.org) (estilo escuro, sem chave), desenhado com MapLibre. Para trocar o estilo, defina `NEXT_PUBLIC_MAP_STYLE`.
- **Negócios**: [Overture Maps](https://overturemaps.org) (dados abertos, licença CDLA Permissive 2.0), recortados para Goiânia e Aparecida pelo `scripts/overture_ingest.py`.
- **Fluxo da base**: o GitHub Action `overture-ingest` roda todo mês (dia 25), baixa o release mais recente, filtra as categorias e publica `ov_places.jsonl.gz` na branch `data-overture`. No dia 26 o cron da Vercel `/api/cron/overture` importa esse arquivo para a tabela `ov_places`. Também dá para importar na hora em **/status → Atualizar base agora**.
- Por isso a busca não gasta nenhuma chamada paga. As notas e avaliações do Google não aparecem; o bloco "saúde do negócio" do Lead Score usa a confiança e o número de fontes do Overture.
- Opcional: `PAGESPEED_API_KEY` (Google PageSpeed, só mede a velocidade do site da empresa) e `OVERTURE_DATA_URL` (outra origem para o arquivo).

`ANTHROPIC_API_KEY` vem do console da Anthropic. `CRON_SECRET`: `openssl rand -hex 24`.

## Como usar

1. **Radar**: escolha a categoria, a cidade (ou clique no mapa) e o raio. Clique em **Buscar** (grátis, a busca é feita na base aberta).
2. Os resultados aparecem na hora; a análise dos sites roda em seguida (faixa azul "Analisando sites…"). Franquias, fechados e duplicados são descartados automaticamente.
3. Clique num negócio: painel com a nota, o porquê de cada ponto, os contatos e a origem de cada um.
4. **Gerar com IA** → revise o texto → **Abrir no WhatsApp** (abre o seu WhatsApp com a mensagem pronta; nada é enviado sozinho) → confirme **Mandou?** para registrar no CRM com follow-up em 3 dias.
5. **Não contatar mais** tira o negócio de todas as buscas futuras.
6. **CRM**: arraste os cards entre as etapas, edite valor e próximo passo, veja os follow-ups do dia e exporte CSV.

Ajustes rápidos: pesos do Lead Score em `lib/config/score.ts`, franquias em `lib/config/franquias.ts`, categorias e termos do Overture em `lib/config/categories.ts`.

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

O `vercel.json` fixa a região `gru1` (São Paulo, perto do banco) e agenda os crons `/api/cron/purge` (diário, limpa cache antigo) e `/api/cron/overture` (mensal, atualiza a base aberta).
