// Constantes do CRM (sem dependências de servidor; usadas por telas, serviços, IA e MCP).

export const STAGE_DEFS = [
  { key: "novo", label: "Novo", probability: 5, kind: "open" },
  { key: "qualificado", label: "Qualificado", probability: 15, kind: "open" },
  { key: "primeiro_contato", label: "Primeiro contato", probability: 25, kind: "open" },
  { key: "conversa", label: "Conversa", probability: 40, kind: "open" },
  { key: "reuniao", label: "Reunião", probability: 55, kind: "open" },
  { key: "proposta", label: "Proposta", probability: 65, kind: "open" },
  { key: "negociacao", label: "Negociação", probability: 80, kind: "open" },
  { key: "ganho", label: "Fechado ganho", probability: 100, kind: "won" },
  { key: "perdido", label: "Perdido", probability: 0, kind: "lost" },
] as const;
export type StageKey = (typeof STAGE_DEFS)[number]["key"];

/** Estágios do app antigo (leads.stage) → novos. Usado na migração e na compatibilidade. */
export const LEGACY_STAGE_MAP: Record<string, StageKey> = {
  novo: "novo",
  abordado: "primeiro_contato",
  respondeu: "conversa",
  reuniao: "reuniao",
  proposta: "proposta",
  fechado: "ganho",
  perdido: "perdido",
};

export const SOURCES = [
  { id: "radar", label: "Radar" },
  { id: "manual", label: "Cadastro manual" },
  { id: "indicacao", label: "Indicação" },
  { id: "site", label: "Site / formulário" },
  { id: "instagram", label: "Instagram" },
  { id: "importacao", label: "Importação" },
] as const;
export const sourceLabel = (id: string | null | undefined) => SOURCES.find((s) => s.id === id)?.label ?? id ?? "—";

export const LOST_REASONS = ["Sem orçamento", "Escolheu outro fornecedor", "Sem resposta", "Não é o momento", "Já tem solução", "Pediu para não ser contatado", "Fora do perfil", "Outro"] as const;

export const SERVICE_TYPES = ["Landing page", "Site institucional", "Site + agendamento", "Automação de WhatsApp", "Projeto sob medida", "Manutenção / suporte"] as const;

export const OFFER_TO_SERVICE = {
  site: "Site institucional",
  agendamento: "Site + agendamento",
  landing: "Landing page",
  automacao_whatsapp: "Automação de WhatsApp",
} as const;
export type OfferId = keyof typeof OFFER_TO_SERVICE;

export function resolveOfferService(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed in OFFER_TO_SERVICE) return OFFER_TO_SERVICE[trimmed as OfferId];
  if ((SERVICE_TYPES as readonly string[]).includes(trimmed)) return trimmed;
  return null;
}

export const PRIORITIES = [
  { id: "baixa", label: "Baixa" },
  { id: "media", label: "Média" },
  { id: "alta", label: "Alta" },
  { id: "urgente", label: "Urgente" },
] as const;
export const TASK_STATUS = [
  { id: "pendente", label: "Pendente" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "concluida", label: "Concluída" },
  { id: "cancelada", label: "Cancelada" },
] as const;

export const MESSAGE_OBJECTIVES = [
  { id: "primeiro_contato", label: "Primeiro contato" },
  { id: "follow_up", label: "Follow-up" },
  { id: "resposta_interesse", label: "Resposta a cliente interessado" },
  { id: "apresentacao_proposta", label: "Apresentação de proposta" },
  { id: "negociacao", label: "Negociação" },
  { id: "reativacao", label: "Reativação" },
  { id: "pos_venda", label: "Pós-venda" },
] as const;
export type ObjectiveId = (typeof MESSAGE_OBJECTIVES)[number]["id"];

export const MESSAGE_TONES = [
  { id: "natural", label: "Natural e próximo" },
  { id: "objetivo", label: "Objetivo e direto" },
  { id: "profissional", label: "Profissional" },
] as const;
export type MessageToneId = (typeof MESSAGE_TONES)[number]["id"];

export const PROJECT_PHASES = [
  { id: "briefing", label: "Briefing" },
  { id: "materiais", label: "Materiais" },
  { id: "direcao_criativa", label: "Direção criativa" },
  { id: "desenvolvimento", label: "Desenvolvimento" },
  { id: "entrega", label: "Entrega" },
] as const;
export type PhaseId = (typeof PROJECT_PHASES)[number]["id"];

export const PROJECT_STATUS = [
  { id: "planejado", label: "Planejado" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "em_revisao", label: "Em revisão" },
  { id: "pausado", label: "Pausado" },
  { id: "entregue", label: "Entregue" },
  { id: "cancelado", label: "Cancelado" },
] as const;

export const PROPOSAL_STATUS = [
  { id: "rascunho", label: "Rascunho" },
  { id: "enviada", label: "Enviada" },
  { id: "visualizada", label: "Visualizada" },
  { id: "aprovada", label: "Aprovada" },
  { id: "recusada", label: "Recusada" },
  { id: "expirada", label: "Expirada" },
] as const;

export const PAYMENT_METHODS = [
  { id: "pix", label: "Pix" },
  { id: "boleto", label: "Boleto" },
  { id: "cartao", label: "Cartão" },
  { id: "transferencia", label: "Transferência" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "outro", label: "Outro" },
] as const;

export const KNOWLEDGE_KINDS = [
  { id: "processo", label: "Processo interno" },
  { id: "template", label: "Template" },
  { id: "referencia", label: "Referência de design" },
  { id: "projeto", label: "Documentação de projeto" },
  { id: "nota", label: "Nota" },
] as const;

export const ROLES = [
  { id: "owner", label: "Proprietário" },
  { id: "admin", label: "Administrador" },
  { id: "comercial", label: "Comercial" },
  { id: "producao", label: "Produção" },
  { id: "financeiro", label: "Financeiro" },
] as const;
export type RoleId = (typeof ROLES)[number]["id"];

export const labelOf = <T extends { id: string; label: string }>(list: readonly T[], id: string | null | undefined) => list.find((x) => x.id === id)?.label ?? id ?? "—";
