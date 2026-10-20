// Gemeinsame Typen der Bibliothek.

export type Severity = 'error' | 'warning' | 'info';

export interface SourceRef {
  file: string;
  /** 1-basierte Zeile in der Datei (bved: Satz, CSV: Datenzeile inkl. Kopf). */
  row?: number;
  /** CSV: Spaltenkopf wie in der Datei. */
  column?: string;
  /** bved: Feldschlüssel aus FIELD_TABLES. */
  field?: string;
}

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  source?: SourceRef;
}

export type CodeTable = { code: string; label: string; extra?: Record<string, string> }[];

// --- Dateistandard 3.10 -----------------------------------------------------

export type RecordType = 'A' | 'L' | 'M' | 'B' | 'K' | 'D' | 'E835' | 'E898' | 'P';
export type FileKind = 'DTA' | 'DTM' | 'DTK' | 'DTD' | 'DTE835' | 'DTE898' | 'DTP';

export type FieldValue = string | number | null;

export interface BvedRecord {
  type: RecordType;
  /** Version aus Feld 2 (z. B. '03.10'); E835/E898 haben kein Versionsfeld → '03.10'. */
  version: string;
  /** 1-basierte Zeile in der Datei; beim Schreiben ohne Bedeutung (0). */
  line: number;
  fields: Record<string, FieldValue>;
}

export interface ParsedBvedFile {
  name: string;
  kind: FileKind;
  standardVersion?: string;
  records: BvedRecord[];
  findings: Finding[];
  /** SHA-256 der gelesenen Bytes (hex) — Erweiterung zum Vertrag, für MasterDataBundle.source. */
  sha256?: string;
  /** Erkannter Zeichensatz (Erweiterung). */
  encoding?: 'iso-8859-15' | 'utf-8';
}

/**
 * Feldbeschreibung, abgeschrieben aus der Spezifikation.
 *
 * `kind` steuert die Darstellung im Feldwert:
 * - ohne `kind`: A-N → string, N → number (mit `decimals` Nachkommastellen, implizit)
 * - `code`: Schlüssel aus einer Tabelle; Wert ist der Tabellencode als string (z. B. '050', '11')
 * - `id`: numerischer Ordnungsbegriff; Wert ist die Ziffernfolge als string (führende Nullen bleiben)
 * - `date`: TTMMJJ ↔ ISO 'yyyy-mm-dd'
 * - `period`: TTMMJJTTMMJJ ↔ 'yyyy-mm-dd/yyyy-mm-dd'
 * - `recordType`, `version`, `end`, `filler`: Strukturfelder, nicht in `fields`
 */
export interface FieldDef {
  no: number;
  key: string;
  length: number;
  from: number;
  to: number;
  form: 'AN' | 'N';
  required: boolean;
  decimals?: number;
  table?: string;
  note?: string;
  kind?: 'recordType' | 'version' | 'end' | 'filler' | 'code' | 'id' | 'date' | 'period';
  /** Nachkommastellen abhängig von einem anderen Feld (K-Satz Emissionsart 01/02). */
  decimalsBy?: { field: string; map: Record<string, number>; fallback: number };
  /** Erste Version, in der das Feld an dieser Stelle steht (für tolerantes Lesen älterer Sätze). */
  since?: string;
}
