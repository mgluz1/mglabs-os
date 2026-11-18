import { connection } from "next/server";

import { auth } from "@/lib/auth/server";
import { checkDatabase } from "@/lib/health";

// Verificação de ponta a ponta: exige sessão do Neon Auth e consulta o Postgres.
export async function GET() {
  await connection();
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }
  const db = await checkDatabase();
  return Response.json(
    { user: { id: session.user.id, email: session.user.email }, db },
    { status: db.ok ? 200 : 503 },
  );
}
