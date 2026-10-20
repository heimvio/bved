import { describe, expect, it } from 'vitest';
import { CSV_PRESETS, bundleFromCsv, encodeLatin9, gdate, gnum, inspectCsv } from '../src/index.js';
import type { CsvMapping } from '../src/index.js';
import { encodeUtf8 } from '../src/encoding.js';
import { detectDelimiter, parseCsvText } from '../src/csv/parse.js';
import { goldenCsv } from './helpers.js';

const VE = 'immoware24_Verwaltungseinheiten.csv';
const MIETER = 'immoware24_Mieter.csv';
const EIG = 'immoware24_Eigentuemer.csv';
const KONT = 'immoware24_Kontakte.csv';
const ALL = [VE, MIETER, EIG, KONT].map(goldenCsv);

describe('Zahlen und Daten', () => {
  it.each([
    ['65,50', 65.5],
    ['1.000,00', 1000],
    ['1,234.56', 1234.56],
    ['1.234.567', 1234567],
    ['56.00', 56],
    ['-12,5 m²', -12.5],
    ['', null],
    ['abc', null],
  ])('gnum(%s) = %s', (s, n) => expect(gnum(s)).toBe(n));

  it.each([
    ['01.03.2019', '2019-03-01'],
    ['1.7.2018', '2018-07-01'],
    ['31.12.25', '2025-12-31'],
    ['2025-06-30', '2025-06-30'],
    ['30.06.2025 00:00', '2025-06-30'],
    ['31.02.2025', null],
    ['2025', null],
  ])('gdate(%s) = %s', (s, d) => expect(gdate(s)).toBe(d));
});

describe('CSV zerlegen', () => {
  it('Anführungszeichen, Trennzeichen im Feld, Zeilenumbruch im Feld', () => {
    const rows = parseCsvText('a;"b;c";"d ""x"""\r\n1;"zwei\nZeilen";3\n', ';');
    expect(rows).toEqual([
      { line: 1, cells: ['a', 'b;c', 'd "x"'] },
      { line: 2, cells: ['1', 'zwei\nZeilen', '3'] },
    ]);
  });

  it('Trennzeichen erkennen', () => {
    expect(detectDelimiter('a;b;c\n1;2,5;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc\n1\t2,5\t3')).toBe('\t');
  });
});

describe('inspectCsv (Golden, geraten nach immoware24-Handbuch)', () => {
  it.each([
    [VE, 'utf-8-bom', ';', 'immoware24-ve', 4],
    [MIETER, 'windows-1252', ';', 'immoware24-mieter', 4],
    [EIG, 'iso-8859-1', ',', 'immoware24-eigentuemer', 4],
    [KONT, 'utf-8', '\t', 'immoware24-kontakte', 6],
  ])('%s → %s, %j, %s', (name, enc, delim, preset, rows) => {
    const info = inspectCsv(name, goldenCsv(name).bytes);
    expect(info.encoding).toBe(enc);
    expect(info.delimiter).toBe(delim);
    expect(info.presetCandidates[0]!.preset).toBe(preset);
    expect(info.mapping.preset).toBe(preset);
    expect(info.rowCount).toBe(rows);
  });

  it('Zuordnung VE-Datei', () => {
    const info = inspectCsv(VE, goldenCsv(VE).bytes);
    expect(info.mapping.columns).toEqual({
      Objekt: 'property.externalRef',
      Objektbezeichnung: 'property.name',
      'VE-Nr.': 'unit.externalRef',
      'VE-Bezeichnung': 'unit.label',
      'Art der VE': null,
      Straße: 'property.street',
      Hausnummer: 'property.houseNumber',
      PLZ: 'property.postalCode',
      Ort: 'property.city',
      'Wohnfläche (m²)': 'unit.areaSqm',
      Zimmer: null,
      Etage: null,
    });
    expect(info.unmapped).toEqual(['Art der VE', 'Zimmer', 'Etage']);
  });

  it('Zuordnung Mieter-Datei', () => {
    const info = inspectCsv(MIETER, goldenCsv(MIETER).bytes);
    expect(info.headers).toEqual(['Objekt', 'VE-Nr.', 'Mieter-Nr.', 'Kontakt-Nr.', 'Name', 'Vorname', 'Mietbeginn', 'Mietende', 'Personen', 'Telefon']);
    expect(info.mapping.columns).toMatchObject({
      'VE-Nr.': 'unit.externalRef',
      'Mieter-Nr.': 'occupancy.externalRef',
      'Kontakt-Nr.': 'contact.externalRef',
      Name: 'occupancy.name',
      Vorname: 'occupancy.firstName',
      Mietbeginn: 'occupancy.from',
      Mietende: 'occupancy.to',
      Personen: 'occupancy.persons',
      Telefon: null,
    });
  });

  it('alle Presets sind als geraten markiert', () => {
    expect(CSV_PRESETS.map((p) => p.id)).toEqual(['immoware24-ve', 'immoware24-mieter', 'immoware24-eigentuemer', 'immoware24-kontakte', 'generisch']);
    expect(CSV_PRESETS.every((p) => p.guessed)).toBe(true);
  });
});

