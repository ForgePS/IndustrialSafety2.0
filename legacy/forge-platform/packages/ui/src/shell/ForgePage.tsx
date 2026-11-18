import type { ReactNode } from "react";

/**
 * Authoritative Creator / Forge page body under AppShell → Main → ContentContainer.
 * Routes should not apply viewport offsets; nest content here instead.
 */
export function ForgePage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["forge-page", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function ForgePageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["forge-page__body", className].filter(Boolean).join(" ")}>{children}</div>
  );
}

/** Constrained panel for forms and high-risk actions (~800–1000px). */
export function ForgePagePanel({
  children,
  wide,
  className,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={["forge-page__panel", wide ? "forge-page__panel--wide" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
