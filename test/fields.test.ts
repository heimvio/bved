import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIELD_TABLES, RECORD_LENGTHS, TABLES } from '../src/index.js';
import type { RecordType } from '../src/index.js';
import * as generated from '../src/tables/generated.js';

const TYPES = Object.keys(FIELD_TABLES) as RecordType[];

describe('Feldtabellen', () => {
  it.each(TYPES)('%s: Summe der Feldlängen = Satzlänge', (t) => {
    const sum = FIELD_TABLES[t].reduce((a, f) => a + f.length, 0);
    expect(sum).toBe(RECORD_LENGTHS[t]);
  });

  it('Satzlängen laut Abschnitt 2', () => {
    expect(RECORD_LENGTHS).toEqual({ A: 128, L: 2048, M: 2048, B: 1024, K: 1024, D: 1024, E835: 133, E898: 120, P: 95 });
  });

  it.each(TYPES)('%s: von–bis lückenlos, Länge = bis − von + 1, Feldnummern fortlaufend', (t) => {
    let pos = 1;
    FIELD_TABLES[t].forEach((f, i) => {
      expect(f.no, `${t} Feld ${f.key}`).toBe(i + 1);
      expect(f.from, `${t} Feld ${f.no}`).toBe(pos);
      expect(f.to - f.from + 1, `${t} Feld ${f.no}`).toBe(f.length);
      pos = f.to + 1;
    });
    expect(pos - 1).toBe(RECORD_LENGTHS[t]);
  });

  it.each(TYPES)('%s: Schlüssel eindeutig (außer Füller/Satzende)', (t) => {
    const keys = FIELD_TABLES[t].filter((f) => f.kind !== 'filler').map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Tabellenverweise zeigen auf vorhandene Tabellen', () => {
    for (const t of TYPES) {
      for (const f of FIELD_TABLES[t]) {
        if (f.table) expect((TABLES as Record<string, unknown>)[f.table], `${t}.${f.key} → ${f.table}`).toBeDefined();
      }
    }
  });

  it('Stichproben aus der Spezifikation', () => {
    const m = FIELD_TABLES.M;
    expect(m.find((f) => f.no === 24)).toMatchObject({ key: 'occupancyPeriod', from: 499, to: 510, form: 'N', required: true });
    expect(m.find((f) => f.no === 69)).toMatchObject({ from: 1169, to: 1171, table: 'E' });
    expect(FIELD_TABLES.K.find((f) => f.no === 39)).toMatchObject({ key: 'mix6Factor', from: 230, to: 238 });
    expect(FIELD_TABLES.D.find((f) => f.no === 20)).toMatchObject({ key: 'estimateFlag', from: 163, to: 165, table: 'S' });
    expect(FIELD_TABLES.E835.find((f) => f.no === 15)).toMatchObject({ from: 128, to: 133 });
    expect(FIELD_TABLES.B.find((f) => f.no === 34)).toMatchObject({ from: 275, to: 277, decimals: 2 });
  });
});

describe('Code-Tabellen', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'tables');

  it('generated.ts entspricht den JSON-Dateien', () => {
    for (const f of readdirSync(dir).filter((x) => /^[A-Z]\.json$/.test(x))) {
      const json = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      expect((generated as Record<string, unknown>)[`TABLE_${f[0]}`], f).toEqual(json);
    }
  });

  it('Anzahl der Einträge je Tabelle', () => {
    expect(TABLES.B).toHaveLength(46);
    expect(TABLES.E).toHaveLength(29);
    expect(TABLES.K).toHaveLength(84);
    expect(TABLES.L).toHaveLength(4);
    expect(TABLES.M).toHaveLength(7);
    expect(TABLES.S).toHaveLength(14);
    expect(TABLES.U).toHaveLength(229);
    expect(TABLES.G).toHaveLength(15);
    expect(TABLES.T).toHaveLength(22);
  });

  it('Codes eindeutig, Labels gefüllt', () => {
    for (const [name, t] of Object.entries(TABLES)) {
      const codes = t!.map((e) => e.code);
      expect(new Set(codes).size, name).toBe(codes.length);
      for (const e of t!) expect(e.label.trim(), `${name} ${e.code}`).not.toBe('');
    }
  });

  it('Stichproben', () => {
    expect(TABLES.K.find((e) => e.code === '231')?.label).toBe('Kosten HZG + WW');
    expect(TABLES.E.find((e) => e.code === '035')?.label).toBe('Personen');
    expect(TABLES.S.find((e) => e.code === '11')?.label).toBe('Hauptablesung');
    expect(TABLES.L.find((e) => e.code === '13')?.extra?.law).toBe('§35a Abs.3 EStG');
    expect(TABLES.U.find((e) => e.code === '40')?.label).toBe('ista Deutschland GmbH, Essen');
    expect(TABLES.B.find((e) => e.code === '194')?.label).toBe('Erdgas H (schwer) kWh');
  });
});
