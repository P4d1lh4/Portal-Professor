import { create } from "zustand";

import { usePeriods } from "./usePeriods";

// Período escolhido na barra superior; vale para todas as telas.
// ponytail: só em memória — recarregar volta ao primeiro ativo. Persistir quando pedirem.
const usePeriodStore = create<{ periodId: string; setPeriodId: (id: string) => void }>((set) => ({
  periodId: "",
  setPeriodId: (periodId) => set({ periodId }),
}));

export function useSelectedPeriod() {
  const { data: periods = [], isLoading } = usePeriods();
  const { periodId, setPeriodId } = usePeriodStore();
  const period =
    periods.find((p) => p.id === periodId) ??
    periods.find((p) => p.is_active) ??
    periods[0];
  return { periods, period, periodId: period?.id, setPeriodId, isLoading };
}
