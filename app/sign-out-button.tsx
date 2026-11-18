"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="rounded border px-3 py-1 text-sm"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/auth/sign-in");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
