import { connection } from "next/server";

import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth/server";

/** Menu da conta (lê a sessão, por isso fica dentro de <Suspense>). */
export async function UserMenu() {
  await connection();
  const { data: session } = await auth.getSession();
  const email = session?.user?.email;
  return (
    <div className="flex items-center gap-2 pl-1">
      {email && <span className="hidden max-w-[170px] truncate text-xs text-muted lg:block" title={email}>{email}</span>}
      <SignOutButton />
    </div>
  );
}
