"use server";

import { act } from "@/lib/actions/helpers";
import { updateStage } from "@/lib/services/deals";
import { createReceivables, cancelReceivable, deletePayment, registerPayment, type PaymentInput, type ReceivableInput } from "@/lib/services/finance";
import { deleteKnowledge, saveKnowledge, type KnowledgeInput } from "@/lib/services/knowledge";
import { addDocument, createProject, deleteDocument, saveSection, setLinks, updateProject, type ProjectInput } from "@/lib/services/projects";
import { createProposal, deleteProposalDraft, newProposalVersion, saveService, setProposalStatus, updateProposal, type ProposalInput, type ServiceInput } from "@/lib/services/proposals";
import { createApiToken, revokeApiToken } from "@/lib/services/tokens";

// Propostas e catálogo
export async function saveServiceAction(id: string | null, input: ServiceInput) {
  return act((ctx) => saveService(ctx, id, input));
}
export async function createProposalAction(input: ProposalInput) {
  return act((ctx) => createProposal(ctx, input));
}
export async function updateProposalAction(id: string, input: ProposalInput) {
  return act((ctx) => updateProposal(ctx, id, input));
}
export async function proposalStatusAction(id: string, status: string, note?: string) {
  return act((ctx) => setProposalStatus(ctx, id, status, note));
}
export async function newProposalVersionAction(id: string) {
  return act((ctx) => newProposalVersion(ctx, id));
}
export async function deleteProposalAction(id: string) {
  return act((ctx) => deleteProposalDraft(ctx, id));
}

// Projetos
export async function createProjectAction(input: ProjectInput & { companyId: string }) {
  return act((ctx) => createProject(ctx, input));
}
export async function updateProjectAction(id: string, patch: Partial<ProjectInput>) {
  return act((ctx) => updateProject(ctx, id, patch));
}
export async function saveSectionAction(id: string, section: string, text: string) {
  return act((ctx) => saveSection(ctx, id, section, text));
}
export async function setLinksAction(id: string, links: { label: string; url: string }[]) {
  return act((ctx) => setLinks(ctx, id, links));
}
export async function addDocumentAction(projectId: string, input: Parameters<typeof addDocument>[2]) {
  return act((ctx) => addDocument(ctx, projectId, input));
}
export async function deleteDocumentAction(projectId: string, id: string) {
  return act((ctx) => deleteDocument(ctx, projectId, id));
}

// Financeiro
export async function createReceivablesAction(input: ReceivableInput) {
  return act((ctx) => createReceivables(ctx, input));
}
export async function registerPaymentAction(input: PaymentInput) {
  return act((ctx) => registerPayment(ctx, input));
}
export async function deletePaymentAction(id: string) {
  return act((ctx) => deletePayment(ctx, id));
}
export async function cancelReceivableAction(id: string) {
  return act((ctx) => cancelReceivable(ctx, id));
}

// Conhecimento
export async function saveKnowledgeAction(id: string | null, input: KnowledgeInput) {
  return act((ctx) => saveKnowledge(ctx, id, input));
}
export async function deleteKnowledgeAction(id: string) {
  return act((ctx) => deleteKnowledge(ctx, id));
}

// Tokens do MCP
export async function createTokenAction(input: { name: string; scope: "read" | "write"; expiresInDays?: number | null }) {
  return act((ctx) => createApiToken(ctx, input));
}
export async function revokeTokenAction(id: string) {
  return act((ctx) => revokeApiToken(ctx, id));
}

// Configurações
export async function updateStageAction(key: string, patch: { label?: string; probability?: number }) {
  return act((ctx) => updateStage(ctx, key, patch));
}
