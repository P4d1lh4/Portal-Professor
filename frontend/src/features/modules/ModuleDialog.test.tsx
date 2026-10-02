import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ModuleItem } from "./api";

// Objeto estável: o profile está nas dependências do useEffect que chama reset().
const m = vi.hoisted(() => ({ profile: { role: "professor", id: "p1" } }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: m.profile }) }));
vi.mock("@/lib/axios", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [{ id: "per1", name: "2026.2" }] }) },
}));

import { ModuleDialog } from "./ModuleDialog";

const ANATOMIA: ModuleItem = {
  id: "m1",
  name: "Anatomia",
  code: "ANA101",
  professor_id: "p1",
  academic_period_id: "per1",
  academic_period: { id: "per1", name: "2026.2", is_active: true },
  credits: 4,
  max_absences: 10,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("ModuleDialog", () => {
  it("envia créditos e faltas como número, não como o texto do input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModuleDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} module={ANATOMIA} />
      </QueryClientProvider>,
    );

    await user.clear(screen.getByLabelText("Créditos"));
    await user.type(screen.getByLabelText("Créditos"), "6");
    await user.clear(screen.getByLabelText("Máximo de faltas"));
    await user.type(screen.getByLabelText("Máximo de faltas"), "12");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Anatomia",
      code: "ANA101",
      professor_id: "p1",
      academic_period_id: "per1",
      credits: 6,
      max_absences: 12,
      is_active: true,
    });
  });
});
