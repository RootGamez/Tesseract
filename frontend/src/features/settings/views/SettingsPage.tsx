import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bell, Shield, Sun, Moon, Monitor, ChevronRight, Loader2 } from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Separator } from '@/shared/components/ui/separator';
import { Badge } from '@/shared/components/ui/badge';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useTheme } from '@/shared/components/layout/ThemeProvider';
import { cn } from '@/shared/lib/utils';

const THEME_OPTIONS = [
  { value: 'light',  label: 'Claro',  icon: Sun },
  { value: 'dark',   label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setIsSaving(false);
  };

  return (
    <div className="animate-fade-in">
      <Topbar title="Configuración" subtitle="Ajusta tu perfil y preferencias" />
      <div className="p-6 max-w-2xl space-y-6">

        {/* Profile section */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Perfil</CardTitle>
              </div>
              <CardDescription>Tu información de cuenta</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-2xl sidebar-gradient flex items-center justify-center text-white text-xl font-bold shrink-0">
                  {displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </div>
                <div>
                  <p className="font-semibold">{user?.display_name}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <Badge variant="outline" className="text-xs mt-1">
                    {user?.role === 'INSTRUCTOR' ? '👨‍🏫 Instructor' : '👨‍🎓 Estudiante'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre para mostrar</label>
                <Input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Correo electrónico</label>
                <Input value={user?.email ?? ''} disabled className="h-10 opacity-60 cursor-not-allowed" />
              </div>

              <div className="flex justify-end">
                <Button
                  className="sidebar-gradient border-0 text-white gap-2 hover:opacity-90"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Guardar cambios
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Appearance section */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="border-border shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Apariencia</CardTitle>
              </div>
              <CardDescription>Elige el tema visual de la plataforma</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-5">
              <div className="grid grid-cols-3 gap-3">
                {THEME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer',
                      theme === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    )}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center',
                      theme === opt.value ? 'card-gradient-blue' : 'bg-muted'
                    )}>
                      <opt.icon className={cn('w-5 h-5', theme === opt.value ? 'text-white' : 'text-muted-foreground')} />
                    </div>
                    <span className="text-sm font-medium">{opt.label}</span>
                    {theme === opt.value && (
                      <Badge className="text-[10px] bg-primary text-primary-foreground border-0 h-4 px-1.5">Activo</Badge>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications section */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="border-border shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Notificaciones</CardTitle>
              </div>
              <CardDescription>Controla qué notificaciones recibes</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 divide-y divide-border">
              {[
                { label: 'Inicio de clase', desc: 'Cuando tu instructor inicia una sesión' },
                { label: 'Puntos recibidos', desc: 'Al recibir puntos de gamificación' },
                { label: 'Resultados de quiz', desc: 'Al finalizar un quiz en clase' },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between py-3.5">
                  <div>
                    <p className="text-sm font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Danger zone */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card className="border-destructive/30 shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-destructive" />
                <CardTitle className="text-base text-destructive">Zona de Peligro</CardTitle>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Eliminar cuenta</p>
                  <p className="text-xs text-muted-foreground">Esta acción es irreversible</p>
                </div>
                <Button variant="destructive" size="sm">Eliminar</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
