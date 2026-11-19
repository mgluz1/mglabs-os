import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";

import { ProposalsClient } from "@/components/proposals/proposals-client";
import { SettingsNav } from "@/components/settings/settings-nav";
import { StagesEditor, TokensPanel } from "@/components/settings/settings-client";
import { Gate } from "@/components/shell/gate";
import { Badge, Page, PageHeader, PendingNote, SectionCard } from "@/components/ui/kit";
import { workspaceMembers, workspaces } from "@/db/schema";
import { aiStatusAction } from "@/lib/actions/ai";
import { ROLES, labelOf } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { assertModule, canModule } from "@/lib/services/ctx";
import { listStages } from "@/lib/services/deals";
import { listServices } from "@/lib/services/proposals";
import { listApiTokens } from "@/lib/services/tokens";

export const metadata = { title: "Configurações" };

export default function ConfiguracoesPage({ searchParams }: PageProps<"/configuracoes">) {
  return (
    <Gate>
      {async (ctx) => {
        assertModule(ctx, "config");
        const sp = await searchParams;
        const aba = sp.aba === "funil" || sp.aba === "catalogo" ? "funil" : "integracoes";
        const [stages, tokens, ai, members, [ws], services, h] = await Promise.all([
          listStages(ctx),
          listApiTokens(ctx),
          aiStatusAction(),
          db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ctx.workspaceId)),
          db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)),
          aba === "funil" ? listServices(ctx, { includeInactive: true }) : Promise.resolve([]),
          headers(),
        ]);
        const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
        const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
        const canEdit = ctx.role === "owner" || ctx.role === "admin";
        const env = (k: string) => (process.env[k] ? "configurada" : "ausente");

        return (
          <>
            <PageHeader title="Configurações" description="Integrações, funil, catálogo, financeiro e sistema." />
            <SettingsNav current={aba} canFinance={canModule(ctx, "financeiro")} canConfig />
            <Page>
              {aba === "funil" ? (
                <div className="space-y-4">
                  <SectionCard title="Funil (etapas)">
                    <StagesEditor stages={stages.map((s) => ({ key: s.key, label: s.label, probability: s.probability, kind: s.kind }))} canEdit={canEdit} />
                  </SectionCard>
                  <SectionCard title="Catálogo de serviços">
                    <ProposalsClient
                      tab="catalogo"
                      catalogOnly
                      status=""
                      proposals={[]}
                      services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, defaultScope: s.defaultScope, basePriceCents: s.basePriceCents, estimatedDays: s.estimatedDays, recurring: s.recurring, active: s.active }))}
                      companies={[]}
                      deals={[]}
                      basePath="/configuracoes?aba=funil"
                    />
                  </SectionCard>
                  <SectionCard title="Modelos e exportação">
                    <ul className="space-y-1.5 text-sm">
                      <li><Link href="/mensagens" className="text-brand hover:underline">Modelos de mensagem</Link> — aba “Modelos” no Estúdio de Mensagens.</li>
                      <li><a href="/api/crm/export" className="text-brand hover:underline">Exportar oportunidades (CSV)</a></li>
                    </ul>
                  </SectionCard>
                </div>
              ) : (
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
                    <p className="mt-3 text-xs text-muted">A chave fica só no servidor. Defina GEMINI_API_KEY (e, se quiser, GEMINI_MODEL e GEMINI_DAILY_LIMIT) nas variáveis de ambiente. Confirme o modelo e as cotas gratuitas da sua conta em aistudio.google.com/rate-limit. Sem a chave, o app inteiro segue funcionando com modelos e escrita manual.</p>
                  </SectionCard>

                  <SectionCard title="Claude Code (MCP)" className="lg:col-span-2"><TokensPanel tokens={tokens} mcpUrl={`${proto}://${host}/api/mcp`} /></SectionCard>

                  <SectionCard title="Ambiente (somente leitura)" className="lg:col-span-2">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">{[["Banco (DATABASE_URL)", env("DATABASE_URL")], ["Neon Auth", env("NEON_AUTH_BASE_URL")], ["Cron (CRON_SECRET)", env("CRON_SECRET")], ["PageSpeed", env("PAGESPEED_API_KEY")], ["Dono (OWNER_EMAIL)", process.env.OWNER_EMAIL ? "definido" : "não definido"]].map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className={`sm:col-span-2 ${v === "ausente" ? "text-warn" : ""}`}>{v}</dd></div>)}</dl>
                    <p className="mt-3 text-xs text-muted">Valores nunca são exibidos. Recomendado: desligar o cadastro público no Neon Auth e definir OWNER_EMAIL.</p>
                  </SectionCard>
                </div>
              )}
              <PendingNote items={["Convite e papéis de equipe, política de retenção/LGPD configurável e backup com teste de restauração ainda são manuais.", "Identidade (logo, cores) vem dos repositórios oficiais e não é editável aqui."]} />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}
