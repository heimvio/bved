// CSV lesen: Trennzeichen erkennen, Felder mit Anführungszeichen, deutsche
// Zahlen und Daten tolerant (Muster: heimvio services/routes/import.ts gnum/gdate).

export type Delimiter = ';' | ',' | '\t';

export interface CsvRow {
  /** 1-basierte Zeile in der Datei, in der der Datensatz beginnt. */
  line: number;
  cells: string[];
}

/** Zerlegt CSV-Text (RFC 4180, Anführungszeichen "" als Escape, CRLF/LF). */
export function parseCsvText(text: string, delimiter: Delimiter): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  let i = 0;
  const pushRow = (): void => {
    cells.push(cell);
    rows.push({ line: rowStart, cells });
    cells = [];
    cell = '';
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
      i++;
      continue;
    }
    if (ch === delimiter) {
      cells.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      pushRow();
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      line++;
      rowStart = line;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell !== '' || cells.length > 0) pushRow();
  return rows;
}

/** Wählt das Trennzeichen, das in den ersten Zeilen am häufigsten und am gleichmäßigsten vorkommt. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  let best: Delimiter = ';';
  let bestScore = -1;
  for (const d of [';', '\t', ','] as Delimiter[]) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    const mode = mostCommon(nonZero);
    const consistent = counts.filter((c) => c === mode).length;
    const score = consistent * 1000 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

function mostCommon(xs: number[]): number {
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
}

/** Deutsche und englische Zahlenschreibweise; null, wenn keine Zahl. */
export function gnum(s: string): number | null {
  if (!s) return null;
  let t = String(s).trim().replace(/[^\d.,-]/g, '');
  if (!t || !/\d/.test(t)) return null;
  const lc = t.lastIndexOf(',');
  const ld = t.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) {
    t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lc >= 0) {
    t = t.split(',').length - 1 > 1 ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (ld >= 0 && t.split('.').length - 1 > 1) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** dd.mm.yyyy, d.m.yy, yyyy-mm-dd, dd/mm/yyyy (mit optionaler Uhrzeit) → ISO; null, wenn kein gültiges Datum. */
export function gdate(s: string): string | null {
  const t = s.trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?.*$/, '');
  let y: number, m: number, d: number;
  let mm = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(t);
  if (mm) {
    d = Number(mm[1]);
    m = Number(mm[2]);
    y = Number(mm[3]);
    if (mm[3]!.length === 2) y = y <= 79 ? 2000 + y : 1900 + y;
  } else if ((mm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) {
    y = Number(mm[1]);
    m = Number(mm[2]);
    d = Number(mm[3]);
  } else return null;
  if (m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Spaltenkopf für den Vergleich: klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern. */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/²/g, '2')
    .replace(/[^a-z0-9]/g, '');
}
