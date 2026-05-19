import { BookOpen, Plus, Zap, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';

const TEMPLATES = [
  { id: '1', name: 'Clase Magistral', description: 'Exposición teórica con pizarra, PDF y quiz final', stages: 4, icon: BookOpen, gradient: 'card-gradient-blue' },
  { id: '2', name: 'Taller Práctico', description: 'Pizarra colaborativa, snippets de código y evaluación', stages: 5, icon: Zap, gradient: 'card-gradient-orange' },
  { id: '3', name: 'Clase Rápida', description: 'Estructura de 30 minutos: intro, actividad y cierre', stages: 3, icon: Clock, gradient: 'card-gradient-green' },
];

export default function TemplatesPage() {
  return (
    <div className="animate-fade-in">
      <Topbar title="Plantillas" subtitle="Reutiliza estructuras de clase que ya funcionan" />
      <div className="p-6 space-y-6">
        <div className="flex justify-end">
          <Button className="sidebar-gradient border-0 text-white gap-2">
            <Plus className="w-4 h-4" /> Nueva Plantilla
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {TEMPLATES.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="border-border shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 cursor-pointer group">
                <CardContent className="p-0">
                  <div className={`${t.gradient} p-5 rounded-t-lg flex items-center gap-3`}>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <t.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{t.name}</h3>
                      <Badge className="bg-white/20 text-white border-0 text-[10px] mt-0.5">
                        {t.stages} etapas
                      </Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground">{t.description}</p>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="flex-1 text-xs">Editar</Button>
                      <Button size="sm" className="flex-1 text-xs sidebar-gradient border-0 text-white">Usar</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}

          {/* Add new card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: TEMPLATES.length * 0.08 }}>
            <Card className="border-dashed border-2 border-border hover:border-primary/50 transition-colors cursor-pointer h-full min-h-[200px] flex items-center justify-center group">
              <CardContent className="flex flex-col items-center gap-3 text-muted-foreground group-hover:text-primary transition-colors">
                <div className="w-12 h-12 rounded-xl border-2 border-dashed border-current flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </div>
                <p className="font-medium text-sm">Crear nueva plantilla</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
