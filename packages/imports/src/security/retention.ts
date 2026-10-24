export type RetentionPolicy = {
  cleanSourceDays: number;
  quarantineDays: number;
  scanEventDays: number;
  maskedArtifactDays: number;
  privilegedArtifactDays: number;
  securityReportDays: number;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  cleanSourceDays: 30,
  quarantineDays: 90,
  scanEventDays: 365,
  maskedArtifactDays: 30,
  privilegedArtifactDays: 7,
  securityReportDays: 180,
};

export type RetentionCandidate = {
  kind: "source" | "quarantine" | "scan_event" | "artifact";
  securityHold: boolean;
  jobActive: boolean;
  retentionDeleteAt: Date | null;
  now?: Date;
};

export function isRetentionEligible(candidate: RetentionCandidate): boolean {
  if (candidate.securityHold) return false;
  if (candidate.jobActive) return false;
  if (!candidate.retentionDeleteAt) return false;
  const now = candidate.now ?? new Date();
  return candidate.retentionDeleteAt.getTime() <= now.getTime();
}

export function retentionDeleteAt(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
