"use client";

import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { OrgContextBar } from "@/components/org-context-bar";

type OperationsListShellProps = {
  title: string;
  body: string;
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyMessage: string;
  onRetry: () => void;
  children: ReactNode;
  footer?: ReactNode;
  moduleDisabled?: boolean;
  moduleDisabledMessage?: string;
};

export function OperationsListShell({
  title,
  body,
  loading,
  error,
  emptyTitle,
  emptyMessage,
  onRetry,
  children,
  footer,
  moduleDisabled,
  moduleDisabledMessage,
}: OperationsListShellProps) {
  if (moduleDisabled) {
    return (
      <EmptyState
        title={`${title} not enabled`}
        message={moduleDisabledMessage ?? `${title} is not enabled for this company.`}
      />
    );
  }

  return (
    <>
      <h1 className="ff-page-title">{title}</h1>
      <p className="ff-page-body">{body}</p>
      <OrgContextBar compact />
      {loading ? <LoadingState label={`Loading ${title.toLowerCase()}…`} /> : null}
      {!loading && error ? (
        <ErrorState title={`${title} unavailable`} message={error} onRetry={onRetry} />
      ) : null}
      {!loading && !error ? children : null}
      {!loading && !error && !children ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : null}
      {footer}
    </>
  );
}
