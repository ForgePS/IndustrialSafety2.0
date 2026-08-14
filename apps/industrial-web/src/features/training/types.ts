export type TrainingTab =
  | "library"
  | "quiz"
  | "progress"
  | "records"
  | "author";

export type TrainingSource = {
  id: string;
  title: string;
  edition?: string | null;
  description?: string | null;
  status: string;
  chapterCount: number;
  questionCount: number;
  updatedAt?: string;
};

export type TrainingChapter = {
  id: string;
  sourceId: string;
  title: string;
  sortOrder: number;
  pageRange?: string | null;
  status: string;
};

export type TrainingQuestion = {
  id: string;
  sourceId: string;
  chapterId: string;
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
  chapterIds: string[];
  mode: "STANDARD" | "ADAPTIVE";
  optionCount: number;
  feedbackEnabled: boolean;
  timerSeconds: number | null;
};
