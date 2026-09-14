import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useConfirm } from "./ConfirmDialog";

function Harness() {
  const { confirm, confirmDialog } = useConfirm();
  const [result, setResult] = useState("pendente");
  const open = async () =>
    setResult(
      String(
        await confirm({
          title: "Excluir o módulo?",
          description: "Esta ação não pode ser desfeita.",
          confirmLabel: "Excluir",
          destructive: true,
        }),
      ),
    );
  return (
    <>
      <button onClick={open}>abrir</button>
      <output>{result}</output>
      {confirmDialog}
    </>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "abrir" }));
  expect(screen.getByRole("dialog", { name: "Excluir o módulo?" })).toBeInTheDocument();
  return user;
}

async function expectClosedWith(result: string) {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("status")).toHaveTextContent(result);
}

describe("useConfirm", () => {
  it("resolve true ao confirmar", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await expectClosedWith("true");
  });

  it("resolve false ao cancelar", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await expectClosedWith("false");
  });

  it("resolve false ao fechar com Esc", async () => {
    const user = await openDialog();
    await user.keyboard("{Escape}");
    await expectClosedWith("false");
  });
});
