import { assertValidJobContext, type JobHandler, type WorkerJob } from "./job.js";

const handlers = new Map<string, JobHandler>();

export function registerHandler(jobType: string, handler: JobHandler): void {
  handlers.set(jobType, handler);
}

export async function processJob(job: WorkerJob): Promise<void> {
  assertValidJobContext(job);
  const handler = handlers.get(job.jobType);
  if (!handler) {
    throw new Error(`No handler registered for jobType=${job.jobType}`);
  }
  await handler(job);
}
