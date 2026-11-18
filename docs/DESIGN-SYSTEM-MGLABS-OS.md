# MGLABS OS — Design System e direção de arte

**Fontes reais:** `mgluz1/mglabs/style.css`, `mgluz1/miguelluz/src/styles/tokens.css`, `mgluz1/miguelluz/src/components/ui/BrandMark.tsx`, `mgluz1/radarMGLABS/app/(app)/layout.tsx`.

## Identidade
O CRM não deve usar a marca provisória radarMG, o ícone Radar em gradiente azul, nem cores roxo/azul como cor de navegação. O produto é **mglabs.** e o Radar é apenas um dos módulos.

**Ativos oficiais** (copiar para o novo app preservando a origem):
- `mgluz1/mglabs/public/logo-mglabs.png`: logo completa.
- `mgluz1/mglabs/public/mark-mglabs.png`: marca/símbolo.
- `mgluz1/mglabs/public/favicon.ico` / ícones: favicon, respeitando dimensões.
- `mgluz1/miguelluz/src/components/ui/BrandMark.tsx` traz o padrão de apresentação do símbolo.

Não redesenhar ou substituir o logo por letras genéricas sem aprovação.

## Duas linguagens reais da marca
A landing comercial é clara, usa `#064e3b` (primário), `#047857` (hover), branco `#ffffff`, `#f9f9fb`, texto `#18181b`, `#71717a`; títulos Space Grotesk, corpo Inter.

O portfólio é mais editorial/tecnológico e usa fundo `#070d14`, painel `#0e1620`, cartão `#15202c`, acento `#38d385`, texto `#e8eef3`, borda `#233140`; tipografia Fraunces Variable para títulos editoriais e Inter para UI.

**Decisão de produto:** tema escuro padrão, inspirado no portfólio, tema claro inspirado no site comercial. Verde como cor de ação consistente; azul/roxo apenas para dados semânticos pontuais. Inter para interface e números; Space Grotesk em títulos de página; Fraunces só em momentos editoriais (empty states/onboarding), nunca em tabelas densas.

### Tokens CSS sugeridos
```css
:root {
  --background: #ffffff;
  --surface: #f9f9fb;
  --surface-elevated: #ffffff;
  --foreground: #18181b;
  --muted: #71717a;
  --border: rgba(0,0,0,.08);
  --brand: #064e3b;
  --brand-hover: #047857;
  --brand-on: #ffffff;
  --font-ui: "Inter", system-ui, sans-serif;
  --font-heading: "Space Grotesk", "Inter", sans-serif;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
}
[data-theme="dark"] {
  --background: #070d14;
  --surface: #0e1620;
  --surface-elevated: #15202c;
  --foreground: #e8eef3;
  --muted: #9fb0c0;
  --border: #233140;
  --brand: #38d385;
  --brand-hover: #2bc777;
  --brand-on: #02412d;
}
```

Testar WCAG AA para textos e botões nos dois temas, em especial verde claro sobre branco. Tokens de status (quente, morno, frio, vencido, ganho, perdido) devem usar cor + texto/ícone, nunca depender só da cor.

## Estrutura do shell
- Sidebar 232–248 px expandida, 64–72 px recolhida, com logo oficial no topo e seções claras: Início, Prospectar, Comercial, Operação, Gestão.
- Cabeçalho 56–64 px, busca global/command palette Ctrl/Cmd+K, botão + Novo, notificações e menu de conta.
- Área de conteúdo com títulos, descrições e ações contextualizadas; no Radar manter mapa quase tela cheia e filtros sobrepostos.
- Painel de lead/cliente como drawer de 420–520 px com abas Visão geral, Histórico, Tarefas, Propostas, Projetos.
- Design denso mas respirável: tabelas 40–48 px por linha; espaçamento 8/12/16/24; bordas delicadas; sombras apenas em sobreposições.
- Responsivo: navegação colapsável no tablet, bottom-sheet/drawer no mobile; Kanban com rolagem horizontal intencional.
- Loading com skeleton local, erros recuperáveis, empty states úteis, toasts discretos e confirmações de ações destrutivas.

## Componentes base
AppShell, Sidebar, Topbar, PageHeader, KpiCard, DataTable, FilterBar, SearchInput, LeadScoreBadge, StageBadge, CompanyAvatar, ContactChip, Timeline, ActivityComposer, NoteEditor, MessageDraft, TaskRow, MoneyInput, DateField, SlideOver, Dialog, EmptyState, Skeleton, ThemeToggle.

## Direção de motion
Transições rápidas (150–250ms), sem delay em tarefas de produtividade. Animar reposicionamento Kanban, abertura de drawer e mudanças de filtros. Respeitar `prefers-reduced-motion`. Nada de 3D ornamental que prejudique a leitura ou o desempenho. Referências de animação no portfólio podem inspirar onboarding e empty states, mas não a tela densa de CRM.

## Páginas para validar visualmente antes da expansão
1. `/dashboard`: KPIs, tarefas, oportunidades, gráficos simples.
2. `/radar`: mapa, filtro e lead panel consistentes com design system.
3. `/crm`: Kanban + tabela e resumo de pipeline.
4. `/empresas/[id]`: visão 360° com timeline.
5. `/mensagens`: editor lado a lado com rascunho e contexto.
6. `/propostas/[id]`: editor de escopo/itens e preview de proposta.
7. `/financeiro`: recebíveis e pagamentos sem poluição.

## Critérios de aceite visual
- Marca oficial, favicon, cores e fontes conferidos contra repos originais.
- Não modificar código dos dois sites públicos; somente reutilizar tokens/ativos de forma licenciada/autorizada.
- Ambos os temas com contraste, hover, focus visível e responsividade.
- Capturas das páginas principais em desktop (1440px) e mobile (390px).
- UI consistente, sem uso arbitrário de gradientes, badges coloridas decorativas ou cartões repetitivos.
- Nenhuma regressão no Radar e Kanban durante o redesign.
