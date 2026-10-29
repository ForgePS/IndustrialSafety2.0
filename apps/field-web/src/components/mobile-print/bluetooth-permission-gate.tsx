"use client";

import type { MobileBluetoothState, TabletBluetoothHint } from "@/lib/mobile-print";
import { bluefyAppStoreUrl } from "@/lib/mobile-print";

type BluetoothPermissionGateProps = {
  state: MobileBluetoothState;
  hint?: TabletBluetoothHint | null;
  children: React.ReactNode;
};

export function BluetoothPermissionGate({ state, hint, children }: BluetoothPermissionGateProps) {
  if (state === "ready" || state === "unknown") {
    return <>{children}</>;
  }

  if (state === "unsupported") {
    const ios = hint?.kind === "ios";
    return (
      <div className="ff-card-message" role="status">
        <strong>{ios ? "iPad needs the Bluefy browser" : "Bluetooth printing unavailable"}</strong>
        <p>
          {hint?.detail ??
            "This browser cannot use Web Bluetooth. Android tablets: open Forge in Chrome or Edge. iPad: open Forge in Bluefy."}
        </p>
        {ios ? (
          <p>
            <a href={bluefyAppStoreUrl()} rel="noreferrer">
              Get Bluefy for iPad
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  if (state === "powered_off") {
    return (
      <div className="ff-card-message" role="status">
        <strong>Bluetooth is turned off</strong>
        <p>Turn Bluetooth on to find and print to nearby authorized printers.</p>
      </div>
    );
  }

  if (state === "unauthorized") {
    return (
      <div className="ff-card-message" role="status">
        <strong>Bluetooth permission required</strong>
        <p>
          Forge uses Bluetooth to find and print to nearby authorized safety and label printers.
          Allow Bluetooth access in system settings, then return here.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
