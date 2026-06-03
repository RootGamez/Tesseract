import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ThemeProvider } from '@/shared/components/layout/ThemeProvider';
import { ConfirmProvider } from '@/shared/components/ui/confirm-dialog';

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="tesseract-theme">
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ThemeProvider>
  );
}
