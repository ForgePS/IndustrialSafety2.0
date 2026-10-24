"use client";

import { useState } from "react";
import { FxButton, FxDialog } from "@forge/fx-ui";

/** Shell entry only — local/area search, not global cross-module search. */
export function SearchEntryPoint() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FxButton
        tone="ghost"
        aria-label="Search incidents and current area"
        onClick={() => setOpen(true)}
      >
        Search
      </FxButton>
      <FxDialog
        open={open}
        title="Search this area"
        onClose={() => setOpen(false)}
        actions={
          <FxButton tone="secondary" onClick={() => setOpen(false)}>
            Close
          </FxButton>
        }
      >
        <p>
          Global cross-module search is not available yet. Use list filters on Incidents, Review, or
          CAD pages to find records in the current area.
        </p>
      </FxDialog>
    </>
  );
}
