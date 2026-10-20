// CSV-Leser: erkennt Zeichensatz, Trennzeichen und Preset, schlägt eine
// Spaltenzuordnung vor und baut aus mehreren Dateien ein MasterDataBundle.

import { emptyBundle } from '../bundle.js';
import type { BundleOccupancy, BundleUnit, MasterDataBundle } from '../bundle.js';
import { detectAndDecode } from '../encoding.js';
import type { TextEncodingName } from '../encoding.js';
import { sha256Hex } from '../sha256.js';
import type { Finding, SourceRef } from '../types.js';
import { detectDelimiter, gdate, gnum, normalizeHeader, parseCsvText } from './parse.js';
import type { CsvRow, Delimiter } from './parse.js';
import { CSV_PRESETS } from './presets.js';
import type { CsvMapping, CsvPreset, TargetField } from './presets.js';

export interface CsvFileInfo {
  name: string;
  encoding: TextEncodingName;
  delimiter: Delimiter;
  headers: string[];
  rowCount: number;
  presetCandidates: { preset: string; score: number }[];
  mapping: CsvMapping;
  unmapped: string[];
}

interface Decoded {
  info: CsvFileInfo;
  headerLine: number;
  rows: CsvRow[];
  sha256: string;
}

const PREFIX_SUFFIXES = new Set(['m2', 'qm', 'inm2', 'inqm', 'datum', 'am', 'nr', 'nummer']);

function matchTarget(header: string, preset: CsvPreset, taken: Set<TargetField>): TargetField | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  const entries = Object.entries(preset.synonyms) as [TargetField, string[]][];
  for (const [target, syns] of entries) {
    if (taken.has(target)) continue;
    if (syns.some((s) => normalizeHeader(s) === h)) return target;
  }
  for (const [target, syns] of entries) {
    if (taken.has(target)) continue;
    for (const s of syns) {
      const n = normalizeHeader(s);
      if (n.length >= 5 && h.startsWith(n) && PREFIX_SUFFIXES.has(h.slice(n.length))) return target;
    }
  }
  return null;
}

function mappingFor(headers: string[], preset: CsvPreset): { columns: Record<string, TargetField | null>; matched: number } {
  const taken = new Set<TargetField>();
  const columns: Record<string, TargetField | null> = {};
  let matched = 0;
  for (const h of headers) {
    if (h.trim() === '' || h in columns) continue;
    const t = matchTarget(h, preset, taken);
    columns[h] = t;
    if (t) {
      taken.add(t);
      matched++;
    }
  }
  return { columns, matched };
}

function scorePreset(name: string, headers: string[], preset: CsvPreset): number {
  const nonEmpty = headers.filter((h) => h.trim() !== '');
  if (nonEmpty.length === 0) return 0;
  const { columns, matched } = mappingFor(nonEmpty, preset);
  const targets = new Set(Object.values(columns).filter((t): t is TargetField => t !== null));
  const norm = new Set(nonEmpty.map(normalizeHeader));
  const distinct = (preset.distinctive ?? []).filter((d) => norm.has(normalizeHeader(d))).length;
  let score = (matched + 2 * distinct) / (nonEmpty.length + 2);
  // Pflichtspalten je Rolle
  if (preset.role === 'units' && !targets.has('unit.externalRef')) score *= 0.3;
  if ((preset.role === 'tenants' || preset.role === 'owners') && !(targets.has('unit.externalRef') || targets.has('contact.externalRef'))) score *= 0.3;
  if (preset.role === 'contacts' && targets.has('unit.externalRef')) score *= 0.5;
  if (preset.role === 'contacts' && !targets.has('contact.externalRef')) score *= 0.3;
  const base = normalizeHeader(name.replace(/\.[^.]*$/, ''));
  if ((preset.fileHints ?? []).some((hint) => base.includes(normalizeHeader(hint)))) score += 0.2;
  if (preset.role === 'generic') score *= 0.8;
  return Math.round(Math.min(1, score) * 100) / 100;
}

function looksLikeHeader(cells: string[]): boolean {
  const filled = cells.filter((c) => c.trim() !== '');
  if (filled.length < 2) return false;
  const textual = filled.filter((c) => gnum(c) === null && gdate(c) === null).length;
  return textual / filled.length >= 0.6;
}

