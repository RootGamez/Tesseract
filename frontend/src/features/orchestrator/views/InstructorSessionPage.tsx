import React, { useState } from 'react';
import { useOrchestratorStore } from '../store/orchestratorStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '@/shared/components/ui/separator';

export default function InstructorSessionPage() {
  const { sessionInfo, stages, activeStageId, participants, setActiveStage } = useOrchestratorStore();
  const [activeTab, setActiveTab] = useState('clase');

  const activeStage = stages.find(s => s.id === activeStageId);

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Top Header */}
      <header className="h-14 border-b border-border flex items-center px-4 justify-between bg-card shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-bold text-primary">Tesseract</span>
          <Separator orientation="vertical" className="h-6" />
          <span className="font-medium">{sessionInfo.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-4">🔴 LIVE</span>
          <Button variant="destructive" size="sm">Finalizar Clase</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL: Stage List (220px) */}
        <aside className="w-[220px] border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-3 border-b border-border flex gap-2">
             <Button variant="outline" size="sm" className="flex-1">Ant.</Button>
             <Button variant="default" size="sm" className="flex-1">Sig.</Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {stages.map((stage) => (
              <div 
                key={stage.id}
                onClick={() => setActiveStage(stage.id)}
                className={`p-3 rounded-md cursor-pointer border ${activeStageId === stage.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm">{stage.title}</span>
                  {stage.completed && <span className="text-green-500 text-xs">✓</span>}
                </div>
                <div className="text-xs text-muted-foreground">{stage.type} • {stage.duration}m</div>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER PANEL: Main View (60% equivalent, flex-1) */}
        <main className="flex-1 bg-zinc-950 relative flex items-center justify-center">
          <div className="text-muted-foreground text-center">
            <p>Mock Area: <b>{activeStage?.type}</b></p>
            <p className="text-sm mt-2">Los estudiantes ven esta zona al 100%</p>
          </div>
        </main>

        {/* RIGHT PANEL: Gamification & Participants (280px) */}
        <aside className="w-[280px] border-l border-border bg-card flex flex-col shrink-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
            <div className="p-2 border-b border-border">
              <TabsList className="w-full">
                <TabsTrigger value="clase" className="flex-1">Clase</TabsTrigger>
                <TabsTrigger value="estudiantes" className="flex-1">Estudiantes ({participants.length})</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="clase" className="flex-1 p-4 space-y-6 overflow-y-auto m-0">
              <div>
                <h4 className="font-semibold mb-3">Gamificación</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-16 flex flex-col"><span>🎡</span><span className="text-xs">Ruleta</span></Button>
                  <Button variant="outline" className="h-16 flex flex-col"><span>⏱️</span><span className="text-xs">Timer</span></Button>
                  <Button variant="outline" className="h-16 flex flex-col col-span-2"><span>❓</span><span className="text-xs">Lanzar Quiz</span></Button>
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="font-semibold mb-3">Asignar Puntos</h4>
                <div className="flex gap-2">
                   <Button variant="outline" className="flex-1 text-tesseract-gamification font-bold">+10</Button>
                   <Button variant="outline" className="flex-1 text-tesseract-gamification font-bold">+50</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="estudiantes" className="flex-1 p-0 overflow-y-auto m-0">
              <div className="divide-y divide-border">
                {participants.map(p => (
                  <div key={p.id} className="p-3 flex justify-between items-center hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${p.online ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm">{p.name}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-tesseract-gamification">{p.points} pts</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* BOTTOM BAR: Contextual Tools */}
      <footer className="h-14 border-t border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
           <span className="text-sm font-medium text-muted-foreground mr-4">Herramientas:</span>
           {activeStage?.type === 'BOARD' && <Button variant="secondary" size="sm">🔴 Puntero Láser</Button>}
           {activeStage?.type === 'PDF' && (
             <div className="flex items-center gap-2">
               <Button variant="outline" size="sm">Ant.</Button>
               <span className="text-sm">Pág 1 / 10</span>
               <Button variant="outline" size="sm">Sig.</Button>
             </div>
           )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">📂 Recursos</Button>
          <Button variant="default" size="sm" className="bg-primary">💬 Chat</Button>
        </div>
      </footer>
    </div>
  );
}
