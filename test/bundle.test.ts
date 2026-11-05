import { describe, expect, it } from 'vitest';
import { bundleFromBved, bundleFromCsv, mergeBundles, parseBvedFile, sha256Hex } from '../src/index.js';
import { golden, goldenCsv } from './helpers.js';

function goldenBundle() {
  const files = ['DTM310', 'DTK310'].map((p) => {
    const g = golden(p);
    return parseBvedFile(g.name, g.bytes);
  });
  return bundleFromBved(files);
}

describe('bundleFromBved', () => {
  const b = goldenBundle();

  it('Quelle mit Prüfsumme und Version', () => {
    expect(b.source.kind).toBe('bved');
    expect(b.source.files.map((f) => [f.name.slice(0, 6), f.kind, f.standardVersion])).toEqual([
      ['DTM310', 'bved', '03.10'],
      ['DTK310', 'bved', '03.10'],
    ]);
    expect(b.source.files[0]!.sha256).toBe(sha256Hex(golden('DTM310').bytes));
  });

  it('Liegenschaft aus dem L-Satz', () => {
    expect(b.property).toMatchObject({
      externalRef: 'OBJ-0815',
      street: 'Musterstraße 12',
      postalCode: '12345',
      city: 'Musterstadt',
      country: 'DEU',
      customerNo: '4711',
      propertyNo: '123456789',
      billingPeriod: { start: '2025-01-01', end: '2025-12-31' },
      weg: true,
      vatMode: 'gross',
      riskAllocationPct: null,
      totalArea: null,
      co2: { nonResidential: 0, restriction1: 0, restriction2: 0, heatConnectedSince2023: 0 },
    });
    expect(b.property.source).toEqual({ file: golden('DTM310').name, row: 1 });
  });

  it('Wohnungen mit Fläche und Grundanteilen', () => {
    expect(b.units.map((u) => [u.externalRef, u.bvedUnitNo, u.areaSqm])).toEqual([
      ['0815.0001.01', 1, 65.5],
      ['0815.0002.01', 2, 80.25],
      ['0815.0003.01', 3, 45],
      ['0815.0004.01', 4, 100],
    ]);
    expect(b.units[0]!.shares).toEqual([
      { category: 'heating', unitKey: '010', value: 65.5 },
      { category: 'hot_water', unitKey: '010', value: 65.5 },
    ]);
    expect(b.units[3]!.shares[0]).toEqual({ category: 'heating', unitKey: '011', value: 100 });
  });

  it('Nutzer, Leerstand, Eigentümer (zusammengefasst), Selbstnutzer nur als Eigentümer', () => {
    const occ = b.occupancies.map((o) => [o.unitRef, o.kind, o.names.join(' / '), o.from, o.to, o.persons ?? null, o.externalRef ?? null]);
    expect(occ).toEqual([
      ['0815.0001.01', 'tenant', 'Erika Beispiel', '2025-01-01', null, 2, '0815.0001.01'],
      ['0815.0001.01', 'owner', 'Max Mustermann', '2025-01-01', null, null, null],
      ['0815.0002.01', 'tenant', 'Hans Müller', '2025-01-01', '2025-06-30', 1, '0815.0002.01'],
      ['0815.0002.01', 'owner', 'Anna Groß', '2025-01-01', null, null, null],
      ['0815.0002.01', 'tenant', 'Jörg Šimek', '2025-07-01', null, 3, '0815.0002.02'],
      ['0815.0003.01', 'vacancy', '', '2025-01-01', null, null, '0815.0003.01'],
      ['0815.0003.01', 'owner', 'Anna Groß', '2025-01-01', null, null, null],
      ['0815.0004.01', 'owner', 'Peter Eigen', '2025-01-01', null, 1, '0815.0004.01'],
    ]);
    expect(b.occupancies[0]!.address).toEqual({ street: 'Musterstraße 12', postalCode: '12345', city: 'Musterstadt', country: 'DEU' });
  });

  it('Befund: Wohnung mit Nutzerwechsel und zwei Ordnungsbegriffen', () => {
    expect(b.findings.map((f) => [f.code, f.severity])).toEqual([['bved_unit_ref_ambiguous', 'warning']]);
  });

  it('Brennstoff und Kosten', () => {
    expect(b.fuels).toEqual([
      expect.objectContaining({ fuelKey: '194', seq: 1, quantity: 150000, startStock: null, endStock: null, primaryEnergyFactor: null }),
    ]);
    expect(b.costs.map((c) => [c.costKey, c.gross, c.net, c.laborAmount, c.taxServiceKey, c.fuelKey ?? null, c.scope])).toEqual([
      ['201', 18450, 15504.2, null, '00', '194', 'E'],
      ['201', -119, -100, null, '00', '194', 'E'],
      ['221', 476, 400, 238, '13', '194', 'E'],
      ['225', 95.2, 80, 60, '13', '194', 'E'],
      ['228', 238, 200, null, '00', '194', 'W'],
      ['237', 1260, 1177.57, null, '00', null, 'K'],
    ]);
    expect(b.costs[0]).toMatchObject({ co2Kg: 30150, quantity: 150000, invoiceDate: '2025-12-31' });
    expect(b.costs[4]!.label).toBe('Legionellenprüfung');
    expect(b.costs.map((c) => [c.fuelSeq, c.vatRate])).toEqual([
      [1, 19],
      [1, 19],
      [1, 19],
      [1, 19],
      [1, 19],
      [null, 7],
    ]);
  });

  it('JSON-tauglich (reist als Payload an die Datenbank)', () => {
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  });
});

describe('mergeBundles', () => {
  it('bved + CSV → mixed, Wohnungen über externalRef, Abweichungen als Befund', () => {
    const bved = goldenBundle();
    const { bundle: csv } = bundleFromCsv([goldenCsv('immoware24_Verwaltungseinheiten.csv')]);
    const m = mergeBundles([bved, csv]);
    expect(m.source.kind).toBe('mixed');
    expect(m.source.files).toHaveLength(3);
    // CSV-Einheiten heißen anders (0815.0001) → kommen dazu
    expect(m.units).toHaveLength(8);
    expect(m.property.name).toBe('WEG Musterstraße 12');
    expect(m.findings.some((f) => f.code === 'bundle_property_conflict')).toBe(false);
  });

  it('gleiche Wohnung, andere Fläche → Befund, erster Wert gilt', () => {
    const a = goldenBundle();
    const b = goldenBundle();
    b.units[0]!.areaSqm = 70;
    b.property.city = 'Anderswo';
    const m = mergeBundles([a, b]);
    expect(m.units).toHaveLength(4);
    expect(m.units[0]!.areaSqm).toBe(65.5);
    expect(m.occupancies).toHaveLength(a.occupancies.length);
    expect(m.findings.filter((f) => f.code.startsWith('bundle_')).map((f) => f.code)).toEqual(['bundle_property_conflict', 'bundle_unit_conflict']);
  });
});
