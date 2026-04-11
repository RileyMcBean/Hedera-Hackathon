import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--next-font-mono",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--next-font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sika Sentinel",
  description: "Runtime governance and evidence layer for delegated financial actions on Hedera",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${manrope.variable}`}>
      <body style={{ height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
        {children}
      </body>
    </html>
  );
}
