import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { ProtectedRoute } from "./ProtectedRoute";

// AppShell é pesado (Sidebar, Topbar, ícones, CommandPalette) — carrega só em rota protegida
const AppShell = lazy(() => import("@/components/layout/AppShell"));

// Carregamento lazy das páginas
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const ForgotPasswordPage = lazy(
  () => import("@/features/auth/ForgotPasswordPage"),
);
const ResetPasswordPage = lazy(
  () => import("@/features/auth/ResetPasswordPage"),
);
const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const PeriodsPage = lazy(() => import("@/features/periods/PeriodsPage"));
const ModulesPage = lazy(() => import("@/features/modules/ModulesPage"));
const StudentsPage = lazy(() => import("@/features/students/StudentsPage"));
const GradesPage = lazy(() => import("@/features/grades/GradesPage"));
const AttendancePage = lazy(
  () => import("@/features/attendance/AttendancePage"),
);
const ImportPage = lazy(() => import("@/features/import/ImportPage"));
const ProfilePage = lazy(() => import("@/features/users/ProfilePage"));
const UsersPage = lazy(() => import("@/features/users/UsersPage"));
const AuditLogPage = lazy(() => import("@/features/audit/AuditLogPage"));

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
}

function wrap(element: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: wrap(<LoginPage />),
  },
  {
    path: "/forgot-password",
    element: wrap(<ForgotPasswordPage />),
  },
  {
    path: "/reset-password",
    element: wrap(<ResetPasswordPage />),
  },
  {
    // Área protegida — qualquer usuário autenticado
    element: <ProtectedRoute />,
    children: [
      {
        element: wrap(<AppShell />),
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "dashboard",
            element: wrap(<DashboardPage />),
          },
          {
            path: "profile",
            element: wrap(<ProfilePage />),
          },
          // ---- Admin ----
          {
            element: <ProtectedRoute allowedRoles={["admin"]} />,
            children: [
              {
                path: "users",
                element: wrap(<UsersPage />),
              },
              {
                path: "audit-log",
                element: wrap(<AuditLogPage />),
              },
            ],
          },
          // ---- Admin + Coordenador ----
          {
            element: <ProtectedRoute allowedRoles={["admin", "coordinator"]} />,
            children: [
              {
                path: "periods",
                element: wrap(<PeriodsPage />),
              },
              {
                path: "import",
                element: wrap(<ImportPage />),
              },
            ],
          },
          // ---- Coordenador + Professor ----
          {
            element: (
              <ProtectedRoute allowedRoles={["coordinator", "professor"]} />
            ),
            children: [
              {
                path: "modules",
                element: wrap(<ModulesPage />),
              },
              {
                path: "students",
                element: wrap(<StudentsPage />),
              },
              {
                path: "grades",
                element: wrap(<GradesPage />),
              },
              {
                path: "attendance",
                element: wrap(<AttendancePage />),
              },
            ],
          },
          // Rota 404
          {
            path: "*",
            element: <Navigate to="/dashboard" replace />,
          },
        ],
      },
    ],
  },
]);
