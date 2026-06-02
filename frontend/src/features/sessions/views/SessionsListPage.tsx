import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, PlayCircle, Users, Clock, ChevronRight, Search, Filter } from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { sessionsService, type LiveSession } from '@/shared/services/sessionsService';

const STATUS_CONFIG: Record<string, { label: string; className: string; dot?: string }> = {
  LIVE:      { label: 'En Vivo',    className: 'bg-green-500/15 text-green-500 border-green-500/30',  dot: 'bg-green-500' },
  SCHEDULED: { label: 'Programada', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ENDED:     { label: 'Finalizada', className: 'bg-muted text-muted-foreground border-border' },
  PAUSED:    { label: 'Pausada',    className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30' },
};

const MOCK: LiveSession[] = [
  { id: '1', title: 'Álgebra Lineal — Vectores', state: 'LIVE', join_code: 'VEC001', instructor: 'yo', participant_count: 28, created_at: new Date().toISOString() },
  { id: '2', title: 'Física Cuántica: Intro', state: 'SCHEDULED', join_code: 'FIS002', instructor: 'yo', participant_count: 0, created_at: new Date().toISOString() },
  { id: '3', title: 'POO con Python', state: 'ENDED', join_code: 'POO003', instructor: 'yo', participant_count: 35, created_at: new Date(Date.now() - 86400000).toISOString(), duration_seconds: 3720 },
  { id: '4', title: 'Cálculo Diferencial', state: 'ENDED', join_code: 'CAL004', instructor: 'yo', participant_count: 22, created_at: new Date(Date.now() - 172800000).toISOString(), duration_seconds: 2700 },
];

function formatDuration(seconds?: number) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SessionsListPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveSession[]>(MOCK);
  const [search, setSearch] = useState('');

  useEffect(() => {
    sessionsService.list().then(setSessions).catch(() => setSessions(MOCK));
  }, []);

  const filtered = sessions.filter(s => s.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="animate-fade-in">
      <Topbar title="Mis Clases" subtitle="Gestiona todas tus sesiones" showNewSession />
      <div className="p-6 space-y-4">
        {/* Filters bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar sesión..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted border-0"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="w-4 h-4" /> Filtrar
          </Button>
        </div>

        <Card className="border-border shadow-card">
          {/* Header row - desktop only */}
          <div className="hidden md:grid grid-cols-[1fr_120px_100px_100px_80px_48px] gap-4 px-5 py-3 bg-muted/50 rounded-t-lg border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Sesión</span>
            <span>Código</span>
            <span>Estudiantes</span>
            <span>Duración</span>
            <span>Estado</span>
            <span />
          </div>
          <CardContent className="p-0">
            {filtered.length === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <PlayCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No se encontraron sesiones</p>
              </div>
            )}
            <div className="divide-y divide-border">
              {filtered.map((s, i) => {
                const cfg = STATUS_CONFIG[s.state];
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={async () => {
                      if (s.state === 'ENDED') {
                        navigate(`/session/${s.id}/replay`);
                      } else {
                        if (s.state === 'SCHEDULED') {
                          try {
                            await sessionsService.start(s.id);
                          } catch (err) {
                            console.error('Failed to start session:', err);
                          }
                        }
                        navigate(`/session/${s.id}/instructor`);
                      }
                    }}
                  >
                    {/* Desktop View */}
                    <div className="hidden md:grid grid-cols-[1fr_120px_100px_100px_80px_48px] gap-4 px-5 py-4 items-center hover:bg-muted/40 cursor-pointer transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg card-gradient-blue flex items-center justify-center shrink-0">
                          <PlayCircle className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
                        </div>
                      </div>
                      <span className="font-mono text-sm text-muted-foreground">#{s.join_code}</span>
                      <span className="text-sm flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />{s.participant_count}
                      </span>
                      <span className="text-sm flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />{formatDuration(s.duration_seconds)}
                      </span>
                      <Badge variant="outline" className={`text-xs w-fit ${cfg.className}`}>
                        {cfg.dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1.5 animate-pulse`} />}
                        {cfg.label}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground justify-self-end" />
                    </div>

                    {/* Mobile View */}
                    <div className="flex md:hidden flex-col gap-3 p-4 hover:bg-muted/20 cursor-pointer transition-colors border-b last:border-b-0 border-border">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg card-gradient-blue flex items-center justify-center shrink-0">
                            <PlayCircle className="w-3.5 h-3.5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{s.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(s.created_at)}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 shrink-0 ${cfg.className}`}>
                          {cfg.dot && <span className={`inline-block w-1 h-1 rounded-full ${cfg.dot} mr-1 animate-pulse`} />}
                          {cfg.label}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[10px]">#{s.join_code}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.participant_count} est.</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(s.duration_seconds)}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {sessions.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl card-gradient-blue flex items-center justify-center mx-auto mb-4 opacity-60">
              <PlayCircle className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Aún no tienes clases</h3>
            <p className="text-muted-foreground mb-6">Crea tu primera sesión para comenzar</p>
            <Button className="sidebar-gradient border-0 text-white gap-2" onClick={() => navigate('/sessions/new')}>
              <Plus className="w-4 h-4" /> Crear primera clase
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
