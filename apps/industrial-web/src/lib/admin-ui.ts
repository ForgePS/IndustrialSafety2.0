/** Explicit Sneat label-tone classes (safe for dynamic styling). */
export type AdminLabelTone =
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "secondary";

const LABEL_TONE_CLASS: Record<AdminLabelTone, string> = {
  primary: "bg-label-primary",
  success: "bg-label-success",
  info: "bg-label-info",
  warning: "bg-label-warning",
  danger: "bg-label-danger",
  secondary: "bg-label-secondary",
};

export function adminLabelToneClass(tone: AdminLabelTone): string {
  return LABEL_TONE_CLASS[tone];
}
