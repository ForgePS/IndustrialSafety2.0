import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ApiBootstrap } from "@/components/api-bootstrap";
import { IndustrialShell } from "@/components/industrial-shell";
import { SneatHeadAssets } from "@/components/sneat-assets";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge Industrial Safety",
  description: "Forge Industrial Safety",
  applicationName: "Forge Industrial Safety",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Forge Industrial",
  },
  formatDetection: {
    telephone: false,
  },
  icons: { icon: "/sneat/img/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#232333" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="light-style layout-menu-fixed"
      data-theme="theme-default"
      data-assets-path="/sneat/"
      data-template="vertical-menu-template"
      suppressHydrationWarning
    >
      <head>
        {/* External FOUC boot — required for CSP script-src 'self' (FIS-M01). */}
        <script src="/theme-boot.js" />
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
