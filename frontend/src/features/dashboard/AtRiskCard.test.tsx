import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AtRiskCard, type AtRiskItem } from "./AtRiskCard";

const item = (n: number, reasons = ["faltas"]): AtRiskItem => ({
  enrollment_id: `e${n}`,
  module_id: "m1",
  module_code: "ANA1",
  full_name: `Aluno ${n}`,
  student_number: String(n),
  absences: 9,
  max_absences: 10,
  final_grade: 4,
  reasons,
});

const renderCard = (items: AtRiskItem[]) =>
  render(
    <MemoryRouter>
      <AtRiskCard items={items} />
    </MemoryRouter>,
  );

describe("AtRiskCard", () => {
  it("lista o aluno com módulo, faltas e motivo, e leva às notas do módulo", () => {
    renderCard([item(1, ["faltas", "nota"])]);

    expect(screen.getByText("Aluno 1")).toBeInTheDocument();
    expect(screen.getByText(/ANA1 · 9\/10 faltas · final 4,0 · risco: faltas e nota/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver notas" })).toHaveAttribute(
      "href",
      "/grades?module=m1",
    );
  });

  it("sem ninguém em risco, diz isso", () => {
    renderCard([]);
    expect(screen.getByText(/Nenhum aluno perto do limite/)).toBeInTheDocument();
  });

  it("mostra 8 e resume o resto", () => {
    renderCard(Array.from({ length: 11 }, (_, i) => item(i)));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText("e mais 3.")).toBeInTheDocument();
  });
});
