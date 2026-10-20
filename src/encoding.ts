// Zeichensätze ohne Node- oder DOM-APIs: ISO 8859-15 (Latin-9, Pflicht laut
// Standard), ISO 8859-1, Windows-1252 und UTF-8. Bewusst klein gehalten.

/** ISO 8859-15 weicht an acht Stellen von ISO 8859-1 ab. */
const LATIN9_DIFF: Record<number, number> = {
  0xa4: 0x20ac, // €
  0xa6: 0x0160, // Š
  0xa8: 0x0161, // š
  0xb4: 0x017d, // Ž
  0xb8: 0x017e, // ž
  0xbc: 0x0152, // Œ
  0xbd: 0x0153, // œ
  0xbe: 0x0178, // Ÿ
};
const LATIN9_REVERSE = new Map<number, number>(Object.entries(LATIN9_DIFF).map(([b, c]) => [c, Number(b)]));

/** Windows-1252 0x80–0x9F (undefinierte Stellen bleiben als C1-Steuerzeichen). */
const CP1252_HIGH: (number | null)[] = [
  0x20ac, null, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, null, 0x017d, null,
  null, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, null, 0x017e, 0x0178,
];

export function decodeLatin9(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += String.fromCharCode(LATIN9_DIFF[b] ?? b);
  }
  return out;
}

export function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

export function decodeCp1252(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b - 0x80] ?? b) : b);
  }
  return out;
}

/**
 * Kodiert nach ISO 8859-15. Nicht darstellbare Zeichen werden zu '?'
 * (jedes Zeichen ist genau ein Byte, damit stimmen die Feldlängen).
 */
export function encodeLatin9(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const mapped = LATIN9_REVERSE.get(c);
    if (mapped !== undefined) out[i] = mapped;
    else if (c < 0x100 && LATIN9_DIFF[c] === undefined) out[i] = c;
    else out[i] = 0x3f;
  }
  return out;
}

/** true, wenn das Zeichen in ISO 8859-15 darstellbar ist. */
export function isLatin9(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return LATIN9_REVERSE.has(c) || (c < 0x100 && LATIN9_DIFF[c] === undefined);
}

/**
 * Strenges UTF-8-Dekodieren. Liefert null, wenn die Bytes kein gültiges UTF-8 sind.
 */
export function decodeUtf8Strict(bytes: Uint8Array, start = 0): string | null {
  let out = '';
  let i = start;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i++;
      continue;
    }
    let need: number;
    let cp: number;
    let min: number;
    if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      cp = b & 0x1f;
      min = 0x80;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      cp = b & 0x0f;
      min = 0x800;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      cp = b & 0x07;
      min = 0x10000;
    } else return null;
    for (let k = 1; k <= need; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}

export function hasHighBytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) if (bytes[i]! >= 0x80) return true;
  return false;
}

export type TextEncodingName = 'utf-8' | 'utf-8-bom' | 'iso-8859-1' | 'iso-8859-15' | 'windows-1252';

/**
 * Erkennt den Zeichensatz einer Textdatei und dekodiert sie.
 * Reihenfolge: BOM → gültiges UTF-8 → Windows-1252 (Bytes 0x80–0x9F) →
 * ISO 8859-15 (Byte 0xA4, eher € als ¤) → ISO 8859-1.
 */
export function detectAndDecode(bytes: Uint8Array): { encoding: TextEncodingName; text: string } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = decodeUtf8Strict(bytes, 3);
    if (text !== null) return { encoding: 'utf-8-bom', text };
  }
  if (!hasHighBytes(bytes)) return { encoding: 'utf-8', text: decodeLatin1(bytes) };
  const utf8 = decodeUtf8Strict(bytes);
  if (utf8 !== null) return { encoding: 'utf-8', text: utf8 };
  let c1 = false;
  let a4 = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b >= 0x80 && b <= 0x9f) c1 = true;
    if (b === 0xa4) a4 = true;
  }
  if (c1) return { encoding: 'windows-1252', text: decodeCp1252(bytes) };
  if (a4) return { encoding: 'iso-8859-15', text: decodeLatin9(bytes) };
  return { encoding: 'iso-8859-1', text: decodeLatin1(bytes) };
}
