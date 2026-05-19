import React from 'react';
import { useSceneStore } from '../store/sceneStore';
import { Button } from '@/shared/components/ui/button';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Badge } from '@/shared/components/ui/badge';

export default function StudentSessionPage() {
  const { activeScene, points } = useSceneStore();

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 overflow-hidden relative">
      {/* FULL SCREEN MAIN VIEW */}
      <main className="flex-1 flex items-center justify-center relative">
        <div className="text-center text-muted-foreground">
          <p className="text-xl">Vista del Estudiante</p>
          <p className="font-bold text-3xl mt-4 text-white">Escena: {activeScene}</p>
        </div>
      </main>

      {/* FLOATING POINT ANIMATION (Mock placeholder) */}
      <div className="absolute bottom-20 right-6 z-50">
        {/* We will add Framer Motion AnimatePresence here later */}
      </div>

      {/* BOTTOM TOOLBAR (56px) */}
      <footer className="h-14 border-t border-border bg-card/90 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 absolute bottom-0 w-full z-40">
        {/* Left: User Info */}
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-xs">AG</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">Ana García</span>
        </div>

        {/* Center: Emojis */}
        <div className="flex items-center gap-2">
          {['👍', '❤️', '😂', '😮', '😢', '👏', '🚀', '👀'].map((emoji, idx) => (
            <Button key={idx} variant="ghost" size="icon" className="h-8 w-8 text-lg hover:bg-muted">
              {emoji}
            </Button>
          ))}
        </div>

        {/* Right: Points & Chat */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Puntos</span>
            <Badge variant="secondary" className="text-sm font-mono text-tesseract-gamification bg-accent/10 border-accent/20">
              {points}
            </Badge>
          </div>
          <Button variant="default" size="sm" className="bg-primary rounded-full px-4">
            💬 Chat
          </Button>
        </div>
      </footer>
    </div>
  );
}
