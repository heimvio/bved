// Zwischenformat Stammdaten: MasterDataBundle — gemeinsames Ziel des bved-
// und des CSV-Lesers; die Datenbank (api.master_data_import) liest nur dieses.

import type { BvedRecord, Finding, FieldValue, ParsedBvedFile, SourceRef } from './types.js';

export type ShareCategory = 'heating' | 'hot_water' | 'cold_water' | 'other';

export interface BundleFile {
  name: string;
  sha256: string;
  kind: 'bved' | 'csv';
  preset?: string;
  standardVersion?: string;
}

export interface BundleProperty {
  externalRef?: string;
  name?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  /** ISO 3166 alpha-3 */
  country?: string;
  customerNo?: string;
  providerKey?: string;
  /** 9 Stellen Liegenschaftsnummer des Abrechners (A/L Feld 5). */
  propertyNo?: string;
  /** ISO yyyy-mm-dd */
  billingPeriod?: { start: string; end: string };
  weg?: boolean;
  vatMode?: 'gross' | 'net' | 'per_user';
  riskAllocationPct?: number | null;
  totalArea?: number | null;
  co2?: Record<string, unknown>;
  source?: SourceRef;
}

export interface BundleUnit {
  /** Ordnungsbegriff des Auftraggebers / VE-Nummer — Pflicht, Schlüssel. */
  externalRef: string;
  label?: string;
  /** 4 Stellen Wohnungsnummer des Abrechners, falls geliefert. */
  bvedUnitNo?: number;
  areaSqm?: number | null;
  /** unitKey: Tabelle E ('' = Einheit nicht angegeben, z. B. M-Satz Feld 33). */
  shares: { category: ShareCategory; unitKey: string; value: number }[];
  source?: SourceRef;
}

export interface BundleOccupancy {
  /** = units[].externalRef */
  unitRef: string;
  externalRef?: string;
  kind: 'tenant' | 'owner' | 'vacancy';
  /** Name 1–4, ohne Anrede */
  names: string[];
  address?: { street?: string; postalCode?: string; city?: string; country?: string };
  /** E-Mail-Adresse des Nutzers (nur CSV; der bved-Standard kennt kein Mailfeld). */
  email?: string;
  /** ISO; to = null: offen */
  from: string;
  to: string | null;
  persons?: number | null;
  source?: SourceRef;
}

export interface BundleFuel {
  /** Tabelle B */
  fuelKey: string;
  quantity?: number | null;
  unitKey?: string;
  startStock?: number | null;
  endStock?: number | null;
  primaryEnergyFactor?: number | null;
  source?: SourceRef;
}

export interface BundleCost {
  /** Tabelle K */
  costKey: string;
  label?: string;
  gross: number;
  net?: number | null;
  vatRate?: number | null;
  laborAmount?: number | null;
  /** Tabelle L */
  taxServiceKey?: string;
  invoiceDate?: string;
  fuelKey?: string;
  quantity?: number | null;
  co2Kg?: number | null;
  /** Erweiterung: K-Satz Feld 8 (E, H, W, K, A, B). */
  scope?: string;
  /** Erweiterung: K-Satz Feld 16. */
  usageGroup?: string;
  source?: SourceRef;
}

export interface MasterDataBundle {
  version: 1;
  source: { kind: 'bved' | 'csv' | 'mixed'; files: BundleFile[] };
  property: BundleProperty;
  units: BundleUnit[];
  occupancies: BundleOccupancy[];
  fuels: BundleFuel[];
  costs: BundleCost[];
  findings: Finding[];
}

export function emptyBundle(kind: MasterDataBundle['source']['kind']): MasterDataBundle {
  return { version: 1, source: { kind, files: [] }, property: {}, units: [], occupancies: [], fuels: [], costs: [], findings: [] };
}

// --- bved → Bundle ---------------------------------------------------------

const str = (v: FieldValue | undefined): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const num = (v: FieldValue | undefined): number | null => (typeof v === 'number' ? v : null);
const stripZeros = (s: string): string => s.replace(/^0+(?=\d)/, '');

function period(v: FieldValue | undefined): { start: string; end: string } | undefined {
  if (typeof v !== 'string') return undefined;
  const [start, end] = v.split('/');
  return start && end ? { start, end } : undefined;
}

