import { Suspense, type ReactNode } from "react";
import "@forge/design-system/styles.css";
import { AppShell } from "@/components/app-shell";
import styles from "./shell.module.css";

export const metadata = {
  title: "Forge Tenant Admin",
  description: "Delegated Configuration Studio for Forge tenants",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="forge-theme-light">
      <body className={styles.body}>
        <Suspense fallback={<p>Loading…</p>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
