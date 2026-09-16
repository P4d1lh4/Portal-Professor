import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleItem } from "@/features/modules/api";
import type { StudentGradeRow } from "./api";

const m = vi.hoisted(() => ({
  listModules: vi.fn(),
  getByModule: vi.fn(),
  update: vi.fn(),
  importCsv: vi.fn(),
  listAttendance: vi.fn(),
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { role: "professor" } }) }));
vi.mock("@/features/modules/api", () => ({ modulesApi: { list: m.listModules } }));
vi.mock("@/features/periods/api", () => ({ periodsApi: { list: async () => [] } }));
vi.mock("@/features/exports/api", () => ({ exportsApi: {} }));
vi.mock("@/features/attendance/api", () => ({ attendanceApi: { list: m.listAttendance } }));
vi.mock("./api", () => ({
  gradesApi: { getByModule: m.getByModule, update: m.update, importCsv: m.importCsv },
}));
vi.mock("sonner", () => ({ toast: m.toast }));

import GradesPage from "./GradesPage";

const modulo = (periodoAtivo = true): ModuleItem => ({
  id: "m1",
  name: "Anatomia",
  code: "ANA1",
  professor_id: "p1",
  academic_period_id: "per1",
  academic_period: { id: "per1", name: "2026.2", is_active: periodoAtivo },
  credits: 4,
  max_absences: 10,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
});

const ANA: StudentGradeRow = {
  enrollment_id: "e1",
  student_id: "s1",
  student_number: "2026001",
  full_name: "Ana Souza",
  enrollment_status: "active",
  tutor_grade: 7,
  regular_exam_grade: 5,
  makeup_exam_grade: 0,
  final_grade: 5,
  absences: 2,
};

const BRUNO: StudentGradeRow = {
  ...ANA,
  enrollment_id: "e2",
  student_id: "s2",
  student_number: "2026002",
  full_name: "Bruno Lima",
  regular_exam_grade: 8,
  final_grade: 8,
  absences: 9,
  risk: ["faltas"],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GradesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function digitarProva(user: ReturnType<typeof userEvent.setup>, valor: string) {
  const input = await screen.findByLabelText("Prova regular de Ana Souza");
  await user.clear(input);
  await user.type(input, valor);
  return input;
}

const linhaDaAna = () => screen.getByRole("row", { name: /Ana Souza/ });
const situacao = (name: RegExp) =>
  within(screen.getByRole("group", { name: "Filtrar por situação" })).getByRole("button", { name });

beforeEach(() => {
  vi.resetAllMocks();
  m.listModules.mockResolvedValue([modulo()]);
  m.getByModule.mockResolvedValue([ANA]);
  m.listAttendance.mockResolvedValue([]);
});

describe("GradesPage", () => {
  it("editar a nota manda o PUT, recalcula a final na hora e mostra o indicador", async () => {
    let responder!: () => void;
    m.update.mockReturnValue(new Promise<void>((r) => (responder = r)));
    const user = renderPage();

    await digitarProva(user, "8");

    await waitFor(() => expect(m.update).toHaveBeenCalledWith("e1", { regular_exam_grade: 8 }));
    // Update otimista: a final (recalcFinal) muda antes da resposta.
    expect(within(linhaDaAna()).getByText("8,0")).toBeInTheDocument();
    expect(within(linhaDaAna()).getByRole("status")).toHaveTextContent("salvando");

    responder();
    await waitFor(() =>
      expect(within(linhaDaAna()).getByRole("status")).toHaveTextContent("salvo"),
    );
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it("PUT falho reverte a célula e avisa o erro", async () => {
    // Falha com atraso, como numa ida ao servidor. Rejeitar no mesmo tick
    // junta o update otimista e o rollback num render só, e o GradeCell não
    // ressincroniza o valor digitado (ver alteração 39).
    m.update.mockImplementation(
      () => new Promise((_, rej) => setTimeout(() => rej(new Error("Período encerrado")), 50)),
    );
    // O refetch do onSettled fica pendente: só o rollback do onError pode
    // devolver o valor antigo.
    m.getByModule.mockResolvedValueOnce([ANA]).mockReturnValue(new Promise(() => {}));
    const user = renderPage();

    const input = await digitarProva(user, "8");

    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith("Período encerrado"));
    await waitFor(() => expect(input).toHaveValue(5));
    expect(within(linhaDaAna()).getByText("5,0")).toBeInTheDocument();
    expect(within(linhaDaAna()).getByRole("status")).not.toHaveTextContent("salvo");
  });

  it("nota fora do intervalo é ajustada para 10 e avisada", async () => {
    m.update.mockResolvedValue({});
    const user = renderPage();

    await digitarProva(user, "15");

    await waitFor(() => expect(m.update).toHaveBeenCalledWith("e1", { regular_exam_grade: 10 }));
    expect(m.toast.warning).toHaveBeenCalled();
  });

  it("sair da célula antes do debounce salva uma vez só", async () => {
    m.update.mockResolvedValue({});
    const user = renderPage();

    await digitarProva(user, "8");
    await user.tab();

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 400)); // passa do debounce de 300 ms
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it("período encerrado deixa as células só leitura", async () => {
    m.listModules.mockResolvedValue([modulo(false)]);
    renderPage();

    expect(await screen.findByLabelText("Prova regular de Ana Souza")).toBeDisabled();
    expect(screen.getByLabelText("Faltas de Ana Souza")).toBeDisabled();
    expect(screen.getByText(/período acadêmico está encerrado/)).toBeInTheDocument();
  });
});

describe("GradesPage: filtro por situação (F-S1)", () => {
  it("mostra só quem está na situação escolhida", async () => {
    m.getByModule.mockResolvedValue([ANA, BRUNO]);
    const user = renderPage();
    await screen.findByText("Bruno Lima");

    await user.click(situacao(/Recuperação/));

    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.queryByText("Bruno Lima")).toBeNull();
    expect(screen.getByText("1 aluno encontrado")).toBeInTheDocument();
  });

  it("Em risco usa o risco do backend", async () => {
    m.getByModule.mockResolvedValue([ANA, BRUNO]);
    const user = renderPage();
    await screen.findByText("Ana Souza");

    await user.click(situacao(/Em risco/));

    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.queryByText("Ana Souza")).toBeNull();
  });
});

