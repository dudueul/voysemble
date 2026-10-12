// Copyright 2026- At Day. All rights reserved.
// Facts (D18): the type comes from the magic bytes; JPEG loses APP1 (Exif) and APP13 and keeps
// APP0, the tables and the scan byte for byte; PNG loses eXIf and the text chunks and keeps IHDR,
// IDAT and IEND; WebP loses EXIF and XMP, clears their VP8X flags and rewrites the RIFF size;
// unknown bytes are refused.

import { describe, expect, it } from 'vitest';
import { sniffImageType, stripMetadata } from '../src/lib/image-strip';

const text = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const cat = (...parts: (Uint8Array | number[])[]) => {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
};
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

function jpegSegment(marker: number, payload: Uint8Array) {
  return cat([0xff, marker], u16be(payload.length + 2), payload);
}

function pngChunk(type: string, data: Uint8Array) {
  return cat(u32be(data.length), text(type), data, [0, 0, 0, 0]);
}

function webpChunk(type: string, data: Uint8Array) {
  const pad = data.length % 2 ? [0] : [];
  return cat(text(type), u32le(data.length), data, pad);
}

describe('image metadata stripping', () => {
  it('sniffs JPEG, PNG and WebP from the magic bytes and refuses the rest', () => {
    expect(sniffImageType(cat([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(cat([0x89], text('PNG'), [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(cat(text('RIFF'), u32le(4), text('WEBP')))).toBe('image/webp');
    expect(sniffImageType(text('GIF89a'))).toBeNull();
    expect(sniffImageType(text('<svg/>'))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });

  it('JPEG: drops Exif and IPTC, keeps JFIF, tables and the scan', () => {
    const app0 = jpegSegment(0xe0, text('JFIF\0'));
    const exif = jpegSegment(0xe1, cat(text('Exif\0\0'), text('GPS 37.5665 126.9780')));
    const iptc = jpegSegment(0xed, text('Photoshop 3.0'));
    const dqt = jpegSegment(0xdb, cat([0], new Uint8Array(64).fill(1)));
    const scan = cat([0xff, 0xda], u16be(8), [1, 1, 0, 0, 63, 0], [1, 2, 3, 0xff, 0x00, 4]);
    const eoi = cat([0xff, 0xd9]);
    const file = cat([0xff, 0xd8], app0, exif, dqt, iptc, scan, eoi);
    const out = stripMetadata(file, 'image/jpeg');
    expect(out).toEqual(cat([0xff, 0xd8], app0, dqt, scan, eoi));
    expect(Array.from(out).join(',')).not.toContain(Array.from(text('GPS')).join(','));
    // Idempotent and harmless on a file without metadata.
    expect(stripMetadata(out, 'image/jpeg')).toEqual(out);
  });

  it('PNG: drops eXIf and text chunks, keeps the image chunks', () => {
    const sig = cat([0x89], text('PNG'), [0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = pngChunk('IHDR', cat(u32be(1), u32be(1), [8, 2, 0, 0, 0]));
    const txt = pngChunk('tEXt', text('Comment\0voysemble-flag:nudity'));
    const exif = pngChunk('eXIf', text('II*\0 lat lon'));
    const itxt = pngChunk('iTXt', text('XML:com.adobe.xmp\0\0\0\0\0<x/>'));
    const idat = pngChunk('IDAT', cat([0x78, 0x9c, 1, 2, 3]));
    const iend = pngChunk('IEND', new Uint8Array(0));
    const file = cat(sig, ihdr, txt, exif, idat, itxt, iend);
    expect(stripMetadata(file, 'image/png')).toEqual(cat(sig, ihdr, idat, iend));
  });

  it('WebP: drops EXIF and XMP, clears the VP8X flags and fixes the RIFF size', () => {
    const vp8x = webpChunk('VP8X', cat([0x2c, 0, 0, 0], [0, 0, 0, 0, 0, 0]));
    const exif = webpChunk('EXIF', text('II*\0 lat lon'));
    const xmp = webpChunk('XMP ', text('<x:xmpmeta/>'));
    const vp8 = webpChunk('VP8 ', cat([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]));
    const body = cat(vp8x, exif, vp8, xmp);
    const file = cat(text('RIFF'), u32le(4 + body.length), text('WEBP'), body);
    const out = stripMetadata(file, 'image/webp');
    const keptVp8x = webpChunk('VP8X', cat([0x20, 0, 0, 0], [0, 0, 0, 0, 0, 0]));
    const expected = cat(
      text('RIFF'),
      u32le(4 + keptVp8x.length + vp8.length),
      text('WEBP'),
      keptVp8x,
      vp8,
    );
    expect(out).toEqual(expected);
  });
});
