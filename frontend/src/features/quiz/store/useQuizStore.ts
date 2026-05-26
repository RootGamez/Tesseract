import { create } from 'zustand';
import { quizService } from '@/shared/services/quizService';

export interface Option {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface Question {
  id: string;
  question_text: string;
  options: Option[];
}

interface QuizState {
  quizTitle: string;
  questions: Question[];
  currentView: 'editor' | 'simulator';
  isSaving: boolean;
  lastSaved: string | null;
  
  // Actions
  updateQuizState: (title: string, questions: Question[]) => void;
  setView: (view: 'editor' | 'simulator') => void;
  saveQuizDraft: (title: string, questions: Question[], sessionId?: string) => Promise<void>;
  loadSessionQuestions: (sessionId: string) => Promise<void>;
  resetQuiz: () => void;
}

const DEFAULT_QUESTIONS: Question[] = [
  {
    id: 'q1',
    question_text: '¿Qué significa ORM?',
    options: [
      { id: 'o1', text: 'Object-Relational Mapping', is_correct: true },
      { id: 'o2', text: 'Object-Real Mode', is_correct: false },
      { id: 'o3', text: 'Operation Resource Manager', is_correct: false },
      { id: 'o4', text: 'Option Response Method', is_correct: false },
    ],
  },
];

export const useQuizStore = create<QuizState>((set) => {
  // Try to load initial state from localStorage if available
  let initialTitle = 'Repaso de Programación';
  let initialQuestions = DEFAULT_QUESTIONS;

  try {
    const savedTitle = localStorage.getItem('tesseract_quiz_title');
    const savedQuestions = localStorage.getItem('tesseract_quiz_questions');
    if (savedTitle) initialTitle = savedTitle;
    if (savedQuestions) initialQuestions = JSON.parse(savedQuestions);
  } catch (e) {
    console.error('Failed to load quiz from localStorage', e);
  }

  return {
    quizTitle: initialTitle,
    questions: initialQuestions,
    currentView: 'editor',
    isSaving: false,
    lastSaved: localStorage.getItem('tesseract_quiz_last_saved'),

    updateQuizState: (title, questions) => {
      set({ quizTitle: title, questions });
      try {
        localStorage.setItem('tesseract_quiz_title', title);
        localStorage.setItem('tesseract_quiz_questions', JSON.stringify(questions));
      } catch (e) {
        console.error(e);
      }
    },

    setView: (view) => set({ currentView: view }),

    saveQuizDraft: async (title, questions, sessionId) => {
      set({ isSaving: true });
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // If we have a real session active, save it in Django DB
      if (sessionId && sessionId !== 'demo' && sessionId !== 'undefined') {
        try {
          const updatedQuestions = await quizService.syncQuestions(sessionId, questions);
          set({
            quizTitle: title,
            questions: updatedQuestions,
            isSaving: false,
            lastSaved: now,
          });
          
          localStorage.setItem('tesseract_quiz_title', title);
          localStorage.setItem('tesseract_quiz_questions', JSON.stringify(updatedQuestions));
          localStorage.setItem('tesseract_quiz_last_saved', now);
          console.log(`[API] Saved quiz changes successfully to Django session: ${sessionId}`);
          return;
        } catch (err) {
          console.error('Failed to auto-save to Django API, falling back to mock save', err);
        }
      }
      
      // Fallback: Simulate API call to Django backend (1.2 seconds delay)
      await new Promise((resolve) => setTimeout(resolve, 1200));
      
      set({
        quizTitle: title,
        questions,
        isSaving: false,
        lastSaved: now,
      });

      try {
        localStorage.setItem('tesseract_quiz_title', title);
        localStorage.setItem('tesseract_quiz_questions', JSON.stringify(questions));
        localStorage.setItem('tesseract_quiz_last_saved', now);
      } catch (e) {
        console.error(e);
      }
    },

    loadSessionQuestions: async (sessionId) => {
      if (!sessionId || sessionId === 'demo' || sessionId === 'undefined') {
        return;
      }
      set({ isSaving: true });
      try {
        const questions = await quizService.listQuestions(sessionId);
        set({
          questions,
          isSaving: false,
        });
        console.log(`[API] Loaded questions list from Django session: ${sessionId}`);
      } catch (err) {
        console.error('Failed to load session questions from Django', err);
        set({ isSaving: false });
      }
    },

    resetQuiz: () => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      set({
        quizTitle: 'Nuevo Quiz',
        questions: [
          {
            id: 'q1',
            question_text: '',
            options: [
              { id: 'o1', text: '', is_correct: false },
              { id: 'o2', text: '', is_correct: false },
              { id: 'o3', text: '', is_correct: false },
              { id: 'o4', text: '', is_correct: false },
            ],
          },
        ],
        lastSaved: now,
      });
      localStorage.setItem('tesseract_quiz_title', 'Nuevo Quiz');
      localStorage.setItem('tesseract_quiz_questions', JSON.stringify([
        {
          id: 'q1',
          question_text: '',
          options: [
            { id: 'o1', text: '', is_correct: false },
            { id: 'o2', text: '', is_correct: false },
            { id: 'o3', text: '', is_correct: false },
            { id: 'o4', text: '', is_correct: false },
          ],
        },
      ]));
      localStorage.setItem('tesseract_quiz_last_saved', now);
    }
  };
});
