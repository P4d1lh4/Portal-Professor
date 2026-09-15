import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { StudentItem } from "./api";
import { StudentDialog } from "./StudentDialog";

const ANA: StudentItem = {
  id: "s1",
  student_number: "2026001",
  full_name: "Ana Souza",
  academic_period_id: "per1",
  enrollment_date: "2026-02-01",
  medical_certificates: 3,
  is_active: true,
  created_at: "2026-02-01T00:00:00Z",
};

describe("StudentDialog", () => {
  it("liga o campo inválido à mensagem de erro (aria-describedby)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<StudentDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Adicionar aluno" }));

    const nome = await screen.findByLabelText("Nome completo *");
    expect(nome).toHaveAttribute("aria-invalid", "true");
    expect(nome).toHaveAccessibleDescription("Nome completo é obrigatório");
    expect(screen.getByLabelText("Matrícula *")).toHaveAccessibleDescription(
      "Matrícula é obrigatória",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não edita o contador de atestados: o total vem da lista (alteração 64)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<StudentDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} student={ANA} />);

    expect(screen.queryByLabelText("Certificados médicos")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("medical_certificates");
  });
});
