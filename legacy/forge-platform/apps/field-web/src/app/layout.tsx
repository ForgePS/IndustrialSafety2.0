import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ApiBootstrap } from "@/components/api-bootstrap";
import { FieldShell } from "@/components/field-shell";
import { SneatHeadAssets } from "@/components/sneat-assets";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge Safety - Field Version",
  description: "Mobile operational app for Forge Industrial Safety",
  applicationName: "Forge Safety - Field Version",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Field Version",
  },
  icons: {
    icon: [{ url: "/brand/forge-field-logo.png", type: "image/png" }],
    apple: [{ url: "/brand/forge-field-logo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#232333" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="dark-style layout-navbar-fixed"
      data-theme="theme-default"
      data-assets-path="/sneat/"
      data-bs-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/* External FOUC boot — keep in sync with field-theme.ts; CSP script-src 'self' (FIS-M01). */}
        <script src="/theme-boot.js" />
        <SneatHeadAssets />
      </head>
      <body suppressHydrationWarning>
        <ApiBootstrap>
          <FieldShell>{children}</FieldShell>
        </ApiBootstrap>
      </body>
    </html>
  );
}
