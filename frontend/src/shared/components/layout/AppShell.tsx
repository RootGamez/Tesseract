import { Sidebar } from './Sidebar';
import { Toaster } from '@/shared/components/ui/toaster';
import { Sheet, SheetContent } from '@/shared/components/ui/sheet';
import { useSidebarStore } from '@/shared/hooks/useSidebarStore';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isMobileOpen, setMobileOpen } = useSidebarStore();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block h-full">
        <Sidebar />
      </div>

      {/* Mobile Sidebar (Drawer) */}
      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[240px] border-r-0 bg-transparent">
          <div className="h-full w-full">
            <Sidebar forceExpanded />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
