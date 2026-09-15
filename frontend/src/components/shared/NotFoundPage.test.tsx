import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";

import { NotFoundPage } from "./NotFoundPage";

it("rota inexistente explica o que houve e leva ao painel", async () => {
  render(
    <MemoryRouter initialEntries={["/nao-existe"]}>
      <Routes>
        <Route path="/dashboard" element={<p>painel</p>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText("Página não encontrada")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Ir para o painel" }));
  expect(screen.getByText("painel")).toBeInTheDocument();
});
