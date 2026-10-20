import { describe, expect, it } from 'vitest';
import { buildOutbound, parseBvedFile, unzipFiles, zipFiles } from '../src/index.js';
import type { OutboundData } from '../src/index.js';
import { GOLDEN_AT, golden } from './helpers.js';

// Dieselben Ergebnisse wie scripts/make-golden.py (RESULTS, make_e835, make_e898)
const co2 = (a: number, b: number, c: number, d: number) => ({ co2_allocated_gross: a, co2_allocated_net: b, co2_not_allocated_gross: c, co2_not_allocated_net: d });
const doc = (ref: string) => [{ file_name: `HKA_${ref}.pdf`, kind: 'HKA' as const, page: 0 }];

const DATA: OutboundData = {
  customer_no: '4711',
  provider_key: null,
  property_no: '123456789',
  currency: 'EUR',
  period_start: '2025-01-01',
  period_end: '2025-12-31',
  users: [
    {
      bved_unit_no: 1, external_ref: '0815.0001.01', period_end: '2025-12-31', name: 'Erika Beispiel',
      lines: [{ cost_key: '231', gross: 4210.37, net: 3538.13, consumption: 1234, consumption_unit_key: '030', estimate_flag: '11', ...co2(210.12, 176.57, 90.05, 75.67) }],
      s35a: [
        { cost_key: '221', tax_service_key: '13', invoice_gross: 476, user_share: 91.44, user_pct: 19.21, labor_amount: 238, user_labor_share: 45.72 },
        { cost_key: '225', tax_service_key: '13', invoice_gross: 95.2, user_share: 18.29, user_pct: 19.21, labor_amount: 60, user_labor_share: 11.53 },
      ],
      documents: doc('0815.0001.01'),
    },
    {
      bved_unit_no: 2, external_ref: '0815.0002.02', period_end: '2025-12-31', name: 'Jörg Šimek',
      lines: [{ cost_key: '231', gross: 2390.85, net: 2009.12, consumption: 812.25, consumption_unit_key: '030', estimate_flag: '6', ...co2(119.3, 100.25, 51.13, 42.97) }],
      s35a: [], documents: doc('0815.0002.02'),
    },
    {
      bved_unit_no: 2, external_ref: '0815.0002.01', period_end: '2025-06-30', name: 'Hans Müller',
      lines: [{ cost_key: '231', gross: 1890.11, net: 1588.33, consumption: 640.5, consumption_unit_key: '030', estimate_flag: '11', ...co2(94.31, 79.25, 40.42, 33.97) }],
      s35a: [], documents: doc('0815.0002.01'),
    },
    {
      bved_unit_no: 3, external_ref: '0815.0003.01', period_end: '2025-12-31', name: 'Leerstand',
      lines: [{ cost_key: '231', gross: 1210, net: 1016.81, consumption: null, consumption_unit_key: null, estimate_flag: '11', ...co2(60.37, 50.73, 25.87, 21.74) }],
      s35a: [], documents: [],
    },
    {
      bved_unit_no: 4, external_ref: '0815.0004.01', period_end: '2025-12-31', name: 'Peter Eigen',
      lines: [
        { cost_key: '231', gross: 5001.47, net: 4202.92, consumption: 1702, consumption_unit_key: '030', estimate_flag: '11', ...co2(249.55, 209.71, 106.95, 89.87) },
        { cost_key: '237', gross: 315, net: 294.39, consumption: 105, consumption_unit_key: '003', estimate_flag: '11' },
      ],
      s35a: [{ cost_key: '221', tax_service_key: '13', invoice_gross: 476, user_share: 139.61, user_pct: 29.33, labor_amount: 238, user_labor_share: 69.81 }],
      documents: doc('0815.0004.01'),
    },
  ],
};

describe('buildOutbound', () => {
  const pdf = { name: 'HKA_0815.0001.01.pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) };
  const { files } = buildOutbound(DATA, GOLDEN_AT, [pdf]);

  it('liefert DTA, DTD, DTE835, DTE898 und reicht Dokumente durch', () => {
    expect(files.map((f) => f.name)).toEqual([
      'DTA310_20260115103000000.DAT',
      'DTD310_20260115103000000.DAT',
      'DTE835_20260115103000000.DAT',
      'DTE898_20260115103000000.DAT',
      'HKA_0815.0001.01.pdf',
    ]);
    expect(files[4]!.bytes).toBe(pdf.bytes);
  });

  it.each([
    ['DTA310', 0],
    ['DTD310', 1],
    ['DTE835', 2],
    ['DTE898', 3],
  ] as const)('%s byte-gleich zur unabhängig erzeugten Golden-Datei', (prefix, i) => {
    expect(Buffer.from(files[i]!.bytes).toString('latin1')).toBe(Buffer.from(golden(prefix).bytes).toString('latin1'));
  });

  it('Vorauszahlung und Saldo bleiben Blank', () => {
    const d = parseBvedFile(files[1]!.name, files[1]!.bytes);
    for (const r of d.records) {
      expect([r.fields['prepayGross'], r.fields['prepayNet'], r.fields['balanceGross'], r.fields['balanceNet']]).toEqual([null, null, null, null]);
    }
  });

  it('ohne § 35a und ohne Dokumente: nur DTA und DTD', () => {
    const r = buildOutbound({ ...DATA, users: DATA.users.map((u) => ({ ...u, s35a: [], documents: [] })) }, GOLDEN_AT);
    expect(r.files.map((f) => f.name.slice(0, 6))).toEqual(['DTA310', 'DTD310']);
  });

  it('prüft Wohnungsnummer und Liegenschaftsnummer', () => {
    expect(() => buildOutbound({ ...DATA, property_no: '1234567890' })).toThrow(/9-stellige/);
    expect(() => buildOutbound({ ...DATA, users: [{ ...DATA.users[0]!, bved_unit_no: 10000 }] })).toThrow(/1–9999/);
  });

  it('kürzt den Namen auf 35 Zeichen', () => {
    const r = buildOutbound({ ...DATA, users: [{ ...DATA.users[0]!, name: 'X'.repeat(50), s35a: [], documents: [] }] }, GOLDEN_AT);
    const d = parseBvedFile(r.files[1]!.name, r.files[1]!.bytes);
    expect(d.records[0]!.fields['name1']).toBe('X'.repeat(35));
  });
});

describe('Zip', () => {
  it('Rundreise', () => {
    const { files } = buildOutbound(DATA, GOLDEN_AT);
    const zip = zipFiles(files);
    const back = unzipFiles(zip);
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    back.forEach((f, i) => expect(Buffer.from(f.bytes).equals(Buffer.from(files[i]!.bytes))).toBe(true));
    // deterministisch
    expect(Buffer.from(zipFiles(files)).equals(Buffer.from(zip))).toBe(true);
  });

  it('doppelte Namen sind ein Fehler', () => {
    const f = { name: 'a', bytes: new Uint8Array([1]) };
    expect(() => zipFiles([f, f])).toThrow(/doppelt/);
  });
});
