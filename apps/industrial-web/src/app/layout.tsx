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
      data-template="vertical-menu-template"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem("forge-ind-theme-mode");if(m!=="dark"&&m!=="light")m="light";var r=document.documentElement;r.setAttribute("data-bs-theme",m);r.classList.toggle("dark-style",m==="dark");r.classList.toggle("light-style",m==="light");r.style.colorScheme=m;}catch(e){}})();`,
          }}
        />
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
