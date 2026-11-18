"use client";

import { useState } from "react";

/** Instante fixo da montagem do componente (evita Date.now() durante a renderização). */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
