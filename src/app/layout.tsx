import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "@/styles/globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--fuente-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--fuente-mono" });

export const metadata: Metadata = {
  title: "CRM De Pascale",
  description: "Seguimiento de clientes, solicitudes de alta y reclamos de Industrias De Pascale.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`h-full ${sans.variable} ${mono.variable}`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
