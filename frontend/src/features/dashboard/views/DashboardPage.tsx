import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircle, Users, BookOpen, Zap, TrendingUp, Clock, Plus,
  ArrowRight, Calendar, ChevronRight
} from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Separator } from '@/shared/components/ui/separator';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sessionsService, type LiveSession } from '@/shared/services/sessionsService';

const STAT_CARDS = [
  { label: 'Clases Impartidas', value: '24', change: '+3 este mes', icon: PlayCircle, gradient: 'card-gradient-blue' },
  { label: 'Estudiantes Activos', value: '312', change: '+18 esta semana', icon: Users, gradient: 'card-gradient-orange' },
  { label: 'Plantillas Creadas', value: '8', change: '2 nuevas', icon: BookOpen, gradient: 'card-gradient-purple' },
  { label: 'Puntos Otorgados', value: '4.2K', change: '+890 hoy', icon: Zap, gradient: 'card-gradient-green' },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  LIVE:      { label: 'En Vivo',    className: 'bg-green-500/15 text-green-500 border-green-500/30' },
  SCHEDULED: { label: 'Programada', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ENDED:     { label: 'Finalizada', className: 'bg-muted text-muted-foreground border-border' },
  PAUSED:    { label: 'Pausada',    className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30' },
};

const MOCK_SESSIONS: LiveSession[] = [
  { id: '1', title: 'Introducción a Álgebra Lineal', state: 'LIVE', join_code: 'AB1234', instructor: 'Prof. García', participant_count: 28, created_at: new Date().toISOString() },
  { id: '2', title: 'Física Cuántica: Conceptos Base', state: 'SCHEDULED', join_code: 'CD5678', instructor: 'Prof. García', participant_count: 0, created_at: new Date().toISOString() },
  { id: '3', title: 'Programación Orientada a Objetos', state: 'ENDED', join_code: 'EF9012', instructor: 'Prof. García', participant_count: 35, created_at: new Date().toISOString(), duration_seconds: 3600 },
];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveSession[]>(MOCK_SESSIONS);

  useEffect(() => {
    sessionsService.list()
      .then(setSessions)
      .catch(() => setSessions(MOCK_SESSIONS));
  }, []);

  return (
    <div className="animate-fade-in">
      <Topbar
        title={`Hola, ${user?.display_name?.split(' ')[0] || 'Profe'} 👋`}
        subtitle="Aquí tienes el resumen de tu actividad"
        showNewSession
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {STAT_CARDS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="overflow-hidden border-border shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 cursor-pointer">
                <CardContent className="p-0">
                  <div className={`${stat.gradient} p-4 flex items-center justify-between`}>
                    <stat.icon className="w-7 h-7 text-white" />
                    <TrendingUp className="w-4 h-4 text-white/60" />
                  </div>
                  <div className="p-4">
                    <p className="text-3xl font-extrabold text-foreground">{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{stat.label}</p>
                    <p className="text-xs text-green-500 mt-1 font-medium flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />{stat.change}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Sessions List */}
          <Card className="xl:col-span-2 border-border shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Clases Recientes</CardTitle>
              <Button variant="ghost" size="sm" className="text-primary text-xs gap-1" onClick={() => navigate('/sessions')}>
                Ver todas <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {sessions.map((session) => {
                  const badge = STATUS_CONFIG[session.state];
                  return (
                    <motion.div
                      key={session.id}
                      whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                      className="flex items-center justify-between px-5 py-4 cursor-pointer transition-colors"
                      onClick={() =>
                        session.state === 'LIVE'
                          ? navigate(`/session/${session.id}/instructor`)
                          : navigate(`/sessions/${session.id}`)
                      }
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl card-gradient-blue flex items-center justify-center shrink-0">
                          <PlayCircle className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{session.title}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="w-3 h-3" />{session.participant_count} est.
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">#{session.join_code}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className={`text-xs ${badge.className}`}>
                          {session.state === 'LIVE' && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                          )}
                          {badge.label}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Sidebar widgets */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <Card className="border-border shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Acciones Rápidas</CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 space-y-2">
                <Button
                  className="w-full sidebar-gradient border-0 text-white justify-start gap-3 h-10"
                  onClick={() => navigate('/sessions/new')}
                >
                  <Plus className="w-4 h-4" />
                  Crear Nueva Clase
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 h-10" onClick={() => navigate('/templates')}>
                  <BookOpen className="w-4 h-4" />
                  Crear Plantilla
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 h-10" onClick={() => navigate('/analytics')}>
                  <TrendingUp className="w-4 h-4" />
                  Ver Analíticas
                </Button>
              </CardContent>
            </Card>

            {/* Next Class */}
            <Card className="border-border shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Próxima Clase</CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl card-gradient-orange flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Física Cuántica</p>
                    <p className="text-xs text-muted-foreground">Hoy, 15:00 — 60 min</p>
                  </div>
                </div>
                <div className="flex items-center">
                  {[1, 2, 3, 4].map((i) => (
                    <Avatar key={i} className="h-6 w-6 border-2 border-background -ml-1 first:ml-0">
                      <AvatarFallback className="text-[9px] bg-primary text-primary-foreground font-bold">
                        E{i}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  <span className="text-xs text-muted-foreground ml-2">+24 estudiantes</span>
                </div>
                <Button size="sm" className="w-full sidebar-gradient border-0 text-white gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Iniciar Ahora
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
