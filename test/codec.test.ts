import { describe, expect, it } from 'vitest';
import {
  BvedWriteError,
  bvedFileName,
  encodeLatin9,
  parseBvedFile,
  parseBvedFileName,
  parseBvedRecord,
  writeBvedFile,
  writeBvedRecord,
} from '../src/index.js';
import type { FileKind, Finding } from '../src/index.js';
import { encodeUtf8 } from '../src/encoding.js';
import { GOLDEN_AT, golden } from './helpers.js';

const PREFIXES: [string, FileKind][] = [
  ['DTA310', 'DTA'],
  ['DTM310', 'DTM'],
  ['DTK310', 'DTK'],
  ['DTD310', 'DTD'],
  ['DTE835', 'DTE835'],
  ['DTE898', 'DTE898'],
];

const errors = (f: Finding[]): Finding[] => f.filter((x) => x.severity !== 'info');

describe('Dateinamen', () => {
  it('DT?310_JJJJMMTThhmmssSSS.DAT', () => {
    const at = new Date(2026, 0, 15, 10, 30, 5, 7);
    expect(bvedFileName('DTA', at)).toBe('DTA310_20260115103005007.DAT');
    expect(bvedFileName('DTM', at)).toBe('DTM310_20260115103005007.DAT');
    expect(bvedFileName('DTE835', at)).toBe('DTE835_20260115103005007.DAT');
    expect(bvedFileName('DTE898', at)).toBe('DTE898_20260115103005007.DAT');
    expect(bvedFileName('DTP', at)).toBe('DTP310_20260115103005007.DAT');
  });

  it('erkennt Dateiart und Version, auch ältere Namen ohne Millisekunden', () => {
    expect(parseBvedFileName('DTM310_20260115103005007.DAT')).toEqual({ kind: 'DTM', version: '03.10' });
    expect(parseBvedFileName('export/dtk305_20140601120000.dat')).toEqual({ kind: 'DTK', version: '03.05' });
    expect(parseBvedFileName('DTE835_20260115103005007.DAT')).toEqual({ kind: 'DTE835' });
    expect(parseBvedFileName('mieter.csv')).toBeUndefined();
  });
});

describe('Golden-Dateien: lesen und byte-gleich schreiben', () => {
  it.each(PREFIXES)('%s', (prefix, kind) => {
    const g = golden(prefix);
    const parsed = parseBvedFile(g.name, g.bytes);
    expect(parsed.kind).toBe(kind);
    expect(errors(parsed.findings)).toEqual([]);
    expect(parsed.encoding).toBe('iso-8859-15');
    const out = writeBvedFile(kind, parsed.records, GOLDEN_AT);
    expect(out.name).toBe(g.name);
    expect(Buffer.from(out.bytes).equals(Buffer.from(g.bytes))).toBe(true);
    // und noch einmal: schreiben → lesen → schreiben
    const again = writeBvedFile(kind, parseBvedFile(out.name, out.bytes).records, GOLDEN_AT);
    expect(Buffer.from(again.bytes).equals(Buffer.from(g.bytes))).toBe(true);
  });
});

