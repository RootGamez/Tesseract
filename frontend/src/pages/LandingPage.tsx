import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-primary mb-2">Tesseract</h1>
        <p className="text-muted-foreground">Plataforma de Acompañamiento Interactivo</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl justify-center">
        {/* Student Card */}
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Soy Estudiante</CardTitle>
            <CardDescription>Ingresa el código de tu sesión</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Ej. A1B2C3" className="text-center text-lg uppercase tracking-widest" maxLength={6} />
            <Button className="w-full" size="lg" onClick={() => navigate('/session/mock/student')}>
              Unirse a la Clase
            </Button>
          </CardContent>
        </Card>

        {/* Instructor Card */}
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Soy Instructor</CardTitle>
            <CardDescription>Accede a tu panel de control</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <Button variant="outline" className="w-full" size="lg" onClick={() => navigate('/dashboard')}>
              Ingresar con Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
