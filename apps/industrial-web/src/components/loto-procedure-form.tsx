"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type SetStateAction,
} from "react";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import { LotoAnnotatedImage } from "@/components/loto-annotated-image";
import { LotoPhotoAnnotatorModal } from "@/components/loto-photo-annotator-modal";
import {
  LOTO_DEFAULT_PRECAUTIONS,
  LOTO_DEFAULT_PRINT_ENFORCEMENT,
  LOTO_DEFAULT_PRINT_PURPOSE,
  LOTO_DEFAULT_PRINT_SCOPE,
  LOTO_DEFAULT_RESTORE_SEQUENCE,
  LOTO_DEFAULT_SHUTDOWN_SEQUENCE,
  LOTO_EQUIPMENT_TYPE_OPTIONS,
  LOTO_LOCKOUT_DEVICE_OPTIONS,
  LOTO_LOCKOUT_METHOD_OPTIONS,
  emptyLotoStepForm,
  emptyLotoPhotoForm,
  lotoEnergyLetterStyle,
  LOTO_MAX_PHOTOS_PER_SLOT,
  syncEquipmentLegacyPhotoFields,
  syncStepLegacyPhotoFields,
  type LotoImageArrow,
  type LotoPhotoForm,
  type LotoPrecautionSelection,
  type LotoProcedureFormState,
  type LotoSequenceStepForm,
  type LotoStepForm,
} from "@/lib/loto";
import {
  compressLotoImageFile,
  clipboardLooksLikeImage,
  copyImageUrlToClipboard,
  fileFromImageUrl,
  imageFilesFromFileList,
  imageUrlFromClipboardEvent,
  imagesFromClipboardEvent,
  isDisplayableLotoImageUrl,
  isLotoImageFile,
  readImagesFromClipboard,
} from "@/lib/loto-clipboard-images";
import {
  EMPTY_ASSIGNMENT_OPTIONS,
  type DepartmentOption,
  type DivisionOption,
} from "@/lib/personnel-assignment";
import { loadAssignmentOptions } from "@/lib/personnel-lookups";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function toDepartmentOptions(departments: Array<Record<string, unknown>>): DepartmentOption[] {
  return departments
    .map((row) => {
      const payload =
        row.sourcePayload &&
        typeof row.sourcePayload === "object" &&
        !Array.isArray(row.sourcePayload)
          ? (row.sourcePayload as Record<string, unknown>)
          : null;
      const divisionName =
        str(row.divisionName) || str(payload?.division) || str(payload?.divisionName) || null;
      return {
        id: str(row.id),
        label: str(row.name) || str(row.label) || str(row.title),
        siteId: str(row.siteId) || null,
        divisionName,
      };
    })
    .filter((row) => row.id && row.label);
}

function toSiteOptions(sites: Array<Record<string, unknown>>) {
  return sites
    .map((site) => ({
      id: str(site.id),
      label: str(site.name) || str(site.title) || str(site.id),
    }))
    .filter((site) => site.id && site.label);
}

