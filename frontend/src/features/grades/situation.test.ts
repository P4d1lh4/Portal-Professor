import { describe, expect, it } from "vitest";

import type { StudentGradeRow } from "./api";
import { matchesSituation } from "./situation";

const row = (final: number, absences: number, risk: string[] = []): StudentGradeRow => ({
  enrollment_id: "e1",
  student_id: "s1",
  student_number: "1",
  full_name: "Ana",
  enrollment_status: "active",
  tutor_grade: 0,
  regular_exam_grade: final,
  makeup_exam_grade: 0,
  final_grade: final,
  absences,
  risk,
});

describe("matchesSituation", () => {
  it("sem filtro, todo mundo passa", () => {
    expect(matchesSituation(row(0, 99), 10, "")).toBe(true);
  });

  it("filtra pela regra única de situação", () => {
    expect(matchesSituation(row(8, 0), 10, "aprovado")).toBe(true);
    expect(matchesSituation(row(8, 11), 10, "aprovado")).toBe(false); // faltas vencem
    expect(matchesSituation(row(8, 11), 10, "rep_faltas")).toBe(true);
    expect(matchesSituation(row(6, 0), 10, "recuperacao")).toBe(true);
    expect(matchesSituation(row(3, 0), 10, "reprovado")).toBe(true);
    expect(matchesSituation(row(3, 0), 10, "recuperacao")).toBe(false);
  });

  it("Em risco usa o risco calculado no backend", () => {
    expect(matchesSituation(row(8, 0, ["faltas"]), 10, "risco")).toBe(true);
    expect(matchesSituation(row(3, 0), 10, "risco")).toBe(false);
  });
});
