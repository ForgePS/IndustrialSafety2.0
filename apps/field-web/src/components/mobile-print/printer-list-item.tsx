"use client";

import { PrinterStatusChip } from "@/components/mobile-print/printer-status-chip";
import { printerDisplayName, type ForgePrinter } from "@/lib/print-api";

type PrinterListItemProps = {
  printer: ForgePrinter;
  isDefault?: boolean;
  actions?: React.ReactNode;
};

export function PrinterListItem({ printer, isDefault, actions }: PrinterListItemProps) {
  return (
    <div className="ff-stack-item">
      <div className="ff-stack-item-main">
        <strong>
          {printerDisplayName(printer)}
          {isDefault || printer.isDefault ? (
            <span className="ff-meta"> · Default</span>
          ) : null}
        </strong>
        <span className="ff-meta">
          {[printer.transportType || printer.connectionType || "Bluetooth", printer.model]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <PrinterStatusChip
        ready={printer.ready}
        connected={printer.connected}
        online={printer.online}
        transport={printer.transportType ?? printer.connectionType}
      />
      {actions}
    </div>
  );
}
