import type { ReactNode } from "react";

import { SneatHeadAssets } from "@/components/sneat-assets";

import { AppShell } from "@/components/app-shell";

import { ApiBootstrap } from "@/components/api-bootstrap";

import "./globals.css";



export const metadata = {

  title: "Forge Creator Console",

  description: "Platform administration for Forge tenants",

  icons: { icon: "/sneat/img/favicon.ico" },

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

          <AppShell>{children}</AppShell>

        </ApiBootstrap>

      </body>

    </html>

  );

}

