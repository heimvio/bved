// Feldtabellen der Satzarten, abgeschrieben aus
// „Standard-Datenaustausch Version 3.10, dritte Erweiterung“ (bved, September 2025),
// Abschnitte 3–11 (Seiten 14–28). Spalten: Feld, Länge, von–bis, Form, Kann/Muss.
// Nachkommastellen aus der Bemerkung („8,2 Stellen“ = 8 vor, 2 nach dem Komma,
// ohne Trennzeichen in der Datei).

import type { FieldDef, RecordType } from './types.js';

type Opts = Partial<Pick<FieldDef, 'decimals' | 'table' | 'note' | 'kind' | 'decimalsBy' | 'since'>>;

function f(
  no: number,
  key: string,
  length: number,
  from: number,
  to: number,
  form: 'AN' | 'N',
  required: 'M' | 'K',
  opts: Opts = {},
): FieldDef {
  return { no, key, length, from, to, form, required: required === 'M', ...opts };
}

const recordType = (len = 1): FieldDef => f(1, 'recordType', len, 1, len, 'AN', 'M', { kind: 'recordType' });
const version = (): FieldDef => f(2, 'version', 5, 2, 6, 'AN', 'M', { kind: 'version', note: 'Version 03.00 bis 99.99' });
const customerNo = (): FieldDef =>
  f(3, 'customerNo', 10, 7, 16, 'N', 'M', { kind: 'id', note: 'Kunden-Nr. beim Abrechnungsunternehmen' });
const providerKey = (): FieldDef =>
  f(4, 'providerKey', 2, 17, 18, 'AN', 'K', { table: 'U', note: 'Schlüssel des Abrechnungsunternehmens' });
const providerRef = (note: string): FieldDef =>
  f(5, 'providerRef', 13, 19, 31, 'N', 'M', { kind: 'id', note: `Ordnungsbegriff des Abrechnungsunternehmens: ${note}` });
const clientRef = (): FieldDef =>
  f(6, 'clientRef', 20, 32, 51, 'AN', 'M', { note: 'Ordnungsbegriff des Auftraggebers' });

/** Emissionsart K Feld 17: 01 = (6,3) Stellen, 02 = (3,6) Stellen. */
const CO2_DEC = { field: 'emissionKind', map: { '01': 3, '02': 6 }, fallback: 3 };

const A: FieldDef[] = [
  recordType(),
  version(),
  customerNo(),
  providerKey(),
  providerRef('9 Stellen Liegenschaftsnummer, 4 Stellen Wohnungsnummer'),
  clientRef(),
  f(7, 'filler', 76, 52, 127, 'AN', 'K', { kind: 'filler' }),
  f(8, 'end', 1, 128, 128, 'AN', 'M', { kind: 'end' }),
];

