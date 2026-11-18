import { auth } from "@/lib/auth/server";

// Next 16: proxy.ts (antigo middleware.ts). Tudo exige login,
// exceto as rotas de auth (públicas por padrão no SDK).
export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
