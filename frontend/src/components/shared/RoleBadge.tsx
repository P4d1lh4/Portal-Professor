import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/types";

const ROLE_CONFIG: Record<UserRole, { label: string; className: string }> = {
  admin: {
    label: "Admin",
    className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  },
  coordinator: {
    label: "Coordenador",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  professor: {
    label: "Professor",
    className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
};

export function RoleBadge({ role }: { role: UserRole }) {
  const config = ROLE_CONFIG[role];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
