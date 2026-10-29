"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EnvironmentBanner, ForgeAppShell } from "@forge/ui";
import { ACADEMY_NAV_GROUPS } from "@/lib/navigation";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local";

export function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <ForgeAppShell
      brand="Forge Academy"
      brandMark="FA"
      productLabel="Foundation"
      groups={ACADEMY_NAV_GROUPS}
      activePath={pathname}
      envBanner={<EnvironmentBanner environment={appEnv} />}
      topbarCenter={<span>Academy · foundation shell</span>}
      renderLink={({
        href,
        className,
        children: linkChildren,
        "aria-current": ariaCurrent,
        onClick,
      }) => {
        const props: {
          href: string;
          className?: string;
          "aria-current"?: "page";
          onClick?: () => void;
          children: React.ReactNode;
        } = { href, children: linkChildren };
        if (className) props.className = className;
        if (ariaCurrent) props["aria-current"] = ariaCurrent;
        if (onClick) props.onClick = onClick;
        return <Link {...props} />;
      }}
    >
      {children}
    </ForgeAppShell>
  );
}
