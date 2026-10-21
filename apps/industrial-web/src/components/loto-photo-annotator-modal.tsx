"use client";

import {
  ForgePhotoMarkupEditor,
  annotationsToLotoArrows,
  lotoArrowsToAnnotations,
  type LotoImageArrow,
} from "@forge/photo-markup";

type Props = {
  open: boolean;
  title: string;
  imageSrc: string;
  initialArrows: readonly LotoImageArrow[];
  onCancel: () => void;
  onSave: (arrows: LotoImageArrow[]) => void;
};

/**
 * LOTO host for the shared Forge Photo Markup Editor.
 * Persists arrows in the legacy LOTO overlay format for backward compatibility
 * with procedure JSON and print rendering.
 */
export function LotoPhotoAnnotatorModal({
  open,
  title,
  imageSrc,
  initialArrows,
  onCancel,
  onSave,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loto-photo-annotator-title"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1060 }}
      onClick={onCancel}
    >
      <div
        className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"
        role="document"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: "min(1100px, 96vw)" }}
      >
        <div className="modal-content" style={{ maxHeight: "92vh" }}>
          <div className="visually-hidden" id="loto-photo-annotator-title">
            Annotate photo — {title}
          </div>
          <ForgePhotoMarkupEditor
            embedded
            imageSrc={imageSrc}
            title={`Photo Markup — ${title}`}
            mode="full"
            module="loto"
            allowedTools={["select", "arrow", "eraser"]}
            initialAnnotations={lotoArrowsToAnnotations(initialArrows)}
            onCancel={onCancel}
            onSave={({ annotations }) => {
              onSave(annotationsToLotoArrows(annotations));
            }}
            style={{ minHeight: "70vh" }}
          />
        </div>
      </div>
    </div>
  );
}
