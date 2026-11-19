import { Building2, CheckSquare, FileText, FolderKanban, Kanban, LayoutDashboard, MessageSquareText, Radar, Settings, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; shortcut: string; aliases?: string[] };
export type NavGroup = { label: string; items: NavItem[] };

/** Navegação principal enxuta (6 itens operacionais). */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard, shortcut: "i", aliases: ["d"] },
  { href: "/radar", label: "Radar", icon: Radar, shortcut: "r" },
  { href: "/crm", label: "CRM", icon: Kanban, shortcut: "c" },
  { href: "/mensagens", label: "Mensagens", icon: MessageSquareText, shortcut: "m" },
  { href: "/tarefas", label: "Agenda", icon: CheckSquare, shortcut: "t" },
  { href: "/projetos", label: "Projetos", icon: FolderKanban, shortcut: "j" },
];

/** Área administrativa discreta no rodapé da sidebar. */
export const SETTINGS_ITEM: NavItem = {
  href: "/configuracoes",
  label: "Configurações",
  icon: Settings,
  shortcut: "s",
};

export const NAV: NavGroup[] = [
  { label: "Operação", items: PRIMARY_NAV },
  { label: "Sistema", items: [SETTINGS_ITEM] },
];

/** Atalhos secundários acessíveis pelo comando global (Ctrl/Cmd+K) e por Configurações. */
export const COMMAND_LINKS: { href: string; label: string; hint: string; icon: LucideIcon; shortcut?: string }[] = [
  { href: "/crm?aba=empresas", label: "Empresas e contatos", hint: "no CRM", icon: Building2, shortcut: "e" },
  { href: "/crm?aba=clientes", label: "Clientes", hint: "no CRM", icon: Users, shortcut: "l" },
  { href: "/crm?aba=propostas", label: "Propostas", hint: "no CRM", icon: FileText, shortcut: "p" },
  { href: "/dashboard?visao=relatorios", label: "Relatórios comerciais", hint: "em Início", icon: LayoutDashboard, shortcut: "o" },
  { href: "/financeiro", label: "Financeiro", hint: "em Configurações", icon: Wallet, shortcut: "f" },
  { href: "/configuracoes?aba=funil", label: "Funil e catálogo de serviços", hint: "em Configurações", icon: Settings },
  { href: "/status", label: "Sistema (Status)", hint: "em Configurações", icon: ShieldCheck },
];

export const QUICK_CREATE = [
  { href: "/crm?novo=1", label: "Nova oportunidade" },
  { href: "/crm?aba=empresas&novo=1", label: "Nova empresa" },
  { href: "/tarefas?novo=1", label: "Nova tarefa" },
  { href: "/mensagens", label: "Nova mensagem" },
  { href: "/crm?aba=propostas&novo=1", label: "Nova proposta" },
  { href: "/projetos?novo=1", label: "Novo projeto" },
];
