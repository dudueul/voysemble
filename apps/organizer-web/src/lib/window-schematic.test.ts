// Copyright 2026- At Day. All rights reserved.
// Facts: inside spots stay inside the disc, outside spots beyond it, opted-out at the centre; the
// numbers match core's schematicOffset (same constants) so the console and the phones agree.

import { describe, expect, it } from 'vitest';
import { schematicMembers, schematicOffset } from './window-schematic';

describe('window schematic', () => {
  it('keeps inside spots inside and outside spots beyond the rim', () => {
    for (let i = 0; i < 12; i += 1) {
      const inside = schematicOffset('inside', i);
      expect(Math.hypot(inside.dx, inside.dy)).toBeLessThan(0.8);
      const outside = schematicOffset('outside', i);
      expect(Math.hypot(outside.dx, outside.dy)).toBeGreaterThan(1.2);
      expect(
        Math.hypot(schematicOffset('uncertain', i).dx, schematicOffset('uncertain', i).dy),
      ).toBeCloseTo(0.95, 5);
    }
    expect(schematicOffset('opted_out', 3)).toEqual({ dx: 0, dy: 0 });
  });

  it('matches the core constants for a known index', () => {
    // index 1, inside: radius 0.25 + 0.5 * 0.7 = 0.6 at the golden angle.
    const p = schematicOffset('inside', 1);
    expect(p.dx).toBeCloseTo(0.6 * Math.cos(2.399963), 6);
    expect(p.dy).toBeCloseTo(0.6 * Math.sin(2.399963), 6);
  });

  it('maps wire members to spots by their order', () => {
    const spots = schematicMembers([
      {
        participationId: 'a',
        displayName: 'A',
        groupName: null,
        state: 'inside',
        reportedAt: null,
      },
      {
        participationId: 'b',
        displayName: 'B',
        groupName: 'Bus A',
        state: 'opted_out',
        reportedAt: null,
      },
    ]);
    expect(spots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(spots[1]).toMatchObject({ dx: 0, dy: 0, state: 'opted_out', name: 'B' });
  });
});
