"use client";

import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { enabledSafetyWorkflows } from "@/lib/safety-workflows";

export function SafetyWorkflowsHub() {
  const router = useRouter();
  const { moduleEnabled } = useFieldPermissions();
  const workflows = enabledSafetyWorkflows(moduleEnabled);

  return (
    <>
      <h1 className="ff-page-title">Safety workflows</h1>
      <p className="ff-page-body">
        Only modules enabled for your company are shown. Full administration stays in Forge
        Industrial Safety.
      </p>
      {workflows.length === 0 ? (
        <EmptyState
          title="No workflows enabled"
          message="Ask an administrator to enable JSA, LOTO, permits, chemicals, or sanitation."
        />
      ) : (
        <div className="ff-action-grid">
          {workflows.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ff-action-tile"
              onClick={() => router.push(item.href)}
            >
              {item.label}
              <span>{item.detail}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
