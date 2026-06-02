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
  currentView: 'editor' | 'simulator' | 'library';
  isSaving: boolean;
  lastSaved: string | null;
  currentQuizId: string | null;
  savedQuizzes: any[];
  
  // Actions
  updateQuizState: (title: string, questions: Question[]) => void;
  setView: (view: 'editor' | 'simulator' | 'library') => void;
  saveQuizDraft: (title: string, questions: Question[], sessionId?: string, stageId?: string) => Promise<void>;
  loadSessionQuestions: (sessionId: string, stageId?: string) => Promise<void>;
  resetQuiz: () => void;

  // Library Actions
  loadSavedQuizzes: () => Promise<void>;
  saveSavedQuiz: (title: string, questions: Question[]) => Promise<string | null>;
  deleteSavedQuiz: (quizId: string) => Promise<void>;
  selectQuizForEditing: (quiz: any) => void;
  createBlankQuiz: () => void;
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

export const useQuizStore = create<QuizState>((set, get) => {
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
    currentView: 'library', // Default to library view for standalone builder
    isSaving: false,
    lastSaved: localStorage.getItem('tesseract_quiz_last_saved'),
    currentQuizId: null,
    savedQuizzes: [],

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

    saveQuizDraft: async (title, questions, sessionId, stageId) => {
      set({ isSaving: true });
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // If we have a real session active, save it in Django DB
      if (sessionId && sessionId !== 'demo' && sessionId !== 'undefined') {
        try {
          const updatedQuestions = await quizService.syncQuestions(sessionId, questions, stageId);
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

      // If we are in library mode (editing a saved quiz), auto-save to backend library!
      const currentQuizId = get().currentQuizId;
      if (!sessionId) {
        try {
          if (currentQuizId) {
            const updatedQuiz = await quizService.updateSavedQuiz(currentQuizId, title, questions);
            const updatedQuestions = updatedQuiz.questions.map((q: any) => ({
              id: q.id,
              question_text: q.text,
              options: (q.options || []).map((o: any, idx: number) => ({
                id: o.id || `o_${q.id}_${idx}`,
                text: o.text,
                is_correct: o.is_correct === true,
              })),
            }));
            set({
              quizTitle: title,
              questions: updatedQuestions,
              isSaving: false,
              lastSaved: now,
            });
            localStorage.setItem('tesseract_quiz_last_saved', now);
            return;
          } else {
            // First character auto-create
            const created = await quizService.createSavedQuiz(title, questions);
            const updatedQuestions = created.questions.map((q: any) => ({
              id: q.id,
              question_text: q.text,
              options: (q.options || []).map((o: any, idx: number) => ({
                id: o.id || `o_${q.id}_${idx}`,
                text: o.text,
                is_correct: o.is_correct === true,
              })),
            }));
            set({
              currentQuizId: created.id,
              quizTitle: title,
              questions: updatedQuestions,
              isSaving: false,
              lastSaved: now,
            });
            localStorage.setItem('tesseract_quiz_last_saved', now);
            return;
          }
        } catch (err) {
          console.error('Failed to auto-save to saved quiz library', err);
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

    loadSessionQuestions: async (sessionId, stageId) => {
      if (!sessionId || sessionId === 'demo' || sessionId === 'undefined') {
        return;
      }
      set({ isSaving: true });
      try {
        const questions = await quizService.listQuestions(sessionId, stageId);
        set({
          questions,
          isSaving: false,
        });
        console.log(`[API] Loaded questions list from Django session: ${sessionId} (stage: ${stageId})`);
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
    },

    // Library operations implementation
    loadSavedQuizzes: async () => {
      set({ isSaving: true });
      try {
        const response = await quizService.listSavedQuizzes();
        const quizzes = Array.isArray(response) ? response : (response?.results ?? []);
        set({ savedQuizzes: quizzes, isSaving: false });
      } catch (err) {
        console.error('Failed to load saved quizzes from API', err);
        set({ isSaving: false });
      }
    },

    saveSavedQuiz: async (title, questions) => {
      set({ isSaving: true });
      const currentQuizId = get().currentQuizId;
      try {
        let result;
        if (currentQuizId) {
          result = await quizService.updateSavedQuiz(currentQuizId, title, questions);
        } else {
          result = await quizService.createSavedQuiz(title, questions);
        }
        set({ currentQuizId: result.id, isSaving: false });
        return result.id;
      } catch (err) {
        console.error('Failed to save quiz to library', err);
        set({ isSaving: false });
        return null;
      }
    },

    deleteSavedQuiz: async (quizId) => {
      set({ isSaving: true });
      try {
        await quizService.deleteSavedQuiz(quizId);
        const updatedList = get().savedQuizzes.filter(q => q.id !== quizId);
        set({ savedQuizzes: updatedList, isSaving: false });
      } catch (err) {
        console.error('Failed to delete quiz from library', err);
        set({ isSaving: false });
      }
    },

    selectQuizForEditing: (quiz) => {
      const mappedQuestions = (quiz.questions || []).map((q: any) => ({
        id: q.id,
        question_text: q.text,
        options: (q.options || []).map((o: any, idx: number) => ({
          id: o.id || `o_${q.id}_${idx}`,
          text: o.text,
          is_correct: o.is_correct === true,
        })),
      }));

      set({
        currentQuizId: quiz.id,
        quizTitle: quiz.title,
        questions: mappedQuestions,
        currentView: 'editor',
      });
    },

    createBlankQuiz: () => {
      set({
        currentQuizId: null,
        quizTitle: 'Nuevo Quiz Guardado',
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
        currentView: 'editor',
      });
    },
  };
});
