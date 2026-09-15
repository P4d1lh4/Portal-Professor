import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  role: "coordinator",
  createInvite: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "u1", role: m.role } }),
}));
vi.mock("./api", () => ({ usersApi: { createInvite: m.createInvite } }));
vi.mock("sonner", () => ({ toast: m.toast }));

import { InviteDialog } from "./InviteDialog";

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InviteDialog>
        <button type="button">Abrir convite</button>
      </InviteDialog>
    </QueryClientProvider>,
  );
}

const abrir = () => userEvent.click(screen.getByRole("button", { name: "Abrir convite" }));

describe("InviteDialog (registro 69)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.createInvite.mockResolvedValue({
      code: "ABCD-EFGH-JKMN",
      role: "professor",
      expires_at: "2026-09-22T12:00:00+00:00",
    });
  });

  it("coordenador só convida professor, e o código aparece uma vez", async () => {
    m.role = "coordinator";
    renderDialog();
    await abrir();

    expect(screen.queryByLabelText("Papel da conta")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Gerar código" }));

    await waitFor(() => expect(m.createInvite).toHaveBeenCalledWith("professor"));
    expect(await screen.findByText("ABCD-EFGH-JKMN")).toBeInTheDocument();

    // Fechar e abrir de novo não mostra o código anterior.
    await userEvent.click(screen.getByRole("button", { name: "Pronto" }));
    await abrir();
    expect(screen.queryByText("ABCD-EFGH-JKMN")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar código" })).toBeInTheDocument();
  });

  it("admin escolhe o papel e pode convidar coordenador", async () => {
    m.role = "admin";
    renderDialog();
    await abrir();

    await userEvent.selectOptions(screen.getByLabelText("Papel da conta"), "coordinator");
    await userEvent.click(screen.getByRole("button", { name: "Gerar código" }));

    await waitFor(() => expect(m.createInvite).toHaveBeenCalledWith("coordinator"));
  });
});
