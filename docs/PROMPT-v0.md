# Prompt — Radar de Leads v0 (versão provisória)

> Cole este prompt inteiro no Claude Code, numa pasta vazia. Ele descreve a primeira versão do meu app de prospecção: radar no mapa + contatos + Lead Score + mensagem com IA + mini-CRM. Prioridade: **funcionar rápido e com segurança, não ficar bonito**.

---

## Contexto

Sou desenvolvedor web freelancer em Goiânia (GO). Vendo sites, landing pages, agendamento online e automações para pequenos negócios locais. Preciso de uma ferramenta interna, só para mim, que:

1. encontra negócios de uma categoria dentro de um raio no mapa;
2. mostra contato comercial (telefone/WhatsApp, site, Instagram, e-mail) **publicado pelo próprio negócio ou pelo Google Places oficial**;
3. analisa o site de cada um e dá uma nota de oportunidade (Lead Score 0–100) com explicação;
4. gera uma mensagem de abordagem personalizada com IA e abre o WhatsApp com ela pronta;
5. guarda os leads num funil simples (CRM).

Foco inicial: **Goiânia e Aparecida de Goiânia**, categorias **barbearia, academia, restaurante, clínica (médica/odonto/estética) e salão de beleza**.

## Stack obrigatória

- **Next.js 15 (App Router) + TypeScript + Tailwind**, Server Actions para as operações.
- **Neon** (Postgres serverless) com as extensões `postgis` e `pg_trgm`. Acesso pelo driver `@neondatabase/serverless` + **Drizzle ORM** (`drizzle-orm/neon-http`), só no servidor. Use a connection string **pooled** (`-pooler` no host) no app e a direta só para migrations.
- Migrations em SQL puro versionadas em `db/migrations`, aplicadas com `drizzle-kit migrate` (ou um script `npm run db:migrate`). A primeira migration cria as extensões.
- **Google Maps Platform**: Maps JavaScript API (mapa) + **Places API (New)** via REST no servidor. Use o mapa do Google (não Leaflet/OSM), porque os termos do Google restringem mostrar dados do Places em mapa de terceiros.
- **PageSpeed Insights API** (gratuita) para nota técnica do site.
- **Anthropic API** (modelo `claude-sonnet-4-5` ou o mais recente disponível — deixe configurável em env) para gerar a mensagem.
- `cheerio` para ler o HTML dos sites.
- Acesso protegido por senha única (middleware + cookie httpOnly assinado com `APP_PASSWORD`). Sem cadastro de usuários nesta versão.

### Variáveis de ambiente (`.env.example`)

```
GOOGLE_PLACES_API_KEY=        # chave só de servidor, restrita à Places API (New)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=  # chave de navegador, restrita por domínio à Maps JavaScript API
PAGESPEED_API_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
DATABASE_URL=                 # Neon, connection string pooled (host com -pooler)
DATABASE_URL_UNPOOLED=        # Neon, conexão direta, só para migrations
CRON_SECRET=                  # protege as rotas /api/cron/*
APP_PASSWORD=
MEU_NOME=Miguel
PLACES_MONTHLY_CAP=900        # trava de segurança de chamadas Enterprise/mês
```

## Funcionalidade 1 — Radar

### Tela `/radar`

- Painel à esquerda: categoria (chips das 5 categorias + campo livre), cidade (Goiânia / Aparecida de Goiânia, com centro pré-definido) **ou** clique no mapa para escolher o centro, raio (slider 1–15 km), botão **Buscar**.
- Mapa à direita (Google Maps JS) com o círculo do raio e pinos coloridos pela faixa do Lead Score: verde ≥ 75, amarelo 50–74, cinza < 50, contorno tracejado enquanto ainda está sendo analisado.
- Lista de resultados ordenada por Lead Score, com: nome, bairro, nota ★ e nº de avaliações, selos (`Sem site`, `Só Instagram`, `Site lento`, `Não responsivo`, `Sem agendamento`), ícones de contato disponíveis, e a nota.
- Clicar num item abre o **painel do lead** (Funcionalidade 3).
- Mostrar no rodapé do mapa/lista a atribuição exigida pelo Google.

### Busca (servidor)

Use **Nearby Search (New)** — `POST https://places.googleapis.com/v1/places:searchNearby` — com `locationRestriction.circle`, `includedPrimaryTypes` e `maxResultCount: 20`.

Mapeamento de categorias para tipos (confira cada tipo na "Table A" da documentação da Places API (New) e remova o que não existir):

