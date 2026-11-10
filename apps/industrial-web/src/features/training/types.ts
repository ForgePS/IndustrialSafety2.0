export type TrainingTab =
  "assignments" | "library" | "materials" | "quiz" | "progress" | "records" | "author";

export type TrainingMaterialTopic =
  | "GENERAL"
  | "NEW_HIRE"
  | "SAFETY"
  | "LOTO"
  | "PPE"
  | "EMERGENCY"
  | "FLEET"
  | "EQUIPMENT"
  | "COMPLIANCE"
  | "REFRESHER";

export type TrainingMaterial = {
  id: string;

  title: string;

  description?: string | null;

  category: TrainingMaterialTopic | string;

  mediaKind?: string;

  mimeType: string;

  originalFilename: string;

  byteSize: number;

  status: string;

  visibility: string;

  sourceId?: string | null;

  folderId?: string | null;

  createdAt?: string;

  updatedAt?: string;
};

export type TrainingSourceFolder = {
  id: string;

  sourceId: string;

  name: string;

  sortOrder: number;

  createdAt?: string;

  updatedAt?: string;
};

export type TrainingSource = {
  id: string;

  title: string;

  edition?: string | null;

  description?: string | null;

  status: string;

  questionCount: number;

  groupIds?: string[];

  groupNames?: string[];

  archivedAt?: string | null;

  updatedAt?: string;
};

export type TrainingQuestion = {
  id: string;

  sourceId: string;

  stem: string;

  choices: string[];

  correctIndex: number;

  explanation?: string | null;

  pageRef?: string | null;

  difficulty?: string | null;

  status: string;
};

export type QuizSettings = {
  sourceId: string;

  mode: "STANDARD" | "ADAPTIVE";

  optionCount: number;

  feedbackEnabled: boolean;

  timerSeconds: number | null;

  assignmentId?: string;
};

export type TrainingGroup = {
  id: string;

  name: string;

  description?: string | null;

  memberCount: number;

  memberUserIds: string[];

  memberPersonnelIds: string[];

  updatedAt?: string;
};

export type TrainingContentDelivery = "SELF_PACED" | "GROUP_PRESENTED";

export type TrainingAssignment = {
  id: string;

  title: string;

  description?: string | null;

  sourceId: string;

  sourceTitle: string;

  materialId?: string | null;

  dueAt?: string | null;

  passingPercent: number;

  quizMode: string;

  optionCount: number;

  feedbackEnabled: boolean;

  timerSeconds?: number | null;

  /** SELF_PACED, or GROUP_PRESENTED when an instructor showed the content and assignees only take the quiz. */
  contentDelivery?: TrainingContentDelivery;

  contentPresentedAt?: string | null;

  status: string;

  assigneeCount: number;

  completedCount: number;

  hasPublicQr?: boolean;

  myStatus?: string | null;

  myBestPercent?: number | null;

  assignees?: Array<{
    personnelId?: string | null;

    userId?: string | null;

    employeeNumber?: string | null;

    label: string;

    status: string;

    bestPercent?: number | null;
  }>;

  createdAt?: string;

  updatedAt?: string;
};

export type TrainingPersonnelOption = {
  id: string;

  displayName: string;

  employeeNumber: string;

  email: string;

  userAuthId: string;
};

export type TrainingTeamSummary = {
  totals: {
    assignments: number;

    assignees: number;

    completed: number;

    inProgress: number;

    notStarted: number;

    overdue: number;
  };

  roster: Array<{
    assigneeId: string;

    assignmentId: string;

    assignmentTitle: string;

    sourceId?: string | null;

    sourceTitle: string;

    siteId?: string | null;

    siteName?: string | null;

    groupIds?: string[];

    groupNames?: string[];

    userId?: string | null;

    personnelId?: string | null;

    employeeNumber?: string | null;

    userLabel: string;

    status: string;

    bestPercent?: number | null;

    dueAt?: string | null;

    /** When this person was added to the assignment. */
    assignedAt?: string | null;

    completedAt?: string | null;

    updatedAt?: string | null;
  }>;
};
