import { Construction } from "lucide-react";

interface UnderConstructionProps {
  title: string;
  step?: string;
}

export function UnderConstruction({ title, step }: UnderConstructionProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <p className="font-medium text-muted-foreground">
            Funcionalidade em construção
          </p>
          {step && (
            <p className="text-sm text-muted-foreground/70 mt-1">
              Será implementado no {step}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
