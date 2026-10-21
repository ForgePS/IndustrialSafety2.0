/** Open a filled OSHA PDF in a new window and trigger print. */

export function openOshaPdfForPrint(
  pdfBytes: Uint8Array,
  filename: string,
  windowNamePrefix: string,
): string | null {
  if (typeof window === "undefined") return "Browser only";
  const bytes = new Uint8Array(pdfBytes);
  const blob = new Blob([bytes.buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(
    url,
    `${windowNamePrefix}-${Date.now()}`,
    "popup=yes,width=1024,height=768",
  );
  if (!popup) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return `Pop-up blocked — downloaded ${filename} instead.`;
  }
  window.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch {
      // User can print from the PDF viewer.
    }
  }, 750);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return null;
}