| Categoria | includedPrimaryTypes |
| --- | --- |
| Barbearia | `barber_shop` |
| Academia | `gym`, `fitness_center` |
| Restaurante | `restaurant` e subtipos de restaurante, `pizza_restaurant` |
| Clínica | `dentist`, `dental_clinic`, `doctor`, `physiotherapist`, `skin_care_clinic` |
| Salão de beleza | `hair_salon`, `beauty_salon`, `nail_salon` |

Como a Nearby Search devolve no máximo 20 resultados, **divida o círculo em uma grade de círculos menores** (raio inicial 1,5 km) e, se um círculo devolver 20, subdivida em 4 (até 3 níveis). Junte tudo e deduplique por `place.id`.

FieldMask (peça só isso, para não subir de SKU sem necessidade):

```
places.id,places.displayName,places.primaryType,places.formattedAddress,
places.shortFormattedAddress,places.location,places.businessStatus,
places.rating,places.userRatingCount,places.websiteUri,
places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri
```

Regras:

- **Contador de cota:** registrar cada chamada numa tabela `api_usage` (mês, endpoint, quantidade). Antes de buscar, estimar quantas chamadas a grade vai usar e **bloquear com aviso** se passar de `PLACES_MONTHLY_CAP`. Mostrar o uso do mês no topo da tela.
- **Descartar:** `businessStatus` diferente de `OPERATIONAL`; franquias/redes por lista editável em `config/franquias.ts` (Smart Fit, BlueFit, Bodytech, Panobianco, Bio Ritmo, Selfit, Espaçolaser, Sorridents, OdontoCompany, Oral Sin, McDonald's, Burger King, Subway, Outback… — comparação por nome normalizado, sem acento e minúsculo).
- **Deduplicar** também por nome parecido (`similarity` do `pg_trgm` ≥ 0,85) a menos de 50 m.
- Resultados aparecem na tela assim que a busca do Google termina; a análise de site roda depois, em segundo plano (Funcionalidade 2), e a lista se atualiza por polling a cada 3 s.
- **Fila sem serviço extra:** cada lugar novo ganha uma linha em `site_audits` com `status = 'pending'`. O processamento roda em lotes de 5 dentro de uma rota `POST /api/audits/process` (chamada pelo próprio polling da tela enquanto houver pendentes, e via `after()` do Next.js logo depois da busca). Use `select … for update skip locked` para dois lotes nunca pegarem o mesmo lugar. Cada execução precisa caber em ~50 s (limite de função serverless).

## Funcionalidade 2 — Análise de site e Lead Score

Para cada lugar, em fila (`p-limit` com concorrência 4, timeout de 10 s por site):

1. **Classificar o "site":** vazio → `sem_site`; domínio de instagram.com, linktr.ee, wa.me, api.whatsapp.com, facebook.com, linkbio, bio.link → `so_rede_social` (guardar o link como Instagram/WhatsApp quando for o caso); senão → `site_proprio`.
2. **Se `site_proprio`:** baixar só a página inicial (User-Agent `RadarLeadsBot/0.1 (+contato: <meu e-mail>)`, respeitar `robots.txt`, 1 requisição por domínio) e detectar com cheerio:
   - HTTPS; `<meta name="viewport">`; `<title>` e meta description; H1; JSON-LD `LocalBusiness`;
   - links `wa.me` / `api.whatsapp.com` (extrair número), `tel:`, `mailto:`, Instagram, Facebook;
   - página/seção de serviços (links ou textos: serviços, planos, tratamentos, cardápio, preços, procedimentos);
   - agendamento online (links para Trinks, Booksy, AppBarber, Calendly, Doctoralia, Agendor, Simples Agenda, iFood, Goomer, AnotaAí, formulário com "agendar"/"reservar");
   - sinais de site velho: ano do rodapé ≤ ano atual − 3, jQuery < 3, layout em `<table>`, domínio de construtor gratuito (wixsite, webnode, site123, blogspot).
3. **PageSpeed** (estratégia `mobile`, categorias `performance` e `seo`). Se falhar, seguir sem.
4. **Calcular o Lead Score** (tabela abaixo), guardando os pontos de cada regra para mostrar a explicação.

### Lead Score (0–100) — pesos em `config/score.ts`, fáceis de ajustar

**A. Oportunidade digital (máx. 45)**
- Sem site: 45
- Só Instagram/Linktree/WhatsApp/Facebook: 40
- Com site próprio (soma, teto 35): sem viewport +12 · PageSpeed mobile < 50 +10 (50–89 +5) · sem HTTPS +6 · sem página de serviços +5 · SEO básico ausente (sem title útil, meta description ou H1) +4 · sem botão de WhatsApp ou `tel:` +3

**B. Saúde do negócio (máx. 25)**
- Avaliações: ≥ 100 → 10 · 30–99 → 7 · 10–29 → 4
- Nota: ≥ 4,5 → 5 · 4,0–4,4 → 3
- (reservado para v1: CNPJ ativo há mais de 2 anos +5, porte ME/EPP +5 — deixar a função preparada, retornando 0)

**C. Encaixe com a oferta (máx. 20)**
- Barbearia, salão, estética, clínica ou academia **sem agendamento online detectado**: 12
- Restaurante sem cardápio digital/delivery próprio detectado: 12
- Categoria marcada como prioritária na busca: 8

**D. Contato possível (máx. 10)**
- Celular/WhatsApp disponível: 6 · e-mail publicado no site: 2 · Instagram identificado: 2

Faixas: **≥ 75 quente**, **50–74 morno**, **< 50 frio**. Lead **sem nenhum contato** não entra na fila de abordagem.

### Telefone → WhatsApp

Normalizar para E.164 (`+55DDXXXXXXXXX`). Número brasileiro com 11 dígitos e 9 após o DDD = **celular, provável WhatsApp**; fixo (8 dígitos após o DDD) = só ligação. Número vindo de link `wa.me` no site = **WhatsApp confirmado**. Mostrar essa diferença na tela.

## Funcionalidade 3 — Painel do lead + mensagem com IA

Painel lateral com:

- Dados: nome, categoria, endereço, ★ e avaliações, link "Ver no Google Maps".
- Contatos com a **origem de cada um** (Google Places / site da empresa) e botões: **WhatsApp**, **Ligar**, **E-mail**, **Instagram**, **Site**.
- Lead Score grande + lista "Por que essa nota" com cada regra que pontuou.
- **Gerar mensagem:** escolher oferta (Site, Agendamento online, Landing page, Automação de WhatsApp) e tom (amigável / direto / formal). O servidor chama a Anthropic API com: nome, categoria, bairro, os 3 sinais mais fortes do lead, a oferta, `MEU_NOME`. Regras do prompt da IA:
  - português do Brasil, no máximo 3 frases curtas + 1 pergunta final;
  - citar 1 motivo concreto observado (ex.: "vi que vocês agendam só pelo WhatsApp");
  - dizer de onde veio o contato ("encontrei vocês no Google");
  - nada de urgência falsa, desconto inventado, número inventado ou promessa de resultado;
  - terminar com uma linha curta de opt-out: "Se não fizer sentido, é só me avisar que não volto a mandar."
- Texto editável antes de enviar. Botão **Abrir no WhatsApp** → `https://wa.me/<numero>?text=<encodeURIComponent(texto)>` em nova aba. **Nunca enviar mensagens automaticamente** — eu clico em enviar no meu próprio WhatsApp.
- Ao abrir o WhatsApp, perguntar "Mandou?" → se sim, mover o lead para **Abordado**, registrar a mensagem em `activities` e criar follow-up para daqui a 3 dias.
- Botão **Não contatar mais** → grava em `optouts` (telefone, place_id) e esconde o lead de todas as buscas futuras.

## Funcionalidade 4 — Mini-CRM `/crm`

- Kanban com colunas: **Novo → Abordado → Respondeu → Reunião → Proposta → Fechado / Perdido** (arrastar e soltar com `@dnd-kit`).
- Botão "Adicionar ao CRM" no radar (individual e "adicionar todos os quentes").
- Card: nome, categoria, nota, próximo passo e data; campo de valor previsto (R$); motivo da perda ao mover para Perdido.
- Lista **Follow-ups de hoje** no topo.
- Histórico (`activities`) no painel do lead: mensagens, ligações, anotações.
- **Exportar CSV** dos leads do CRM.
- Leads já no CRM aparecem marcados no radar e não voltam como "novos".

## Banco de dados (migrations SQL no repositório)

```sql
create extension if not exists postgis;
create extension if not exists pg_trgm;

-- Lugares: guardar permanentemente só o place_id e dados próprios.
-- Campos vindos do Google ficam em cache com validade (google_cached_until).
create table places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique not null,
  name text, primary_type text, category text,
  address text, neighborhood text, city text,
  geom geography(point, 4326),
  rating numeric, rating_count int, business_status text,
  google_phone text, google_website text, google_maps_uri text,
  google_cached_until timestamptz,
  created_at timestamptz default now()
);
create index on places using gist (geom);
create index on places using gin (name gin_trgm_ops);

-- Contatos extraídos do SITE DA PRÓPRIA EMPRESA (podem ficar guardados)
create table place_contacts (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references places(id) on delete cascade,
  kind text check (kind in ('whatsapp','phone','email','instagram','facebook','site')),
  value text, source text check (source in ('site_empresa','google_places','manual')),
  confirmed boolean default false,
  collected_at timestamptz default now(),
  unique (place_id, kind, value)
);

create table site_audits (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references places(id) on delete cascade,
  url text, site_type text, https boolean, viewport boolean,
  psi_performance int, psi_seo int,
  has_services_page boolean, has_booking boolean, has_whatsapp_button boolean,
  signals jsonb, status text, error text,
  audited_at timestamptz default now()
);

create table lead_scores (
  place_id uuid primary key references places(id) on delete cascade,
  total int, block_a int, block_b int, block_c int, block_d int,
  rules jsonb, weights_version text, scored_at timestamptz default now()
);

create table searches (
  id uuid primary key default gen_random_uuid(),
  category text, center geography(point, 4326), radius_m int,
  api_calls int, results int, created_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  place_id uuid unique references places(id),
  stage text default 'novo', offer text, expected_value numeric,
  next_step text, next_step_at timestamptz, lost_reason text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  kind text, channel text, content text, created_at timestamptz default now()
);

create table optouts (
  id uuid primary key default gen_random_uuid(),
  phone text, google_place_id text, reason text, created_at timestamptz default now()
);

create table api_usage (
  month text, endpoint text, calls int default 0,
  primary key (month, endpoint)
);
```

**Cache do Google:** ao abrir um lead com `google_cached_until` vencido, atualizar com **Place Details (New)** (mesmos campos). Um cron diário (rota `/api/cron/purge`, agendada no `vercel.json` ou no agendador da hospedagem e protegida por `CRON_SECRET`) limpa os campos `google_*`, `rating`, `rating_count` e `address` de lugares que **não estão no CRM** e estão vencidos há mais de 30 dias. Contatos com `source = 'site_empresa'` e dados do CRM ficam.

## Regras que não podem ser quebradas

- Nada de scraping do Google Maps, Instagram ou de qualquer plataforma; dados só pela API oficial do Google e pela página inicial do site oficial da empresa.
- Nada de disparo automático de WhatsApp, nem automação do WhatsApp Web. Só link `wa.me` aberto por mim.
- Checar `optouts` antes de mostrar o botão de contato.
- Chaves de API só no servidor (exceto a do Maps JS, restrita por domínio).
- Atribuição do Google visível onde houver dado do Google.

## Ordem de entrega (faça nesta ordem e me mostre funcionando a cada etapa)

1. Projeto, `.env.example`, migrations, login por senha, layout com sidebar (Radar, CRM).
2. Busca no Google com grade + deduplicação + contador de cota + lista e mapa (sem análise ainda). **Já me deixa usar.**
3. Analisador de site + PageSpeed + Lead Score + selos + painel "Por que essa nota".
4. Painel do lead com contatos, geração de mensagem com IA e botão WhatsApp.
5. CRM kanban, follow-ups, opt-out e exportação CSV.
6. README com: como criar as chaves no Google Cloud (ativar Places API (New), Maps JavaScript API e PageSpeed; **definir cota diária e alerta de orçamento**), Neon (criar projeto na região `aws-sa-east-1` São Paulo, pegar as duas connection strings, rodar as migrations) e Anthropic; como rodar local; como publicar.

## Critérios de aceite

- Buscar "barbearia, Setor Bueno, 3 km" retorna os resultados em menos de 15 s, sem duplicatas e sem franquias.
- Cada resultado mostra a nota e pelo menos uma razão na explicação.
- Leads sem site aparecem com o selo `Sem site` e nota ≥ 45 só no bloco A.
- Celular vira botão de WhatsApp; fixo vira botão de ligar.
- A mensagem gerada tem no máximo 3 frases + pergunta, cita um motivo real e tem a linha de opt-out.
- O contador de cota impede passar de `PLACES_MONTHLY_CAP`.
- Nenhuma chave secreta aparece no bundle do navegador (verificar com `next build` + busca no `.next/static`).

Antes de começar, liste em 5 linhas o plano e as dúvidas que bloqueiam; se nada bloquear, comece pela etapa 1.
