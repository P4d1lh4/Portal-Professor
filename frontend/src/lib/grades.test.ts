import { describe, it, expect } from "vitest";
import { recalcFinal } from "./grades";

describe("recalcFinal", () => {
  it("sem recuperação (makeup=0) usa a nota regular", () => {
    expect(recalcFinal(6, 0)).toBe(6);
  });

  it("com recuperação vale o MAIOR entre regular e makeup", () => {
    expect(recalcFinal(4, 7)).toBe(7); // recuperação melhora
    expect(recalcFinal(8, 6)).toBe(8); // makeup>0 mas regular é maior
  });

  it("arredonda para 2 casas", () => {
    expect(recalcFinal(6.789, 0)).toBe(6.79);
  });
});
