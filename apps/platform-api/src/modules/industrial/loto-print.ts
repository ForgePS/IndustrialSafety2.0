/**
 * Printable Lock Out / Tag Out procedure — Producers 2-page sheet layout.
 * Page 1: metadata, notes, lockout steps (+ photos when uploaded).
 * Page 2: editable purpose / scope / enforcement and sequence tables.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { absolutizePrintLogoUrl } from "./training-paper-quiz.js";

export function escapeLotoHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainLotoPrintText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("[object Object]")) return "";
  return trimmed;
}

function isDisplayableImage(url: unknown): boolean {
  const value = plainLotoPrintText(url);
  return (
    value.startsWith("data:image/") || value.startsWith("https://") || value.startsWith("http://")
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

let cachedSheetDataUrl: string | null | undefined;

export function loadProducersLotoSheetDataUrl(): string | null {
  if (cachedSheetDataUrl !== undefined) return cachedSheetDataUrl;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "../../../assets/branding/producers-loto-procedure-sheet.png"),
    path.join(process.cwd(), "assets/branding/producers-loto-procedure-sheet.png"),
    path.join(
      process.cwd(),
      "apps/platform-api/assets/branding/producers-loto-procedure-sheet.png",
    ),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const bytes = readFileSync(candidate);
      cachedSheetDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
      return cachedSheetDataUrl;
    } catch {
      // try next
    }
  }
  cachedSheetDataUrl = null;
  return null;
}

export function resolveLotoSheetBackgroundUrl(appBaseUrl?: string | null): string {
  return (
    loadProducersLotoSheetDataUrl() ||
    absolutizePrintLogoUrl("/branding/producers-loto-procedure-sheet.png", appBaseUrl) ||
    "https://d1n0e5wvjwbpdf.cloudfront.net/branding/producers-loto-procedure-sheet.png"
  );
}

export type LotoSequenceStep = { step: string; description: string };

export const LOTO_DEFAULT_PRINT_PURPOSE =
  "To protect authorized employees against unexpected or unplanned activation of equipment or energy while servicing equipment.";

export const LOTO_DEFAULT_PRINT_SCOPE =
  "Utilize this procedure for all scheduled PM shutdowns, any maintenance task that requires you to place your body in harms way of the equipment, or if you have to leave the area while the equipment is in service.";

export const LOTO_DEFAULT_PRINT_ENFORCEMENT =
  "Failure to properly follow lockout-tagout procedure may result in corrective action up to and including termination.";

export const LOTO_DEFAULT_SHUTDOWN_SEQUENCE: LotoSequenceStep[] = [
  {
    step: "Notify Employees",
    description:
      "Notify all affected employees that servicing or maintenance is required on a machine or equipment, and that the machine or equipment must be shut down and locked out to perform the servicing or maintenance.",
  },
  {
    step: "Review Lockout Procedure",
    description:
      "The authorized employee shall refer to the company procedure to identify the type and magnitude of the energy that the machine or equipment utilizes, shall understand the hazards of the energy, and shall know the methods to control the energy.",
  },
  {
    step: "Perform Machine Stop",
    description:
      "If the machine or equipment is operating, shut it down by the normal stopping procedure (depress stop button, open toggle switch, etc.).",
  },
  {
    step: "Isolate Energy",
    description:
      "De-activate the energy isolating device(s) so that the machine or equipment is isolated from the energy source(s).",
  },
  {
    step: "Lockout Energy",
    description: "Lock out the energy isolating device(s) with assigned individual lock(s).",
  },
  {
    step: "Dissipate Energy",
    description:
      "Stored or residual energy (such as that in capacitors, springs, elevated machine members, rotating flywheels, hydraulic systems, and air, gas, steam, or water pressure, etc.) must be dissipated or restrained by methods such as grounding, repositioning, blocking, bleeding down, etc.",
  },
  {
    step: "Attempt Restart",
    description:
      'Ensure that the equipment is disconnected from the energy source(s) by first checking that no personnel are exposed, then verify the isolation of the equipment by operating the push button or other normal operating control(s) or by testing to make certain the equipment will not operate. Caution: Return operating control(s) to neutral or "off" position after verifying the isolation of the equipment.',
  },
];

export const LOTO_DEFAULT_RESTORE_SEQUENCE: LotoSequenceStep[] = [
  {
    step: "Check Machine",
    description:
      "Check the machine or equipment and the immediate area around the machine or equipment to ensure that nonessential items have been removed and that the machine or equipment components are operationally intact.",
  },
  {
    step: "Check Area",
    description:
      "Check the work area to ensure that all employees have been safely positioned or removed from the area.",
  },
  {
    step: "Verify Machine",
    description: "Verify that the controls are in neutral.",
  },
  {
    step: "Remove Lockout",
    description:
      "Remove the lockout devices and reenergize the machine or equipment. Note: The removal of some forms of blocking may require reenergization of the machine before safe removal.",
  },
  {
    step: "Notify Employees",
    description:
      "Notify affected employees that the servicing or maintenance is completed and the machine or equipment is ready for use.",
  },
];

export type LotoPrintableInput = {
  detail: Record<string, unknown>;
  appBaseUrl?: string | null;
  sheetBackgroundUrl?: string | null;
  /** Procedure scan QR (same public link as the LOTO QR sticker). */
  qrImageDataUrl?: string | null;
};

