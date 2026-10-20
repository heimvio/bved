// Ausgang: heimvio als Abrechnungsunternehmen liefert A, D, E835 und E898.
//
// OutboundData ist die JSON-Form von api.bved_outbound_data (snake_case, wie
// sie aus der Datenbank kommt). Vorauszahlung und Saldo bleiben Blank — die
// rechnet die Verwaltung (Plan #101 Entscheidung 5).

import { STANDARD_VERSION, writeBvedFile } from './codec.js';
import type { BvedRecord, FieldValue } from './types.js';

export interface OutboundData {
  /** Version der Sätze, Vorgabe '03.10'. */
  standard_version?: string;
  /** Kunden-Nr. der Verwaltung beim Abrechner (bis 10 Ziffern). */
  customer_no: string;
  /** Schlüssel Tabelle U; heimvio hat (noch) keinen → null = Blank. */
  provider_key?: string | null;
  /** 9-stellige Liegenschaftsnummer (app.bved_property_no). */
  property_no: string | number;
  /** ISO-Währungscode, Vorgabe 'EUR'. */
  currency?: string;
  /** Abrechnungszeitraum, ISO yyyy-mm-dd. */
  period_start: string;
  period_end: string;
  users: OutboundUser[];
}

export interface OutboundUser {
  /** Wohnungsnummer des Abrechners 1–9999 (unit.bved_unit_no). */
  bved_unit_no: number;
  /** Ordnungsbegriff des Auftraggebers (bis 20 Zeichen; external_ref des Nutzers bzw. der Wohnung). */
  external_ref: string;
  /** Letzter Tag des Nutzungszeitraumes (ISO). */
  period_end: string;
  /** Name 1 des Nutzers, nur zur Information (wird auf 35 Zeichen gekürzt). */
  name: string | null;
  /** Nutzer-Folge 1–9 innerhalb der Wohnung (E835/E898 Feld 4); Vorgabe: Reihenfolge nach period_end. */
  user_seq?: number | null;
  /** D-Sätze, je Kostenart eine Zeile. */
  lines: OutboundLine[];
  /** E835-Sätze (§ 35a EStG), je Kostenposition und steuerlicher Leistungsart. */
  s35a: OutboundS35a[];
  /** E898-Sätze, je Dokument (und Seite bei Einzelseiten-Dateien). */
  documents: OutboundDocument[];
}

export interface OutboundLine {
  /** Tabelle K (D Feld 17). */
  cost_key: string;
  gross: number | null;
  net: number | null;
  /** Verbrauchsanteile (6,3). */
  consumption: number | null;
  /** Tabelle E. */
  consumption_unit_key: string | null;
  /** Tabelle S. */
  estimate_flag: string | null;
  /** Umlageausfallwagnis brutto (D Feld 14), nur bei L Feld 13 = 1. */
  risk_gross?: number | null;
  co2_allocated_gross?: number | null;
  co2_allocated_net?: number | null;
  co2_not_allocated_gross?: number | null;
  co2_not_allocated_net?: number | null;
  co2_tenant_gross?: number | null;
  co2_tenant_net?: number | null;
}

export interface OutboundS35a {
  /** Tabelle K (E835 Feld 7). */
  cost_key: string;
  /** Freitext für Schlüssel 228/242 (bis 25 Zeichen). */
  cost_label?: string | null;
  /** Tabelle L: '11' | '12' | '13'. */
  tax_service_key: string;
  invoice_gross: number;
  user_share: number;
  /** Prozent (3,2). */
  user_pct: number;
  labor_amount: number;
  user_labor_share: number;
  /** Abrechnungsfolgenummer: null = blank, '1'/'2' bei geteiltem Zeitraum. */
  billing_seq?: '1' | '2' | null;
}

export interface OutboundDocument {
  /** Dateiname im Zip (bis 56 Zeichen), = E898 Feld 7. */
  file_name: string;
  /** HKA, BKA, VDA oder null. */
  kind: 'HKA' | 'BKA' | 'VDA' | null;
  /** 0 = mehrseitige Datei (PDF), sonst Seitenzahl. Vorgabe 0. */
  page?: number;
}

const clip = (s: string, len: number): string => (s.length > len ? s.slice(0, len) : s);

/**
 * Baut die Ausgangsdateien: DTA (Ordnungsbegriffe), DTD (Abrechnungsergebnisse),
 * DTE835 (nur wenn § 35a-Anteile vorliegen), DTE898 (nur wenn Dokumente
 * vorliegen); übergebene Dokumente werden unverändert angehängt.
 */
