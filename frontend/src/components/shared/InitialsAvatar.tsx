import { cn, initials } from "@/lib/utils";

/** Círculo com as iniciais; decorativo (o nome sempre aparece ao lado). */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
