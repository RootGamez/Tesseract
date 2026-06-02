import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Users, Clock, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import type { LiveSession } from '@/shared/services/sessionsService';

interface SessionCardProps {
  session: LiveSession;
  onJoinClick: () => void;
  index?: number;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; bgColor: string }> = {
  LIVE: {
    label: 'En Vivo',
    className: 'bg-green-500/15 text-green-500 border-green-500/30',
    bgColor: 'card-gradient-green',
  },
  SCHEDULED: {
    label: 'Programada',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    bgColor: 'card-gradient-blue',
  },
  ENDED: {
    label: 'Finalizada',
    className: 'bg-muted text-muted-foreground border-border',
    bgColor: 'card-gradient-gray',
  },
  PAUSED: {
    label: 'Pausada',
    className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
    bgColor: 'card-gradient-yellow',
  },
};

export function SessionCard({ session, onJoinClick, index = 0 }: SessionCardProps) {
  const navigate = useNavigate();
  const badge = STATUS_CONFIG[session.state] || STATUS_CONFIG.ENDED;
  const instructorName =
    typeof session.instructor === 'string'
      ? session.instructor
      : session.instructor?.display_name || 'Profesor';
  const instructorInitial = instructorName.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className="border-border shadow-card hover:shadow-card-hover transition-all hover:-translate-y-1 overflow-hidden">
        <CardContent className="p-0">
          {/* Header with status */}
          <div className={`${badge.bgColor} p-4 flex items-start justify-between`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <PlayCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm line-clamp-1">{session.title}</h3>
                <p className="text-white/70 text-xs mt-0.5">
                  Prof. {instructorName.split(' ')[0]}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={`text-xs whitespace-nowrap shrink-0 ml-2 ${badge.className}`}>
              {session.state === 'LIVE' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              )}
              {badge.label}
            </Badge>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>{session.participant_count} estudiantes</span>
              </div>
              {session.state === 'SCHEDULED' && session.scheduled_at && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(session.scheduled_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>

            {/* Instructor info */}
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] bg-primary text-primary-foreground font-bold">
                  {instructorInitial}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">Impartida por {instructorName}</span>
            </div>

            {/* CTA Buttons */}
            <div className="flex gap-2 pt-2">
              {session.state === 'LIVE' ? (
                <>
                  <Button
                    size="sm"
                    className="flex-1 sidebar-gradient border-0 text-white gap-1 h-9"
                    onClick={() => onJoinClick()}
                  >
                    Entrar
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9"
                    onClick={() => navigate(`/session/${session.id}/student`)}
                  >
                    Sala en Vivo
                  </Button>
                </>
              ) : session.state === 'ENDED' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-9"
                  onClick={() => navigate(`/session/${session.id}/replay`)}
                >
                  Ver Grabación
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-9"
                  disabled
                >
                  {badge.label}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
