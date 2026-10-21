export const SANITATION_EMAIL_PDF_MAX_RECIPIENTS = 25;

export type ReportRecipient = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  departmentName: string | null;
};

export type EmailPdfResult = {
  filename: string;
  sent: number;
  failed: number;
  results: Array<{ personnelId: string; name: string; email: string; accepted: boolean; detail?: string }>;
  skipped: Array<{ personnelId: string; name: string | null; reason: string }>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseReportRecipients(data: unknown): ReportRecipient[] {
  const raw =
    data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : Array.isArray(data)
        ? data
        : [];
  return raw
    .map((row) => {
      const rec = (row ?? {}) as Record<string, unknown>;
      const id = text(rec.id);
      const email = text(rec.email);
      if (!id || !email) return null;
      return {
        id,
        name: text(rec.name) || email,
        email,
        jobTitle: text(rec.jobTitle) || null,
        departmentName: text(rec.departmentName) || null,
      };
    })
    .filter((row): row is ReportRecipient => row !== null);
}

/** Every whitespace-separated term must match the name, email, title, or department. */
export function filterReportRecipients(
  recipients: ReportRecipient[],
  query: string,
): ReportRecipient[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return recipients;
  return recipients.filter((r) => {
    const haystack = [r.name, r.email, r.jobTitle ?? "", r.departmentName ?? ""]
      .join(" ")
      .toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

export function emailPdfResultSummary(result: EmailPdfResult): {
  tone: "success" | "warning" | "danger";
  message: string;
} {
  const failed = result.results.filter((r) => !r.accepted);
  const parts: string[] = [];
  if (result.sent > 0) {
    parts.push(`Sent ${result.filename} to ${result.sent} ${result.sent === 1 ? "person" : "people"}.`);
  }
  if (failed.length) {
    parts.push(`Could not send to ${failed.map((r) => r.name).join(", ")}.`);
  }
  if (result.skipped.length) {
    parts.push(
      `Skipped ${result.skipped
        .map((s) => `${s.name ?? "unknown person"} (${s.reason.toLowerCase()})`)
        .join(", ")}.`,
    );
  }
  const tone =
    result.sent === 0 ? "danger" : failed.length || result.skipped.length ? "warning" : "success";
  return { tone, message: parts.join(" ") || "No emails were sent." };
}