describe('bundleFromCsv: vier Dateien zusammenführen', () => {
  const { bundle, files } = bundleFromCsv(ALL);

  it('Liegenschaft und Wohnungen', () => {
    expect(bundle.source.kind).toBe('csv');
    expect(bundle.source.files.map((f) => f.preset)).toEqual(['immoware24-ve', 'immoware24-mieter', 'immoware24-eigentuemer', 'immoware24-kontakte']);
    expect(bundle.property).toMatchObject({ externalRef: 'OBJ-0815', name: 'WEG Musterstraße 12', street: 'Musterstraße 12', postalCode: '12345', city: 'Musterstadt' });
    expect(bundle.units.map((u) => [u.externalRef, u.label, u.areaSqm])).toEqual([
      ['0815.0001', 'Whg. 1 EG links', 65.5],
      ['0815.0002', 'Whg. 2 EG rechts', 80.25],
      ['0815.0003', 'Whg. 3 1. OG links', 45],
      ['0815.0004', 'Whg. 4 1. OG rechts', 1000],
    ]);
    expect(files).toHaveLength(4);
  });

  it('Mieter, Leerstand und Eigentümer mit Anschrift aus den Kontakten', () => {
    expect(bundle.occupancies.map((o) => [o.unitRef, o.kind, o.names.join(' / '), o.from, o.to, o.persons ?? null, o.externalRef ?? null])).toEqual([
      ['0815.0001', 'tenant', 'Erika Beispiel', '2019-03-01', null, 2, 'M-1001'],
      ['0815.0002', 'tenant', 'Hans Müller', '2015-01-01', '2025-06-30', 1, 'M-1002'],
      ['0815.0002', 'tenant', 'Jörg Šimek', '2025-07-01', null, 3, 'M-1003'],
      ['0815.0003', 'vacancy', '', '2025-01-01', null, 0, null],
      ['0815.0001', 'owner', 'Max Mustermann', '2010-05-15', null, null, 'E-01'],
      ['0815.0002', 'owner', 'Anna Groß', '2000-01-01', null, null, 'E-02'],
      ['0815.0003', 'owner', 'Anna Groß', '2000-01-01', null, null, 'E-02'],
      ['0815.0004', 'owner', 'Peter Eigen', '2018-07-01', null, null, 'E-03'],
    ]);
    expect(bundle.occupancies[1]!.address).toEqual({ street: 'Neue Straße 1', postalCode: '10115', city: 'Berlin' });
    expect(bundle.occupancies[5]!.address).toEqual({ street: 'Am Eigentum 5', postalCode: '54321', city: 'Eigenheim' });
  });

  it('nur Hinweise für nicht übernommene Spalten, keine Fehler', () => {
    expect(bundle.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(bundle.findings.map((f) => `${f.source?.file}:${f.source?.column}`)).toEqual([
      `${VE}:Art der VE`,
      `${VE}:Zimmer`,
      `${VE}:Etage`,
      `${MIETER}:Telefon`,
      `${EIG}:MEA`,
      `${KONT}:Anrede`,
      `${KONT}:E-Mail`,
      `${KONT}:Telefon`,
    ]);
    expect(bundle.findings[0]).toMatchObject({ code: 'csv_unmapped_column', severity: 'info', source: { row: 1 } });
  });
});

describe('Befunde je Zeile und Spalte', () => {
  const csv = (name: string, text: string) => ({ name, bytes: encodeUtf8(text) });
  const ve = csv('ve.csv', 'VE-Nr.;Wohnfläche\nW1;50\nW2;abc\nW1;51\n');

  it('Fläche keine Zahl, Einheit doppelt', () => {
    const { bundle } = bundleFromCsv([ve]);
    expect(bundle.findings.map((f) => [f.code, f.severity, f.source?.row, f.source?.column])).toEqual([
      ['csv_number_invalid', 'error', 3, 'Wohnfläche'],
      ['csv_duplicate_unit', 'warning', 4, undefined],
    ]);
    expect(bundle.units.map((u) => u.externalRef)).toEqual(['W1', 'W2']);
  });

  it('Mieter ohne Einheit, Datum falsch, Beginn fehlt, Name fehlt', () => {
    const mieter = csv('mieter.csv', 'VE-Nr.;Mieter;Mietbeginn;Mietende\nW9;Fremd;01.01.2025;\nW1;Datum;32.01.2025;\nW1;OhneBeginn;;\nW2;;01.01.2025;\nW1;Ende vor Beginn;01.02.2025;01.01.2025\n');
    const { bundle } = bundleFromCsv([ve, mieter]);
    expect(bundle.findings.filter((f) => f.source?.file === 'mieter.csv').map((f) => [f.code, f.severity, f.source?.row, f.source?.column])).toEqual([
      ['csv_unit_unknown', 'error', 2, 'VE-Nr.'],
      ['csv_date_invalid', 'error', 3, 'Mietbeginn'],
      ['csv_required_missing', 'error', 4, 'Mietbeginn'],
      ['csv_required_missing', 'error', 5, 'Mieter'],
      ['csv_date_invalid', 'error', 6, 'Mietende'],
    ]);
  });

  it('ohne Einheitenliste: Einheit aus der Mieterliste, Warnung', () => {
    const mieter = csv('mieter.csv', 'VE-Nr.;Mieter;Mietbeginn\nW1;A;01.01.2025\nW1;B;01.02.2025\n');
    const { bundle } = bundleFromCsv([mieter]);
    expect(bundle.units.map((u) => u.externalRef)).toEqual(['W1']);
    expect(bundle.findings.map((f) => [f.code, f.severity])).toEqual([['csv_unit_unknown', 'warning']]);
    expect(bundle.occupancies).toHaveLength(2);
  });

  it('mehrere Objekte: Fehler; Filter wählt eines', () => {
    const text = 'Objekt;VE-Nr.;Wohnfläche\nA;1;50\nB;1;60\n';
    const one = bundleFromCsv([csv('ve.csv', text)]);
    expect(one.bundle.findings.map((f) => f.code)).toEqual(['csv_duplicate_unit', 'csv_multiple_properties']);
    const mapping: CsvMapping = { ...inspectCsv('ve.csv', encodeUtf8(text)).mapping, filter: { 'property.externalRef': 'B' } };
    const two = bundleFromCsv([{ ...csv('ve.csv', text), mapping }]);
    expect(two.bundle.findings).toEqual([]);
    expect(two.bundle.units).toEqual([expect.objectContaining({ externalRef: '1', areaSqm: 60 })]);
  });

  it('Zuordnung vom Benutzer: Spalte umhängen, Vorgabewert für die Art', () => {
    const text = 'Wohnung;Bewohner;seit\nW1;Ute;01.01.2024\n';
    const info = inspectCsv('liste.csv', encodeLatin9(text));
    expect(info.mapping.preset).toBe('generisch');
    const mapping: CsvMapping = {
      preset: 'meine-liste',
      columns: { Wohnung: 'unit.externalRef', Bewohner: 'occupancy.name', seit: 'occupancy.from' },
      defaults: { 'occupancy.kind': 'Eigentümer' },
    };
    const { bundle } = bundleFromCsv([{ name: 'liste.csv', bytes: encodeLatin9(text), mapping }]);
    expect(bundle.occupancies).toEqual([expect.objectContaining({ unitRef: 'W1', kind: 'owner', names: ['Ute'], from: '2024-01-01', to: null })]);
  });

  it('Titelzeilen vor dem Kopf werden übersprungen', () => {
    const text = 'Auswertung Mieter\nStand 01.01.2026\n\nVE-Nr.;Mieter;Mietbeginn\nW1;A;01.01.2025\n';
    const info = inspectCsv('mieter.csv', encodeUtf8(text));
    expect(info.headers).toEqual(['VE-Nr.', 'Mieter', 'Mietbeginn']);
    expect(info.rowCount).toBe(1);
  });
});
