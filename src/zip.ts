// Zip ohne Node-APIs (fflate). Verzeichniseinträge werden beim Entpacken übergangen.

import { unzipSync, zipSync } from 'fflate';

export function zipFiles(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    if (f.name in entries) throw new Error(`Datei doppelt im Zip: ${f.name}`);
    entries[f.name] = f.bytes;
  }
  // feste Zeit, damit dasselbe Ergebnis dieselben Bytes ergibt
  return zipSync(entries, { level: 6, mtime: new Date(2000, 0, 1) });
}

export function unzipFiles(bytes: Uint8Array): { name: string; bytes: Uint8Array }[] {
  const out = unzipSync(bytes);
  return Object.entries(out)
    .filter(([name]) => !name.endsWith('/') && !name.startsWith('__MACOSX/'))
    .map(([name, b]) => ({ name, bytes: b }));
}
