"use client";

import { useMemo, useState } from "react";
import type {
  TrainingMaterial,
  TrainingMaterialTopic,
  TrainingSource,
} from "@/features/training/types";
import {
  TRAINING_MATERIAL_TOPICS,
  canViewInApp,
  formatMaterialBytes,
  groupMaterialsByTopic,
  materialIconClass,
  materialMediaKind,
  materialMediaLabel,
  materialTopicLabel,
} from "@/features/training/materials";

type Props = {
  materials: TrainingMaterial[];
  canManage?: boolean;
  busy?: boolean;
  linkableSources?: TrainingSource[];
  onOpen: (material: TrainingMaterial) => void;
  onArchive?: (material: TrainingMaterial) => void;
  onEdit?: (material: TrainingMaterial) => void;
  onUpdateCategory?: (material: TrainingMaterial, category: TrainingMaterialTopic) => void;
  onLinkSource?: (material: TrainingMaterial, sourceId: string | null) => void;
  onReoptimizeVideo?: (material: TrainingMaterial) => void;
};

export function TrainingMaterialsPanel({
  materials,
  canManage = false,
  busy = false,
  onOpen,
  onArchive,
  onEdit,
  onUpdateCategory,
  onLinkSource,
  onReoptimizeVideo,
  linkableSources = [],
}: Props) {
  const [query, setQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState<TrainingMaterialTopic | "ALL">("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (topicFilter !== "ALL" && m.category !== topicFilter) return false;
      if (!q) return true;
      const hay =
        `${m.title} ${m.description ?? ""} ${m.originalFilename} ${materialTopicLabel(m.category)} ${materialMediaLabel(materialMediaKind(m))}`.toLowerCase();
      return hay.includes(q);
    });
  }, [materials, query, topicFilter]);

  const topicCounts = useMemo(() => {
    const counts = new Map<TrainingMaterialTopic, number>();
    for (const topic of TRAINING_MATERIAL_TOPICS) counts.set(topic.id, 0);
    for (const m of materials) {
      const key = TRAINING_MATERIAL_TOPICS.some((t) => t.id === m.category)
        ? (m.category as TrainingMaterialTopic)
        : "GENERAL";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [materials]);

  const groups = useMemo(() => groupMaterialsByTopic(filtered), [filtered]);

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div className="text-muted small">
          {filtered.length} material{filtered.length === 1 ? "" : "s"}
          {topicFilter !== "ALL" ? ` in ${materialTopicLabel(topicFilter)}` : ""}
        </div>
        <input
          className="form-control"
          style={{ maxWidth: 280 }}
          placeholder="Search materials…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search materials"
        />
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          className={`btn btn-sm ${topicFilter === "ALL" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setTopicFilter("ALL")}
        >
          All ({materials.length})
        </button>
        {TRAINING_MATERIAL_TOPICS.map((topic) => {
          const count = topicCounts.get(topic.id) ?? 0;
          if (!count) return null;
          return (
            <button
              key={topic.id}
              type="button"
              className={`btn btn-sm ${topicFilter === topic.id ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setTopicFilter(topic.id)}
            >
              {topic.label} ({count})
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <section key={group.topic} className="mb-4">
          {topicFilter === "ALL" ? (
            <h6 className="text-uppercase text-muted small fw-semibold mb-3">{group.label}</h6>
          ) : null}
          <div className="row g-3">
            {group.items.map((material) => (
              <div key={material.id} className="col-md-6 col-xl-4">
                <div className="card h-100 border shadow-none">
                  <div className="card-body d-flex flex-column gap-2">
                    <div className="d-flex align-items-start gap-2">
                      <span className="avatar avatar-sm flex-shrink-0">
                        <span className="avatar-initial rounded bg-label-primary">
                          <i className={`bx ${materialIconClass(material)}`} aria-hidden />
                        </span>
                      </span>
                      <div className="min-w-0 flex-grow-1">
                        <div className="fw-semibold text-truncate">{material.title}</div>
                        <div className="text-muted small">
                          {materialMediaLabel(materialMediaKind(material))} ·{" "}
                          {formatMaterialBytes(material.byteSize)}
                          {material.status === "PROCESSING"
                            ? " · Optimizing for tablets…"
                            : material.status === "FAILED"
                              ? " · Tablet optimize failed"
                              : ""}
                        </div>
                        {material.status === "PROCESSING" ? (
                          <span className="badge bg-label-warning mt-1">Processing</span>
                        ) : null}
                        {material.status === "FAILED" ? (
                          <span className="badge bg-label-danger mt-1">Failed</span>
                        ) : null}
                      </div>
                    </div>
                    {material.description ? (
                      <p className="text-muted small mb-0">{material.description}</p>
                    ) : null}
                    {canManage && onLinkSource && linkableSources.length ? (
                      <label className="small text-muted mb-0">
                        Linked course
                        <select
                          className="form-select form-select-sm mt-1"
                          value={material.sourceId ?? ""}
                          disabled={busy}
                          onChange={(e) => onLinkSource(material, e.target.value.trim() || null)}
                        >
                          <option value="">None</option>
                          {linkableSources.map((source) => (
                            <option key={source.id} value={source.id}>
                              {source.title}
                              {source.status === "DRAFT" ? " (draft)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : material.sourceId ? (
                      <span className="badge bg-label-info align-self-start">
                        Linked to{" "}
                        {linkableSources.find((s) => s.id === material.sourceId)?.title ?? "course"}
                      </span>
                    ) : null}
                    {canManage && onUpdateCategory ? (
                      <label className="small text-muted mb-0">
                        Category
                        <select
                          className="form-select form-select-sm mt-1"
                          value={
                            TRAINING_MATERIAL_TOPICS.some((t) => t.id === material.category)
                              ? material.category
                              : "GENERAL"
                          }
                          disabled={busy}
                          onChange={(e) =>
                            onUpdateCategory(material, e.target.value as TrainingMaterialTopic)
                          }
                        >
                          {TRAINING_MATERIAL_TOPICS.map((topic) => (
                            <option key={topic.id} value={topic.id}>
                              {topic.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="badge bg-label-secondary align-self-start">
                        {materialTopicLabel(material.category)}
                      </span>
                    )}
                    <div className="d-flex flex-wrap gap-2 mt-auto pt-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy || material.status === "PROCESSING"}
                        onClick={() => onOpen(material)}
                      >
                        {material.status === "PROCESSING"
                          ? "Processing…"
                          : canViewInApp(material.mimeType, material.originalFilename)
                            ? "View"
                            : "Open"}
                      </button>
                      {canManage &&
                      onReoptimizeVideo &&
                      materialMediaKind(material) === "VIDEO" &&
                      material.status !== "PROCESSING" ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={busy}
                          onClick={() => onReoptimizeVideo(material)}
                        >
                          Optimize for tablets
                        </button>
                      ) : null}
                      {canManage && onEdit ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          disabled={busy}
                          onClick={() => onEdit(material)}
                        >
                          Edit
                        </button>
                      ) : null}
                      {canManage && onArchive ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={busy}
                          onClick={() => onArchive(material)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!filtered.length ? (
        <div className="text-muted">
          {materials.length
            ? "No materials match that search or category."
            : "No materials published yet."}
        </div>
      ) : null}
    </div>
  );
}
