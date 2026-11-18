# Integração das skills de produção no MGLABS OS

**Origem:** skills fornecidas em 18/11/2026 como ZIPs:
- `Briefing cliente-v1.zip` → `briefing-cliente` (SKILL.md).
- `Find photos site-v2.zip` → `find-photos-site` (SKILL.md).
- `Site premium animado-v2.zip` → `site-premium-animado` (SKILL.md).

**Objetivo:** conectar o CRM e o gerenciamento de projetos ao processo real de criação de sites da MGLABS, sem confundir instruções do Claude Code com funções já existentes no aplicativo. Esta especificação é um complemento ao `CRM-MGLABS-OS-PRD.md`. **Não há execução ou instalação das skills no app neste momento.**

## 1. Mapa real das skills

| Skill | Quando no fluxo | Entradas | Entrega real | Ponto de aprovação |
| --- | --- | --- | --- | --- |
| `briefing-cliente` v1 | Pré-venda avançada ou kickoff após fechamento | Mensagens, áudio transcrito, PDFs, anotações, objetivo/escopo e referências | Questionário de 12–18 perguntas OU entrevista, pesquisa da marca e `docs/briefing.md` no formato master briefing | Pendências `[CONFIRMAR]` e aprovação do escopo/conteúdo |
| `find-photos-site` v2 | Discovery de projeto autorizado/pitch ou coleta de material | Links oficiais, autorização, idioma e fontes | `<marca>-public.zip` contendo logos, gráficos, imagens autorizadas, prints, dados JSON de cardápio/catálogo e `README.md` | Verificação de uso de marca e licenças antes de publicar |
| `site-premium-animado` v2 | Execução de design e desenvolvimento | `docs/briefing.md`, `public/`, `PLAN.md`, referências | Projeto de site, direção criativa, implementação e QA, com `PLAN.md`, screenshots, vídeos e notas da rubrica | Fase 2: escolha de uma das 3 direções; Fase 6: revisão/polimento |

O `briefing-cliente` explicitamente alimenta `site-premium-animado`. A skill de site premium recomenda `find-photos-site` quando faltam assets reais. A ordem é uma **sequência lógica com desvios opcionais**, não um pipeline rígido: se o cliente já enviou arquivos, a coleta externa pode não ser necessária; se o objetivo é apenas pitch, o uso da marca tem restrições próprias.

## 2. Fluxo de produto recomendado

### Antes da assinatura
1. Oportunidade criada no Radar ou manualmente; lead qualificado no CRM.
2. Ao avançar para "Reunião/Briefing", apresentar ação **Preparar briefing**.
3. Escolher `Modo: site oficial / redesenho / pitch`. Reusar o que já foi informado; não repetir perguntas.
4. Gerar questionário simples para WhatsApp ou registrar respostas da reunião. Guardar a versão, remetente, data e campos com `[CONFIRMAR]`.
5. Proposta e escopo podem ser construídos a partir do resumo aprovado, mas não marcar hipótese de pesquisa como fato.

### Após fechamento
6. Criar projeto vinculado à oportunidade, empresa e proposta aceita.
7. **Briefing**: produzir `docs/briefing.md`, com versão, aprovação e alterações; campos não validados em destaque.
8. **Materiais**: inventariar uploads do cliente, links e direitos de uso; classificar `recebido / falta / a produzir / não autorizado`.
9. Se permitido, **Coletar referências e assets** via a skill; receber pacote e registrar origem/licença para cada material. É proibido contornar barreiras técnicas/termos de sites ou reutilizar material de terceiros sem autorização.
10. **Direção criativa**: a skill premium prepara três propostas distintas, notas e evidências. Pausar para a escolha do Miguel e, quando cabível, aprovação do cliente.
11. **Construção**: fases Fundação → Seções → Movimento → Revisão, com `PLAN.md` persistente no projeto.
12. **QA**: screenshots de 1440, 1280, 768, 390 e 360 px, gravação da experiência, performance, acessibilidade e checklist de entrega.
13. **Publicação**: ação separada, com aprovação explícita; transferir documentos finais para a ficha do cliente.

## 3. UX no MGLABS OS

Tela `/projetos/[id]`:
- Cabeçalho com cliente, serviço, responsável, prazo, status, última aprovação.
- Abas: **Visão geral | Briefing | Materiais | Direção criativa | Desenvolvimento | Revisões | Arquivos | Financeiro**.
- Linha do tempo comercial + produção.
- Ação contextual por fase: "Gerar questionário", "Consolidar briefing", "Preparar pacote de assets", "Exportar workspace para Claude Code", "Registrar proposta visual", "Iniciar revisão", "Registrar aceite".
- Bloqueio de avanço nas decisões que dependem de validação; marcar cada `[CONFIRMAR]` como pergunta pendente.
- Mostrar link ao GitHub do projeto e ao deploy de preview quando fornecidos; não inventar status.

