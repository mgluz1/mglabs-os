import { getCategory } from "@/lib/config/categories";
import { BANDS, PRIORITY_CATEGORIES, WEIGHTS, WEIGHTS_VERSION } from "@/lib/config/score";
import type { SiteType } from "@/lib/audit/analyze-html";

export type ScoreInput = {
  category: string | null;
  siteType: SiteType;
  https?: boolean | null;
  viewport?: boolean | null;
  psiPerformance?: number | null;
  hasServicesPage?: boolean | null;
  seoBasicMissing?: boolean | null;
  hasWhatsappButton?: boolean | null;
  hasTelLink?: boolean | null;
  hasBooking?: boolean | null;
  hasMenu?: boolean | null;
  rating?: number | null;
  ratingCount?: number | null;
  hasMobileOrWhatsapp: boolean;
  hasEmail: boolean;
  hasInstagram: boolean;
  hasAnyContact: boolean;
};

export type ScoreRule = { block: "A" | "B" | "C" | "D"; label: string; points: number };

export type ScoreResult = {
  total: number;
  blockA: number;
  blockB: number;
  blockC: number;
  blockD: number;
  rules: ScoreRule[];
  band: "quente" | "morno" | "frio";
  /** Sem nenhum contato: fica fora da fila de abordagem. */
  approachable: boolean;
  weightsVersion: string;
};

export function computeScore(i: ScoreInput): ScoreResult {
  const rules: ScoreRule[] = [];
  const add = (block: ScoreRule["block"], label: string, points: number) => rules.push({ block, label, points });

  // A. Oportunidade digital
  const A = WEIGHTS.A;
  if (i.siteType === "sem_site") add("A", "Sem site", A.semSite);
  else if (i.siteType === "so_rede_social") add("A", "Só Instagram/WhatsApp/Linktree como site", A.soRedeSocial);
  else {
    if (i.viewport === false) add("A", "Site não responsivo (sem viewport)", A.semViewport);
    if (i.psiPerformance != null && i.psiPerformance < 50) add("A", `Site lento no celular (PageSpeed ${i.psiPerformance})`, A.psiRuim);
    else if (i.psiPerformance != null && i.psiPerformance < 90) add("A", `Desempenho mediano (PageSpeed ${i.psiPerformance})`, A.psiMedio);
    if (i.https === false) add("A", "Sem HTTPS", A.semHttps);
    if (i.hasServicesPage === false) add("A", "Sem página de serviços", A.semServicos);
    if (i.seoBasicMissing) add("A", "SEO básico ausente", A.seoAusente);
    if (i.hasWhatsappButton === false && i.hasTelLink === false) add("A", "Sem botão de WhatsApp ou telefone", A.semBotaoContato);
  }
  let blockA = rules.filter((r) => r.block === "A").reduce((s, r) => s + r.points, 0);
  const capA = i.siteType === "site_proprio" ? A.siteCap : A.max;
  blockA = Math.min(blockA, capA);

  // B. Saúde do negócio
  const B = WEIGHTS.B;
  const n = i.ratingCount ?? 0;
  if (n >= 100) add("B", `${n} avaliações no Google`, B.avaliacoes100);
  else if (n >= 30) add("B", `${n} avaliações no Google`, B.avaliacoes30);
  else if (n >= 10) add("B", `${n} avaliações no Google`, B.avaliacoes10);
  const r = i.rating ?? 0;
  if (r >= 4.5) add("B", `Nota ${r.toFixed(1)}`, B.nota45);
  else if (r >= 4.0) add("B", `Nota ${r.toFixed(1)}`, B.nota40);
  // reservado v1: CNPJ ativo > 2 anos (+5), porte ME/EPP (+5)
  const blockB = Math.min(sum(rules, "B"), B.max);

  // C. Encaixe com a oferta
  const C = WEIGHTS.C;
  const cat = i.category ? getCategory(i.category) : undefined;
  if (cat?.agenda && !i.hasBooking) add("C", "Vive de agenda e não tem agendamento online", C.agendaSemAgendamento);
  if (cat?.id === "restaurante" && !i.hasMenu) add("C", "Sem cardápio digital/delivery próprio", C.restauranteSemCardapio);
  if (cat && PRIORITY_CATEGORIES.includes(cat.id)) add("C", "Categoria prioritária da campanha", C.categoriaPrioritaria);
  const blockC = Math.min(sum(rules, "C"), C.max);

  // D. Contato possível
  const D = WEIGHTS.D;
  if (i.hasMobileOrWhatsapp) add("D", "Celular/WhatsApp disponível", D.whatsapp);
  if (i.hasEmail) add("D", "E-mail publicado", D.email);
  if (i.hasInstagram) add("D", "Instagram identificado", D.instagram);
  const blockD = Math.min(sum(rules, "D"), D.max);

  const total = Math.max(0, Math.min(100, blockA + blockB + blockC + blockD));
  return {
    total,
    blockA,
    blockB,
    blockC,
    blockD,
    rules,
    band: total >= BANDS.quente ? "quente" : total >= BANDS.morno ? "morno" : "frio",
    approachable: i.hasAnyContact,
    weightsVersion: WEIGHTS_VERSION,
  };
}

function sum(rules: ScoreRule[], block: ScoreRule["block"]): number {
  return rules.filter((r) => r.block === block).reduce((s, r) => s + r.points, 0);
}
