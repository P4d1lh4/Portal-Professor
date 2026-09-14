import { describe, it, expect } from "vitest";
import { classifyStatus, type Status } from "./classification";
// Mesma tabela que o backend confere em tests/test_classification_cases.py:
// front e back não conseguem divergir sem quebrar os dois lados (P-06).
import cases from "./classification.cases.json";

describe("classifyStatus", () => {
  it("reprovação por faltas tem prioridade sobre a nota", () => {
    expect(classifyStatus(10, 11, 10)).toBe("rep_faltas");
  });

  it("aprova com final >= 7", () => {
    expect(classifyStatus(7, 0, 10)).toBe("aprovado");
  });

  it("recuperação entre 5 (incl.) e 7 (excl.)", () => {
    expect(classifyStatus(5, 0, 10)).toBe("recuperacao");
    expect(classifyStatus(6.99, 0, 10)).toBe("recuperacao");
  });

  it("reprova abaixo de 5", () => {
    expect(classifyStatus(4.99, 0, 10)).toBe("reprovado");
  });

  it.each(cases)(
    "tabela compartilhada com o backend: final $final, $absences/$max faltas → $status",
    ({ final, absences, max, status }) => {
      expect(classifyStatus(final, absences, max)).toBe(status as Status);
    },
  );
});
