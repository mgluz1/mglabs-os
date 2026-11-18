# radarMGLABS

Ferramenta interna de prospecção do Miguel (MG Labs, Goiânia/GO): radar de negócios no mapa, contatos comerciais, Lead Score, mensagem com IA e mini-CRM.

## Especificação

A especificação completa da v0 está em `docs/PROMPT-v0.md`. Leia antes de qualquer tarefa e siga a "Ordem de entrega" de lá, uma etapa por vez.

## Regras do projeto

- Responder e escrever textos de interface em português do Brasil.
- Stack: Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres com PostGIS e pg_trgm). Google Maps JS + Places API (New) no servidor. Anthropic API para mensagens.
- Chaves de API só no servidor; a única exceção é `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, restrita por domínio.
- Dados de negócios só pela Places API oficial e pela página inicial do site oficial da empresa. Nada de scraping do Google Maps, Instagram ou outras plataformas.
- Nunca enviar WhatsApp automaticamente nem automatizar o WhatsApp Web. O app só abre um link `wa.me` com o texto pronto.
- Do Google, guardar permanentemente só o `place_id`; os demais campos ficam em cache com validade (ver `docs/PROMPT-v0.md`).
- Checar `optouts` antes de exibir qualquer botão de contato.
- Respeitar o limite mensal de chamadas (`PLACES_MONTHLY_CAP`) antes de cada busca.
- Migrations SQL ficam versionadas no repositório (`supabase/migrations`).
