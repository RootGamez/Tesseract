import apiClient from './apiClient';
import { Question } from '@/features/quiz/store/useQuizStore';

export const quizService = {
  /**
   * Fetches the questions list for a given session from the Django backend.
   */
  async listQuestions(sessionId: string): Promise<Question[]> {
    const { data } = await apiClient.get<any[]>(`/api/v1/gamification/sessions/${sessionId}/questions/`);
    
    // Map backend model format to frontend Question interface
    return data.map((q) => ({
      id: q.id,
      question_text: q.text,
      options: (q.options || []).map((o: any, idx: number) => ({
        id: o.id || `o_${q.id}_${idx}`,
        text: o.text,
        is_correct: o.is_correct === true,
      })),
    }));
  },

  /**
   * Performs an atomic batch synchronization of the questions list for a session.
   */
  async syncQuestions(sessionId: string, questions: Question[]): Promise<Question[]> {
    const payload = {
      questions: questions.map((q) => ({
        // Temp IDs generated on frontend are ignored so Django creates a new UUID
        id: q.id.startsWith('q_') ? null : q.id,
        question_text: q.question_text,
        options: q.options.map((o) => ({
          text: o.text,
          is_correct: o.is_correct,
        })),
        duration_seconds: 20, // default Kahoot timer duration
      })),
    };

    const { data } = await apiClient.post<any[]>(`/api/v1/gamification/sessions/${sessionId}/questions/sync/`, payload);
    
    // Map updated backend model response back to frontend interface
    return data.map((q) => ({
      id: q.id,
      question_text: q.text,
      options: (q.options || []).map((o: any, idx: number) => ({
        id: o.id || `o_${q.id}_${idx}`,
        text: o.text,
        is_correct: o.is_correct === true,
      })),
    }));
  },
};
