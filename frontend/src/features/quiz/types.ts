/** Shared types for the live (Kahoot-style) quiz flow. */

export interface QuizOption {
  id: number;
  text: string;
}

export interface LiveQuestion {
  question_id: string;
  text: string;
  options: QuizOption[];
  duration_s: number;
  /** 1-based position, optional — supplied by the instructor flow for progress UI. */
  index?: number;
  total?: number;
}

export interface LeaderboardEntry {
  participant_id: string;
  student_id?: string | null;
  display_name: string;
  points: number;
  rank: number;
}

export interface RevealResult {
  participant_id: string;
  display_name: string;
  answer_index: string | number;
  is_correct: boolean;
  points_awarded: number;
  response_time_ms: number | null;
}

/** Payload of the `quiz-reveal` window event (server `QUIZ_REVEAL`). */
export interface QuizRevealPayload {
  question_id: string;
  correct_index: number | null;
  correct_text: string;
  explanation: string;
  counts: Record<string, number>;
  total_responses: number;
  results: RevealResult[];
  leaderboard: LeaderboardEntry[];
  /** This client's own result (injected per-connection by the server). */
  you?: RevealResult | null;
  /** This client's own leaderboard standing. */
  you_rank?: LeaderboardEntry | null;
}

/** Payload of the `quiz-finished` window event (server `QUIZ_FINISHED`). */
export interface QuizFinishedPayload {
  leaderboard: LeaderboardEntry[];
  total_questions?: number | null;
  you_rank?: LeaderboardEntry | null;
}
