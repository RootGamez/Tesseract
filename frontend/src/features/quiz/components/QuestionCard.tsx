import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

interface QuestionCardProps {
  id: string;
  index: number;
  register: UseFormRegister<any>;
  setValue: UseFormSetValue<any>;
  watch: UseFormWatch<any>;
  onRemove: () => void;
}

const SHAPES = [
  { shape: '▲', color: 'bg-red-500 border-red-600', textColor: 'text-red-500', name: 'Rojo (Triángulo)' },
  { shape: '◆', color: 'bg-blue-500 border-blue-600', textColor: 'text-blue-500', name: 'Azul (Rombo)' },
  { shape: '●', color: 'bg-amber-500 border-amber-600', textColor: 'text-amber-500', name: 'Amarillo (Círculo)' },
  { shape: '■', color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-500', name: 'Verde (Cuadrado)' },
];

export function QuestionCard({ id, index, register, setValue, watch, onRemove }: QuestionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  // Watch the options to see which one is correct
  const options = watch(`questions.${index}.options`);

  const handleCorrectChange = (optIdx: number) => {
    // Set selected as correct, all others as incorrect
    for (let i = 0; i < 4; i++) {
      setValue(`questions.${index}.options.${i}.is_correct`, i === optIdx, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className={`border rounded-2xl bg-card text-card-foreground shadow-sm transition-all relative ${
        isDragging ? 'border-primary/60 shadow-lg scale-[1.01] bg-muted/30' : 'border-border hover:shadow-md'
      }`}
    >
      {/* Question Card Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20 rounded-t-2xl">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          title="Arrastra para reordenar"
        >
          <GripVertical className="w-5 h-5" />
        </div>

        <span className="font-semibold text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">
          Pregunta {index + 1}
        </span>

        {/* Delete Question Button */}
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
          title="Eliminar pregunta"
        >
          <Trash2 className="w-4.5 h-4.5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Question Text Input */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Texto de la Pregunta
          </Label>
          <Input
            placeholder="Escribe la pregunta aquí (ej. ¿Cuál es la sintaxis correcta para... ?)"
            {...register(`questions.${index}.question_text`)}
            className="w-full text-base font-medium py-6 px-4 bg-muted/10 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded-xl text-foreground"
          />
          {/* Validation error display for question text */}
          <input type="hidden" {...register(`questions.${index}.id`)} />
        </div>

        {/* Options Grid */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase block mb-1">
            Respuestas (Selecciona la correcta con el botón de radio)
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SHAPES.map((shapeInfo, optIdx) => {
              const isCorrect = options?.[optIdx]?.is_correct === true;
              return (
                <div
                  key={optIdx}
                  className={`flex items-center gap-3 p-3.5 border rounded-xl transition-all ${
                    isCorrect
                      ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500'
                      : 'border-border bg-card hover:bg-muted/10'
                  }`}
                >
                  {/* Radio Group Selection */}
                  <label className="flex items-center justify-center cursor-pointer select-none">
                    <input
                      type="radio"
                      name={`questions.${index}.correct_option`}
                      checked={isCorrect}
                      onChange={() => handleCorrectChange(optIdx)}
                      className="sr-only"
                    />
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isCorrect
                          ? 'border-emerald-500 bg-emerald-500 text-white scale-110'
                          : 'border-muted-foreground/40 hover:border-primary bg-transparent'
                      }`}
                    >
                      {isCorrect && (
                        <div className="w-2 h-2 rounded-full bg-white animate-scale-in" />
                      )}
                    </div>
                  </label>

                  {/* Kahoot Icon Shape */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0 select-none ${shapeInfo.color}`}
                  >
                    {shapeInfo.shape}
                  </div>

                  {/* Option Text Input */}
                  <div className="flex-1">
                    <Input
                      placeholder={`Opción ${optIdx + 1}`}
                      {...register(`questions.${index}.options.${optIdx}.text`)}
                      className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1.5 h-auto text-sm font-medium bg-transparent placeholder:text-muted-foreground/60 w-full text-foreground"
                    />
                    <input type="hidden" {...register(`questions.${index}.options.${optIdx}.id`)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
