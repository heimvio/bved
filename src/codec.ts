// Lesen und Schreiben der Festbreiten-Dateien des Standards 3.10.
//
// Regeln aus Abschnitt 2 („Erläuterungen“):
// - Zeichensatz ISO 8859-15, Satzende <CR><LF>
// - A-N linksbündig, N rechtsbündig mit führenden Nullen, negatives Vorzeichen
//   '-' an der ersten Stelle des Feldes
// - nicht belegte Felder (auch numerische) sind Blank — Blank ≠ 0
// - Datumsangaben TTMMJJ, Dezimalstellen implizit laut Feld

import { FIELD_TABLES, FILE_RECORD_TYPES, RECORD_LENGTHS } from './fields.js';
import { decodeLatin9, decodeUtf8Strict, encodeLatin9, hasHighBytes } from './encoding.js';
import { sha256Hex } from './sha256.js';
import { canonicalCode } from './tables.js';
import type { BvedRecord, FieldDef, FieldValue, FileKind, Finding, ParsedBvedFile, RecordType } from './types.js';

export const STANDARD_VERSION = '03.10';
const MIN_VERSION = '03.00';

export class BvedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BvedFormatError';
  }
}

export class BvedWriteError extends Error {
  constructor(
    message: string,
    readonly recordType?: RecordType,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'BvedWriteError';
  }
}

/** '03.10' → 310; ungültig → NaN. */
export function versionNumber(v: string): number {
  const m = /^(\d{2})\.(\d{2})$/.exec(v.trim());
  return m ? Number(m[1]) * 100 + Number(m[2]) : NaN;
}

// --- Dateinamen ------------------------------------------------------------

const KIND_PREFIX: Record<FileKind, string> = {
  DTA: 'DTA310',
  DTM: 'DTM310',
  DTK: 'DTK310',
  DTD: 'DTD310',
  DTE835: 'DTE835',
  DTE898: 'DTE898',
  DTP: 'DTP310',
};

const pad = (n: number, len: number): string => String(n).padStart(len, '0');

/** `DTA310_JJJJMMTThhmmssSSS.DAT` (Ortszeit der Laufzeitumgebung). */
export function bvedFileName(kind: FileKind, at: Date): string {
  const ts =
    pad(at.getFullYear(), 4) +
    pad(at.getMonth() + 1, 2) +
    pad(at.getDate(), 2) +
    pad(at.getHours(), 2) +
    pad(at.getMinutes(), 2) +
    pad(at.getSeconds(), 2) +
    pad(at.getMilliseconds(), 3);
  return `${KIND_PREFIX[kind]}_${ts}.DAT`;
}

const NAME_RE = /^DT(?:(A|M|K|D|P)(\d{3})|(E835|E898))_\d{8,}.*\.DAT$/i;

/** Dateiart und Standardversion aus dem Dateinamen; undefined, wenn er nicht passt. */
export function parseBvedFileName(name: string): { kind: FileKind; version?: string } | undefined {
  const base = name.split(/[\\/]/).pop() ?? name;
  const m = NAME_RE.exec(base);
  if (!m) return undefined;
  if (m[3]) return { kind: `DT${m[3].toUpperCase()}` as FileKind };
  const v = m[2]!;
  return { kind: `DT${m[1]!.toUpperCase()}` as FileKind, version: `${v.slice(0, 1).padStart(2, '0')}.${v.slice(1)}` };
}

export function isBvedFileName(name: string): boolean {
  return parseBvedFileName(name) !== undefined;
}

// --- Datum -----------------------------------------------------------------

