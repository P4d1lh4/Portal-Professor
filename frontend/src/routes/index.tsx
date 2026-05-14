import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { ProtectedRoute } from "./ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { UnderConstruction } from "@/components/shared/UnderConstruction";

// Carregamento lazy das páginas
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const PeriodsPage = lazy(() => import("@/features/periods/PeriodsPage"));
const ModulesPage = lazy(() => import("@/features/modules/ModulesPage"));
const StudentsPage = lazy(() => import("@/features/students/StudentsPage"));
const GradesPage = lazy(() => import("@/features/grades/GradesPage"));
const ImportPage = lazy(() => import("@/features/import/ImportPage"));

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
    // Área protegida — qualquer usuário autenticado
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "dashboard",
            element: wrap(<DashboardPage />),
          },
          // ---- Admin ----
          {
            element: <ProtectedRoute allowedRoles={["admin"]} />,
            children: [
              {
                path: "users",
                element: (
                  <UnderConstruction
                    title="Usuários"
                    step="Passo 6"
                  />
                ),
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
                path: "import",
                element: wrap(<ImportPage />),
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
