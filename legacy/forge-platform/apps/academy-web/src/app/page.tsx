"use client";

import { Card, Badge, ForgePageHeader } from "@forge/ui";
import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <ForgePageHeader
        title="Forge Academy"
        subtitle="Foundation stage application shell. Business modules are not included in Sprint 1B."
        actions={
          <Link className="forge-btn forge-btn--outline" href="/health">
            Health
          </Link>
        }
      />
      <Card title="Platform status">
        <p>Shared Forge/Sneat shell is active. Product modules arrive in later Academy sprints.</p>
        <Badge>academy-web</Badge>
      </Card>
    </div>
  );
}
