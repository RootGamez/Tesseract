import { Menu, Sun, Moon, Bell, Search, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { useTheme } from './ThemeProvider';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useNavigate } from 'react-router-dom';
import { useSidebarStore } from '@/shared/hooks/useSidebarStore';

interface TopbarProps {
  title: string;
  subtitle?: string;
  showNewSession?: boolean;
}

export function Topbar({ title, subtitle, showNewSession }: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { setMobileOpen } = useSidebarStore();
  const initials = user?.display_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground md:hidden shrink-0"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground leading-none">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Buscar..." className="pl-9 h-9 w-52 bg-muted border-0 text-sm focus-visible:ring-1" />
        </div>

        {/* New Session button (instructor only) */}
        {showNewSession && (
          <Button
            size="sm"
            className="sidebar-gradient border-0 h-9 gap-2 text-white hover:opacity-90 transition-opacity"
            onClick={() => navigate('/sessions/new')}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Clase</span>
          </Button>
        )}

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="h-9 w-9 relative text-muted-foreground hover:text-foreground">
          <Bell className="w-4 h-4" />
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent text-[9px] font-bold text-white flex items-center justify-center">
            3
          </span>
        </Button>

        {/* User Avatar */}
        <Avatar className="h-8 w-8 border-2 border-primary/30 cursor-pointer hover:border-primary transition-colors">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
