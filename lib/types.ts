// Tipos compartilhados entre servidor e telas (sem dependências de servidor).
import type { ScoreRule } from "@/lib/score";

export type Contact = {
  kind: "whatsapp" | "phone" | "email" | "instagram" | "facebook" | "site";
  value: string;
  source: "site_empresa" | "google_places" | "overture" | "manual";
  confirmed: boolean;
};

export type RadarPlace = {
  id: string;
  /** "overture" (dados abertos) ou "google" (buscas antigas). */
  source: "overture" | "google";
  overtureId: string | null;
  googlePlaceId: string | null;
  confidence: number | null;
  sourceCount: number | null;
  name: string;
  category: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  ratingCount: number | null;
  googlePhone: string | null;
  googleWebsite: string | null;
  googleMapsUri: string | null;
  auditStatus: string | null;
  siteType: "sem_site" | "so_rede_social" | "site_proprio" | null;
  https: boolean | null;
  viewport: boolean | null;
  psiPerformance: number | null;
  hasBooking: boolean | null;
  hasServicesPage: boolean | null;
  approachable: boolean | null;
  oldSite: string[];
  score: number | null;
  rules: ScoreRule[];
  contacts: Contact[];
  leadId: string | null;
  leadStage: string | null;
  /** Pediu para não ser contatado: nenhum botão de contato aparece. */
  optedOut: boolean;
};

export type Activity = { id: string; kind: string | null; channel: string | null; content: string | null; createdAt: string };

export type LeadCard = {
  id: string;
  stage: string;
  offer: string | null;
  expectedValue: number | null;
  nextStep: string | null;
  nextStepAt: string | null;
  lostReason: string | null;
  place: RadarPlace;
};

export const STAGES = [
  { id: "novo", label: "Novo" },
  { id: "abordado", label: "Abordado" },
  { id: "respondeu", label: "Respondeu" },
  { id: "reuniao", label: "Reunião" },
  { id: "proposta", label: "Proposta" },
  { id: "fechado", label: "Fechado" },
  { id: "perdido", label: "Perdido" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];
