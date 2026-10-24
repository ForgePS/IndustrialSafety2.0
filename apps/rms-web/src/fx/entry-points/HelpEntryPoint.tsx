"use client";

import { useState } from "react";
import { FxButton, FxDialog } from "@forge/fx-ui";

export function HelpEntryPoint() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FxButton tone="ghost" aria-label="Help" onClick={() => setOpen(true)}>
        Help
      </FxButton>
      <FxDialog
        open={open}
        title="Help"
        onClose={() => setOpen(false)}
        actions={
          <FxButton tone="secondary" onClick={() => setOpen(false)}>
            Close
          </FxButton>
        }
      >
        <p>
          Forge RMS helps agencies capture and review NERIS incidents and CAD-related operational
          work. Contact your department administrator for role and feature access questions.
        </p>
      </FxDialog>
    </>
  );
}
