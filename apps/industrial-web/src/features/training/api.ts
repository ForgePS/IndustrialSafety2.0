import { apiFetchRaw, apiGet, apiSend } from "@forge/web-kit";
import { fetchAllPersonnelRows } from "@/lib/personnel-roster-fetch";
import type {
  QuizSettings,
  TrainingAssignment,
  TrainingGroup,
  TrainingMaterial,
  TrainingQuestion,
  TrainingSource,
  TrainingSourceFolder,
  TrainingTeamSummary,
} from "./types";

type ListWrap<T> = { items: T[]; page: number; pageSize: number; total?: number };

export type TrainingRecordSearchRow = {
  id: string;
  title: string;
  courseName?: string | null;
  result?: string | null;
  scorePercent?: number | null;
  attemptNumber?: number | null;
  completedAt?: string | Date | null;
  personnelId?: string | null;
  displayName?: string | null;
  employeeNumber?: string | null;
  personnelArchived?: boolean;
  sourceCollection?: string | null;
};

export type PaperQuizResultRow = {
  employeeNumber: string;
  percent: number;
  completedAt?: string | null;
};

export type PaperQuizPostResult = {
  assignmentId: string;
  sourceId: string;
  sourceTitle: string;
  passingPercent: number;
  posted: Array<{
    employeeNumber: string;
    percent: number;
    status: string;
    passed: boolean;
  }>;
};

async function openPaperQuizHtml(sourceId: string, variant: "trainee" | "key") {
  const res = await apiFetchRaw(
    `/api/v1/industrial/training/sources/${sourceId}/paper-quiz?variant=${variant}`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Could not download paper quiz (${res.status})`;
    try {
      const payload = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = payload.error?.message || payload.message || message;
    } catch {
      if (text.trim()) message = text.trim().slice(0, 240);
    }
    throw new Error(message);
  }
  const html = await res.text();
  openPrintableHtmlBlob(html, variant === "key" ? "answer-key.html" : "paper-quiz.html");
}

export async function openPrintableHtmlBlob(html: string, fallbackFilename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fallbackFilename;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function openPrintableUrl(url: string, fallbackFilename: string) {
  const res = await apiFetchRaw(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Could not open printable (${res.status})`;
    try {
      const payload = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = payload.error?.message || payload.message || message;
    } catch {
      if (text.trim()) message = text.trim().slice(0, 240);
    }
    throw new Error(message);
  }
  const html = await res.text();
  openPrintableHtmlBlob(html, fallbackFilename);
}

