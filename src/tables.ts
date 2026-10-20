// Code-Tabellen des Standards (Abschnitt 12, Tabelle U separat, Stand 16.09.2026).
// Quelle sind die JSON-Dateien unter src/tables/; generated.ts wird daraus erzeugt.

import type { CodeTable } from './types.js';
import { TABLE_B, TABLE_E, TABLE_G, TABLE_K, TABLE_L, TABLE_M, TABLE_S, TABLE_T, TABLE_U } from './tables/generated.js';

export const TABLES: {
  B: CodeTable;
  E: CodeTable;
  K: CodeTable;
  L: CodeTable;
  M: CodeTable;
  S: CodeTable;
  U: CodeTable;
  G?: CodeTable;
  T?: CodeTable;
} = { B: TABLE_B, E: TABLE_E, K: TABLE_K, L: TABLE_L, M: TABLE_M, S: TABLE_S, U: TABLE_U, G: TABLE_G, T: TABLE_T };

function table(name: string): CodeTable | undefined {
  return (TABLES as Record<string, CodeTable | undefined>)[name];
}

/**
 * Sucht einen Code in einer Tabelle, auch wenn er in der Datei mit führenden
 * Nullen steht (Tabelle S „11“ in einem dreistelligen Feld „011“).
 * Liefert den Code in Tabellenschreibweise oder undefined.
 */
export function canonicalCode(tableName: string, raw: string): string | undefined {
  const t = table(tableName);
  if (!t) return undefined;
  const exact = t.find((e) => e.code === raw);
  if (exact) return exact.code;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const num = t.find((e) => /^\d+$/.test(e.code) && Number(e.code) === n);
    if (num) return num.code;
  }
  return undefined;
}

export function codeLabel(tableName: string, code: string): string | undefined {
  const c = canonicalCode(tableName, code);
  return c === undefined ? undefined : table(tableName)?.find((e) => e.code === c)?.label;
}