Módulos complementares:
- **Templates**: questionários, briefings, propostas, entregáveis, estilos de site.
- **Arquivos**: referências, logos, imagens, autorização de uso, versões.
- **Aprovações**: direção escolhida, revisão, publicação, comprovante de aceite.
- **Produção**: fases, checklists, QA e evidências.
- **Biblioteca de skills**: nome, versão, descrição, workflow associado e arquivo original; não incluir instalação arbitrária de plugins por usuário.

## 4. Contrato de dados e exportação para agentes

Para começar, o CRM não deve tentar instalar/rodar skills por conta própria. Em vez disso:
- CRM oferece formulários, editor e validação para criar um **pacote de projeto**.
- Exportação (ZIP) contém `docs/briefing.md`, `docs/BRAND.md` opcional, `PLAN.md` inicial, `project.json` (IDs, escopo, prazo, fase, revisão, links), `assets-manifest.json` (fonte/licença/autorização/checksum) e `public/` apenas com material autorizado.
- Possibilitar "Copiar prompt para Claude Code" apontando para os arquivos e para as skills instaladas. Não exigir que o CRM conheça implementação do agente.
- Importação posterior de `PLAN.md`, screenshots, links e relatórios produzidos pela skill; o app valida dados e registra versões, sem sobrescrever informações silenciosamente.
- Permitir evolução futura com agente em runner isolado (job queue, credenciais escopadas, acesso temporário ao repo, revisão e logs), separada da aplicação Next.js/Neon.

Modelo adicional sugerido:
- `project_briefings` (project_id, version, markdown, approval_status, approved_at/by, unresolved_questions JSONB).
- `project_assets` (project_id, file_url, source_url, rights_status, rights_basis, origin, mime, checksum, attribution, added_at).
- `project_approvals` (project_id, phase, requested_at, decided_at/by, decision, notes, evidence_url).
- `project_artifacts` (project_id, kind, version, url, checksum, provenance, created_at).
- `project_runs` (project_id, skill, skill_version, phase, status, started_at, completed_at, output, error) **somente para futuras execuções reais**.
- `project_phase_events` (project_id, from/to, actor, timestamp, notes).

## 5. Considerações de segurança e fidelidade

- Skills são instruções Markdown para agentes; **anexar o ZIP não transforma o CRM em um agente de navegador ou ambiente de desenvolvimento**.
- Não executar código JavaScript encontrado em skills, páginas de clientes ou assets no contexto do CRM. Processar ZIPs como arquivos não confiáveis (zip-slip, limite de tamanho, MIME, malware, conteúdo hostil).
- A skill de coleta sugere técnicas de navegador para obter assets; sua implementação no CRM deve respeitar autorização, direitos de marca, licenças e termos do site, sem contornar CORS/CSP, controles de acesso ou paywalls. Um pitch deve permanecer privado até autorização.
- Fotos de depoimentos, direitos de imagem, dados pessoais e fontes comerciais necessitam validação separada.
- `[CONFIRMAR]` não vira afirmação verificada em uma proposta, site ou mensagem comercial.
- Não instalar dezenas de skills automaticamente. `site-premium-animado` escolhe poucos auxiliares, exige screenshots, testes e checkpoints com aprovação; validar versões e licenças antes.
- Nunca publicar site, fazer deploy ou enviar mensagens ao cliente por apenas mudar a etapa no CRM.
- Design de **sites para clientes** e design do **CRM** exigem critérios diferentes: o premium permite motion/3D narrativo; o CRM deve privilegiar densidade, legibilidade, velocidade, navegação por teclado e baixa carga de movimento.

## 6. Implementação em incrementos

Aproveitar as fases já previstas no PRD:
1. **Durante empresas/contatos/CRM:** armazenar campos de discovery e fatos de negócio, separados de hipóteses.
2. **Na fase de projetos:** criar abas Briefing, Materiais e Aprovações, com versão e status dos arquivos.
3. **Depois:** criar "Exportar workspace para Claude Code" sem executar agente no servidor.
4. **Por último (opcional):** automatizar preparo de rascunhos e tarefas em fila, com execução em ambiente separado, rastreabilidade e aprovação humana.

### Teste de aceite principal
Lead do Radar → conversa → proposta → fechado → projeto → `briefing.md` aprovado → materiais auditáveis → três direções de arte registradas → direção escolhida → `PLAN.md`/evidências de QA importadas → cliente recebe entrega aprovada, com cobrança visível na mesma ficha.
