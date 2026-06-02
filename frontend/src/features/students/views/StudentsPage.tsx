import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Users, Trophy, Clock, MoreHorizontal } from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';

const MOCK_STUDENTS = [
  { id: '1', name: 'Ana García',   email: 'ana@mail.com',   sessions: 12, points: 1240, lastActive: 'Hoy',    online: true  },
  { id: '2', name: 'Luis Pérez',   email: 'luis@mail.com',  sessions: 9,  points: 980,  lastActive: 'Ayer',   online: false },
  { id: '3', name: 'María Gómez',  email: 'maria@mail.com', sessions: 14, points: 875,  lastActive: 'Hoy',    online: true  },
  { id: '4', name: 'Carlos López', email: 'carlos@mail.com',sessions: 8,  points: 740,  lastActive: 'Hace 3d', online: false },
  { id: '5', name: 'Sofia Ruiz',   email: 'sofia@mail.com', sessions: 7,  points: 690,  lastActive: 'Hoy',    online: true  },
  { id: '6', name: 'Diego Torres', email: 'diego@mail.com', sessions: 5,  points: 540,  lastActive: 'Ayer',   online: false },
];

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const filtered = MOCK_STUDENTS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <Topbar title="Estudiantes" subtitle={`${MOCK_STUDENTS.length} estudiantes registrados`} />
      <div className="p-6 space-y-4">
        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted border-0"
            />
          </div>
          <Badge variant="outline" className="h-9 px-3 flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {MOCK_STUDENTS.filter(s => s.online).length} online
          </Badge>
        </div>

        <Card className="border-border shadow-card">
          {/* Header row - desktop only */}
          <div className="hidden md:grid grid-cols-[1fr_180px_100px_100px_100px_40px] gap-4 px-5 py-3 bg-muted/50 rounded-t-lg border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Estudiante</span>
            <span>Email</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Sesiones</span>
            <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />Puntos</span>
            <span>Última actividad</span>
            <span />
          </div>
          <CardContent className="p-0">
            {filtered.length === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No se encontraron estudiantes</p>
              </div>
            )}
            <div className="divide-y divide-border">
              {filtered.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  {/* Desktop View */}
                  <div className="hidden md:grid grid-cols-[1fr_180px_100px_100px_100px_40px] gap-4 px-5 py-4 items-center hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">
                            {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${s.online ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      </div>
                      <p className="font-medium text-sm truncate">{s.name}</p>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{s.email}</p>
                    <p className="text-sm font-mono">{s.sessions}</p>
                    <p className="text-sm font-bold font-mono text-accent">{s.points}</p>
                    <p className="text-xs text-muted-foreground">{s.lastActive}</p>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground justify-self-end">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Mobile View */}
                  <div className="flex md:hidden flex-col gap-3 p-4 hover:bg-muted/20 transition-colors border-b last:border-b-0 border-border">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">
                              {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${s.online ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg">
                      <div className="flex items-center gap-3 font-mono">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.sessions} ses.</span>
                        <span className="flex items-center gap-1 font-bold text-accent"><Trophy className="w-3 h-3" />{s.points} pts</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Última act: {s.lastActive}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
