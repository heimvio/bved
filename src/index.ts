// @heimvio/bved — Dateistandard bved 3.10 (ehem. ARGE HeiWaKo) und CSV-Stammdaten.

export type {
  Severity,
  SourceRef,
  Finding,
  RecordType,
  FileKind,
  FieldValue,
  BvedRecord,
  ParsedBvedFile,
  FieldDef,
  CodeTable,
} from './types.js';
export { FIELD_TABLES, RECORD_LENGTHS, FILE_RECORD_TYPES } from './fields.js';
export { TABLES, canonicalCode, codeLabel } from './tables.js';
export {
  STANDARD_VERSION,
  BvedFormatError,
  BvedWriteError,
  parseBvedFile,
  writeBvedFile,
  bvedFileName,
  parseBvedFileName,
  isBvedFileName,
  parseBvedRecord,
  writeBvedRecord,
  versionNumber,
} from './codec.js';
export type {
  MasterDataBundle,
  BundleFile,
  BundleProperty,
  BundleUnit,
  BundleOccupancy,
  BundleFuel,
  BundleCost,
  ShareCategory,
} from './bundle.js';
export { bundleFromBved, mergeBundles, emptyBundle, deriveVatRate } from './bundle.js';
export type { OutboundData, OutboundUser, OutboundLine, OutboundS35a, OutboundDocument } from './outbound.js';
export { buildOutbound } from './outbound.js';
export { zipFiles, unzipFiles } from './zip.js';
export type { TargetField, CsvMapping, CsvPreset } from './csv/presets.js';
export { CSV_PRESETS, TARGET_FIELDS } from './csv/presets.js';
export type { CsvFileInfo } from './csv/index.js';
export { inspectCsv, bundleFromCsv } from './csv/index.js';
export { gnum, gdate } from './csv/parse.js';
export { detectAndDecode, decodeLatin9, encodeLatin9 } from './encoding.js';
export type { TextEncodingName } from './encoding.js';
export { sha256Hex } from './sha256.js';
