"use client";

import { useState } from "react";
import { FxButton, FxDialog } from "@forge/fx-ui";

/** Shell entry only — no fabricated notification counts or delivery claims. */
export function NotificationsEntryPoint() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FxButton tone="ghost" aria-label="Notifications" onClick={() => setOpen(true)}>
        Notifications
      </FxButton>
      <FxDialog
        open={open}
        title="Notifications"
        onClose={() => setOpen(false)}
        actions={
          <FxButton tone="secondary" onClick={() => setOpen(false)}>
            Close
          </FxButton>
        }
      >
        <p>
          An in-app notification center is not connected for Forge RMS yet. Email or SMS delivery is
          not claimed by this shell entry point.
        </p>
      </FxDialog>
    </>
  );
}
