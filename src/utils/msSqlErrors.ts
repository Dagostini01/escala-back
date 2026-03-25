/** Erros comuns do driver / SQL Server (number). */
export function isUniqueConstraintError(err: unknown): boolean {
  const n = (err as { number?: number })?.number;
  return n === 2627 || n === 2601;
}
