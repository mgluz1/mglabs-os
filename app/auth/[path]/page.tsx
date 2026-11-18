import { notFound } from "next/navigation";

import { AuthForm } from "./auth-form";

const PATHS = ["sign-in", "sign-up"] as const;

export function generateStaticParams() {
  return PATHS.map((path) => ({ path }));
}

export default async function AuthPage({ params }: PageProps<"/auth/[path]">) {
  const { path } = await params;
  if (!PATHS.includes(path as (typeof PATHS)[number])) notFound();
  return <AuthForm path={path} />;
}
