import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Pagination } from "./Pagination";

const anterior = () => screen.getByRole("button", { name: /anterior/i });
const proxima = () => screen.getByRole("button", { name: /próxima/i });

describe("Pagination", () => {
  it("não aparece quando cabe tudo numa página", () => {
    const { container } = render(
      <Pagination page={0} total={20} pageSize={20} onPageChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a página atual e navega para os dois lados", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={1} total={45} pageSize={20} onPageChange={onPageChange} />);

    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    await user.click(anterior());
    await user.click(proxima());
    expect(onPageChange.mock.calls).toEqual([[0], [2]]);
  });

  it("trava Anterior na primeira página e Próxima na última", () => {
    const { rerender } = render(
      <Pagination page={0} total={45} pageSize={20} onPageChange={vi.fn()} />,
    );
    expect(anterior()).toBeDisabled();
    expect(proxima()).toBeEnabled();

    rerender(<Pagination page={2} total={45} pageSize={20} onPageChange={vi.fn()} />);
    expect(anterior()).toBeEnabled();
    expect(proxima()).toBeDisabled();
  });

  it("trava os dois enquanto a próxima página carrega", () => {
    render(<Pagination page={1} total={45} pageSize={20} onPageChange={vi.fn()} disabled />);
    expect(anterior()).toBeDisabled();
    expect(proxima()).toBeDisabled();
  });
});
