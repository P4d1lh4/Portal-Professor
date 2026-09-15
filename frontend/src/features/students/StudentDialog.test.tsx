import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StudentDialog } from "./StudentDialog";

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
});
