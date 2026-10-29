"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ForgePrintDialog } from "@/components/forge-print-dialog";
import { FleetAssetDvirPanel } from "@/components/fleet-asset-dvir-panel";
import { DvirReportSummaryTable } from "@/components/dvir-report-summary-table";
import { FleetDocumentPhotoCell } from "@/components/fleet-document-photo-cell";
import { FleetDocumentViewer } from "@/components/fleet-document-viewer";
import { FleetPrintHeader } from "@/components/fleet-print-header";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  FLEET_ASSET_STATUS_OPTIONS,
  FLEET_ASSET_TYPE_OPTIONS,
  FLEET_COMMUTE_OPTIONS,
  FLEET_COMPLIANCE_DOCUMENT_TYPES,
  FLEET_COMPLIANCE_OPTIONS,
  FLEET_COUNTY_STATUS_OPTIONS,
  FLEET_COMMON_MAINTENANCE_ITEMS,
  FLEET_INSURANCE_STATUS_OPTIONS,
  FLEET_OTHER_DOCUMENT_TYPES,
  asFleetBoolSelect,
  asFleetText,
  compressFleetDocumentFile,
  fleetAssetLabel,
  fleetAssetPrintFieldValues,
  ensureFleetDvirPrintQrPayload,
  fleetListHref,
  fleetMaintenanceItemByTitle,
} from "@/lib/fleet";
import { printFleetReport } from "@/lib/fleet-print";
import { formatApiErrorMessage } from "@/lib/api-error";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { isDvirRecord } from "@/lib/dvir";
import { US_STATES, normalizeUsStateCode } from "@/lib/us-states";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };

function str(value: unknown): string {
  return asFleetText(value);
}

