// Erzeugt src/tables/generated.ts aus den JSON-Dateien in src/tables/.
// Die JSON-Dateien sind die Quelle (abgeschrieben aus der Spezifikation);
// das TS-Modul existiert, damit die Bibliothek ohne JSON-Import-Attribute
// in Node und im Browser läuft. test/tables.test.ts prüft den Gleichlauf.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'tables');
const names = readdirSync(dir).filter((f) => /^[A-Z]\.json$/.test(f)).sort();
let out = '// GENERIERT von scripts/gen-tables.mjs — nicht von Hand ändern.\n';
out += "import type { CodeTable } from '../types.js';\n\n";
for (const f of names) {
  const rows = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  out += `export const TABLE_${f[0]}: CodeTable = ${JSON.stringify(rows, null, 1)};\n\n`;
}
writeFileSync(join(dir, 'generated.ts'), out);
console.log(`gen-tables: ${names.length} Tabellen`);
