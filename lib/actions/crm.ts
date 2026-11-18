"use server";

import { act } from "@/lib/actions/helpers";
import { archiveCompany, createCompany, createContact, deleteContact, updateCompany, updateContact, type CompanyInput, type ContactInput } from "@/lib/services/companies";
import { addNote, addPlaceToCrm, createDealWithCompany, deleteDeal, moveDeal, updateDeal, type DealInput } from "@/lib/services/deals";
import { registerOptOut } from "@/lib/services/optout";
import { getDeal } from "@/lib/services/deals";
import { convertDealToProject } from "@/lib/services/projects";

export async function createCompanyAction(input: CompanyInput) {
  return act((ctx) => createCompany(ctx, input));
}
export async function updateCompanyAction(id: string, input: Partial<CompanyInput>) {
  return act((ctx) => updateCompany(ctx, id, input));
}
export async function archiveCompanyAction(id: string, archived: boolean) {
  return act((ctx) => archiveCompany(ctx, id, archived));
}
export async function createContactAction(input: ContactInput) {
  return act((ctx) => createContact(ctx, input));
}
export async function updateContactAction(id: string, input: Partial<ContactInput>) {
  return act((ctx) => updateContact(ctx, id, input));
}
export async function deleteContactAction(id: string) {
  return act((ctx) => deleteContact(ctx, id));
}

export async function dealDetailAction(id: string) {
  return act((ctx) => getDeal(ctx, id));
}
export async function createDealAction(input: { companyId?: string; company?: CompanyInput; deal: Omit<DealInput, "companyId"> }) {
  return act((ctx) => createDealWithCompany(ctx, input));
}
export async function updateDealAction(id: string, patch: Partial<Omit<DealInput, "companyId" | "stage">>) {
  return act((ctx) => updateDeal(ctx, id, patch));
}
export async function moveDealAction(id: string, stage: string, lostReason?: string | null) {
  return act((ctx) => moveDeal(ctx, id, stage, { lostReason }));
}
export async function addNoteAction(input: { dealId?: string; companyId?: string; kind?: "nota" | "ligacao" | "resposta" | "reuniao"; content: string }) {
  return act((ctx) => addNote(ctx, input));
}
export async function deleteDealAction(id: string) {
  return act((ctx) => deleteDeal(ctx, id));
}
export async function addPlaceToCrmAction(placeIds: string[]) {
  return act(async (ctx) => {
    let created = 0;
    let existing = 0;
    let skipped = 0;
    for (const id of placeIds.slice(0, 100)) {
      try {
        const r = await addPlaceToCrm(ctx, id);
        if (r.created) created++;
        else existing++;
      } catch {
        skipped++; // opt-out ou lugar inexistente
      }
    }
    return { created, existing, skipped };
  });
}
export async function optOutCompanyAction(companyId: string, reason: string, contactId?: string | null) {
  return act((ctx) => registerOptOut(ctx, { companyId, contactId, reason }));
}
export async function convertDealAction(dealId: string, opts: { createReceivables: boolean; dueDate?: string }) {
  return act((ctx) => convertDealToProject(ctx, dealId, opts));
}
