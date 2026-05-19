import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 border-r border-border bg-card p-4 flex flex-col gap-4">
        <div className="font-bold text-xl text-primary mb-6">Tesseract</div>
        <Button variant="secondary" className="justify-start">Mis Plantillas</Button>
        <Button variant="ghost" className="justify-start">Historial</Button>
        <Button variant="ghost" className="justify-start">Analíticas</Button>
      </aside>
      <main className="flex-1 p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Mis Plantillas de Clase</h1>
          <Button onClick={() => navigate('/session/mock/instructor')}>Iniciar Clase de Prueba</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Mock Template Card */}
          <div className="border border-border rounded-lg p-6 bg-card hover:border-primary transition-colors cursor-pointer" onClick={() => navigate('/session/mock/instructor')}>
            <h3 className="font-semibold text-lg mb-2">Introducción a Física</h3>
            <p className="text-sm text-muted-foreground mb-4">4 Etapas • 60 mins</p>
            <Button variant="outline" className="w-full">Editar</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
