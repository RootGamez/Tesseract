import { Sun, Moon, Bell, Search, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Badge } from '@/shared/components/ui/badge';
import { useTheme } from './ThemeProvider';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useNavigate } from 'react-router-dom';

interface TopbarProps {
  title: string;
  subtitle?: string;
  showNewSession?: boolean;
}

export function Topbar({ title, subtitle, showNewSession }: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const initials = user?.display_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 sticky top-0 z-30">
      <div>
        <h1 className="text-xl font-bold text-foreground leading-none">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-9 h-9 w-56 bg-muted border-0 text-sm"
          />
        </div>

        {/* New Session */}
        {showNewSession && (
          <Button
            size="sm"
            className="sidebar-gradient border-0 h-9 gap-2 text-white"
            onClick={() => navigate('/sessions/new')}
          >
            <Plus className="w-4 h-4" />
            Nueva Clase
          </Button>
        )}

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4" />
            : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="w-4 h-4" />
          <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center bg-accent text-accent-foreground border-0">
            3
          </Badge>
        </Button>

        {/* Avatar */}
        <Avatar className="h-8 w-8 border-2 border-primary/30 cursor-pointer">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
