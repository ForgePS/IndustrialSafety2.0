"use client";

import { PrinterBridgesErrorBoundary } from "@/components/printer-bridges-error-boundary";
import { PrinterBridgesWorkspace } from "@/components/printer-bridges-workspace";

export default function PrinterBridgesSettingsPage() {
  return (
    <PrinterBridgesErrorBoundary>
      <PrinterBridgesWorkspace />
    </PrinterBridgesErrorBoundary>
  );
}
