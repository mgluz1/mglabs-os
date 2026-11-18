# radarMGLABS

Ferramenta interna de prospecção do Miguel (MG Labs, Goiânia/GO): radar de negócios no mapa, contatos comerciais, Lead Score, mensagem com IA e mini-CRM.

## Especificação

A especificação completa da v0 está em `docs/PROMPT-v0.md`. Leia antes de qualquer tarefa e siga a "Ordem de entrega" de lá, uma etapa por vez.

## Regras do projeto

- Responder e escrever textos de interface em português do Brasil.
- Stack: Next.js (App Router) + TypeScript + Tailwind + Neon (Postgres serverless com PostGIS e pg_trgm) via `pg` (node-postgres, pool + `attachDatabasePool`) + Drizzle; Neon Auth gerenciado via `@neon/auth`. Google Maps JS + Places API (New) no servidor. Anthropic API para mensagens.
- Chaves de API só no servidor; a única exceção é `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, restrita por domínio.
- Dados de negócios só pela Places API oficial e pela página inicial do site oficial da empresa. Nada de scraping do Google Maps, Instagram ou outras plataformas.
- Nunca enviar WhatsApp automaticamente nem automatizar o WhatsApp Web. O app só abre um link `wa.me` com o texto pronto.
- Do Google, guardar permanentemente só o `place_id`; os demais campos ficam em cache com validade (ver `docs/PROMPT-v0.md`).
- Checar `optouts` antes de exibir qualquer botão de contato.
- Respeitar o limite mensal de chamadas (`PLACES_MONTHLY_CAP`) antes de cada busca.
- Migrations SQL ficam versionadas no repositório (`db/migrations`).
- Next.js 16 com Cache Components: nada de `export const dynamic`; leitura de sessão/banco fica em componente dentro de `<Suspense>` com `await connection()`. Consulte `node_modules/next/dist/docs/` antes de usar APIs do Next.
- Neon Auth: `lib/auth/server.ts` (servidor), `lib/auth/client.ts` (navegador), proxy em `app/api/auth/[...path]`, proteção de rotas em `proxy.ts`. Não chamar `betterAuth()` nem criar tabelas de auth.
- Migrations: editar `db/schema.ts`, rodar `npm run db:generate` e conferir o SQL (o drizzle-kit põe tipos PostGIS entre aspas; remova as aspas), depois `npm run db:migrate`.
