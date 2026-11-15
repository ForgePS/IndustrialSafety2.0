"use client";

import Link from "next/link";
import { AdminEmptyState } from "@/components/admin-action-dropdown";

export function ReportingPlaceholderPage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">{eyebrow}</p>
        <h1 className="h4 mb-1">{title}</h1>
        <p className="text-muted mb-0">{description}</p>
      </div>
      <div className="card border shadow-none">
        <div className="card-body">
          <AdminEmptyState
            title={`${title} is not connected yet`}
            description="This page is part of the Reporting Center shell. Data, schedules, and exports will appear when the shared Reporting Engine ships."
            action={
              <Link href="/reporting/library/" className="btn btn-sm btn-outline-primary">
                Browse report library
              </Link>
            }
          />
        </div>
      </div>
    </>
  );
}