function normalizeSequence(raw: unknown, fallback: LotoSequenceStep[]): LotoSequenceStep[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((row) => ({ ...row }));
  const rows: LotoSequenceStep[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const step =
      plainLotoPrintText(row.step) || plainLotoPrintText(row.title) || plainLotoPrintText(row.name);
    const description =
      plainLotoPrintText(row.description) ||
      plainLotoPrintText(row.text) ||
      plainLotoPrintText(row.instruction);
    if (!step && !description) continue;
    rows.push({ step: step || "Step", description });
  }
  return rows.length > 0 ? rows : fallback.map((row) => ({ ...row }));
}

function normalizeNotes(raw: unknown): string {
  if (typeof raw === "string" && plainLotoPrintText(raw)) return plainLotoPrintText(raw);
  if (!Array.isArray(raw)) return "";
  const parts: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && plainLotoPrintText(item)) {
      parts.push(plainLotoPrintText(item));
      continue;
    }
    const row = asRecord(item);
    const text =
      plainLotoPrintText(row.text) ||
      plainLotoPrintText(row.body) ||
      plainLotoPrintText(row.note) ||
      plainLotoPrintText(row.content);
    if (text) parts.push(text);
  }
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

type LotoPrintArrow = { id: string; x1: number; y1: number; x2: number; y2: number };

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeLotoPrintArrows(raw: unknown): LotoPrintArrow[] {
  if (!Array.isArray(raw)) return [];
  const arrows: LotoPrintArrow[] = [];
  for (const [index, item] of raw.entries()) {
    const row = asRecord(item);
    const x1 = Number(row.x1);
    const y1 = Number(row.y1);
    const x2 = Number(row.x2);
    const y2 = Number(row.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx * dx + dy * dy < 0.00005) continue;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `arrow-${index}`;
    arrows.push({
      id,
      x1: clampUnit(x1),
      y1: clampUnit(y1),
      x2: clampUnit(x2),
      y2: clampUnit(y2),
    });
  }
  return arrows;
}

function arrowHeadPoints(arrow: LotoPrintArrow, headLength = 0.045): string {
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const tipX = arrow.x2;
  const tipY = arrow.y2;
  const baseX = tipX - ux * headLength;
  const baseY = tipY - uy * headLength;
  const half = headLength * 0.55;
  return `${tipX},${tipY} ${baseX + px * half},${baseY + py * half} ${baseX - px * half},${baseY - py * half}`;
}

function annotatedImageHtml(
  url: unknown,
  alt: string,
  arrows: readonly LotoPrintArrow[],
  className = "photo",
): string {
  if (!isDisplayableImage(url)) return "";
  const svg =
    arrows.length > 0
      ? `<svg class="loto-photo-arrows" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${arrows
          .map((arrow) => {
            const stroke = "#dc2626";
            const outline = "#ffffff";
            return [
              `<line x1="${arrow.x1}" y1="${arrow.y1}" x2="${arrow.x2}" y2="${arrow.y2}" stroke="${outline}" stroke-width="0.018" stroke-linecap="round" />`,
              `<line x1="${arrow.x1}" y1="${arrow.y1}" x2="${arrow.x2}" y2="${arrow.y2}" stroke="${stroke}" stroke-width="0.01" stroke-linecap="round" />`,
              `<polygon points="${arrowHeadPoints(arrow)}" fill="${stroke}" stroke="${outline}" stroke-width="0.006" />`,
            ].join("");
          })
          .join("")}</svg>`
      : "";
  return `<figure class="${className} loto-annotated-photo"><img src="${plainLotoPrintText(url)}" alt="${escapeLotoHtml(alt)}" />${svg}</figure>`;
}

