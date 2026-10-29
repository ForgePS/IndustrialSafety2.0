export type {
  ForgePhotoMarkupEditorProps,
  LineStyle,
  MarkupDocument,
  MarkupTool,
  PhotoAnnotation,
  PhotoAnnotationType,
  StrokePreset,
} from "./types.js";

export {
  SAFETY_COLORS,
  DEFAULT_MARKUP_COLOR,
  STROKE_PRESETS,
  STROKE_WIDTHS,
  FONT_SIZES,
  TEXT_QUICK_STYLES,
  HIGHLIGHT_DEFAULT,
} from "./colors.js";
export { createAnnotationId, clampUnit, clamp } from "./ids.js";
export { normalizeAnnotations, normalizeMarkupDocument, createEmptyDocument } from "./normalize.js";
export { HistoryManager } from "./history.js";
export { annotationsToSvgMarkup, annotationToSvg } from "./svg.js";
export { renderMarkedUpImage, buildMarkupDocument } from "./render.js";
export {
  lotoArrowsToAnnotations,
  annotationsToLotoArrows,
  type LotoImageArrow,
} from "./loto-bridge.js";
export { useMarkupEditor } from "./useMarkupEditor.js";
export { MarkupCanvas } from "./MarkupCanvas.js";
export { MarkupToolbar, ColorPicker } from "./Toolbar.js";
export {
  SAFETY_ICONS,
  SAFETY_ICON_CATEGORIES,
  getSafetyIcon,
  searchSafetyIcons,
  safetyIconSvgMarkup,
  type SafetyIconDef,
  type SafetyIconCategory,
} from "./safety-icons.js";
export { SafetyIconPicker } from "./SafetyIconPicker.js";
export { ForgePhotoMarkupEditor } from "./ForgePhotoMarkupEditor.js";
export { PhotoCompareViewer, type CompareMode } from "./PhotoCompareViewer.js";
export {
  saveMarkupSessionDraft,
  loadMarkupSessionDraft,
  clearMarkupSessionDraft,
  markupDraftStorageKey,
  type MarkupSessionDraft,
} from "./draft-storage.js";
export {
  resolveReportPhotos,
  reportPhotosHtml,
  type ReportPhotoPreference,
  type ReportPhotoSource,
  type ReportPhotoRender,
} from "./report-photo.js";