describe("GradesPage: frequência real (P-N4)", () => {
  it("mostra as chamadas registradas e as faltas sobre elas", async () => {
    m.listAttendance.mockResolvedValue([{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }]);
    renderPage();

    expect(await screen.findByText(/4 chamadas registradas/)).toBeInTheDocument();
    expect(within(linhaDaAna()).getByText("50% das aulas")).toBeInTheDocument();
    expect(m.listAttendance).toHaveBeenCalledWith("m1");
  });

  it("sem chamada registrada, não mostra percentual", async () => {
    renderPage();

    await screen.findByText("Ana Souza");
    expect(screen.queryByText(/% das aulas/)).toBeNull();
    expect(screen.queryByText(/chamadas? registradas?/)).toBeNull();
  });
});

describe("GradesPage: importar CSV de notas (P-N9)", () => {
  const arquivo = () =>
    new File(["Matrícula;Prova regular\n2026001;8\n"], "notas.csv", { type: "text/csv" });

  it("pede confirmação, envia o arquivo do módulo e resume o resultado", async () => {
    m.importCsv.mockResolvedValue({ updated: 1, not_found: ["9999"], invalid: [] });
    const user = renderPage();
    const csv = arquivo();

    await user.upload(await screen.findByLabelText("Arquivo CSV de notas"), csv);
    await user.click(await screen.findByRole("button", { name: "Importar" }));

    await waitFor(() => expect(m.importCsv).toHaveBeenCalledWith("m1", csv));
    expect(m.toast.success).toHaveBeenCalledWith("1 aluno atualizado.");
    expect(m.toast.warning).toHaveBeenCalledWith("Matrícula 9999 não está neste módulo.");
  });

  it("cancelar a confirmação não envia nada", async () => {
    const user = renderPage();

    await user.upload(await screen.findByLabelText("Arquivo CSV de notas"), arquivo());
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(m.importCsv).not.toHaveBeenCalled();
  });
});