/** Einheiten (Tabelle E), deren Grundanteile eine Fläche in m² sind. */
const AREA_KEYS = new Set(['010', '011', '017']);
const PERSON_KEY = '035';

function names(fields: Record<string, FieldValue>, prefix: string): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const n = str(fields[`${prefix}Name${i}`]);
    if (n) out.push(n);
  }
  return out;
}

function address(fields: Record<string, FieldValue>, prefix: string): BundleOccupancy['address'] | undefined {
  const a = {
    street: str(fields[`${prefix}Street`]),
    postalCode: str(fields[`${prefix}PostalCode`]),
    city: str(fields[`${prefix}City`]),
    country: str(fields[`${prefix}Country`]),
  };
  const clean = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) as NonNullable<BundleOccupancy['address']>;
  return Object.keys(clean).length > 0 ? clean : undefined;
}

const sameNames = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((n, i) => n.toLocaleLowerCase('de') === b[i]!.toLocaleLowerCase('de'));

/**
 * Baut das Bundle aus gelesenen DTM/DTK-Dateien (L/M/B/K). Weitere Dateien
 * (DTA, DTD, …) werden nur als Quelle vermerkt.
 *
 * Wohnungen: gruppiert nach der Wohnungsnummer des Abrechners (M Feld 5, Stellen
 * 10–13); ist sie 0000, nach dem Ordnungsbegriff des Auftraggebers (Feld 6).
 * Schlüssel `externalRef` = Feld 6; tragen mehrere Nutzer derselben Wohnung
 * verschiedene Ordnungsbegriffe, gilt der des frühesten Nutzers (Befund).
 */
