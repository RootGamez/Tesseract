import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Users, TrendingUp, Clock, Plus,
  PlayCircle, ChevronRight, Calendar, ArrowRight
} from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Separator } from '@/shared/components/ui/separator';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sessionsService, type LiveSession } from '@/shared/services/sessionsService';
import { useToast } from '@/shared/hooks/use-toast';
import { NoSessionsEmptyState } from '../components/NoSessionsEmptyState';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  LIVE: { label: 'En Vivo', className: 'bg-green-500/15 text-green-500 border-green-500/30' },
  SCHEDULED: { label: 'Programada', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ENDED: { label: 'Finalizada', className: 'bg-muted text-muted-foreground border-border' },
  PAUSED: { label: 'Pausada', className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30' },
};

export default function StudentDashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch student's enrolled sessions
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setIsLoading(true);
        const data = await sessionsService.list();
        setSessions(data || []);
      } catch (err) {
        console.error('Error loading sessions:', err);
        toast({
          title: 'Error al cargar clases',
          description: 'No pudimos cargar tus clases. Intenta de nuevo más tarde.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadSessions();
  }, [toast]);

  // Calculate stats
  const liveSessions = sessions.filter((s) => s.state === 'LIVE');
  const totalParticipants = sessions.reduce((sum, s) => sum + (s.participant_count || 0), 0);
  const completedClasses = sessions.filter((s) => s.state === 'ENDED').length;

  // Find next scheduled session
  const nextScheduledSession = sessions
    .filter((s) => s.state === 'SCHEDULED')
    .sort((a, b) => new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime())[0];

  return (
    <div className="animate-fade-in">
      <Topbar
        title={`Hola, ${user?.display_name?.split(' ')[0] || 'Estudiante'} 👋`}
        subtitle="Aquí tienes el resumen de tus clases"
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Clases Enroladas', value: sessions.length, icon: BookOpen, gradient: 'card-gradient-blue', change: '📚' },
              { label: 'Clases en Vivo', value: liveSessions.length, icon: PlayCircle, gradient: 'card-gradient-green', change: '🔴' },
              { label: 'Clases Completadas', value: completedClasses, icon: TrendingUp, gradient: 'card-gradient-orange', change: '✅' },
              { label: 'Total Estudiantes', value: totalParticipants, icon: Users, gradient: 'card-gradient-purple', change: '👥' },
            ].map((stat, i) => (
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
                      <p className="text-xs mt-1 font-medium">{stat.change}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* No sessions state */}
        {!isLoading && sessions.length === 0 && (
          <NoSessionsEmptyState onJoinClick={() => navigate('/join')} />
        )}

        {/* Main Content Grid */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Sessions List */}
            <Card className="xl:col-span-2 border-border shadow-card">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold">Tus Clases</CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {sessions.map((session) => {
                    const badge = STATUS_CONFIG[session.state];
                    const instructorName =
                      typeof session.instructor === 'string'
                        ? session.instructor
                        : session.instructor?.display_name || 'Profesor';
                    const instructorInitial = instructorName.charAt(0).toUpperCase();

                    return (
                      <motion.div
                        key={session.id}
                        whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                        className="flex items-center justify-between px-5 py-4 cursor-pointer transition-colors"
                        onClick={() => {
                          if (session.state === 'LIVE') {
                            navigate(`/session/${session.id}/student`);
                          } else if (session.state === 'ENDED') {
                            navigate(`/session/${session.id}/replay`);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl card-gradient-blue flex items-center justify-center shrink-0">
                            <PlayCircle className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{session.title}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <div className="flex items-center gap-1">
                                <Avatar className="h-4 w-4">
                                  <AvatarFallback className="text-[8px] bg-primary text-primary-foreground font-bold">
                                    {instructorInitial}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground">
                                  Prof. {instructorName.split(' ')[0]}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="w-3 h-3" />{session.participant_count} est.
                              </span>
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
              {/* Join by Code */}
              <Card className="border-border shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Unirse a Sala</CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="pt-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Pídele a tu profesor un código de acceso y abre el formulario de ingreso.
                  </p>
                  <Button
                    className="w-full sidebar-gradient border-0 text-white gap-2 h-10"
                    onClick={() => navigate('/join')}
                  >
                    Ingresar código de sala
                  </Button>
                </CardContent>
              </Card>

              {/* Next Class */}
              {nextScheduledSession && (
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
                        <p className="font-semibold text-sm">{nextScheduledSession.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(nextScheduledSession.scheduled_at || 0).toLocaleString('es-ES', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="w-full h-9">
                      <Clock className="w-3.5 h-3.5 mr-2" />
                      Recordarme
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
