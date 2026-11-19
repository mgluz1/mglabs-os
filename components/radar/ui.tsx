"use client";

import {
  AtSign,
  Briefcase,
  Coffee,
  Dumbbell,
  Globe,
  HeartPulse,
  Home,
  Layers,
  MessageCircle,
  PawPrint,
  Phone,
  Pizza,
  Scissors,
  ShoppingBag,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { BAND_COLOR, bandOf } from "@/components/lead/badges";
import type { RadarPlace } from "@/lib/types";

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  barbearia: Scissors,
  salao: Sparkles,
  dentista: Smile,
  estetica: HeartPulse,
  petshop: PawPrint,
  academia: Dumbbell,
  restaurante: UtensilsCrossed,
  pizzaria: Pizza,
  clinica: Stethoscope,
  cafeteria: Coffee,
  oficina: Wrench,
  imobiliaria: Home,
  escritorio: Briefcase,
  comercio: ShoppingBag,
};

export const OFFER_CARDS = [
  { id: "site", label: "Site profissional", hint: "Para empresas sem site ou com site desatualizado", icon: Globe, ticket: 1500 },
  { id: "servicos_mglabs", label: "Serviços MGLABS", hint: "Automação, agendamento, IA e páginas de venda", icon: Layers, ticket: 2000 },
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
  if (rating == null) return <span className="text-fg/35">sem avaliações</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="h-3 w-3 fill-amber-400 text-warn" />
      <span className="tabular-nums text-fg/80">{rating.toFixed(1).replace(".", ",")}</span>
      <span className="text-fg/40">({count ?? 0})</span>
    </span>
  );
}

/** Ícones de contato disponíveis (cinza = não tem). */
export function ContactIcons({ place }: { place: RadarPlace }) {
  const has = (k: string) => place.contacts.some((c) => c.kind === k);
  const items = [
    { on: has("whatsapp"), icon: MessageCircle, title: "WhatsApp", color: "text-brand" },
    { on: has("phone") || has("whatsapp"), icon: Phone, title: "Telefone", color: "text-brand" },
    { on: place.siteType === "site_proprio", icon: Globe, title: "Site", color: "text-brand" },
    { on: has("instagram"), icon: AtSign, title: "Instagram", color: "text-info" },
  ];
  return (
    <span className="flex items-center gap-1.5">
      {items.map(({ on, icon: Icon, title, color }) => (
        <Icon key={title} className={`h-3.5 w-3.5 ${on ? color : "text-fg/15"}`} aria-label={on ? title : `sem ${title}`} />
      ))}
    </span>
  );
}

const RING_COLOR = { quente: "var(--brand)", morno: "#d9a441", frio: "#94a3b8", analisando: "#94a3b8" } as const;

/** Nota em anel (estilo ficha): trilho + arco proporcional à nota, número no centro. Cor e número, nunca só cor. */
export function ScoreRing({ score, size = 40, stroke }: { score: number | null; size?: number; stroke?: number }) {
  const band = bandOf(score);
  const w = stroke ?? Math.max(3, Math.round(size / 11));
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-surface" style={{ width: size, height: size }} title={score == null ? "Analisando o site…" : `Lead Score ${score} (${band})`}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={w} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RING_COLOR[band]} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      {score == null ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      ) : (
        <span className="relative font-semibold tabular-nums text-fg" style={{ fontSize: Math.max(11, Math.round(size * 0.3)) }}>
          {score}
        </span>
      )}
    </span>
  );
}