function parseDate6(raw: string): string | null {
  if (!/^\d{6}$/.test(raw)) return null;
  const d = Number(raw.slice(0, 2));
  const m = Number(raw.slice(2, 4));
  const yy = Number(raw.slice(4, 6));
  const y = yy <= 79 ? 2000 + yy : 1900 + yy;
  if (m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function formatDate6(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return `${m[3]}${m[2]}${m[1]!.slice(2)}`;
}

// --- Felder ----------------------------------------------------------------

interface FieldCtx {
  file: string;
  line: number;
  type: RecordType;
  fields: Record<string, FieldValue>;
  findings: Finding[];
}

function decimalsOf(def: FieldDef, fields: Record<string, FieldValue>): number {
  if (def.decimalsBy) {
    const v = fields[def.decimalsBy.field];
    return (typeof v === 'string' ? def.decimalsBy.map[v] : undefined) ?? def.decimalsBy.fallback;
  }
  return def.decimals ?? 0;
}

function finding(ctx: FieldCtx, severity: Finding['severity'], code: string, message: string, field?: string): void {
  ctx.findings.push({
    severity,
    code,
    message,
    source: { file: ctx.file, row: ctx.line, ...(field ? { field } : {}) },
  });
}

function label(ctx: FieldCtx, def: FieldDef): string {
  return `${ctx.type}-Satz Feld ${def.no} (${def.key})`;
}

function parseField(def: FieldDef, raw: string, ctx: FieldCtx): FieldValue {
  if (raw.trim() === '') return null;
  const t = raw.trim();
  switch (def.kind) {
    case 'date': {
      const v = parseDate6(t);
      if (v === null) finding(ctx, 'error', 'bved_numeric_invalid', `${label(ctx, def)}: kein gültiges Datum TTMMJJ „${raw}“`, def.key);
      return v;
    }
    case 'period': {
      const a = parseDate6(t.slice(0, 6));
      const b = parseDate6(t.slice(6, 12));
      if (a === null || b === null || t.length !== 12) {
        finding(ctx, 'error', 'bved_numeric_invalid', `${label(ctx, def)}: kein gültiger Zeitraum TTMMJJTTMMJJ „${raw}“`, def.key);
        return null;
      }
      return `${a}/${b}`;
    }
    case 'id': {
      if (!/^\d+$/.test(t)) {
        finding(ctx, 'error', 'bved_numeric_invalid', `${label(ctx, def)}: nicht numerisch „${raw}“`, def.key);
        return null;
      }
      return t;
    }
    case 'code': {
      if (def.form === 'N' && !/^\d+$/.test(t)) {
        finding(ctx, 'error', 'bved_numeric_invalid', `${label(ctx, def)}: nicht numerisch „${raw}“`, def.key);
        return null;
      }
      const c = def.table ? canonicalCode(def.table, t) : undefined;
      if (def.table && c === undefined) {
        finding(ctx, 'warning', 'bved_code_unknown', `${label(ctx, def)}: Schlüssel „${t}“ nicht in Tabelle ${def.table}`, def.key);
      }
      return c ?? t;
    }
    default:
      break;
  }
  if (def.form === 'AN') {
    const v = raw.replace(/ +$/, '');
    if (def.table) {
      const c = canonicalCode(def.table, v.trim());
      if (c === undefined) {
        finding(ctx, 'warning', 'bved_code_unknown', `${label(ctx, def)}: Schlüssel „${v.trim()}“ nicht in Tabelle ${def.table}`, def.key);
      }
    }
    return v;
  }
  // numerisch
  const m = /^(-?)(\d+)$/.exec(t);
  if (!m) {
    finding(ctx, 'error', 'bved_numeric_invalid', `${label(ctx, def)}: nicht numerisch „${raw}“`, def.key);
    return null;
  }
  const dec = decimalsOf(def, ctx.fields);
  const n = Number(m[2]) / 10 ** dec;
  return m[1] === '-' ? -n : n;
}

function formatField(def: FieldDef, value: FieldValue | undefined, type: RecordType, fields: Record<string, FieldValue>): string {
  const err = (msg: string): never => {
    throw new BvedWriteError(`${type}-Satz Feld ${def.no} (${def.key}): ${msg}`, type, def.key);
  };
  const blank = ' '.repeat(def.length);
  if (value === null || value === undefined || value === '') return blank;
  switch (def.kind) {
    case 'date': {
      const s = formatDate6(String(value));
      return s ?? err(`kein ISO-Datum „${value}“`);
    }
    case 'period': {
      const [a, b] = String(value).split('/');
      const sa = a ? formatDate6(a) : null;
      const sb = b ? formatDate6(b) : null;
      return sa && sb ? sa + sb : err(`kein Zeitraum „${value}“ (erwartet yyyy-mm-dd/yyyy-mm-dd)`);
    }
    case 'id':
    case 'code': {
      const s = String(value).trim();
      if (def.form === 'AN') {
        return s.length <= def.length ? s.padEnd(def.length, ' ') : err(`zu lang „${s}“`);
      }
      if (!/^\d+$/.test(s)) err(`nicht numerisch „${s}“`);
      return s.length <= def.length ? s.padStart(def.length, '0') : err(`zu lang „${s}“`);
    }
    default:
      break;
  }
  if (def.form === 'AN') {
    const s = String(value);
    return s.length <= def.length ? s.padEnd(def.length, ' ') : err(`zu lang (${s.length} > ${def.length}) „${s}“`);
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) err(`keine Zahl „${value}“`);
  const dec = decimalsOf(def, fields);
  const scaledF = n * 10 ** dec;
  const scaled = Math.round(scaledF);
  if (Math.abs(scaledF - scaled) > 1e-6 * Math.max(1, Math.abs(scaledF))) err(`mehr als ${dec} Nachkommastellen: ${n}`);
  const neg = scaled < 0;
  const digits = String(Math.abs(scaled));
  const room = neg ? def.length - 1 : def.length;
  if (digits.length > room) err(`Wert ${n} passt nicht in ${def.length} Stellen`);
  return (neg ? '-' : '') + digits.padStart(room, '0');
}

// --- Sätze -----------------------------------------------------------------

function recordTypeOf(line: string): RecordType | undefined {
  if (line.startsWith('E835')) return 'E835';
  if (line.startsWith('E898')) return 'E898';
  const c = line.charAt(0);
  return (['A', 'L', 'M', 'B', 'K', 'D', 'P'] as const).find((t) => t === c);
}

const hasVersion = (t: RecordType): boolean => t !== 'E835' && t !== 'E898';

/** Liest einen einzelnen Satz (ohne CR/LF). */
export function parseBvedRecord(line: string, lineNo: number, file = '', findings: Finding[] = []): BvedRecord | undefined {
  const type = recordTypeOf(line);
  const src = { file, row: lineNo };
  if (!type) {
    findings.push({ severity: 'warning', code: 'bved_unknown_record', message: `Unbekannte Satzart „${line.slice(0, 4)}“ — Zeile übersprungen`, source: src });
    return undefined;
  }
  const expected = RECORD_LENGTHS[type];
  let text = line;
  if (text.length !== expected) {
    findings.push({
      severity: 'warning',
      code: 'bved_line_length',
      message: `${type}-Satz hat ${text.length} statt ${expected} Zeichen`,
      source: src,
    });
    text = text.length < expected ? text.padEnd(expected, ' ') : text.slice(0, expected);
  }
  const defs = FIELD_TABLES[type];
  let version = STANDARD_VERSION;
  if (hasVersion(type)) {
    const raw = text.slice(1, 6);
    const vn = versionNumber(raw);
    if (Number.isNaN(vn)) {
      findings.push({ severity: 'error', code: 'bved_version_unsupported', message: `${type}-Satz: Version „${raw}“ unlesbar, gelesen wie ${STANDARD_VERSION}`, source: { ...src, field: 'version' } });
    } else {
      version = raw;
      if (vn < versionNumber(MIN_VERSION)) {
        findings.push({ severity: 'error', code: 'bved_version_unsupported', message: `${type}-Satz: Version ${raw} älter als ${MIN_VERSION}`, source: { ...src, field: 'version' } });
      } else if (vn > versionNumber(STANDARD_VERSION)) {
        findings.push({ severity: 'warning', code: 'bved_version_unsupported', message: `${type}-Satz: Version ${raw} neuer als ${STANDARD_VERSION}, unbekannte Felder ignoriert`, source: { ...src, field: 'version' } });
      }
    }
  }
  const vnum = versionNumber(version);
  const ctx: FieldCtx = { file, line: lineNo, type, fields: {}, findings };
  for (const def of defs) {
    const raw = text.slice(def.from - 1, def.to);
    if (def.kind === 'recordType' || def.kind === 'version' || def.kind === 'filler') continue;
    if (def.kind === 'end') {
      if (raw !== type) {
        findings.push({ severity: 'warning', code: 'bved_record_end', message: `${type}-Satz: Satzende „${raw}“ statt „${type}“`, source: src });
      }
      continue;
    }
    if (def.since && vnum < versionNumber(def.since)) {
      if (raw.trim() !== '') {
        findings.push({
          severity: 'info',
          code: 'bved_version_field_ignored',
          message: `${type}-Satz Version ${version}: Stelle ${def.from}–${def.to} erst ab ${def.since} als „${def.key}“ belegt — nicht gelesen`,
          source: { ...src, field: def.key },
        });
      }
      continue;
    }
    const value = parseField(def, raw, ctx);
    ctx.fields[def.key] = value;
    if (value === null && def.required && raw.trim() === '') {
      findings.push({ severity: 'error', code: 'bved_required_missing', message: `${label(ctx, def)}: Mussfeld leer`, source: { ...src, field: def.key } });
    }
  }
  checkConditional(type, ctx);
  return { type, version, line: lineNo, fields: ctx.fields };
}

/** Kann-Felder, die unter Bedingungen zu Muss-Feldern werden (Abschnitt 2). */
function checkConditional(type: RecordType, ctx: FieldCtx): void {
  const f = ctx.fields;
  const need = (key: string, why: string): void => {
    if (f[key] === null && key in f) {
      const def = FIELD_TABLES[type].find((d) => d.key === key)!;
      finding(ctx, 'warning', 'bved_required_missing', `${label(ctx, def)}: Mussfeld, weil ${why}`, key);
    }
  };
  if (type === 'L' && f['riskFlag'] === 1) need('riskPct', 'Umlageausfallwagnis = 1');
  if (type === 'M') {
    if (f['heatingShares'] !== null) need('heatingSharesUnit', 'Grundanteile Heizung (Feld 27) gefüllt');
    if (f['hotWaterShares'] !== null) need('hotWaterSharesUnit', 'Grundanteile Warmwasser (Feld 30) gefüllt');
    const a = f['addressFlag'];
    if (a === 1 || a === 3) need('userName1', `Kennzeichen Adressfeld = ${a}`);
    if (a === 2 || a === 3) need('ownerName1', `Kennzeichen Adressfeld = ${a}`);
    if (a === 4) need('recipientName1', 'Kennzeichen Adressfeld = 4');
    if (f['invoiceNoFlag'] === 1) need('invoiceNo', 'Kennzeichen Rechnungsnummer = 1');
  }
  if (type === 'K') {
    const k = f['costKey'];
    if (k === '228' || k === '242') need('costLabel', `Schlüssel Kostenart ${k}`);
    const l = f['taxServiceKey'];
    if (l === '11' || l === '12' || l === '13') need('laborAmount', `Schlüssel steuerliche Leistungsart ${l}`);
  }
  if (type === 'B') {
    const b = f['fuelKey'];
    if (typeof b === 'string' && Number(b) >= 144 && Number(b) <= 148) need('primaryEnergyFactor', `Brennstoff ${b} (Fernwärme)`);
  }
}

/** Schreibt einen Satz (ohne CR/LF). */
export function writeBvedRecord(rec: Pick<BvedRecord, 'type' | 'fields'> & { version?: string }): string {
  const defs = FIELD_TABLES[rec.type];
  if (!defs) throw new BvedWriteError(`Unbekannte Satzart ${String(rec.type)}`);
  const version = rec.version && rec.version.trim() !== '' ? rec.version : STANDARD_VERSION;
  let out = '';
  for (const def of defs) {
    let part: string;
    switch (def.kind) {
      case 'recordType':
        part = rec.type;
        break;
      case 'version':
        if (Number.isNaN(versionNumber(version))) throw new BvedWriteError(`Version „${version}“ ungültig`, rec.type, 'version');
        part = version;
        break;
      case 'filler':
        part = ' '.repeat(def.length);
        break;
      case 'end':
        part = rec.type;
        break;
      default:
        part = formatField(def, rec.fields[def.key], rec.type, rec.fields);
    }
    out += part;
  }
  if (out.length !== RECORD_LENGTHS[rec.type]) {
    throw new BvedWriteError(`${rec.type}-Satz: Länge ${out.length} statt ${RECORD_LENGTHS[rec.type]}`, rec.type);
  }
  return out;
}

// --- Dateien ---------------------------------------------------------------

function kindFromRecords(types: RecordType[]): FileKind | undefined {
  for (const [kind, allowed] of Object.entries(FILE_RECORD_TYPES)) {
    if (types.length > 0 && types.every((t) => allowed.includes(t))) return kind as FileKind;
  }
  return undefined;
}

/**
 * Liest eine Datei des Standards. Tolerant: Versionen 03.00–03.10, unbekannte
 * Restfelder werden ignoriert, UTF-8 statt ISO 8859-15 wird erkannt und als
 * Befund `bved_encoding_utf8` gemeldet. Wirft BvedFormatError nur, wenn weder
 * Dateiname noch Inhalt eine Datei des Standards erkennen lassen.
 */
export function parseBvedFile(name: string, bytes: Uint8Array): ParsedBvedFile {
  const findings: Finding[] = [];
  let encoding: 'iso-8859-15' | 'utf-8' = 'iso-8859-15';
  let text: string;
  const utf8 = hasHighBytes(bytes) ? decodeUtf8Strict(bytes) : null;
  if (utf8 !== null) {
    encoding = 'utf-8';
    text = utf8.charCodeAt(0) === 0xfeff ? utf8.slice(1) : utf8;
    findings.push({
      severity: 'warning',
      code: 'bved_encoding_utf8',
      message: 'Datei ist UTF-8 statt ISO 8859-15 kodiert — trotzdem gelesen',
      source: { file: name },
    });
  } else {
    text = decodeLatin9(bytes);
  }
  if (/[^\r]\n/.test(text.slice(0, 4096)) || /^\n/.test(text)) {
    findings.push({ severity: 'info', code: 'bved_line_ending', message: 'Zeilenende LF statt CR/LF', source: { file: name } });
  }
  const lines = text.split('\n');
  const records: BvedRecord[] = [];
  lines.forEach((l, i) => {
    const line = l.endsWith('\r') ? l.slice(0, -1) : l;
    if (line.replace(/[\x1a\s]/g, '') === '') return;
    const r = parseBvedRecord(line, i + 1, name, findings);
    if (r) records.push(r);
  });
  const fromName = parseBvedFileName(name);
  const types = [...new Set(records.map((r) => r.type))];
  let kind = fromName?.kind;
  if (!kind) {
    kind = kindFromRecords(types);
    if (!kind) throw new BvedFormatError(`${name}: keine Datei des bved-Standards erkennbar`);
    findings.push({ severity: 'info', code: 'bved_file_name', message: `Dateiname entspricht nicht DT?310_JJJJMMTThhmmssSSS.DAT; erkannt als ${kind}`, source: { file: name } });
  }
  const allowed = FILE_RECORD_TYPES[kind]!;
  for (const r of records) {
    if (!allowed.includes(r.type)) {
      findings.push({ severity: 'warning', code: 'bved_record_kind_mismatch', message: `${r.type}-Satz gehört nicht in eine ${kind}-Datei`, source: { file: name, row: r.line } });
    }
  }
  const counts = new Map<string, number>();
  for (const r of records) if (hasVersion(r.type)) counts.set(r.version, (counts.get(r.version) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const standardVersion = top ?? fromName?.version;
  return {
    name,
    kind,
    ...(standardVersion ? { standardVersion } : {}),
    records,
    findings,
    sha256: sha256Hex(bytes),
    encoding,
  };
}

/** Schreibt eine Datei (ISO 8859-15, jeder Satz mit CR/LF abgeschlossen). */
export function writeBvedFile(kind: FileKind, records: BvedRecord[], at: Date = new Date()): { name: string; bytes: Uint8Array } {
  const allowed = FILE_RECORD_TYPES[kind];
  if (!allowed) throw new BvedWriteError(`Unbekannte Dateiart ${String(kind)}`);
  let text = '';
  for (const r of records) {
    if (!allowed.includes(r.type)) throw new BvedWriteError(`${r.type}-Satz gehört nicht in eine ${kind}-Datei`, r.type);
    text += writeBvedRecord(r) + '\r\n';
  }
  return { name: bvedFileName(kind, at), bytes: encodeLatin9(text) };
}
