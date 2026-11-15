/**
 * Convert Field signature pad values into API-ready image data URLs.
 * Typed signatures ("typed:Name") are rendered to a small PNG canvas.
 */
export function ensureSignatureDataUrl(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  const typed = raw.startsWith("typed:") ? raw.slice("typed:".length).trim() : raw;
  if (!typed || typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 110;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.font = "28px Georgia, 'Times New Roman', serif";
  ctx.textBaseline = "middle";
  ctx.fillText(typed.slice(0, 40), 16, canvas.height / 2);
  return canvas.toDataURL("image/png");
}