export function bundleFromBved(files: ParsedBvedFile[]): MasterDataBundle {
  const b = emptyBundle('bved');
  const findings = b.findings;
  for (const f of files) {
    b.source.files.push({
      name: f.name,
      sha256: f.sha256 ?? '',
      kind: 'bved',
      ...(f.standardVersion ? { standardVersion: f.standardVersion } : {}),
    });
    findings.push(...f.findings);
  }
  const all: { rec: BvedRecord; file: string }[] = files.flatMap((f) => f.records.map((rec) => ({ rec, file: f.name })));
  const src = (x: { rec: BvedRecord; file: string }): SourceRef => ({ file: x.file, row: x.rec.line });

  // Liegenschaft
  const ls = all.filter((x) => x.rec.type === 'L');
  const propNos = new Set(
    all
      .filter((x) => ['L', 'M', 'B', 'K'].includes(x.rec.type))
      .map((x) => str(x.rec.fields['providerRef'])?.padStart(13, '0').slice(0, 9))
      .filter((v): v is string => v !== undefined),
  );
  if (propNos.size > 1) {
    findings.push({
      severity: 'error',
      code: 'bved_multiple_properties',
      message: `Die Dateien enthalten mehrere Liegenschaften (${[...propNos].join(', ')}); eine Übernahme gilt genau einer`,
    });
  }
  if (ls.length > 1) {
    findings.push({ severity: 'warning', code: 'bved_multiple_properties', message: `${ls.length} L-Sätze; übernommen wird der erste`, source: src(ls[1]!) });
  }
  const l = ls[0];
  const bRecs = all.filter((x) => x.rec.type === 'B');
  if (l) {
    const lf = l.rec.fields;
    const vm = num(lf['vatMode']);
    const co2Entries: [string, unknown][] = [
      ['nonResidential', num(lf['nonResidential'])],
      ['restriction1', num(lf['co2Restriction1'])],
      ['restriction2', num(lf['co2Restriction2'])],
      ['landlordPct', num(lf['landlordCo2Pct'])],
      ['heatConnectedSince2023', num(lf['heatConnectedSince2023'])],
    ];
    const co2 = Object.fromEntries(co2Entries.filter(([, v]) => v !== null));
    const ref = str(lf['providerRef']);
    b.property = {
      ...(str(lf['objectNo']) ? { externalRef: str(lf['objectNo'])! } : {}),
      ...(str(lf['street']) ? { street: str(lf['street'])! } : {}),
      ...(str(lf['postalCode']) ? { postalCode: str(lf['postalCode'])! } : {}),
      ...(str(lf['city']) ? { city: str(lf['city'])! } : {}),
      ...(str(lf['country']) ? { country: str(lf['country'])! } : {}),
      ...(str(lf['customerNo']) ? { customerNo: stripZeros(str(lf['customerNo'])!) } : {}),
      ...(str(lf['providerKey']) ? { providerKey: str(lf['providerKey'])! } : {}),
      ...(ref ? { propertyNo: ref.padStart(13, '0').slice(0, 9) } : {}),
      ...(period(lf['billingPeriod']) ? { billingPeriod: period(lf['billingPeriod'])! } : {}),
      ...(lf['weg'] !== undefined && lf['weg'] !== null ? { weg: lf['weg'] === 1 } : {}),
      ...(vm === 3 ? { vatMode: 'gross' as const } : vm === 4 ? { vatMode: 'net' as const } : vm === 5 ? { vatMode: 'per_user' as const } : {}),
      riskAllocationPct: num(lf['riskFlag']) === 1 ? num(lf['riskPct']) : null,
      totalArea: num(lf['totalArea'] ?? null),
      ...(Object.keys(co2).length > 0 ? { co2 } : {}),
      source: src(l),
    };
  } else if (bRecs[0]) {
    const bf = bRecs[0].rec.fields;
    const ref = str(bf['providerRef']);
    b.property = {
      ...(str(bf['customerNo']) ? { customerNo: stripZeros(str(bf['customerNo'])!) } : {}),
      ...(ref ? { propertyNo: ref.padStart(13, '0').slice(0, 9) } : {}),
      ...(period(bf['billingPeriod']) ? { billingPeriod: period(bf['billingPeriod'])! } : {}),
      source: src(bRecs[0]),
    };
  }
  if (!b.property.billingPeriod && bRecs[0]) {
    const p = period(bRecs[0].rec.fields['billingPeriod']);
    if (p) b.property.billingPeriod = p;
  }
  const billingEnd = b.property.billingPeriod?.end;

  // Wohnungen und Nutzer
  const ms = all.filter((x) => x.rec.type === 'M');
  const groups = new Map<string, typeof ms>();
  for (const m of ms) {
    const ref = str(m.rec.fields['providerRef'])?.padStart(13, '0');
    const flat = ref ? Number(ref.slice(9)) : 0;
    const cref = str(m.rec.fields['clientRef']);
    if (!cref) continue; // Mussfeld-Befund kommt aus dem Codec
    const key = flat > 0 ? `#${flat}` : `@${cref}`;
    const g = groups.get(key) ?? [];
    g.push(m);
    groups.set(key, g);
  }
  const ownerSeen = new Map<string, BundleOccupancy>();
  for (const [key, g] of groups) {
    g.sort((x, y) => String(period(x.rec.fields['occupancyPeriod'])?.start ?? '').localeCompare(String(period(y.rec.fields['occupancyPeriod'])?.start ?? '')));
    const first = g[0]!;
    const refs = [...new Set(g.map((x) => str(x.rec.fields['clientRef'])!))];
    const unitRef = refs[0]!;
    if (refs.length > 1) {
      findings.push({
        severity: 'warning',
        code: 'bved_unit_ref_ambiguous',
        message: `Wohnung ${key.slice(1)}: mehrere Ordnungsbegriffe (${refs.join(', ')}); Schlüssel der Wohnung ist „${unitRef}“`,
        source: src(first),
      });
    }
    const unit: BundleUnit = { externalRef: unitRef, shares: [], source: src(first) };
    if (key.startsWith('#')) unit.bvedUnitNo = Number(key.slice(1));
    const latest = g[g.length - 1]!.rec.fields;
    const addShare = (category: ShareCategory, unitKey: string, value: number | null): void => {
      if (value === null) return;
      unit.shares.push({ category, unitKey, value });
    };
    const hk = str(latest['heatingSharesUnit']) ?? '';
    addShare('heating', hk, num(latest['heatingShares']));
    addShare('hot_water', str(latest['hotWaterSharesUnit']) ?? '', num(latest['hotWaterShares']));
    addShare('cold_water', '', num(latest['coldWaterShares']));
    for (let i = 1; i <= 3; i++) {
      const k = str(latest[`allocation${i}Key`]);
      if (k && k !== PERSON_KEY) addShare('other', k, num(latest[`allocation${i}Shares`]));
    }
    if (AREA_KEYS.has(hk) && num(latest['heatingShares']) !== null) unit.areaSqm = num(latest['heatingShares']);
    for (const x of g) {
      if (x === g[g.length - 1]) continue;
      const a = num(x.rec.fields['heatingShares']);
      if (a !== null && a !== num(latest['heatingShares'])) {
        findings.push({
          severity: 'info',
          code: 'bved_shares_changed',
          message: `Wohnung ${unitRef}: Grundanteile Heizung ändern sich im Zeitraum; übernommen wird der letzte Wert`,
          source: src(x),
        });
        break;
      }
    }
    b.units.push(unit);

    for (const x of g) {
      const f = x.rec.fields;
      const p = period(f['occupancyPeriod']);
      if (!p) continue;
      const to = billingEnd && p.end === billingEnd ? null : p.end;
      let persons: number | null = null;
      for (let i = 1; i <= 3; i++) if (str(f[`allocation${i}Key`]) === PERSON_KEY) persons = num(f[`allocation${i}Shares`]);
      const user = names(f, 'user');
      const owner = names(f, 'owner');
      const cref = str(f['clientRef'])!;
      if (num(f['vacancyFlag']) === 1) {
        b.occupancies.push({ unitRef, externalRef: cref, kind: 'vacancy', names: user, from: p.start, to, source: src(x) });
      } else if (user.length > 0 && !(owner.length > 0 && sameNames(user, owner))) {
        const addr = address(f, 'user');
        b.occupancies.push({
          unitRef,
          externalRef: cref,
          kind: 'tenant',
          names: user,
          ...(addr ? { address: addr } : {}),
          from: p.start,
          to,
          ...(persons !== null ? { persons } : {}),
          source: src(x),
        });
      } else if (user.length === 0 && owner.length === 0) {
        findings.push({ severity: 'warning', code: 'bved_user_without_name', message: `Nutzer ${cref}: weder Nutzer- noch Eigentümername`, source: src(x) });
      }
      if (owner.length > 0) {
        const ok = `${unitRef}|${owner.join('|').toLocaleLowerCase('de')}`;
        const prev = ownerSeen.get(ok);
        const selfUse = user.length > 0 && sameNames(user, owner);
        if (prev && (prev.to === null || prev.to >= p.start || dayAfter(prev.to) === p.start)) {
          if (prev.to !== null && (to === null || to > prev.to)) prev.to = to;
          if (selfUse && persons !== null) prev.persons = persons;
        } else {
          const addr = address(f, 'owner');
          const occ: BundleOccupancy = {
            unitRef,
            ...(selfUse ? { externalRef: cref } : {}),
            kind: 'owner',
            names: owner,
            ...(addr ? { address: addr } : {}),
            from: p.start,
            to,
            ...(selfUse && persons !== null ? { persons } : {}),
            source: src(x),
          };
          b.occupancies.push(occ);
          ownerSeen.set(ok, occ);
        }
      }
    }
  }

  // Brennstoffe und Kosten
  const ks = all.filter((x) => x.rec.type === 'K');
  const fuelBySeq = new Map<number, string>();
  for (const x of bRecs) {
    const f = x.rec.fields;
    const seq = num(f['fuelSeq']);
    const key = str(f['fuelKey']);
    if (!seq || !key) continue;
    fuelBySeq.set(seq, key);
    const delivered = ks
      .filter((k) => num(k.rec.fields['fuelSeq']) === seq && str(k.rec.fields['costKey']) === '201')
      .map((k) => num(k.rec.fields['quantity']))
      .filter((q): q is number => q !== null);
    b.fuels.push({
      fuelKey: key,
      quantity: delivered.length > 0 ? round(delivered.reduce((a, c) => a + c, 0), 3) : null,
      startStock: num(f['startStockQty']),
      endStock: num(f['endStockQty']),
      primaryEnergyFactor: num(f['primaryEnergyFactor'] ?? null),
      source: src(x),
    });
  }
  for (const x of ks) {
    const f = x.rec.fields;
    const costKey = str(f['costKey']);
    if (!costKey) continue;
    let gross = num(f['gross']);
    const net = num(f['net']);
    if (gross === null) {
      if (net === null) {
        findings.push({ severity: 'warning', code: 'bved_cost_amount_missing', message: `Kostenart ${costKey}: weder Brutto- noch Nettobetrag`, source: src(x) });
      }
      gross = net ?? 0;
    }
    const seq = num(f['fuelSeq']);
    const fuelKey = seq ? fuelBySeq.get(seq) : undefined;
    b.costs.push({
      costKey,
      ...(str(f['costLabel']) ? { label: str(f['costLabel'])! } : {}),
      gross,
      net,
      vatRate: null,
      laborAmount: num(f['laborAmount']),
      ...(str(f['taxServiceKey']) ? { taxServiceKey: str(f['taxServiceKey'])! } : {}),
      ...(str(f['invoiceDate']) ? { invoiceDate: str(f['invoiceDate'])! } : {}),
      ...(fuelKey ? { fuelKey } : {}),
      quantity: num(f['quantity']),
      co2Kg: num(f['co2Kg'] ?? null),
      ...(str(f['costScope']) ? { scope: str(f['costScope'])! } : {}),
      ...(str(f['usageGroup'] ?? null) ? { usageGroup: str(f['usageGroup'])! } : {}),
      source: src(x),
    });
  }
  return b;
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// --- Zusammenführen --------------------------------------------------------

/**
 * Führt mehrere Bundles (z. B. bved + CSV) zusammen: Liegenschaftsfelder —
 * das erste Bundle gewinnt, Abweichungen sind Befunde; Wohnungen über
 * `externalRef`; Nutzer werden dedupliziert (Wohnung, Art, Beginn, Namen).
 */
export function mergeBundles(parts: MasterDataBundle[]): MasterDataBundle {
  const kinds = new Set(parts.map((p) => p.source.kind));
  const out = emptyBundle(kinds.size === 1 ? [...kinds][0]! : 'mixed');
  const units = new Map<string, BundleUnit>();
  const occKeys = new Set<string>();
  for (const p of parts) {
    out.source.files.push(...p.source.files);
    out.findings.push(...p.findings);
    for (const [k, v] of Object.entries(p.property) as [keyof BundleProperty, unknown][]) {
      if (v === undefined) continue;
      const cur = out.property[k];
      if (cur === undefined || cur === null) {
        (out.property as Record<string, unknown>)[k] = v;
      } else if (k !== 'source' && v !== null && JSON.stringify(cur) !== JSON.stringify(v)) {
        out.findings.push({
          severity: 'warning',
          code: 'bundle_property_conflict',
          message: `Liegenschaft ${k}: „${JSON.stringify(cur)}“ und „${JSON.stringify(v)}“ — es gilt der erste Wert`,
          ...(p.property.source ? { source: p.property.source } : {}),
        });
      }
    }
    for (const u of p.units) {
      const cur = units.get(u.externalRef);
      if (!cur) {
        const copy: BundleUnit = { ...u, shares: [...u.shares] };
        units.set(u.externalRef, copy);
        out.units.push(copy);
        continue;
      }
      if (cur.label === undefined && u.label !== undefined) cur.label = u.label;
      if (cur.bvedUnitNo === undefined && u.bvedUnitNo !== undefined) cur.bvedUnitNo = u.bvedUnitNo;
      if ((cur.areaSqm === undefined || cur.areaSqm === null) && u.areaSqm !== undefined) cur.areaSqm = u.areaSqm;
      else if (u.areaSqm !== undefined && u.areaSqm !== null && cur.areaSqm !== u.areaSqm) {
        out.findings.push({
          severity: 'warning',
          code: 'bundle_unit_conflict',
          message: `Wohnung ${u.externalRef}: Fläche ${cur.areaSqm} und ${u.areaSqm} — es gilt der erste Wert`,
          ...(u.source ? { source: u.source } : {}),
        });
      }
      for (const s of u.shares) {
        if (!cur.shares.some((c) => c.category === s.category && c.unitKey === s.unitKey)) cur.shares.push(s);
      }
    }
    for (const o of p.occupancies) {
      const k = `${o.unitRef}|${o.kind}|${o.from}|${o.names.join('|').toLocaleLowerCase('de')}`;
      if (occKeys.has(k)) continue;
      occKeys.add(k);
      out.occupancies.push(o);
    }
    out.fuels.push(...p.fuels);
    out.costs.push(...p.costs);
  }
  return out;
}
