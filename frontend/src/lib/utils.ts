import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciais das duas primeiras palavras: "Ana Beatriz Silva" → "AB". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Nota com uma casa e vírgula decimal: 7.5 → "7,5". */
export function formatGrade(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, i);
  const formatted =
    i === 0 ? value.toFixed(0) : value.toFixed(value >= 10 ? 0 : 1);
  return `${formatted.replace(".", ",")} ${units[i]}`;
}
