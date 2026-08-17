"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_STORAGE_KEY = "forge-sneat-nav-open-groups-v1";

function readStoredOpenGroups(storageKey: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, value === true]),
    );
  } catch {
    return {};
  }
}

/**
 * Mobile menu open state + persisted accordion group open map for the Sneat
 * vertical layout. Toggles `layout-menu-expanded` on <html> for the overlay.
 */
export function useSneatMenu(options?: {
  storageKey?: string;
  /** Group ids that should start open when no localStorage value exists. */
  defaultOpenGroupIds?: readonly string[];
}) {
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredOpenGroups(storageKey);
    if (Object.keys(stored).length > 0) {
      setOpenGroups(stored);
    } else if (options?.defaultOpenGroupIds?.length) {
      setOpenGroups(
        Object.fromEntries(options.defaultOpenGroupIds.map((id) => [id, true])),
      );
    }
    setHydrated(true);
  }, [storageKey, options?.defaultOpenGroupIds]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(openGroups));
  }, [hydrated, openGroups, storageKey]);

  useEffect(() => {
    document.documentElement.classList.toggle("layout-menu-expanded", menuOpen);
    return () => {
      document.documentElement.classList.remove("layout-menu-expanded");
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  return {
    menuOpen,
    openGroups,
    setOpenGroups,
    toggleGroup,
    closeMenu,
    openMenu,
    toggleMenu,
    setMenuOpen,
  };
}
