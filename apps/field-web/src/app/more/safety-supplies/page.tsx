"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { FormSignaturePad } from "@/components/form-signature-pad";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { OrgContextBar } from "@/components/org-context-bar";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { operationsApi } from "@/lib/operations-api";
import type { SupplyItem, SupplyLocation } from "@/lib/operations";
import { ensureSignatureDataUrl } from "@/lib/signature-data-url";
import { targetTypeLabel } from "@/lib/scan-routes";

type Mode = "issue" | "request";

function SafetySuppliesInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { profile } = useFieldProfile();
  const org = useFieldOrgOptional();
  const { moduleEnabled } = useFieldPermissions();
  const targetId = String(search.get("targetId") ?? "").trim();
  const targetType = String(search.get("targetType") ?? "").trim();
  const typeLabel = targetType ? targetTypeLabel(targetType) : "Safety Supplies";

  const [mode, setMode] = useState<Mode>("issue");
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [locations, setLocations] = useState<SupplyLocation[]>([]);
  const [itemId, setItemId] = useState("");
  const [supplyLocationId, setSupplyLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.displayName && !recipientName) {
      setRecipientName(profile.displayName);
    }
  }, [profile?.displayName, recipientName]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRows, locationRows] = await Promise.all([
        operationsApi.listSupplyItems({ status: "ACTIVE" }),
        operationsApi.listSupplyLocations(),
      ]);
      setItems(itemRows);
      setLocations(locationRows);
      setItemId((current) => current || itemRows[0]?.id || "");
      setSupplyLocationId((current) => {
        if (current) return current;
        const preferred =
          locationRows.find((row) => row.siteId && row.siteId === org?.selection.locationId) ??
          locationRows[0];
        return preferred?.id || "";
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load safety supplies");
    } finally {
      setLoading(false);
    }
  }, [org?.selection.locationId]);

  useEffect(() => {
    if (!moduleEnabled("SAFETY_SUPPLIES")) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [moduleEnabled, refresh]);

  const scopedLocations = useMemo(() => {
    const locationId = org?.selection.locationId ?? "";
    if (!locationId) return locations;
    const matched = locations.filter((row) => !row.siteId || row.siteId === locationId);
    return matched.length > 0 ? matched : locations;
  }, [locations, org?.selection.locationId]);

  async function submit() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (!itemId) throw new Error("Select an item");
      const qty = Number(quantity);
      if (!(qty > 0)) throw new Error("Quantity must be greater than zero");

      if (mode === "issue") {
        if (!supplyLocationId) throw new Error("Select a supply location");
        const sig = ensureSignatureDataUrl(signature);
        if (!recipientName.trim()) throw new Error("Recipient name is required");
        if (!sig) throw new Error("Recipient signature is required (draw or type a name)");
        await operationsApi.issueSupply({
          itemId,
          locationId: supplyLocationId,
          quantity: qty,
          personnelId: null,
          recipientPrintedName: recipientName.trim(),
          recipientSignatureDataUrl: sig,
          siteId: org?.selection.locationId || null,
          notes: reason.trim() || undefined,
          sourceTargetId: targetId || undefined,
          sourceTargetType: targetType || undefined,
        });
        setSuccess("Issue recorded.");
      } else {
        await operationsApi.createSupplyRequest({
          source: "FIELD",
          priority: "ROUTINE",
          siteId: org?.selection.locationId || null,
          locationId: supplyLocationId || null,
          departmentId: org?.selection.departmentId || null,
          reason: reason.trim() || "Field request",
          notes: targetId ? `Scanned ${typeLabel}: ${targetId}` : undefined,
          items: [{ itemId, quantity: qty }],
        });
        setSuccess("Request submitted.");
      }
      setQuantity("1");
      setReason("");
      setSignature("");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (!moduleEnabled("SAFETY_SUPPLIES")) {
    return (
      <EmptyState
        title="Safety Supplies not enabled"
        message="Safety Supplies is not enabled for this company."
      />
    );
  }

  if (loading) return <LoadingState label="Loading safety supplies…" />;
  if (error && items.length === 0) {
    return (
      <ErrorState title="Safety Supplies unavailable" message={error} onRetry={() => void refresh()} />
    );
  }

  return (
    <>
      <h1 className="ff-page-title">Safety Supplies</h1>
      {targetId ? (
        <p className="ff-meta">
          Scanned {typeLabel}: {targetId}
        </p>
      ) : null}
      <p className="ff-page-body">
        Issue PPE or request stock using your active Location context. Prefer Scan for stations and
        labeled items.
      </p>
      <OrgContextBar compact />

      <div className="ff-tabs" role="tablist" aria-label="Supply action" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={mode === "issue" ? "ff-tab ff-tab-active" : "ff-tab"}
          onClick={() => setMode("issue")}
        >
          Issue
        </button>
        <button
          type="button"
          className={mode === "request" ? "ff-tab ff-tab-active" : "ff-tab"}
          onClick={() => setMode("request")}
        >
          Request
        </button>
      </div>

      {error ? <p className="ff-error">{error}</p> : null}
      {success ? <p className="ff-success">{success}</p> : null}

      <label className="ff-field">
        <span className="ff-label">Item</span>
        <select
          className="ff-select"
          value={itemId}
          disabled={busy}
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">Select item</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || item.sku || item.itemNumber || item.id}
            </option>
          ))}
        </select>
      </label>

      <label className="ff-field">
        <span className="ff-label">Supply location</span>
        <select
          className="ff-select"
          value={supplyLocationId}
          disabled={busy}
          onChange={(e) => setSupplyLocationId(e.target.value)}
        >
          <option value="">Select location</option>
          {scopedLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name || loc.id}
            </option>
          ))}
        </select>
      </label>

      <label className="ff-field">
        <span className="ff-label">Quantity</span>
        <input
          className="ff-input"
          type="number"
          min={1}
          step={1}
          value={quantity}
          disabled={busy}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>

      <label className="ff-field">
        <span className="ff-label">{mode === "issue" ? "Notes" : "Reason"}</span>
        <input
          className="ff-input"
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      {mode === "issue" ? (
        <>
          <label className="ff-field">
            <span className="ff-label">Recipient name</span>
            <input
              className="ff-input"
              value={recipientName}
              disabled={busy}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </label>
          <div className="ff-field">
            <span className="ff-label">Recipient signature</span>
            <FormSignaturePad value={signature} onChange={setSignature} disabled={busy} />
          </div>
        </>
      ) : null}

      <button type="button" className="ff-btn" disabled={busy} onClick={() => void submit()}>
        {busy ? "Saving…" : mode === "issue" ? "Issue item" : "Submit request"}
      </button>
      <button
        type="button"
        className="ff-btn ff-btn-secondary"
        style={{ marginTop: 12 }}
        onClick={() => router.push("/scan/")}
      >
        SCAN QR CODE
      </button>
    </>
  );
}

export default function SafetySuppliesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading safety supplies…" />}>
      <SafetySuppliesInner />
    </Suspense>
  );
}
