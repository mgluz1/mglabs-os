import { Activity, Kanban, Radar } from "lucide-react";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/radar", label: "Radar", icon: Radar, tone: "from-sky-500 to-blue-600" },
  { href: "/crm", label: "CRM", icon: Kanban, tone: "from-violet-500 to-fuchsia-600" },
  { href: "/status", label: "Status", icon: Activity, tone: "from-emerald-500 to-teal-600" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-[#0a0c11] p-3">
        <div className="mb-6 flex items-center gap-2.5 px-2 pt-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-500/20">
            <Radar className="h-5 w-5 text-white" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold leading-tight tracking-tight">
              radar<span className="text-sky-400">MG</span>
            </span>
            <span className="block text-[11px] text-white/40">MG Labs · prospecção</span>
          </span>
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="group flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-white/75 transition hover:bg-white/[0.05] hover:text-white">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${n.tone} opacity-90 group-hover:opacity-100`}>
              <n.icon className="h-4 w-4 text-white" />
            </span>
            {n.label}
          </Link>
        ))}
        <div className="mt-auto px-1 pb-1">
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
