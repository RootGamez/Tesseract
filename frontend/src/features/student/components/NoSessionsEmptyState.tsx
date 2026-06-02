import { motion } from 'framer-motion';
import { BookOpen, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface NoSessionsEmptyStateProps {
  onJoinClick: () => void;
}

export function NoSessionsEmptyState({ onJoinClick }: NoSessionsEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="w-20 h-20 rounded-2xl card-gradient-blue flex items-center justify-center mb-4">
        <BookOpen className="w-10 h-10 text-white" />
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-2">
        Aún no tienes clases enroladas
      </h3>
      <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
        Pídele a tu profesor un código de acceso para unirte a una clase y comienza a aprender.
      </p>

      <Button
        className="sidebar-gradient border-0 text-white gap-2"
        onClick={onJoinClick}
      >
        <Plus className="w-4 h-4" />
        Unirme a una Clase
      </Button>
    </motion.div>
  );
}
