"use client";

import type { ReactNode } from "react";
import { ShellInner } from "./shell-inner";

export function AppShell({ children }: { children: ReactNode }) {
  return <ShellInner>{children}</ShellInner>;
}
