// Copyright 2026- At Day. All rights reserved.
//
// Image metadata stripping (D18: EXIF location never reaches storage). The three formats the
// phones and browsers produce are handled structurally, without decoding pixels: JPEG drops the
// APP1 (Exif, XMP) and APP13 (IPTC) segments; PNG drops eXIf and the text chunks; WebP drops the
// EXIF and XMP chunks and clears their flags. Anything else is refused by `sniffImageType`.
// Pixels are untouched, so a stripped file decodes exactly as the original did.

import type { PhotoContentType } from '@voysemble/contracts';

/** The type from the magic bytes, never from the client's claim. */
export function sniffImageType(bytes: Uint8Array): PhotoContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

export function stripMetadata(bytes: Uint8Array, type: PhotoContentType): Uint8Array {
  if (type === 'image/jpeg') return stripJpeg(bytes);
  if (type === 'image/png') return stripPng(bytes);
  return stripWebp(bytes);
}

/** JPEG segments APP1 (0xE1: Exif and XMP) and APP13 (0xED: IPTC) go; copying stops at SOS. */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // SOS: the scan runs to the end; EOI.
    const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    const end = i + 2 + length;
    if (marker !== 0xe1 && marker !== 0xed) out.push(bytes.subarray(i, end));
    i = end;
  }
  out.push(bytes.subarray(i));
  return concat(out);
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/** PNG chunks are length, type, data, crc; the dropped ones carry no pixels. */
function stripPng(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = readU32be(bytes, i);
    const type = ascii(bytes, i + 4, i + 8);
    const end = i + 12 + length;
    if (!PNG_DROP.has(type)) out.push(bytes.subarray(i, Math.min(end, bytes.length)));
    i = end;
    if (type === 'IEND') break;
  }
  return concat(out);
}

/** WebP RIFF chunks EXIF and "XMP " go; the VP8X flags lose their bits; the RIFF size follows. */
function stripWebp(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, i + 4);
    const length = readU32le(bytes, i + 4);
    const padded = length + (length % 2);
    const end = Math.min(i + 8 + padded, bytes.length);
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = new Uint8Array(bytes.subarray(i, end));
      if (type === 'VP8X' && chunk.length >= 9) chunk[8] = (chunk[8] ?? 0) & ~0x0c; // EXIF, XMP flags
      chunks.push(chunk);
    }
    i = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  writeU32le(header, 4, 4 + body.length);
  return concat([header, body]);
}

function readU32be(b: Uint8Array, i: number): number {
  return (
    (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0
  );
}

function readU32le(b: Uint8Array, i: number): number {
  return (
    (((b[i + 3] ?? 0) << 24) | ((b[i + 2] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i] ?? 0)) >>> 0
  );
}

function writeU32le(b: Uint8Array, i: number, v: number): void {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
  b[i + 2] = (v >>> 16) & 0xff;
  b[i + 3] = (v >>> 24) & 0xff;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
