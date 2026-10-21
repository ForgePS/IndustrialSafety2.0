"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardCard } from "@/lib/dashboard-cards";
import type { DashboardCardOpts } from "@/lib/dashboard-layout";
import {
  listAddableCards,
  movePinnedId,
  pinCard,
  readDashboardLayout,
  resolvePinnedCards,
  unpinCard,
  writeDashboardLayout,
} from "@/lib/dashboard-layout";

export function useDashboardLayout(
  permissions: readonly string[],
  opts?: DashboardCardOpts,
) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPinnedIds(readDashboardLayout().pinnedIds);
    setReady(true);
  }, []);

  const persist = useCallback((next: string[]) => {
    setPinnedIds(next);
    writeDashboardLayout({ pinnedIds: next });
  }, []);

  const pinnedCards = useMemo(
    () => resolvePinnedCards(pinnedIds, permissions, opts),
    [pinnedIds, permissions, opts],
  );

  const addableCards = useMemo(
    () => listAddableCards(pinnedIds, permissions, opts),
    [pinnedIds, permissions, opts],
  );

  const pin = useCallback(
    (id: string) => {
      persist(pinCard(pinnedIds, id));
    },
    [persist, pinnedIds],
  );

  const unpin = useCallback(
    (id: string) => {
      persist(unpinCard(pinnedIds, id));
    },
    [persist, pinnedIds],
  );

  const move = useCallback(
    (id: string, direction: "up" | "down") => {
      persist(movePinnedId(pinnedIds, id, direction));
    },
    [persist, pinnedIds],
  );

  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);

  return {
    ready,
    pinnedIds,
    pinnedCards,
    addableCards,
    pin,
    unpin,
    move,
    isPinned,
  };
}

export type { DashboardCard };