type LotoProcedureFormProps = {
  mode: "create" | "edit";
  form: LotoProcedureFormState;
  setForm: Dispatch<SetStateAction<LotoProcedureFormState>>;
  equipment: Array<Record<string, unknown>>;
  sites: Array<Record<string, unknown>>;
  departments?: Array<Record<string, unknown>>;
  areaOptions?: string[];
  locationOptions?: string[];
  descriptionOptions?: string[];
  precautionOptions?: LotoPrecautionSelection[];
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function LotoProcedureForm({
  mode,
  form,
  setForm,
  equipment,
  sites,
  departments = [],
  areaOptions = [],
  locationOptions = [],
  descriptionOptions = [],
  precautionOptions = LOTO_DEFAULT_PRECAUTIONS,
  busy,
  onSubmit,
  onCancel,
}: LotoProcedureFormProps) {
  const [precautionsOpen, setPrecautionsOpen] = useState(false);
  const [divisionEntries, setDivisionEntries] = useState<DivisionOption[]>(
    EMPTY_ASSIGNMENT_OPTIONS.divisionEntries,
  );
  const equipmentUploadRef = useRef<HTMLInputElement>(null);
  const equipmentCameraRef = useRef<HTMLInputElement>(null);
  const stepUploadRefs = useRef<Array<HTMLInputElement | null>>([]);
  const stepCameraRefs = useRef<Array<HTMLInputElement | null>>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [annotatorTarget, setAnnotatorTarget] = useState<
    | { slot: "equipment"; photoIndex: number }
    | { slot: "step"; stepIndex: number; photoIndex: number }
    | null
  >(null);
  /** Last photo zone the user focused / clicked — used when Ctrl+V happens elsewhere on the form. */
  const [activePhotoTarget, setActivePhotoTarget] = useState<"equipment" | number>(0);
  const activePhotoTargetRef = useRef<"equipment" | number>(0);
  activePhotoTargetRef.current = activePhotoTarget;

  function photoSrc(photo: LotoPhotoForm): string {
    return [photo.previewUrl, photo.imageUrl].find(isDisplayableLotoImageUrl) ?? "";
  }

  useEffect(() => {
    let cancelled = false;
    void loadAssignmentOptions().then((options) => {
      if (!cancelled) setDivisionEntries(options.divisionEntries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSteps = (updater: (prev: LotoStepForm[]) => LotoStepForm[]) => {
    setForm((prev) => ({ ...prev, steps: updater(prev.steps) }));
  };

  const updateStep = (idx: number, patch: Partial<LotoStepForm>) => {
    setSteps((prev) => prev.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  };

  const siteName =
    form.siteName ||
    str(sites.find((site) => str(site.id) === form.siteId)?.name) ||
    str(sites.find((site) => str(site.id) === form.siteId)?.title);

  const siteOptions = useMemo(() => toSiteOptions(sites), [sites]);
  const departmentCatalog = useMemo(() => toDepartmentOptions(departments), [departments]);

  const typeOptions = useMemo(() => {
    const fromEquipment = equipment
      .map((row) => str(row.equipmentType || row.type || row.equipmentTypeName))
      .filter(Boolean);
    return uniqueSorted([...LOTO_EQUIPMENT_TYPE_OPTIONS, ...fromEquipment]);
  }, [equipment]);

  const areas = useMemo(
    () => uniqueSorted([...areaOptions, form.areaName]),
    [areaOptions, form.areaName],
  );

  const locations = useMemo(
    () =>
      uniqueSorted([...locationOptions, ...form.steps.map((step) => step.isolationLocationText)]),
    [locationOptions, form.steps],
  );

  const descriptions = useMemo(
    () => uniqueSorted([...descriptionOptions, ...form.steps.map((step) => step.descriptionCode)]),
    [descriptionOptions, form.steps],
  );

  const selectedPrecautionIds = new Set(form.precautions.map((p) => p.id));
  const footerDate = new Date().toISOString().slice(0, 10);

  function togglePrecaution(option: LotoPrecautionSelection) {
    setForm((prev) => {
      const exists = prev.precautions.some((p) => p.id === option.id);
      return {
        ...prev,
        precautions: exists
          ? prev.precautions.filter((p) => p.id !== option.id)
          : [...prev.precautions, option],
      };
    });
  }

  function moveStep(idx: number, direction: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[idx]!;
      next[idx] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  function duplicateStep(idx: number) {
    setSteps((prev) => {
      const source = prev[idx]!;
      const copy: LotoStepForm = {
        ...source,
        stepImagePreviewUrl: "",
        stepImages: (source.stepImages ?? []).map((photo) =>
          emptyLotoPhotoForm({
            imageUrl: photo.imageUrl,
            fileName: photo.fileName,
            annotations: photo.annotations,
            ...(photo.caption !== undefined ? { caption: photo.caption } : {}),
            previewUrl: "",
          }),
        ),
      };
      return [...prev.slice(0, idx + 1), syncStepLegacyPhotoFields(copy), ...prev.slice(idx + 1)];
    });
  }

  async function appendPhotos(target: "equipment" | number, files: File[]) {
    const images = files.filter((file) => isLotoImageFile(file) || file.type.startsWith("image/"));
    if (!images.length) {
      setPhotoNotice("Paste or choose a JPG, PNG, HEIC, or WebP image.");
      return;
    }
    setPhotoBusy(true);
    setPhotoNotice(null);
    try {
      const compressed: LotoPhotoForm[] = [];
      for (const file of images) {
        const { dataUrl, fileName } = await compressLotoImageFile(file);
        compressed.push(
          emptyLotoPhotoForm({
            imageUrl: dataUrl,
            fileName,
            previewUrl: "",
            annotations: [],
          }),
        );
      }

      if (target === "equipment") {
        let notice = "";
        setForm((prev) => {
          const existing = prev.equipmentImages ?? [];
          const room = Math.max(0, LOTO_MAX_PHOTOS_PER_SLOT - existing.length);
          const added = compressed.slice(0, room);
          if (!added.length) {
            notice = `Equipment already has ${LOTO_MAX_PHOTOS_PER_SLOT} photos (max).`;
            return prev;
          }
          notice =
            added.length === 1
              ? "Equipment photo added. Use Annotate to add arrows."
              : `Added ${added.length} equipment photos. Use Annotate on each to add arrows.`;
          const next = syncEquipmentLegacyPhotoFields({
            ...prev,
            equipmentImages: [...existing, ...added],
            equipmentImageCaption: prev.equipmentImageCaption || added[0]?.fileName || "",
          });
          return { ...prev, ...next };
        });
        if (notice) setPhotoNotice(notice);
        return;
      }

      const stepIdx = target;
      let notice = "";
      setSteps((prev) =>
        prev.map((step, i) => {
          if (i !== stepIdx) return step;
          const existing = step.stepImages ?? [];
          const room = Math.max(0, LOTO_MAX_PHOTOS_PER_SLOT - existing.length);
          const added = compressed.slice(0, room);
          if (!added.length) {
            notice = `Step ${stepIdx + 1} already has ${LOTO_MAX_PHOTOS_PER_SLOT} photos (max).`;
            return step;
          }
          notice =
            added.length === 1
              ? `Step ${stepIdx + 1} photo added. Use Annotate to add arrows.`
              : `Added ${added.length} photos to step ${stepIdx + 1}.`;
          return syncStepLegacyPhotoFields({
            ...step,
            stepImages: [...existing, ...added],
          });
        }),
      );
      if (notice) setPhotoNotice(notice);
    } catch {
      setPhotoNotice("Could not read that image.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onEquipmentImage(files: FileList | null) {
    const list = imageFilesFromFileList(files);
    if (!list.length) return;
    await appendPhotos("equipment", list);
  }

  async function onStepImage(idx: number, files: FileList | null) {
    const list = imageFilesFromFileList(files);
    if (!list.length) return;
    await appendPhotos(idx, list);
  }

  function removeEquipmentPhoto(photoIndex: number) {
    setForm((prev) => {
      const photos = [...(prev.equipmentImages ?? [])];
      const removed = photos[photoIndex];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      photos.splice(photoIndex, 1);
      return {
        ...prev,
        ...syncEquipmentLegacyPhotoFields({
          ...prev,
          equipmentImages: photos,
        }),
      };
    });
    setPhotoNotice("Removed equipment photo.");
  }

  function removeStepPhoto(stepIdx: number, photoIndex: number) {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIdx) return step;
        const photos = [...(step.stepImages ?? [])];
        const removed = photos[photoIndex];
        if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        photos.splice(photoIndex, 1);
        return syncStepLegacyPhotoFields({ ...step, stepImages: photos });
      }),
    );
    setPhotoNotice(`Removed step ${stepIdx + 1} photo.`);
  }

  async function attachFromClipboardEvent(
    event: ReactClipboardEvent | ClipboardEvent,
    target: "equipment" | number,
  ) {
    const native = "nativeEvent" in event ? event.nativeEvent : event;
    const files = imagesFromClipboardEvent(native);
    if (files.length) {
      event.preventDefault();
      event.stopPropagation();
      await appendPhotos(target, files);
      return true;
    }
    if (!clipboardLooksLikeImage(native)) return false;
    event.preventDefault();
    event.stopPropagation();
    const url = imageUrlFromClipboardEvent(native);
    if (!url) {
      setPhotoNotice("Clipboard image could not be read. Use Paste or Upload.");
      return true;
    }
    setPhotoBusy(true);
    setPhotoNotice(null);
    try {
      const file = await fileFromImageUrl(url);
      await appendPhotos(target, [file]);
    } catch (err) {
      setPhotoNotice(err instanceof Error ? err.message : "Could not attach pasted image.");
    } finally {
      setPhotoBusy(false);
    }
    return true;
  }

  function onPhotoPaste(event: ReactClipboardEvent, target: "equipment" | number) {
    setActivePhotoTarget(target);
    void attachFromClipboardEvent(event, target);
  }

  function onFormPasteCapture(event: ReactClipboardEvent) {
    if (!clipboardLooksLikeImage(event.nativeEvent)) return;
    // Stop the browser from opening the image / URL in a new tab.
    event.preventDefault();
    event.stopPropagation();
    void attachFromClipboardEvent(event, activePhotoTarget);
  }

  function onPhotoDragOver(event: ReactDragEvent) {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onPhotoDrop(event: ReactDragEvent, target: "equipment" | number) {
    event.preventDefault();
    event.stopPropagation();
    setActivePhotoTarget(target);
    const files = imageFilesFromFileList(event.dataTransfer.files);
    if (!files.length) {
      setPhotoNotice("Drop a JPG, PNG, HEIC, or WebP image.");
      return;
    }
    void appendPhotos(target, files);
  }

  async function pasteFromClipboard(target: "equipment" | number) {
    setActivePhotoTarget(target);
    setPhotoBusy(true);
    setPhotoNotice(null);
    try {
      const files = await readImagesFromClipboard();
      if (!files.length) {
        setPhotoNotice("Clipboard has no image. Copy a photo, then paste here.");
        return;
      }
      await appendPhotos(target, files);
    } catch (err) {
      setPhotoNotice(err instanceof Error ? err.message : "Paste failed.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function copyPhoto(url: string) {
    setPhotoBusy(true);
    setPhotoNotice(null);
    try {
      await copyImageUrlToClipboard(url);
      setPhotoNotice("Photo copied. Click a photo box, then Paste or Ctrl+V.");
    } catch (err) {
      setPhotoNotice(err instanceof Error ? err.message : "Copy failed.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const attachFromClipboardEventRef = useRef(attachFromClipboardEvent);
  attachFromClipboardEventRef.current = attachFromClipboardEvent;
  const appendPhotosRef = useRef(appendPhotos);
  appendPhotosRef.current = appendPhotos;

  // Block document-level paste/drop navigation while this form is mounted.
  useEffect(() => {
    function onDocPaste(event: ClipboardEvent) {
      if (!formRef.current) return;
      if (!clipboardLooksLikeImage(event)) return;
      if (!event.composedPath().includes(formRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      void attachFromClipboardEventRef.current(event, activePhotoTargetRef.current);
    }
    function onDocDragOver(event: DragEvent) {
      if (!formRef.current) return;
      if (!event.composedPath().includes(formRef.current)) return;
      if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
      event.preventDefault();
    }
    function onDocDrop(event: DragEvent) {
      if (!formRef.current) return;
      if (!event.composedPath().includes(formRef.current)) return;
      const files = imageFilesFromFileList(event.dataTransfer?.files);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      void appendPhotosRef.current(activePhotoTargetRef.current, files);
    }
    document.addEventListener("paste", onDocPaste, true);
    document.addEventListener("dragover", onDocDragOver, true);
    document.addEventListener("drop", onDocDrop, true);
    return () => {
      document.removeEventListener("paste", onDocPaste, true);
      document.removeEventListener("dragover", onDocDragOver, true);
      document.removeEventListener("drop", onDocDrop, true);
    };
  }, []);

  return (
    <form
      ref={formRef}
      className="card mb-4"
      onSubmit={onSubmit}
      onPasteCapture={onFormPasteCapture}
    >
      <div className="card-header d-flex justify-content-between align-items-center gap-2">
        <h6 className="card-title mb-0">Lock Out / Tag Out Procedure</h6>
        <span className="text-muted small">{mode === "create" ? "Not saved" : "Editing"}</span>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <OrgLocationCascade
            idPrefix="loto"
            required
            disabled={busy}
            includeUnscoped={false}
            sites={siteOptions}
            departments={departmentCatalog}
            divisionEntries={divisionEntries}
            value={{
              siteId: form.siteId,
              siteName: form.siteName,
              divisionName: form.divisionName,
              departmentId: form.departmentId,
              departmentName: form.departmentName,
            }}
            onChange={(next) =>
              setForm((prev) => ({
                ...prev,
                siteId: next.siteId,
                siteName: next.siteName ?? "",
                divisionName: next.divisionName,
                departmentId: next.departmentId,
                departmentName: next.departmentName ?? "",
              }))
            }
          />
          <div className="col-md-4">
            <label className="form-label text-uppercase small fw-semibold" htmlFor="loto-area">
              Area
            </label>
            <input
              id="loto-area"
              className="form-control"
              list="loto-area-options"
              placeholder="Select area"
              value={form.areaName}
              onChange={(ev) => setForm((prev) => ({ ...prev, areaName: ev.target.value }))}
            />
            <datalist id="loto-area-options">
              {areas.map((area) => (
                <option key={area} value={area} />
              ))}
            </datalist>
          </div>
          <div className="col-md-4">
            <label
              className="form-label text-uppercase small fw-semibold"
              htmlFor="loto-equipment-name"
            >
              Equipment name
            </label>
            <input
              id="loto-equipment-name"
              className="form-control"
              required
              placeholder="Enter Equipment Name"
              value={form.equipmentName}
              onChange={(ev) =>
                setForm((prev) => ({
                  ...prev,
                  equipmentName: ev.target.value,
                  title: prev.title || "",
                }))
              }
            />
          </div>
          <div className="col-md-4">
            <label className="form-label text-uppercase small fw-semibold" htmlFor="loto-equip-id">
              ID#
            </label>
            <input
              id="loto-equip-id"
              className="form-control"
              value={form.equipmentExternalId}
              onChange={(ev) =>
                setForm((prev) => ({ ...prev, equipmentExternalId: ev.target.value }))
              }
            />
          </div>
          <div className="col-md-4">
            <label
              className="form-label text-uppercase small fw-semibold"
              htmlFor="loto-equip-type"
            >
              Type
            </label>
            <select
              id="loto-equip-type"
              className="form-select"
              value={form.equipmentTypeName}
              onChange={(ev) =>
                setForm((prev) => ({ ...prev, equipmentTypeName: ev.target.value }))
              }
            >
              <option value="">Select type</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <div
              className="form-label text-uppercase small fw-semibold"
              id="loto-precautions-label"
            >
              Precaution statements
            </div>
            <div className="position-relative">
              <button
                type="button"
                className="form-select text-start"
                onClick={() => setPrecautionsOpen((open) => !open)}
                aria-expanded={precautionsOpen}
                aria-labelledby="loto-precautions-label"
              >
                {form.precautions.length === 0
                  ? "Select precaution statements"
                  : `${form.precautions.length} selected`}
              </button>
              {precautionsOpen ? (
                <div
                  className="border rounded bg-white shadow-sm p-3 mt-1 position-absolute w-100"
                  style={{ zIndex: 5, maxHeight: 260, overflowY: "auto" }}
                >
                  {precautionOptions.map((option) => (
                    <div key={option.id} className="form-check d-block mb-2">
                      <input
                        id={`loto-precaution-${option.id}`}
                        className="form-check-input"
                        type="checkbox"
                        checked={selectedPrecautionIds.has(option.id)}
                        onChange={() => togglePrecaution(option)}
                      />
                      <label className="form-check-label" htmlFor={`loto-precaution-${option.id}`}>
                        <strong>{option.shortName}</strong>
                        <span className="d-block small text-muted">{option.text}</span>
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setPrecautionsOpen(false)}
                  >
                    Done
                  </button>
                </div>
              ) : null}
            </div>
            {form.precautions.length > 0 ? (
              <div className="d-flex flex-wrap gap-1 mt-2">
                {form.precautions.map((note) => (
                  <span key={note.id} className="badge bg-label-secondary">
                    {note.shortName}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-muted mt-4 mb-3">Enter steps for this procedure.</p>

        {photoNotice ? (
          <p
            className={`small mb-3 ${photoNotice.includes("fail") || photoNotice.includes("Could") || photoNotice.includes("no image") ? "text-danger" : "text-success"}`}
          >
            {photoNotice}
          </p>
        ) : null}

        {form.steps.map((step, idx) => {
          const stepPhotos = step.stepImages ?? [];
          const photoCount = stepPhotos.length;
          const atMax = photoCount >= LOTO_MAX_PHOTOS_PER_SLOT;
          const energyStyle = lotoEnergyLetterStyle(step.descriptionCode, step.energySourceName);
          return (
            <div
              className="card shadow-none border mb-3"
              key={idx}
              style={energyStyle ? { borderLeft: `5px solid ${energyStyle.bg}` } : undefined}
            >
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span
                      className="badge rounded-1 px-2 py-2"
                      style={
                        energyStyle
                          ? {
                              backgroundColor: energyStyle.bg,
                              color: energyStyle.fg,
                              minWidth: "4.5rem",
                            }
                          : {
                              backgroundColor: "#64748b",
                              color: "#ffffff",
                              minWidth: "4.5rem",
                            }
                      }
                      title={
                        energyStyle ? `🔒${energyStyle.letter} — ${energyStyle.label}` : "Step"
                      }
                    >
                      <span className="d-block fw-bold">Step # {idx + 1}</span>
                      {energyStyle ? (
                        <span className="d-block small opacity-90">🔒{energyStyle.letter}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="d-flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={idx === 0}
                      onClick={() => moveStep(idx, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={idx === form.steps.length - 1}
                      onClick={() => moveStep(idx, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => duplicateStep(idx)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-danger"
                      disabled={form.steps.length <= 1}
                      onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label
                      className="form-label text-uppercase small fw-semibold"
                      htmlFor={`loto-location-${idx}`}
                    >
                      Energy source location
                    </label>
                    <input
                      id={`loto-location-${idx}`}
                      className="form-control"
                      list={`loto-location-options-${idx}`}
                      placeholder="Select or type a location..."
                      value={step.isolationLocationText}
                      onChange={(ev) => updateStep(idx, { isolationLocationText: ev.target.value })}
                    />
                    <datalist id={`loto-location-options-${idx}`}>
                      {locations.map((loc) => (
                        <option key={loc} value={loc} />
                      ))}
                    </datalist>
                  </div>
                  <div className="col-md-4">
                    <label
                      className="form-label text-uppercase small fw-semibold"
                      htmlFor={`loto-device-${idx}`}
                    >
                      Lockout device
                    </label>
                    <select
                      id={`loto-device-${idx}`}
                      className="form-select"
                      value={step.lockoutDeviceName}
                      onChange={(ev) => updateStep(idx, { lockoutDeviceName: ev.target.value })}
                    >
                      <option value="">Select</option>
                      {uniqueSorted([...LOTO_LOCKOUT_DEVICE_OPTIONS, step.lockoutDeviceName]).map(
                        (device) => (
                          <option key={device} value={device}>
                            {device}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label
                      className="form-label text-uppercase small fw-semibold"
                      htmlFor={`loto-description-${idx}`}
                    >
                      Description
                    </label>
                    <input
                      id={`loto-description-${idx}`}
                      className="form-control"
                      list={`loto-description-options-${idx}`}
                      placeholder="Select"
                      value={step.descriptionCode}
                      onChange={(ev) => updateStep(idx, { descriptionCode: ev.target.value })}
                    />
                    <datalist id={`loto-description-options-${idx}`}>
                      {descriptions.map((code) => (
                        <option key={code} value={code} />
                      ))}
                    </datalist>
                  </div>
                  <div className="col-md-6">
                    <label
                      className="form-label text-uppercase small fw-semibold"
                      htmlFor={`loto-method-${idx}`}
                    >
                      Lockout method
                    </label>
                    <select
                      id={`loto-method-${idx}`}
                      className="form-select"
                      value={step.isolationAction}
                      onChange={(ev) => updateStep(idx, { isolationAction: ev.target.value })}
                    >
                      <option value="">Select</option>
                      {uniqueSorted([...LOTO_LOCKOUT_METHOD_OPTIONS, step.isolationAction]).map(
                        (method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label
                      className="form-label text-uppercase small fw-semibold"
                      htmlFor={`loto-custom-desc-${idx}`}
                    >
                      Enter your own description
                    </label>
                    <input
                      id={`loto-custom-desc-${idx}`}
                      className="form-control"
                      value={step.customDescription}
                      onChange={(ev) => updateStep(idx, { customDescription: ev.target.value })}
                    />
                    <p className="form-text small text-muted mb-0">
                      Used on QR label prints when selected — not shown on the printed procedure
                      sheet.
                    </p>
                  </div>
                  <div className="col-12">
                    <label
                      className="form-label text-uppercase small fw-semibold"
                      htmlFor={`loto-printed-${idx}`}
                    >
                      LOTO procedure description for printed sheet
                    </label>
                    <textarea
                      id={`loto-printed-${idx}`}
                      className="form-control"
                      rows={4}
                      value={step.printedProcedureDescription}
                      onChange={(ev) =>
                        updateStep(idx, { printedProcedureDescription: ev.target.value })
                      }
                    />
                  </div>
                </div>

                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- paste/drop target; focusing it already sets the active photo target, so keyboard users are covered */}
                <div
                  className="border border-dashed rounded p-3 mt-3"
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so Ctrl+V paste lands in this drop zone
                  tabIndex={0}
                  onFocus={() => setActivePhotoTarget(idx)}
                  onClick={() => setActivePhotoTarget(idx)}
                  onPaste={(event) => onPhotoPaste(event, idx)}
                  onDragOver={onPhotoDragOver}
                  onDrop={(event) => onPhotoDrop(event, idx)}
                  aria-label={`Step ${idx + 1} photo drop zone. Paste with Ctrl+V.`}
                >
                  <div className="fw-semibold mb-2">Step #{idx + 1} images</div>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={photoBusy || atMax}
                      onClick={() => stepUploadRefs.current[idx]?.click()}
                    >
                      Upload from device
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={photoBusy || atMax}
                      onClick={() => stepCameraRefs.current[idx]?.click()}
                    >
                      Take photo
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      disabled={photoBusy || atMax}
                      onClick={() => void pasteFromClipboard(idx)}
                    >
                      Paste
                    </button>
                    <input
                      ref={(el) => {
                        stepUploadRefs.current[idx] = el;
                      }}
                      type="file"
                      className="d-none"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic"
                      onChange={(ev) => {
                        void onStepImage(idx, ev.target.files);
                        ev.target.value = "";
                      }}
                    />
                    <input
                      ref={(el) => {
                        stepCameraRefs.current[idx] = el;
                      }}
                      type="file"
                      className="d-none"
                      accept="image/*"
                      capture="environment"
                      onChange={(ev) => {
                        void onStepImage(idx, ev.target.files);
                        ev.target.value = "";
                      }}
                    />
                  </div>
                  <p className="text-muted small mb-2">
                    {photoCount}/{LOTO_MAX_PHOTOS_PER_SLOT} — JPG, PNG, HEIC, WebP · Select multiple
                    files, paste, or drop onto this box
                  </p>
                  {stepPhotos.length > 0 ? (
                    <div className="d-flex flex-wrap gap-3">
                      {stepPhotos.map((photo, photoIndex) => {
                        const preview = photoSrc(photo);
                        return (
                          <div
                            key={`step-${idx}-photo-${photoIndex}`}
                            className="border rounded p-2"
                          >
                            {preview ? (
                              <LotoAnnotatedImage
                                src={preview}
                                alt={`Step ${idx + 1} photo ${photoIndex + 1}`}
                                arrows={photo.annotations}
                                imgStyle={{ maxHeight: 140 }}
                              />
                            ) : (
                              <p className="text-warning small mb-2">
                                Saved photo reference is not viewable here.
                              </p>
                            )}
                            <div className="d-flex flex-wrap gap-1 mt-2">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={photoBusy || !preview}
                                onClick={() => void copyPhoto(preview)}
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-dark"
                                disabled={photoBusy || !preview}
                                onClick={() =>
                                  setAnnotatorTarget({
                                    slot: "step",
                                    stepIndex: idx,
                                    photoIndex,
                                  })
                                }
                              >
                                Annotate
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                disabled={photoBusy}
                                onClick={() => removeStepPhoto(idx, photoIndex)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-outline-success w-100 mb-4"
          style={{ borderStyle: "dashed" }}
          onClick={() => setSteps((prev) => [...prev, emptyLotoStepForm()])}
        >
          <i className="bx bx-plus me-1" aria-hidden="true" />
          Add new step
        </button>

        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- paste/drop target; focusing it already sets the active photo target, so keyboard users are covered */}
        <div
          className="border rounded p-3 mb-3"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so Ctrl+V paste lands in this drop zone
          tabIndex={0}
          onFocus={() => setActivePhotoTarget("equipment")}
          onClick={() => setActivePhotoTarget("equipment")}
          onPaste={(event) => onPhotoPaste(event, "equipment")}
          onDragOver={onPhotoDragOver}
          onDrop={(event) => onPhotoDrop(event, "equipment")}
          aria-label="Equipment photo drop zone. Paste with Ctrl+V."
        >
          <h6 className="mb-1">Equipment images</h6>
          <p className="text-muted small mb-3">
            Upload, take, paste, or drop photos onto this box — they stay on the form (not a new
            tab). Up to {LOTO_MAX_PHOTOS_PER_SLOT} photos.
          </p>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="btn btn-success"
              disabled={
                photoBusy || (form.equipmentImages?.length ?? 0) >= LOTO_MAX_PHOTOS_PER_SLOT
              }
              onClick={() => equipmentUploadRef.current?.click()}
            >
              Upload from device
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={
                photoBusy || (form.equipmentImages?.length ?? 0) >= LOTO_MAX_PHOTOS_PER_SLOT
              }
              onClick={() => equipmentCameraRef.current?.click()}
            >
              Take photo
            </button>
            <button
              type="button"
              className="btn btn-outline-primary"
              disabled={
                photoBusy || (form.equipmentImages?.length ?? 0) >= LOTO_MAX_PHOTOS_PER_SLOT
              }
              onClick={() => void pasteFromClipboard("equipment")}
            >
              Paste
            </button>
            <input
              ref={equipmentUploadRef}
              type="file"
              className="d-none"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic"
              onChange={(ev) => {
                void onEquipmentImage(ev.target.files);
                ev.target.value = "";
              }}
            />
            <input
              ref={equipmentCameraRef}
              type="file"
              className="d-none"
              accept="image/*"
              capture="environment"
              onChange={(ev) => {
                void onEquipmentImage(ev.target.files);
                ev.target.value = "";
              }}
            />
          </div>
          <p className="text-muted small mb-2">
            {form.equipmentImages?.length ?? 0}/{LOTO_MAX_PHOTOS_PER_SLOT} — JPG, PNG, HEIC, WebP ·
            Select multiple files, paste, or drop
          </p>
          {(form.equipmentImages?.length ?? 0) > 0 ? (
            <div className="d-flex flex-wrap gap-3 mb-3">
              {(form.equipmentImages ?? []).map((photo, photoIndex) => {
                const preview = photoSrc(photo);
                return (
                  <div key={`equip-photo-${photoIndex}`} className="border rounded p-2">
                    {preview ? (
                      <LotoAnnotatedImage
                        src={preview}
                        alt={`Equipment photo ${photoIndex + 1}`}
                        arrows={photo.annotations}
                        imgStyle={{ maxHeight: 160 }}
                      />
                    ) : (
                      <p className="text-warning small mb-2">
                        Saved photo reference is not viewable here.
                      </p>
                    )}
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={photoBusy || !preview}
                        onClick={() => void copyPhoto(preview)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-dark"
                        disabled={photoBusy || !preview}
                        onClick={() => setAnnotatorTarget({ slot: "equipment", photoIndex })}
                      >
                        Annotate
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={photoBusy}
                        onClick={() => removeEquipmentPhoto(photoIndex)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <label className="form-label" htmlFor="loto-equipment-caption">
            Caption (optional)
          </label>
          <input
            id="loto-equipment-caption"
            className="form-control"
            value={form.equipmentImageCaption}
            onChange={(ev) =>
              setForm((prev) => ({ ...prev, equipmentImageCaption: ev.target.value }))
            }
          />
        </div>

        <div className="border rounded p-3 mb-4">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h3 className="h6 text-uppercase mb-0">Printable sheet — page 2</h3>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  printPurpose: LOTO_DEFAULT_PRINT_PURPOSE,
                  printScopeStatement: LOTO_DEFAULT_PRINT_SCOPE,
                  printEnforcement: LOTO_DEFAULT_PRINT_ENFORCEMENT,
                  shutdownSequence: LOTO_DEFAULT_SHUTDOWN_SEQUENCE.map((row) => ({ ...row })),
                  restoreSequence: LOTO_DEFAULT_RESTORE_SEQUENCE.map((row) => ({ ...row })),
                }))
              }
            >
              Reset to OSHA defaults
            </button>
          </div>
          <p className="text-muted small mb-3">
            These fields print on page 2 of the branded sheet. Lockout step photos and equipment
            photos print on page 1 when uploaded.
          </p>
          <div className="mb-3">
            <label className="form-label" htmlFor="loto-print-purpose">
              Purpose
            </label>
            <textarea
              id="loto-print-purpose"
              className="form-control"
              rows={2}
              value={form.printPurpose}
              onChange={(ev) => setForm((prev) => ({ ...prev, printPurpose: ev.target.value }))}
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="loto-print-scope">
              Scope
            </label>
            <textarea
              id="loto-print-scope"
              className="form-control"
              rows={2}
              value={form.printScopeStatement}
              onChange={(ev) =>
                setForm((prev) => ({ ...prev, printScopeStatement: ev.target.value }))
              }
            />
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="loto-print-enforcement">
              Enforcement
            </label>
            <textarea
              id="loto-print-enforcement"
              className="form-control"
              rows={2}
              value={form.printEnforcement}
              onChange={(ev) => setForm((prev) => ({ ...prev, printEnforcement: ev.target.value }))}
            />
          </div>

          {(
            [
              ["shutdownSequence", "Shutdown, lock, tag & try sequence"],
              ["restoreSequence", "Restore to service sequence"],
            ] as const
          ).map(([field, heading]) => (
            <div key={field} className="mb-4">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <h4 className="h6 mb-0">{heading}</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      [field]: [
                        ...prev[field],
                        { step: "", description: "" } as LotoSequenceStepForm,
                      ],
                    }))
                  }
                >
                  Add row
                </button>
              </div>
              {form[field].map((row, index) => (
                <div key={`${field}-${index}`} className="row g-2 mb-2 align-items-start">
                  <div className="col-md-3">
                    <input
                      className="form-control"
                      placeholder="Step title"
                      aria-label={`${heading} step ${index + 1} title`}
                      value={row.step}
                      onChange={(ev) =>
                        setForm((prev) => {
                          const next = prev[field].map((item, i) =>
                            i === index ? { ...item, step: ev.target.value } : item,
                          );
                          return { ...prev, [field]: next };
                        })
                      }
                    />
                  </div>
                  <div className="col-md-8">
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="Description"
                      aria-label={`${heading} step ${index + 1} description`}
                      value={row.description}
                      onChange={(ev) =>
                        setForm((prev) => {
                          const next = prev[field].map((item, i) =>
                            i === index ? { ...item, description: ev.target.value } : item,
                          );
                          return { ...prev, [field]: next };
                        })
                      }
                    />
                  </div>
                  <div className="col-md-1">
                    <button
                      type="button"
                      className="btn btn-outline-danger w-100"
                      aria-label={`Remove ${heading} row ${index + 1}`}
                      disabled={form[field].length <= 1}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          [field]: prev[field].filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <i className="bx bx-trash" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="row g-3">
          <div className="col-md-4">
            <input
              className="form-control"
              readOnly
              value={siteName || "Site"}
              aria-label="Site footer"
            />
          </div>
          <div className="col-md-4">
            <input
              className="form-control"
              readOnly
              value={form.areaName || "Area"}
              aria-label="Area footer"
            />
          </div>
          <div className="col-md-4">
            <input className="form-control" readOnly value={footerDate} aria-label="Date footer" />
          </div>
        </div>
      </div>
      <div className="card-footer d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {mode === "create" ? "Save Draft" : "Save changes"}
        </button>
      </div>

      {annotatorTarget?.slot === "equipment" &&
      photoSrc(form.equipmentImages?.[annotatorTarget.photoIndex] ?? emptyLotoPhotoForm()) ? (
        <LotoPhotoAnnotatorModal
          open
          title={`Equipment photo ${annotatorTarget.photoIndex + 1}`}
          imageSrc={photoSrc(form.equipmentImages![annotatorTarget.photoIndex]!)}
          initialArrows={form.equipmentImages![annotatorTarget.photoIndex]!.annotations}
          onCancel={() => setAnnotatorTarget(null)}
          onSave={(arrows: LotoImageArrow[]) => {
            const photoIndex = annotatorTarget.photoIndex;
            setForm((prev) => {
              const photos = [...(prev.equipmentImages ?? [])];
              const current = photos[photoIndex];
              if (!current) return prev;
              photos[photoIndex] = { ...current, annotations: arrows };
              return {
                ...prev,
                ...syncEquipmentLegacyPhotoFields({ ...prev, equipmentImages: photos }),
              };
            });
            setAnnotatorTarget(null);
            setPhotoNotice(
              arrows.length
                ? `Saved ${arrows.length} arrow${arrows.length === 1 ? "" : "s"} on equipment photo ${photoIndex + 1}.`
                : `Cleared arrows on equipment photo ${photoIndex + 1}.`,
            );
          }}
        />
      ) : null}

      {annotatorTarget?.slot === "step" &&
      photoSrc(
        form.steps[annotatorTarget.stepIndex]?.stepImages?.[annotatorTarget.photoIndex] ??
          emptyLotoPhotoForm(),
      ) ? (
        <LotoPhotoAnnotatorModal
          open
          title={`Step ${annotatorTarget.stepIndex + 1} photo ${annotatorTarget.photoIndex + 1}`}
          imageSrc={photoSrc(
            form.steps[annotatorTarget.stepIndex]!.stepImages![annotatorTarget.photoIndex]!,
          )}
          initialArrows={
            form.steps[annotatorTarget.stepIndex]!.stepImages![annotatorTarget.photoIndex]!
              .annotations
          }
          onCancel={() => setAnnotatorTarget(null)}
          onSave={(arrows: LotoImageArrow[]) => {
            const { stepIndex, photoIndex } = annotatorTarget;
            setSteps((prev) =>
              prev.map((step, i) => {
                if (i !== stepIndex) return step;
                const photos = [...(step.stepImages ?? [])];
                const current = photos[photoIndex];
                if (!current) return step;
                photos[photoIndex] = { ...current, annotations: arrows };
                return syncStepLegacyPhotoFields({ ...step, stepImages: photos });
              }),
            );
            setAnnotatorTarget(null);
            setPhotoNotice(
              arrows.length
                ? `Saved ${arrows.length} arrow${arrows.length === 1 ? "" : "s"} on step ${stepIndex + 1} photo ${photoIndex + 1}.`
                : `Cleared arrows on step ${stepIndex + 1} photo ${photoIndex + 1}.`,
            );
          }}
        />
      ) : null}
    </form>
  );
}
