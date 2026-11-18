import { BarChart3, BookOpen, Building2, CheckSquare, FileText, FolderKanban, Kanban, LayoutDashboard, MessageSquareText, Radar, Settings, Users, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; shortcut: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: "Visão geral", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "d" }] },
  {
    label: "Comercial",
    items: [
      { href: "/radar", label: "Radar", icon: Radar, shortcut: "r" },
      { href: "/crm", label: "CRM", icon: Kanban, shortcut: "c" },
      { href: "/empresas", label: "Empresas e contatos", icon: Building2, shortcut: "e" },
      { href: "/mensagens", label: "Mensagens", icon: MessageSquareText, shortcut: "m" },
      { href: "/tarefas", label: "Tarefas e agenda", icon: CheckSquare, shortcut: "t" },
      { href: "/propostas", label: "Propostas", icon: FileText, shortcut: "p" },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users, shortcut: "l" },
      { href: "/projetos", label: "Projetos", icon: FolderKanban, shortcut: "j" },
      { href: "/conhecimento", label: "Conhecimento", icon: BookOpen, shortcut: "k" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/financeiro", label: "Financeiro", icon: Wallet, shortcut: "f" },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3, shortcut: "o" },
      { href: "/configuracoes", label: "Configurações", icon: Settings, shortcut: "s" },
    ],
  },
];

export const QUICK_CREATE = [
  { href: "/crm?novo=1", label: "Nova oportunidade" },
  { href: "/empresas?novo=1", label: "Nova empresa" },
  { href: "/tarefas?novo=1", label: "Nova tarefa" },
  { href: "/mensagens", label: "Nova mensagem" },
  { href: "/propostas?novo=1", label: "Nova proposta" },
  { href: "/projetos?novo=1", label: "Novo projeto" },
];
