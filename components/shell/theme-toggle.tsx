"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/use-theme";

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("mglabs-theme", next);
        } catch {
          /* armazenamento indisponível: o tema só vale nesta sessão */
        }
      }}
      className="rounded-lg p-2 text-muted transition hover:bg-fg/8 hover:text-fg"
      aria-label={theme === "dark" ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      title={theme === "dark" ? "Tema claro" : "Tema escuro"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
