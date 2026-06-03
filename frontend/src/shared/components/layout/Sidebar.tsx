import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, PlayCircle, BarChart3, Users,
  Settings, LogOut, Zap, Gamepad2, X
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { useAuthStore } from '@/features/auth/store/authStore';
import { authService } from '@/shared/services/authService';
import { cn } from '@/shared/lib/utils';
import { useSidebarStore } from '@/shared/hooks/useSidebarStore';
import { Button } from '../ui/button';

const INSTRUCTOR_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sessions', icon: PlayCircle, label: 'Mis Clases' },
  { to: '/templates', icon: BookOpen, label: 'Plantillas' },
  { to: '/quiz-builder', icon: Gamepad2, label: 'Quiz Builder' },
  { to: '/analytics', icon: BarChart3, label: 'Analíticas' },
  { to: '/students', icon: Users, label: 'Estudiantes' },
];

const STUDENT_NAV = [
  { to: '/student-dashboard', icon: LayoutDashboard, label: 'Mi Dashboard' },
];

export function Sidebar() {
  const { user, clearUser } = useAuthStore();
  const navigate = useNavigate();
  const { close } = useSidebarStore();
  const nav = user?.role === 'STUDENT' ? STUDENT_NAV : INSTRUCTOR_NAV;

  const handleLogout = async () => {
    close();
    await authService.logout();
    clearUser();
    navigate('/login');
  };

  const initials = user?.display_name
    ? user.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <aside className="sidebar-gradient shadow-sidebar flex flex-col h-full w-full overflow-hidden relative">
      {/* Header: logo + close */}
      <div className="p-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-lg whitespace-nowrap">Tesseract</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 shrink-0"
          onClick={close}
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* User profile */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center gap-3">
        <Avatar className="h-9 w-9 shrink-0 border-2 border-white/30">
          <AvatarFallback className="bg-white/20 text-white text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="overflow-hidden min-w-0">
          <p className="text-white font-semibold text-sm truncate">{user?.display_name || 'Usuario'}</p>
          <p className="text-white/50 text-xs">{user?.role === 'INSTRUCTOR' ? 'Instructor' : 'Estudiante'}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard' || to === '/student-dashboard' || to === '/join'}
            onClick={close}
          >
            {({ isActive }) => (
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer group',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}>
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">{label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <NavLink to="/settings" onClick={close}>
          {({ isActive }) => (
            <div className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer',
              isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            )}>
              <Settings className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">Configuración</span>
            </div>
          )}
        </NavLink>
        <Button variant="ghost"
          onClick={handleLogout}
          className="w-full flex items-center justify-start gap-3 px-3 py-2.5 rounded-xl text-white/60 hover:bg-red-500/20 hover:text-red-300 transition-all"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">Cerrar Sesión</span>
        </Button>
      </div>
    </aside>
  );
}