const L: FieldDef[] = [
  recordType(),
  version(),
  customerNo(),
  providerKey(),
  providerRef("9 Stellen Liegenschaftsnummer, 4 Stellen '0000'"),
  f(6, 'vatMode', 1, 32, 32, 'N', 'M', { note: '3 = nur brutto, 4 = nur netto, 5 = MwSt-Ausweis gemäß M-Satz Feld 25' }),
  f(7, 'street', 35, 33, 67, 'AN', 'K', { note: 'Straße, Leerstelle, Hausnummer' }),
  f(8, 'country', 3, 68, 70, 'AN', 'K', { note: 'ISO 3166 alpha-3' }),
  f(9, 'postalCode', 10, 71, 80, 'AN', 'K'),
  f(10, 'city', 35, 81, 115, 'AN', 'K'),
  f(11, 'billingPeriod', 12, 116, 127, 'N', 'M', { kind: 'period' }),
  f(12, 'objectNo', 15, 128, 142, 'AN', 'K', { note: 'Objektnummer, Ordnungsbegriff des Kunden/Rechenzentrums' }),
  f(13, 'riskFlag', 1, 143, 143, 'N', 'M', { note: '0 = kein, 1 = Umlageausfallwagnis' }),
  f(14, 'riskPct', 3, 144, 146, 'N', 'K', { decimals: 2, note: '1,2 Stellen; Muss bei Feld 13 = 1' }),
  f(15, 'laborFlag', 1, 147, 147, 'N', 'M', { note: '0 = keine, 1 = Ausweisung von Lohnanteilen' }),
  f(16, 'currency', 3, 148, 150, 'AN', 'M', { note: 'ISO-Währungscode für Satzart M' }),
  f(17, 'weg', 1, 151, 151, 'N', 'K', { since: '03.09', note: '0 = Nein, 1 = Ja (CO2KostAufG)' }),
  f(18, 'totalArea', 7, 152, 158, 'N', 'K', { since: '03.09', decimals: 2, note: 'Gesamtfläche, wenn abweichend von Summe Grundanteile Heizung' }),
  f(19, 'nonResidential', 1, 159, 159, 'N', 'K', { since: '03.09', note: 'Nichtwohngebäude §8' }),
  f(20, 'co2Restriction1', 1, 160, 160, 'N', 'K', { since: '03.09', note: 'Kennzeichen 1 §9' }),
  f(21, 'co2Restriction2', 1, 161, 161, 'N', 'K', { since: '03.09', note: 'Kennzeichen 2 §9' }),
  f(22, 'landlordCo2Pct', 3, 162, 164, 'N', 'K', { since: '03.09', note: '%-Anteil Vermieter 000–100' }),
  f(23, 'heatConnectedSince2023', 1, 165, 165, 'N', 'K', { since: '03.09', note: 'Wärmeanschluss am/nach 01.01.2023' }),
  f(24, 'filler', 1882, 166, 2047, 'AN', 'K', { kind: 'filler' }),
  f(25, 'end', 1, 2048, 2048, 'AN', 'M', { kind: 'end' }),
];

function nameBlock(firstNo: number, from: number, prefix: string, streetNote?: string): FieldDef[] {
  const out: FieldDef[] = [];
  let pos = from;
  for (let i = 0; i < 4; i++) {
    out.push(f(firstNo + i, `${prefix}Name${i + 1}`, 35, pos, pos + 34, 'AN', 'K'));
    pos += 35;
  }
  out.push(f(firstNo + 4, `${prefix}Street`, 35, pos, pos + 34, 'AN', 'K', streetNote ? { note: streetNote } : {}));
  pos += 35;
  out.push(f(firstNo + 5, `${prefix}Country`, 3, pos, pos + 2, 'AN', 'K'));
  pos += 3;
  out.push(f(firstNo + 6, `${prefix}PostalCode`, 10, pos, pos + 9, 'AN', 'K'));
  pos += 10;
  out.push(f(firstNo + 7, `${prefix}City`, 35, pos, pos + 34, 'AN', 'K'));
  return out;
}

