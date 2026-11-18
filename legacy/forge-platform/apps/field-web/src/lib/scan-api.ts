import { apiGet, apiSend } from "@forge/web-kit";
import type { ScanAction, ScanIdentifyResult, ScanPublicContext } from "./scan-public";

export function fetchScanContext(token: string): Promise<ScanPublicContext> {
  return apiGet<ScanPublicContext>(`/api/v1/public/scan/${encodeURIComponent(token)}`);
}

export function fetchScanActions(
  token: string,
  body: { employeeNumber?: string },
): Promise<{ actions: ScanAction[]; verifiedEmployee: boolean }> {
  return apiSend(`/api/v1/public/scan/${encodeURIComponent(token)}/actions`, "POST", body);
}

export function identifyScanEmployee(
  token: string,
  employeeNumber: string,
): Promise<ScanIdentifyResult> {
  return apiSend(`/api/v1/public/scan/${encodeURIComponent(token)}/identify`, "POST", {
    employeeNumber,
  });
}

export function reportScanIssue(
  token: string,
  body: {
    employeeNumber?: string;
    description: string;
    title?: string;
    priority?: string;
    outOfService?: boolean;
  },
): Promise<unknown> {
  return apiSend(`/api/v1/public/scan/${encodeURIComponent(token)}/report-issue`, "POST", body);
}

export function fetchPublicLotoProcedure(token: string): Promise<{
  procedureId: string;
  detail: Record<string, unknown>;
}> {
  return apiGet(`/api/v1/public/scan/${encodeURIComponent(token)}/loto`);
}
