/**
 * Protected download helpers — never persist or log the URL.
 */

export type DownloadAuth = {
  downloadUrl: string;
  expiresAt: string;
  contentType?: string;
  fileName?: string;
};

let activeUrl: string | null = null;

export function disposeDownloadUrl(): void {
  activeUrl = null;
}

export function getActiveDownloadUrlForTests(): string | null {
  return activeUrl;
}

/**
 * Opens a short-lived download without writing the URL into history or long-lived state.
 * Caller must not log `auth.downloadUrl`.
 */
export async function initiateProtectedDownload(auth: DownloadAuth): Promise<void> {
  activeUrl = auth.downloadUrl;
  try {
    const res = await fetch(auth.downloadUrl, { cache: "no-store", credentials: "omit" });
    if (!res.ok) {
      throw new Error(`Download failed (${res.status}). Request a new authorization.`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = auth.fileName ?? "import-report.json";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } finally {
    disposeDownloadUrl();
  }
}

export function isDownloadExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
