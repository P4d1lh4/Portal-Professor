interface PageHeaderProps {
  title: string;
  /** Linha curta em mono acima do título (período, área). */
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  /** Abas coladas na borda de baixo da faixa. */
  tabs?: React.ReactNode;
}

// Faixa colada na barra superior: as margens negativas anulam o padding do
// <main> do AppShell (px-5 pt-5) — mudou um, muda o outro.
export function PageHeader({ title, eyebrow, description, actions, tabs }: PageHeaderProps) {
  return (
    <div className="-mx-5 -mt-5 mb-5 border-b bg-card">
      <div className="flex flex-col gap-3 px-5 pb-3 pt-3.5 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="truncate font-mono text-[11.5px] font-semibold uppercase">{eyebrow}</p>
          )}
          <h1 className="mt-0.5 text-xl">{title}</h1>
          {description && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <nav aria-label="Seções" className="-mt-1 flex gap-1 overflow-x-auto px-5">{tabs}</nav>}
    </div>
  );
}
