"use client";

import { useRouter } from "next/navigation";
import { TaskCard } from "@/components/task-card";
import { useMyWork } from "@/hooks/use-my-work";

export default function TrainingPage() {
  const router = useRouter();
  const { data, loading, error } = useMyWork();
  const training = (data?.items ?? []).filter((item) => item.kind === "training");

  return (
    <>
      <h1 className="ff-page-title">My Training</h1>
      <p className="ff-page-body">Assigned courses appear here. Full viewer and quizzes land in FIELD-S3.</p>
      {loading ? <p className="ff-page-body">Loading…</p> : null}
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && training.length === 0 ? (
        <div className="ff-task-list">
          <div className="ff-placeholder-card ff-card-message">
            <strong>No open training</strong>
            <p>When safety assigns a course, it will show up with a Start button.</p>
          </div>
        </div>
      ) : null}
      <div className="ff-task-list">
        {training.map((item) => (
          <TaskCard key={item.id} item={item} />
        ))}
      </div>
      <button type="button" className="ff-btn ff-btn-secondary" onClick={() => router.push("/more/records/")}>
        View transcript
      </button>
    </>
  );
}
