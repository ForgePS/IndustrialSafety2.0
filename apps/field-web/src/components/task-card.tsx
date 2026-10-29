"use client";

import { useRouter } from "next/navigation";
import {
  formatDueLabel,
  kindLabel,
  orgContextLine,
  statusLabel,
  type FieldWorkItem,
} from "@/lib/my-work";

export function TaskCard({ item }: { item: FieldWorkItem }) {
  const router = useRouter();
  const due = formatDueLabel(item.dueAt);
  const priority = item.priority?.trim();
  const orgLine = orgContextLine(item);

  return (
    <article className="ff-task-card">
      <div className="ff-task-card-body">
        <p className="ff-task-kind">{kindLabel(item.kind)}</p>
        <h3 className="ff-task-title">{item.title}</h3>
        {orgLine || item.subtitle ? (
          <p className="ff-meta">{[orgLine, item.subtitle].filter(Boolean).join(" · ")}</p>
        ) : null}
        <p className="ff-task-meta-row">
          <span>{due}</span>
          <span>{statusLabel(item.status)}</span>
          {item.estimatedMinutes ? <span>~{item.estimatedMinutes} min</span> : null}
          {priority ? <span className="ff-task-priority">{priority}</span> : null}
        </p>
      </div>
      <button type="button" className="ff-task-start" onClick={() => router.push(item.href)}>
        {/pass|complete|done/i.test(item.status)
          ? "VIEW"
          : item.kind === "inspection" && /progress|active/i.test(item.status)
            ? "CONTINUE"
            : "START"}
      </button>
    </article>
  );
}
