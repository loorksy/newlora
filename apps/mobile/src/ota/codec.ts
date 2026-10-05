export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0) || 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return decodeURIComponent(
    Array.from(bytes, byte => '%' + byte.toString(16).padStart(2, '0')).join(''),
  );
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }
  return out;
}

export function fromBase64(value: string): Uint8Array | null {
  const cleaned = value.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (cleaned.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(cleaned)) return null;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = alphabet.indexOf(cleaned[i]);
    const b = alphabet.indexOf(cleaned[i + 1] || 'A');
    const c = alphabet.indexOf(cleaned[i + 2] || 'A');
    const d = alphabet.indexOf(cleaned[i + 3] || 'A');
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    out.push((triple >> 16) & 255);
    if (i + 2 < cleaned.length) out.push((triple >> 8) & 255);
    if (i + 3 < cleaned.length) out.push(triple & 255);
  }
  return Uint8Array.from(out);
}
