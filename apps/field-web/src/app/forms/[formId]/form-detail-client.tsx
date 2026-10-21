"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FieldFormRunner } from "@/components/field-form-runner";
import { EmptyState, LoadingState } from "@/components/field-states";

function FormDetailInner() {
  const params = useParams<{ formId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const formId = String(params?.formId ?? "").trim();
  const submissionId = String(search.get("submission") ?? "").trim() || null;
  const kind = String(search.get("kind") ?? "form").toLowerCase();

  if (!formId || formId === "placeholder") {
    return (
      <EmptyState title="Missing form" message="Scan a Form QR or open a form from the Forms list." />
    );
  }

  if (kind === "document") {
    return (
      <>
        <p className="ff-brand-mark">Document</p>
        <h1 className="ff-page-title">{formId}</h1>
        <EmptyState
          title="Document link resolved"
          message="Open this document from Records or your desktop Forms workspace when available."
        />
        <button type="button" className="ff-btn" onClick={() => router.push("/forms/")}>
          Browse forms
        </button>
      </>
    );
  }

  return <FieldFormRunner formId={formId} submissionId={submissionId} />;
}

export function FormDetailClient() {
  return (
    <Suspense fallback={<LoadingState label="Loading form…" />}>
      <FormDetailInner />
    </Suspense>
  );
}
