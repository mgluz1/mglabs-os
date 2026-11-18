"use server";

import { act } from "@/lib/actions/helpers";
import { deleteTemplate, messageContext, registerSent, saveDraft, saveTemplate, whatsappLink, type DraftInput, type TemplateInput } from "@/lib/services/messages";

export async function messageContextAction(input: { dealId?: string | null; companyId?: string | null; contactId?: string | null }) {
  return act((ctx) => messageContext(ctx, input));
}
export async function saveDraftAction(input: DraftInput) {
  return act((ctx) => saveDraft(ctx, input));
}
export async function saveTemplateAction(id: string | null, input: TemplateInput) {
  return act((ctx) => saveTemplate(ctx, id, input));
}
export async function deleteTemplateAction(id: string) {
  return act((ctx) => deleteTemplate(ctx, id));
}
export async function whatsappLinkAction(input: { companyId: string; contactId?: string | null; phone: string; text: string }) {
  return act((ctx) => whatsappLink(ctx, input));
}
/** Chamado só depois de o usuário confirmar que enviou. */
export async function registerSentAction(input: { draft: DraftInput; channel: "whatsapp" | "email" | "instagram" | "ligacao" }) {
  return act((ctx) => registerSent(ctx, input));
}
