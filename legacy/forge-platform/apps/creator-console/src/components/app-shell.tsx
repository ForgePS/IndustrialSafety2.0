"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@forge/web-kit";
import { ShellInner } from "./shell-inner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ShellInner>{children}</ShellInner>
    </AuthProvider>
  );
}
