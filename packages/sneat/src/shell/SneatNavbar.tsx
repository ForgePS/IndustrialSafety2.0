import type { ReactNode } from "react";

export function SneatNavbar({
  menuOpen,
  onToggleMenu,
  left,
  center,
  right,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <nav
      className="layout-navbar container-xxl navbar navbar-expand-xl navbar-detached align-items-center bg-navbar-theme"
      id="layout-navbar"
    >
      <div className="layout-menu-toggle navbar-nav align-items-xl-center me-4 me-xl-0 d-xl-none">
        <button
          type="button"
          className="nav-item nav-link px-0 me-xl-6 btn btn-link"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="layout-menu"
          onClick={onToggleMenu}
        >
          <i className="icon-base bx bx-menu icon-md" aria-hidden="true" />
        </button>
      </div>

      <div className="navbar-nav-right d-flex align-items-center flex-wrap gap-2 w-100" id="navbar-collapse">
        {left || center ? (
          <div className="navbar-nav align-items-center flex-grow-1 min-w-0 gap-2 flex-wrap">
            {left}
            {center}
          </div>
        ) : (
          <div className="navbar-nav align-items-center flex-grow-1" />
        )}
        {right ? (
          <ul className="navbar-nav flex-row align-items-center ms-auto flex-shrink-0 gap-2">
            <li className="nav-item d-flex align-items-center gap-2 flex-wrap">{right}</li>
          </ul>
        ) : null}
      </div>
    </nav>
  );
}
