import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, Loader2, BookOpen, Zap, Users, BarChart3,
  GraduationCap, Presentation, ArrowLeft, ArrowRight, User, Mail, Lock, Calendar
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useAuthStore } from '../store/authStore';
import { authService } from '@/shared/services/authService';
import { useToast } from '@/shared/hooks/use-toast';
import { Toaster } from '@/shared/components/ui/toaster';

const FEATURES = [
  { icon: Zap, label: 'Pizarra en Tiempo Real', color: 'text-yellow-400' },
  { icon: Users, label: 'Gamificación Interactiva', color: 'text-sky-400' },
  { icon: BookOpen, label: 'Recursos Sincronizados', color: 'text-green-400' },
  { icon: BarChart3, label: 'Analíticas Post-clase', color: 'text-purple-400' },
];

const registerSchema = z.object({
  display_name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  age: z.string().refine((val) => {
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= 5 && num <= 120;
  }, { message: 'Edad inválida (mínimo 5 años)' }),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  password_confirm: z.string().min(8, 'Confirma tu contraseña'),
}).refine((data) => data.password === data.password_confirm, {
  message: 'Las contraseñas no coinciden',
  path: ['password_confirm'],
});

type RegisterForm = z.infer<typeof registerSchema>;

type Step = 'role' | 'info';

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<'STUDENT' | 'INSTRUCTOR' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      display_name: '',
      age: '',
      email: '',
      password: '',
      password_confirm: '',
    },
  });

  const onSubmit = async (values: RegisterForm) => {
    if (!role) {
      toast({
        title: 'Selecciona un rol',
        description: 'Debes elegir si eres estudiante o instructor.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const { user } = await authService.register({
        email: values.email,
        display_name: values.display_name,
        password: values.password,
        password_confirm: values.password_confirm,
        role: role,
      });
      
      setUser(user);
      
      toast({
        title: 'Registro exitoso',
        description: `¡Bienvenido a Tesseract, ${user.display_name}!`,
      });

      // Redirect based on role
      setTimeout(() => {
        navigate(user.role === 'STUDENT' ? '/join' : '/dashboard', { replace: true });
      }, 1000);
      
    } catch (err: any) {
      const errorMessage = err?.response?.data?.email?.[0] || 
                           err?.response?.data?.error?.message || 
                           'Hubo un problema al crear tu cuenta. Intenta de nuevo.';
      toast({
        title: 'Error al registrarse',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = () => {
    if (!role) {
      toast({
        title: 'Rol requerido',
        description: 'Por favor selecciona si eres Estudiante o Instructor para continuar.',
        variant: 'destructive',
      });
      return;
    }
    setStep('info');
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Branding (same as login for visual coherence) */}
      <div className="hidden lg:flex lg:w-1/2 sidebar-gradient flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-10 w-48 h-48 rounded-full bg-yellow-300 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="cursor-pointer flex items-center gap-3 mb-16" onClick={() => navigate('/')}>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-bold text-2xl">Tesseract</span>
          </div>
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Únete a la nueva era<br />de aprendizaje interactivo
          </h1>
          <p className="text-white/70 text-lg mb-12">
            Crea tu cuenta gratis en menos de un minuto y empieza a transformar tus clases.
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
        <p className="relative z-10 text-white/40 text-sm">© 2025 Tesseract Platform.</p>
      </div>

      {/* Right Panel — Interactive registration flow */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-lg">
          <div className="flex lg:hidden items-center gap-2 mb-8" onClick={() => navigate('/')}>
            <Zap className="w-7 h-7 text-primary" />
            <span className="font-bold text-xl">Tesseract</span>
          </div>

          <AnimatePresence mode="wait">
            {step === 'role' ? (
              <motion.div
                key="step-role"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-3xl font-extrabold text-foreground">Elige tu rol</h2>
                  <p className="text-muted-foreground mt-2">¿Cómo planeas utilizar la plataforma?</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Student Card */}
                  <Card
                    onClick={() => setRole('STUDENT')}
                    className={`cursor-pointer transition-all border-2 duration-300 relative overflow-hidden group shadow-card hover:shadow-card-hover ${
                      role === 'STUDENT'
                        ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/20'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
                        role === 'STUDENT'
                          ? 'card-gradient-blue text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <GraduationCap className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground">Soy Estudiante</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Únete a clases de tus profesores, acumula puntos y chatea en vivo.
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        role === 'STUDENT'
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      }`}>
                        {role === 'STUDENT' && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Instructor Card */}
                  <Card
                    onClick={() => setRole('INSTRUCTOR')}
                    className={`cursor-pointer transition-all border-2 duration-300 relative overflow-hidden group shadow-card hover:shadow-card-hover ${
                      role === 'INSTRUCTOR'
                        ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/20'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
                        role === 'INSTRUCTOR'
                          ? 'card-gradient-orange text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <Presentation className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground">Soy Instructor</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Crea sesiones, maneja la pizarra, comparte PDFs, evalúa y mantén el control.
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        role === 'INSTRUCTOR'
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      }`}>
                        {role === 'INSTRUCTOR' && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex justify-between items-center pt-4">
                  <Button variant="ghost" onClick={() => navigate('/login')} className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Volver a Iniciar Sesión
                  </Button>
                  <Button onClick={nextStep} className="sidebar-gradient border-0 text-white font-semibold gap-2 h-11 px-6">
                    Siguiente
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-info"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div>
                  <Button variant="ghost" onClick={() => setStep('role')} className="p-0 hover:bg-transparent text-primary gap-1 mb-2 font-medium">
                    <ArrowLeft className="w-4 h-4" />
                    Volver a elegir rol
                  </Button>
                  <h2 className="text-3xl font-extrabold text-foreground">Crea tu cuenta</h2>
                  <p className="text-muted-foreground mt-1">
                    Registrándote como <span className="font-bold text-primary">{role === 'STUDENT' ? 'Estudiante' : 'Instructor'}</span>
                  </p>
                </div>

                <Card className="border-border shadow-card">
                  <CardContent className="pt-6">
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      {/* Name */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="display_name">Nombre completo</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="display_name" placeholder="Tu Nombre Completo" {...form.register('display_name')} className="h-11 pl-10" />
                        </div>
                        {form.formState.errors.display_name && (
                          <p className="text-destructive text-xs">{form.formState.errors.display_name.message}</p>
                        )}
                      </div>

                      {/* Age */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="age">Edad</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="age" type="number" placeholder="Ej. 20" {...form.register('age')} className="h-11 pl-10" />
                        </div>
                        {form.formState.errors.age && (
                          <p className="text-destructive text-xs">{form.formState.errors.age.message}</p>
                        )}
                      </div>

                      {/* Email */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="email">Correo electrónico</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="email" type="email" placeholder="nombre@correo.com" {...form.register('email')} className="h-11 pl-10" />
                        </div>
                        {form.formState.errors.email && (
                          <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
                        )}
                      </div>

                      {/* Password */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="password">Contraseña</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Mínimo 8 caracteres"
                            {...form.register('password')}
                            className="h-11 pl-10 pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                        {form.formState.errors.password && (
                          <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
                        )}
                      </div>

                      {/* Password Confirm */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="password_confirm">Confirmar contraseña</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="password_confirm"
                            type={showPasswordConfirm ? 'text' : 'password'}
                            placeholder="Repite la contraseña"
                            {...form.register('password_confirm')}
                            className="h-11 pl-10 pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                          >
                            {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                        {form.formState.errors.password_confirm && (
                          <p className="text-destructive text-xs">{form.formState.errors.password_confirm.message}</p>
                        )}
                      </div>

                      <Button type="submit" className="w-full h-11 text-base font-semibold sidebar-gradient border-0 text-white hover:opacity-90 pt-1" disabled={isLoading}>
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Registrarme e Iniciar Sesión
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <p className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{' '}
                  <Button variant="link" size="sm" className="p-0" onClick={() => navigate('/login')}>
                    Inicia Sesión
                  </Button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
