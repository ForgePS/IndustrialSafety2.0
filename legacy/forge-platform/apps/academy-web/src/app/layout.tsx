import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@forge/design-system/styles.css";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge Academy (Foundation)",
  description: "Sprint 1B application shell",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="forge-theme-light">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
