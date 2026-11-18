import Link from "next/link";

import { StagesEditor, TokensPanel } from "@/components/settings/settings-client";
import { Gate } from "@/components/shell/gate";
import { Badge, Page, PageHeader, PendingNote, SectionCard } from "@/components/ui/kit";
import { aiStatusAction } from "@/lib/actions/ai";
import { ROLES, labelOf } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertModule } from "@/lib/services/ctx";
import { listStages } from "@/lib/services/deals";
import { listApiTokens } from "@/lib/services/tokens";
import { headers } from "next/headers";

export const metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <Gate>
      {async (ctx) => {
        assertModule(ctx, "config");
        const [stages, tokens, ai, members, [ws], h] = await Promise.all([listStages(ctx), listApiTokens(ctx), aiStatusAction(), db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ctx.workspaceId)), db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)), headers()]);
        const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
        const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
        const canEdit = ctx.role === "owner" || ctx.role === "admin";
        const env = (k: string) => (process.env[k] ? "configurada" : "ausente");
        return (
          <>
            <PageHeader title="Configurações" description="Espaço de trabalho, funil, integrações e acesso do Claude Code." />
            <Page>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Espaço de trabalho e equipe">
                  <p className="text-sm">{ws?.name} · você é <Badge tone="brand">{labelOf(ROLES, ctx.role)}</Badge></p>
                  <ul className="mt-3 divide-y divide-line text-sm">{members.map((m) => <li key={m.userId} className="flex justify-between py-2"><span className="truncate">{m.email ?? m.userId}</span><span className="text-muted">{labelOf(ROLES, m.role)}</span></li>)}</ul>
                  <p className="mt-3 text-xs text-muted">Hoje só você tem acesso: qualquer outra conta criada no login não enxerga nenhum dado. A arquitetura já separa tudo por espaço de trabalho e por papel (proprietário, administrador, comercial, produção, financeiro); o convite de membros ainda não tem tela.</p>
                </SectionCard>

                <SectionCard title="Inteligência artificial (Gemini, opcional)">
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-muted">Chave GEMINI_API_KEY</dt><dd><Badge tone={ai.enabled ? "ok" : "neutral"}>{ai.enabled ? "configurada" : "ausente — IA desligada"}</Badge></dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Modelo</dt><dd className="font-mono text-xs">{ai.model}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Uso hoje</dt><dd>{ai.usedToday} / {ai.dailyLimit} chamadas</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-muted">A chave fica só no servidor. Defina GEMINI_API_KEY (e, se quiser, GEMINI_MODEL e GEMINI_DAILY_LIMIT) nas variáveis de ambiente. Confirme o modelo e as cotas gratuitas da sua conta em aistudio.google.com/rate-limit. Sem a chave, o app inteiro segue funcionando com modelos e escrita manual. No plano gratuito o Google pode usar os dados enviados para melhorar produtos: o app envia só dados mínimos e sem contatos pessoais.</p>
                </SectionCard>

                <SectionCard title="Funil (etapas)" className="lg:col-span-2"><StagesEditor stages={stages.map((s) => ({ key: s.key, label: s.label, probability: s.probability, kind: s.kind }))} canEdit={canEdit} /></SectionCard>

                <SectionCard title="Claude Code (MCP)" className="lg:col-span-2"><TokensPanel tokens={tokens} mcpUrl={`${proto}://${host}/api/mcp`} /></SectionCard>

                <SectionCard title="Catálogo, modelos e dados">
                  <ul className="space-y-1.5 text-sm"><li><Link href="/propostas?aba=catalogo" className="text-brand hover:underline">Catálogo de serviços</Link> — editar nomes, escopos e preços de referência.</li><li><Link href="/mensagens" className="text-brand hover:underline">Modelos de mensagem</Link> — aba “Modelos” no Estúdio.</li><li><a href="/api/crm/export" className="text-brand hover:underline">Exportar oportunidades (CSV)</a></li><li><Link href="/status" className="text-brand hover:underline">Status do banco, Overture e filas</Link></li></ul>
                </SectionCard>

                <SectionCard title="Ambiente (somente leitura)">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">{[["Banco (DATABASE_URL)", env("DATABASE_URL")], ["Neon Auth", env("NEON_AUTH_BASE_URL")], ["Cron (CRON_SECRET)", env("CRON_SECRET")], ["PageSpeed", env("PAGESPEED_API_KEY")], ["Dono (OWNER_EMAIL)", process.env.OWNER_EMAIL ? "definido" : "não definido"]].map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className={v === "ausente" ? "text-warn" : ""}>{v}</dd></div>)}</dl>
                  <p className="mt-3 text-xs text-muted">Valores nunca são exibidos. Recomendado: desligar o cadastro público no Neon Auth e definir OWNER_EMAIL.</p>
                </SectionCard>
              </div>
              <PendingNote items={["Convite e papéis de equipe, política de retenção/LGPD configurável e backup com teste de restauração ainda são manuais.", "Identidade (logo, cores) vem dos repositórios oficiais e não é editável aqui."]} />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}
