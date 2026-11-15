"use client";

import { PrinterStatusChip } from "@/components/mobile-print/printer-status-chip";
import { printerDisplayName, type ForgePrinter } from "@/lib/print-api";

type ConnectedPrinterCardProps = {
  printer: ForgePrinter | null;
  onDetails?: () => void;
};

export function ConnectedPrinterCard({ printer, onDetails }: ConnectedPrinterCardProps) {
  if (!printer) {
    return (
      <article className="ff-stack-item">
        <strong>No connected printer</strong>
        <span className="ff-meta">Pair a Brady label printer to print from the field.</span>
      </article>
    );
  }

  return (
    <article className="ff-stack-item">
      <div className="ff-stack-item-main">
        <strong>{printerDisplayName(printer)}</strong>
        <span className="ff-meta">Brady · Direct Bluetooth</span>
      </div>
      <PrinterStatusChip
        ready={printer.ready}
        connected={printer.connected}
        online={printer.online}
        transport={printer.transportType ?? printer.connectionType}
      />
      {onDetails ? (
        <button type="button" className="ff-btn ff-btn-secondary" onClick={onDetails}>
          Printer details
        </button>
      ) : null}
    </article>
  );
}
