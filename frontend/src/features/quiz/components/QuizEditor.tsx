import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Play, Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useQuizStore, Question } from '../store/useQuizStore';
import { QuestionCard } from './QuestionCard';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';

// Zod validation schema
const quizSchema = z.object({
  quizTitle: z.string().min(1, 'El título del quiz es requerido'),
  questions: z.array(
    z.object({
      id: z.string(),
      question_text: z.string().min(1, 'El texto de la pregunta no puede estar vacío'),
      options: z.array(
        z.object({
          id: z.string(),
          text: z.string().min(1, 'La respuesta no puede estar vacía'),
          is_correct: z.boolean(),
        })
      )
        .length(4, 'Debe tener exactamente 4 opciones')
        .refine((opts) => opts.some((o) => o.is_correct), {
          message: 'Debes marcar una opción como la correcta',
        }),
    })
  ).min(1, 'Debes agregar al menos una pregunta'),
});

type QuizFormValues = z.infer<typeof quizSchema>;

export default function QuizEditor({ sessionId }: { sessionId?: string }) {
  const { quizTitle, questions, isSaving, lastSaved, setView, updateQuizState, saveQuizDraft, loadSessionQuestions, resetQuiz } = useQuizStore();

  // Initialize React Hook Form
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<QuizFormValues>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      quizTitle,
      questions,
    },
    mode: 'onChange',
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'questions',
  });

  // Load questions from backend on mount if sessionId is provided
  useEffect(() => {
    if (sessionId && sessionId !== 'demo' && sessionId !== 'undefined') {
      loadSessionQuestions(sessionId).then(() => {
        const freshQuestions = useQuizStore.getState().questions;
        const freshTitle = useQuizStore.getState().quizTitle;
        reset({
          quizTitle: freshTitle,
          questions: freshQuestions,
        }, {
          keepDirty: false,
        });
      });
    }
  }, [sessionId, loadSessionQuestions, reset]);

  // Watch form changes for passive debounced synchronization
  const formValues = watch();

  useEffect(() => {
    // Only subscribe and sync if the form has been modified
    if (!isDirty) return;

    const timer = setTimeout(() => {
      // Push state to Zustand and trigger real or mock save to Django API
      if (formValues.quizTitle && formValues.questions) {
        updateQuizState(formValues.quizTitle, formValues.questions as Question[]);
        saveQuizDraft(formValues.quizTitle, formValues.questions as Question[], sessionId);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [formValues, isDirty, updateQuizState, saveQuizDraft, sessionId]);

  // Handle Drag & Drop reordering
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Avoid accidental drags when clicking inside inputs
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
        // Force the form watcher to register changes and trigger save
        const updatedQuestions = [...formValues.questions];
        const item = updatedQuestions.splice(oldIndex, 1)[0];
        updatedQuestions.splice(newIndex, 0, item);
        setValue('questions', updatedQuestions, { shouldDirty: true });
      }
    }
  };

  // Add empty question card
  const handleAddQuestion = () => {
    const uniqueId = `q_${Date.now()}`;
    append({
      id: uniqueId,
      question_text: '',
      options: [
        { id: `o_${Date.now()}_1`, text: '', is_correct: false },
        { id: `o_${Date.now()}_2`, text: '', is_correct: false },
        { id: `o_${Date.now()}_3`, text: '', is_correct: false },
        { id: `o_${Date.now()}_4`, text: '', is_correct: false },
      ],
    });
  };

  // Triggered when clicking "Simular Quiz"
  const onSimulate = (data: QuizFormValues) => {
    // Save to global Zustand store immediately
    updateQuizState(data.quizTitle, data.questions as Question[]);
    // Shift views to simulator
    setView('simulator');
  };

  // Handle reset quiz draft
  const handleReset = () => {
    if (window.confirm('¿Estás seguro de que deseas restablecer el borrador del quiz? Esto borrará el contenido actual.')) {
      resetQuiz();
      const freshStore = useQuizStore.getState();
      reset({
        quizTitle: freshStore.quizTitle,
        questions: freshStore.questions,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card p-5 rounded-2xl border border-border shadow-sm">
        <div className="space-y-1.5 flex-1">
          <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Título del Quiz
          </Label>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Ej. Examen sorpresa de Javascript"
              {...register('quizTitle')}
              className="text-lg font-bold border-0 bg-transparent hover:bg-muted/10 focus-visible:bg-muted/10 focus-visible:ring-0 px-0 h-auto w-full md:max-w-md transition-all py-1 text-foreground"
            />
          </div>
          {errors.quizTitle && (
            <p className="text-xs text-red-500 font-medium flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {errors.quizTitle.message}
            </p>
          )}
        </div>

        {/* Sync / Save Indicators and Action Buttons */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Sync badge */}
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {isSaving ? (
              <span className="flex items-center gap-1.5 text-blue-500 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Guardando en Django...
              </span>
            ) : lastSaved ? (
              <span className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <Check className="w-3.5 h-3.5" />
                Guardado a las {lastSaved}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground bg-muted px-3 py-1.5 rounded-full border border-border">
                Borrador local
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={handleReset}
              className="text-xs gap-1.5 hover:text-red-500 hover:bg-red-500/10"
              title="Restablecer borrador"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restablecer
            </Button>

            <Button
              onClick={handleSubmit(onSimulate)}
              className="sidebar-gradient border-0 text-white gap-2 px-5 py-2.5 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              Simular Quiz
            </Button>
          </div>
        </div>
      </div>

      {/* Form Error Summary Alert */}
      {Object.keys(errors).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-start gap-2.5"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold">Revisa los campos del Quiz</h4>
            <p className="text-xs text-red-500/90 mt-0.5">
              Por favor completa todas las preguntas y respuestas, y asegúrate de marcar una respuesta correcta para cada tarjeta antes de simular el juego.
            </p>
          </div>
        </motion.div>
      )}

      {/* Drag & Drop Context */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {fields.map((field, index) => {
                const questionError = errors.questions?.[index] as any;
                const questionTextError = questionError?.question_text?.message;
                const optionsError = questionError?.options?.message;

                return (
                  <div key={field.id} className="relative group">
                    <QuestionCard
                      id={field.id}
                      index={index}
                      register={register}
                      setValue={setValue}
                      watch={watch}
                      onRemove={() => remove(index)}
                    />
                    {/* Render error badges on individual cards */}
                    {(questionTextError || optionsError) && (
                      <div className="absolute right-4 bottom-4 flex flex-col items-end gap-1 pointer-events-none">
                        {questionTextError && (
                          <span className="bg-red-500 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-sm">
                            {questionTextError}
                          </span>
                        )}
                        {optionsError && (
                          <span className="bg-amber-500 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-sm">
                            {optionsError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty State / Add Question Action */}
      {fields.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl bg-card p-6">
          <AlertCircle className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No hay preguntas</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Comienza a construir tu quiz agregando la primera tarjeta de preguntas.
          </p>
          <Button onClick={handleAddQuestion} className="mt-4 gap-2 sidebar-gradient border-0 text-white">
            <Plus className="w-4 h-4" /> Agregar Pregunta
          </Button>
        </div>
      )}

      {fields.length > 0 && (
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="flex justify-center"
        >
          <Button
            type="button"
            onClick={handleAddQuestion}
            variant="outline"
            className="w-full py-7 border-dashed border-2 hover:border-primary/50 text-muted-foreground hover:text-primary transition-all rounded-2xl flex items-center justify-center gap-2 group text-base font-semibold"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform text-primary" />
            Agregar Pregunta
          </Button>
        </motion.div>
      )}
    </div>
  );
}
