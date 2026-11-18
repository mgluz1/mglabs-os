import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/radar", label: "Radar" },
  { href: "/crm", label: "CRM" },
  { href: "/status", label: "Status" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-white/10 bg-[#0f1219] p-4">
        <div className="mb-6">
          <div className="text-lg font-semibold tracking-tight">
            radar<span className="text-sky-400">MGLABS</span>
          </div>
          <div className="text-xs text-white/40">prospecção · Goiânia</div>
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white">
            {n.label}
          </Link>
        ))}
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
