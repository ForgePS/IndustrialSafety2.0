"use client";

import { useRouter } from "next/navigation";
import { REPORT_TYPE_META, type FieldReportType } from "@/lib/field-reports";

const REPORT_TYPES: FieldReportType[] = [
  "hazard",
  "incident",
  "observation",
  "near-miss",
  "equipment",
  "security",
];

export default function ReportPage() {
  const router = useRouter();

  return (
    <>
      <h1 className="ff-page-title">Report</h1>
      <p className="ff-page-body">
        Fast field reporting. Investigation and OSHA administration stay in Forge Industrial
        Safety.
      </p>
      <div className="ff-action-grid">
        {REPORT_TYPES.map((id) => {
          const item = REPORT_TYPE_META[id];
          return (
            <button
              key={id}
              type="button"
              className="ff-action-tile"
              onClick={() => router.push(`/report/${id}/`)}
            >
              {item.label}
              <span>{item.detail}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
