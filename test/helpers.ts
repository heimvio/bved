import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'golden');

export function golden(prefix: string): { name: string; bytes: Uint8Array } {
  const name = readdirSync(GOLDEN).find((f) => f.startsWith(prefix + '_'));
  if (!name) throw new Error(`Golden ${prefix} fehlt`);
  return { name, bytes: new Uint8Array(readFileSync(join(GOLDEN, name))) };
}

export function goldenCsv(name: string): { name: string; bytes: Uint8Array } {
  return { name, bytes: new Uint8Array(readFileSync(join(GOLDEN, 'csv', name))) };
}

/** Golden-Zeitstempel 15.01.2026 10:30:00.000 (Ortszeit). */
export const GOLDEN_AT = new Date(2026, 0, 15, 10, 30, 0, 0);

