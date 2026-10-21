"use client";

import {
  activeWorkersCompCarriers,
  isWorkersCompSelfPay,
  WC_SELF_PAY_CARRIER_ID,
  WC_SELF_PAY_CARRIER_NAME,
  type WorkersCompCarrier,
} from "@/lib/workers-comp-module";

type Props = {
  id: string;
  carriers: readonly WorkersCompCarrier[];
  carrierId: string;
  carrierName: string;
  disabled?: boolean;
  onChange: (next: { carrierId: string; carrierName: string }) => void;
};

/**
 * Claim carrier picker backed by the admin-managed Workers' Comp carrier catalog,
 * plus a built-in "Self Pay" option for claims not billed to insurance.
 */
export function WorkersCompCarrierSelect({
  id,
  carriers,
  carrierId,
  carrierName,
  disabled = false,
  onChange,
}: Props) {
  const active = activeWorkersCompCarriers(carriers);
  const catalogHasSelfPay = carriers.some((carrier) =>
    isWorkersCompSelfPay({ carrierName: carrier.name }),
  );
  const matched =
    active.find((carrier) => carrier.id === carrierId) ||
    active.find((carrier) => carrier.name === carrierName) ||
    carriers.find((carrier) => carrier.id === carrierId) ||
    carriers.find((carrier) => carrier.name === carrierName);
  const builtInSelfPay = !catalogHasSelfPay && !matched && isWorkersCompSelfPay({ carrierId, carrierName });
  const selectValue = matched?.id
    ?? (builtInSelfPay ? WC_SELF_PAY_CARRIER_ID : carrierName.trim() ? "__legacy__" : "");

  return (
    <select
      id={id}
      className="form-select"
      value={selectValue}
      disabled={disabled}
      onChange={(event) => {
        const nextId = event.target.value;
        if (!nextId) {
          onChange({ carrierId: "", carrierName: "" });
          return;
        }
        if (nextId === "__legacy__") {
          onChange({ carrierId: carrierId || "", carrierName });
          return;
        }
        if (nextId === WC_SELF_PAY_CARRIER_ID) {
          onChange({ carrierId: WC_SELF_PAY_CARRIER_ID, carrierName: WC_SELF_PAY_CARRIER_NAME });
          return;
        }
        const selected = carriers.find((carrier) => carrier.id === nextId);
        onChange({
          carrierId: selected?.id ?? "",
          carrierName: selected?.name ?? "",
        });
      }}
    >
      <option value="">Select carrier</option>
      {catalogHasSelfPay ? null : (
        <option value={WC_SELF_PAY_CARRIER_ID}>
          {WC_SELF_PAY_CARRIER_NAME} (not billed to insurance)
        </option>
      )}
      {active.map((carrier) => (
        <option key={carrier.id} value={carrier.id}>
          {carrier.name}
        </option>
      ))}
      {!matched && !builtInSelfPay && carrierName.trim() ? (
        <option value="__legacy__">{carrierName.trim()} (not in catalog)</option>
      ) : null}
    </select>
  );
}
