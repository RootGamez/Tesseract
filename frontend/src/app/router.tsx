import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/features/auth/guards/RequireAuth';
import { AppShell } from '@/shared/components/layout/AppShell';

// Auth
import LoginPage from '@/features/auth/views/LoginPage';
import RegisterPage from '@/features/auth/views/RegisterPage';

// Student public
import JoinSessionPage from '@/features/student/views/JoinSessionPage';

// Instructor pages (lazy)
import { lazy, Suspense } from 'react';

const DashboardPage        = lazy(() => import('@/features/dashboard/views/DashboardPage'));
const SessionsListPage     = lazy(() => import('@/features/sessions/views/SessionsListPage'));
const CreateSessionPage    = lazy(() => import('@/features/sessions/views/CreateSessionPage'));
const TemplatesPage        = lazy(() => import('@/features/templates/views/TemplatesPage'));
const TemplateBuilderPage  = lazy(() => import('@/features/templates/views/TemplateBuilderPage'));
const QuizBuilderPage      = lazy(() => import('@/features/quiz/views/QuizBuilderPage'));
const AnalyticsPage        = lazy(() => import('@/features/analytics/views/AnalyticsPage'));
const StudentsPage         = lazy(() => import('@/features/students/views/StudentsPage'));
const SettingsPage         = lazy(() => import('@/features/settings/views/SettingsPage'));
const InstructorSessionPage = lazy(() => import('@/features/orchestrator/views/InstructorSessionPage'));

// Student pages
const StudentDashboardPage = lazy(() => import('@/features/student/views/StudentDashboardPage'));
const StudentSessionPage   = lazy(() => import('@/features/student/views/StudentSessionPage'));
const ReplaySessionPage    = lazy(() => import('@/pages/ReplaySessionPage'));

const PageLoader = () => (
  <div className="flex-1 flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-xl sidebar-gradient flex items-center justify-center animate-pulse">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <p className="text-muted-foreground text-sm">Cargando...</p>
    </div>
  </div>
);

const withShell = (element: React.ReactNode) => (
  <AppShell>
    <Suspense fallback={<PageLoader />}>
      {element}
    </Suspense>
  </AppShell>
);

export const router = createBrowserRouter([
  // Public routes
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/join',  element: <JoinSessionPage /> },

  // Root redirect
  { path: '/', element: <Navigate to="/dashboard" replace /> },

  // Student-only protected routes
  {
    path: '/student-dashboard',
    element: (
      <RequireAuth allowedRoles={['STUDENT']}>
        {withShell(<StudentDashboardPage />)}
      </RequireAuth>
    ),
  },

  // Instructor-only protected routes
  {
    path: '/dashboard',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<DashboardPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/sessions',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<SessionsListPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/sessions/new',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<CreateSessionPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/templates',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<TemplatesPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/templates/builder/:id',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<TemplateBuilderPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/quiz-builder',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<QuizBuilderPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/analytics',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<AnalyticsPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/students',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        {withShell(<StudentsPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/settings',
    element: (
      <RequireAuth>
        {withShell(<SettingsPage />)}
      </RequireAuth>
    ),
  },

  // Live session routes
  {
    path: '/session/:id/instructor',
    element: (
      <RequireAuth allowedRoles={['INSTRUCTOR', 'ADMIN']}>
        <Suspense fallback={<PageLoader />}>
          <InstructorSessionPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/session/:id/student',
    element: (
      <Suspense fallback={<PageLoader />}>
        <StudentSessionPage />
      </Suspense>
    ),
  },
  {
    path: '/session/:id/replay',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <ReplaySessionPage />
        </Suspense>
      </RequireAuth>
    ),
  },

  // 404 fallback
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
