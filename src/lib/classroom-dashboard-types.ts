export type ClassroomStudentStatus =
  | "not_started"
  | "working"
  | "stuck"
  | "completed"
  | "bonus"
  | "bonus_completed";

export type ClassroomStudentSnapshot = {
  id: string;
  name: string;
  status: ClassroomStudentStatus;
  phase: "theory" | "tasks" | "bonus" | "completed" | null;
  currentQuestionIndex: number | null;
  answeredCount: number;
  totalQuestions: number;
  bonusAnsweredCount: number;
  bonusTotalQuestions: number;
  wrongAttempts: number;
  currentWrongAttempts: number;
  needsHelp: boolean;
  lastActivityAt: string | null;
};

export type ProblemQuestionSnapshot = {
  section: "core" | "bonus";
  questionIndex: number;
  prompt: string;
  wrongAttempts: number;
  studentCount: number;
};

export type ClassroomDashboardSnapshot = {
  generatedAt: string;
  session: {
    id: number;
    groupName: string;
    lessonTitle: string;
    courseName: string;
    startedAt: string;
    endedAt: string | null;
  };
  summary: {
    notStarted: number;
    working: number;
    stuck: number;
    completed: number;
  };
  students: ClassroomStudentSnapshot[];
  problemQuestions: ProblemQuestionSnapshot[];
};
