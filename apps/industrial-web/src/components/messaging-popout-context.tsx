"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type MessagingPopoutContextValue = {
  open: boolean;
  minimized: boolean;
  threadId: string | null;
  openPopout: (threadId?: string) => void;
  closePopout: () => void;
  minimizePopout: () => void;
  restorePopout: () => void;
  togglePopout: () => void;
};

const MessagingPopoutContext = createContext<MessagingPopoutContextValue | null>(null);

export function MessagingPopoutProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const openPopout = useCallback((nextThreadId?: string) => {
    setThreadId(nextThreadId?.trim() || null);
    setMinimized(false);
    setOpen(true);
  }, []);

  const closePopout = useCallback(() => {
    setOpen(false);
    setMinimized(false);
  }, []);

  const minimizePopout = useCallback(() => {
    setOpen(true);
    setMinimized(true);
  }, []);

  const restorePopout = useCallback(() => {
    setOpen(true);
    setMinimized(false);
  }, []);

  const togglePopout = useCallback(() => {
    if (!open) {
      setMinimized(false);
      setOpen(true);
      return;
    }
    if (minimized) {
      setMinimized(false);
      return;
    }
    setOpen(false);
    setMinimized(false);
  }, [open, minimized]);

  const value = useMemo(
    () => ({
      open,
      minimized,
      threadId,
      openPopout,
      closePopout,
      minimizePopout,
      restorePopout,
      togglePopout,
    }),
    [
      open,
      minimized,
      threadId,
      openPopout,
      closePopout,
      minimizePopout,
      restorePopout,
      togglePopout,
    ],
  );

  return (
    <MessagingPopoutContext.Provider value={value}>{children}</MessagingPopoutContext.Provider>
  );
}

export function useMessagingPopout(): MessagingPopoutContextValue {
  const ctx = useContext(MessagingPopoutContext);
  if (!ctx) {
    throw new Error("useMessagingPopout must be used within MessagingPopoutProvider");
  }
  return ctx;
}
