import type { ReactNode } from "react";

export function ForgeTopbar({
  left,
  center,
  right,
  onMenuToggle,
  menuLabel = "Open navigation",
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  onMenuToggle?: () => void;
  menuLabel?: string;
}) {
  return (
    <header className="forge-navbar">
      <div className="forge-topbar__actions">
        {onMenuToggle ? (
          <button
            type="button"
            className="forge-sidebar-toggle"
            aria-label={menuLabel}
            onClick={onMenuToggle}
          >
            ☰
          </button>
        ) : null}
        {left}
      </div>
      <div className="forge-topbar__meta">{center}</div>
      <div className="forge-topbar__actions">{right}</div>
    </header>
  );
}
