import { apiGet, apiSend } from "@forge/web-kit";
import type { QuizSettings, TrainingChapter, TrainingQuestion, TrainingSource } from "./types";

type ListWrap<T> = { items: T[]; page: number; pageSize: number };

export const trainingApi = {
  listSources: (q?: string) =>
    apiGet<ListWrap<TrainingSource>>("/api/v1/industrial/training/sources", {
      query: { q: q || undefined, page: "1", pageSize: "50" },
    }),
  getSource: (id: string) => apiGet<TrainingSource>(`/api/v1/industrial/training/sources/${id}`),
  createSource: (body: { title: string; edition?: string; description?: string }) =>
    apiSend<TrainingSource>("/api/v1/industrial/training/sources", "POST", body),
  updateSource: (
    id: string,
    body: { title?: string; edition?: string; description?: string; status?: string },
  ) => apiSend<TrainingSource>(`/api/v1/industrial/training/sources/${id}`, "PATCH", body),
  listChapters: (sourceId: string) =>
    apiGet<TrainingChapter[]>(`/api/v1/industrial/training/sources/${sourceId}/chapters`),
  createChapter: (sourceId: string, body: { title: string; pageRange?: string; sortOrder?: number }) =>
    apiSend<TrainingChapter>(`/api/v1/industrial/training/sources/${sourceId}/chapters`, "POST", body),
  updateChapter: (
    chapterId: string,
    body: { title?: string; pageRange?: string; sortOrder?: number; status?: string },
  ) => apiSend<TrainingChapter>(`/api/v1/industrial/training/chapters/${chapterId}`, "PATCH", body),
  reorderChapters: (sourceId: string, orderedIds: string[]) =>
    apiSend<TrainingChapter[]>(
      `/api/v1/industrial/training/sources/${sourceId}/chapters/reorder`,
      "POST",
      { orderedIds },
    ),
  listQuestions: (sourceId: string, chapterId?: string) =>
    apiGet<TrainingQuestion[]>(`/api/v1/industrial/training/sources/${sourceId}/questions`, {
      query: { chapterId: chapterId || undefined },
    }),
  createQuestion: (
    sourceId: string,
    body: {
      chapterId: string;
      stem: string;
      choices: string[];
      correctIndex: number;
      explanation?: string;
      pageRef?: string;
      status?: string;
    },
  ) =>
    apiSend<TrainingQuestion>(
      `/api/v1/industrial/training/sources/${sourceId}/questions`,
      "POST",
      body,
    ),
  updateQuestion: (questionId: string, body: Record<string, unknown>) =>
    apiSend<TrainingQuestion>(`/api/v1/industrial/training/questions/${questionId}`, "PATCH", body),
  listRecords: () =>
    apiGet<ListWrap<Record<string, unknown>>>("/api/v1/industrial/training/records", {
      query: { page: "1", pageSize: "50" },
    }),
  createRecord: (body: Record<string, string>) =>
    apiSend("/api/v1/industrial/training/records", "POST", body),
  createQuiz: (body: QuizSettings) =>
    apiSend<{ quiz: { id: string }; attempt: { id: string }; questionCount: number }>(
      "/api/v1/industrial/training/quizzes",
      "POST",
      body,
    ),
  nextQuestion: (attemptId: string) =>
    apiGet<{
      done: boolean;
      index?: number;
      total?: number;
      feedbackEnabled?: boolean;
      mode?: string;
      question?: { id: string; stem: string; choices: string[]; chapterId: string; pageRef?: string };
      attempt?: Record<string, unknown>;
    }>(`/api/v1/industrial/training/attempts/${attemptId}/next`),
  answer: (attemptId: string, questionId: string, selectedIndex: number) =>
    apiSend<{
      correct: boolean;
      done: boolean;
      explanation?: string;
      pageRef?: string;
      correctIndex?: number;
    }>(`/api/v1/industrial/training/attempts/${attemptId}/answer`, "POST", {
      questionId,
      selectedIndex,
    }),
  bookmark: (attemptId: string, questionId: string) =>
    apiSend(`/api/v1/industrial/training/attempts/${attemptId}/bookmark`, "POST", { questionId }),
  resume: (attemptId: string) =>
    apiSend(`/api/v1/industrial/training/attempts/${attemptId}/resume`, "POST", {}),
  results: (attemptId: string) =>
    apiGet<{
      scoreCorrect: number;
      scoreTotal: number;
      percent: number;
      letterGrade: string;
      chapterBreakdown: Array<{ chapterId: string; correct: number; total: number }>;
      wrongQuestionIds: string[];
      bookmarkedQuestionIds: string[];
    }>(`/api/v1/industrial/training/attempts/${attemptId}/results`),
  retake: (attemptId: string, mode: "wrong" | "bookmarked" | "same" | "new") =>
    apiSend<{ attempt: { id: string } }>(
      `/api/v1/industrial/training/attempts/${attemptId}/retake`,
      "POST",
      { mode },
    ),
  progress: () =>
    apiGet<{
      stats: Array<Record<string, unknown>>;
      recentAttempts: Array<Record<string, unknown>>;
    }>("/api/v1/industrial/training/progress"),
  inProgress: () =>
    apiGet<Array<{ id: string; sourceId: string; status: string; updatedAt: string }>>(
      "/api/v1/industrial/training/attempts/in-progress",
    ),
};
