import type { ReactNode } from "react";
import "@forge/fx-design-tokens/styles.css";
import "@forge/fx-ui/styles.css";
import "@forge/fx-layouts/styles.css";
import { ReferenceShell } from "../components/ReferenceShell";

export const metadata = {
  title: "Forge Experience Reference (FX-S1)",
  description: "Living FX reference — no production business logic",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-fx-theme="light">
      <body style={{ margin: 0 }}>
        <ReferenceShell>{children}</ReferenceShell>
      </body>
    </html>
  );
}
