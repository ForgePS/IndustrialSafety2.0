"use client";

import { useParams } from "next/navigation";
import { TrainingAssignmentRunner } from "@/components/training-assignment-runner";

export function TrainingAssignmentClient() {
  const params = useParams<{ assignmentId: string }>();
  const id = String(params?.assignmentId ?? "").trim();

  if (!id || id === "placeholder") {
    return (
      <>
        <h1 className="ff-page-title">Training</h1>
        <p className="ff-page-body">Open an assigned course from My Training.</p>
      </>
    );
  }

  return <TrainingAssignmentRunner assignmentId={id} />;
}
