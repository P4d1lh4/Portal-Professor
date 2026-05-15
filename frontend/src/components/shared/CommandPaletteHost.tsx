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
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!mounted) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
