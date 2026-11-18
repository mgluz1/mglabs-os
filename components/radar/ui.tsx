"use client";

import {
  AtSign,
  Bot,
  CalendarCheck,
  Dumbbell,
  Globe,
  LayoutTemplate,
  MessageCircle,
  Phone,
  Scissors,
  Sparkles,
  Star,
  Stethoscope,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { BAND_COLOR, bandOf } from "@/components/lead/badges";
import type { RadarPlace } from "@/lib/types";

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  barbearia: Scissors,
  academia: Dumbbell,
  restaurante: UtensilsCrossed,
  clinica: Stethoscope,
  salao: Sparkles,
};

export const OFFER_CARDS = [
  { id: "site", label: "Site profissional", hint: "Para quem não tem site ou tem site ruim", icon: Globe, ticket: 1200 },
  { id: "agendamento", label: "Agendamento online", hint: "Barbearias, salões, clínicas", icon: CalendarCheck, ticket: 600 },
  { id: "landing", label: "Landing page", hint: "Página de serviços e captação", icon: LayoutTemplate, ticket: 900 },
  { id: "automacao_whatsapp", label: "Automação de WhatsApp", hint: "Atendimento e lembretes", icon: Bot, ticket: 1500 },
] as const;
export type OfferCardId = (typeof OFFER_CARDS)[number]["id"];

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "sm" | "md" | "lg" }) {
  const band = bandOf(score);
  const dims = size === "lg" ? "h-12 w-12 text-lg" : size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-sm";
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-xl font-bold tabular-nums ${dims}`}
      style={{ background: `${BAND_COLOR[band]}26`, color: BAND_COLOR[band], boxShadow: `inset 0 0 0 1px ${BAND_COLOR[band]}66` }}
      title={score == null ? "Analisando o site…" : `Lead Score ${score}`}
    >
      {score ?? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
    </span>
  );
}

export function Stars({ rating, count }: { rating: number | null; count: number | null }) {
  if (rating == null) return <span className="text-white/35">sem avaliações</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <span className="tabular-nums text-white/80">{rating.toFixed(1).replace(".", ",")}</span>
      <span className="text-white/40">({count ?? 0})</span>
    </span>
  );
}

/** Ícones de contato disponíveis (cinza = não tem). */
export function ContactIcons({ place }: { place: RadarPlace }) {
  const has = (k: string) => place.contacts.some((c) => c.kind === k);
  const items = [
    { on: has("whatsapp"), icon: MessageCircle, title: "WhatsApp", color: "text-emerald-400" },
    { on: has("phone") || has("whatsapp"), icon: Phone, title: "Telefone", color: "text-sky-300" },
    { on: place.siteType === "site_proprio", icon: Globe, title: "Site", color: "text-sky-300" },
    { on: has("instagram"), icon: AtSign, title: "Instagram", color: "text-pink-300" },
  ];
  return (
    <span className="flex items-center gap-1.5">
      {items.map(({ on, icon: Icon, title, color }) => (
        <Icon key={title} className={`h-3.5 w-3.5 ${on ? color : "text-white/15"}`} aria-label={on ? title : `sem ${title}`} />
      ))}
    </span>
  );
}
