import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SelectOptionsStatus } from "./SelectOptionsStatus";

const base = {
  isLoading: false,
  isError: false,
  error: null,
  count: 0,
  onRetry: vi.fn(),
  errorText: "Não foi possível carregar os períodos",
  emptyText: "Nenhum período ativo.",
};

describe("SelectOptionsStatus", () => {
  it("com erro, mostra o motivo e tenta de novo", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectOptionsStatus {...base} isError error={new Error("Network Error")} onRetry={onRetry} />,
    );

    expect(
      screen.getByText(/Não foi possível carregar os períodos: Network Error/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("lista vazia orienta o usuário", () => {
    render(<SelectOptionsStatus {...base} />);
    expect(screen.getByText("Nenhum período ativo.")).toBeInTheDocument();
  });

  it.each([
    ["carregando", { isLoading: true }],
    ["com opções", { count: 3 }],
  ])("%s, não mostra nada", (_, props) => {
    const { container } = render(<SelectOptionsStatus {...base} {...props} />);
    expect(container).toBeEmptyDOMElement();
  });
});
