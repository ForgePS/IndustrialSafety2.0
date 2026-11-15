import type { BluetoothStatus, PrinterInfoPayload } from "../../services/protocol";
import { renderStatusScreen } from "./pairing";

export function updateStatusView(
  root: HTMLElement,
  status: BluetoothStatus,
  printer: PrinterInfoPayload | null,
): void {
  const detail = printer
    ? [printer.displayName, printer.model, printer.messageTitle || printer.message]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  renderStatusScreen(root, status, detail);
}
