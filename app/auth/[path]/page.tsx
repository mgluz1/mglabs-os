import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AuthForm } from "./auth-form";

const PATHS = ["sign-in", "sign-up"] as const;

export function generateStaticParams() {
  return PATHS.map((path) => ({ path }));
}

export default function AuthPage({ params }: PageProps<"/auth/[path]">) {
  return (
    <Suspense>
      <Form params={params} />
    </Suspense>
  );
}

async function Form({ params }: Pick<PageProps<"/auth/[path]">, "params">) {
  const { path } = await params;
  if (!PATHS.includes(path as (typeof PATHS)[number])) notFound();
  return <AuthForm path={path} />;
}
