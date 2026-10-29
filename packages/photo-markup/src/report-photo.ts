/**
 * Report / print preference for photos that may have markup.
 * Original is always retained; this only chooses what to render in reports.
 */

export type ReportPhotoPreference = "original" | "marked_if_available" | "both" | "ask";

export type ReportPhotoSource = {
  /** Display / marked (or only) image */
  dataUrl?: string;
  originalDataUrl?: string;
  hasMarkup?: boolean;
  fileName?: string;
  caption?: string;
};

export type ReportPhotoRender = {
  src: string;
  label: string;
  kind: "original" | "marked";
  fileName?: string;
  caption?: string;
};

export function resolveReportPhotos(
  photo: ReportPhotoSource,
  preference: ReportPhotoPreference = "marked_if_available",
): ReportPhotoRender[] {
  const marked = String(photo.dataUrl ?? "").trim();
  const original = String(photo.originalDataUrl ?? "").trim() || (photo.hasMarkup ? "" : marked);
  const hasMarked = Boolean(photo.hasMarkup && marked);
  const name = photo.fileName;
  const caption = photo.caption;

  if (preference === "original") {
    const src = original || marked;
    return src
      ? [
          {
            src,
            label: "Original",
            kind: "original",
            ...(name ? { fileName: name } : {}),
            ...(caption ? { caption } : {}),
          },
        ]
      : [];
  }

  if (preference === "both") {
    const out: ReportPhotoRender[] = [];
    if (original) {
      out.push({
        src: original,
        label: "Original",
        kind: "original",
        ...(name ? { fileName: name } : {}),
        ...(caption ? { caption } : {}),
      });
    }
    if (hasMarked) {
      out.push({
        src: marked,
        label: "Marked-up",
        kind: "marked",
        ...(name ? { fileName: name } : {}),
        ...(caption ? { caption } : {}),
      });
    } else if (marked && !original) {
      out.push({
        src: marked,
        label: "Photo",
        kind: "original",
        ...(name ? { fileName: name } : {}),
        ...(caption ? { caption } : {}),
      });
    }
    return out;
  }

  // marked_if_available (and ask defaults to this until UI prompts)
  if (hasMarked) {
    return [
      {
        src: marked,
        label: "Marked-up",
        kind: "marked",
        ...(name ? { fileName: name } : {}),
        ...(caption ? { caption } : {}),
      },
    ];
  }
  const src = marked || original;
  return src
    ? [
        {
          src,
          label: "Photo",
          kind: "original",
          ...(name ? { fileName: name } : {}),
          ...(caption ? { caption } : {}),
        },
      ]
    : [];
}

export function reportPhotosHtml(
  photos: readonly ReportPhotoSource[],
  preference: ReportPhotoPreference = "marked_if_available",
  escapeHtml: (value: string) => string = (v) =>
    v
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
): string {
  const blocks: string[] = [];
  photos.forEach((photo, index) => {
    const renders = resolveReportPhotos(photo, preference);
    for (const render of renders) {
      const caption = render.caption || render.fileName || `Photo ${index + 1}`;
      blocks.push(
        `<figure style="margin:12px 0">` +
          `<img src="${escapeHtml(render.src)}" alt="${escapeHtml(caption)}" style="max-width:100%;max-height:420px;border:1px solid #ccc;border-radius:4px" />` +
          `<figcaption style="font-size:12px;color:#555;margin-top:4px">${escapeHtml(render.label)} — ${escapeHtml(caption)}</figcaption>` +
          `</figure>`,
      );
    }
  });
  return blocks.join("");
}
