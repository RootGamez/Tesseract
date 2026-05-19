import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ThemeProvider } from '@/shared/components/layout/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="tesseract-theme">
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