const M: FieldDef[] = [
  recordType(),
  version(),
  customerNo(),
  providerKey(),
  providerRef('9 Stellen Liegenschaftsnummer, 4 Stellen Wohnungsnummer'),
  clientRef(),
  f(7, 'addressFlag', 1, 52, 52, 'N', 'M', { note: '1 Nutzer, 2 Eigentümer, 3 Eigentümername/Nutzername/Eigentümeranschrift, 4 Leistungsnehmer' }),
  ...nameBlock(8, 53, 'user'),
  ...nameBlock(16, 276, 'owner'),
  f(24, 'occupancyPeriod', 12, 499, 510, 'N', 'M', { kind: 'period', note: 'Wohnzeitraum im Abrechnungszeitraum' }),
  f(25, 'vatFlag', 1, 511, 511, 'N', 'M', { note: '0 kein Ausweis, 1 gewerbl. Vermietung, 2 gewerbl. ETG, 3 auf Saldo' }),
  f(26, 'riskFlag', 1, 512, 512, 'N', 'M'),
  f(27, 'heatingShares', 10, 513, 522, 'N', 'K', { decimals: 2, note: 'Grundanteile Heizung, Einheit Feld 69' }),
  f(28, 'heatingPrepayGross', 10, 523, 532, 'N', 'K', { decimals: 2 }),
  f(29, 'heatingPrepayNet', 10, 533, 542, 'N', 'K', { decimals: 2 }),
  f(30, 'hotWaterShares', 10, 543, 552, 'N', 'K', { decimals: 2, note: 'Grundanteile Warmwasser, Einheit Feld 70' }),
  f(31, 'hotWaterPrepayGross', 10, 553, 562, 'N', 'K', { decimals: 2 }),
  f(32, 'hotWaterPrepayNet', 10, 563, 572, 'N', 'K', { decimals: 2 }),
  f(33, 'coldWaterShares', 10, 573, 582, 'N', 'K', { decimals: 2, note: 'nur bei separater Kaltwasserabrechnung' }),
  f(34, 'coldWaterPrepayGross', 10, 583, 592, 'N', 'K', { decimals: 2 }),
  f(35, 'coldWaterPrepayNet', 10, 593, 602, 'N', 'K', { decimals: 2 }),
  f(36, 'allocation1Key', 3, 603, 605, 'N', 'K', { kind: 'code', table: 'E' }),
  f(37, 'allocation1Shares', 10, 606, 615, 'N', 'K', { decimals: 2 }),
  f(38, 'allocation2Key', 3, 616, 618, 'N', 'K', { kind: 'code', table: 'E' }),
  f(39, 'allocation2Shares', 10, 619, 628, 'N', 'K', { decimals: 2 }),
  f(40, 'allocation3Key', 3, 629, 631, 'N', 'K', { kind: 'code', table: 'E' }),
  f(41, 'allocation3Shares', 10, 632, 641, 'N', 'K', { decimals: 2 }),
  ...nameBlock(42, 642, 'supplier', 'Straße und Hausnr. oder Postfach'),
  f(50, 'supplierTaxIdFlag', 1, 865, 865, 'N', 'K', { note: '1 = USt-ID-Nr., 2 = Steuernummer' }),
  f(51, 'supplierTaxId', 16, 866, 881, 'AN', 'K'),
  f(52, 'taxRateFlag', 1, 882, 882, 'N', 'K', { note: '1 Regelsteuersatz, 2 ermäßigt' }),
  f(53, 'invoiceNoFlag', 1, 883, 883, 'N', 'K', { note: '0 keine Rechnung §14 UStG, 1 aus Feld 54, 2 vom Abrechner' }),
  f(54, 'invoiceNo', 25, 884, 908, 'AN', 'K'),
  f(55, 'accountNo', 18, 909, 926, 'AN', 'K'),
  f(56, 'bankCode', 15, 927, 941, 'AN', 'K'),
  f(57, 'companyFlag', 1, 942, 942, 'N', 'K'),
  f(58, 'paymentFlag', 1, 943, 943, 'N', 'K', { note: '0 keine, 1 Abbuchungserlaubnis' }),
  ...nameBlock(59, 944, 'recipient', 'Straße und Hausnr. oder Postfach'),
  f(67, 'vacancyFlag', 1, 1167, 1167, 'N', 'M', { since: '03.01', note: '0 kein Leerstand, 1 Leerstand' }),
  f(68, 'changeFeeFlag', 1, 1168, 1168, 'N', 'M', { since: '03.01', note: 'Umlage Nutzerwechselgebühr' }),
  f(69, 'heatingSharesUnit', 3, 1169, 1171, 'N', 'K', { kind: 'code', table: 'E', since: '03.07', note: 'Muss, wenn Feld 27 gefüllt' }),
  f(70, 'hotWaterSharesUnit', 3, 1172, 1174, 'N', 'K', { kind: 'code', table: 'E', since: '03.07', note: 'Muss, wenn Feld 30 gefüllt' }),
  f(71, 'filler', 873, 1175, 2047, 'AN', 'K', { kind: 'filler' }),
  f(72, 'end', 1, 2048, 2048, 'AN', 'M', { kind: 'end' }),
];

