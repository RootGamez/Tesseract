import { createBrowserRouter } from 'react-router-dom';
import LandingPage from '@/pages/LandingPage';
import DashboardPage from '@/features/dashboard/views/DashboardPage';
import InstructorSessionPage from '@/features/orchestrator/views/InstructorSessionPage';
import StudentSessionPage from '@/features/student/views/StudentSessionPage';
import ReplaySessionPage from '@/pages/ReplaySessionPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/dashboard',
    element: <DashboardPage />,
  },
  {
    path: '/session/:id/instructor',
    element: <InstructorSessionPage />,
  },
  {
    path: '/session/:id/student',
    element: <StudentSessionPage />,
  },
  {
    path: '/session/:id/replay',
    element: <ReplaySessionPage />,
  },
]);
