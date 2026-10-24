"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  createLabelTemplate,
  createLabelTemplateDraft,
  createPrintJob,
  exportLabelTemplateZpl,
  getLabelTemplate,
  listLabelTemplates,
  listPrinters,
  patchLabelTemplateVersion,
  previewLabelTemplate,
  printerDisplayName,
  publishLabelTemplate,
  type ForgePrinter,
  type LabelTemplate,
  type LabelTemplatePreview,
  type LabelTemplateVersion,
} from "@/lib/print-api";

type DesignerElement = {
  id: string;
  type: "text" | "dynamicText" | "qr" | "barcode" | "rectangle" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fieldKey?: string;
  fontSizePt?: number;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  barcodeFormat?: "CODE128" | "CODE39";
  showHumanReadable?: boolean;
};

function newElementId(): string {
  return `el-${Math.random().toString(36).slice(2, 9)}`;
}

function elementsFromLayout(layout: Record<string, unknown>): DesignerElement[] {
  const raw = layout.elements;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === "object")
    .map((e, i) => {
      const row = e as Record<string, unknown>;
      const type = String(row.type ?? "text") as DesignerElement["type"];
      return {
        id: typeof row.id === "string" ? row.id : `el-${i + 1}`,
        type: ["text", "dynamicText", "qr", "barcode", "rectangle", "line"].includes(type)
          ? type
          : "text",
        x: Number(row.x) || 0,
        y: Number(row.y) || 0,
        width: Number(row.width) > 0 ? Number(row.width) : 1,
        height: Number(row.height) > 0 ? Number(row.height) : 0.25,
        content: typeof row.content === "string" ? row.content : "",
        fieldKey: typeof row.fieldKey === "string" ? row.fieldKey : "",
        fontSizePt: typeof row.fontSizePt === "number" ? row.fontSizePt : 12,
        fontWeight: row.fontWeight === "bold" ? "bold" : "normal",
        align: row.align === "center" || row.align === "right" ? row.align : "left",
        barcodeFormat: row.barcodeFormat === "CODE39" ? "CODE39" : "CODE128",
        showHumanReadable: row.showHumanReadable !== false,
      };
    });
}

