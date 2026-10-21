export type ReportingSchedulesJob = {
  type: "reporting.schedules.run_due.v1";
  correlationId?: string;
};

/**
 * Calls platform-api reporting run-due sweep so schedule delivery uses the API
 * mailer / export path with tenant RLS + Safety Director resolution.
 */
export async function processReportingSchedulesRunDue(input: {
  job: ReportingSchedulesJob;
  publicApiUrl: string;
  sweepToken: string;
}): Promise<"completed" | "failed"> {
  const base = input.publicApiUrl.replace(/\/+$/, "");
  const url = `${base}/api/v1/reporting/schedules/run-due-sweep`;
  const token = input.sweepToken.trim();
  if (!token) {
    throw new Error("FORGE_REPORTING_SWEEP_TOKEN is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Forge-Reporting-Sweep-Token": token,
      ...(input.job.correlationId
        ? { "x-correlation-id": input.job.correlationId }
        : {}),
    },
    body: "{}",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Reporting sweep HTTP ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`,
    );
  }
  return "completed";
}
