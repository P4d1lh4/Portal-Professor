import { useEffect, useState } from "react";

/**
 * Devolve uma versão atrasada do `value`, atualizada apenas após
 * `delayMs` sem novas mudanças. Útil para inputs de busca que
 * dispararão queries server-side.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
