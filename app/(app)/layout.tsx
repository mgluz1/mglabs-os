import { Suspense } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { UserMenu } from "@/components/shell/user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      user={
        <Suspense fallback={<span className="h-8 w-8" />}>
          <UserMenu />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
