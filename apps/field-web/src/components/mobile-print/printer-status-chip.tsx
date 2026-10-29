"use client";

type PrinterStatusChipProps = {
  ready?: boolean;
  connected?: boolean;
  online?: boolean;
  transport?: string | null;
};

export function PrinterStatusChip({ ready, connected, online, transport }: PrinterStatusChipProps) {
  let label = "Offline";
  let tone: "success" | "warning" | "muted" | "info" = "muted";
  if (ready) {
    label = "Ready";
    tone = "success";
  } else if (connected) {
    label = "Connected";
    tone = "info";
  } else if (online) {
    label = "Online";
    tone = "warning";
  }

  const isBt =
    String(transport ?? "")
      .toUpperCase()
      .includes("BLUETOOTH") ||
    String(transport ?? "")
      .toUpperCase()
      .includes("BRADY");

  return (
    <span className={`ff-chip ff-chip--${tone}`} title={transport ?? undefined}>
      {isBt ? "Bluetooth · " : null}
      {label}
    </span>
  );
}
