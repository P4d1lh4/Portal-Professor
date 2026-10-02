import { useSearchParams } from "react-router-dom";

import { useSelectedPeriod } from "@/features/periods/useSelectedPeriod";
import { useModules } from "./useModules";
import type { ModuleItem } from "./api";

/**
 * Módulos do período da barra superior e o ativo, lido do `?module=` da URL.
 * Módulo de outro período (ou nenhum) cai no primeiro da lista.
 */
export function usePeriodModules() {
  const { periodId, isLoading: periodsLoading } = useSelectedPeriod();
  const query = useModules(periodId, !periodsLoading);
  const [searchParams] = useSearchParams();
  const modules = query.data ?? [];
  const urlModule = searchParams.get("module") ?? "";
  const activeModule = modules.find((m) => m.id === urlModule) ?? modules[0];
  return {
    ...query,
    isLoading: periodsLoading || query.isLoading,
    modules,
    activeModule,
  };
}

/** Eyebrow do cabeçalho: "ANF-101 · CARLA MENEZES". */
export const moduleEyebrow = (m: ModuleItem) =>
  [m.code, m.professor?.full_name].filter(Boolean).join(" · ");
