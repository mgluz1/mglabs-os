"use client";

import { createAuthClient } from "@neon/auth/next";

// Sem argumentos: conversa com o proxy /api/auth da mesma origem.
export const authClient = createAuthClient();