const B: FieldDef[] = [
  recordType(),
  version(),
  customerNo(),
  providerKey(),
  providerRef("9 Stellen Liegenschaftsnummer, 4 Stellen '0000'"),
  f(6, 'currency', 3, 32, 34, 'AN', 'M', { note: 'ISO-Währungscode für B und K' }),
  f(7, 'billingPeriod', 12, 35, 46, 'N', 'M', { kind: 'period' }),
  f(8, 'fuelKey', 3, 47, 49, 'N', 'K', { kind: 'code', table: 'B' }),
  f(9, 'calorificValue', 11, 50, 60, 'N', 'K', { decimals: 4, note: 'kWh je Brennstoffeinheit bzw. Jahresarbeitszahl (Wärmepumpe)' }),
  f(10, 'startStockDate', 6, 61, 66, 'N', 'K', { kind: 'date' }),
  f(11, 'startStockQty', 11, 67, 77, 'N', 'K', { decimals: 3 }),
  f(12, 'startStockGross', 10, 78, 87, 'N', 'K', { decimals: 2 }),
  f(13, 'startStockNet', 10, 88, 97, 'N', 'K', { decimals: 2 }),
  f(14, 'endStockDate', 6, 98, 103, 'N', 'K', { kind: 'date' }),
  f(15, 'endStockQty', 11, 104, 114, 'N', 'K', { decimals: 3 }),
  f(16, 'endStockGross', 10, 115, 124, 'N', 'K', { decimals: 2 }),
  f(17, 'endStockNet', 10, 125, 134, 'N', 'K', { decimals: 2 }),
  f(18, 'hotWaterTemp', 4, 135, 138, 'N', 'K', { decimals: 2 }),
  f(19, 'hotWaterVolume', 9, 139, 147, 'N', 'K', { decimals: 3, note: 'm³' }),
  f(20, 'hotWaterPct', 4, 148, 151, 'N', 'K', { decimals: 2 }),
  f(21, 'hotWaterMeterStart', 9, 152, 160, 'N', 'K', { decimals: 3 }),
  f(22, 'hotWaterMeterEnd', 9, 161, 169, 'N', 'K', { decimals: 3 }),
  f(23, 'fuelSeq', 1, 170, 170, 'N', 'M', { note: '0 = kein Brennstoff, 1–9 lfd. Nr. Brennstoffart' }),
  f(24, 'heatingSupply1', 12, 171, 182, 'AN', 'K', { kind: 'period' }),
  f(25, 'heatingSupply2', 12, 183, 194, 'AN', 'K', { kind: 'period' }),
  f(26, 'hotWaterSupply1', 12, 195, 206, 'AN', 'K', { kind: 'period' }),
  f(27, 'hotWaterSupply2', 12, 207, 218, 'AN', 'K', { kind: 'period' }),
  f(28, 'meterType', 3, 219, 221, 'N', 'K', { kind: 'code', table: 'G', since: '03.07' }),
  f(29, 'meterUnit', 3, 222, 224, 'N', 'K', { kind: 'code', table: 'E', since: '03.07' }),
  f(30, 'meterNo', 20, 225, 244, 'AN', 'K', { since: '03.07' }),
  f(31, 'meterConsumption', 10, 245, 254, 'N', 'K', { decimals: 3, since: '03.07' }),
  f(32, 'meterStart', 10, 255, 264, 'N', 'K', { decimals: 3, since: '03.07' }),
  f(33, 'meterEnd', 10, 265, 274, 'N', 'K', { decimals: 3, since: '03.07' }),
  f(34, 'primaryEnergyFactor', 3, 275, 277, 'N', 'K', { decimals: 2, since: '03.08', note: 'Muss bei Fernwärme (Tabelle B 144–148)' }),
  f(35, 'filler', 746, 278, 1023, 'AN', 'K', { kind: 'filler' }),
  f(36, 'end', 1, 1024, 1024, 'AN', 'M', { kind: 'end' }),
];

