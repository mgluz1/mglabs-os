import { createNeonAuth } from "@neon/auth/next/server";

// Neon Auth gerenciado (Better Auth). O servidor de auth é do Neon;
// este app só faz proxy em /api/auth e guarda a sessão em cookie assinado.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