const LOTO_PRINT_MAX_PHOTOS = 6;

type LotoPrintPhoto = { imageUrl: string; annotations: LotoPrintArrow[] };

function collectPrintPhotos(
  raw: unknown,
  legacy?: { imageUrl?: unknown; annotations?: unknown },
): LotoPrintPhoto[] {
  const fromArray: LotoPrintPhoto[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const row = asRecord(item);
      const imageUrl =
        plainLotoPrintText(row.imageUrl) ||
        plainLotoPrintText(row.stepImageUrl) ||
        plainLotoPrintText(row.equipmentImageUrl) ||
        plainLotoPrintText(row.stepImageStorageKey) ||
        plainLotoPrintText(row.equipmentImageStorageKey) ||
        plainLotoPrintText(row.url);
      if (!isDisplayableImage(imageUrl)) continue;
      fromArray.push({
        imageUrl,
        annotations: normalizeLotoPrintArrows(
          row.annotations ?? row.stepImageAnnotations ?? row.equipmentImageAnnotations,
        ),
      });
      if (fromArray.length >= LOTO_PRINT_MAX_PHOTOS) break;
    }
  }
  if (fromArray.length > 0) return fromArray;
  const legacyUrl = plainLotoPrintText(legacy?.imageUrl);
  if (!isDisplayableImage(legacyUrl)) return [];
  return [
    {
      imageUrl: legacyUrl,
      annotations: normalizeLotoPrintArrows(legacy?.annotations),
    },
  ];
}

function annotatedPhotosHtml(
  photos: LotoPrintPhoto[],
  altPrefix: string,
  className: string,
): string {
  return photos
    .map((photo, index) =>
      annotatedImageHtml(
        photo.imageUrl,
        photos.length > 1 ? `${altPrefix} ${index + 1}` : altPrefix,
        photo.annotations,
        className,
      ),
    )
    .filter(Boolean)
    .join("");
}

function energyIcon(energyType: string): string {
  const key = energyType.toLowerCase();
  if (key.includes("electric")) return "⚡";
  if (key.includes("pneumatic") || key.includes("air")) return "💨";
  if (key.includes("hydraulic")) return "🛢";
  if (key.includes("thermal") || key.includes("steam") || key.includes("heat")) return "🔥";
  if (key.includes("gravity") || key.includes("mechanic")) return "⚙";
  return "🔒";
}

type LotoEnergyLetter = "E" | "P" | "H" | "W" | "C" | "G" | "M" | "T" | "CG";

const LOTO_ENERGY_LETTER_COLORS: Record<LotoEnergyLetter, { bg: string; fg: string }> = {
  E: { bg: "#dc2626", fg: "#ffffff" },
  P: { bg: "#2563eb", fg: "#ffffff" },
  C: { bg: "#ea580c", fg: "#ffffff" },
  G: { bg: "#eab308", fg: "#111827" },
  M: { bg: "#7c3aed", fg: "#ffffff" },
  T: { bg: "#111827", fg: "#ffffff" },
  W: { bg: "#16a34a", fg: "#ffffff" },
  CG: { bg: "#800000", fg: "#ffffff" },
  H: { bg: "#92400e", fg: "#ffffff" },
};

export function parseLotoPrintEnergyLetter(
  descriptionCode?: string,
  energyName?: string,
): LotoEnergyLetter | null {
  const code = String(descriptionCode ?? "")
    .trim()
    .toUpperCase();
  if (code) {
    const fromCode =
      code.match(/^(CG)(?=[\s\-_0-9]|$)/) || code.match(/^([EPHWGMT]|C)(?=[\s\-_0-9]|$)/);
    if (fromCode?.[1] === "CG") return "CG";
    if (fromCode?.[1]) return fromCode[1] as LotoEnergyLetter;
  }
  const name = String(energyName ?? "")
    .trim()
    .toLowerCase();
  if (!name) return null;
  if (name.includes("controlled gravity") || name === "cg") return "CG";
  if (name.includes("electric")) return "E";
  if (name.includes("pneumatic") || /\bair\b/.test(name)) return "P";
  if (name.includes("hydraulic")) return "H";
  if (name.includes("water")) return "W";
  if (name.includes("chemical")) return "C";
  if (name.includes("gravity")) return "G";
  if (name.includes("mechanic")) return "M";
  if (name.includes("thermal") || name.includes("heat") || name.includes("steam")) return "T";
  return null;
}