function mixBlock(): FieldDef[] {
  const out: FieldDef[] = [];
  let no = 22;
  let pos = 155;
  for (let i = 1; i <= 6; i++) {
    out.push(f(no++, `mix${i}Carrier`, 2, pos, pos + 1, 'AN', 'K', { table: 'M', since: '03.10' }));
    pos += 2;
    out.push(f(no++, `mix${i}Pct`, 3, pos, pos + 2, 'N', 'K', { decimals: 1, since: '03.10' }));
    pos += 3;
    out.push(f(no++, `mix${i}Factor`, 9, pos, pos + 8, 'N', 'K', { decimalsBy: CO2_DEC, since: '03.10' }));
    pos += 9;
  }
  return out;
}

const K: FieldDef[] = [
  recordType(),
  version(),
  customerNo(),
  providerKey(),
  providerRef("9 Stellen Liegenschaftsnummer, 4 Stellen '0000'"),
  f(6, 'costKey', 3, 32, 34, 'N', 'M', { kind: 'code', table: 'K', note: 'ohne Schlüssel 200, 202' }),
  f(7, 'costLabel', 25, 35, 59, 'AN', 'K', { note: 'variabler Text, Muss bei Schlüssel 228, 242' }),
  f(8, 'costScope', 1, 60, 60, 'AN', 'M', { note: 'E Heizung/WW, H Heizung, W Warmwasser, K Kaltwasser, A Warm+Kalt, B weitere Betriebskosten' }),
  f(9, 'invoiceDate', 6, 61, 66, 'N', 'M', { kind: 'date' }),
  f(10, 'quantity', 11, 67, 77, 'N', 'K', { decimals: 3 }),
  f(11, 'gross', 10, 78, 87, 'N', 'K', { decimals: 2 }),
  f(12, 'net', 10, 88, 97, 'N', 'K', { decimals: 2 }),
  f(13, 'taxServiceKey', 2, 98, 99, 'N', 'M', { kind: 'code', table: 'L' }),
  f(14, 'laborAmount', 10, 100, 109, 'N', 'K', { decimals: 2, note: 'Muss bei Feld 13 = 11–13' }),
  f(15, 'fuelSeq', 1, 110, 110, 'N', 'M', { note: '0 = kein Brennstoff, 1–9 lfd. Nr. Brennstoffart' }),
  f(16, 'usageGroup', 4, 111, 114, 'AN', 'K', { since: '03.04' }),
  f(17, 'emissionKind', 2, 115, 116, 'AN', 'K', { since: '03.08', note: '01 = (6,3), 02 = (3,6) Stellen' }),
  f(18, 'co2Factor', 9, 117, 125, 'N', 'K', { decimalsBy: CO2_DEC, since: '03.08', note: 'kg/kWh' }),
  f(19, 'co2Kg', 9, 126, 134, 'N', 'K', { decimals: 3, since: '03.09' }),
  f(20, 'co2CostGross', 10, 135, 144, 'N', 'K', { decimals: 2, since: '03.09', note: 'in 03.09 „CO2-Kosten“ ohne brutto/netto' }),
  f(21, 'co2CostNet', 10, 145, 154, 'N', 'K', { decimals: 2, since: '03.10' }),
  ...mixBlock(),
  f(40, 'filler', 785, 239, 1023, 'AN', 'K', { kind: 'filler' }),
  f(41, 'end', 1, 1024, 1024, 'AN', 'M', { kind: 'end' }),
];

