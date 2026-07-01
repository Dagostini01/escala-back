export function indexRow(row: Record<string, unknown>): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    m.set(k.toLowerCase(), v);
  }
  return m;
}

export function pickString(m: Map<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = m.get(key.toLowerCase());
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

export function pickInt(m: Map<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = m.get(key.toLowerCase());
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isInteger(n)) return n;
  }
  return null;
}
