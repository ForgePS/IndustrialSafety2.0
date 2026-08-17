import type { ReactNode } from "react";
import "@forge/sneat/core.css";
import "@forge/sneat/demo.css";
import "@forge/sneat/icons.css";
import "@forge/sneat/page-auth.css";
import "./sneat-compat.css";
import { AppShell } from "@/components/app-shell";
import { ApiBootstrap } from "@/components/api-bootstrap";

export const metadata = {
  title: "Forge Creator Console",
  description: "Platform administration for Forge tenants",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="layout-menu-fixed"
      data-bs-theme="light"
      data-template="vertical-menu-template-free"
    >
      <body>
        <ApiBootstrap>
          <AppShell>{children}</AppShell>
        </ApiBootstrap>
      </body>
    </html>
  );
}
