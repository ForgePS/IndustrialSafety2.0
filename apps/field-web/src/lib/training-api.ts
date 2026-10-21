import { apiGet, apiSend } from "@forge/web-kit";

export type FieldTrainingAssignment = {
  id: string;
  title: string;
  description?: string | null;
  sourceId: string;
  sourceTitle?: string;
  materialId?: string | null;
  dueAt?: string | null;
  passingPercent: number;
  quizMode?: string;
  optionCount?: number;
  feedbackEnabled?: boolean;
  timerSeconds?: number | null;
  status: string;
  myStatus?: string | null;
  myBestPercent?: number | null;
};

export type FieldTrainingMaterial = {
  id: string;
  title: string;
  mimeType?: string | null;
  originalFilename?: string | null;
  category?: string | null;
};

export type QuizNext = {
  done: boolean;
  index?: number;
  total?: number;
  feedbackEnabled?: boolean;
  timerSeconds?: number | null;
  question?: { id: string; stem: string; choices: string[]; pageRef?: string };
};

export type QuizAnswerResult = {
  correct: boolean;
  done: boolean;
  explanation?: string;
  pageRef?: string;
  correctIndex?: number;
};

export type QuizResults = {
  scoreCorrect: number;
  scoreTotal: number;
  percent: number;
  letterGrade: string;
  wrongQuestionIds: string[];
  bookmarkedQuestionIds: string[];
};

export type TranscriptEntry = {
  id: string;
  kind: string;
  title: string;
  courseName?: string | null;
  result?: string | null;
  scorePercent?: number | null;
  attemptNumber?: number | null;
  completedAt?: string | null;
  expiresAt?: string | null;
};

export type PersonnelTrainingHistory = {
  completions: unknown[];
  openAssignments: unknown[];
  trainingRecords: TranscriptEntry[];
};

/** Detect training videos from MIME and/or filename (do not rely on extension alone). */
export function isTrainingVideoFile(input: {
  mimeType?: string | null | undefined;
  filename?: string | null | undefined;
  originalFilename?: string | null | undefined;
  fileName?: string | null | undefined;
}): boolean {
  const mime = String(input.mimeType ?? "")
    .trim()
    .toLowerCase();
  const name = String(input.filename ?? input.originalFilename ?? input.fileName ?? "")
    .trim()
    .toLowerCase();
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|m4v|webm|ogv|ogg|mov)$/i.test(name);
}

export function resolveTrainingVideoPlaybackMime(input: {
  mimeType?: string | null | undefined;
  filename?: string | null | undefined;
  originalFilename?: string | null | undefined;
}): string {
  const mime = String(input.mimeType ?? "")
    .trim()
    .toLowerCase();
  if (mime.startsWith("video/") && mime !== "application/octet-stream") return mime;
  const name = String(input.filename ?? input.originalFilename ?? "")
    .trim()
    .toLowerCase();
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".ogv") || name.endsWith(".ogg")) return "video/ogg";
  if (name.endsWith(".m4v")) return "video/mp4";
  return "video/mp4";
}

export function canInlinePreview(
  mimeType?: string | null,
  filename?: string | null,
): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/") || mime === "application/pdf") return true;
  return isTrainingVideoFile({ mimeType, filename });
}

export const fieldTrainingApi = {
  getAssignment: (assignmentId: string) =>
    apiGet<FieldTrainingAssignment>(
      `/api/v1/industrial/training/assignments/${encodeURIComponent(assignmentId)}`,
    ),

  listMaterials: (sourceId: string) =>
    apiGet<{ items: FieldTrainingMaterial[] }>("/api/v1/industrial/training/materials", {
      query: { sourceId, page: "1", pageSize: "20" },
    }),

  materialDownloadUrl: (materialId: string) =>
    apiSend<{
      downloadUrl: string;
      mimeType?: string;
      originalFilename?: string;
      inline?: boolean;
    }>(
      `/api/v1/industrial/training/materials/${encodeURIComponent(materialId)}/download-url`,
      "POST",
      {},
    ),

  materialViewUrl: (materialId: string) =>
    apiSend<{
      viewUrl: string;
      mimeType?: string;
      originalFilename?: string;
      byteSize?: number;
    }>(
      `/api/v1/industrial/training/materials/${encodeURIComponent(materialId)}/view-url`,
      "POST",
      {},
    ),

  createQuiz: (assignmentId: string) =>
    apiSend<{
      quiz: { id: string };
      attempt: { id: string };
      questionCount: number;
      sourceTitle?: string;
    }>("/api/v1/industrial/training/quizzes", "POST", { assignmentId }),

  nextQuestion: (attemptId: string) =>
    apiGet<QuizNext>(
      `/api/v1/industrial/training/attempts/${encodeURIComponent(attemptId)}/next`,
    ),

  answer: (attemptId: string, questionId: string, selectedIndex: number) =>
    apiSend<QuizAnswerResult>(
      `/api/v1/industrial/training/attempts/${encodeURIComponent(attemptId)}/answer`,
      "POST",
      { questionId, selectedIndex },
    ),

  results: (attemptId: string) =>
    apiGet<QuizResults>(
      `/api/v1/industrial/training/attempts/${encodeURIComponent(attemptId)}/results`,
    ),

  /** Prefer new quiz with assignmentId so completion syncs; retake keeps assignmentId after API fix. */
  retake: (attemptId: string, mode: "wrong" | "same" | "new" = "same") =>
    apiSend<{ attempt: { id: string } }>(
      `/api/v1/industrial/training/attempts/${encodeURIComponent(attemptId)}/retake`,
      "POST",
      { mode },
    ),

  history: (personnelId: string) =>
    apiGet<PersonnelTrainingHistory>(
      `/api/v1/industrial/training/personnel/${encodeURIComponent(personnelId)}/history`,
    ),
};

export const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];
