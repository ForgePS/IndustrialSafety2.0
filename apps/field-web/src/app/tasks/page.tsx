"use client";

import { Suspense } from "react";
import { TasksInbox } from "@/components/tasks-inbox";
import { LoadingState } from "@/components/field-states";

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading My Work…" />}>
      <TasksInbox />
    </Suspense>
  );
}
