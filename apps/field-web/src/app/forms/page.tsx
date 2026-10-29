"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { OrgContextBar } from "@/components/org-context-bar";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { fieldFormApi } from "@/lib/form-api";
import type { FieldFormDefinition } from "@/lib/field-forms";

function formMatchesLocation(item: FieldFormDefinition, locationId: string): boolean {
  if (!locationId) return true;
  const payload = (item as { siteId?: string | null; sourcePayload?: Record<string, unknown> })
    .sourcePayload;
  const siteId =
    String((item as { siteId?: string | null }).siteId ?? payload?.siteId ?? "").trim() || null;
  if (!siteId) return true;
  return siteId === locationId;
}

function FormsInner() {
  const search = useSearchParams();
  const router = useRouter();
  const org = useFieldOrgOptional();
  const { moduleEnabled } = useFieldPermissions();
  const formId = String(search.get("id") ?? "").trim();
  const [items, setItems] = useState<FieldFormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const locationId = org?.selection.locationId ?? "";

  useEffect(() => {
    if (formId && formId !== "placeholder") {
      router.replace(`/forms/${encodeURIComponent(formId)}/`);
      return;
    }
    if (!moduleEnabled("FORMS")) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const query: Record<string, string> = {};
        if (locationId) query.siteId = locationId;
        const list = await fieldFormApi.listDefinitions(query);
        if (cancelled) return;
        setItems(
          list.filter((item) => {
            const status = String(item.status ?? "ACTIVE").toUpperCase();
            return status === "ACTIVE" || status === "PUBLISHED" || !item.status;
          }),
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load forms");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId, router, moduleEnabled, locationId]);

  const visible = useMemo(
    () => items.filter((item) => formMatchesLocation(item, locationId)),
    [items, locationId],
  );

  if (formId && formId !== "placeholder") {
    return <LoadingState label="Opening form…" />;
  }

  if (!moduleEnabled("FORMS")) {
    return (
      <EmptyState title="Forms not enabled" message="Forms is not enabled for this company." />
    );
  }

  if (loading) return <LoadingState label="Loading forms…" />;

  if (error) {
    return (
      <ErrorState title="Forms unavailable" message={error} onRetry={() => router.refresh()} />
    );
  }

  return (
    <>
      <h1 className="ff-page-title">Forms</h1>
      <p className="ff-page-body">
        Open an assigned form for your Location, or scan a Form QR code.
      </p>
      <OrgContextBar compact />
      {visible.length === 0 ? (
        <EmptyState
          title="No forms yet"
          message="When your team publishes form definitions for this Location, they will appear here."
        />
      ) : (
        <div className="ff-task-list">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ff-task-card"
              onClick={() => router.push(`/forms/${encodeURIComponent(item.id)}/`)}
            >
              <div className="ff-task-card-body">
                <span className="ff-task-kind">Form</span>
                <span className="ff-task-title">{item.title || "Untitled form"}</span>
                <span className="ff-meta">{item.formKey || item.status || "Ready"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="ff-btn"
        style={{ marginTop: 16 }}
        onClick={() => router.push("/scan/")}
      >
        Scan Form QR
      </button>
    </>
  );
}

export default function FormsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading forms…" />}>
      <FormsInner />
    </Suspense>
  );
}
