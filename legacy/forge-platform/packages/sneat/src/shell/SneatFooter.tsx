import type { ReactNode } from "react";

export function SneatFooter({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <footer className={`content-footer footer bg-footer-theme ${className}`.trim()}>
      <div className="container-xxl d-flex flex-wrap justify-content-between py-4 flex-md-row flex-column">
        <div className="mb-2 mb-md-0 small text-muted">
          {children ?? <>© {new Date().getFullYear()} Forge</>}
        </div>
      </div>
    </footer>
  );
}
