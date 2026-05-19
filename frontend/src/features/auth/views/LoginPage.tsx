import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, BookOpen, Zap, Users, BarChart3 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Separator } from '@/shared/components/ui/separator';
import { useAuthStore } from '../store/authStore';
import { authService } from '@/shared/services/authService';
import { useToast } from '@/shared/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});
type LoginForm = z.infer<typeof loginSchema>;

const FEATURES = [
  { icon: Zap, label: 'Pizarra en Tiempo Real', color: 'text-yellow-400' },
  { icon: Users, label: 'Gamificación Interactiva', color: 'text-sky-400' },
  { icon: BookOpen, label: 'Recursos Sincronizados', color: 'text-green-400' },
  { icon: BarChart3, label: 'Analíticas Post-clase', color: 'text-purple-400' },
];

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginForm) => {
    setIsLoading(true);
    try {
      const { user } = await authService.login(values);
      setUser(user);
      const destination = user.role === 'STUDENT' ? '/join' : '/dashboard';
      navigate(from === '/dashboard' ? destination : from, { replace: true });
    } catch (error: any) {
      toast({
        title: 'Error de autenticación',
        description: error?.response?.data?.detail || 'Credenciales incorrectas.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoInstructor = () => {
    form.setValue('email', 'instructor@tesseract.com');
    form.setValue('password', 'demo12345');
  };
  const handleDemoStudent = () => {
    form.setValue('email', 'student@tesseract.com');
    form.setValue('password', 'demo12345');
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 sidebar-gradient flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-10 w-48 h-48 rounded-full bg-yellow-300 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-bold text-2xl">Tesseract</span>
          </div>

          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Clases interactivas<br />en tiempo real
          </h1>
          <p className="text-white/70 text-lg mb-12">
            La plataforma que transforma tus clases virtuales en experiencias inmersivas.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, label, color }) => (
              <div key={label} className="glass rounded-xl p-4 flex items-center gap-3">
                <Icon className={`w-5 h-5 ${color} shrink-0`} />
                <span className="text-white/90 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/40 text-sm">
          © 2025 Tesseract Platform. Todos los derechos reservados.
        </p>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <Zap className="w-7 h-7 text-primary" />
            <span className="font-bold text-xl text-foreground">Tesseract</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-foreground">Bienvenido</h2>
            <p className="text-muted-foreground mt-2">Ingresa tus credenciales para continuar</p>
          </div>

          <Card className="border-border shadow-card">
            <CardContent className="pt-6 space-y-5">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@correo.com"
                    {...form.register('email')}
                    className="h-11"
                  />
                  {form.formState.errors.email && (
                    <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      {...form.register('password')}
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-semibold sidebar-gradient border-0 hover:opacity-90"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                  Iniciar Sesión
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">o acceso rápido (demo)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="sm" onClick={handleDemoInstructor} className="text-xs">
                  Demo Instructor
                </Button>
                <Button variant="outline" size="sm" onClick={handleDemoStudent} className="text-xs">
                  Demo Estudiante
                </Button>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            ¿Eres estudiante?{' '}
            <button
              onClick={() => navigate('/join')}
              className="text-primary font-semibold hover:underline"
            >
              Únete con código de clase
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
