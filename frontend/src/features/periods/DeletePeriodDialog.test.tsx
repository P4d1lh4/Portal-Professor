import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PeriodWithCoordinator } from "./api";

const m = vi.hoisted(() => ({
  deletionSummary: vi.fn(),
  delete: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./api", () => ({
  periodsApi: { deletionSummary: m.deletionSummary, delete: m.delete },
}));
vi.mock("sonner", () => ({ toast: m.toast }));

import { DeletePeriodDialog } from "./DeletePeriodDialog";

const PERIOD = { id: "p1", name: "2026.1" } as PeriodWithCoordinator;

function renderDialog() {
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DeletePeriodDialog period={PERIOD} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe("DeletePeriodDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.deletionSummary.mockResolvedValue({
      name: "2026.1",
      coordinator: "Carla",
      professors: ["Ana", "Bruno"],
      students: 32,
      modules: 5,
      enrollments: 140,
      attendance_records: 48,
      medical_certificates: 6,
      attachments: 3,
    });
    m.delete.mockResolvedValue({});
  });

  it("mostra tudo o que vai junto e só exclui com a caixa marcada", async () => {
    const onClose = renderDialog();

    await screen.findByText("Alunos");
    expect(valueOf("Alunos")).toBe("32");
    expect(valueOf("Matrículas, com notas e faltas")).toBe("140");
    expect(valueOf("Chamadas registradas")).toBe("48");
    expect(valueOf("Coordenador(a)")).toBe("Carla");
    expect(valueOf("Professores")).toBe("Ana, Bruno");
    expect(screen.getByText(/não há como voltar atrás/)).toBeInTheDocument();

    const confirmar = screen.getByRole("button", { name: "Confirmar" });
    expect(confirmar).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /Entendo/ }));
    await userEvent.click(confirmar);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(m.delete.mock.calls[0][0]).toBe("p1");
  });

  it("sem o resumo não deixa marcar a caixa", async () => {
    m.deletionSummary.mockRejectedValue(new Error("Período não encontrado."));
    renderDialog();

    expect(await screen.findByText("Período não encontrado.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Entendo/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });
});