describe('Feldwerte aus den Golden-Dateien', () => {
  it('DTM: L- und M-Sätze', () => {
    const p = parseBvedFile(golden('DTM310').name, golden('DTM310').bytes);
    expect(p.standardVersion).toBe('03.10');
    const l = p.records[0]!;
    expect(l.type).toBe('L');
    expect(l.fields).toMatchObject({
      customerNo: '0000004711',
      providerKey: null,
      providerRef: '1234567890000',
      vatMode: 3,
      street: 'Musterstraße 12',
      country: 'DEU',
      postalCode: '12345',
      billingPeriod: '2025-01-01/2025-12-31',
      objectNo: 'OBJ-0815',
      riskFlag: 0,
      riskPct: null,
      laborFlag: 1,
      currency: 'EUR',
      weg: 1,
      totalArea: null,
      landlordCo2Pct: null,
    });
    const m3 = p.records[3]!;
    expect(m3.fields).toMatchObject({
      clientRef: '0815.0002.02',
      userName1: 'Jörg Šimek',
      occupancyPeriod: '2025-07-01/2025-12-31',
      heatingShares: 80.25,
      heatingSharesUnit: '010',
      allocation1Key: '035',
      allocation1Shares: 3,
      vacancyFlag: 0,
      heatingPrepayGross: null,
    });
  });

  it('DTK: Vorzeichen, Emissionsfaktor, variabler Text', () => {
    const p = parseBvedFile(golden('DTK310').name, golden('DTK310').bytes);
    const ks = p.records.filter((r) => r.type === 'K');
    expect(ks[0]!.fields).toMatchObject({ costKey: '201', quantity: 150000, gross: 18450, net: 15504.2, emissionKind: '01', co2Factor: 0.201, co2Kg: 30150, co2CostGross: 1640.16, mix1Carrier: '04', mix1Pct: null });
    expect(ks[1]!.fields).toMatchObject({ gross: -119, net: -100, quantity: null });
    expect(ks[2]!.fields).toMatchObject({ costKey: '221', taxServiceKey: '13', laborAmount: 238 });
    expect(ks[4]!.fields).toMatchObject({ costKey: '228', costLabel: 'Legionellenprüfung', costScope: 'W' });
  });

  it('DTD: Schätzkennzeichen in Tabellenschreibweise, Blank bleibt null', () => {
    const p = parseBvedFile(golden('DTD310').name, golden('DTD310').bytes);
    expect(p.records.map((r) => r.fields['estimateFlag'])).toEqual(['11', '11', '6', '11', '11', '11']);
    expect(p.records[0]!.fields).toMatchObject({ periodEnd: '2025-12-31', totalGross: 4210.37, prepayGross: null, balanceGross: null, consumptionUnitKey: '030' });
    expect(p.records[3]!.fields).toMatchObject({ consumption: null, consumptionUnitKey: null, name1: 'Leerstand' });
  });
});

describe('Gegenprobe ArgeHeiwako.NET (MIT, me-software) — Testfälle übernommen', () => {
  // Quelle: github.com/me-software/ArgeHeiwako.NET, src/ArgeHeiwako.Tests (Version 3.05)
  const e835 = 'E835         000000001000100011ID                   050                         00000001000000000005000050000000000000000000000311216';
  const e835Text = 'E835         000000001000100011ID                   050Testkosten               00000001000000000005000050000000000000000000000311216';
  const e835Seq = 'E8350000001  000000001000100011ID                   050                         00000001000000000005000050000000000000000000000311216';
  const e898 = 'E898         000000001000100011ID                   test.pdf                                                001311215   ';
  const e898Kind = 'E898         000000001000100011ID                   test.pdf                                                001311215HKA';
  const a = 'A03.05' + '0000000001' + '  ' + '0000000010001' + 'Id'.padEnd(20) + ' '.repeat(76) + 'A';

  it('E835 lesen', () => {
    const f: Finding[] = [];
    const r = parseBvedRecord(e835, 1, 'x', f)!;
    expect(f).toEqual([]);
    expect(r.fields).toMatchObject({
      seqNo: null,
      providerKey: null,
      providerRefExt: '000000001000100011',
      clientRef: 'ID',
      billingSeq: null,
      costKey: '050',
      costLabel: null,
      taxServiceKey: '00',
      invoiceGross: 100,
      userShare: 5,
      userPct: 5,
      laborAmount: 0,
      userLaborShare: 0,
      periodEnd: '2016-12-31',
    });
    expect(parseBvedRecord(e835Text, 1)!.fields['costLabel']).toBe('Testkosten');
    expect(parseBvedRecord(e835Seq, 1)!.fields['seqNo']).toBe(1);
  });

  it.each([e835, e835Text, e835Seq, e898, e898Kind, a])('Rundreise byte-gleich: %s', (line) => {
    const r = parseBvedRecord(line, 1)!;
    expect(writeBvedRecord(r)).toBe(line);
  });

  it('E898 und A lesen', () => {
    expect(parseBvedRecord(e898, 1)!.fields).toMatchObject({ imagePath: 'test.pdf', pageNo: 1, periodEnd: '2015-12-31', documentKind: null });
    expect(parseBvedRecord(e898Kind, 1)!.fields['documentKind']).toBe('HKA');
    const ar = parseBvedRecord(a, 1)!;
    expect(ar.version).toBe('03.05');
    expect(ar.fields).toMatchObject({ customerNo: '0000000001', providerRef: '0000000010001', clientRef: 'Id' });
  });
});

