import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, BookOpen, PlayCircle, BarChart3, Users,
  Settings, LogOut, Zap, ChevronLeft, ChevronRight, Gamepad2
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { useAuthStore } from '@/features/auth/store/authStore';
import { authService } from '@/shared/services/authService';
import { cn } from '@/shared/lib/utils';
import { useState } from 'react';
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
  const [collapsed, setCollapsed] = useState(false);
  const nav = user?.role === 'STUDENT' ? STUDENT_NAV : INSTRUCTOR_NAV;

  const handleLogout = async () => {
    await authService.logout();
    clearUser();
    navigate('/login');
  };

  const initials = user?.display_name
    ? user.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="sidebar-gradient shadow-sidebar flex flex-col h-full shrink-0 overflow-hidden relative"
    >
      {/* Collapse toggle */}
      <Button variant="ghost" size="icon" className="absolute -right-3 top-4 z-10" onClick={() => setCollapsed(!collapsed)}>
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-white" />
          : <ChevronLeft className="w-3 h-3 text-white" />}
      </Button>

      {/* Logo */}
      <div className="p-5 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="font-bold text-white text-lg whitespace-nowrap overflow-hidden"
            >
              Tesseract
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* User profile */}
      <div className={cn(
        'px-4 py-4 border-b border-white/10 flex items-center gap-3',
        collapsed && 'justify-center'
      )}>
        <Avatar className="h-9 w-9 shrink-0 border-2 border-white/30">
          <AvatarFallback className="bg-white/20 text-white text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-hidden min-w-0"
            >
              <p className="text-white font-semibold text-sm truncate">{user?.display_name || 'Usuario'}</p>
              <p className="text-white/50 text-xs">{user?.role === 'INSTRUCTOR' ? 'Instructor' : 'Estudiante'}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/dashboard' || to === '/student-dashboard' || to === '/join'}>
            {({ isActive }) => (
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer group',
                collapsed && 'justify-center',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}>
                <Icon className="w-5 h-5 shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <NavLink to="/settings">
          {({ isActive }) => (
            <div className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer',
              collapsed && 'justify-center',
              isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            )}>
              <Settings className="w-5 h-5 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium">
                    Configuración
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )}
        </NavLink>
        <Button variant="ghost"
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 hover:bg-red-500/20 hover:text-red-300 transition-all',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium">
                Cerrar Sesión
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </motion.aside>
  );
}