function decode(name: string, bytes: Uint8Array): Decoded {
  const { encoding, text } = detectAndDecode(bytes);
  const delimiter = detectDelimiter(text);
  const all = parseCsvText(text, delimiter);
  let hi = all.findIndex((r) => looksLikeHeader(r.cells));
  if (hi < 0) hi = all.findIndex((r) => r.cells.some((c) => c.trim() !== ''));
  const headerRow = hi >= 0 ? all[hi]! : { line: 1, cells: [] };
  const headers = headerRow.cells.map((c) => c.trim());
  const rows = hi >= 0 ? all.slice(hi + 1).filter((r) => r.cells.some((c) => c.trim() !== '')) : [];
  const presetCandidates = CSV_PRESETS.map((p) => ({ preset: p.id, score: scorePreset(name, headers, p) })).sort((a, b) => b.score - a.score);
  const best = CSV_PRESETS.find((p) => p.id === presetCandidates[0]?.preset) ?? CSV_PRESETS[CSV_PRESETS.length - 1]!;
  const { columns } = mappingFor(headers, best);
  const mapping: CsvMapping = { preset: best.id, columns };
  return {
    info: {
      name,
      encoding,
      delimiter,
      headers,
      rowCount: rows.length,
      presetCandidates,
      mapping,
      unmapped: headers.filter((h) => h !== '' && !columns[h]),
    },
    headerLine: headerRow.line,
    rows,
    sha256: sha256Hex(bytes),
  };
}

/** Erkennt Zeichensatz, Trennzeichen, Kopfzeile und Preset; schlägt eine Zuordnung vor. */
export function inspectCsv(name: string, bytes: Uint8Array): CsvFileInfo {
  return decode(name, bytes).info;
}

function roleOf(mapping: CsvMapping): CsvPreset['role'] {
  const p = CSV_PRESETS.find((x) => x.id === mapping.preset);
  if (mapping.role) return mapping.role;
  if (p) return p.role;
  // gespeichertes Org-Preset: Rolle aus den zugeordneten Zielfeldern
  const t = new Set(Object.values(mapping.columns).filter(Boolean));
  if (t.has('contact.externalRef') && !t.has('unit.externalRef')) return 'contacts';
  if (t.has('occupancy.name') || t.has('occupancy.from')) {
    const k = mapping.defaults?.['occupancy.kind'];
    return k && /eigent|owner/i.test(k) ? 'owners' : 'tenants';
  }
  return 'units';
}

function kindFrom(raw: string | undefined, fallback: BundleOccupancy['kind']): BundleOccupancy['kind'] {
  if (!raw) return fallback;
  if (/eigent|owner/i.test(raw)) return 'owner';
  if (/leer|vacan/i.test(raw)) return 'vacancy';
  if (/miet|nutzer|tenant/i.test(raw)) return 'tenant';
  return fallback;
}

function joinStreet(street?: string, no?: string): string | undefined {
  if (!street && !no) return undefined;
  if (street && no && !street.includes(no)) return `${street} ${no}`;
  return street ?? no;
}

interface Contact {
  names: string[];
  address?: BundleOccupancy['address'];
}

/**
 * Baut aus mehreren CSV-Dateien ein Bundle. Reihenfolge der Auswertung:
 * Einheiten → Kontakte → Mieter/Eigentümer; zusammengeführt wird über die
 * Einheiten-Nummer (unit.externalRef) bzw. Kontakt-Nummer.
 */
