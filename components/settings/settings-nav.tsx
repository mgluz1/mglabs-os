import Link from "next/link";

export type SettingsTab = "integracoes" | "funil" | "financeiro" | "status";

export function SettingsNav({
  current,
  canFinance,
  canConfig,
}: {
  current: SettingsTab;
  canFinance: boolean;
  canConfig: boolean;
}) {
  const items: { id: SettingsTab; label: string; href: string; show: boolean }[] = [
    { id: "integracoes", label: "Integrações (Gemini e MCP)", href: "/configuracoes", show: canConfig },
    { id: "funil", label: "Funil, modelos e catálogo", href: "/configuracoes?aba=funil", show: canConfig },
    { id: "financeiro", label: "Financeiro", href: "/financeiro", show: canFinance },
    { id: "status", label: "Sistema (Status)", href: "/status", show: canConfig },
  ];
  return (
    <nav aria-label="Configurações" className="flex flex-wrap gap-1 border-b border-line bg-background px-4 sm:px-8">
      {items
        .filter((i) => i.show)
        .map((i) => {
          const active = i.id === current;
          return (
            <Link
              key={i.id}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${active ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {i.label}
            </Link>
          );
        })}
    </nav>
  );
}
