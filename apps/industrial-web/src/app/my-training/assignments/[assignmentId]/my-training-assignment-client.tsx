"use client";

import { useParams } from "next/navigation";
import { MyTrainingAssignmentRunner } from "@/components/my-training-assignment-runner";

export function MyTrainingAssignmentClient() {
  const params = useParams<{ assignmentId: string }>();
  const assignmentId = String(params?.assignmentId ?? "").trim();
  if (!assignmentId || assignmentId === "placeholder") {
    return (
      <div className="container-xxl flex-grow-1 container-p-y">
        <p className="text-muted">Open an assigned course from My Training.</p>
      </div>
    );
  }
  return <MyTrainingAssignmentRunner assignmentId={assignmentId} />;
}