const D: FieldDef[] = [
  recordType(),
  version(),
  customerNo(),
  providerKey(),
  providerRef('9 Stellen Liegenschaftsnummer, 4 Stellen Wohnungsnummer'),
  clientRef(),
  f(7, 'periodEnd', 6, 52, 57, 'N', 'M', { kind: 'date', note: 'Letzter Tag des Nutzungszeitraumes' }),
  f(8, 'totalGross', 10, 58, 67, 'N', 'K', { decimals: 2, note: 'Gesamtkosten dieser Kostenart (Feld 17)' }),
  f(9, 'totalNet', 10, 68, 77, 'N', 'K', { decimals: 2 }),
  f(10, 'prepayGross', 10, 78, 87, 'N', 'K', { decimals: 2 }),
  f(11, 'prepayNet', 10, 88, 97, 'N', 'K', { decimals: 2 }),
  f(12, 'newMonthlyPrepayGross', 10, 98, 107, 'N', 'K', { decimals: 2 }),
  f(13, 'newMonthlyPrepayNet', 10, 108, 117, 'N', 'K', { decimals: 2 }),
  f(14, 'riskGross', 10, 118, 127, 'N', 'K', { decimals: 2, note: 'in Gesamtkosten brutto enthalten' }),
  f(15, 'balanceGross', 10, 128, 137, 'N', 'K', { decimals: 2, note: 'positiv = Nachzahlung' }),
  f(16, 'balanceNet', 10, 138, 147, 'N', 'K', { decimals: 2 }),
  f(17, 'costKey', 3, 148, 150, 'N', 'M', { kind: 'code', table: 'K' }),
  f(18, 'consumption', 9, 151, 159, 'N', 'K', { decimals: 3 }),
  f(19, 'consumptionUnitKey', 3, 160, 162, 'N', 'K', { kind: 'code', table: 'E' }),
  f(20, 'estimateFlag', 3, 163, 165, 'N', 'K', { kind: 'code', table: 'S' }),
  f(21, 'name1', 35, 166, 200, 'AN', 'K', { note: 'nur zur Information' }),
  f(22, 'currency', 3, 201, 203, 'AN', 'M'),
  f(23, 'co2AllocatedGross', 10, 204, 213, 'N', 'K', { decimals: 2, since: '03.10' }),
  f(24, 'co2AllocatedNet', 10, 214, 223, 'N', 'K', { decimals: 2, since: '03.10' }),
  f(25, 'co2NotAllocatedGross', 10, 224, 233, 'N', 'K', { decimals: 2, since: '03.10' }),
  f(26, 'co2NotAllocatedNet', 10, 234, 243, 'N', 'K', { decimals: 2, since: '03.10' }),
  f(27, 'co2TenantGross', 10, 244, 253, 'N', 'K', { decimals: 2, since: '03.10', note: 'nachrichtlich WEG/SEV' }),
  f(28, 'co2TenantNet', 10, 254, 263, 'N', 'K', { decimals: 2, since: '03.10' }),
  f(29, 'filler', 760, 264, 1023, 'AN', 'K', { kind: 'filler' }),
  f(30, 'end', 1, 1024, 1024, 'AN', 'M', { kind: 'end' }),
];

