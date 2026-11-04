import { ForgeError } from "@forge/errors";

/**
 * How assignees receive a training assignment's course content.
 * - SELF_PACED: each assignee works through the course sections before the quiz unlocks.
 * - GROUP_PRESENTED: an instructor presents the content to the group, so each assignee
 *   can take the quiz right away without completing the sections.
 */
export const TRAINING_CONTENT_DELIVERY = ["SELF_PACED", "GROUP_PRESENTED"] as const;
export type TrainingContentDelivery = (typeof TRAINING_CONTENT_DELIVERY)[number];

export function parseContentDelivery(value: unknown): TrainingContentDelivery {
  if (value == null || value === "") return "SELF_PACED";
  const normalized = String(value).trim().toUpperCase();
  if ((TRAINING_CONTENT_DELIVERY as readonly string[]).includes(normalized)) {
    return normalized as TrainingContentDelivery;
  }
  throw new ForgeError(
    "VALIDATION_FAILED",
    `contentDelivery must be one of ${TRAINING_CONTENT_DELIVERY.join(", ")}`,
  );
}

/**
 * Presentation date for GROUP_PRESENTED assignments. Defaults to now when the
 * assignment is group-presented and no date is given; always null for SELF_PACED.
 */
export function parseContentPresentedAt(
  delivery: TrainingContentDelivery,
  value: unknown,
  now: Date,
): Date | null {
  if (delivery !== "GROUP_PRESENTED") return null;
  if (value == null || value === "") return now;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ForgeError("VALIDATION_FAILED", "contentPresentedAt is invalid");
  }
  return date;
}

/** Whether an assignee may start the quiz without finishing the course sections. */
export function quizSkipsCourseContent(delivery: string | null | undefined): boolean {
  return String(delivery ?? "").toUpperCase() === "GROUP_PRESENTED";
}
