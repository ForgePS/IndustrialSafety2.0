export interface WorkerJob<TPayload = unknown> {
  jobId: string;
  jobType: string;
  tenantId: string;
  correlationId: string;
  initiatedByUserId?: string;
  payload: TPayload;
  createdAt: string;
}

export type JobHandler<TPayload = unknown> = (job: WorkerJob<TPayload>) => Promise<void>;

export function assertValidJobContext(job: Partial<WorkerJob>): asserts job is WorkerJob {
  if (!job.jobId || !job.jobType || !job.correlationId || !job.createdAt) {
    throw new Error("Malformed job context");
  }
  if (!job.tenantId) {
    throw new Error("Worker rejected job: missing tenantId");
  }
}
