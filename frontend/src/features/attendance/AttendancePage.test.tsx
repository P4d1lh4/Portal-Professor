import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleItem } from "@/features/modules/api";
import type { AttendanceDayDraft } from "./api";

const m = vi.hoisted(() => ({
  listModules: vi.fn(),
  getDay: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  getGrades: vi.fn(),
  downloadAttendance: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { role: "professor" } }) }));
vi.mock("@/features/modules/api", () => ({ modulesApi: { list: m.listModules } }));
vi.mock("@/features/periods/api", () => ({ periodsApi: { list: async () => [] } }));
vi.mock("@/features/grades/api", () => ({ gradesApi: { getByModule: m.getGrades } }));
vi.mock("@/features/exports/api", () => ({
  exportsApi: { downloadModuleAttendance: m.downloadAttendance },
}));
vi.mock("./api", () => ({
  attendanceApi: { getDay: m.getDay, list: m.list, save: m.save, remove: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: m.toast }));

import AttendancePage from "./AttendancePage";

const modulo = (id: string, code: string): ModuleItem => ({
  id,
  name: `Módulo ${code}`,
  code,
  professor_id: "p1",
  academic_period_id: "per1",
  academic_period: { id: "per1", name: "2026.2", is_active: true },
  credits: 4,
  max_absences: 10,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
});

const dia = (moduleId: string, date: string): AttendanceDayDraft => ({
  module_id: moduleId,
  attendance_date: date,
  record_id: null,
  notes: null,
  entries: [
    { enrollment_id: "e1", student_id: "s1", student_number: "2026001", full_name: "Ana Souza", status: "present" },
    { enrollment_id: "e2", student_id: "s2", student_number: "2026002", full_name: "Bruno Lima", status: "present" },
  ],
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/chamada?module=m1&date=2026-09-14"]}>
        <AttendancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const faltaDaAna = () => screen.getByRole("button", { name: "Marcar Ana Souza como falta" });
const campoData = () => screen.getByLabelText("Data da chamada");
const trocarData = (d: string) => fireEvent.change(campoData(), { target: { value: d } });

async function marcarFalta(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Marcar Ana Souza como falta" }));
  expect(faltaDaAna()).toHaveAttribute("aria-pressed", "true");
}

const dialogoDescarte = () =>
  screen.findByRole("dialog", { name: "Descartar a chamada não salva?" });

beforeEach(() => {
  vi.resetAllMocks();
  m.listModules.mockResolvedValue([modulo("m1", "ANA1"), modulo("m2", "FIS1")]);
  m.getDay.mockImplementation(async (moduleId: string, date: string) => dia(moduleId, date));
  m.list.mockResolvedValue([]);
  m.save.mockResolvedValue({});
  m.getGrades.mockResolvedValue([]);
  m.downloadAttendance.mockResolvedValue(undefined);
});

describe("AttendancePage: rascunho não salvo (F-01)", () => {
  it("trocar a data pede confirmação; Cancelar mantém data e rascunho", async () => {
    const user = renderPage();
    await marcarFalta(user);

    trocarData("2026-09-15");
    const dialog = await dialogoDescarte();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(campoData()).toHaveValue("2026-09-14");
    expect(faltaDaAna()).toHaveAttribute("aria-pressed", "true");
    expect(m.getDay).not.toHaveBeenCalledWith("m1", "2026-09-15");
  });

  it("Descartar troca a data e recarrega do servidor", async () => {
    const user = renderPage();
    await marcarFalta(user);

    trocarData("2026-09-15");
    await user.click(within(await dialogoDescarte()).getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(m.getDay).toHaveBeenCalledWith("m1", "2026-09-15"));
    expect(campoData()).toHaveValue("2026-09-15");
    await waitFor(() => expect(faltaDaAna()).toHaveAttribute("aria-pressed", "false"));
  });

  it("sem alteração troca a data direto, sem perguntar", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Marcar Ana Souza como falta" });

    trocarData("2026-09-15");

    await waitFor(() => expect(m.getDay).toHaveBeenCalledWith("m1", "2026-09-15"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("trocar de módulo também pede confirmação", async () => {
    const user = renderPage();
    await marcarFalta(user);

    await user.click(screen.getByRole("button", { name: /FIS1/ }));
    const dialog = await dialogoDescarte();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(m.getDay).not.toHaveBeenCalledWith("m2", expect.anything());
    expect(faltaDaAna()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AttendancePage: salvar", () => {
  it("Salvar fica desabilitado sem alteração e manda o rascunho completo", async () => {
    const user = renderPage();
    await screen.findByRole("button", { name: "Marcar Ana Souza como falta" });
    const salvar = screen.getByRole("button", { name: /Salvar chamada/ });
    expect(salvar).toBeDisabled();

    await marcarFalta(user);
    await user.type(screen.getByLabelText("Observações do dia (opcional)"), "Aula 3");
    await user.click(salvar);

    await waitFor(() =>
      expect(m.save).toHaveBeenCalledWith("m1", "2026-09-14", {
        notes: "Aula 3",
        entries: [
          { enrollment_id: "e1", status: "absent" },
          { enrollment_id: "e2", status: "present" },
        ],
      }),
    );
    expect(m.toast.success).toHaveBeenCalledWith("Chamada salva.");
  });
});

describe("AttendancePage: alunos em risco (P-N1)", () => {
  it("destaca só quem está em risco no módulo", async () => {
    m.getGrades.mockResolvedValue([
      { enrollment_id: "e1", risk: ["faltas"] },
      { enrollment_id: "e2", risk: [] },
    ]);
    renderPage();

    expect(await screen.findByText("Em risco: faltas")).toBeInTheDocument();
    expect(m.getGrades).toHaveBeenCalledWith("m1");
    const linhaDoBruno = screen.getByRole("row", { name: /Bruno Lima/ });
    expect(within(linhaDoBruno).queryByText(/Em risco/)).toBeNull();
  });
});

describe("AttendancePage: exportar (P-Q4)", () => {
  it("Exportar CSV baixa a frequência do módulo ativo", async () => {
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: /Exportar CSV/ }));

    await waitFor(() => expect(m.downloadAttendance).toHaveBeenCalledWith("m1", "ANA1"));
    expect(m.toast.success).toHaveBeenCalledWith("Arquivo CSV gerado.");
  });
});
