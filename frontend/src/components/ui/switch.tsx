import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

// Implementação manual sem dependência de @radix-ui/react-switch
// (não incluído no package.json original — usa input checkbox estilizado)

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-2"
      >
        <div className="relative">
          <input
            id={id}
            type="checkbox"
            ref={ref}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              "h-5 w-9 rounded-full border-2 border-transparent bg-input transition-colors",
              "peer-checked:bg-primary peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
              className
            )}
          />
          <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4" />
        </div>
        {label && <span className="text-sm font-medium">{label}</span>}
      </label>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
// Suppress unused import
void SwitchPrimitive;
