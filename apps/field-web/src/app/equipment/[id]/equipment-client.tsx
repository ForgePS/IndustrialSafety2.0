"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { FieldPrintButton } from "@/components/field-print-label";
import { fieldLotoApi } from "@/lib/loto-api";
import {
  isExecutableProcedureStatus,
  lotoProcedureEquipmentName,
  lotoStatusLabel,
} from "@/lib/loto";
import { operationsApi } from "@/lib/operations-api";
import {
  equipmentDisplayName,
  fleetDisplayName,
  forkliftDisplayName,
  type EquipmentListItem,
  type FleetVehicleItem,
  type ForkliftRecord,
} from "@/lib/operations";

type AssetKind = "equipment" | "vehicle" | "forklift";

function resolveKind(raw: string | null): AssetKind {
  if (raw === "vehicle") return "vehicle";
  if (raw === "forklift") return "forklift";
  return "equipment";
}

function EquipmentInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = String(params?.id ?? "").trim();
  const tab = search.get("tab");
  const kind = resolveKind(search.get("kind"));
  const [equipment, setEquipment] = useState<EquipmentListItem | null>(null);
  const [vehicle, setVehicle] = useState<FleetVehicleItem | null>(null);
  const [forklift, setForklift] = useState<ForkliftRecord | null>(null);
  const [lotoRows, setLotoRows] = useState<Array<Record<string, unknown>>>([]);
  const [dvirRows, setDvirRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [lotoLoading, setLotoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || id === "placeholder") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (kind === "vehicle") {
          const row = await operationsApi.getFleetVehicle(id);
          if (!cancelled) {
            setVehicle(row);
            setEquipment(null);
            setForklift(null);
          }
        } else if (kind === "forklift") {
          try {
            const row = await operationsApi.getForklift(id);
            if (!cancelled) {
              setForklift(row);
              setVehicle(null);
              setEquipment(null);
            }
          } catch {
            const row = await operationsApi.getFleetVehicle(id);
            if (!cancelled) {
              setVehicle(row);
              setForklift(null);
              setEquipment(null);
            }
          }
        } else {
          try {
            const row = await operationsApi.getEquipment(id);
            if (!cancelled) {
              setEquipment(row);
              setVehicle(null);
              setForklift(null);
            }
          } catch {
            const row = await operationsApi.getFleetVehicle(id);
            if (!cancelled) {
              setVehicle(row);
              setEquipment(null);
              setForklift(null);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load asset profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  useEffect(() => {
    if (!id || id === "placeholder" || kind !== "equipment") return;
    let cancelled = false;
    setLotoLoading(true);
    void fieldLotoApi
      .listProcedures({ equipmentId: id, page: 1, pageSize: 20 })
      .then((res) => {
        if (cancelled) return;
        setLotoRows((res.items ?? []).filter((row) => isExecutableProcedureStatus(row.status)));
      })
      .catch(() => {
        if (!cancelled) setLotoRows([]);
      })
      .finally(() => {
        if (!cancelled) setLotoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  useEffect(() => {
    if (!id || id === "placeholder" || !(kind === "vehicle" || vehicle?.dotRegulated)) return;
    let cancelled = false;
    void operationsApi
      .listVehicleDvirs(id)
      .then((rows) => {
        if (!cancelled) setDvirRows(rows);
      })
      .catch(() => {
        if (!cancelled) setDvirRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, kind, vehicle?.dotRegulated]);

  const title = useMemo(() => {
    if (equipment) return equipmentDisplayName(equipment);
    if (vehicle) return fleetDisplayName(vehicle);
    if (forklift) return forkliftDisplayName(forklift);
    return id;
  }, [equipment, vehicle, forklift, id]);

  const brand =
    kind === "vehicle" || vehicle
      ? "Vehicle"
      : kind === "forklift" || forklift
        ? "Forklift"
        : "Equipment";
  const targetType = kind === "vehicle" || kind === "forklift" || vehicle ? "VEHICLE" : "EQUIPMENT";

  if (!id || id === "placeholder") {
    return (
      <EmptyState
        title="Scan an asset QR"
        message="Scan equipment, fleet, or forklift QR codes for the fastest entry."
      />
    );
  }

  if (loading) return <LoadingState label="Loading profile…" />;
  if (error) {
    return (
      <ErrorState title="Profile unavailable" message={error} onRetry={() => router.refresh()} />
    );
  }

  return (
    <>
      <p className="ff-brand-mark">{brand}</p>
      <h1 className="ff-page-title">{title}</h1>
      <div className="ff-work-summary">
        {equipment?.equipmentNumber ? (
          <div className="ff-work-row">
            <span>Number</span>
            <span>{equipment.equipmentNumber}</span>
          </div>
        ) : null}
        {equipment?.equipmentType ? (
          <div className="ff-work-row">
            <span>Type</span>
            <span>{equipment.equipmentType}</span>
          </div>
        ) : null}
        {vehicle?.assetNumber ? (
          <div className="ff-work-row">
            <span>Unit</span>
            <span>{vehicle.assetNumber}</span>
          </div>
        ) : null}
        {vehicle?.licensePlate ? (
          <div className="ff-work-row">
            <span>Plate</span>
            <span>{vehicle.licensePlate}</span>
          </div>
        ) : null}
        {(equipment?.status || vehicle?.status || forklift?.status) && (
          <div className="ff-work-row">
            <span>Status</span>
            <span>{equipment?.status || vehicle?.status || forklift?.status}</span>
          </div>
        )}
        {vehicle?.outOfService ? (
          <div className="ff-work-row">
            <span>Service</span>
            <span>{vehicle.outOfServiceReason || "Out of service"}</span>
          </div>
        ) : null}
        {vehicle?.dotRegulated ? (
          <div className="ff-work-row">
            <span>DOT</span>
            <span>DVIR required</span>
          </div>
        ) : null}
      </div>

      {tab === "history" ? (
        <div className="ff-task-list ff-section">
          {dvirRows.length > 0 ? (
            dvirRows.map((row) => (
              <div key={String(row.id)} className="ff-placeholder-card ff-card-message">
                <strong>{String(row.title ?? "DVIR")}</strong>
                <p className="ff-meta">{String(row.status ?? "")}</p>
              </div>
            ))
          ) : (
            <div className="ff-placeholder-card ff-card-message">
              <strong>History</strong>
              <p>No recent DVIR or inspection history for this asset.</p>
            </div>
          )}
        </div>
      ) : null}

      {kind === "equipment" && equipment ? (
        <section className="ff-section" aria-label="Print">
          <h2 className="ff-section-title">Print</h2>
          <FieldPrintButton
            module="EQUIPMENT"
            recordType="equipment"
            recordId={id}
            title={title}
            fieldValues={{
              name: title,
              id: equipment.equipmentNumber || id,
              status: String(equipment.status ?? ""),
              description: String((equipment as { description?: string | null }).description ?? ""),
              type: equipment.equipmentType || "",
            }}
          />
        </section>
      ) : null}

      {kind === "equipment" ? (
        <section className="ff-section" aria-label="LOTO">
          <h2 className="ff-section-title">LOTO</h2>
          {lotoLoading ? <p className="ff-page-body">Checking procedures…</p> : null}
          {!lotoLoading && lotoRows.length === 0 ? (
            <p className="ff-page-body">No active LOTO procedure is linked to this equipment.</p>
          ) : null}
          <div className="ff-stack-list">
            {lotoRows.map((row) => {
              const procedureId = String(row.id ?? "");
              return (
                <button
                  key={procedureId}
                  type="button"
                  className="ff-stack-item"
                  onClick={() => router.push(`/loto/${encodeURIComponent(procedureId)}/`)}
                >
                  <strong>{lotoProcedureEquipmentName(row)}</strong>
                  <span className="ff-meta">{lotoStatusLabel(row.status)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="ff-action-grid ff-section">
        <button
          type="button"
          className="ff-action-tile"
          onClick={() =>
            router.push(
              `/inspection/new/?targetId=${encodeURIComponent(id)}&targetType=${targetType}`,
            )
          }
        >
          Start inspection
        </button>
        {(vehicle?.dotRegulated || kind === "vehicle") && (
          <button
            type="button"
            className="ff-action-tile"
            onClick={() => router.push(`/dvir/${encodeURIComponent(id)}/`)}
          >
            Start DVIR
          </button>
        )}
        <button
          type="button"
          className="ff-action-tile"
          onClick={() =>
            router.push(
              `/report/equipment/?equipmentId=${encodeURIComponent(id)}&targetType=${targetType}&targetId=${encodeURIComponent(id)}`,
            )
          }
        >
          Report problem
        </button>
        {kind === "equipment" ? (
          <button
            type="button"
            className="ff-action-tile"
            onClick={() => router.push(`/more/loto/?equipmentId=${encodeURIComponent(id)}`)}
          >
            View LOTO
          </button>
        ) : null}
        <button
          type="button"
          className="ff-action-tile"
          onClick={() =>
            router.push(`/equipment/${encodeURIComponent(id)}/?kind=${kind}&tab=history`)
          }
        >
          View history
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary ff-action-grid-span"
          onClick={() => router.push("/scan/")}
        >
          Scan another
        </button>
      </div>
    </>
  );
}

export function EquipmentDetailClient() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <EquipmentInner />
    </Suspense>
  );
}
