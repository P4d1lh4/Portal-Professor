import { useCallback, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * Diálogo de confirmação promise-based — substitui window.confirm por um
 * diálogo do design system (temável, acessível, não-bloqueante).
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: "...", destructive: true })) ) return;
 *   ...ação...
 *   // e renderize {confirmDialog} uma vez no componente.
 *
 * ponytail: construído sobre o Dialog já instalado — sem @radix-ui/react-alert-dialog.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  const confirmDialog = (
    <Dialog open={open} onOpenChange={(o) => !o && settle(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{opts?.title}</DialogTitle>
          {opts?.description && (
            <DialogDescription>{opts.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>
            {opts?.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            variant={opts?.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
