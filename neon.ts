import { defineConfig } from "@neon/config/v1";

// Serviços Neon do radarMGLABS (projeto mglabs, branch production, São Paulo).
// Postgres vem por padrão; o Auth gerenciado (Better Auth) é declarado aqui.
// Aplicar com `neon deploy` numa máquina que alcance a API do Neon.
export default defineConfig({
  auth: true,
});
