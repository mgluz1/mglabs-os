"use client";

import { useSyncExternalStore } from "react";

export type ThemeName = "dark" | "light";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** Tema atual (lido do atributo data-theme do <html>). */
export function useTheme(): ThemeName {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}
