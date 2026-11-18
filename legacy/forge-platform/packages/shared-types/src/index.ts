export type AppEnvironment =
  | "local"
  | "development"
  | "testing"
  | "staging"
  | "production"
  | "govcloud-development"
  | "govcloud-staging"
  | "govcloud-production";

export type AwsPartition = "aws" | "aws-us-gov";

export type ProductCode = "ACADEMY" | "RMS" | "INDUSTRIAL" | "CREATOR";

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  userId?: string;
  product?: ProductCode;
  environment: AppEnvironment;
}

export interface AuditActor {
  userId?: string;
  actorType: "USER" | "SYSTEM" | "SUPPORT" | "INTEGRATION";
}

export interface PaginatedRequest {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
