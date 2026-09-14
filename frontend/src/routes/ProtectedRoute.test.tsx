import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile, UserRole } from "@/types";

const auth = vi.hoisted(() => ({
  state: {
    isLoading: false,
    session: null as object | null,
    profile: null as Profile | null,
    isPasswordRecovery: false,
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.state }));

import { ProtectedRoute } from "./ProtectedRoute";

const as = (role: UserRole) => {
  auth.state.session = { access_token: "t" };
  auth.state.profile = { id: "u1", role } as Profile;
};

function renderAt(allowedRoles?: UserRole[]) {
  return render(
    <MemoryRouter initialEntries={["/usuarios"]}>
      <Routes>
        <Route path="/login" element={<p>tela de login</p>} />
        <Route path="/reset-password" element={<p>nova senha</p>} />
        <Route path="/dashboard" element={<p>dashboard</p>} />
        <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
          <Route path="/usuarios" element={<p>área restrita</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.state = {
    isLoading: false,
    session: null,
    profile: null,
    isPasswordRecovery: false,
  };
});

describe("ProtectedRoute", () => {
  it("mostra o spinner enquanto a sessão carrega", () => {
    auth.state.isLoading = true;
    const { container } = renderAt();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.queryByText("área restrita")).not.toBeInTheDocument();
    expect(screen.queryByText("tela de login")).not.toBeInTheDocument();
  });

  it("sem sessão manda para o login", () => {
    renderAt();
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("recuperação de senha tem prioridade, mesmo carregando", () => {
    as("admin");
    auth.state.isLoading = true;
    auth.state.isPasswordRecovery = true;
    renderAt();
    expect(screen.getByText("nova senha")).toBeInTheDocument();
  });

  it("papel fora da lista volta para o dashboard", () => {
    as("professor");
    renderAt(["admin"]);
    expect(screen.getByText("dashboard")).toBeInTheDocument();
  });

  it("papel permitido vê a rota", () => {
    as("coordinator");
    renderAt(["admin", "coordinator"]);
    expect(screen.getByText("área restrita")).toBeInTheDocument();
  });

  it("sem allowedRoles, qualquer sessão entra", () => {
    as("professor");
    renderAt();
    expect(screen.getByText("área restrita")).toBeInTheDocument();
  });
});
