"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { fieldTrainingApi, type TranscriptEntry } from "@/lib/training-api";

type Filter = "all" | "completed" | "expiring" | "expired";

function isExpired(expiresAt?: string | null, now = new Date()): boolean {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  return !Number.isNaN(d.getTime()) && d.getTime() < now.getTime();
}

function isExpiring(expiresAt?: string | null, now = new Date()): boolean {
  if (!expiresAt || isExpired(expiresAt, now)) return false;
  const d = new Date(expiresAt);
  const in30 = now.getTime() + 30 * 24 * 60 * 60 * 1000;
  return d.getTime() <= in30;
}

export default function RecordsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useFieldProfile();
  const [records, setRecords] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const personnelId = profile?.personnelId;
    if (!personnelId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const history = await fieldTrainingApi.history(personnelId);
        if (!cancelled) setRecords(history.trainingRecords ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your transcript.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.personnelId]);

  const filtered = useMemo(() => {
    const now = new Date();
    return records.filter((row) => {
      if (filter === "all" || filter === "completed") return true;
      if (filter === "expired") return isExpired(row.expiresAt, now);
      if (filter === "expiring") return isExpiring(row.expiresAt, now);
      return true;
    });
  }, [records, filter]);

  return (
    <>
      <h1 className="ff-page-title">My Records</h1>
      <p className="ff-page-body">
        {profile?.displayName || "Your"} training transcript and certifications.
      </p>

      <div className="ff-tabs" role="tablist" aria-label="Transcript filters">
        {(
          [
            ["all", "All"],
            ["completed", "Completed"],
            ["expiring", "Expiring"],
            ["expired", "Expired"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={filter === id ? "ff-tab ff-tab-active" : "ff-tab"}
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {profileLoading || loading ? <p className="ff-page-body">Loading transcript…</p> : null}
      {!profileLoading && !profile?.personnelId ? (
        <div className="ff-task-list">
          <div className="ff-placeholder-card ff-card-message">
            <strong>No personnel record linked</strong>
            <p>Ask your administrator to link your login to an employee record.</p>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && profile?.personnelId && filtered.length === 0 ? (
        <div className="ff-task-list">
          <div className="ff-placeholder-card ff-card-message">
            <strong>No transcript entries</strong>
            <p>Completed courses will appear here with scores and dates.</p>
          </div>
        </div>
      ) : null}

      <div className="ff-task-list">
        {filtered.map((row) => {
          const when = row.completedAt
            ? new Date(row.completedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—";
          const result = (row.result || "PASS").toUpperCase();
          return (
            <article key={row.id} className="ff-task-card">
              <div className="ff-task-card-body">
                <p className="ff-task-kind">{row.kind}</p>
                <h3 className="ff-task-title">{row.title || row.courseName || "Training"}</h3>
                <p className="ff-task-meta-row">
                  <span>{when}</span>
                  <span className="ff-task-priority">{result}</span>
                  {row.scorePercent != null ? <span>{row.scorePercent}%</span> : null}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="ff-btn ff-btn-secondary"
        onClick={() => router.push("/training/")}
      >
        My Training
      </button>
    </>
  );
}
