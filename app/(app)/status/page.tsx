import { ImportOvertureButton } from "@/components/import-overture-button";
import { Gate } from "@/components/shell/gate";
import { Badge, Page, PageHeader, SectionCard } from "@/components/ui/kit";
import { checkDatabase } from "@/lib/health";
import { radarInfo } from "@/lib/places/search";
import { aiConfig } from "@/lib/ai/gemini";

export const metadata = { title: "Status" };

export default function StatusPage() {
  return (
    <Gate>
      {async (ctx) => {
        const [db, ov] = await Promise.all([checkDatabase(), radarInfo()]);
        const ai = aiConfig();
        return (
          <>
            <PageHeader title="Status" description={`Integridade do banco, da base aberta e das integrações. Conectado como ${ctx.email ?? "usuário"}.`} />
            <Page>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Banco de dados (Neon)">
                  {db.ok ? (
                    <ul className="space-y-1 text-sm">
                      <li>Postgres {db.postgres}</li>
                      <li>PostGIS {db.postgis ?? "não instalado"}</li>
                      <li>pg_trgm {db.pgTrgm ? "ativo" : "não instalado"}</li>
                      <li>Tabelas principais: {db.tables} de 13</li>
                      <li>Tempo da consulta: {db.ms} ms</li>
                    </ul>
                  ) : (
                    <p className="text-sm text-danger">Erro: {db.error}</p>
                  )}
                </SectionCard>
                <SectionCard title="Base aberta de negócios (Overture Maps)">
                  <ul className="space-y-1 text-sm">
                    <li>{ov.total.toLocaleString("pt-BR")} negócios na região de Goiânia</li>
                    <li>Release: {ov.release ?? "—"}</li>
                    <li>Última importação: {ov.loaded_at ? new Date(ov.loaded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}</li>
                  </ul>
                  <p className="mt-2 text-xs text-muted">Atualiza sozinha todo mês (GitHub Action no dia 25 e importação no dia 26).</p>
                  <div className="mt-3"><ImportOvertureButton /></div>
                </SectionCard>
                <SectionCard title="Integrações">
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex justify-between"><span>IA (Gemini)</span><Badge tone={ai.enabled ? "ok" : "neutral"}>{ai.enabled ? `ativa · ${ai.model}` : "desligada"}</Badge></li>
                    <li className="flex justify-between"><span>MCP (Claude Code)</span><span className="text-muted">/api/mcp · tokens em Configurações</span></li>
                  </ul>
                </SectionCard>
              </div>
            </Page>
          </>
        );
      }}
    </Gate>
  );
}
