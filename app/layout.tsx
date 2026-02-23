import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ADVDESK — Plataforma Jurídica com IA",
  description: "Sistema de gestão jurídica com inteligência artificial para escritórios de advocacia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
