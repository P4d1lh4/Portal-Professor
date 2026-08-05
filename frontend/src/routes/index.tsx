import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { ProtectedRoute } from "./ProtectedRoute";
import { RouteErrorFallback } from "@/components/shared/ErrorBoundary";

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

// Quando o link do e-mail falha (expirado, já usado, inválido), o Supabase
// devolve o usuário na Site URL — a RAIZ, não o `redirect_to` — com o motivo
// no hash: `#error=access_denied&error_code=otp_expired&...`. O supabase-js
// descarta esse hash sem criar sessão, então o ProtectedRoute só via "sem
// sessão" e mandava para /login sem explicação nenhuma. Reaponta para
// /reset-password, que já tem a UI de "link inválido ou expirado".
// Precisa rodar antes do createBrowserRouter: o router lê window.location
// no momento em que é criado.
if (window.location.hash.includes("error_code=")) {
  window.history.replaceState(null, "", "/reset-password");
}

export const router = createBrowserRouter([
  {
    // Boundary raiz: captura erros de render de qualquer rota (evita tela branca).
    errorElement: <RouteErrorFallback />,
    children: [
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
    ],
  },
]);
