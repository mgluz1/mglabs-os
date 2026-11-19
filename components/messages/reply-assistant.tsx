"use client";

import { Check, Copy, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/kit";
import { useToast } from "@/components/ui/overlays";
import { analyzeReplyAction } from "@/lib/actions/ai";
import type { ReplyAnalysis } from "@/lib/ai/features";
import { STAGE_DEFS } from "@/lib/config/crm";
import { detectStopRequest, intentLabel, quickIntent, suggestedStageForIntent } from "@/lib/reply-intel";

export type ReplyOutcome = { text: string; summary: string; followUpDays: number; stage: string | null; stop: boolean; intent: string };

/**
 * Assistente de resposta: o usuário cola o que o cliente respondeu.
 * - Pedido de parada é detectado por regras, sempre (sem IA e sem enviar nada a ninguém).
 * - Com Gemini ligado e autorizado: intenção, resumo, próximo passo e até 3 rascunhos (contatos mascarados no servidor).
 * Nada é gravado aqui: quem confirma é o usuário, nos botões do diálogo.
 */
export function ReplyAssistant({
  dealId,
  companyId,
  contactId,
  aiEnabled,
  withConsent,
  onOutcome,
  onUseDraft,
  onOptOut,
  text,
  setText,
}: {
  dealId: string | null;
  companyId: string;
  contactId: string | null;
  aiEnabled: boolean;
  withConsent: (fn: () => void) => void;
  onOutcome: (o: ReplyOutcome) => void;
  onUseDraft: (text: string) => void;
  onOptOut: () => void;
  text: string;
  setText: (v: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ReplyAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emit = (a: ReplyAnalysis) =>
    onOutcome({ text, summary: a.summary, followUpDays: a.followUpDays, stage: a.suggestedStage, stop: a.stopRequested, intent: a.intent });

  const analyze = () => {
    const t = text.trim();
    if (t.length < 2) return;
    setError(null);
    const stop = detectStopRequest(t);
    const intent = quickIntent(t);
    const sug = suggestedStageForIntent(intent);
    const local: ReplyAnalysis = {
      intent,
      sentiment: stop || intent === "sem_interesse" ? "negativo" : intent === "interesse" || intent === "agendar_reuniao" ? "positivo" : "neutro",
      summary: "",
      nextStep: "",
      followUpDays: sug.followUpDays,
      suggestedStage: sug.stage,
      stopRequested: stop,
      drafts: [],
      usedAi: false,
    };
    setRes(local);
    emit(local);
    if (stop || !aiEnabled) return;
    withConsent(async () => {
      setBusy(true);
      const r = await analyzeReplyAction({ dealId, companyId, contactId, reply: t, consent: true });
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRes(r.data);
      emit(r.data);
    });
  };

  const stageLabel = res?.suggestedStage ? STAGE_DEFS.find((s) => s.key === res.suggestedStage)?.label : null;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted" htmlFor="reply-raw">
          Cole aqui o que o cliente respondeu
        </label>
        <textarea
          id="reply-raw"
          className="input"
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (res) setRes(null);
          }}
          placeholder="Ex.: Oi Miguel, legal! Quanto custa um site assim?"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={text.trim().length < 2 || busy} onClick={analyze}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {busy ? "Analisando…" : aiEnabled ? "Analisar e sugerir resposta" : "Ler a resposta"}
          </button>
          {!aiEnabled && <span className="text-[11px] text-muted">Sem Gemini: leitura por regras (intenção e pedido de parada). Ative a IA em Configurações para ganhar rascunhos de resposta.</span>}
        </div>
      </div>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error} A leitura por regras acima continua valendo.</p>}

      {res?.stopRequested && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-danger">
            <ShieldAlert className="h-4 w-4" aria-hidden /> O cliente parece ter pedido para parar de ser contatado.
          </p>
          <p className="mt-1 text-xs text-muted">Não envie novas mensagens. Registre o pedido para bloquear o contato e encerrar as negociações abertas.</p>
          <button type="button" className="btn btn-danger btn-sm mt-2" onClick={onOptOut}>
            Marcar como “não contatar”
          </button>
        </div>
      )}

      {res && !res.stopRequested && (
        <div className="space-y-2.5 rounded-xl border border-line bg-background p-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={res.sentiment === "positivo" ? "ok" : res.sentiment === "negativo" ? "warn" : "neutral"}>{intentLabel(res.intent)}</Badge>
            {stageLabel && <Badge tone="info">Sugestão de etapa: {stageLabel}</Badge>}
            <Badge>{res.usedAi ? "Gemini" : "Regras"}</Badge>
          </div>
          {res.summary && <p className="text-fg">{res.summary}</p>}
          {res.nextStep && (
            <p className="text-xs text-muted">
              <b className="text-fg">Próximo passo:</b> {res.nextStep}
            </p>
          )}
          {res.drafts.length > 0 && (
            <div className="grid gap-2">
              {res.drafts.map((d, i) => (
                <div key={i} className="rounded-lg border border-line bg-elevated p-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="eyebrow text-brand">Resposta {i + 1}</span>
                    {d.warnings.length > 0 && <Badge tone="warn">Revisar</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{d.text}</p>
                  {d.warnings.length > 0 && <p className="mt-1 text-[11px] text-warn">Atenção: {d.warnings.join("; ")}.</p>}
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onUseDraft(d.text)}>
                      <Check className="h-3.5 w-3.5" aria-hidden /> Usar no editor
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Copiar resposta ${i + 1}`}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(d.text);
                          toast("Resposta copiada.");
                        } catch {
                          toast("Não foi possível copiar automaticamente.", "error");
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {res.usedAi && <p className="text-[11px] text-muted">A resposta do cliente foi enviada ao Gemini com telefones, e-mails, links e nomes mascarados. Nada é gravado sem a sua confirmação.</p>}
        </div>
      )}
    </div>
  );
}
