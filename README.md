# @heimvio/bved

TypeScript library for the **bved data exchange standard 3.10** (*Standard-Datenaustausch zwischen Software der Wohnungswirtschaft und Abrechnungsunternehmen für Heiz-, Warm- und Kaltwasserkosten*, formerly ARGE HeiWaKo) — the fixed-width file format German property management software and heating/water metering services use to exchange master data, costs and billing results.

- Reads and writes **all record types**: A, L, M, B, K, D, E835, E898, P (version 3.10, third extension, September 2025).
- Field tables transcribed from the specification (`FIELD_TABLES`), every record length checked by tests.
- Code tables B, E, G, K, L, M, S, T and U as data (`TABLES`, also as plain JSON under `src/tables/`).
- Tolerant reading of versions 03.00–03.10, UTF-8 detection, findings instead of exceptions.
- Builds a neutral **master data bundle** from bved files (L/M/B/K) **or from CSV exports** (column mapping with presets, encoding and delimiter detection, several files merged into one import).
- Builds outbound deliveries (A, D, E835, E898) when you act as the billing service.
- No Node.js APIs in the library: runs in Node ≥ 20 and in the browser. The only dependency is [`fflate`](https://github.com/101arrowz/fflate) for zip files.

> **Not affiliated with bved e.V.** This is an independent implementation by [heimvio](https://heimvio.de). "bved" and "ARGE HeiWaKo" are names of their respective owners. The specification itself is published by the Bundesverband für Energie- und Wasserdatenmanagement e.V. at [bved.info](https://www.bved.info/) — read it before relying on this library; where this code and the specification disagree, the specification wins (please open an issue).

## Install

The package is published to the GitHub npm registry, not to npmjs.com. Add a `.npmrc` next to your `package.json`:

```
@heimvio:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

(`GITHUB_TOKEN` needs the `read:packages` scope.) Then:

```sh
npm install @heimvio/bved
```

## Reading a delivery

```ts
import { parseBvedFile, bundleFromBved, unzipFiles } from '@heimvio/bved';

const files = unzipFiles(zipBytes) // or read .DAT files yourself
  .filter((f) => f.name.toUpperCase().endsWith('.DAT'))
  .map((f) => parseBvedFile(f.name, f.bytes));

for (const f of files) {
  console.log(f.kind, f.standardVersion, f.records.length, f.findings);
}

const bundle = bundleFromBved(files); // property, units, occupancies, fuels, costs
```

Each record is `{ type, version, line, fields }`. Field values are typed by the field table:

| Field form | Value |
|---|---|
| alphanumeric | `string` (trailing blanks removed) |
| numeric | `number` with the implied decimals applied (`0000012345` with 2 decimals → `123.45`) |
| code (table reference) | `string` in table notation (`'050'`, `'11'`) |
| date `TTMMJJ` | ISO `'2025-12-31'` |
| period `TTMMJJTTMMJJ` | `'2025-01-01/2025-12-31'` |
| blank | `null` — blank and zero are different things in this standard |

In the bundle, each fuel (B record) carries its sequence number `seq` (B field 23), the calorific value or annual performance factor `calorificValue` (field 9), opening and closing stock with date, quantity, gross and net (fields 10–17), the hot water figures `hotWaterTemp`/`hotWaterVolume`/`hotWaterPct` (fields 18–20) and the meter fields `meterNo`/`meterConsumption`/`meterStart`/`meterEnd` (fields 30–33). Each cost (K record) carries `fuelSeq` (field 15, `0` → `null`) and a `vatRate` derived from gross and net — the standard has no VAT field: `(gross/net − 1)·100` to one decimal, snapped to 0, 7 or 19 within ±0.5, otherwise kept as computed with an info finding `bved_vat_rate_derived` (`deriveVatRate(gross, net)` is exported).

Problems are reported as findings (`{ severity, code, message, source: { file, row, field } }`), for example `bved_line_length`, `bved_required_missing`, `bved_numeric_invalid`, `bved_unknown_record`, `bved_version_unsupported`, `bved_encoding_utf8`.

## Writing

```ts
import { writeBvedFile, buildOutbound, zipFiles } from '@heimvio/bved';

const { name, bytes } = writeBvedFile('DTM', records); // DTM310_20260115103000123.DAT, ISO 8859-15, CRLF

const { files } = buildOutbound(
  {
    customer_no: '4711',
    property_no: '123456789',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    users: [
      {
        bved_unit_no: 1,
        external_ref: '0815.0001.01',
        period_end: '2025-12-31',
        name: 'Erika Beispiel',
        lines: [{ cost_key: '231', gross: 4210.37, net: 3538.13, consumption: 1234, consumption_unit_key: '030', estimate_flag: '11' }],
        s35a: [],
        documents: [{ file_name: 'HKA_0815.0001.01.pdf', kind: 'HKA', page: 0 }],
      },
    ],
  },
  new Date(),
  [{ name: 'HKA_0815.0001.01.pdf', bytes: pdf }],
);

const zip = zipFiles(files);
```

The writer never truncates silently: a value that does not fit throws `BvedWriteError`. Characters outside ISO 8859-15 become `?`.

## CSV master data

```ts
import { inspectCsv, bundleFromCsv } from '@heimvio/bved';

const info = inspectCsv('Mieter.csv', bytes);
// { encoding: 'windows-1252', delimiter: ';', headers, presetCandidates, mapping, unmapped }

const { bundle } = bundleFromCsv([
  { name: 'Verwaltungseinheiten.csv', bytes: units },
  { name: 'Mieter.csv', bytes, mapping: { ...info.mapping, columns: { ...info.mapping.columns, Telefon: null } } },
  { name: 'Kontakte.csv', bytes: contacts },
]);
```

A mapping (`CsvMapping`) assigns each column header to a target field and is plain JSON, so it can be stored and reused. The presets for immoware24 exports (`immoware24-ve`, `immoware24-mieter`, `immoware24-eigentuemer`, `immoware24-kontakte`) and the `generisch` preset are **guesses** made from the vendor's manual (`guessed: true`); corrections from real exports are welcome.

## Specification

- bved: [bved.info](https://www.bved.info/) — *Standard-Datenaustausch Version 3.10, dritte Erweiterung* (September 2025) and Tabelle U (provider keys, separate document, state 16.09.2026).
- Cross-checked against test cases of [ArgeHeiwako.NET](https://github.com/me-software/ArgeHeiwako.NET) (MIT, me-software) for A, E835 and E898.

## Development

```sh
npm install
npm test        # vitest
npm run build   # regenerates src/tables/generated.ts from the JSON tables, then tsc
```

The golden files in `test/golden/` are synthetic and generated by `scripts/make-golden.py` directly from the positions in the specification, independently of `src/fields.ts`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
