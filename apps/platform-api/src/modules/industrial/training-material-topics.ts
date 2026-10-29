/** Agency-assigned training material topics (stored in industrial_training_materials.category). */
export const TRAINING_MATERIAL_TOPICS = [
  "GENERAL",
  "NEW_HIRE",
  "SAFETY",
  "LOTO",
  "PPE",
  "EMERGENCY",
  "FLEET",
  "EQUIPMENT",
  "COMPLIANCE",
  "REFRESHER",
] as const;

export type TrainingMaterialTopic = (typeof TRAINING_MATERIAL_TOPICS)[number];

const TOPIC_SET = new Set<string>(TRAINING_MATERIAL_TOPICS);

/** MIME-derived values written before topic pickers existed. */
const LEGACY_MEDIA_KINDS = new Set(["VIDEO", "PRESENTATION", "IMAGE", "DOCUMENT"]);

export function isTrainingMaterialTopic(value: string): value is TrainingMaterialTopic {
  return TOPIC_SET.has(value);
}

export function normalizeTrainingMaterialTopic(
  raw: unknown,
  fallback: TrainingMaterialTopic = "GENERAL",
): string {
  const value = String(raw ?? fallback)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64);
  if (!value || !TOPIC_SET.has(value)) {
    throw new Error(`Invalid training material topic: ${value || "(empty)"}`);
  }
  return value;
}

export function resolveMaterialTopic(storedCategory: string): TrainingMaterialTopic {
  if (TOPIC_SET.has(storedCategory)) return storedCategory as TrainingMaterialTopic;
  if (LEGACY_MEDIA_KINDS.has(storedCategory)) return "GENERAL";
  return "GENERAL";
}
