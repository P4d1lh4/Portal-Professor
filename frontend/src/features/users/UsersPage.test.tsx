import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/types";

const m = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  resetPassword: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "admin-1", role: "admin" } }),
}));
vi.mock("./api", () => ({
  usersApi: { list: m.list, update: m.update, resetPassword: m.resetPassword },
}));
vi.mock("sonner", () => ({ toast: m.toast }));

import UsersPage from "./UsersPage";

const usuario = (id: string, full_name: string): Profile => ({
  id,
  username: id,
  full_name,
  email: `${id}@x.com`,
  role: "professor",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

async function editar(nome: string) {
  await userEvent.click(await screen.findByRole("button", { name: `Editar ${nome}` }));
}

describe("UsersPage — redefinir senha (B-S5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.list.mockResolvedValue({
      items: [usuario("admin-1", "Admin"), usuario("u2", "Bia")],
      total: 2,
      limit: 25,
      offset: 0,
    });
    m.update.mockResolvedValue(usuario("u2", "Bia"));
    m.resetPassword.mockResolvedValue({});
  });

  it("com a nova senha preenchida, salva os dados e redefine a senha", async () => {
    renderPage();
    await editar("Bia");
    await userEvent.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(m.resetPassword).toHaveBeenCalledWith("u2", "senha-nova-123"));
    expect(m.update).toHaveBeenCalledWith("u2", {
      username: "u2",
      full_name: "Bia",
      role: "professor",
    });
  });

  it("com a nova senha em branco, só salva os dados", async () => {
    renderPage();
    await editar("Bia");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(m.update).toHaveBeenCalled());
    expect(m.resetPassword).not.toHaveBeenCalled();
  });

  it("senha curta mostra o erro e não envia nada", async () => {
    renderPage();
    await editar("Bia");
    await userEvent.type(screen.getByLabelText("Nova senha"), "curta");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Senha deve ter ao menos 8 caracteres")).toBeInTheDocument();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.resetPassword).not.toHaveBeenCalled();
  });

  it("editando a si mesmo, não mostra o campo de senha", async () => {
    renderPage();
    await editar("Admin");

    expect(await screen.findByLabelText("Nome completo *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });
});