function Field({
  id,
  label,
  children,
  className = "col-md-4",
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ReportLine({ label, value }: { label: string; value: unknown }) {
  const text = asFleetText(value);
  if (!text) return null;
  return (
    <div className="d-flex gap-2 mb-1">
      <span className="text-muted" style={{ minWidth: 160 }}>
        {label}
      </span>
      <span>{text}</span>
    </div>
  );
}

function FleetAssetInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const autoPrint = searchParams.get("print") === "1";
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.fleet.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.fleet.manage") || permissions.has("industrial.admin");
  const canManageDvirQr =
    permissions.has("industrial.dot.manage") ||
    permissions.has("industrial.fleet.manage") ||
    permissions.has("industrial.admin");
  const canPrintLabel =
    permissions.has("industrial.printer.print") || permissions.has("industrial.admin");

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "FLEET",
    canView,
  });
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null);
  const [printLabelOpen, setPrintLabelOpen] = useState(false);
  const [printQrPayload, setPrintQrPayload] = useState<string | null>(null);
  const [printQrBusy, setPrintQrBusy] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown> | null>(null);
  const [maintenance, setMaintenance] = useState<Array<Record<string, unknown>>>([]);
  const [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]);
  const [inspections, setInspections] = useState<Array<Record<string, unknown>>>([]);
  const [dvirs, setDvirs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [assignName, setAssignName] = useState("");
  const [mileage, setMileage] = useState("");
  const [engineHours, setEngineHours] = useState("");

  const [maintTitles, setMaintTitles] = useState<string[]>([]);
  const [maintCustomTitle, setMaintCustomTitle] = useState("");
  const [maintDue, setMaintDue] = useState("");
  const [maintCost, setMaintCost] = useState("");
  const [maintNotes, setMaintNotes] = useState("");

  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<string>("INSURANCE_CARD");
  const [docNotes, setDocNotes] = useState("");
  const [docPhoto, setDocPhoto] = useState<{
    dataUrl: string;
    contentType: string;
    fileName: string;
  } | null>(null);
  const [docPhotoBusy, setDocPhotoBusy] = useState(false);
  const [docPhotoError, setDocPhotoError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"compliance" | "other">("compliance");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const otherCameraInputRef = useRef<HTMLInputElement>(null);
  const otherUploadInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const otherVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [otherDocTitle, setOtherDocTitle] = useState("");
  const [otherDocType, setOtherDocType] = useState<string>("MAINTENANCE");
  const [otherDocNotes, setOtherDocNotes] = useState("");
  const [otherDocPhoto, setOtherDocPhoto] = useState<{
    dataUrl: string;
    contentType: string;
    fileName: string;
  } | null>(null);
  const [otherDocPhotoBusy, setOtherDocPhotoBusy] = useState(false);
  const [otherDocPhotoError, setOtherDocPhotoError] = useState<string | null>(null);
  const [printMounted, setPrintMounted] = useState(false);
  const [viewDoc, setViewDoc] = useState<{
    id: string;
    title: string;
    inlineDataUrl?: string;
  } | null>(null);

  const [inspTitle, setInspTitle] = useState("");
  const [inspNotes, setInspNotes] = useState("");

  const load = useCallback(async () => {
    if (!id) {
      setError("No asset was selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [vehicle, hist, maint, docs, insp, dvirRes] = await Promise.all([
        apiGet<Record<string, unknown>>(
          `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(id)}`,
        ),
        apiGet<Record<string, unknown>>(
          `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(id)}/history`,
        ).catch(() => null),
        apiGet<ListResponse>("/api/v1/industrial/fleet/maintenance", {
          query: { page: "1", pageSize: "100", vehicleId: id },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
        apiGet<ListResponse>("/api/v1/industrial/fleet/documents", {
          query: { page: "1", pageSize: "100", vehicleId: id },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
        apiGet<ListResponse>("/api/v1/industrial/fleet/inspections", {
          query: { page: "1", pageSize: "100", vehicleId: id },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
        apiGet<ListResponse>(`/api/v1/industrial/fleet/vehicles/${encodeURIComponent(id)}/dvirs`, {
          query: { page: "1", pageSize: "100" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
      ]);
      setAsset(vehicle);
      setHistory(hist);
      setMaintenance(maint.items ?? []);
      setDocuments(docs.items ?? []);
      setInspections(insp.items ?? []);
      setDvirs((dvirRes.items ?? []).filter(isDvirRecord));
      setAssignName(str(vehicle.assignedDriverName));
      setMileage(vehicle.mileage != null ? String(vehicle.mileage) : "");
      setEngineHours(vehicle.engineHours != null ? String(vehicle.engineHours) : "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load asset");
      setAsset(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void load();
  }, [awsReady, load]);

  useEffect(() => {
    setPrintMounted(true);
  }, []);

  useEffect(() => {
    if (!autoPrint || loading || !asset || !me) return;
    const timer = window.setTimeout(() => printFleetReport(), 1000);
    return () => window.clearTimeout(timer);
  }, [autoPrint, loading, asset, me]);

  function printAssetReport() {
    printFleetReport();
  }

  function setField(key: string, value: unknown) {
    setAsset((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function saveAsset(e?: FormEvent) {
    e?.preventDefault();
    if (!canManage || !asset?.id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${String(asset.id)}`,
        "PATCH",
        {
          assetNumber: asset.assetNumber,
          assetType: asset.assetType,
          customAssetTypeLabel: asset.customAssetTypeLabel,
          year: asset.year === "" || asset.year == null ? null : Number(asset.year),
          make: asset.make,
          model: asset.model,
          trim: asset.trim,
          color: asset.color,
          vin: asset.vin,
          serialNumber: asset.serialNumber,
          licensePlate: asset.licensePlate,
          licenseState: asset.licenseState,
          renewalDate: asset.renewalDate || null,
          registrationRenewalMonth:
            asset.registrationRenewalMonth === "" || asset.registrationRenewalMonth == null
              ? null
              : Number(asset.registrationRenewalMonth),
          locationName: asset.locationName,
          countyAssessed: asset.countyAssessed,
          countyAssessmentStatus: asset.countyAssessmentStatus,
          countyAssessmentNotes: asset.countyAssessmentNotes,
          insured: asset.insured,
          insuranceStatus: asset.insuranceStatus,
          insuranceCompany: asset.insuranceCompany,
          insurancePolicyNumber: asset.insurancePolicyNumber,
          insurancePhone: asset.insurancePhone,
          insuranceAgentName: asset.insuranceAgentName,
          insuranceAgentPhone: asset.insuranceAgentPhone,
          insuranceAgentEmail: asset.insuranceAgentEmail,
          insuranceEffectiveDate: asset.insuranceEffectiveDate || null,
          insuranceExpirationDate: asset.insuranceExpirationDate || null,
          form2290Status: asset.form2290Status,
          form2290Notes: asset.form2290Notes,
          irpStatus: asset.irpStatus,
          irpNotes: asset.irpNotes,
          vehicleFringe: asset.vehicleFringe,
          notOnVehicleFringeSs: asset.notOnVehicleFringeSs,
          commuteUseStatus: asset.commuteUseStatus,
          commuteUseNotes: asset.commuteUseNotes,
          notes: asset.notes,
          status: asset.status,
          outOfService: asset.outOfService,
          outOfServiceReason: asset.outOfServiceReason,
          dotRegulated: Boolean(asset.dotRegulated),
        },
      );
      setAsset(updated);
      setNotice("Asset saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignDriver() {
    if (!canManage || !id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${id}/assign`,
        "POST",
        { driverName: assignName || null },
      );
      setAsset(updated);
      setNotice("DRIVER assignment updated.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveMileage() {
    if (!canManage || !id) return;
    setBusy(true);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${id}/mileage`,
        "POST",
        { mileage: mileage ? Number(mileage) : null },
      );
      setAsset(updated);
      setNotice("Mileage updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mileage update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEngineHours() {
    if (!canManage || !id) return;
    setBusy(true);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${id}/engine-hours`,
        "POST",
        { engineHours: engineHours ? Number(engineHours) : null },
      );
      setAsset(updated);
      setNotice("Engine hours updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Engine hours update failed");
    } finally {
      setBusy(false);
    }
  }

  async function addMaintenance(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !id) return;
    if (maintTitles.length === 0) {
      setError("Select one or more maintenance items.");
      return;
    }
    const jobs = maintTitles.map((titleKey) => {
      const selected = fleetMaintenanceItemByTitle(titleKey);
      const title =
        titleKey === "Other" ? maintCustomTitle.trim() : selected?.title || titleKey.trim();
      return {
        title,
        maintenanceType: selected?.maintenanceType ?? "OTHER",
      };
    });
    if (jobs.some((job) => !job.title)) {
      setError("Enter a custom title for Other, or remove it from the selection.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cost = maintCost.trim() ? Math.round(Number(maintCost) * 100) : null;
      const costCents = Number.isFinite(cost as number) ? cost : null;
      await Promise.all(
        jobs.map((job) =>
          apiSend("/api/v1/industrial/fleet/maintenance", "POST", {
            vehicleId: id,
            title: job.title,
            maintenanceType: job.maintenanceType,
            dueDate: maintDue || null,
            completedAt: maintDue
              ? new Date(`${maintDue}T12:00:00`).toISOString()
              : new Date().toISOString(),
            costCents,
            notes: maintNotes || null,
            status: "COMPLETED",
          }),
        ),
      );
      setMaintTitles([]);
      setMaintCustomTitle("");
      setMaintDue("");
      setMaintCost("");
      setMaintNotes("");
      setNotice(
        jobs.length === 1
          ? "Maintenance completed."
          : `${jobs.length} maintenance items completed.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add maintenance");
    } finally {
      setBusy(false);
    }
  }

  async function onDocPhotoFile(file: File | null, target: "compliance" | "other" = "compliance") {
    if (!file) return;
    if (target === "other") {
      setOtherDocPhotoBusy(true);
      setOtherDocPhotoError(null);
    } else {
      setDocPhotoBusy(true);
      setDocPhotoError(null);
    }
    try {
      const compressed = await compressFleetDocumentFile(file);
      if (target === "other") {
        setOtherDocPhoto(compressed);
        if (!otherDocTitle.trim()) {
          setOtherDocTitle(compressed.fileName.replace(/\.[^.]+$/, "").replaceAll("_", " "));
        }
      } else {
        setDocPhoto(compressed);
        if (!docTitle.trim()) {
          setDocTitle(compressed.fileName.replace(/\.[^.]+$/, "").replaceAll("_", " "));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to read that file.";
      if (target === "other") {
        setOtherDocPhoto(null);
        setOtherDocPhotoError(msg);
      } else {
        setDocPhoto(null);
        setDocPhotoError(msg);
      }
    } finally {
      if (target === "other") {
        setOtherDocPhotoBusy(false);
        if (otherCameraInputRef.current) otherCameraInputRef.current.value = "";
        if (otherUploadInputRef.current) otherUploadInputRef.current.value = "";
      } else {
        setDocPhotoBusy(false);
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        if (uploadInputRef.current) uploadInputRef.current.value = "";
      }
    }
  }

  function stopCamera() {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (otherVideoRef.current) otherVideoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  async function openCamera(target: "compliance" | "other" = "compliance") {
    if (target === "other") setOtherDocPhotoError(null);
    else setDocPhotoError(null);
    setCameraTarget(target);
    if (!navigator.mediaDevices?.getUserMedia) {
      if (target === "other") otherCameraInputRef.current?.click();
      else cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      if (target === "other") otherCameraInputRef.current?.click();
      else cameraInputRef.current?.click();
    }
  }

  useEffect(() => {
    if (!cameraOpen || !streamRef.current) return;
    const video = cameraTarget === "other" ? otherVideoRef.current : videoRef.current;
    if (!video) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => undefined);
  }, [cameraOpen, cameraTarget]);

  useEffect(() => {
    return () => {
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, []);

  function captureFromCamera() {
    const video = cameraTarget === "other" ? otherVideoRef.current : videoRef.current;
    const type = cameraTarget === "other" ? otherDocType : docType;
    const title = cameraTarget === "other" ? otherDocTitle : docTitle;
    if (!video || video.videoWidth < 1) {
      const msg = "Camera is not ready yet. Wait a moment and try again.";
      if (cameraTarget === "other") setOtherDocPhotoError(msg);
      else setDocPhotoError(msg);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const msg = "Unable to capture from camera.";
      if (cameraTarget === "other") setOtherDocPhotoError(msg);
      else setDocPhotoError(msg);
      return;
    }
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "");
    const photo = {
      dataUrl,
      contentType: "image/jpeg",
      fileName: `${type.toLowerCase()}-${stamp}.jpg`,
    };
    if (cameraTarget === "other") {
      setOtherDocPhoto(photo);
      if (!title.trim()) setOtherDocTitle(`${type.replaceAll("_", " ")} photo`);
    } else {
      setDocPhoto(photo);
      if (!title.trim()) setDocTitle(`${type.replaceAll("_", " ")} photo`);
    }
    stopCamera();
  }

  function openFleetDocument(docId: string, title: string, inlineDataUrl?: string) {
    setViewDoc(inlineDataUrl ? { id: docId, title, inlineDataUrl } : { id: docId, title });
  }

  async function addDocument(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !id) return;
    if (!docPhoto?.dataUrl) {
      setError("Add a photo or upload a file for this record.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await apiSend<Record<string, unknown>>(
        "/api/v1/industrial/fleet/documents",
        "POST",
        {
          vehicleId: id,
          title: docTitle || `${docType.replaceAll("_", " ")} record`,
          documentType: docType,
          notes: docNotes || null,
          dataUrl: docPhoto.dataUrl,
          contentType: docPhoto.contentType,
          fileName: docPhoto.fileName,
        },
      );
      setDocTitle("");
      setDocNotes("");
      setDocPhoto(null);
      setDocPhotoError(null);
      setNotice("Document photo saved.");
      const createdId = str(created.id);
      setDocuments((prev) => [created, ...prev.filter((row) => str(row.id) !== createdId)]);
    } catch (err) {
      setError(formatApiErrorMessage(err, "Could not add document"));
    } finally {
      setBusy(false);
    }
  }

  async function addOtherDocument(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !id) return;
    if (!otherDocPhoto?.dataUrl) {
      setError("Add a photo or upload a file for this record.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await apiSend<Record<string, unknown>>(
        "/api/v1/industrial/fleet/documents",
        "POST",
        {
          vehicleId: id,
          title: otherDocTitle || `${otherDocType.replaceAll("_", " ")} record`,
          documentType: otherDocType,
          notes: otherDocNotes || null,
          dataUrl: otherDocPhoto.dataUrl,
          contentType: otherDocPhoto.contentType,
          fileName: otherDocPhoto.fileName,
        },
      );
      setOtherDocTitle("");
      setOtherDocNotes("");
      setOtherDocPhoto(null);
      setOtherDocPhotoError(null);
      setNotice("Document photo saved.");
      const createdId = str(created.id);
      setDocuments((prev) => [created, ...prev.filter((row) => str(row.id) !== createdId)]);
    } catch (err) {
      setError(formatApiErrorMessage(err, "Could not add document"));
    } finally {
      setBusy(false);
    }
  }

  async function addInspection(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !id) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/v1/industrial/fleet/inspections", "POST", {
        vehicleId: id,
        title: inspTitle || "Fleet inspection",
        notes: inspNotes || null,
      });
      setInspTitle("");
      setInspNotes("");
      setNotice("Inspection added.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add inspection");
    } finally {
      setBusy(false);
    }
  }

  async function markOos() {
    if (!canManage || !id) return;
    setBusy(true);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${id}/out-of-service`,
        "POST",
        {
          outOfService: true,
          reason: str(asset?.outOfServiceReason) || "Marked OOS from asset page",
        },
      );
      setAsset(updated);
      setNotice("Asset marked out of service.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "OOS update failed");
    } finally {
      setBusy(false);
    }
  }

  async function disposeAsset() {
    if (!canManage || !id) return;
    if (!window.confirm("Mark this asset as removed / disposed?")) return;
    setBusy(true);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${id}/dispose`,
        "POST",
        { status: "REMOVED" },
      );
      setAsset(updated);
      setNotice("Asset marked removed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dispose failed");
    } finally {
      setBusy(false);
    }
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName="Fleet"
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  const assetPrintReport = asset ? (
    <div className="fleet-asset-workspace__print-only card" aria-hidden="true">
      <div className="card-body">
        <FleetPrintHeader
          title="Fleet asset report"
          subtitle={`${fleetAssetLabel(asset)} · Printed ${new Date().toLocaleString()}`}
        />

        <h3 className="h6 text-uppercase text-muted">Identity</h3>
        <ReportLine label="Asset #" value={asset.assetNumber} />
        <ReportLine label="Type" value={asset.customAssetTypeLabel || asset.assetType} />
        <ReportLine
          label="Vehicle"
          value={[asset.year, asset.make, asset.model, asset.trim].filter(Boolean).join(" ")}
        />
        <ReportLine label="Color" value={asset.color} />
        <ReportLine label="VIN" value={asset.vin} />
        <ReportLine label="Serial #" value={asset.serialNumber} />
        <ReportLine label="Status" value={asset.status} />
        <ReportLine label="Location" value={asset.locationName} />
        <ReportLine label="Notes" value={asset.notes} />

        <h3 className="h6 text-uppercase text-muted mt-3">Registration</h3>
        <ReportLine
          label="Plate"
          value={[asset.licensePlate, asset.licenseState].filter(Boolean).join(" / ") || null}
        />
        <ReportLine label="Renewal date" value={asset.renewalDate} />
        <ReportLine label="Renewal month" value={asset.registrationRenewalMonth} />

        <h3 className="h6 text-uppercase text-muted mt-3">Insurance &amp; compliance</h3>
        <ReportLine
          label="Insured"
          value={asset.insured === true ? "Yes" : asset.insured === false ? "No" : null}
        />
        <ReportLine label="Insurance status" value={asset.insuranceStatus} />
        <ReportLine label="Insurance company" value={asset.insuranceCompany} />
        <ReportLine label="Policy #" value={asset.insurancePolicyNumber} />
        <ReportLine label="Company phone" value={asset.insurancePhone} />
        <ReportLine label="Effective" value={asset.insuranceEffectiveDate} />
        <ReportLine label="Expiration" value={asset.insuranceExpirationDate} />
        <ReportLine label="Agent" value={asset.insuranceAgentName} />
        <ReportLine label="Agent phone" value={asset.insuranceAgentPhone} />
        <ReportLine label="Agent email" value={asset.insuranceAgentEmail} />
        <ReportLine label="Form 2290" value={asset.form2290Status} />
        <ReportLine label="2290 notes" value={asset.form2290Notes} />
        <ReportLine label="IRP" value={asset.irpStatus} />
        <ReportLine label="IRP notes" value={asset.irpNotes} />
        <ReportLine label="County assessed" value={asset.countyAssessed} />
        <ReportLine label="County status" value={asset.countyAssessmentStatus} />
        <ReportLine label="Commute use" value={asset.commuteUseStatus} />

        <h3 className="h6 text-uppercase text-muted mt-3">Assignment &amp; usage</h3>
        <ReportLine label="Assigned DRIVER" value={asset.assignedDriverName} />
        <ReportLine label="Mileage" value={asset.mileage} />
        <ReportLine label="Engine hours" value={asset.engineHours} />
        <ReportLine
          label="Out of service"
          value={asset.outOfService ? asset.outOfServiceReason || "Yes" : null}
        />
        <ReportLine
          label="DOT regulated"
          value={asset.dotRegulated ? "Yes — DVIR required" : "No — DVIR not required"}
        />

        <h3 className="h6 text-uppercase text-muted mt-3">DVIR inspections (DOT)</h3>
        {asset.dotRegulated ? (
          <DvirReportSummaryTable rows={dvirs} compact />
        ) : (
          <p className="mb-0">Not required for this non-DOT-regulated asset.</p>
        )}

        <h3 className="h6 text-uppercase text-muted mt-3">Recent maintenance</h3>
        {maintenance.length === 0 ? (
          <p className="mb-0">None on file.</p>
        ) : (
          <ul className="mb-0">
            {maintenance.slice(0, 12).map((row) => (
              <li key={str(row.id)}>
                {str(row.title)}
                {row.completedAt
                  ? ` — completed ${new Date(String(row.completedAt)).toLocaleDateString()}`
                  : ` — ${str(row.status)}`}
                {row.costCents != null ? ` — $${(Number(row.costCents) / 100).toFixed(2)}` : ""}
              </li>
            ))}
          </ul>
        )}

        <h3 className="h6 text-uppercase text-muted mt-3">Inspections</h3>
        {inspections.length === 0 ? (
          <p className="mb-0">None on file.</p>
        ) : (
          <ul className="mb-0">
            {inspections.slice(0, 12).map((row) => (
              <li key={str(row.id)}>
                {str(row.title)}
                {row.notes ? ` — ${str(row.notes)}` : ""}
              </li>
            ))}
          </ul>
        )}

        <h3 className="h6 text-uppercase text-muted mt-3">Documents on file</h3>
        {documents.length === 0 ? (
          <p className="mb-0">None on file.</p>
        ) : (
          <ul className="mb-0">
            {documents.slice(0, 12).map((row) => (
              <li key={str(row.id)}>
                {str(row.documentType).replaceAll("_", " ")}: {str(row.title)}
              </li>
            ))}
          </ul>
        )}

        {history ? (
          <>
            <h3 className="h6 text-uppercase text-muted mt-3">History snapshot</h3>
            <ReportLine label="Events" value={(history as { events?: unknown[] }).events?.length} />
          </>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      {viewDoc ? (
        <FleetDocumentViewer
          docId={viewDoc.id}
          title={viewDoc.title}
          {...(viewDoc.inlineDataUrl ? { inlineDataUrl: viewDoc.inlineDataUrl } : {})}
          onClose={() => setViewDoc(null)}
        />
      ) : null}
      <section aria-labelledby="fleet-asset-title" className="fleet-asset-workspace">
        <ModuleWorkspaceHeader
          id="fleet-asset-title"
          eyebrow="Fleet asset"
          title={fleetAssetLabel(asset)}
          description="Full edit for identity, registration, insurance, maintenance, and related records."
          onRefresh={() => void load()}
          refreshing={loading}
        />

        <div className="mb-3 d-flex flex-wrap gap-2 fleet-asset-workspace__actions">
          <Link href={fleetListHref("assets")} className="btn btn-sm btn-outline-secondary">
            Back to assets
          </Link>
          {asset ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={loading}
              onClick={() => printAssetReport()}
            >
              <i className="bx bx-printer me-1" aria-hidden />
              Print report
            </button>
          ) : null}
          {canPrintLabel && asset ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={loading || printQrBusy}
              onClick={() => {
                void (async () => {
                  setPrintQrBusy(true);
                  setError(null);
                  try {
                    const qr = await ensureFleetDvirPrintQrPayload(asset);
                    setPrintQrPayload(qr ?? null);
                    setPrintLabelOpen(true);
                  } catch (e) {
                    setError(formatApiErrorMessage(e, "Could not prepare label QR for print"));
                  } finally {
                    setPrintQrBusy(false);
                  }
                })();
              }}
            >
              {printQrBusy ? "Preparing label…" : "Print Label"}
            </button>
          ) : null}
          {canManage && asset ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() => void saveAsset()}
              >
                Save asset
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-warning"
                disabled={busy}
                onClick={() => void disposeAsset()}
              >
                Mark removed
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={busy}
                onClick={() => void markOos()}
              >
                Out of service
              </button>
            </>
          ) : null}
        </div>

        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="alert alert-success" role="status">
            {notice}
          </div>
        ) : null}

        {loading && !asset ? (
          <p className="text-muted">Loading asset…</p>
        ) : asset ? (
          <>
            <form className="card mb-4" onSubmit={(e) => void saveAsset(e)}>
              <div className="card-header">
                <h6 className="card-title mb-0">Identity &amp; status</h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <Field id="fa-asset-number" label="Asset #">
                    <input
                      id="fa-asset-number"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.assetNumber)}
                      onChange={(e) => setField("assetNumber", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-asset-type" label="Asset type">
                    <select
                      id="fa-asset-type"
                      className="form-select"
                      disabled={!canManage}
                      value={str(asset.assetType) || "FLEET_VEHICLE"}
                      onChange={(e) => setField("assetType", e.target.value)}
                    >
                      {FLEET_ASSET_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="fa-status" label="Status">
                    <select
                      id="fa-status"
                      className="form-select"
                      disabled={!canManage}
                      value={str(asset.status) || "ACTIVE"}
                      onChange={(e) => setField("status", e.target.value)}
                    >
                      {FLEET_ASSET_STATUS_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="fa-year" label="Year">
                    <input
                      id="fa-year"
                      className="form-control"
                      disabled={!canManage}
                      value={asset.year == null ? "" : String(asset.year)}
                      onChange={(e) => setField("year", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-make" label="Make">
                    <input
                      id="fa-make"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.make)}
                      onChange={(e) => setField("make", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-model" label="Model">
                    <input
                      id="fa-model"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.model)}
                      onChange={(e) => setField("model", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-trim" label="Trim">
                    <input
                      id="fa-trim"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.trim)}
                      onChange={(e) => setField("trim", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-color" label="Color">
                    <input
                      id="fa-color"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.color)}
                      onChange={(e) => setField("color", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-vin" label="VIN">
                    <input
                      id="fa-vin"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.vin)}
                      onChange={(e) => setField("vin", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-serial" label="Serial #">
                    <input
                      id="fa-serial"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.serialNumber)}
                      onChange={(e) => setField("serialNumber", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-location" label="Location">
                    <input
                      id="fa-location"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.locationName)}
                      onChange={(e) => setField("locationName", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-notes" label="Notes" className="col-12">
                    <textarea
                      id="fa-notes"
                      className="form-control"
                      rows={2}
                      disabled={!canManage}
                      value={str(asset.notes)}
                      onChange={(e) => setField("notes", e.target.value)}
                    />
                  </Field>
                </div>
                {canManage ? (
                  <button type="submit" className="btn btn-primary mt-3" disabled={busy}>
                    Save identity
                  </button>
                ) : null}
              </div>
            </form>

            <form className="card mb-4" onSubmit={(e) => void saveAsset(e)}>
              <div className="card-header">
                <h6 className="card-title mb-0">Registration</h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <Field id="fa-plate" label="License plate">
                    <input
                      id="fa-plate"
                      className="form-control"
                      disabled={!canManage}
                      value={str(asset.licensePlate)}
                      onChange={(e) => setField("licensePlate", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-state" label="License state">
                    <select
                      id="fa-state"
                      className="form-select"
                      disabled={!canManage}
                      value={normalizeUsStateCode(str(asset.licenseState))}
                      onChange={(e) => setField("licenseState", e.target.value || null)}
                    >
                      <option value="">Select state</option>
                      {US_STATES.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.code} — {state.name}
                        </option>
                      ))}
                      {(() => {
                        const current = normalizeUsStateCode(str(asset.licenseState));
                        if (!current || US_STATES.some((s) => s.code === current)) return null;
                        return <option value={current}>{current} (current)</option>;
                      })()}
                    </select>
                  </Field>
                  <Field id="fa-renewal-month" label="Renewal month (1–12)">
                    <input
                      id="fa-renewal-month"
                      className="form-control"
                      type="number"
                      min={1}
                      max={12}
                      disabled={!canManage}
                      value={
                        asset.registrationRenewalMonth == null
                          ? ""
                          : String(asset.registrationRenewalMonth)
                      }
                      onChange={(e) => setField("registrationRenewalMonth", e.target.value)}
                    />
                  </Field>
                  <Field id="fa-renewal-date" label="Renewal date">
                    <input
                      id="fa-renewal-date"
                      className="form-control"
                      type="date"
                      disabled={!canManage}
                      value={str(asset.renewalDate).slice(0, 10)}
                      onChange={(e) => setField("renewalDate", e.target.value)}
                    />
                  </Field>
                </div>
                {canManage ? (
                  <button type="submit" className="btn btn-primary mt-3" disabled={busy}>
                    Save registration
                  </button>
                ) : null}
              </div>
            </form>

            <div className="card mb-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Insurance &amp; compliance</h6>
              </div>
              <form onSubmit={(e) => void saveAsset(e)}>
                <div className="card-body">
                  <h6 className="text-muted text-uppercase small mb-3">Coverage</h6>
                  <div className="row g-3 mb-4">
                    <Field id="fa-insured" label="Insured">
                      <select
                        id="fa-insured"
                        className="form-select"
                        disabled={!canManage}
                        value={asFleetBoolSelect(asset.insured)}
                        onChange={(e) =>
                          setField(
                            "insured",
                            e.target.value === "" ? null : e.target.value === "true",
                          )
                        }
                      >
                        <option value="">Unknown</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </Field>
                    <Field id="fa-ins-status" label="Insurance status">
                      <select
                        id="fa-ins-status"
                        className="form-select"
                        disabled={!canManage}
                        value={str(asset.insuranceStatus) || "UNKNOWN"}
                        onChange={(e) => setField("insuranceStatus", e.target.value)}
                      >
                        {FLEET_INSURANCE_STATUS_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="fa-ins-company" label="Insurance company">
                      <input
                        id="fa-ins-company"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insuranceCompany)}
                        onChange={(e) => setField("insuranceCompany", e.target.value)}
                        placeholder="Carrier / company name"
                      />
                    </Field>
                    <Field id="fa-ins-policy" label="Policy number">
                      <input
                        id="fa-ins-policy"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insurancePolicyNumber)}
                        onChange={(e) => setField("insurancePolicyNumber", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-ins-phone" label="Company phone">
                      <input
                        id="fa-ins-phone"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insurancePhone)}
                        onChange={(e) => setField("insurancePhone", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-ins-effective" label="Effective date">
                      <input
                        id="fa-ins-effective"
                        type="date"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insuranceEffectiveDate).slice(0, 10)}
                        onChange={(e) => setField("insuranceEffectiveDate", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-ins-expiration" label="Expiration date">
                      <input
                        id="fa-ins-expiration"
                        type="date"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insuranceExpirationDate).slice(0, 10)}
                        onChange={(e) => setField("insuranceExpirationDate", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-ins-agent" label="Agent name">
                      <input
                        id="fa-ins-agent"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insuranceAgentName)}
                        onChange={(e) => setField("insuranceAgentName", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-ins-agent-phone" label="Agent phone">
                      <input
                        id="fa-ins-agent-phone"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insuranceAgentPhone)}
                        onChange={(e) => setField("insuranceAgentPhone", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-ins-agent-email" label="Agent email">
                      <input
                        id="fa-ins-agent-email"
                        type="email"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.insuranceAgentEmail)}
                        onChange={(e) => setField("insuranceAgentEmail", e.target.value)}
                      />
                    </Field>
                  </div>

                  <h6 className="text-muted text-uppercase small mb-3">Compliance</h6>
                  <div className="row g-3 mb-4">
                    <div className="col-12">
                      <div className="form-check">
                        <input
                          id="fa-dot-regulated"
                          className="form-check-input"
                          type="checkbox"
                          disabled={!canManage}
                          checked={Boolean(asset.dotRegulated)}
                          onChange={(e) => setField("dotRegulated", e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="fa-dot-regulated">
                          DOT regulated — requires DVIR to operate
                        </label>
                      </div>
                      <p className="form-text mb-0">
                        Leave unchecked for regular non-commercial assets that do not need a DVIR.
                      </p>
                    </div>
                    <Field id="fa-2290" label="Form 2290">
                      <select
                        id="fa-2290"
                        className="form-select"
                        disabled={!canManage}
                        value={str(asset.form2290Status) || "UNKNOWN"}
                        onChange={(e) => setField("form2290Status", e.target.value)}
                      >
                        {FLEET_COMPLIANCE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="fa-2290-notes" label="2290 notes">
                      <input
                        id="fa-2290-notes"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.form2290Notes)}
                        onChange={(e) => setField("form2290Notes", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-irp" label="IRP">
                      <select
                        id="fa-irp"
                        className="form-select"
                        disabled={!canManage}
                        value={str(asset.irpStatus) || "UNKNOWN"}
                        onChange={(e) => setField("irpStatus", e.target.value)}
                      >
                        {FLEET_COMPLIANCE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="fa-irp-notes" label="IRP notes">
                      <input
                        id="fa-irp-notes"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.irpNotes)}
                        onChange={(e) => setField("irpNotes", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-county" label="County assessed">
                      <input
                        id="fa-county"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.countyAssessed)}
                        onChange={(e) => setField("countyAssessed", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-county-status" label="County status">
                      <select
                        id="fa-county-status"
                        className="form-select"
                        disabled={!canManage}
                        value={str(asset.countyAssessmentStatus) || "UNKNOWN"}
                        onChange={(e) => setField("countyAssessmentStatus", e.target.value)}
                      >
                        {FLEET_COUNTY_STATUS_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="fa-county-notes" label="County notes">
                      <input
                        id="fa-county-notes"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.countyAssessmentNotes)}
                        onChange={(e) => setField("countyAssessmentNotes", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-commute" label="Commute use">
                      <select
                        id="fa-commute"
                        className="form-select"
                        disabled={!canManage}
                        value={str(asset.commuteUseStatus) || "UNKNOWN"}
                        onChange={(e) => setField("commuteUseStatus", e.target.value)}
                      >
                        {FLEET_COMMUTE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="fa-commute-notes" label="Commute notes">
                      <input
                        id="fa-commute-notes"
                        className="form-control"
                        disabled={!canManage}
                        value={str(asset.commuteUseNotes)}
                        onChange={(e) => setField("commuteUseNotes", e.target.value)}
                      />
                    </Field>
                    <Field id="fa-fringe" label="Fringe SS excluded">
                      <select
                        id="fa-fringe"
                        className="form-select"
                        disabled={!canManage}
                        value={asFleetBoolSelect(asset.notOnVehicleFringeSs)}
                        onChange={(e) =>
                          setField(
                            "notOnVehicleFringeSs",
                            e.target.value === "" ? null : e.target.value === "true",
                          )
                        }
                      >
                        <option value="">Unknown</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </Field>
                  </div>
                  {canManage ? (
                    <button type="submit" className="btn btn-primary mb-4" disabled={busy}>
                      Save insurance &amp; compliance
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="card-body border-top pt-4">
                <h6 className="text-muted text-uppercase small mb-3">
                  Insurance / registration photos
                </h6>
                {canManage ? (
                  <form className="row g-3 mb-4" onSubmit={(e) => void addDocument(e)}>
                    <Field id="fa-doc-type" label="Record type" className="col-md-3">
                      <select
                        id="fa-doc-type"
                        className="form-select"
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                      >
                        {FLEET_COMPLIANCE_DOCUMENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="fa-doc-title" label="Title" className="col-md-4">
                      <input
                        id="fa-doc-title"
                        className="form-control"
                        required
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="Policy #, sticker #, card…"
                      />
                    </Field>
                    <Field id="fa-doc-notes" label="Notes / details" className="col-md-5">
                      <input
                        id="fa-doc-notes"
                        className="form-control"
                        value={docNotes}
                        onChange={(e) => setDocNotes(e.target.value)}
                        placeholder="Carrier, effective/expiry, plate sticker…"
                      />
                    </Field>
                    <Field id="fa-doc-photo" label="Photo" className="col-md-8">
                      <input
                        ref={cameraInputRef}
                        id="fa-doc-photo-camera"
                        type="file"
                        className="d-none"
                        accept="image/*"
                        capture="environment"
                        disabled={busy || docPhotoBusy}
                        onChange={(ev) =>
                          void onDocPhotoFile(ev.target.files?.[0] ?? null, "compliance")
                        }
                      />
                      <input
                        ref={uploadInputRef}
                        id="fa-doc-photo-upload"
                        type="file"
                        className="d-none"
                        accept="image/*,application/pdf,.pdf"
                        disabled={busy || docPhotoBusy}
                        onChange={(ev) =>
                          void onDocPhotoFile(ev.target.files?.[0] ?? null, "compliance")
                        }
                      />
                      <div className="d-flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || docPhotoBusy}
                          onClick={() => void openCamera("compliance")}
                        >
                          <i className="bx bx-camera me-1" aria-hidden />
                          Take photo
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          disabled={busy || docPhotoBusy}
                          onClick={() => uploadInputRef.current?.click()}
                        >
                          <i className="bx bx-upload me-1" aria-hidden />
                          Upload file
                        </button>
                      </div>
                      <div className="form-text">
                        Capture insurance cards, policies, registration, or title photos for this
                        asset.
                      </div>
                      {docPhotoBusy ? (
                        <div className="form-text" role="status">
                          Compressing…
                        </div>
                      ) : null}
                      {docPhotoError ? (
                        <div className="text-danger small mt-1">{docPhotoError}</div>
                      ) : null}
                      {cameraOpen && cameraTarget === "compliance" ? (
                        <div className="border rounded p-3 mt-3 bg-label-secondary">
                          <video
                            ref={videoRef}
                            className="w-100 rounded border bg-black"
                            style={{ maxHeight: 320, objectFit: "cover" }}
                            playsInline
                            muted
                            autoPlay
                          />
                          <div className="d-flex flex-wrap gap-2 mt-3">
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => captureFromCamera()}
                            >
                              Capture
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => stopCamera()}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </Field>
                    <div className="col-md-4">
                      {docPhoto?.dataUrl?.startsWith("data:image/") ? (
                        <img
                          src={docPhoto.dataUrl}
                          alt="Document preview"
                          className="img-fluid border rounded"
                          style={{ maxHeight: 160 }}
                        />
                      ) : docPhoto ? (
                        <p className="small text-muted mb-0 mt-4">
                          Ready: {docPhoto.fileName} ({docPhoto.contentType})
                        </p>
                      ) : (
                        <p className="small text-muted mb-0 mt-4">No photo selected yet.</p>
                      )}
                      {docPhoto ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary mt-2"
                          onClick={() => setDocPhoto(null)}
                        >
                          Clear photo
                        </button>
                      ) : null}
                    </div>
                    <div className="col-12">
                      <button
                        type="submit"
                        className="btn btn-outline-primary"
                        disabled={busy || docPhotoBusy || !docPhoto}
                      >
                        Save record with photo
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Photo</th>
                        <th>Type</th>
                        <th>Title</th>
                        <th>Notes</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.filter((row) =>
                        (FLEET_COMPLIANCE_DOCUMENT_TYPES as readonly string[]).includes(
                          str(row.documentType),
                        ),
                      ).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted">
                            No insurance or registration photos yet.
                          </td>
                        </tr>
                      ) : (
                        documents
                          .filter((row) =>
                            (FLEET_COMPLIANCE_DOCUMENT_TYPES as readonly string[]).includes(
                              str(row.documentType),
                            ),
                          )
                          .map((row) => (
                            <tr key={str(row.id)}>
                              <td>
                                <FleetDocumentPhotoCell
                                  row={row}
                                  onView={(docId, inlineDataUrl) =>
                                    openFleetDocument(docId, str(row.title), inlineDataUrl)
                                  }
                                />
                              </td>
                              <td>{str(row.documentType).replaceAll("_", " ")}</td>
                              <td>{str(row.title)}</td>
                              <td>{str(row.notes) || "—"}</td>
                              <td>
                                {row.updatedAt
                                  ? new Date(String(row.updatedAt)).toLocaleDateString()
                                  : "—"}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Assignment &amp; usage</h6>
              </div>
              <div className="card-body">
                <div className="row g-3 align-items-end">
                  <Field id="fa-driver" label="Assigned DRIVER" className="col-md-5">
                    <input
                      id="fa-driver"
                      className="form-control"
                      disabled={!canManage}
                      value={assignName}
                      onChange={(e) => setAssignName(e.target.value)}
                    />
                  </Field>
                  {canManage ? (
                    <div className="col-md-auto">
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={busy}
                        onClick={() => void assignDriver()}
                      >
                        Assign
                      </button>
                    </div>
                  ) : null}
                  <Field id="fa-mileage" label="Mileage" className="col-md-3">
                    <input
                      id="fa-mileage"
                      className="form-control"
                      disabled={!canManage}
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                    />
                  </Field>
                  {canManage ? (
                    <div className="col-md-auto">
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={busy}
                        onClick={() => void saveMileage()}
                      >
                        Update mileage
                      </button>
                    </div>
                  ) : null}
                  <Field id="fa-hours" label="Engine hours" className="col-md-3">
                    <input
                      id="fa-hours"
                      className="form-control"
                      disabled={!canManage}
                      value={engineHours}
                      onChange={(e) => setEngineHours(e.target.value)}
                    />
                  </Field>
                  {canManage ? (
                    <div className="col-md-auto">
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={busy}
                        onClick={() => void saveEngineHours()}
                      >
                        Update hours
                      </button>
                    </div>
                  ) : null}
                </div>
                {history ? (
                  <p className="small text-muted mb-0 mt-3">
                    History — assignments:{" "}
                    {Array.isArray(history.assignments) ? history.assignments.length : 0} · mileage:{" "}
                    {Array.isArray(history.mileage) ? history.mileage.length : 0} · engine hours:{" "}
                    {Array.isArray(history.engineHours) ? history.engineHours.length : 0}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Maintenance</h6>
              </div>
              <div className="card-body">
                {canManage ? (
                  <form className="row g-3 mb-4" onSubmit={(e) => void addMaintenance(e)}>
                    <Field id="fa-maint-item" label="Maintenance items" className="col-md-5">
                      <div
                        id="fa-maint-item"
                        className="border rounded p-2"
                        style={{ maxHeight: 220, overflowY: "auto" }}
                      >
                        {FLEET_COMMON_MAINTENANCE_ITEMS.map((item) => {
                          const checked = maintTitles.includes(item.title);
                          return (
                            <label
                              key={item.title}
                              className="d-flex align-items-start gap-2 py-1 mb-0"
                              style={{ cursor: "pointer" }}
                            >
                              <input
                                type="checkbox"
                                className="form-check-input mt-1"
                                checked={checked}
                                onChange={() =>
                                  setMaintTitles((prev) =>
                                    checked
                                      ? prev.filter((title) => title !== item.title)
                                      : [...prev, item.title],
                                  )
                                }
                              />
                              <span>{item.title}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="form-text">
                        Click to select or deselect.
                        {maintTitles.length > 0 ? ` ${maintTitles.length} selected.` : ""}
                      </div>
                    </Field>
                    {maintTitles.includes("Other") ? (
                      <Field id="fa-maint-custom" label="Custom title" className="col-md-4">
                        <input
                          id="fa-maint-custom"
                          className="form-control"
                          required
                          value={maintCustomTitle}
                          onChange={(e) => setMaintCustomTitle(e.target.value)}
                          placeholder="Describe the work…"
                        />
                      </Field>
                    ) : null}
                    <Field id="fa-maint-due" label="Completed date" className="col-md-2">
                      <input
                        id="fa-maint-due"
                        type="date"
                        className="form-control"
                        value={maintDue}
                        onChange={(e) => setMaintDue(e.target.value)}
                      />
                    </Field>
                    <Field id="fa-maint-cost" label="Cost ($)" className="col-md-2">
                      <input
                        id="fa-maint-cost"
                        className="form-control"
                        value={maintCost}
                        onChange={(e) => setMaintCost(e.target.value)}
                        placeholder="0.00"
                      />
                    </Field>
                    <Field id="fa-maint-notes" label="Notes" className="col-md-8">
                      <input
                        id="fa-maint-notes"
                        className="form-control"
                        value={maintNotes}
                        onChange={(e) => setMaintNotes(e.target.value)}
                      />
                    </Field>
                    <div className="col-md-auto align-self-end">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={busy || maintTitles.length === 0}
                      >
                        Complete maintenance
                        {maintTitles.length > 1 ? ` (${maintTitles.length})` : ""}
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Completed</th>
                        <th>Status</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenance.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted">
                            No maintenance records for this asset yet.
                          </td>
                        </tr>
                      ) : (
                        maintenance.map((row) => (
                          <tr key={str(row.id)}>
                            <td>{str(row.title)}</td>
                            <td>{str(row.maintenanceType)}</td>
                            <td>
                              {row.completedAt
                                ? new Date(String(row.completedAt)).toLocaleDateString()
                                : str(row.dueDate) || "—"}
                            </td>
                            <td>{str(row.status)}</td>
                            <td>
                              {row.costCents != null
                                ? `$${(Number(row.costCents) / 100).toFixed(2)}`
                                : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Maintenance Documents / Other</h6>
              </div>
              <div className="card-body">
                {canManage ? (
                  <form className="row g-3 mb-4" onSubmit={(e) => void addOtherDocument(e)}>
                    <Field id="fa-other-doc-type" label="Record type" className="col-md-3">
                      <select
                        id="fa-other-doc-type"
                        className="form-select"
                        value={otherDocType}
                        onChange={(e) => setOtherDocType(e.target.value)}
                      >
                        {FLEET_OTHER_DOCUMENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="fa-other-doc-title" label="Title" className="col-md-4">
                      <input
                        id="fa-other-doc-title"
                        className="form-control"
                        required
                        value={otherDocTitle}
                        onChange={(e) => setOtherDocTitle(e.target.value)}
                        placeholder="Invoice, work order, receipt…"
                      />
                    </Field>
                    <Field id="fa-other-doc-notes" label="Notes / details" className="col-md-5">
                      <input
                        id="fa-other-doc-notes"
                        className="form-control"
                        value={otherDocNotes}
                        onChange={(e) => setOtherDocNotes(e.target.value)}
                      />
                    </Field>
                    <Field id="fa-other-doc-photo" label="Photo" className="col-md-8">
                      <input
                        ref={otherCameraInputRef}
                        id="fa-other-doc-photo-camera"
                        type="file"
                        className="d-none"
                        accept="image/*"
                        capture="environment"
                        disabled={busy || otherDocPhotoBusy}
                        onChange={(ev) =>
                          void onDocPhotoFile(ev.target.files?.[0] ?? null, "other")
                        }
                      />
                      <input
                        ref={otherUploadInputRef}
                        id="fa-other-doc-photo-upload"
                        type="file"
                        className="d-none"
                        accept="image/*,application/pdf,.pdf"
                        disabled={busy || otherDocPhotoBusy}
                        onChange={(ev) =>
                          void onDocPhotoFile(ev.target.files?.[0] ?? null, "other")
                        }
                      />
                      <div className="d-flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || otherDocPhotoBusy}
                          onClick={() => void openCamera("other")}
                        >
                          <i className="bx bx-camera me-1" aria-hidden />
                          Take photo
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          disabled={busy || otherDocPhotoBusy}
                          onClick={() => otherUploadInputRef.current?.click()}
                        >
                          <i className="bx bx-upload me-1" aria-hidden />
                          Upload file
                        </button>
                      </div>
                      {otherDocPhotoBusy ? (
                        <div className="form-text" role="status">
                          Compressing…
                        </div>
                      ) : null}
                      {otherDocPhotoError ? (
                        <div className="text-danger small mt-1">{otherDocPhotoError}</div>
                      ) : null}
                      {cameraOpen && cameraTarget === "other" ? (
                        <div className="border rounded p-3 mt-3 bg-label-secondary">
                          <video
                            ref={otherVideoRef}
                            className="w-100 rounded border bg-black"
                            style={{ maxHeight: 320, objectFit: "cover" }}
                            playsInline
                            muted
                            autoPlay
                          />
                          <div className="d-flex flex-wrap gap-2 mt-3">
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => captureFromCamera()}
                            >
                              Capture
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => stopCamera()}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </Field>
                    <div className="col-md-4">
                      {otherDocPhoto?.dataUrl?.startsWith("data:image/") ? (
                        <img
                          src={otherDocPhoto.dataUrl}
                          alt="Document preview"
                          className="img-fluid border rounded"
                          style={{ maxHeight: 160 }}
                        />
                      ) : otherDocPhoto ? (
                        <p className="small text-muted mb-0 mt-4">
                          Ready: {otherDocPhoto.fileName} ({otherDocPhoto.contentType})
                        </p>
                      ) : (
                        <p className="small text-muted mb-0 mt-4">No photo selected yet.</p>
                      )}
                      {otherDocPhoto ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary mt-2"
                          onClick={() => setOtherDocPhoto(null)}
                        >
                          Clear photo
                        </button>
                      ) : null}
                    </div>
                    <div className="col-12">
                      <button
                        type="submit"
                        className="btn btn-outline-primary"
                        disabled={busy || otherDocPhotoBusy || !otherDocPhoto}
                      >
                        Save record with photo
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Photo</th>
                        <th>Type</th>
                        <th>Title</th>
                        <th>Notes</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.filter((row) =>
                        (FLEET_OTHER_DOCUMENT_TYPES as readonly string[]).includes(
                          str(row.documentType),
                        ),
                      ).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted">
                            No maintenance or other documents yet.
                          </td>
                        </tr>
                      ) : (
                        documents
                          .filter((row) =>
                            (FLEET_OTHER_DOCUMENT_TYPES as readonly string[]).includes(
                              str(row.documentType),
                            ),
                          )
                          .map((row) => (
                            <tr key={str(row.id)}>
                              <td>
                                <FleetDocumentPhotoCell
                                  row={row}
                                  onView={(docId, inlineDataUrl) =>
                                    openFleetDocument(docId, str(row.title), inlineDataUrl)
                                  }
                                />
                              </td>
                              <td>{str(row.documentType).replaceAll("_", " ")}</td>
                              <td>{str(row.title)}</td>
                              <td>{str(row.notes) || "—"}</td>
                              <td>
                                {row.updatedAt
                                  ? new Date(String(row.updatedAt)).toLocaleDateString()
                                  : "—"}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <FleetAssetDvirPanel
              vehicleId={id}
              hasDvirQr={Boolean(asset.hasDvirQr)}
              canManageQr={canManageDvirQr}
              canManageDvir={canManageDvirQr}
              dotRegulated={Boolean(asset.dotRegulated)}
            />

            <div className="card mb-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Inspections</h6>
              </div>
              <div className="card-body">
                {canManage ? (
                  <form className="row g-3 mb-4" onSubmit={(e) => void addInspection(e)}>
                    <Field id="fa-insp-title" label="Title" className="col-md-5">
                      <input
                        id="fa-insp-title"
                        className="form-control"
                        required
                        value={inspTitle}
                        onChange={(e) => setInspTitle(e.target.value)}
                      />
                    </Field>
                    <Field id="fa-insp-notes" label="Notes" className="col-md-5">
                      <input
                        id="fa-insp-notes"
                        className="form-control"
                        value={inspNotes}
                        onChange={(e) => setInspNotes(e.target.value)}
                      />
                    </Field>
                    <div className="col-md-auto align-self-end">
                      <button type="submit" className="btn btn-outline-primary" disabled={busy}>
                        Add inspection
                      </button>
                    </div>
                  </form>
                ) : null}
                <ul className="list-unstyled mb-0">
                  {inspections.length === 0 ? (
                    <li className="text-muted">No inspections for this asset yet.</li>
                  ) : (
                    inspections.map((row) => (
                      <li key={str(row.id)} className="mb-2">
                        <strong>{str(row.title)}</strong>
                        <span className="text-muted"> · {str(row.status)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </>
        ) : null}
        {printMounted && assetPrintReport}
      </section>

      <ForgePrintDialog
        open={printLabelOpen && asset != null}
        onClose={() => {
          setPrintLabelOpen(false);
          setPrintQrPayload(null);
        }}
        module="FLEET"
        recordType="fleet_vehicle"
        {...(asset?.id ? { recordId: String(asset.id) } : {})}
        defaultTitle="PRINT LABEL"
        fieldValues={
          asset
            ? fleetAssetPrintFieldValues(asset, {
                ...(printQrPayload ? { qrPayload: printQrPayload } : {}),
              })
            : {}
        }
      />
    </>
  );
}

export function FleetAssetWorkspace() {
  return (
    <Suspense fallback={<p className="text-muted p-3">Loading asset…</p>}>
      <FleetAssetInner />
    </Suspense>
  );
}
