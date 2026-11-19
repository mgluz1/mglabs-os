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
  auditError: string | null;
  auditedAt: string | null;
  scoredAt: string | null;
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
  /** Id da oportunidade no CRM (se houver) e etapa atual. */
  leadId: string | null;
  leadStage: string | null;
  /** Empresa no CRM ligada a este lugar (se houver). */
  companyId: string | null;
  /** Ignorado ou adiado na fila de prospecção. */
  ignored: boolean;
  snoozedUntil: string | null;
  /** Possui rascunho de mensagem salvo ainda não enviado. */
  hasDraft: boolean;
  /** Pediu para não ser contatado: nenhum botão de contato aparece. */
  optedOut: boolean;
};

export type Activity = { id: string; kind: string | null; channel: string | null; content: string | null; createdAt: string };
