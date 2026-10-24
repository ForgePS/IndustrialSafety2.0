"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ForgePrintDialog } from "@/components/forge-print-dialog";

type SiteOption = { id: string; label: string };
type LocationOption = { id: string; code: string; name: string; siteId?: string | null };

type Station = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  siteId?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  scanCount: number;
  requestCount: number;
  lastScannedAt?: string | null;
  publicUrl?: string | null;
  publicToken?: string | null;
  config: {
    allowAnonymous: boolean;
    requireEmployeeId: boolean;
    allowContractors: boolean;
    allowCustomItems: boolean;
    allowUrgent: boolean;
    allowNotes: boolean;
    catalogMode: string;
    inventoryVisibility: string;
    allowOutOfStockRequests: boolean;
  };
};

type Props = {
  sites: SiteOption[];
  locations: LocationOption[];
  canManage: boolean;
  /** Show Forge / Brady label print even without QR-station manage rights. */
  canPrintLabel?: boolean;
};

export function SafetySupplyQrStationsPanel({
  sites,
  locations,
  canManage,
  canPrintLabel = false,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [posterSize, setPosterSize] = useState<"letter" | "half" | "qr">("letter");
  const [labelPrintStation, setLabelPrintStation] = useState<Station | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    siteId: "",
    locationId: "",
    workArea: "",
    requireEmployeeId: true,
    allowAnonymous: false,
    allowContractors: false,
    allowCustomItems: false,
    allowUrgent: true,
    allowNotes: true,
    inventoryVisibility: "AVAILABILITY",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: Station[] }>("/api/v1/industrial/supplies/qr-stations");
      setStations(data.items ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load QR stations");
      setStations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createStation(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setSuccess("");
    try {
      const created = await apiSend<Station>("/api/v1/industrial/supplies/qr-stations", "POST", {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        siteId: form.siteId,
        locationId: form.locationId || undefined,
        workArea: form.workArea.trim() || undefined,
        config: {
          requireEmployeeId: form.requireEmployeeId,
          allowAnonymous: form.allowAnonymous,
          allowContractors: form.allowContractors,
          allowCustomItems: form.allowCustomItems,
          allowUrgent: form.allowUrgent,
          allowNotes: form.allowNotes,
          inventoryVisibility: form.inventoryVisibility,
          catalogMode: form.locationId ? "LOCATION_ONLY" : "ALL_SITE",
        },
      });
      setSuccess(
        created.publicUrl ? `QR created. URL: ${created.publicUrl}` : "QR station created.",
      );
      setError("");
      setForm((prev) => ({ ...prev, name: "", description: "", workArea: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function runStationAction(id: string, action: string) {
    setSaving(true);
    try {
      if (action === "png") {
        const data = await apiGet<{ pngBase64: string; publicUrl: string; label?: string }>(
          `/api/v1/industrial/supplies/qr-stations/${encodeURIComponent(id)}/png`,
        );
        const win = window.open("", "_blank");
        if (win) {
          const imgSize = posterSize === "qr" ? 360 : posterSize === "half" ? 220 : 280;
          const pageCss =
            posterSize === "half"
              ? "@page{size:letter;margin:0.5in} .sheet{width:7.5in;min-height:4.5in}"
              : posterSize === "qr"
                ? "@page{size:letter;margin:0.75in} .sheet{width:6in}"
                : "@page{size:letter;margin:0.6in} .sheet{width:7.5in;min-height:9in}";
          win.document.write(`<!doctype html><html><head><title>${data.label ?? "QR Sign"}</title>
<style>
${pageCss}
body{font-family:Georgia,"Times New Roman",serif;text-align:center;padding:24px;color:#1a1a1a;background:#f7f4ef}
.sheet{margin:0 auto;background:#fff;border:1px solid #d9d2c5;padding:28px 20px}
.brand{letter-spacing:0.14em;text-transform:uppercase;font-size:11px;color:#6b6358;margin:0 0 12px}
h1{font-size:${posterSize === "qr" ? "20px" : "28px"};margin:0 0 8px;font-weight:700}
.sub{margin:0 0 16px;color:#4a453e;font-size:15px}
img{width:${imgSize}px;height:${imgSize}px;margin:12px auto;display:block}
.label{font-size:14px;margin-top:8px}
.steps{text-align:center;max-width:360px;margin:20px auto 0;font-size:14px;line-height:1.45;list-style-position:inside;padding:0}
.steps li{text-align:center;margin:0.35em 0}
.footer{margin-top:24px;font-size:11px;color:#8a8278}
</style></head><body>
<div class="sheet">
<p class="brand">Forge Industrial Safety</p>
<h1>Need Safety Supplies?</h1>
<p class="sub">Scan the QR code to submit a request</p>
<img src="data:image/png;base64,${data.pngBase64}" alt="QR" />
<p class="label">${data.label ?? ""}</p>
${
  posterSize === "qr"
    ? ""
    : `<ol class="steps">
  <li>Scan with your phone camera</li>
  <li>Identify yourself (if required)</li>
  <li>Select items and submit</li>
</ol>`
}
<p class="footer">Contact the Safety Department if this code does not work.</p>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
          win.document.close();
        }
      } else {
        await apiSend(
          `/api/v1/industrial/supplies/qr-stations/${encodeURIComponent(id)}/${action}`,
          "POST",
          {},
        );
        await load();
      }
      setSuccess("Updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  const siteName = (id?: string | null) => sites.find((s) => s.id === id)?.label ?? id ?? "—";

  const locationForStation = (station: Station) =>
    locations.find((loc) => loc.id === station.locationId) ?? null;

  const showActions = canManage || canPrintLabel;

  return (
    <div className="row g-3">
      <div className="col-lg-7">
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 className="mb-0">Site QR Codes</h5>
            <div className="d-flex align-items-center gap-2">
              <label className="form-label mb-0 small" htmlFor="poster-size">
                Poster
              </label>
              <select
                id="poster-size"
                className="form-select form-select-sm"
                style={{ width: "auto" }}
                value={posterSize}
                onChange={(e) => setPosterSize(e.target.value as "letter" | "half" | "qr")}
              >
                <option value="letter">Letter</option>
                <option value="half">Half sheet</option>
                <option value="qr">QR only</option>
              </select>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => void load()}
              >
                Refresh
              </button>
            </div>
          </div>
          {error ? <div className="alert alert-danger m-3">{error}</div> : null}
          {success ? <div className="alert alert-success m-3">{success}</div> : null}
          <div className="alert alert-info m-3 mb-0 py-2 small">
            Use <strong>Print label</strong> for Brady i4311 / Forge printers.{" "}
            <strong>Print poster</strong> opens the browser print dialog (office printers only — do
            not select the i4311 there).
          </div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Scans</th>
                  <th>Requests</th>
                  {showActions ? <th className="text-end">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => (
                  <tr key={station.id}>
                    <td>
                      <div className="fw-semibold">{station.name}</div>
                      {station.publicUrl ? (
                        <div className="small text-truncate" style={{ maxWidth: 220 }}>
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0"
                            onClick={() => {
                              void navigator.clipboard.writeText(station.publicUrl || "");
                              setSuccess("URL copied");
                            }}
                          >
                            Copy URL
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>{siteName(station.siteId)}</td>
                    <td>{station.status}</td>
                    <td>{station.scanCount}</td>
                    <td>{station.requestCount}</td>
                    {showActions ? (
                      <td className="text-end text-nowrap">
                        {canPrintLabel || canManage ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary me-1"
                            disabled={saving || !station.publicUrl}
                            title={
                              station.publicUrl
                                ? "Opens Forge Print Dialog for Brady / bridge printers"
                                : "No public URL yet"
                            }
                            onClick={() => setLabelPrintStation(station)}
                          >
                            Print label
                          </button>
                        ) : null}
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary me-1"
                              disabled={saving}
                              title="Browser print for letter/half posters — not for Brady i4311"
                              onClick={() => void runStationAction(station.id, "png")}
                            >
                              Print poster
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary me-1"
                              disabled={saving}
                              onClick={() => void runStationAction(station.id, "regenerate")}
                            >
                              Regenerate
                            </button>
                            {station.status === "ACTIVE" ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-warning"
                                disabled={saving}
                                onClick={() => void runStationAction(station.id, "disable")}
                              >
                                Disable
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                disabled={saving}
                                onClick={() => void runStationAction(station.id, "enable")}
                              >
                                Enable
                              </button>
                            )}
                          </>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!loading && stations.length === 0 ? (
                  <tr>
                    <td colSpan={showActions ? 6 : 5} className="text-muted">
                      No supply request QR codes yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {canManage ? (
        <div className="col-lg-5">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Generate Supply Request QR</h5>
              <form onSubmit={(e) => void createStation(e)}>
                <div className="mb-3">
                  <label className="form-label">QR Name *</label>
                  <input
                    className="form-control"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Site *</label>
                  <select
                    className="form-select"
                    required
                    value={form.siteId}
                    onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                  >
                    <option value="">Select site</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Inventory location</label>
                  <select
                    className="form-select"
                    value={form.locationId}
                    onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                  >
                    <option value="">Optional</option>
                    {locations
                      .filter((loc) => !form.siteId || !loc.siteId || loc.siteId === form.siteId)
                      .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.code})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Work area</label>
                  <input
                    className="form-control"
                    value={form.workArea}
                    onChange={(e) => setForm({ ...form, workArea: e.target.value })}
                  />
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={form.requireEmployeeId}
                    onChange={(e) => setForm({ ...form, requireEmployeeId: e.target.checked })}
                    id="qr-req-emp"
                  />
                  <label className="form-check-label" htmlFor="qr-req-emp">
                    Require employee identification
                  </label>
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={form.allowAnonymous}
                    onChange={(e) => setForm({ ...form, allowAnonymous: e.target.checked })}
                    id="qr-anon"
                  />
                  <label className="form-check-label" htmlFor="qr-anon">
                    Allow anonymous requests
                  </label>
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={form.allowContractors}
                    onChange={(e) => setForm({ ...form, allowContractors: e.target.checked })}
                    id="qr-contractor"
                  />
                  <label className="form-check-label" htmlFor="qr-contractor">
                    Allow contractor requests
                  </label>
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={form.allowCustomItems}
                    onChange={(e) => setForm({ ...form, allowCustomItems: e.target.checked })}
                    id="qr-custom"
                  />
                  <label className="form-check-label" htmlFor="qr-custom">
                    Allow custom items
                  </label>
                </div>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={form.allowUrgent}
                    onChange={(e) => setForm({ ...form, allowUrgent: e.target.checked })}
                    id="qr-urgent"
                  />
                  <label className="form-check-label" htmlFor="qr-urgent">
                    Allow urgent requests
                  </label>
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Generate QR Code"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <ForgePrintDialog
        open={labelPrintStation != null}
        onClose={() => setLabelPrintStation(null)}
        module="SAFETY_SUPPLIES"
        recordType="supply_qr_station"
        recordId={labelPrintStation?.id}
        defaultTitle="SUPPLY REQUEST QR"
        locationId={labelPrintStation?.siteId ?? null}
        widthInches={4}
        heightInches={6}
        fieldValues={
          labelPrintStation
            ? (() => {
                const values: Record<string, string> = {
                  brand: "Forge Industrial Safety",
                  title: "Need Safety Supplies?",
                  subtitle: "Scan the QR code to submit a request",
                  caption: String(labelPrintStation.name ?? "Supply Request QR"),
                  name: String(labelPrintStation.name ?? "Supply Request QR"),
                  instructions:
                    "1. Scan with your phone camera\n2. Identify yourself (if required)\n3. Select items and submit",
                  footer: "Contact the Safety Department if this code does not work.",
                };
                const url = labelPrintStation.publicUrl?.trim();
                if (url) {
                  values.qr = url;
                  values.qrPayload = url;
                }
                return values;
              })()
            : {}
        }
      />
    </div>
  );
}
