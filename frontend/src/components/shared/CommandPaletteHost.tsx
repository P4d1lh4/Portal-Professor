import { lazy, Suspense, useEffect, useState } from "react";

// Importação preguiçosa: o bundle do CommandPalette (cmdk + ícones + Radix Dialog)
// só é baixado depois que o usuário pressiona Ctrl/Cmd+K pela primeira vez.
const CommandPalette = lazy(
  () => import("@/components/shared/CommandPalette"),
);

export function CommandPaletteHost() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setMounted(true);
        setOpen((v) => !v);
      }
    };
    // Clique no botão "Pesquisar…" da Topbar dispara este evento dedicado —
    // mais confiável que simular um KeyboardEvent.
    const openPalette = () => {
      setMounted(true);
      setOpen(true);
    };
    document.addEventListener("keydown", down);
    document.addEventListener("command-palette:open", openPalette);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("command-palette:open", openPalette);
    };
  }, []);

  if (!mounted) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
