interface PageHeaderProps {
  title: string;
  /** Linha curta em mono acima do título (período, área). */
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
}

// Faixa colada na barra superior: as margens negativas anulam o padding do
// <main> do AppShell (px-5 pt-5) — mudou um, muda o outro.
export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <div className="-mx-5 -mt-5 mb-5 flex flex-col gap-3 border-b bg-card px-5 pb-3 pt-3.5 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="font-mono text-[11.5px] font-semibold uppercase">{eyebrow}</p>
        )}
        <h1 className="mt-0.5 text-xl">{title}</h1>
        {description && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
