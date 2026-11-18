import { auth } from "@/lib/auth/server";

// Next 16: proxy.ts (antigo middleware.ts). Tudo exige login,
// exceto as rotas de auth (públicas por padrão no SDK).
export default auth.middleware({
  loginUrl: "/auth/sign-in",
  // o cron usa CRON_SECRET e o MCP usa token Bearer próprio (hash no banco), não sessão
  publicRoutes: ["/api/cron", "/api/mcp", "/dev-preview"], // dev-preview só existe em desenvolvimento (notFound em produção)
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
