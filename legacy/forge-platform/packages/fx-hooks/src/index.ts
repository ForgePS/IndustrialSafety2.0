"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyFxTheme, fxBreakpoints, type FxTheme } from "@forge/fx-design-tokens";

export function useTheme(initial: FxTheme = "light") {
  const [theme, setThemeState] = useState<FxTheme>(initial);
  useEffect(() => {
    applyFxTheme(theme);
  }, [theme]);
  const setTheme = useCallback((next: FxTheme) => setThemeState(next), []);
  return { theme, setTheme };
}

export function useResponsive() {
  const [width, setWidth] = useState<number>(fxBreakpoints.desktop);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return useMemo(() => {
    const isPhone = width <= fxBreakpoints.phone;
    const isTablet = width >= fxBreakpoints.tabletPortrait && width < fxBreakpoints.desktop;
    const isDesktop = width >= fxBreakpoints.desktop;
    const isOpsDisplay = width >= fxBreakpoints.operationsDisplay;
    return { width, isPhone, isTablet, isDesktop, isOpsDisplay };
  }, [width]);
}

export function useSelection<T extends string>() {
  const [selected, setSelected] = useState<Set<T>>(new Set());
  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  return { selected, toggle, clear, count: selected.size };
}

export function useDialogs() {
  const [openId, setOpenId] = useState<string | null>(null);
  return {
    openId,
    open: (id: string) => setOpenId(id),
    close: () => setOpenId(null),
    isOpen: (id: string) => openId === id,
  };
}

/** Reference-only stubs — no production auth/offline backends. */
export function useOffline(demoStatus: "online" | "offline" = "online") {
  const [status, setStatus] = useState(demoStatus);
  const [pending, setPending] = useState(0);
  return { status, setStatus, pending, setPending };
}

export function useWorkspace(initialTab = "overview") {
  const [tab, setTab] = useState(initialTab);
  return { tab, setTab };
}
