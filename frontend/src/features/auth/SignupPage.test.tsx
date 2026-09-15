import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  checkInvite: vi.fn(),
  signup: vi.fn(),
  signIn: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ signIn: m.signIn }) }));
vi.mock("@/features/users/api", () => ({
  usersApi: { checkInvite: m.checkInvite, signup: m.signup },
}));
vi.mock("sonner", () => ({ toast: m.toast }));

import SignupPage from "./SignupPage";

const DADOS = {
  full_name: "Bia Souza",
  username: "bia",
  email: "bia@x.com",
  password: "senha-forte-123",
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/dashboard" element={<p>Painel</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function conferirCodigo(code = "abcd-efgh-jkmn") {
  await userEvent.type(screen.getByLabelText("Código do convite"), code);
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

async function preencher(confirmar = DADOS.password) {
  await userEvent.type(await screen.findByLabelText("Nome completo"), DADOS.full_name);
  await userEvent.type(screen.getByLabelText("Usuário"), DADOS.username);
  await userEvent.type(screen.getByLabelText("E-mail"), DADOS.email);
  await userEvent.type(screen.getByLabelText("Senha"), DADOS.password);
  await userEvent.type(screen.getByLabelText("Confirmar senha"), confirmar);
  await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
}

describe("SignupPage — cadastro por convite (registro 69)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.checkInvite.mockResolvedValue({ role: "professor" });
    m.signup.mockResolvedValue({});
    m.signIn.mockResolvedValue(undefined);
  });

  it("confere o código, cria a conta sem mandar papel, entra e vai para o painel", async () => {
    renderPage();
    await conferirCodigo();

    expect(await screen.findByText(/Convite para Professor\(a\)/)).toBeInTheDocument();
    expect(m.checkInvite).toHaveBeenCalledWith("abcd-efgh-jkmn");

    await preencher();

    // Objeto exato: nada de `role` no corpo; o papel vem do convite.
    await waitFor(() =>
      expect(m.signup).toHaveBeenCalledWith({ code: "abcd-efgh-jkmn", ...DADOS }),
    );
    expect(m.signIn).toHaveBeenCalledWith(DADOS.email, DADOS.password);
    expect(await screen.findByText("Painel")).toBeInTheDocument();
  });

  it("código recusado mostra o erro do servidor e fica no passo do código", async () => {
    m.checkInvite.mockRejectedValue(new Error("Código inválido ou expirado."));
    renderPage();
    await conferirCodigo("errado");

    await waitFor(() =>
      expect(m.toast.error).toHaveBeenCalledWith("Código inválido ou expirado."),
    );
    expect(screen.queryByLabelText("Nome completo")).not.toBeInTheDocument();
  });

  it("senhas diferentes não enviam o cadastro", async () => {
    renderPage();
    await conferirCodigo();
    await preencher("outra-senha-123");

    expect(await screen.findByText("As senhas não coincidem.")).toBeInTheDocument();
    expect(m.signup).not.toHaveBeenCalled();
  });

  it("cadastro recusado (ex.: código usado no meio tempo) não entra na conta", async () => {
    m.signup.mockRejectedValue(new Error("Código inválido ou expirado."));
    renderPage();
    await conferirCodigo();
    await preencher();

    await waitFor(() =>
      expect(m.toast.error).toHaveBeenCalledWith("Código inválido ou expirado."),
    );
    expect(m.signIn).not.toHaveBeenCalled();
  });
});