describe('Tolerantes Lesen und Befunde', () => {
  const dtm = golden('DTM310');
  const text = new TextDecoder('iso-8859-15').decode(dtm.bytes);

  it('UTF-8 statt ISO 8859-15: Befund, Werte trotzdem richtig', () => {
    const p = parseBvedFile(dtm.name, encodeUtf8(text));
    expect(p.encoding).toBe('utf-8');
    expect(p.findings.map((f) => f.code)).toEqual(['bved_encoding_utf8']);
    expect(p.records[3]!.fields['userName1']).toBe('Jörg Šimek');
  });

  it('LF statt CR/LF: Hinweis', () => {
    const p = parseBvedFile(dtm.name, encodeLatin9(text.replace(/\r\n/g, '\n')));
    expect(p.findings.map((f) => f.code)).toEqual(['bved_line_ending']);
    expect(p.records).toHaveLength(6);
  });

  it('abgeschnittene Leerzeichen am Satzende: Satzlänge-Befund, Felder gelesen', () => {
    const line = text.split('\r\n')[1]!.replace(/ +M$/, '');
    const f: Finding[] = [];
    const r = parseBvedRecord(line, 2, 'x', f)!;
    expect(f.map((x) => x.code)).toEqual(['bved_line_length', 'bved_record_end']);
    expect(r.fields['clientRef']).toBe('0815.0001.01');
  });

  it('unbekannte Satzart, nicht numerisch, Mussfeld leer', () => {
    const f: Finding[] = [];
    expect(parseBvedRecord('X'.padEnd(128), 1, 'x', f)).toBeUndefined();
    const a = 'A03.10' + '00000X0001' + '  ' + '0000000010001' + ' '.repeat(20) + ' '.repeat(76) + 'A';
    const r = parseBvedRecord(a, 2, 'x', f)!;
    expect(f.map((x) => [x.code, x.severity, x.source?.field])).toEqual([
      ['bved_unknown_record', 'warning', undefined],
      ['bved_numeric_invalid', 'error', 'customerNo'],
      ['bved_required_missing', 'error', 'clientRef'],
    ]);
    expect(r.fields['customerNo']).toBeNull();
  });

  it('Version 03.05: später eingeführte Stellen werden nicht gelesen; leer → kein Befund', () => {
    const k = text.split('\r\n')[0]!; // L-Satz 03.10
    const old = 'L03.05' + k.slice(6);
    const f: Finding[] = [];
    const r = parseBvedRecord(old, 1, 'x', f)!;
    expect(r.version).toBe('03.05');
    expect('weg' in r.fields).toBe(false);
    // WEG-Kennzeichen steht im Golden auf 1 → als ignoriert gemeldet
    expect(f.map((x) => x.code)).toContain('bved_version_field_ignored');
    expect(f.filter((x) => x.severity !== 'info')).toEqual([]);
  });

  it('Version 03.09: Energiemix (in 3.10 verschoben) nicht gelesen', () => {
    const dtk = golden('DTK310');
    const line = new TextDecoder('iso-8859-15').decode(dtk.bytes).split('\r\n')[1]!;
    const f: Finding[] = [];
    const r = parseBvedRecord('K03.09' + line.slice(6), 2, 'x', f)!;
    expect(r.fields['co2CostGross']).toBe(1640.16);
    expect('co2CostNet' in r.fields).toBe(false);
    expect(f.map((x) => x.source?.field)).toEqual(['co2CostNet', 'mix1Carrier']);
  });

  it('Version 03.11: Warnung, gelesen wie 03.10', () => {
    const f: Finding[] = [];
    const line = text.split('\r\n')[1]!;
    const r = parseBvedRecord('M03.11' + line.slice(6), 2, 'x', f)!;
    expect(f.map((x) => [x.code, x.severity])).toEqual([['bved_version_unsupported', 'warning']]);
    expect(r.fields['clientRef']).toBe('0815.0001.01');
  });

  it('Datei ohne passenden Namen: aus dem Inhalt erkannt', () => {
    const p = parseBvedFile('stammdaten.txt', dtm.bytes);
    expect(p.kind).toBe('DTM');
    expect(p.findings.map((f) => f.code)).toEqual(['bved_file_name']);
  });

  it('Satz in falscher Datei: Warnung', () => {
    const p = parseBvedFile('DTA310_20260115103000000.DAT', dtm.bytes);
    expect(new Set(p.findings.map((f) => f.code))).toEqual(new Set(['bved_record_kind_mismatch']));
  });

  it('bedingte Mussfelder (Kann → Muss)', () => {
    const line = text.split('\r\n')[1]!;
    // Feld 69 (Einheit zu Grundanteilen Heizung) leeren
    const broken = line.slice(0, 1168) + '   ' + line.slice(1171);
    const f: Finding[] = [];
    parseBvedRecord(broken, 2, 'x', f);
    expect(f.map((x) => [x.code, x.severity, x.source?.field])).toEqual([['bved_required_missing', 'warning', 'heatingSharesUnit']]);
  });
});

