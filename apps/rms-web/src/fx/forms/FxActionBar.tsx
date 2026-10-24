"use client";

import type { ReactNode } from "react";

export function FxActionBar({
  children,
  align = "start",
}: {
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <div
      className={`rms-fx-action-bar rms-fx-action-bar--${align}`}
      role="group"
      aria-label="Form actions"
    >
      {children}
    </div>
  );
}

export function FxStickyFooter({ children }: { children: ReactNode }) {
  return <footer className="rms-fx-sticky-footer">{children}</footer>;
}
