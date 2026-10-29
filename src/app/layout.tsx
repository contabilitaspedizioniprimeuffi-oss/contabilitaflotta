import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import Shell from "@/components/shell";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Flotta OS — Controllo automezzi",
  description: "Gestionale interno per il controllo della flotta aziendale.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body
        className={`${archivo.variable} ${inter.variable} ${jetbrains.variable} bg-paper font-sans text-ink-900 antialiased`}
      >
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
