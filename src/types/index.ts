export type QuestionType = 'multiple_choice' | 'complete' | 'true_false' | 'short_answer';

export type AgeGroup = 'senior' | 'youth' | 'family' | 'servant';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  title: string;
  points: number;
  explanation: string;
  verseReference?: string;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple_choice';
  options: string[];
  correctAnswerIndex: number;
}

export interface CompleteVerseQuestion extends BaseQuestion {
  type: 'complete';
  verseWithBlank: string;
  blankAnswer: string;
  wordBank?: string[];
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: 'true_false';
  statement: string;
  isCorrect: boolean;
}

export interface ShortAnswerQuestion extends BaseQuestion {
  type: 'short_answer';
  questionPrompt: string;
  modelAnswer: string;
  keywords: string[];
  maxPoints: number;
}

export type Question = 
  | MultipleChoiceQuestion 
  | CompleteVerseQuestion 
  | TrueFalseQuestion 
  | ShortAnswerQuestion;

export interface ScriptureVerse {
  verse: number;
  text: string;
}

export interface DailyQuiz {
  id: string;
  dayNumber: number; // رقم اليوم: 1، 2، 3...
  dayLabel?: string;  // اليوم الأول، اليوم الثاني...
  date: string; // YYYY-MM-DD
  isMainToday?: boolean; // هل هذا هو اليوم الرئيسي الحالي
  testament: 'old' | 'new';
  bookName: string;
  chapterNumber: number;
  title: string;
  keyVerse: string;
  reflection: string;
  audioUrl: string;
  audioDuration?: string;
  verses: ScriptureVerse[];
  questions: Question[];
  totalPoints: number;
  published: boolean;
}

export interface UserQuizSubmission {
  quizId: string;
  dayNumber?: number;
  date: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  answers: Record<string, any>;
  status: 'graded' | 'needs_review';
  adminNotes?: string;
}

export interface User {
  id: string;
  fullName: string;
  email?: string;
  password?: string;
  phone: string;
  ageGroup: AgeGroup;
  role: 'admin' | 'user';
  totalPoints: number;
  quizzesSolved: number;
  currentStreak: number;
  registeredBy: 'self' | 'admin';
  servantNotes?: string;
  createdAt: string;
  submissions: UserQuizSubmission[];
}

export interface PointLog {
  id: string;
  userId: string;
  userName: string;
  change: number;
  reason: string;
  date: string;
  adminName: string;
}

export interface DatabaseConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  isConnected?: boolean;
  lastChecked?: string;
  tablePrefix?: string;
  syncMode?: 'direct' | 'bridge';
  bridgeUrl?: string;
  bridgeSecret?: string;
}
