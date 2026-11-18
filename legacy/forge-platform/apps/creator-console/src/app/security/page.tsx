"use client";

import Link from "next/link";
import { ForgeModuleGrid, ForgePageHeader, ModuleCard, type ForgeLinkRender } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import styles from "../page.module.css";

function SecurityInner() {
  const renderLink: ForgeLinkRender = ({ href, className, children }) => (
    <Link href={href} className={className}>
      {children}
    </Link>
  );

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Security"
        subtitle="Roles, permissions, and audit tooling for platform operators."
      />

      <ForgeModuleGrid>
        <ModuleCard
          name="Roles"
          meta="Assign tenant roles to users"
          href="/roles/"
          renderLink={renderLink}
        />
        <ModuleCard
          name="Permissions"
          meta="Browse permission catalog"
          href="/permissions/"
          renderLink={renderLink}
        />
        <ModuleCard
          name="Audit log"
          meta="Platform and tenant audit events"
          href="/audit/"
          renderLink={renderLink}
        />
      </ForgeModuleGrid>
    </section>
  );
}

export default function SecurityPage() {
  return (
    <PlatformPageGate
      title="Security"
      anyOf={["platform.audit.read", "platform.role.assign", "platform.permission.read"]}
    >
      <SecurityInner />
    </PlatformPageGate>
  );
}
