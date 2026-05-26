import { useQuizStore } from '../store/useQuizStore';
import QuizEditor from '../components/QuizEditor';
import QuizSimulator from '../components/QuizSimulator';
import { Topbar } from '@/shared/components/layout/Topbar';

export default function QuizBuilderPage({ sessionId }: { sessionId?: string }) {
  const { currentView, setView, questions } = useQuizStore();

  const isEmbedded = !!sessionId;

  return (
    <div className={`animate-fade-in flex flex-col ${isEmbedded ? 'w-full h-full bg-transparent' : 'min-h-screen bg-background'}`}>
      {currentView === 'editor' ? (
        <>
          {/* Topbar navigation */}
          {!isEmbedded && (
            <Topbar 
              title="Creador de Quizzes" 
              subtitle="Diseña preguntas dinámicas e interactivas estilo Kahoot" 
            />
          )}
          {/* Page content padding in editor mode */}
          <div className={isEmbedded ? 'w-full p-2 flex-1' : 'p-6 max-w-6xl w-full mx-auto flex-1 pb-16'}>
            <QuizEditor sessionId={sessionId} />
          </div>
        </>
      ) : (
        /* Immersive Simulator view without Topbar or padding */
        <div className="flex-1 flex flex-col p-4 md:p-6 bg-[#321330] min-h-screen justify-center items-stretch">
          <div className="max-w-5xl w-full mx-auto">
            <QuizSimulator 
              questions={questions} 
              onExit={() => setView('editor')} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
