# IA híbrida MGLABS OS: operação manual + Gemini Free + MCP Claude Code

Data da decisão: 18/11/2026.
Status: **proposta aprovada como direção de arquitetura**, sem código executado nem integração implantada.
Complementa: `CRM-MGLABS-OS-PRD.md`, `INTEGRACAO-SKILLS-PRODUCAO.md`, `DESIGN-SYSTEM-MGLABS-OS.md`.

## Decisão de produto

Todas as funções de negócio devem funcionar **sem IA**. O mesmo serviço de domínio é acessado por:
1. Interface Next.js (ações manuais);
2. Rotas internas de IA via Google Gemini (sugestões no app);
3. Servidor MCP próprio (operações autorizadas chamadas pelo Claude Code oficial).

**Regra obrigatória:** não criar duas lógicas de negócio, uma para agente e outra para usuário. Ambos usam os mesmos serviços, validações, transações, checagens de permissão, auditoria e regras de opt-out.

### Arquitetura

```
                       [Interface MGLABS OS]
                     /          |          \
            ações manuais   botão "IA"    Chat contextual
                  |             |             |
                  |    [API Next.js Gemini]     |
                  |             |              |
                  +-------------+--------------+
                                |
                    [Domain services + Auth]
               Radar / CRM / Tarefas / Propostas
                Projetos / Mensagens / Financeiro
                                |
                       [Neon PostgreSQL]
                                ^
                                |
                       [MGLABS MCP Server]
                                ^
                                |
                         [Claude Code]
                    (assinatura e CLI oficiais)
```

## Gemini dentro do CRM

Usar `@google/genai` no servidor (nunca no navegador). Modelo inicial configurável: `gemini-3.5-flash-lite` caso disponível no projeto/free tier; conferir modelo ativo em AI Studio antes de habilitar. `GEMINI_API_KEY` em env da Vercel/servidor. *Não há promessa de volume gratuito fixo*: cotas variam por modelo, tier e conta, acessíveis em https://aistudio.google.com/rate-limit. Lidar com HTTP 429/503 mostrando fallback manual e registro de uso.

**Recursos sugeridos por módulo**:
- Radar: resumir fatos da auditoria e explicar por que o lead parece promissor; não reinventar score numérico determinístico nem inventar ausência de site.
- CRM: resumir histórico **higienizado** e sugerir próxima ação; classificação de interesse e objeções como sugestão, não estado autoritativo.
- Mensagens: gerar 2–3 rascunhos em português natural a partir de sinais verificados; templates editáveis, copiar / abrir WhatsApp e confirmar envio; nenhuma automação de WhatsApp Web.
- Propostas: gerar rascunho de escopo e entregáveis com base em briefing validado, sujeito a revisão de números, prazos e cláusulas.
- Tarefas: sugerir follow-ups, criar tarefa só após confirmação.
- Projetos: ajudar a estruturar checklist/briefing e prompts para as três skills; usar pacote de exportação para Claude Code.
- Dashboard: análises descritivas a partir de agregados SQL; valores financeiros sempre calculados por queries e não pela LLM.

**Não enviar no tier gratuito:** nomes e contatos pessoais desnecessários, histórico integral, propostas confidenciais, credenciais, dados financeiros ou arquivos de cliente. A documentação Google classifica o uso gratuito como Unpaid Services e alerta que entradas/saídas podem ser utilizadas para melhoria dos produtos e revisadas por humanos. Implementar `sanitizeForAi()`, minimização e opt-in por recurso. Para dados sensíveis, desabilitar Gemini Free ou usar alternativa contratual paga apropriada.

**Primeiro MVP:** gerador contextual de mensagens + resumo de lead sem dados pessoais + sugestão de próxima tarefa. Sem chatbot irrestrito ou agentes autônomos no servidor.

## MCP para Claude Code

Criar um servidor MCP remoto autenticado como adaptador fino para os serviços internos. Não armazenar tokens da assinatura Claude e não tentar usar credenciais OAuth de Claude Code como API embutida no Next.js. Usuário usa o Claude Code oficial autenticado, conectado ao endpoint MCP com credenciais **do CRM** (token escopado, curta duração ou solução de autorização equivalente).

Ferramentas iniciais `read`: `list_leads`, `get_lead`, `list_companies`, `get_pipeline`, `list_due_tasks`, `get_project_briefing`.
Ferramentas `write` controladas: `create_message_draft`, `create_task`, `update_deal_stage`, `create_proposal_draft`, `append_activity`.
Checar workspace, autorização e opt-out em todos os paths. Validação com schemas, paginação, rate limit, não aceitar raw SQL, idempotência e logs auditáveis. Confirmar operações destrutivas, financeiras ou comunicações externas no CRM; impedir bypass pelo MCP. Não expor dados de todos os clientes por padrão.

## Operações manuais sempre disponíveis

- Prospectar/filtrar/selecionar no Radar;
- cadastrar empresa/contato/negócio;
- mover Kanban e editar cada oportunidade;
- escrever mensagem do zero e registrar histórico;
- criar e concluir tarefas;
- criar propostas, projeto e parcelas;
- registrar recebimentos e despesas;
- exportar relatórios.
  
O botão IA é **assistente contextual** sobre a tela; jamais pré-condição para usar módulos.

## Plano de execução (incremental)

1. Refatorar `app/actions.ts` e queries em serviços de domínio (sem quebrar UI v0); implementar authz + auditoria para cada ação.
2. Criar `lib/ai/providers/gemini.ts`, `sanitizeForAi()`, schemas de saída, limites por usuário/dia, opção de desativar; primeiro recurso: /mensagens.
3. Criar endpoints/contexto IA restritos, com fallback manual e logs de erros sem PII.
4. Criar servidor MCP read-only e testar a conexão no Claude Code oficial; depois liberar drafts e tarefas com autorização explícita.
5. Após entidades de projeto e propostas: conectar MCP/IA a skills por exportação de workspace; aprovações antes de publicar/enviar.
6. Adicionar análises do dashboard por consultas SQL; IA narra somente agregados permitidos.

## Critérios de aceite

- API Gemini desconectada: CRM inteiro segue funcionando.
- MCP desconectado: CRM e Gemini continuam funcionando.
- Claude Code não usa API paga da Anthropic para MCP; o MCP só expõe dados e ferramentas ao cliente oficial.
- Nenhuma chave Gemini/API aparece no bundle cliente, HTML, logs ou Git.
- Gemini Free não recebe dados sensíveis de leads/clientes; mecanismo explícito de política e minimização.
- Nenhuma IA envia WhatsApp, confirma contrato, aprova proposta ou registra pagamento sem ação humana/autorização.
- O mesmo lead, tarefa, deal e proposta são consistentes entre UI e MCP.
- 429/503 vira erro compreensível e fallback para modo manual, sem loops de retry.
- Cobrança/faturamento financeiro, score e estados são calculados deterministicamente, nunca inferidos pela LLM.

**Referências oficiais (18/11/2026)**:
- Gemini Pricing: https://ai.google.dev/gemini-api/docs/pricing
- Rate Limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini API Additional Terms: https://ai.google.dev/gemini-api/terms
- Gemini JS SDK: https://ai.google.dev/gemini-api/docs/get-started
