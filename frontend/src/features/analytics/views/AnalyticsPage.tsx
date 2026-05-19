import { motion } from 'framer-motion';
import { TrendingUp, Users, Clock, Zap, Award } from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer
} from 'recharts';

const ACTIVITY_DATA = [
  { day: 'Lun', estudiantes: 22, puntos: 340 },
  { day: 'Mar', estudiantes: 35, puntos: 520 },
  { day: 'Mié', estudiantes: 28, puntos: 410 },
  { day: 'Jue', estudiantes: 41, puntos: 680 },
  { day: 'Vie', estudiantes: 38, puntos: 590 },
  { day: 'Sáb', estudiantes: 15, puntos: 210 },
  { day: 'Dom', estudiantes: 8,  puntos: 90 },
];

const TOP_STUDENTS = [
  { rank: 1, name: 'Ana García',   points: 1240, sessions: 8, badge: '🥇' },
  { rank: 2, name: 'Luis Pérez',   points: 980,  sessions: 7, badge: '🥈' },
  { rank: 3, name: 'María Gómez',  points: 875,  sessions: 9, badge: '🥉' },
  { rank: 4, name: 'Carlos López', points: 740,  sessions: 6, badge: null },
  { rank: 5, name: 'Sofia Ruiz',   points: 690,  sessions: 5, badge: null },
];

const STAT_CARDS = [
  { label: 'Promedio estudiantes/clase', value: '28', icon: Users,     gradient: 'card-gradient-blue'   },
  { label: 'Duración promedio',          value: '52m', icon: Clock,    gradient: 'card-gradient-orange'  },
  { label: 'Puntos totales otorgados',   value: '4.2K', icon: Zap,     gradient: 'card-gradient-purple'  },
  { label: 'Tasa de participación',       value: '87%', icon: TrendingUp, gradient: 'card-gradient-green' },
];

export default function AnalyticsPage() {
  return (
    <div className="animate-fade-in">
      <Topbar title="Analíticas" subtitle="Rendimiento de tus clases en los últimos 7 días" />
      <div className="p-6 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {STAT_CARDS.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className="border-border shadow-card overflow-hidden">
                <CardContent className="p-0">
                  <div className={`${s.gradient} p-3 flex justify-between items-center`}>
                    <s.icon className="w-6 h-6 text-white" />
                    <TrendingUp className="w-4 h-4 text-white/60" />
                  </div>
                  <div className="p-4">
                    <p className="text-2xl font-extrabold">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Activity chart */}
          <Card className="xl:col-span-2 border-border shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Actividad Semanal</CardTitle>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-primary inline-block" />Estudiantes</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-accent inline-block" />Puntos ÷ 10</span>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 pb-2">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={ACTIVITY_DATA} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="colorEst" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(235,80%,60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(235,80%,60%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(35,100%,55%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(35,100%,55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="estudiantes" stroke="hsl(235,80%,60%)" strokeWidth={2} fill="url(#colorEst)" dot={false} />
                  <Area type="monotone" dataKey="puntos" stroke="hsl(35,100%,55%)" strokeWidth={2} fill="url(#colorPts)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top students leaderboard */}
          <Card className="border-border shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-accent" />
                Top Estudiantes
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {TOP_STUDENTS.map(s => (
                  <div key={s.rank} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm w-5 text-center">
                      {s.badge ?? <span className="text-muted-foreground text-xs font-mono">#{s.rank}</span>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.sessions} clases</p>
                    </div>
                    <span className="text-sm font-bold font-mono text-accent">{s.points}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bar chart by session */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Participación por Clase</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 pb-2">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={ACTIVITY_DATA} margin={{ top: 0, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                />
                <Bar dataKey="estudiantes" fill="hsl(235,80%,60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
