export function isTrainingAccessPortalPath(pathname?: string | null): boolean {
  const path = String(pathname ?? "");
  if (/\/training\/portal\/?$/i.test(path)) return true;
  return /\/training\/access\//i.test(path);
}

export function buildTrainingPortalViewUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/training/portal?token=${encodeURIComponent(token)}`;
}

export type PublicAccessLinkContext = {
  accessLinkId: string;
  linkType: string;
  title: string;
  description?: string | null;
  tenantKey?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  employeeNumberPrefix?: string;
  portalEnabled?: boolean;
  employeeNumberHint?: string | null;
};

export type PublicPortalAssignment = {
  assignmentId: string;
  title: string;
  sourceTitle: string;
  status: string;
  dueAt?: string | null;
  passingPercent: number;
  bestPercent?: number | null;
  completedAt?: string | null;
};

export type PublicPortalTranscriptRow = {
  id: string;
  title: string;
  courseName?: string | null;
  result?: string | null;
  scorePercent?: number | null;
  completedAt?: string | null;
  printCompletionId?: string | null;
};

export type PublicPortalSession = {
  employeeNumber: string;
  displayName: string;
  departmentName?: string | null;
  siteName?: string | null;
  jobTitle?: string | null;
  assignments: PublicPortalAssignment[];
  summary: {
    assigned: number;
    completed: number;
    remaining: number;
    overdue: number;
    dueSoon?: number;
    certifications?: number;
  };
  trainingRecords?: PublicPortalTranscriptRow[];
  sessionToken: string;
  sessionExpiresAt: string;
};

export type PublicCourseSection = {
  id: string;
  title: string;
  contentType: string;
  contentBody?: string | null;
  sortOrder: number;
  required: boolean;
};

export type PublicCourseMaterial = {
  id: string;
  title: string;
  mimeType: string | null;
  category: string | null;
  originalFilename?: string | null;
};

export type PublicCoursePlayer = {
  assignmentId: string;
  title: string;
  passingPercent: number;
  dueAt?: string | null;
  sections: PublicCourseSection[];
  progress?: {
    sectionsCompleted?: string[];
    percentComplete?: number;
    quizAvailable?: boolean;
  } | null;
  assigneeStatus: string;
  bestPercent?: number | null;
  material?: PublicCourseMaterial | null;
  /** GROUP_PRESENTED: content was shown to the group, so sections are optional review. */
  contentDelivery?: "SELF_PACED" | "GROUP_PRESENTED" | null;
  contentPresentedAt?: string | null;
};

export function isGroupPresented(course: Pick<PublicCoursePlayer, "contentDelivery">): boolean {
  return course.contentDelivery === "GROUP_PRESENTED";
}

/**
 * Whether the learner has met the course-content requirement for the quiz.
 * Group-presented assignments skip it; self-paced ones need every required section done.
 */
export function courseContentRequirementMet(
  course: Pick<PublicCoursePlayer, "contentDelivery" | "sections" | "progress">,
): boolean {
  if (isGroupPresented(course)) return true;
  if (!course.sections.length || !course.sections.some((s) => s.required)) return true;
  return Boolean(course.progress?.quizAvailable);
}

export function resolveTrainingPublicToken(input: {
  pathname?: string | null | undefined;
  queryToken?: string | null | undefined;
  routeToken?: string | null | undefined;
}): string {
  const fromQuery = String(input.queryToken ?? "").trim();
  if (fromQuery) return fromQuery;

  const path = String(input.pathname ?? "");
  const pathMatch = path.match(/\/training\/(?:access\/)?([^/]+)/i);
  const fromPathname = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]).trim() : "";
  if (fromPathname && fromPathname !== "placeholder") return fromPathname;

  const fromRoute = String(input.routeToken ?? "").trim();
  if (fromRoute && fromRoute !== "placeholder") return fromRoute;

  return "";
}

export function letterFor(index: number): string {
  return String.fromCharCode(65 + index);
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const EMPLOYEE_NUMBER_PREFIX = "EMP-";

export function defaultEmployeeNumberInput(): string {
  return EMPLOYEE_NUMBER_PREFIX;
}

export function updateEmployeeNumberInput(value: string): string {
  const upper = value.toUpperCase();
  if (!upper || upper === "E" || upper === "EM" || upper === "EMP") {
    return EMPLOYEE_NUMBER_PREFIX;
  }
  if (upper.startsWith(EMPLOYEE_NUMBER_PREFIX)) return upper;
  if (upper.startsWith("EMP")) {
    const suffix = upper.slice(3).replace(/^-*/, "");
    return EMPLOYEE_NUMBER_PREFIX + suffix;
  }
  return EMPLOYEE_NUMBER_PREFIX + upper.replace(/^-*/, "");
}

export function isEmployeeNumberComplete(value: string): boolean {
  return value.trim().length > EMPLOYEE_NUMBER_PREFIX.length;
}

export type PublicTrainingContext = {
  assignmentId: string;
  title: string;
  description?: string | null;
  sourceTitle: string;
  dueAt?: string | null;
  passingPercent: number;
  quizMode: string;
  feedbackEnabled: boolean;
  timerSeconds?: number | null;
  material?: {
    id: string;
    title: string;
    mimeType: string | null;
    category: string | null;
    originalFilename?: string | null;
  } | null;
  tenantKey?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
};

export type PublicTrainingAssignee = {
  assignmentId: string;
  employeeNumber: string;
  displayName: string;
  status: string;
  bestPercent?: number | null;
  completedAt?: string | null;
  dueAt?: string | null;
  passingPercent: number;
  title: string;
  description?: string | null;
  sourceTitle: string;
  sessionToken?: string;
  sessionExpiresAt?: string | null;
};

export const PORTAL_SESSION_STORAGE_PREFIX = "forge-training-portal-session:";

export function portalSessionStorageKey(accessToken: string): string {
  return `${PORTAL_SESSION_STORAGE_PREFIX}${accessToken}`;
}

export type StoredPortalSession = {
  sessionToken: string;
  sessionExpiresAt: string;
  displayName: string;
  employeeNumber: string;
};

export function readStoredPortalSession(accessToken: string): StoredPortalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(portalSessionStorageKey(accessToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPortalSession;
    if (!parsed.sessionToken || !parsed.sessionExpiresAt) return null;
    if (new Date(parsed.sessionExpiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(portalSessionStorageKey(accessToken));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredPortalSession(accessToken: string, session: StoredPortalSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(portalSessionStorageKey(accessToken), JSON.stringify(session));
}

export function clearStoredPortalSession(accessToken: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(portalSessionStorageKey(accessToken));
}

export type PublicQuizQuestion = {
  id: string;
  stem: string;
  choices: string[];
  pageRef?: string;
};

export type PublicQuizRunner = {
  done?: boolean;
  index?: number;
  total?: number;
  feedbackEnabled?: boolean;
  timerSeconds?: number | null;
  mode?: string;
  mastery?: { mastered: number; total: number };
  question?: PublicQuizQuestion;
};

export type PublicQuizResults = {
  scoreCorrect: number;
  scoreTotal: number;
  percent: number;
  letterGrade: string;
};
