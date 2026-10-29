"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { filterNavigationGroups } from "@forge/design-system";
import { EnvironmentBanner, ForgeAppShell, ForgeNotificationMenu, ForgeUserMenu } from "@forge/ui";
import { useAuth, useFeatureFlags } from "@forge/web-kit";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import { RMS_LEGACY_NAV_GROUPS } from "@/lib/navigation";
import pageStyles from "../../app/page.module.css";
import styles from "../../app/shell.module.css";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local";

/**
 * Legacy RMS chrome rebuilt on ForgeAppShell.
 * Mounted only when FX shell flag is off — see RmsShellBoundary.
 */
export function RmsLegacyShellAdapter({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { me, loading, error, logout } = useAuth();
  const { flags } = useFeatureFlags(Object.values(RMS_FEATURE_FLAGS));

  const groups = filterNavigationGroups(RMS_LEGACY_NAV_GROUPS, {
    permissions: me?.permissions ?? [],
    products: me?.activeProducts ?? [],
    featureFlags: flags as Record<string, boolean>,
    ...(me?.isPlatformAdmin ? { isPlatformAdmin: true } : {}),
  });

  return (
    <div data-rms-shell="legacy" data-testid="rms-legacy-shell">
      <ForgeAppShell
        brand="Forge RMS"
        brandMark="FR"
        productLabel="Records"
        groups={groups}
        activePath={pathname}
        envBanner={<EnvironmentBanner environment={appEnv} />}
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
        session={
          !loading && me ? (
            <>
              <p
                style={{
                  margin: 0,
                  color: "var(--forge-color-muted)",
                  fontSize: "var(--forge-text-xs)",
                }}
              >
                Signed in
              </p>
              <p style={{ margin: "0.15rem 0 0.5rem", fontWeight: 600 }}>
                {me.userId.slice(0, 8)}…
              </p>
              <p
                style={{
                  margin: 0,
                  color: "var(--forge-color-muted)",
                  fontSize: "var(--forge-text-xs)",
                }}
              >
                Tenant
              </p>
              <p style={{ margin: "0.15rem 0 0.5rem", fontWeight: 600 }}>
                {me.tenantId.slice(0, 8)}…
              </p>
              <Link href="/select-tenant/" className={pageStyles.muted}>
                Switch tenant
              </Link>
            </>
          ) : error ? (
            <p className={styles.authError}>{error}</p>
          ) : (
            <p className={pageStyles.muted}>
              <Link href="/login/">Sign in</Link>
            </p>
          )
        }
        topbarCenter={<span>Forge RMS · legacy shell</span>}
        topbarRight={
          <>
            <ForgeNotificationMenu />
            {me ? <ForgeUserMenu label="Signed in" onSignOut={() => void logout()} /> : null}
          </>
        }
      >
        {children}
      </ForgeAppShell>
    </div>
  );
}
