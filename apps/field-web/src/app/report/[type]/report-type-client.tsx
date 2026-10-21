"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { FieldReportRunner } from "@/components/field-report-runner";
import { EmptyState, LoadingState } from "@/components/field-states";
import { isFieldReportType, parseReportType } from "@/lib/field-reports";

function ReportTypeInner() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const raw = String(params?.type ?? "").trim().toLowerCase();
  const type = parseReportType(raw);

  if (!raw || (!isFieldReportType(raw) && raw !== "near_miss" && raw !== "equipment-issue")) {
    return (
      <>
        <EmptyState
          title="Unknown report type"
          message="Choose a report type from the Report hub."
        />
        <button type="button" className="ff-btn" onClick={() => router.push("/report/")}>
          Back to Report
        </button>
      </>
    );
  }

  return <FieldReportRunner reportType={type} />;
}

export default function ReportTypeClient() {
  return (
    <Suspense fallback={<LoadingState label="Loading report…" />}>
      <ReportTypeInner />
    </Suspense>
  );
}
