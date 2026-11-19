"use server";

import { act } from "@/lib/actions/helpers";
import {
  deleteTemplate,
  messageContext,
  recordClientReply,
  registerSent,
  saveDraft,
  saveTemplate,
  scheduleMessageFollowUp,
  toggleTemplateFavorite,
  whatsappLink,
  type DraftInput,
  type FollowUpInput,
  type ReplyInput,
  type TemplateInput,
} from "@/lib/services/messages";

export async function messageContextAction(input: { dealId?: string | null; companyId?: string | null; contactId?: string | null }) {
  return act((ctx) => messageContext(ctx, input));
}
export async function saveDraftAction(input: DraftInput, draftId?: string | null) {
  return act((ctx) => saveDraft(ctx, input, draftId));
}
export async function saveTemplateAction(id: string | null, input: TemplateInput) {
  return act((ctx) => saveTemplate(ctx, id, input));
}
export async function toggleFavoriteTemplateAction(id: string, favorite: boolean) {
  return act((ctx) => toggleTemplateFavorite(ctx, id, favorite));
}
export async function deleteTemplateAction(id: string) {
  return act((ctx) => deleteTemplate(ctx, id));
}
export async function whatsappLinkAction(input: { companyId: string; contactId?: string | null; phone: string; text: string }) {
  return act((ctx) => whatsappLink(ctx, input));
}
/** Chamado só depois de o usuário confirmar que enviou. */
export async function registerSentAction(input: {
  draft: DraftInput;
  draftId?: string | null;
  idempotencyKey?: string | null;
  channel: "whatsapp" | "email" | "instagram" | "ligacao";
  followUpDays?: number | null;
  followUpTitle?: string | null;
}) {
  return act((ctx) => registerSent(ctx, input));
}
export async function recordReplyAction(input: ReplyInput) {
  return act((ctx) => recordClientReply(ctx, input));
}
export async function scheduleFollowUpAction(input: FollowUpInput) {
  return act((ctx) => scheduleMessageFollowUp(ctx, input));
}
