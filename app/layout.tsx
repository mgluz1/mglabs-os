import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "mglabs", template: "%s · mglabs" },
  description: "MGLABS OS — prospecção, CRM, propostas, projetos e financeiro do estúdio.",
  icons: { icon: [{ url: "/favicon.ico" }, { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/brand/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#f4f5ef", width: "device-width", initialScale: 1 };

// Aplica o tema salvo antes da hidratação (padrão: claro) para não piscar.
const THEME_SCRIPT = `try{var t=localStorage.getItem("mglabs-theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
