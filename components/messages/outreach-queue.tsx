"use client";

import { ArrowRight, Inbox, MessageSquareReply } from "lucide-react";

import { Badge, EmptyState } from "@/components/ui/kit";
import { categoryLabel } from "@/lib/config/categories";
import { labelOf, MESSAGE_OBJECTIVES } from "@/lib/config/crm";
import type { QueueItem } from "@/lib/services/outreach";

/** Fila de abordagem: quem precisa de mensagem agora, do mais urgente ao menos urgente. */
export function OutreachQueue({ items, onPick }: { items: QueueItem[]; onPick: (item: QueueItem) => void }) {
  if (!items.length) {
    return <EmptyState icon={Inbox} title="Fila vazia" description="Nenhum negócio aberto precisa de mensagem agora. Adicione leads do Radar ao CRM ou volte quando houver respostas e follow-ups vencendo." />;
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((it) => (
        <li key={it.dealId}>
          <button type="button" onClick={() => onPick(it)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-soft">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${it.awaitingReply ? "bg-danger/15 text-danger" : "bg-elevated text-muted"}`} aria-hidden>
              {it.awaitingReply ? <MessageSquareReply className="size-4" /> : <Inbox className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-fg">{it.companyName}</span>
                <Badge tone={it.awaitingReply ? "warn" : "neutral"}>{labelOf(MESSAGE_OBJECTIVES, it.objective)}</Badge>
                {it.score != null && <Badge tone="info">Nota {it.score}</Badge>}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {categoryLabel(it.category)}
                {it.city ? ` · ${it.city}` : ""} · {it.stageLabel} — {it.reason}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