export function buildOutbound(
  data: OutboundData,
  at: Date = new Date(),
  documents: { name: string; bytes: Uint8Array }[] = [],
): { files: { name: string; bytes: Uint8Array }[] } {
  const version = data.standard_version ?? STANDARD_VERSION;
  const propNo = String(data.property_no).padStart(9, '0');
  if (!/^\d{9}$/.test(propNo)) throw new Error(`property_no „${data.property_no}“ ist keine 9-stellige Nummer`);
  const currency = data.currency ?? 'EUR';
  const providerKey = data.provider_key ?? null;
  const users = [...data.users].sort((a, b) => a.bved_unit_no - b.bved_unit_no || a.period_end.localeCompare(b.period_end));

  const seqInUnit = new Map<number, number>();
  const rec = (type: BvedRecord['type'], fields: Record<string, FieldValue>): BvedRecord => ({ type, version, line: 0, fields });

  const a: BvedRecord[] = [];
  const d: BvedRecord[] = [];
  const e835: BvedRecord[] = [];
  const e898: BvedRecord[] = [];
  const seenA = new Set<string>();
  for (const u of users) {
    if (!Number.isInteger(u.bved_unit_no) || u.bved_unit_no < 1 || u.bved_unit_no > 9999) {
      throw new Error(`bved_unit_no ${u.bved_unit_no} außerhalb 1–9999`);
    }
    const unitNo = String(u.bved_unit_no).padStart(4, '0');
    const providerRef = propNo + unitNo;
    const userSeq = u.user_seq ?? (seqInUnit.get(u.bved_unit_no) ?? 0) + 1;
    seqInUnit.set(u.bved_unit_no, userSeq);
    if (userSeq < 1 || userSeq > 9) throw new Error(`Nutzer-Folge ${userSeq} außerhalb 1–9 (Wohnung ${unitNo})`);
    const refExt = `${propNo}0000${unitNo}${userSeq}`;
    const base = { customerNo: data.customer_no, providerKey, providerRef, clientRef: u.external_ref };
    const aKey = `${providerRef}|${u.external_ref}`;
    if (!seenA.has(aKey)) {
      seenA.add(aKey);
      a.push(rec('A', { ...base }));
    }
    for (const l of u.lines) {
      d.push(
        rec('D', {
          ...base,
          periodEnd: u.period_end,
          totalGross: l.gross,
          totalNet: l.net,
          prepayGross: null,
          prepayNet: null,
          newMonthlyPrepayGross: null,
          newMonthlyPrepayNet: null,
          riskGross: l.risk_gross ?? null,
          balanceGross: null,
          balanceNet: null,
          costKey: l.cost_key,
          consumption: l.consumption,
          consumptionUnitKey: l.consumption_unit_key,
          estimateFlag: l.estimate_flag,
          name1: u.name ? clip(u.name, 35) : null,
          currency,
          co2AllocatedGross: l.co2_allocated_gross ?? null,
          co2AllocatedNet: l.co2_allocated_net ?? null,
          co2NotAllocatedGross: l.co2_not_allocated_gross ?? null,
          co2NotAllocatedNet: l.co2_not_allocated_net ?? null,
          co2TenantGross: l.co2_tenant_gross ?? null,
          co2TenantNet: l.co2_tenant_net ?? null,
        }),
      );
    }
    for (const s of u.s35a) {
      e835.push(
        rec('E835', {
          seqNo: e835.length + 1,
          providerKey,
          providerRefExt: refExt,
          clientRef: u.external_ref,
          billingSeq: s.billing_seq ?? null,
          costKey: s.cost_key,
          costLabel: s.cost_label ? clip(s.cost_label, 25) : null,
          taxServiceKey: s.tax_service_key,
          invoiceGross: s.invoice_gross,
          userShare: s.user_share,
          userPct: s.user_pct,
          laborAmount: s.labor_amount,
          userLaborShare: s.user_labor_share,
          periodEnd: u.period_end,
        }),
      );
    }
    for (const doc of u.documents) {
      if (doc.file_name.length > 56) throw new Error(`Dokumentname länger als 56 Zeichen: ${doc.file_name}`);
      e898.push(
        rec('E898', {
          seqNo: e898.length + 1,
          providerKey,
          providerRefExt: refExt,
          clientRef: u.external_ref,
          billingSeq: null,
          imagePath: doc.file_name,
          pageNo: doc.page ?? 0,
          periodEnd: u.period_end,
          documentKind: doc.kind,
        }),
      );
    }
  }
  const files: { name: string; bytes: Uint8Array }[] = [writeBvedFile('DTA', a, at), writeBvedFile('DTD', d, at)];
  if (e835.length > 0) files.push(writeBvedFile('DTE835', e835, at));
  if (e898.length > 0) files.push(writeBvedFile('DTE898', e898, at));
  files.push(...documents);
  return { files };
}
