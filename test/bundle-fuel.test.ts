import { describe, expect, it } from 'vitest';
import { bundleFromBved, deriveVatRate, parseBvedFile, writeBvedFile } from '../src/index.js';
import type { BvedRecord, FieldValue } from '../src/index.js';
import { GOLDEN_AT } from './helpers.js';

const base = { customerNo: '4711', providerRef: '1234567890000', billingPeriod: '2025-01-01/2025-12-31' };
const rec = (type: 'B' | 'K', fields: Record<string, FieldValue>): BvedRecord =>
  ({ type, version: '03.10', line: 0, fields: { ...base, ...fields } });

function roundTrip(records: BvedRecord[]) {
  const file = writeBvedFile('DTK', records, GOLDEN_AT);
  return bundleFromBved([parseBvedFile(file.name, file.bytes)]);
}

describe('bundleFromBved — B-Satz vollständig (0.1.0-dev.3)', () => {
  const b = roundTrip([
    rec('B', {
      currency: 'EUR',
      fuelKey: '153',
      calorificValue: 10.08,
      startStockDate: '2025-01-01',
      startStockQty: 2500,
      startStockGross: 2380.5,
      startStockNet: 2000.42,
      endStockDate: '2025-12-31',
      endStockQty: 1800.5,
      endStockGross: 1785,
      endStockNet: 1500,
      hotWaterTemp: 60,
      hotWaterVolume: 123.456,
      hotWaterPct: 18.5,
      fuelSeq: 1,
      meterNo: 'TANK-01',
      meterConsumption: 4100.25,
      meterStart: 1000,
      meterEnd: 5100.25,
      primaryEnergyFactor: 1.1,
    }),
    rec('B', { currency: 'EUR', fuelKey: '194', calorificValue: 3.4, fuelSeq: 2 }),
    rec('K', { costKey: '201', costScope: 'E', invoiceDate: '2025-03-15', quantity: 3400, gross: 3570, net: 3000, taxServiceKey: '00', fuelSeq: 1 }),
    rec('K', { costKey: '203', costScope: 'E', invoiceDate: '2025-12-31', quantity: 12000, gross: 3210, net: 3000, taxServiceKey: '00', fuelSeq: 2 }),
    rec('K', { costKey: '228', costLabel: 'Wartung', costScope: 'E', invoiceDate: '2025-06-01', gross: 500, taxServiceKey: '00', fuelSeq: 0 }),
  ]);

  it('Brennstoff mit Folge, Heizwert, Beständen, Warmwasser und Zähler', () => {
    expect(b.fuels).toEqual([
      {
        fuelKey: '153',
        seq: 1,
        quantity: 3400,
        calorificValue: 10.08,
        startStockDate: '2025-01-01',
        startStock: 2500,
        startStockGross: 2380.5,
        startStockNet: 2000.42,
        endStockDate: '2025-12-31',
        endStock: 1800.5,
        endStockGross: 1785,
        endStockNet: 1500,
        hotWaterTemp: 60,
        hotWaterVolume: 123.456,
        hotWaterPct: 18.5,
        meterNo: 'TANK-01',
        meterStart: 1000,
        meterEnd: 5100.25,
        meterConsumption: 4100.25,
        primaryEnergyFactor: 1.1,
        source: expect.objectContaining({ row: 1 }),
      },
      expect.objectContaining({
        fuelKey: '194',
        seq: 2,
        quantity: null,
        calorificValue: 3.4,
        startStockDate: null,
        startStock: null,
        endStockDate: null,
        hotWaterPct: null,
        meterNo: null,
        meterConsumption: null,
      }),
    ]);
  });

  it('Kosten tragen fuelSeq (0 → null) und den abgeleiteten USt-Satz', () => {
    expect(b.costs.map((c) => [c.costKey, c.fuelSeq, c.fuelKey ?? null, c.vatRate])).toEqual([
      ['201', 1, '153', 19],
      ['203', 2, '194', 7],
      ['228', null, null, null],
    ]);
    expect(b.findings.filter((f) => f.code === 'bved_vat_rate_derived')).toEqual([]);
  });

  it('JSON-tauglich', () => {
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  });
});

describe('deriveVatRate', () => {
  it.each([
    [119, 100, 19],
    [-119, -100, 19],
    [107, 100, 7],
    [100, 100, 0],
    [1260, 1177.57, 7],
    [18450, 15504.2, 19],
    [119.4, 100, 19],
    [100.4, 100, 0],
  ])('brutto %s / netto %s → %s %%', (g, n, r) => {
    expect(deriveVatRate(g, n)).toEqual({ rate: r, derived: false });
  });

  it('ohne netto oder mit netto 0 unbestimmt', () => {
    expect(deriveVatRate(119, null)).toEqual({ rate: null, derived: false });
    expect(deriveVatRate(0, 0)).toEqual({ rate: null, derived: false });
  });

  it('Abweichung: gerechneter Wert, Befund info', () => {
    expect(deriveVatRate(116, 100)).toEqual({ rate: 16, derived: true });
    expect(deriveVatRate(112.34, 100)).toEqual({ rate: 12.3, derived: true });
    const file = writeBvedFile(
      'DTK',
      [rec('K', { costKey: '228', costLabel: 'Wartung', costScope: 'E', invoiceDate: '2025-06-01', gross: 116, net: 100, taxServiceKey: '00', fuelSeq: 0 })],
      GOLDEN_AT,
    );
    const b = bundleFromBved([parseBvedFile(file.name, file.bytes)]);
    expect(b.costs[0]!.vatRate).toBe(16);
    expect(b.findings).toEqual([
      expect.objectContaining({ severity: 'info', code: 'bved_vat_rate_derived', source: expect.objectContaining({ row: 1 }) }),
    ]);
  });
});