function parsePreviewValues(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export function PrintManagerTemplatesPanel() {
  const { hasAnyPermission } = useAuth();
  const canManage = hasAnyPermission(["industrial.printer.manage_templates", "industrial.admin"]);
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);

  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LabelTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [widthIn, setWidthIn] = useState(4);
  const [heightIn, setHeightIn] = useState(2);
  const [dpi, setDpi] = useState(300);
  const [elements, setElements] = useState<DesignerElement[]>([]);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [htmlFallback, setHtmlFallback] = useState("");
  const [layoutKind, setLayoutKind] = useState<"ELEMENTS" | "HTML" | "FIELDS" | "TEST_PRINT">(
    "ELEMENTS",
  );
  const [previewValues, setPreviewValues] = useState(
    "title=Sample Label\nbody=Hello from Forge\nqr=https://forge.example/label\nasset=EQ-100",
  );
  const [preview, setPreview] = useState<LabelTemplatePreview | null>(null);
  const [printPrinterId, setPrintPrinterId] = useState("");
  const [testCopies, setTestCopies] = useState(1);
  const [trueSize, setTrueSize] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [items, printerRows] = await Promise.all([
        listLabelTemplates(),
        listPrinters().catch(() => [] as ForgePrinter[]),
      ]);
      setTemplates(items);
      setPrinters(printerRows.filter((p) => p.enabled));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const next = await getLabelTemplate(id);
      setDetail(next);
      const draft =
        next.versions?.find((v) => v.status === "DRAFT") ??
        next.versions?.find((v) => v.status === "PUBLISHED") ??
        next.versions?.[0];
      if (draft) {
        const kind = String(draft.layout.kind ?? "ELEMENTS").toUpperCase();
        setLayoutKind(
          kind === "HTML" || kind === "FIELDS" || kind === "TEST_PRINT" || kind === "ELEMENTS"
            ? kind
            : "ELEMENTS",
        );
        setWidthIn(draft.widthInches);
        setHeightIn(draft.heightInches);
        setDpi(draft.dpi);
        if (kind === "HTML") {
          setHtmlFallback(typeof draft.layout.html === "string" ? draft.layout.html : "");
          setElements([]);
        } else {
          setElements(elementsFromLayout(draft.layout));
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load template.");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const editableVersion: LabelTemplateVersion | null = useMemo(() => {
    if (!detail?.versions?.length) return null;
    return detail.versions.find((v) => v.status === "DRAFT") ?? null;
  }, [detail]);

  const publishedVersion = useMemo(
    () => detail?.versions?.find((v) => v.status === "PUBLISHED") ?? null,
    [detail],
  );

  const selectedEl = elements.find((e) => e.id === selectedElId) ?? null;

  function updateSelected(patch: Partial<DesignerElement>) {
    if (!selectedElId) return;
    setElements((prev) => prev.map((e) => (e.id === selectedElId ? { ...e, ...patch } : e)));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !newCode.trim() || !newName.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createLabelTemplate({
        code: newCode.trim(),
        name: newName.trim(),
        widthInches: 4,
        heightInches: 4,
        dpi: 300,
      });
      setNewCode("");
      setNewName("");
      setMessage(`Created label template ${created.code}.`);
      await loadList();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create template.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraft() {
    if (!canManage || !detail || !editableVersion) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const layout =
        layoutKind === "HTML"
          ? { kind: "HTML" as const, html: htmlFallback }
          : {
              kind: "ELEMENTS" as const,
              elements: elements.map((el) => ({
                ...el,
                content: el.content || undefined,
                fieldKey: el.fieldKey || undefined,
              })),
            };
      const next = await patchLabelTemplateVersion(detail.id, editableVersion.id, {
        widthInches: widthIn,
        heightInches: heightIn,
        dpi,
        layout,
      });
      setDetail(next);
      setMessage(`Saved draft v${editableVersion.version}.`);
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save draft.");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!canManage || !detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await publishLabelTemplate(detail.id);
      setDetail(next);
      setMessage("Published. Prior published version archived.");
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  async function onNewDraft() {
    if (!canManage || !detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await createLabelTemplateDraft(detail.id);
      setDetail(next);
      setMessage("New draft version created.");
      await loadList();
      await loadDetail(detail.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create draft.");
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      let versionId = editableVersion?.id ?? publishedVersion?.id;
      if (canManage && editableVersion) {
        const layout =
          layoutKind === "HTML"
            ? { kind: "HTML" as const, html: htmlFallback }
            : {
                kind: "ELEMENTS" as const,
                elements: elements.map((el) => ({
                  ...el,
                  content: el.content || undefined,
                  fieldKey: el.fieldKey || undefined,
                })),
              };
        const next = await patchLabelTemplateVersion(detail.id, editableVersion.id, {
          widthInches: widthIn,
          heightInches: heightIn,
          dpi,
          layout,
        });
        setDetail(next);
        versionId = next.versions?.find((v) => v.status === "DRAFT")?.id ?? versionId;
      }
      const result = await previewLabelTemplate(detail.id, {
        ...(versionId ? { versionId } : {}),
        fieldValues: parsePreviewValues(previewValues),
        output: "png",
      });
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onExportZpl() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      if (canManage && editableVersion && layoutKind === "ELEMENTS") {
        await patchLabelTemplateVersion(detail.id, editableVersion.id, {
          widthInches: widthIn,
          heightInches: heightIn,
          dpi,
          layout: { kind: "ELEMENTS", elements },
        });
      }
      const versionId = editableVersion?.id ?? publishedVersion?.id;
      const result = await exportLabelTemplateZpl(detail.id, {
        ...(versionId ? { versionId } : {}),
        fieldValues: parsePreviewValues(previewValues),
      });
      const blob = new Blob([result.zpl], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Downloaded ${result.filename}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ZPL export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onPrintTest() {
    if (!detail || !printPrinterId || !canPrint) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (editableVersion && canManage) {
        await publishLabelTemplate(detail.id);
        await loadDetail(detail.id);
      }
      const job = await createPrintJob({
        printerId: printPrinterId,
        templateId: detail.id,
        module: "PRINT_MANAGER",
        recordType: "label_template",
        recordId: detail.id,
        fieldValues: parsePreviewValues(previewValues),
        copies: Math.min(100, Math.max(1, Math.round(testCopies) || 1)),
      });
      setMessage(`Print job queued (${job.id.slice(0, 8)}…).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Print failed.");
    } finally {
      setBusy(false);
    }
  }

  function addElement(type: DesignerElement["type"]) {
    const el: DesignerElement = {
      id: newElementId(),
      type,
      x: 0.1,
      y: 0.1,
      width: type === "qr" || type === "barcode" ? 1.2 : 2,
      height: type === "qr" ? 1.2 : type === "barcode" ? 0.5 : 0.3,
      content:
        type === "qr"
          ? "{{qr}}"
          : type === "barcode"
            ? "{{asset}}"
            : type === "dynamicText"
              ? "{{title}}"
              : "Text",
      fieldKey: type === "dynamicText" ? "title" : "",
      fontSizePt: 12,
      fontWeight: "normal",
      align: "left",
      barcodeFormat: "CODE128",
      showHumanReadable: true,
    };
    setElements((prev) => [...prev, el]);
    setSelectedElId(el.id);
  }

  const previewCssWidth = trueSize ? `${widthIn}in` : "100%";
  const previewCssHeight = trueSize ? `${heightIn}in` : "auto";

  return (
    <div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="alert">
          {message}
        </div>
      ) : null}

      <p className="text-muted small mb-3">
        Phase 5 label designer — positioned text, QR, and Code 128 barcode. True-size preview uses
        CSS inches. Brady print stays PNG; ZPL export is for Zebra / raw adapters.
      </p>

      <div className="row g-3">
        <div className="col-lg-3">
          {canManage ? (
            <form className="card border shadow-none mb-3" onSubmit={(e) => void onCreate(e)}>
              <div className="card-header">
                <h6 className="mb-0">New label</h6>
              </div>
              <div className="card-body">
                <div className="mb-2">
                  <label className="form-label" htmlFor="tpl-code">
                    Code
                  </label>
                  <input
                    id="tpl-code"
                    className="form-control"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label" htmlFor="tpl-name">
                    Name
                  </label>
                  <input
                    id="tpl-name"
                    className="form-control"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  Create
                </button>
              </div>
            </form>
          ) : null}

          <div className="card border shadow-none">
            <div className="table-responsive" style={{ maxHeight: 420, overflow: "auto" }}>
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Template</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="text-muted">Loading…</td>
                    </tr>
                  ) : templates.length === 0 ? (
                    <tr>
                      <td className="text-muted">No templates yet.</td>
                    </tr>
                  ) : (
                    templates.map((t) => (
                      <tr
                        key={t.id}
                        className={selectedId === t.id ? "table-active" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedId(t.id)}
                      >
                        <td>
                          <div>{t.name}</div>
                          <div className="small text-muted font-monospace">{t.code}</div>
                          <div className="small">
                            {t.publishedVersion != null
                              ? `pub v${t.publishedVersion}`
                              : "unpublished"}
                            {t.draftVersion != null ? ` · draft v${t.draftVersion}` : ""}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-lg-9">
          {!detail ? (
            <div className="text-muted">Select or create a label template.</div>
          ) : (
            <>
              <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                <h6 className="mb-0 me-auto">
                  {detail.name}{" "}
                  <span className="text-muted font-monospace small">{detail.code}</span>
                </h6>
                {canManage && editableVersion ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={busy}
                    onClick={() => void onSaveDraft()}
                  >
                    Save draft
                  </button>
                ) : null}
                {canManage && editableVersion ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => void onPublish()}
                  >
                    Publish
                  </button>
                ) : null}
                {canManage && !editableVersion ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy}
                    onClick={() => void onNewDraft()}
                  >
                    New draft
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  disabled={busy}
                  onClick={() => void onPreview()}
                >
                  Preview
                </button>
                {layoutKind === "ELEMENTS" ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy}
                    onClick={() => void onExportZpl()}
                  >
                    Export ZPL
                  </button>
                ) : null}
              </div>

              <div className="row g-2 mb-3">
                <div className="col-auto">
                  <label className="form-label small mb-0" htmlFor="lbl-w">
                    Width (in)
                  </label>
                  <input
                    id="lbl-w"
                    type="number"
                    step="0.1"
                    min="0.5"
                    className="form-control form-control-sm"
                    style={{ width: 88 }}
                    value={widthIn}
                    disabled={!editableVersion || !canManage}
                    onChange={(e) => setWidthIn(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="col-auto">
                  <label className="form-label small mb-0" htmlFor="lbl-h">
                    Height (in)
                  </label>
                  <input
                    id="lbl-h"
                    type="number"
                    step="0.1"
                    min="0.5"
                    className="form-control form-control-sm"
                    style={{ width: 88 }}
                    value={heightIn}
                    disabled={!editableVersion || !canManage}
                    onChange={(e) => setHeightIn(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="col-auto">
                  <label className="form-label small mb-0" htmlFor="lbl-dpi">
                    DPI
                  </label>
                  <input
                    id="lbl-dpi"
                    type="number"
                    className="form-control form-control-sm"
                    style={{ width: 88 }}
                    value={dpi}
                    disabled={!editableVersion || !canManage}
                    onChange={(e) => setDpi(Number(e.target.value) || 300)}
                  />
                </div>
                <div className="col-auto d-flex align-items-end">
                  <div className="form-check mb-1">
                    <input
                      id="true-size"
                      type="checkbox"
                      className="form-check-input"
                      checked={trueSize}
                      onChange={(e) => setTrueSize(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="true-size">
                      True-size preview
                    </label>
                  </div>
                </div>
              </div>

              {layoutKind === "ELEMENTS" ? (
                <div className="row g-3">
                  <div className="col-md-4">
                    <div className="d-flex flex-wrap gap-1 mb-2">
                      {(
                        [
                          ["text", "Text"],
                          ["dynamicText", "Dynamic"],
                          ["qr", "QR"],
                          ["barcode", "Barcode"],
                        ] as const
                      ).map(([type, label]) => (
                        <button
                          key={type}
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={!canManage || !editableVersion}
                          onClick={() => addElement(type)}
                        >
                          + {label}
                        </button>
                      ))}
                    </div>
                    <ul className="list-group list-group-flush border rounded">
                      {elements.length === 0 ? (
                        <li className="list-group-item text-muted small">No elements yet.</li>
                      ) : (
                        elements.map((el) => (
                          <li
                            key={el.id}
                            className={`list-group-item list-group-item-action py-2 ${selectedElId === el.id ? "active" : ""}`}
                            style={{ cursor: "pointer" }}
                            onClick={() => setSelectedElId(el.id)}
                          >
                            <div className="small fw-semibold">{el.type}</div>
                            <div className="small opacity-75 text-truncate">
                              {el.content || el.fieldKey || el.id}
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                    {selectedEl && canManage && editableVersion ? (
                      <div className="mt-3 border rounded p-2">
                        <div className="small text-muted mb-2">Properties (inches)</div>
                        <div className="row g-1">
                          {(["x", "y", "width", "height"] as const).map((key) => (
                            <div className="col-6" key={key}>
                              <label className="form-label small mb-0">{key}</label>
                              <input
                                type="number"
                                step="0.05"
                                className="form-control form-control-sm"
                                value={selectedEl[key]}
                                onChange={(e) =>
                                  updateSelected({ [key]: Number(e.target.value) || 0 })
                                }
                              />
                            </div>
                          ))}
                          <div className="col-12">
                            <label className="form-label small mb-0">Content / binding</label>
                            <input
                              className="form-control form-control-sm"
                              value={selectedEl.content ?? ""}
                              onChange={(e) => updateSelected({ content: e.target.value })}
                            />
                          </div>
                          {selectedEl.type === "dynamicText" ? (
                            <div className="col-12">
                              <label className="form-label small mb-0">Field key</label>
                              <input
                                className="form-control form-control-sm"
                                value={selectedEl.fieldKey ?? ""}
                                onChange={(e) => updateSelected({ fieldKey: e.target.value })}
                              />
                            </div>
                          ) : null}
                          {(selectedEl.type === "text" || selectedEl.type === "dynamicText") && (
                            <div className="col-6">
                              <label className="form-label small mb-0">Font pt</label>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                value={selectedEl.fontSizePt ?? 12}
                                onChange={(e) =>
                                  updateSelected({ fontSizePt: Number(e.target.value) || 12 })
                                }
                              />
                            </div>
                          )}
                          <div className="col-12 mt-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => {
                                setElements((prev) => prev.filter((e) => e.id !== selectedEl.id));
                                setSelectedElId(null);
                              }}
                            >
                              Delete element
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="col-md-8">
                    <label className="form-label" htmlFor="preview-vals">
                      Test data (key=value per line)
                    </label>
                    <textarea
                      id="preview-vals"
                      className="form-control font-monospace mb-2"
                      rows={4}
                      value={previewValues}
                      onChange={(e) => setPreviewValues(e.target.value)}
                    />
                    <div
                      className="border rounded bg-white p-2 overflow-auto"
                      style={{ maxHeight: 420 }}
                    >
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            preview.previewDataUrl.startsWith("data:")
                              ? preview.previewDataUrl
                              : `data:${preview.contentType};base64,${preview.base64}`
                          }
                          alt="Label preview"
                          style={{
                            width: previewCssWidth,
                            height: previewCssHeight,
                            objectFit: "contain",
                            display: "block",
                            border: "1px dashed #ccc",
                            background: "#fff",
                          }}
                        />
                      ) : (
                        <div className="text-muted small p-3">
                          Click Preview to render at {widthIn}×{heightIn} in @ {dpi} DPI.
                        </div>
                      )}
                    </div>

                    {canPrint ? (
                      <div className="d-flex flex-wrap gap-2 align-items-end mt-3">
                        <div>
                          <label className="form-label small mb-0" htmlFor="print-printer">
                            Print test (Brady / bridge)
                          </label>
                          <select
                            id="print-printer"
                            className="form-select form-select-sm"
                            style={{ minWidth: 220 }}
                            value={printPrinterId}
                            onChange={(e) => setPrintPrinterId(e.target.value)}
                          >
                            <option value="">Select printer…</option>
                            {printers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {printerDisplayName(p)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="form-label small mb-0" htmlFor="print-test-copies">
                            Copies
                          </label>
                          <input
                            id="print-test-copies"
                            type="number"
                            className="form-control form-control-sm"
                            style={{ width: 88 }}
                            min={1}
                            max={100}
                            value={testCopies}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              setTestCopies(Math.min(100, Math.max(1, Math.round(n))));
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busy || !printPrinterId}
                          onClick={() => void onPrintTest()}
                        >
                          {testCopies > 1 ? `Print ${testCopies} copies` : "Print label"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="small text-muted">
                    This template uses {layoutKind} layout. Create a new label for the element
                    designer, or edit HTML below.
                  </p>
                  {layoutKind === "HTML" ? (
                    <textarea
                      className="form-control font-monospace"
                      rows={12}
                      value={htmlFallback}
                      disabled={!canManage || !editableVersion}
                      onChange={(e) => setHtmlFallback(e.target.value)}
                    />
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
