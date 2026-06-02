import apiClient from './apiClient';
import { Question } from '@/features/quiz/store/useQuizStore';

export const quizService = {
  /**
   * Fetches the questions list for a given session and optional stage from the Django backend.
   */
  async listQuestions(sessionId: string, stageId?: string): Promise<Question[]> {
    const url = stageId
      ? `/api/v1/gamification/sessions/${sessionId}/questions/?stage_id=${stageId}`
      : `/api/v1/gamification/sessions/${sessionId}/questions/`;
    const { data } = await apiClient.get<any[]>(url);
    
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
   * Performs an atomic batch synchronization of the questions list for a session and optional stage.
   */
  async syncQuestions(sessionId: string, questions: Question[], stageId?: string): Promise<Question[]> {
    const payload = {
      stage_id: stageId || null,
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

  // Library/Database operations for saved quizzes
  async listSavedQuizzes(): Promise<any[]> {
    const { data } = await apiClient.get<any>('/api/v1/gamification/quizzes/');
    return Array.isArray(data) ? data : (data?.results ?? []);
  },

  async getSavedQuiz(quizId: string): Promise<any> {
    const { data } = await apiClient.get<any>(`/api/v1/gamification/quizzes/${quizId}/`);
    return data;
  },

  async createSavedQuiz(title: string, questions: Question[], description = ''): Promise<any> {
    const payload = {
      title,
      description,
      questions: questions.map((q) => ({
        id: q.id.startsWith('q_') ? null : q.id,
        text: q.question_text,
        question_type: 'MULTIPLE_CHOICE',
        options: q.options.map((o) => ({
          text: o.text,
          is_correct: o.is_correct,
        })),
        duration_seconds: 20,
      })),
    };
    const { data } = await apiClient.post<any>('/api/v1/gamification/quizzes/', payload);
    return data;
  },

  async updateSavedQuiz(quizId: string, title: string, questions: Question[], description = ''): Promise<any> {
    const payload = {
      title,
      description,
      questions: questions.map((q) => ({
        id: q.id.startsWith('q_') ? null : q.id,
        text: q.question_text,
        question_type: 'MULTIPLE_CHOICE',
        options: q.options.map((o) => ({
          text: o.text,
          is_correct: o.is_correct,
        })),
        duration_seconds: 20,
      })),
    };
    const { data } = await apiClient.put<any>(`/api/v1/gamification/quizzes/${quizId}/`, payload);
    return data;
  },

  async deleteSavedQuiz(quizId: string): Promise<void> {
    await apiClient.delete(`/api/v1/gamification/quizzes/${quizId}/`);
  },
};