export const trainingApi = {
  listSources: (opts?: string | { q?: string; groupId?: string; archived?: "true" | "false" | "all" }) => {
    const q = typeof opts === "string" ? opts : opts?.q;
    const groupId = typeof opts === "string" ? undefined : opts?.groupId;
    const archived = typeof opts === "string" ? undefined : opts?.archived;
    return apiGet<ListWrap<TrainingSource>>("/api/v1/industrial/training/sources", {
      query: {
        q: q || undefined,
        groupId: groupId || undefined,
        archived: archived || undefined,
        page: "1",
        pageSize: "100",
      },
    });
  },
  listMaterials: (opts?: { q?: string; category?: string; sourceId?: string; folderId?: string }) =>
    apiGet<ListWrap<TrainingMaterial>>("/api/v1/industrial/training/materials", {
      query: {
        q: opts?.q || undefined,
        category: opts?.category || undefined,
        sourceId: opts?.sourceId || undefined,
        folderId: opts?.folderId || undefined,
        page: "1",
        pageSize: "100",
      },
    }),
  createMaterialUploadUrl: (body: {
    title: string;
    description?: string;
    filename: string;
    mimeType: string;
    contentLength: number;
    visibility?: string;
    category?: string;
    sourceId?: string | null;
    folderId?: string | null;
  }) =>
    apiSend<{
      id: string;
      documentId: string;
      uploadUrl: string;
      expiresInSeconds: number;
      category: string;
    }>("/api/v1/industrial/training/materials/upload-url", "POST", body),
  completeMaterialUpload: (materialId: string) =>
    apiSend<TrainingMaterial>(
      `/api/v1/industrial/training/materials/${materialId}/complete`,
      "POST",
      {},
    ),
  reoptimizeMaterialVideo: (materialId: string) =>
    apiSend<TrainingMaterial>(
      `/api/v1/industrial/training/materials/${materialId}/reoptimize-video`,
      "POST",
      {},
    ),
  createMaterialDownloadUrl: (materialId: string) =>
    apiSend<{
      id: string;
      title: string;
      mimeType: string;
      category: string;
      originalFilename: string;
      downloadUrl: string;
      expiresInSeconds: number;
      expiresAt: string;
    }>(`/api/v1/industrial/training/materials/${materialId}/download-url`, "POST", {}),
  archiveMaterial: (materialId: string) =>
    apiSend<{ id: string; status: string }>(
      `/api/v1/industrial/training/materials/${materialId}/archive`,
      "POST",
      {},
    ),
  updateMaterial: (
    materialId: string,
    body: {
      title?: string;
      description?: string | null;
      category?: string;
      visibility?: string;
      sourceId?: string | null;
      folderId?: string | null;
    },
  ) =>
    apiSend<TrainingMaterial>(`/api/v1/industrial/training/materials/${materialId}`, "PATCH", body),
  getSource: (id: string) => apiGet<TrainingSource>(`/api/v1/industrial/training/sources/${id}`),
  createSource: (body: {
    title: string;
    edition?: string;
    description?: string;
    groupIds?: string[];
  }) => apiSend<TrainingSource>("/api/v1/industrial/training/sources", "POST", body),
  updateSource: (
    id: string,
    body: {
      title?: string;
      edition?: string;
      description?: string;
      status?: string;
      groupIds?: string[];
    },
  ) => apiSend<TrainingSource>(`/api/v1/industrial/training/sources/${id}`, "PATCH", body),
  archiveSource: (sourceId: string) =>
    apiSend<{ id: string; status: string }>(
      `/api/v1/industrial/training/sources/${encodeURIComponent(sourceId)}/archive`,
      "POST",
      {},
    ),
  restoreSource: (sourceId: string) =>
    apiSend<TrainingSource>(
      `/api/v1/industrial/training/sources/${encodeURIComponent(sourceId)}/restore`,
      "POST",
      {},
    ),
  purgeSource: (sourceId: string) =>
    apiSend<{ id: string; status: string }>(
      `/api/v1/industrial/training/sources/${encodeURIComponent(sourceId)}`,
      "DELETE",
      {},
    ),
  listSourceFolders: (sourceId: string) =>
    apiGet<TrainingSourceFolder[]>(`/api/v1/industrial/training/sources/${sourceId}/folders`),
  createSourceFolder: (sourceId: string, body: { name: string; sortOrder?: number }) =>
    apiSend<TrainingSourceFolder>(
      `/api/v1/industrial/training/sources/${sourceId}/folders`,
      "POST",
      body,
    ),
  updateSourceFolder: (
    folderId: string,
    body: { name?: string; sortOrder?: number; status?: string },
  ) => apiSend<TrainingSourceFolder>(`/api/v1/industrial/training/folders/${folderId}`, "PATCH", body),
  listQuestions: (sourceId: string) =>
    apiGet<TrainingQuestion[]>(`/api/v1/industrial/training/sources/${sourceId}/questions`),
  createQuestion: (
    sourceId: string,
    body: {
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
  importQuestions: (
    sourceId: string,
    body: {
      chapters: Array<{
        title: string;
        pageRange?: string;
        questions: Array<{
          stem: string;
          choices: string[];
          correctIndex: number;
          explanation?: string;
          pageRef?: string;
          difficulty?: string;
          status?: string;
        }>;
      }>;
      defaultStatus?: string;
    },
  ) =>
    apiSend<{
      questionsCreated: number;
    }>(`/api/v1/industrial/training/sources/${sourceId}/questions/import`, "POST", body),
  importQuestionsFromFile: (
    sourceId: string,
    body: {
      filename: string;
      contentBase64: string;
      defaultStatus?: string;
    },
  ) =>
    apiSend<{
      questionsCreated: number;
    }>(`/api/v1/industrial/training/sources/${sourceId}/questions/import-file`, "POST", body),
  updateQuestion: (questionId: string, body: Record<string, unknown>) =>
    apiSend<TrainingQuestion>(`/api/v1/industrial/training/questions/${questionId}`, "PATCH", body),
  deleteQuestion: (questionId: string) =>
    apiSend<void>(`/api/v1/industrial/training/questions/${questionId}`, "DELETE"),
  listRecords: (opts?: { q?: string; course?: string; page?: number; pageSize?: number }) =>
    apiGet<ListWrap<TrainingRecordSearchRow>>("/api/v1/industrial/training/records", {
      query: {
        page: String(opts?.page ?? 1),
        pageSize: String(opts?.pageSize ?? 50),
        ...(opts?.q?.trim() ? { q: opts.q.trim() } : {}),
        ...(opts?.course?.trim() ? { course: opts.course.trim() } : {}),
      },
    }),
  searchRecords: async (opts: {
    q?: string;
    course?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const res = await apiGet<ListWrap<TrainingRecordSearchRow>>(
      "/api/v1/industrial/training/records",
      {
        query: {
          page: String(opts.page ?? 1),
          pageSize: String(opts.pageSize ?? 50),
          ...(opts.q?.trim() ? { q: opts.q.trim() } : {}),
          ...(opts.course?.trim() ? { course: opts.course.trim() } : {}),
        },
      },
    );
    return {
      items: res.items ?? [],
      page: res.page ?? opts.page ?? 1,
      pageSize: res.pageSize ?? opts.pageSize ?? 50,
      total: res.total ?? res.items?.length ?? 0,
    };
  },
  listRecordCourseNames: async () => {
    const names = await apiGet<string[]>("/api/v1/industrial/training/records/course-names");
    return Array.isArray(names) ? names : [];
  },
  createRecord: (body: {
    title: string;
    courseCode?: string;
    instructorName?: string;
    notes?: string;
    personnelId?: string;
    employeeNumber?: string;
    completedAt?: string;
    expiresAt?: string;
    result?: string;
    scorePercent?: number;
    attemptNumber?: number;
  }) => apiSend<{ id: string }>("/api/v1/industrial/training/records", "POST", body),
  updateRecord: (
    recordId: string,
    body: {
      title?: string;
      courseCode?: string | null;
      instructorName?: string | null;
      notes?: string | null;
      personnelId?: string | null;
      employeeNumber?: string | null;
      completedAt?: string | null;
      expiresAt?: string | null;
      status?: string;
      result?: string;
      scorePercent?: number | null;
      attemptNumber?: number | null;
    },
  ) => apiSend(`/api/v1/industrial/training/records/${recordId}`, "PATCH", body),
  archiveRecord: (recordId: string) =>
    apiSend<{ id: string; status: string }>(
      `/api/v1/industrial/training/records/${encodeURIComponent(recordId)}/archive`,
      "POST",
      {},
    ),
  listPersonnelRoster: async () => {
    const roster = await fetchAllPersonnelRows({ query: { status: "ACTIVE" } });
    return { items: roster.people };
  },
  createQuiz: (body: QuizSettings) =>
    apiSend<{ quiz: { id: string }; attempt: { id: string }; questionCount: number }>(
      "/api/v1/industrial/training/quizzes",
      "POST",
      body,
    ),
  listGroups: () => apiGet<TrainingGroup[]>("/api/v1/industrial/training/groups"),
  createGroup: (body: {
    name: string;
    description?: string;
    memberUserIds?: string[];
    memberPersonnelIds?: string[];
  }) => apiSend<TrainingGroup>("/api/v1/industrial/training/groups", "POST", body),
  updateGroup: (
    groupId: string,
    body: {
      name?: string;
      description?: string | null;
      memberUserIds?: string[];
      memberPersonnelIds?: string[];
    },
  ) => apiSend<TrainingGroup>(`/api/v1/industrial/training/groups/${groupId}`, "PATCH", body),
  archiveGroup: (groupId: string) =>
    apiSend<{ id: string }>(`/api/v1/industrial/training/groups/${groupId}/archive`, "POST", {}),
  listAssignments: () =>
    apiGet<{ items: TrainingAssignment[] }>("/api/v1/industrial/training/assignments", {
      query: { page: "1", pageSize: "100" },
    }),
  getAssignment: (assignmentId: string) =>
    apiGet<TrainingAssignment>(
      `/api/v1/industrial/training/assignments/${encodeURIComponent(assignmentId)}`,
    ),
  myTraining: () =>
    apiGet<{
      linked: boolean;
      personnelId: string | null;
      employeeNumber: string | null;
      displayName: string | null;
      openAssignments: Array<{
        assignee: { status: string; bestPercent?: number | null };
        assignment: {
          id?: string;
          title: string;
          dueAt?: string | null;
          passingPercent: number;
          sourceId?: string;
          materialId?: string | null;
        };
        sourceTitle: string;
      }>;
      trainingRecords: Array<{
        id: string;
        kind?: "completion" | "record";
        title: string;
        courseName?: string | null;
        result?: string | null;
        scorePercent?: number | null;
        attemptNumber?: number | null;
        completedAt?: string | null;
        printCompletionId?: string | null;
      }>;
      summary: { assigned: number; completed: number; overdue: number };
    }>("/api/v1/industrial/training/me"),
  myTrainingHistory: () =>
    apiGet<{
      openAssignments: unknown[];
      trainingRecords: Array<{
        id: string;
        kind?: "completion" | "record";
        title: string;
        courseName?: string | null;
        result?: string | null;
        scorePercent?: number | null;
        attemptNumber?: number | null;
        completedAt?: string | null;
        printCompletionId?: string | null;
      }>;
    }>("/api/v1/industrial/training/me/history"),
  openMyTrainingReport: () =>
    openPrintableUrl("/api/v1/industrial/training/me/report", "my-training-report.html"),
  openMyCompletionPrintable: (completionId: string) =>
    openPrintableUrl(
      `/api/v1/industrial/training/me/completions/${encodeURIComponent(completionId)}/printable`,
      "quiz-results.html",
    ),
  openMyTrainingRecordPrintable: (recordId: string) =>
    openPrintableUrl(
      `/api/v1/industrial/training/me/records/${encodeURIComponent(recordId)}/printable`,
      "training-record.html",
    ),
  createAssignment: (body: {
    title: string;
    description?: string;
    sourceId: string;
    materialId?: string | null;
    dueAt?: string | null;
    passingPercent?: number;
    quizMode?: string;
    optionCount?: number;
    feedbackEnabled?: boolean;
    timerSeconds?: number | null;
    assigneeEmployeeNumbers?: string[];
    groupIds?: string[];
  }) => apiSend<TrainingAssignment>("/api/v1/industrial/training/assignments", "POST", body),
  updateAssignment: (
    assignmentId: string,
    body: {
      title?: string;
      description?: string | null;
      materialId?: string | null;
      dueAt?: string | null;
      passingPercent?: number;
      quizMode?: string;
      optionCount?: number;
      feedbackEnabled?: boolean;
      timerSeconds?: number | null;
      assigneeEmployeeNumbers?: string[];
    },
  ) =>
    apiSend<TrainingAssignment>(
      `/api/v1/industrial/training/assignments/${assignmentId}`,
      "PATCH",
      body,
    ),
  archiveAssignment: (assignmentId: string) =>
    apiSend<{ id: string; status: string }>(
      `/api/v1/industrial/training/assignments/${assignmentId}/archive`,
      "POST",
      {},
    ),
  removeAssignmentAssignee: (assignmentId: string, assigneeId: string) =>
    apiSend<{ id: string; assignmentId: string; removed: boolean }>(
      `/api/v1/industrial/training/assignments/${assignmentId}/assignees/${assigneeId}`,
      "DELETE",
      {},
    ),
  issueAssignmentQr: (assignmentId: string, body?: { appBaseUrl?: string }) =>
    apiSend<{ token: string; url: string; assignmentId: string; title: string }>(
      `/api/v1/industrial/training/assignments/${assignmentId}/qr`,
      "POST",
      body ?? {},
    ),
  assignmentQrImage: (
    assignmentId: string,
    body: { token: string; appBaseUrl?: string },
  ) =>
    apiSend<{ dataBase64: string; contentType: string; url: string }>(
      `/api/v1/industrial/training/assignments/${assignmentId}/qr/image`,
      "POST",
      body,
    ),
  revokeAssignmentQr: (assignmentId: string) =>
    apiSend<{ id: string }>(
      `/api/v1/industrial/training/assignments/${assignmentId}/qr/revoke`,
      "POST",
      {},
    ),
  downloadPaperQuiz: (sourceId: string, variant: "trainee" | "key" = "trainee") =>
    openPaperQuizHtml(sourceId, variant),
  openPersonnelTrainingReport: (personnelId: string) =>
    openPrintableUrl(
      `/api/v1/industrial/training/personnel/${encodeURIComponent(personnelId)}/report`,
      "training-report.html",
    ),
  openPersonnelCompletionPrintable: (personnelId: string, completionId: string) =>
    openPrintableUrl(
      `/api/v1/industrial/training/personnel/${encodeURIComponent(personnelId)}/completions/${encodeURIComponent(completionId)}/printable`,
      "quiz-results.html",
    ),
  openPersonnelTrainingRecordPrintable: (personnelId: string, recordId: string) =>
    openPrintableUrl(
      `/api/v1/industrial/training/personnel/${encodeURIComponent(personnelId)}/records/${encodeURIComponent(recordId)}/printable`,
      "training-record.html",
    ),
  openAttemptPrintable: (attemptId: string) =>
    openPrintableUrl(
      `/api/v1/industrial/training/attempts/${encodeURIComponent(attemptId)}/printable`,
      "quiz-results.html",
    ),
  openAccessTrainingReport: (token: string, sessionToken: string) =>
    openPrintableUrl(
      `/api/v1/public/training/access/${encodeURIComponent(token)}/report?sessionToken=${encodeURIComponent(sessionToken)}`,
      "training-report.html",
    ),
  openAccessCompletionPrintable: (token: string, sessionToken: string, completionId: string) =>
    openPrintableUrl(
      `/api/v1/public/training/access/${encodeURIComponent(token)}/completions/${encodeURIComponent(completionId)}/printable?sessionToken=${encodeURIComponent(sessionToken)}`,
      "quiz-results.html",
    ),
  openAccessAttemptPrintable: (token: string, sessionToken: string, attemptId: string) =>
    openPrintableUrl(
      `/api/v1/public/training/access/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/printable?sessionToken=${encodeURIComponent(sessionToken)}`,
      "quiz-results.html",
    ),
  logoutAccessSession: (token: string, sessionToken: string) =>
    apiSend<{ loggedOut: boolean }>(
      `/api/v1/public/training/access/${encodeURIComponent(token)}/session/logout`,
      "POST",
      { sessionToken },
    ),
  acknowledgeAccessCourse: (
    token: string,
    body: { sessionToken: string; assignmentId: string; acknowledgementText: string },
  ) =>
    apiSend<{ id: string; acknowledgedAt: string }>(
      `/api/v1/public/training/access/${encodeURIComponent(token)}/acknowledge`,
      "POST",
      body,
    ),
  bulkAssign: (
    assignmentId: string,
    body: {
      departmentId?: string;
      siteId?: string;
      positionId?: string;
      jobTitle?: string;
      companyWide?: boolean;
    },
  ) =>
    apiSend<{ added: number }>(
      `/api/v1/industrial/training/assignments/${encodeURIComponent(assignmentId)}/bulk-assign`,
      "POST",
      body,
    ),
  complianceMatrix: () =>
    apiGet<{
      courses: Array<{ sourceId: string; title: string }>;
      rows: Array<{
        personnelId: string;
        displayName: string;
        employeeNumber: string | null;
        departmentName: string | null;
        siteName: string | null;
        jobTitle: string | null;
        cells: Record<
          string,
          {
            status: string;
            bestPercent: number | null;
            completedAt: string | null;
            dueAt: string | null;
            assignmentTitle: string;
          } | null
        >;
      }>;
    }>("/api/v1/industrial/training/compliance-matrix"),
  getPortalConfig: () =>
    apiGet<{
      employeeNumberPrefix: string;
      portalEnabled: boolean;
      employeeNumberHint: string | null;
    }>("/api/v1/industrial/training/portal-config"),
  putPortalConfig: (body: {
    employeeNumberPrefix?: string;
    portalEnabled?: boolean;
    employeeNumberHint?: string | null;
  }) =>
    apiSend<{
      employeeNumberPrefix: string;
      portalEnabled: boolean;
      employeeNumberHint: string | null;
    }>("/api/v1/industrial/training/portal-config", "PUT", body),
  postPaperResults: (
    sourceId: string,
    body: {
      assignmentId?: string;
      passingPercent?: number;
      results: PaperQuizResultRow[];
    },
  ) =>
    apiSend<PaperQuizPostResult>(
      `/api/v1/industrial/training/sources/${sourceId}/paper-results`,
      "POST",
      body,
    ),
  postAssignmentPaperResults: (
    assignmentId: string,
    body: { results: PaperQuizResultRow[] },
  ) =>
    apiSend<PaperQuizPostResult>(
      `/api/v1/industrial/training/assignments/${assignmentId}/paper-results`,
      "POST",
      body,
    ),
  teamSummary: () =>
    apiGet<TrainingTeamSummary>("/api/v1/industrial/training/team-summary"),
  nextQuestion: (attemptId: string) =>
    apiGet<{
      done: boolean;
      index?: number;
      total?: number;
      feedbackEnabled?: boolean;
      timerSeconds?: number | null;
      mode?: string;
      mastery?: { mastered: number; total: number };
      question?: { id: string; stem: string; choices: string[]; pageRef?: string };
      attempt?: Record<string, unknown>;
    }>(`/api/v1/industrial/training/attempts/${attemptId}/next`),
  answer: (attemptId: string, questionId: string, selectedIndex: number) =>
    apiSend<{
      correct: boolean;
      done: boolean;
      explanation?: string;
      pageRef?: string;
      correctIndex?: number;
      attempt?: Record<string, unknown>;
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
