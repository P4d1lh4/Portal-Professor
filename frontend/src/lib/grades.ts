// Espelho de backend services/grades.py:recalc_final.
// Se houve recuperação (makeup > 0), vale o maior entre regular e recuperação;
// caso contrário, vale a regular. Arredonda para 2 casas.
export function recalcFinal(regular: number, makeup: number): number {
  const value = makeup > 0 ? Math.max(regular, makeup) : regular;
  return Math.round(value * 100) / 100;
}