describe('Schreiben', () => {
  const base = { customerNo: '4711', providerKey: null, providerRef: '1234567890001', clientRef: 'X' };

  it('Blank ≠ 0, Vorzeichen an erster Stelle, Dezimalstellen implizit', () => {
    const line = writeBvedRecord({
      type: 'D',
      fields: { ...base, periodEnd: '2025-12-31', costKey: '231', currency: 'EUR', totalGross: 0, totalNet: null, balanceGross: -12.3, consumption: 1.5, estimateFlag: '11' },
    });
    expect(line.slice(57, 67)).toBe('0000000000');
    expect(line.slice(67, 77)).toBe('          ');
    expect(line.slice(127, 137)).toBe('-000001230');
    expect(line.slice(150, 159)).toBe('000001500');
    expect(line.slice(162, 165)).toBe('011');
    expect(line.slice(6, 16)).toBe('0000004711');
    expect(line).toHaveLength(1024);
  });

  it('Emissionsart 02 → (3,6) Stellen', () => {
    const line = writeBvedRecord({
      type: 'K',
      fields: { ...base, providerRef: '1234567890000', costKey: '201', costScope: 'E', invoiceDate: '2025-12-31', taxServiceKey: '00', fuelSeq: 1, emissionKind: '02', co2Factor: 0.201234 },
    });
    expect(line.slice(116, 125)).toBe('000201234');
    const back = parseBvedRecord(line, 1)!;
    expect(back.fields['co2Factor']).toBe(0.201234);
  });

  it('Fehler statt stillem Abschneiden', () => {
    expect(() => writeBvedRecord({ type: 'A', fields: { ...base, clientRef: 'x'.repeat(21) } })).toThrow(BvedWriteError);
    expect(() => writeBvedRecord({ type: 'D', fields: { ...base, periodEnd: '2025-12-31', costKey: '231', currency: 'EUR', totalGross: 123456789.0 } })).toThrow(/passt nicht/);
    expect(() => writeBvedRecord({ type: 'D', fields: { ...base, periodEnd: '31.12.2025', costKey: '231', currency: 'EUR' } })).toThrow(/ISO-Datum/);
    expect(() => writeBvedFile('DTA', [{ type: 'D', version: '03.10', line: 0, fields: {} }])).toThrow(/gehört nicht/);
  });

  it('nicht darstellbare Zeichen werden zu ?', () => {
    const f = writeBvedFile('DTA', [{ type: 'A', version: '03.10', line: 0, fields: { ...base, clientRef: 'Ćevap €' } }], GOLDEN_AT);
    const p = parseBvedFile(f.name, f.bytes);
    expect(p.records[0]!.fields['clientRef']).toBe('?evap €');
  });
});

describe('SHA-256', () => {
  it('Prüfvektoren (FIPS 180-2) und Vergleich mit node:crypto', async () => {
    const { sha256Hex } = await import('../src/index.js');
    const { createHash } = await import('node:crypto');
    expect(sha256Hex(encodeLatin9('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const g = golden('DTM310').bytes;
    expect(sha256Hex(g)).toBe(createHash('sha256').update(g).digest('hex'));
  });
});