function energyLetterColors(
  descriptionCode: string,
  energyName: string,
): { letter: LotoEnergyLetter | null; bg: string; fg: string } {
  const letter = parseLotoPrintEnergyLetter(descriptionCode, energyName);
  if (!letter) return { letter: null, bg: "#c00000", fg: "#ffffff" };
  return { letter, ...LOTO_ENERGY_LETTER_COLORS[letter] };
}

function formatDate(value: unknown): string {
  const text = plainLotoPrintText(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function isolationStepsOnly(steps: unknown[]): Record<string, unknown>[] {
  const mapped = steps.map((raw) => asRecord(raw));
  const isolation = mapped.filter((row) => !row.isVerification);
  return isolation.length > 0 ? isolation : mapped;
}

/** Build letter-size printable HTML matching the Producers LOTO example sheet. */
export function buildLotoPrintableHtml(input: LotoPrintableInput): string {
  const detail = input.detail;
  const procedure = asRecord(detail.procedure);
  const equipmentName =
    plainLotoPrintText(detail.equipmentName) ||
    plainLotoPrintText(procedure.equipmentName) ||
    plainLotoPrintText(detail.title) ||
    plainLotoPrintText(procedure.title) ||
    "LOTO Procedure";
  const procedureNumber =
    plainLotoPrintText(detail.procedureNumber) ||
    plainLotoPrintText(procedure.procedureNumber) ||
    "";
  const revision =
    plainLotoPrintText(detail.revision) || plainLotoPrintText(procedure.revision) || "1";
  const siteName =
    plainLotoPrintText(detail.siteName) || plainLotoPrintText(procedure.siteName) || "";
  const departmentName =
    plainLotoPrintText(detail.departmentName) || plainLotoPrintText(procedure.departmentName) || "";
  const areaName =
    plainLotoPrintText(detail.areaName) || plainLotoPrintText(procedure.areaName) || "";
  const facility = [siteName, departmentName].filter(Boolean).join(" — ") || siteName || "—";
  const location = [areaName, departmentName || siteName].filter(Boolean).join(" / ") || "—";
  const created =
    formatDate(detail.createdAt) ||
    formatDate(procedure.createdAt) ||
    formatDate(detail.effectiveAt) ||
    "";
  const revised = formatDate(detail.updatedAt) || formatDate(procedure.updatedAt) || created;
  const noteText =
    normalizeNotes(detail.notes) ||
    normalizeNotes(procedure.notes) ||
    "Ensure the machine has come to a complete stop before applying lockout devices. Watch for pinch points and bleed off residual energy before beginning work.";
  const equipmentImageUrl =
    plainLotoPrintText(detail.equipmentImageUrl) ||
    plainLotoPrintText(procedure.equipmentImageUrl) ||
    "";
  const equipmentImageAnnotations = normalizeLotoPrintArrows(
    detail.equipmentImageAnnotations ??
      procedure.equipmentImageAnnotations ??
      asRecord(procedure.source_payload ?? procedure.sourcePayload).equipmentImageAnnotations,
  );
  const equipmentPhotos = collectPrintPhotos(
    detail.equipmentImages ??
      procedure.equipmentImages ??
      asRecord(procedure.source_payload ?? procedure.sourcePayload).equipmentImages,
    { imageUrl: equipmentImageUrl, annotations: equipmentImageAnnotations },
  );

  const printPurpose =
    plainLotoPrintText(detail.printPurpose) ||
    plainLotoPrintText(procedure.printPurpose) ||
    LOTO_DEFAULT_PRINT_PURPOSE;
  const printScopeStatement =
    plainLotoPrintText(detail.printScopeStatement) ||
    plainLotoPrintText(procedure.printScopeStatement) ||
    LOTO_DEFAULT_PRINT_SCOPE;
  const printEnforcement =
    plainLotoPrintText(detail.printEnforcement) ||
    plainLotoPrintText(procedure.printEnforcement) ||
    LOTO_DEFAULT_PRINT_ENFORCEMENT;
  const shutdownSequence = normalizeSequence(
    detail.shutdownSequence ?? procedure.shutdownSequence,
    LOTO_DEFAULT_SHUTDOWN_SEQUENCE,
  );
  const restoreSequence = normalizeSequence(
    detail.restoreSequence ?? procedure.restoreSequence,
    LOTO_DEFAULT_RESTORE_SEQUENCE,
  );

  const sheetUrl =
    plainLotoPrintText(input.sheetBackgroundUrl) || resolveLotoSheetBackgroundUrl(input.appBaseUrl);
  const qrImageDataUrl = isDisplayableImage(input.qrImageDataUrl)
    ? plainLotoPrintText(input.qrImageDataUrl)
    : "";

  const rawSteps = Array.isArray(detail.steps) ? detail.steps : [];
  const steps = isolationStepsOnly(rawSteps);

  const stepRowHtmls = steps.map((row, index) => {
    const payload = asRecord(row.sourcePayload);
    const stepNumber = index + 1;
    const energyType =
      plainLotoPrintText(payload.energySourceName) ||
      plainLotoPrintText(payload.energyType) ||
      plainLotoPrintText(row.energyType) ||
      "Energy";
    const energyCode =
      plainLotoPrintText(payload.descriptionCode) ||
      plainLotoPrintText(payload.energyMagnitude) ||
      plainLotoPrintText(payload.magnitude) ||
      "";
    const colors = energyLetterColors(energyCode, energyType);
    const lockLetter = colors.letter ? `🔒${colors.letter}` : energyIcon(energyType);
    const location = plainLotoPrintText(payload.isolationLocationText);
    const isolationAction = plainLotoPrintText(payload.isolationAction);
    const device = plainLotoPrintText(payload.lockoutDeviceName);
    const deviceSentence = device
      ? device.toLowerCase().startsWith("use ")
        ? device
        : `Use a ${device} device.`
      : "";
    const customDescription =
      plainLotoPrintText(payload.customDescription) ||
      plainLotoPrintText(payload.customText) ||
      plainLotoPrintText(row.customDescription) ||
      plainLotoPrintText(row.customText);
    const printed =
      plainLotoPrintText(payload.printedProcedureDescription) ||
      plainLotoPrintText(payload.printedDescription) ||
      plainLotoPrintText(row.instruction);
    let action = printed;
    if (!action) {
      action = [
        location ? `The disconnect is located at ${location}.` : "",
        isolationAction || `Isolate ${energyType}`,
        deviceSentence,
      ]
        .filter(Boolean)
        .join(" ");
    } else if (
      deviceSentence &&
      !action.toLowerCase().includes("lock") &&
      !action.toLowerCase().includes(device.toLowerCase())
    ) {
      action = `${action} ${deviceSentence}`;
    }
    // Own description lives under Step # — strip auto-built Detail: from Action.
    if (customDescription) {
      const detailMarker = `Detail: ${customDescription}`;
      const idx = action.toLowerCase().indexOf(detailMarker.toLowerCase());
      if (idx >= 0) {
        const before = action
          .slice(0, idx)
          .replace(/\s*[—-]\s*$/, "")
          .trim();
        const after = action
          .slice(idx + detailMarker.length)
          .replace(/^\s*[—-]\s*/, "")
          .trim();
        action = [before, after].filter(Boolean).join(" — ");
      }
    }
    const verification =
      plainLotoPrintText(payload.verificationMethodName) ||
      plainLotoPrintText(payload.verification) ||
      "Attempt restart at all control panels.";
    const stepPhotos = collectPrintPhotos(payload.stepImages ?? row.stepImages, {
      imageUrl:
        plainLotoPrintText(payload.stepImageUrl) ||
        plainLotoPrintText(row.stepImageUrl) ||
        plainLotoPrintText(payload.stepImageStorageKey),
      annotations: payload.stepImageAnnotations ?? row.stepImageAnnotations,
    });
    const infoCell = annotatedPhotosHtml(stepPhotos, `Lockout point ${stepNumber}`, "info-photo");
    return `<tr>
        <td class="step-num" style="background:${colors.bg};color:${colors.fg};">
          <div class="step-line">${stepNumber} ${escapeLotoHtml(energyType)}</div>
          ${
            energyCode
              ? `<div class="step-badge" style="color:${colors.bg};"><span class="bolt" style="color:${colors.bg};">${lockLetter}</span> ${escapeLotoHtml(energyCode)}</div>`
              : `<div class="step-badge" style="color:${colors.bg};"><span class="bolt" style="color:${colors.bg};">${lockLetter}</span></div>`
          }
        </td>
        <td class="step-action">${escapeLotoHtml(action)}</td>
        <td class="step-info">${infoCell}</td>
        <td class="step-verify">${escapeLotoHtml(verification)}</td>
      </tr>`;
  });

  const equipmentHero = equipmentPhotos.length
    ? `<div class="equip-hero">${annotatedPhotosHtml(equipmentPhotos, "Equipment photo", "equip-photo")}</div>`
    : "";

  const qrCellHtml = qrImageDataUrl
    ? `<td class="meta-qr" rowspan="2">
        <img class="meta-qr-img" src="${qrImageDataUrl}" alt="LOTO procedure QR code" />
      </td>`
    : `<td class="meta-qr meta-qr--empty" rowspan="2">
        <div class="meta-qr-caption">Open QR once, then reprint</div>
      </td>`;

  const lockoutPointLabel = steps.length === 1 ? "LOCKOUT POINT" : "LOCKOUT POINTS";
  const facilityLine =
    [siteName, departmentName || areaName].filter(Boolean).join(" - ") || facility;
  const locationLine = plainLotoPrintText(areaName) || location;

  const emptyStepRow = `<tr><td class="step-num"><div class="step-line">1</div></td><td colspan="3">No lockout steps saved.</td></tr>`;
  const stepRowsHtml = stepRowHtmls.length > 0 ? stepRowHtmls.join("") : emptyStepRow;

  const isolationSheetsHtml = `<div class="sheet sheet--page1">
    <div class="page-body">
      <div class="page-main">
        <table class="meta">
          <tr>
            <td class="meta-ids" rowspan="2">
              <div class="meta-row"><span class="label">ID#:</span><span class="value">${escapeLotoHtml(procedureNumber || "")}</span></div>
              <div class="meta-row"><span class="label">Created:</span><span class="value">${escapeLotoHtml(created || "—")}</span></div>
              <div class="meta-row"><span class="label">Revised:</span><span class="value">${escapeLotoHtml(revised || "—")}</span></div>
            </td>
            <td>
              <span class="label-block">Facility:</span>
              <span class="value-block">${escapeLotoHtml(facilityLine)}</span>
            </td>
            <td>
              <span class="label-block">Location:</span>
              <span class="value-block">${escapeLotoHtml(locationLine)}</span>
            </td>
            ${qrCellHtml}
          </tr>
          <tr>
            <td colspan="2">
              <span class="label-block">Description:</span>
              <span class="value-block">${escapeLotoHtml(equipmentName)}</span>
            </td>
          </tr>
        </table>

        <div class="lockout-note">
          <div class="lockout-banner">
            <div class="txt">${escapeLotoHtml(lockoutPointLabel)}</div>
            <div class="num">${Math.max(steps.length, 1)}</div>
          </div>
          <div class="note-box">
            <span class="note-label">NOTE:</span> ${escapeLotoHtml(noteText)}
          </div>
        </div>

        ${equipmentHero}

        <div class="section-bar">ENERGY ISOLATION POINT</div>
        <table class="steps-table">
          <thead>
            <tr>
              <th>Step #</th>
              <th>Action</th>
              <th>Info</th>
              <th>Verification</th>
            </tr>
          </thead>
          <tbody>
            ${stepRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;

  const shutdownRows = shutdownSequence
    .map(
      (row, i) =>
        `<tr><td class="seq-num">${i + 1}</td><td class="seq-step">${escapeLotoHtml(row.step)}</td><td>${escapeLotoHtml(row.description)}</td></tr>`,
    )
    .join("");
  const restoreRows = restoreSequence
    .map(
      (row, i) =>
        `<tr><td class="seq-num">${i + 1}</td><td class="seq-step">${escapeLotoHtml(row.step)}</td><td>${escapeLotoHtml(row.description)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeLotoHtml(equipmentName)} — LOTO</title>
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      line-height: 1.25;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 0.85rem;
      background: #1f2a37;
      color: #fff;
      font-size: 11pt;
    }
    .print-toolbar p { margin: 0; opacity: 0.9; }
    .print-toolbar button {
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      border: 0;
      border-radius: 6px;
      padding: 0.45rem 0.9rem;
      background: #fff;
      color: #111;
    }
    .sheet {
      width: 8.5in;
      height: 11in;
      margin: 0 auto;
      /*
       * Side padding matches the original PDF content column (~0.71in).
       * Top padding clears the tight full-bleed Producers header (~0.55in).
       */
      padding: 0.62in 0.71in 0.42in 0.71in;
      background-color: #fff;
      background-image: url("${sheetUrl}");
      background-repeat: no-repeat;
      background-position: top left;
      background-size: 8.5in 11in;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      position: relative;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet:last-of-type { page-break-after: auto; break-after: auto; }
    .page-body {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .page-main {
      flex: 1 1 auto;
      min-height: 0;
      overflow: visible;
    }
    .page-spacer { flex: 1 1 auto; min-height: 0.2in; }
    table { width: 100%; border-collapse: collapse; }
    .meta {
      margin: 0 0 0.2rem;
      table-layout: fixed;
      width: 100%;
    }
    .meta td {
      border: 1px solid #333;
      padding: 0.2rem 0.32rem;
      vertical-align: top;
      background: #fff;
    }
    .meta-ids { width: 24%; }
    .meta-ids .meta-row {
      display: flex;
      gap: 0.25rem;
      margin: 0.08rem 0;
      font-size: 9pt;
    }
    .meta-qr {
      width: 0.95in;
      text-align: center;
      vertical-align: middle !important;
      padding: 0.12rem !important;
    }
    .meta-qr-img {
      display: block;
      width: 0.78in;
      height: 0.78in;
      margin: 0 auto;
      object-fit: contain;
      background: #fff;
    }
    .meta-qr--empty {
      font-size: 6.5pt;
      color: #666;
      line-height: 1.2;
    }
    .meta-qr-caption {
      max-width: 0.85in;
      margin: 0 auto;
    }
    .meta .label {
      color: #111;
      font-size: 8.5pt;
      font-weight: 700;
      white-space: nowrap;
    }
    .meta .value {
      font-size: 9pt;
      font-weight: 500;
      color: #111;
    }
    .meta .label-block {
      display: block;
      font-size: 8pt;
      font-weight: 700;
      margin-bottom: 0.08rem;
    }
    .meta .value-block {
      display: block;
      font-size: 10pt;
      font-weight: 600;
    }
    .lockout-note {
      display: grid;
      grid-template-columns: 1.55in 1fr;
      gap: 0;
      margin: 0 0 0.28rem;
      align-items: stretch;
      border: 1px solid #333;
    }
    .lockout-banner {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 0.85in;
      border: 0;
      border-right: 1px solid #333;
      overflow: hidden;
      background: #c00000;
      color: #fff;
      padding: 0.12rem 0.2rem;
      text-align: center;
    }
    .lockout-banner .txt {
      font-size: 10pt;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: 0.02em;
    }
    .lockout-banner .num {
      font-size: 36pt;
      font-weight: 700;
      line-height: 1;
      margin-top: 0.06rem;
    }
    .note-box {
      border: 0;
      padding: 0.28rem 0.4rem;
      font-size: 8pt;
      line-height: 1.3;
      background: #e8e8e8;
    }
    .note-box .note-label { color: #b00000; font-weight: 700; }
    .equip-hero {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.25rem;
      margin: 0.15rem 0 0.35rem;
    }
    .equip-photo img {
      display: block;
      max-width: 4.6in;
      max-height: 1.45in;
      width: auto;
      height: auto;
      object-fit: contain;
      border: 1px solid #777;
      background: #fff;
    }
    .equip-hero .equip-photo:nth-child(n+2) img {
      max-width: 2.1in;
      max-height: 1.1in;
    }
    .loto-annotated-photo {
      position: relative;
      display: inline-block;
      line-height: 0;
      max-width: 100%;
    }
    .loto-annotated-photo img {
      max-width: 100%;
    }
    .loto-photo-arrows {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .section-bar {
      background: #111;
      color: #fff;
      text-align: center;
      font-weight: 700;
      font-size: 11pt;
      letter-spacing: 0.02em;
      padding: 0.18rem;
      margin: 0;
    }
    .section-bar.gray {
      background: #d0d0d0;
      color: #111;
      margin-top: 0.35rem;
      font-size: 10pt;
      padding: 0.14rem;
      border: 1px solid #333;
      border-bottom: 0;
    }
    .section-bar.shutdown {
      background: #c00000;
      color: #fff;
      margin-top: 0;
      font-size: 10pt;
      padding: 0.14rem;
      border: 0;
      border-bottom: 1px solid #8b0000;
    }
    .section-bar.restore {
      background: #1a7a2e;
      color: #fff;
      margin-top: 0;
      font-size: 10pt;
      padding: 0.14rem;
      border: 0;
      border-bottom: 1px solid #0f5a1f;
    }
    .steps-table th, .steps-table td,
    .seq-table th, .seq-table td {
      border: 1px solid #333;
      padding: 0.22rem 0.28rem;
      vertical-align: top;
    }
    .steps-table th {
      background: #fff;
      font-size: 9pt;
      text-align: center;
      font-weight: 700;
    }
    .step-num {
      width: 1.15in;
      background: #c00000;
      color: #fff;
      text-align: center;
      padding: 0.25rem 0.12rem !important;
    }
    .step-line { font-size: 10pt; font-weight: 700; line-height: 1.15; }
    .step-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.12rem;
      margin-top: 0.18rem;
      background: #fff;
      color: #c00000;
      border-radius: 0.1rem;
      padding: 0.06rem 0.18rem;
      font-size: 8pt;
      font-weight: 700;
    }
    .step-badge .bolt { color: #c00000; }
    .step-action { width: 38%; font-size: 8.5pt; }
    .step-info { width: 24%; text-align: center; }
    .step-verify { width: 24%; font-size: 8.5pt; }
    .info-photo { margin: 0 0 0.15rem; display: inline-block; }
    .info-photo img {
      display: block;
      margin: 0 auto;
      max-width: 100%;
      max-height: 1.15in;
      object-fit: contain;
      border: 1px solid #999;
      background: #fff;
    }
    .step-info .info-photo:nth-child(n+2) img {
      max-height: 0.8in;
    }
    .page2-title { display: none; }
    .page2-intro {
      border: 1px solid #333;
      padding: 0.28rem 0.4rem;
      margin: 0 0 0.28rem;
      width: 100%;
      box-sizing: border-box;
    }
    .page2-intro p { margin: 0.14rem 0; font-size: 8.5pt; }
    .page2-intro .enf { color: #b00000; font-weight: 700; }
    .seq-wrap {
      border: 1px solid #333;
      margin: 0 0 0.28rem;
      width: 100%;
      box-sizing: border-box;
    }
    .seq-table { margin: 0; font-size: 7.6pt; }
    .seq-table th {
      background: #eee;
      color: #111;
      font-size: 8pt;
      text-align: left;
      padding: 0.14rem 0.28rem;
    }
    .seq-table td { padding: 0.14rem 0.28rem; }
    .seq-num { width: 0.35in; text-align: center; font-weight: 700; }
    .seq-step {
      width: 1.45in;
      color: #0033a0;
      font-weight: 700;
      font-style: italic;
    }
    .osha-box {
      border: 1px solid #333;
      padding: 0.2rem 0.35rem;
      font-size: 7.5pt;
      color: #333;
      margin-top: auto;
    }
    @media screen {
      html, body { background: #d8dbe0; }
      .sheet {
        margin: 0.65rem auto;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
      }
    }
    @media print {
      html, body { background: #fff !important; }
      .print-toolbar { display: none !important; }
      .sheet { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar no-print">
    <p>LOTO printable — ${escapeLotoHtml(equipmentName)}</p>
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${isolationSheetsHtml}

  <div class="sheet">
    <div class="page-body">
      <div class="page-main">
        <div class="page2-intro">
          <p><strong>Purpose:</strong> ${escapeLotoHtml(printPurpose)}</p>
          <p><strong>Scope:</strong> ${escapeLotoHtml(printScopeStatement)}</p>
          <p class="enf"><strong>Enforcement:</strong> ${escapeLotoHtml(printEnforcement)}</p>
        </div>

        <div class="seq-wrap">
          <div class="section-bar shutdown">SHUTDOWN, LOCK, TAG &amp; TEST SEQUENCE</div>
          <table class="seq-table">
            <thead>
              <tr><th>#</th><th>STEP</th><th>DESCRIPTION</th></tr>
            </thead>
            <tbody>${shutdownRows}</tbody>
          </table>
        </div>

        <div class="seq-wrap">
          <div class="section-bar restore">RESTORE TO SERVICE SEQUENCE</div>
          <table class="seq-table">
            <thead>
              <tr><th>#</th><th>STEP</th><th>DESCRIPTION</th></tr>
            </thead>
            <tbody>${restoreRows}</tbody>
          </table>
        </div>
      </div>
      <div class="page-spacer"></div>
      <div class="osha-box">
        Reference: OSHA 29 CFR 1910.147, Appendix A, "Typical minimal lockout procedures - 29 CFR 1910.147 App A"
      </div>
    </div>
  </div>
</body>
</html>`;
}
