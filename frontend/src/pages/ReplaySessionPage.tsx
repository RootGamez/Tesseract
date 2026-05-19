import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';

export default function ReplaySessionPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <header className="h-14 border-b border-border flex items-center px-4 justify-between bg-card shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-bold text-primary">Tesseract</span>
          <span className="font-medium text-muted-foreground">Repaso de Clase: Introducción a Física</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>Volver</Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[250px] border-r border-border bg-card flex flex-col shrink-0 p-4 space-y-2">
          <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Etapas</h3>
          {['Intro y Pizarra', 'Conceptos Clave', 'Quiz 1'].map((stage, idx) => (
            <div key={idx} className="p-3 rounded-md border border-border hover:bg-muted cursor-pointer transition-colors">
              <span className="text-sm font-medium">{stage}</span>
            </div>
          ))}
        </aside>
        <main className="flex-1 bg-zinc-950 flex items-center justify-center">
          <div className="text-muted-foreground text-center">
            <p className="text-xl">Snapshot de la Etapa Seleccionada</p>
            <p className="text-sm mt-2">Aquí se visualizará el estado final de la pizarra o el PDF.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
