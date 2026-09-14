import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleItem } from "@/features/modules/api";
import type { StudentItem } from "./api";

const m = vi.hoisted(() => ({
  role: "coordinator",
  getDetail: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  listModules: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { role: m.role } }) }));
vi.mock("./api", () => ({
  studentsApi: { getDetail: m.getDetail, enroll: m.enroll, unenroll: m.unenroll },
}));
vi.mock("@/features/modules/api", () => ({ modulesApi: { list: m.listModules } }));
vi.mock("@/features/reports/useReports", () => ({
  useDownloadStudentReport: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/features/medical-certificates/MedicalCertificatesSheet", () => ({
  MedicalCertificatesSheet: () => null,
}));
vi.mock("sonner", () => ({ toast: m.toast }));

import { StudentDetailSheet } from "./StudentDetailSheet";

const modulo = (id: string, code: string, name: string): ModuleItem => ({
  id,
  name,
  code,
  professor_id: "p1",
  academic_period_id: "per1",
  academic_period: { id: "per1", name: "2026.2", is_active: true },
  credits: 4,
  max_absences: 10,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
});

const aluno = (matriculas: StudentItem["enrolled_modules"] = []): StudentItem => ({
  id: "s1",
  student_number: "2026001",
  full_name: "Ana Souza",
  academic_period_id: "per1",
  enrollment_date: "2026-02-01",
  medical_certificates: 0,
  is_active: true,
  created_at: "2026-02-01T00:00:00Z",
  enrolled_modules: matriculas,
});

const EM_ANATOMIA = {
  module_id: "m1",
  module_name: "Anatomia",
  module_code: "ANA1",
  enrollment_id: "e1",
  enrollment_status: "active",
  final_grade: 8,
  absences: 1,
  max_absences: 10,
};

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <StudentDetailSheet studentId="s1" onClose={vi.fn()} onEdit={vi.fn()} onDeactivate={vi.fn()} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
  m.role = "coordinator";
  m.listModules.mockResolvedValue([
    modulo("m1", "ANA1", "Anatomia"),
    modulo("m2", "FIS1", "Fisiologia"),
  ]);
  m.enroll.mockResolvedValue({});
  m.unenroll.mockResolvedValue({});
});

describe("StudentDetailSheet: matrícula (P-Q1)", () => {
  it("aluno sem matrícula: coordenador matricula num módulo do período", async () => {
    m.getDetail.mockResolvedValue(aluno());
    const user = renderSheet();

    const select = await screen.findByLabelText("Matricular em módulo");
    await user.selectOptions(select, "m2");
    await user.click(screen.getByRole("button", { name: "Matricular" }));

    await waitFor(() => expect(m.enroll).toHaveBeenCalledWith("m2", "s1"));
    expect(m.listModules).toHaveBeenCalledWith("per1");
    expect(m.toast.success).toHaveBeenCalledWith("Aluno matriculado.");
  });

  it("não oferece módulo em que o aluno já está", async () => {
    m.getDetail.mockResolvedValue(aluno([EM_ANATOMIA]));
    renderSheet();

    const select = await screen.findByLabelText("Matricular em módulo");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(2));
    expect(within(select).queryByRole("option", { name: /Anatomia/ })).toBeNull();
    expect(within(select).getByRole("option", { name: /Fisiologia/ })).toBeInTheDocument();
  });

  it("desmatricular pede confirmação e só chama a API ao confirmar", async () => {
    m.getDetail.mockResolvedValue(aluno([EM_ANATOMIA]));
    const user = renderSheet();

    const confirmacao = () =>
      screen.findByRole("dialog", { name: "Desmatricular de Anatomia?" });
    const remover = await screen.findByRole("button", { name: "Desmatricular de Anatomia" });

    await user.click(remover);
    await user.click(within(await confirmacao()).getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Desmatricular de Anatomia?" })).toBeNull(),
    );
    expect(m.unenroll).not.toHaveBeenCalled();

    await user.click(remover);
    await user.click(within(await confirmacao()).getByRole("button", { name: "Desmatricular" }));
    await waitFor(() => expect(m.unenroll).toHaveBeenCalledWith("e1"));
  });

  it("professor não vê matricular nem desmatricular", async () => {
    m.role = "professor";
    m.getDetail.mockResolvedValue(aluno([EM_ANATOMIA]));
    renderSheet();

    await screen.findByText("Anatomia");
    expect(screen.queryByLabelText("Matricular em módulo")).toBeNull();
    expect(screen.queryByRole("button", { name: "Desmatricular de Anatomia" })).toBeNull();
    expect(m.listModules).not.toHaveBeenCalled();
  });
});
