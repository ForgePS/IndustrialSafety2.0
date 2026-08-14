import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ApiBootstrap } from "@/components/api-bootstrap";
import { IndustrialShell } from "@/components/industrial-shell";
import { SneatHeadAssets } from "@/components/sneat-assets";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge Industrial Safety",
  description: "Forge Industrial Safety",
  icons: { icon: "/sneat/img/favicon.ico" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="light-style layout-menu-fixed"
      data-theme="theme-default"
      data-assets-path="/sneat/"
      data-template="vertical-menu-template-free"
    >
      <head>
        <SneatHeadAssets />
      </head>
      <body>
        <ApiBootstrap>
          <IndustrialShell>{children}</IndustrialShell>
        </ApiBootstrap>
      </body>
    </html>
  );
}