const E835: FieldDef[] = [
  recordType(4),
  f(2, 'seqNo', 7, 5, 11, 'N', 'K', { note: 'Satzfolgenummer' }),
  f(3, 'providerKey', 2, 12, 13, 'AN', 'K', { table: 'U' }),
  f(4, 'providerRefExt', 18, 14, 31, 'AN', 'M', { note: '9 Liegenschaft, 4 Nutzergruppe, 4 Nutzer, 1 Nutzer-Folge' }),
  f(5, 'clientRef', 20, 32, 51, 'AN', 'M'),
  f(6, 'billingSeq', 1, 52, 52, 'AN', 'K', { note: 'blank, 1 = 1. Zeitraum, 2 = 2. Zeitraum' }),
  f(7, 'costKey', 3, 53, 55, 'N', 'M', { kind: 'code', table: 'K' }),
  f(8, 'costLabel', 25, 56, 80, 'AN', 'K'),
  f(9, 'taxServiceKey', 2, 81, 82, 'N', 'M', { kind: 'code', table: 'L' }),
  f(10, 'invoiceGross', 10, 83, 92, 'N', 'M', { decimals: 2 }),
  f(11, 'userShare', 10, 93, 102, 'N', 'M', { decimals: 2 }),
  f(12, 'userPct', 5, 103, 107, 'N', 'M', { decimals: 2 }),
  f(13, 'laborAmount', 10, 108, 117, 'N', 'M', { decimals: 2 }),
  f(14, 'userLaborShare', 10, 118, 127, 'N', 'M', { decimals: 2 }),
  f(15, 'periodEnd', 6, 128, 133, 'N', 'M', { kind: 'date' }),
];

const E898: FieldDef[] = [
  recordType(4),
  f(2, 'seqNo', 7, 5, 11, 'N', 'K'),
  f(3, 'providerKey', 2, 12, 13, 'AN', 'K', { table: 'U' }),
  f(4, 'providerRefExt', 18, 14, 31, 'AN', 'M', { note: '9 Liegenschaft, 4 Nutzergruppe, 4 Nutzer, 1 Nutzer-Folge' }),
  f(5, 'clientRef', 20, 32, 51, 'AN', 'M'),
  f(6, 'billingSeq', 1, 52, 52, 'AN', 'K'),
  f(7, 'imagePath', 56, 53, 108, 'AN', 'M', { note: 'Pfad zur Bilddatei' }),
  f(8, 'pageNo', 3, 109, 111, 'N', 'M', { note: 'Singlepage 001, 002 …; Multipage (PDF) 000' }),
  f(9, 'periodEnd', 6, 112, 117, 'N', 'M', { kind: 'date' }),
  f(10, 'documentKind', 3, 118, 120, 'AN', 'K', { note: 'HKA, BKA, VDA' }),
];

const P: FieldDef[] = [
  recordType(),
  f(2, 'version', 5, 2, 6, 'AN', 'M', { kind: 'version', note: 'Version 03.09 bis 99.99' }),
  customerNo(),
  providerKey(),
  providerRef('9 Stellen Liegenschaftsnummer, 4 Stellen Wohnungsnummer'),
  clientRef(),
  f(7, 'periodEnd', 6, 52, 57, 'N', 'M', { kind: 'date' }),
  f(8, 'costKey', 3, 58, 60, 'N', 'K', { kind: 'code', table: 'K', note: '901, 902, 910, 911, 912' }),
  f(9, 'totalGross', 10, 61, 70, 'N', 'K', { decimals: 2 }),
  f(10, 'totalNet', 10, 71, 80, 'N', 'K', { decimals: 2 }),
  f(11, 'userShare', 10, 81, 90, 'N', 'K', { decimals: 2 }),
  f(12, 'userPct', 5, 91, 95, 'N', 'K', { decimals: 2 }),
];

export const FIELD_TABLES: Record<RecordType, FieldDef[]> = { A, L, M, B, K, D, E835, E898, P };

/** Satzlängen laut Abschnitt 2 „Dateinamen“ (ohne CR/LF). */
export const RECORD_LENGTHS: Record<RecordType, number> = {
  A: 128,
  L: 2048,
  M: 2048,
  B: 1024,
  K: 1024,
  D: 1024,
  E835: 133,
  E898: 120,
  P: 95,
};

/** Satzarten je Datei. */
export const FILE_RECORD_TYPES: Record<string, RecordType[]> = {
  DTA: ['A'],
  DTM: ['L', 'M'],
  DTK: ['B', 'K'],
  DTD: ['D'],
  DTE835: ['E835'],
  DTE898: ['E898'],
  DTP: ['P'],
};
