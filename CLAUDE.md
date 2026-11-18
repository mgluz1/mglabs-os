# radarMGLABS

Ferramenta interna de prospecção do Miguel (MG Labs, Goiânia/GO): radar de negócios no mapa, contatos comerciais, Lead Score, mensagem com IA e mini-CRM.

## Especificação

A especificação completa da v0 está em `docs/PROMPT-v0.md`. Leia antes de qualquer tarefa e siga a "Ordem de entrega" de lá, uma etapa por vez.

## Regras do projeto

- Responder e escrever textos de interface em português do Brasil.
- Stack: Next.js (App Router) + TypeScript + Tailwind + Neon (Postgres serverless com PostGIS e pg_trgm) via `pg` (node-postgres, pool + `attachDatabasePool`) + Drizzle; Neon Auth gerenciado via `@neon/auth`. Mapa OpenStreetMap (OpenFreeMap + MapLibre via `react-map-gl/maplibre`); negócios da base aberta Overture Maps (tabela `ov_places`). Anthropic API para mensagens.
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
