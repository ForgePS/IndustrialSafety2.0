"use client";

import Link from "next/link";
import { useState } from "react";
import { FxButton, FxDialog } from "@forge/fx-ui";
import { useFeatureFlags } from "@forge/web-kit";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";

/** Aggregates links to existing queues — no new task database, no fabricated counts. */
export function MyWorkEntryPoint() {
  const [open, setOpen] = useState(false);
  const { flags } = useFeatureFlags([
    RMS_FEATURE_FLAGS.officerReview,
    RMS_FEATURE_FLAGS.incidentShell,
    RMS_FEATURE_FLAGS.cadEnabled,
  ]);

  const links: Array<{ href: string; label: string }> = [];
  if (flags[RMS_FEATURE_FLAGS.officerReview]) {
    links.push({ href: "/review/", label: "Review queue" });
  }
  if (flags[RMS_FEATURE_FLAGS.incidentShell]) {
    links.push({ href: "/incidents/", label: "Incidents" });
  }
  if (flags[RMS_FEATURE_FLAGS.cadEnabled]) {
    links.push({ href: "/cad/conflicts/", label: "CAD conflicts" });
  }

  return (
    <>
      <FxButton tone="ghost" aria-label="My Work" onClick={() => setOpen(true)}>
        My Work
      </FxButton>
      <FxDialog
        open={open}
        title="My Work"
        onClose={() => setOpen(false)}
        actions={
          <FxButton tone="secondary" onClick={() => setOpen(false)}>
            Close
          </FxButton>
        }
      >
        {links.length === 0 ? (
          <p>No supported work queues are enabled for this tenant.</p>
        ) : (
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="rms-fx-muted">
          Counts are not shown unless backed by an existing API source.
        </p>
      </FxDialog>
    </>
  );
}
