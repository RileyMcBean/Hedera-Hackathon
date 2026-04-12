import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
