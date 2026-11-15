/** Annotation types for Forge Photo Markup Editor (normalized 0–1 coords). */

export type PhotoAnnotationType =
  | "pen"
  | "highlighter"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "polygon"
  | "text"
  | "icon"
  | "callout"
  | "blur"
  | "redaction";

export type MarkupTool =
  | "select"
  | "pen"
  | "highlighter"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "text"
  | "callout"
  | "icon"
  | "blur"
  | "redaction"
  | "crop"
  | "eraser";

export type LineStyle = "solid" | "dashed" | "dotted";

export type PhotoAnnotation = {
  id: string;
  type: PhotoAnnotationType;
  /** Top-left or start x in normalized 0–1 space */
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** End point for line/arrow (normalized) */
  x2?: number;
  y2?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  lineStyle?: LineStyle;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  backgroundColor?: string;
  iconKey?: string;
  calloutNumber?: number;
  calloutNote?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  /** Freehand / polygon points as [x,y,x,y,...] normalized */
  points?: number[];
  zIndex: number;
  createdByUserId?: string;
  createdAt?: string;
};

export type MarkupDocument = {
  version: 1;
  canvasWidth: number;
  canvasHeight: number;
  annotations: PhotoAnnotation[];
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotation?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
};

export type ForgePhotoMarkupEditorProps = {
  /** Image URL or data URL to annotate (original is never modified). */
  imageSrc: string;

  photoId?: string;
  tenantId?: string;
  module?: string;
  recordId?: string;
  locationId?: string;
  divisionId?: string;
  initialRevisionId?: string;

  initialAnnotations?: readonly PhotoAnnotation[];
  initialDocument?: MarkupDocument;

  mode?: "full" | "quick";
  /** Limit visible tools (e.g. LOTO arrow-only host). */
  allowedTools?: readonly MarkupTool[];
  readOnly?: boolean;
  allowCreateFinding?: boolean;

  /** Compact embedded layout (no full-screen chrome). Host supplies modal shell. */
  embedded?: boolean;
  title?: string;

  className?: string;
  style?: import("react").CSSProperties;

  onSave?: (result: {
    photoId?: string;
    revisionId?: string;
    annotations: PhotoAnnotation[];
    document: MarkupDocument;
    renderedDataUrl?: string;
    renderedBlob?: Blob;
  }) => void | Promise<void>;

  onCancel?: () => void;
};

export type StrokePreset = {
  id: string;
  label: string;
  /** Normalized stroke width relative to min(canvasW, canvasH) */
  width: number;
};
