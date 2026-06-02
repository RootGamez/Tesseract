import { useEffect } from 'react';
import { useQuizStore } from '../store/useQuizStore';
import QuizEditor from '../components/QuizEditor';
import QuizSimulator from '../components/QuizSimulator';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Button } from '@/shared/components/ui/button';
import { Trophy, Plus, Edit, Trash2, Play, BookOpen } from 'lucide-react';

export default function QuizBuilderPage({ sessionId, stageId }: { sessionId?: string; stageId?: string }) {
  const { 
    currentView, 
    setView, 
    questions, 
    savedQuizzes, 
    loadSavedQuizzes, 
    selectQuizForEditing, 
    createBlankQuiz, 
    deleteSavedQuiz 
  } = useQuizStore();

  const isEmbedded = !!sessionId;

  useEffect(() => {
    if (isEmbedded) {
      setView('editor');
    } else {
      loadSavedQuizzes();
      setView('library');
    }
  }, [isEmbedded, setView, loadSavedQuizzes]);

  return (
    <div className={`animate-fade-in flex flex-col ${isEmbedded ? 'w-full h-full bg-transparent' : 'min-h-screen bg-background'}`}>
      {currentView === 'library' && !isEmbedded ? (
        <>
          <Topbar 
            title="Mi Biblioteca de Quizzes" 
            subtitle="Administra y crea cuestionarios para tus clases interactivas" 
          />
          <div className="p-6 max-w-6xl w-full mx-auto flex-1 pb-16 space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-foreground">Tus Quizzes Guardados</h2>
                <p className="text-sm text-muted-foreground">Puedes utilizarlos al crear escenas en tus clases en vivo.</p>
              </div>
              <Button onClick={createBlankQuiz} className="sidebar-gradient border-0 text-white gap-2 px-5 py-2.5 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all">
                <Plus className="w-4 h-4" /> Crear nuevo Quiz
              </Button>
            </div>

            {savedQuizzes.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl bg-card p-6">
                <Trophy className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h3 className="font-semibold text-lg text-foreground">No tienes quizzes guardados</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Crea tu primer quiz para tenerlo disponible al momento de iniciar una clase en vivo.
                </p>
                <Button onClick={createBlankQuiz} className="mt-5 gap-2 sidebar-gradient border-0 text-white">
                  <Plus className="w-4 h-4" /> Crear mi primer Quiz
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedQuizzes.map((quiz) => (
                  <div key={quiz.id} className="bg-card border border-border hover:border-primary/30 rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                          <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {quiz.title}
                          </h3>
                          <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
                            {quiz.question_count} {quiz.question_count === 1 ? 'Pregunta' : 'Preguntas'}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 h-10">
                        {quiz.description || 'Sin descripción disponible.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 text-xs gap-1.5 h-9" 
                        onClick={() => selectQuizForEditing(quiz)}
                      >
                        <Edit className="w-3.5 h-3.5" /> Editar
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="text-xs gap-1.5 h-9 px-3" 
                        onClick={() => {
                          selectQuizForEditing(quiz);
                          setView('simulator');
                        }}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> Simular
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs h-9 w-9 p-0 hover:bg-red-500/10 hover:text-red-500" 
                        onClick={() => {
                          if (window.confirm(`¿Estás seguro de que deseas eliminar "${quiz.title}"?`)) {
                            deleteSavedQuiz(quiz.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : currentView === 'editor' ? (
        <>
          {!isEmbedded && (
            <div className="bg-card border-b border-border py-4 px-6 flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setView('library')} className="text-sm text-muted-foreground hover:text-foreground">
                  ← Volver a la Biblioteca
                </Button>
              </div>
            </div>
          )}
          <div className={isEmbedded ? 'w-full p-2 flex-1' : 'p-6 max-w-6xl w-full mx-auto flex-1 pb-16'}>
            <QuizEditor sessionId={sessionId} stageId={stageId} />
          </div>
        </>
      ) : (
        /* Immersive Simulator view without Topbar or padding */
        <div className="flex-1 flex flex-col p-4 md:p-6 bg-[#321330] min-h-screen justify-center items-stretch">
          <div className="max-w-5xl w-full mx-auto">
            <QuizSimulator 
              questions={questions} 
              onExit={() => setView(isEmbedded ? 'editor' : 'library')} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