export function bundleFromCsv(files: { name: string; bytes: Uint8Array; mapping?: CsvMapping }[]): { bundle: MasterDataBundle; files: CsvFileInfo[] } {
  const bundle = emptyBundle('csv');
  const findings = bundle.findings;
  const decoded = files.map((f) => {
    const d = decode(f.name, f.bytes);
    if (f.mapping) {
      const cols: Record<string, TargetField | null> = {};
      for (const h of d.info.headers) if (h !== '') cols[h] = f.mapping.columns[h] ?? null;
      for (const [h, t] of Object.entries(f.mapping.columns)) {
        if (!d.info.headers.includes(h) && t && t !== 'ignore') {
          findings.push({ severity: 'warning', code: 'csv_unmapped_column', message: `Zuordnung nennt Spalte „${h}“, die in der Datei fehlt`, source: { file: f.name, column: h } });
        }
      }
      d.info.mapping = { ...f.mapping, columns: cols };
      d.info.unmapped = d.info.headers.filter((h) => h !== '' && !cols[h]);
    }
    return { ...d, role: roleOf(d.info.mapping) };
  });

  for (const d of decoded) {
    bundle.source.files.push({ name: d.info.name, sha256: d.sha256, kind: 'csv', ...(d.info.mapping.preset ? { preset: d.info.mapping.preset } : {}) });
    if (d.info.headers.length === 0) {
      findings.push({ severity: 'error', code: 'csv_required_missing', message: 'Datei ohne Kopfzeile', source: { file: d.info.name } });
    }
    for (const h of d.info.unmapped) {
      findings.push({ severity: 'info', code: 'csv_unmapped_column', message: `Spalte „${h}“ wird nicht übernommen`, source: { file: d.info.name, row: d.headerLine, column: h } });
    }
  }

  const units = new Map<string, BundleUnit>();
  const unitSeenIn = new Map<string, SourceRef>();
  const contacts = new Map<string, Contact>();
  const propertyRefs = new Map<string, SourceRef>();
  const hasUnitFile = decoded.some((d) => d.role === 'units');

  type Getter = (t: TargetField) => string | undefined;
  const rowsOf = (d: (typeof decoded)[number]): { row: CsvRow; get: Getter; col: (t: TargetField) => string | undefined }[] => {
    const idx = new Map<TargetField, number>();
    d.info.headers.forEach((h, i) => {
      const t = d.info.mapping.columns[h];
      if (t && t !== 'ignore' && !idx.has(t)) idx.set(t, i);
    });
    const col = (t: TargetField): string | undefined => {
      const i = idx.get(t);
      return i === undefined ? undefined : d.info.headers[i];
    };
    const out = [];
    for (const row of d.rows) {
      const get: Getter = (t) => {
        const i = idx.get(t);
        const v = i === undefined ? undefined : row.cells[i]?.trim();
        return v !== undefined && v !== '' ? v : d.info.mapping.defaults?.[t]?.trim() || undefined;
      };
      const filter = d.info.mapping.filter;
      if (filter && Object.entries(filter).some(([t, want]) => want !== undefined && get(t as TargetField) !== want)) continue;
      out.push({ row, get, col });
    }
    return out;
  };

  const src = (file: string, row: number, column?: string): SourceRef => ({ file, row, ...(column ? { column } : {}) });
  const err = (severity: Finding['severity'], code: string, message: string, source: SourceRef): void => {
    findings.push({ severity, code, message, source });
  };

  const takeProperty = (get: Getter, s: SourceRef): void => {
    const ref = get('property.externalRef');
    if (ref && !propertyRefs.has(ref)) propertyRefs.set(ref, s);
    const p = bundle.property;
    if (ref && p.externalRef === undefined) p.externalRef = ref;
    const name = get('property.name');
    if (name && p.name === undefined) p.name = name;
    const street = joinStreet(get('property.street'), get('property.houseNumber'));
    if (street && p.street === undefined) p.street = street;
    const plz = get('property.postalCode');
    if (plz && p.postalCode === undefined) p.postalCode = plz;
    const city = get('property.city');
    if (city && p.city === undefined) p.city = city;
    if (p.source === undefined && (ref || name || street)) p.source = s;
  };

  const ensureUnit = (ref: string, s: SourceRef, label?: string): BundleUnit => {
    let u = units.get(ref);
    if (!u) {
      u = { externalRef: ref, shares: [], source: s, ...(label ? { label } : {}) };
      units.set(ref, u);
      bundle.units.push(u);
    }
    return u;
  };

  // 1. Einheiten
  for (const d of decoded.filter((x) => x.role === 'units')) {
    const unitCol = d.info.headers.find((h) => d.info.mapping.columns[h] === 'unit.externalRef');
    if (!unitCol && !d.info.mapping.defaults?.['unit.externalRef']) {
      err('error', 'csv_required_missing', 'Keine Spalte für die Einheiten-Nummer zugeordnet', { file: d.info.name, row: d.headerLine });
      continue;
    }
    for (const { row, get, col } of rowsOf(d)) {
      const s = src(d.info.name, row.line);
      takeProperty(get, s);
      const ref = get('unit.externalRef');
      if (!ref) {
        err('error', 'csv_required_missing', 'Einheiten-Nummer fehlt', src(d.info.name, row.line, col('unit.externalRef')));
        continue;
      }
      const label = get('unit.label');
      const areaRaw = get('unit.areaSqm');
      let area: number | null | undefined;
      if (areaRaw !== undefined) {
        area = gnum(areaRaw);
        if (area === null) err('error', 'csv_number_invalid', `Fläche „${areaRaw}“ ist keine Zahl`, src(d.info.name, row.line, col('unit.areaSqm')));
      }
      if (units.has(ref)) {
        const prev = unitSeenIn.get(ref);
        err('warning', 'csv_duplicate_unit', `Einheit „${ref}“ kommt mehrfach vor${prev ? ` (zuerst ${prev.file} Zeile ${prev.row})` : ''}; es gilt die erste Zeile`, s);
        continue;
      }
      const u = ensureUnit(ref, s, label);
      unitSeenIn.set(ref, s);
      if (area !== undefined) {
        u.areaSqm = area;
      }
    }
  }

  // 2. Kontakte
  for (const d of decoded.filter((x) => x.role === 'contacts')) {
    for (const { row, get, col } of rowsOf(d)) {
      const ref = get('contact.externalRef');
      if (!ref) {
        err('warning', 'csv_required_missing', 'Kontakt-Nummer fehlt — Zeile übersprungen', src(d.info.name, row.line, col('contact.externalRef')));
        continue;
      }
      const name = [get('occupancy.firstName'), get('occupancy.name')].filter(Boolean).join(' ');
      const names = [name, get('occupancy.name2') ?? ''].filter((n) => n !== '');
      const street = joinStreet(get('occupancy.street'), get('occupancy.houseNumber'));
      const address = Object.fromEntries(
        Object.entries({ street, postalCode: get('occupancy.postalCode'), city: get('occupancy.city') }).filter(([, v]) => v !== undefined),
      ) as NonNullable<BundleOccupancy['address']>;
      contacts.set(ref, { names, ...(Object.keys(address).length > 0 ? { address } : {}) });
    }
  }

  // 3. Mieter, Eigentümer, allgemeine Tabellen
  const implicitUnits = new Set<string>();
  for (const d of decoded.filter((x) => x.role === 'tenants' || x.role === 'owners' || x.role === 'generic')) {
    const fallback: BundleOccupancy['kind'] = d.role === 'owners' ? 'owner' : 'tenant';
    const mapped = new Set(Object.values(d.info.mapping.columns));
    const occupancyFile = mapped.has('occupancy.name') || mapped.has('occupancy.from') || mapped.has('contact.externalRef') || d.role !== 'generic';
    if (!mapped.has('unit.externalRef') && !d.info.mapping.defaults?.['unit.externalRef']) {
      err('error', 'csv_required_missing', 'Keine Spalte für die Einheiten-Nummer zugeordnet', { file: d.info.name, row: d.headerLine });
      continue;
    }
    for (const { row, get, col } of rowsOf(d)) {
      const s = src(d.info.name, row.line);
      takeProperty(get, s);
      const unitRef = get('unit.externalRef');
      if (!unitRef) {
        err('error', 'csv_required_missing', 'Einheiten-Nummer fehlt', src(d.info.name, row.line, col('unit.externalRef')));
        continue;
      }
      // Einheitenspalten in einer allgemeinen Tabelle
      if (d.role === 'generic' && !units.has(unitRef) && !hasUnitFile) {
        const u = ensureUnit(unitRef, s, get('unit.label'));
        const areaRaw = get('unit.areaSqm');
        if (areaRaw !== undefined) {
          const area = gnum(areaRaw);
          if (area === null) err('error', 'csv_number_invalid', `Fläche „${areaRaw}“ ist keine Zahl`, src(d.info.name, row.line, col('unit.areaSqm')));
          else u.areaSqm = area;
        }
      }
      if (!occupancyFile) continue;
      const contactRef = get('contact.externalRef');
      const contact = contactRef ? contacts.get(contactRef) : undefined;
      if (contactRef && !contact && decoded.some((x) => x.role === 'contacts')) {
        err('warning', 'csv_contact_unknown', `Kontakt „${contactRef}“ nicht in der Kontaktliste`, src(d.info.name, row.line, col('contact.externalRef')));
      }
      const baseName = [get('occupancy.firstName'), get('occupancy.name')].filter(Boolean).join(' ');
      let names = [baseName, get('occupancy.name2') ?? ''].filter((n) => n !== '');
      if (names.length === 0 && contact) names = contact.names;
      let kind = kindFrom(get('occupancy.kind'), fallback);
      if (names.length === 1 && /^leerstand$|^leer$|^\(leer\)$/i.test(names[0]!)) {
        kind = 'vacancy';
        names = [];
      }
      if (names.length === 0 && kind !== 'vacancy') {
        if (d.role === 'generic' && !get('occupancy.from')) continue; // reine Einheitenzeile
        err('error', 'csv_required_missing', 'Name fehlt', src(d.info.name, row.line, col('occupancy.name')));
        continue;
      }
      const fromRaw = get('occupancy.from');
      if (!fromRaw) {
        err('error', 'csv_required_missing', 'Beginn (Einzug/Mietbeginn) fehlt', src(d.info.name, row.line, col('occupancy.from')));
        continue;
      }
      const from = gdate(fromRaw);
      if (!from) {
        err('error', 'csv_date_invalid', `Beginn „${fromRaw}“ ist kein Datum`, src(d.info.name, row.line, col('occupancy.from')));
        continue;
      }
      const toRaw = get('occupancy.to');
      let to: string | null = null;
      if (toRaw) {
        to = gdate(toRaw);
        if (!to) err('error', 'csv_date_invalid', `Ende „${toRaw}“ ist kein Datum`, src(d.info.name, row.line, col('occupancy.to')));
        else if (to < from) err('error', 'csv_date_invalid', `Ende ${to} liegt vor Beginn ${from}`, src(d.info.name, row.line, col('occupancy.to')));
      }
      let persons: number | null | undefined;
      const pRaw = get('occupancy.persons');
      if (pRaw !== undefined) {
        persons = gnum(pRaw);
        if (persons === null) err('warning', 'csv_number_invalid', `Personen „${pRaw}“ ist keine Zahl`, src(d.info.name, row.line, col('occupancy.persons')));
      }
      if (!units.has(unitRef)) {
        if (hasUnitFile) {
          err('error', 'csv_unit_unknown', `Einheit „${unitRef}“ steht in keiner Einheitenliste`, src(d.info.name, row.line, col('unit.externalRef')));
          continue;
        }
        ensureUnit(unitRef, s, get('unit.label'));
        if (!implicitUnits.has(unitRef)) {
          implicitUnits.add(unitRef);
          err('warning', 'csv_unit_unknown', `Einheit „${unitRef}“ nur aus ${d.info.name} bekannt (keine Einheitenliste) — Fläche fehlt`, src(d.info.name, row.line, col('unit.externalRef')));
        }
      }
      const street = joinStreet(get('occupancy.street'), get('occupancy.houseNumber'));
      const ownAddr = Object.fromEntries(
        Object.entries({ street, postalCode: get('occupancy.postalCode'), city: get('occupancy.city') }).filter(([, v]) => v !== undefined),
      ) as NonNullable<BundleOccupancy['address']>;
      const address = Object.keys(ownAddr).length > 0 ? ownAddr : contact?.address;
      const extRef = get('occupancy.externalRef');
      bundle.occupancies.push({
        unitRef,
        ...(extRef ? { externalRef: extRef } : {}),
        kind,
        names,
        ...(address ? { address } : {}),
        from,
        to,
        ...(persons !== undefined ? { persons } : {}),
        source: s,
      });
    }
  }

  if (propertyRefs.size > 1) {
    findings.push({
      severity: 'error',
      code: 'csv_multiple_properties',
      message: `Die Dateien enthalten mehrere Objekte (${[...propertyRefs.keys()].join(', ')}); bitte ein Objekt auswählen`,
    });
  }
  return { bundle, files: decoded.map((d) => d.info) };
}
