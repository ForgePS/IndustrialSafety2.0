import type { ApiErrorBody, ApiMeta, ApiSuccess } from "@forge/contracts";

export function ok<T>(
  data: T,
  ids: { requestId: string; correlationId: string },
  page?: { page: number; pageSize: number; total: number },
): ApiSuccess<T> {
  const meta: ApiMeta = {
    requestId: ids.requestId,
    correlationId: ids.correlationId,
    ...(page
      ? {
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
        }
      : {}),
  };
  return { data, meta };
}

export function fail(
  code: string,
  message: string,
  ids: { requestId: string; correlationId: string },
  details: unknown[] = [],
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      details,
      requestId: ids.requestId,
      correlationId: ids.correlationId,
    },
  };
}
