// Copyright 2026- At Day. All rights reserved.
// Schematic spots for the meeting window map (D15, slice 029): a deterministic offset per state
// and index inside a unit disc, never a position. The same numbers as core's `schematicOffset`
// on the phones, so the console and the apps draw the same picture for the same states.

import type { WindowMember, WindowMemberState } from '@voysemble/contracts';

/** Golden angle in radians: spreads spots evenly whatever the count. */
const GOLDEN = 2.399963;

export function schematicOffset(
  state: WindowMemberState,
  index: number,
): { dx: number; dy: number } {
  const angle = index * GOLDEN;
  let radius: number;
  switch (state) {
    case 'inside':
      radius = 0.25 + (0.5 * ((index * 7) % 10)) / 10;
      break;
    case 'uncertain':
      radius = 0.95;
      break;
    case 'stale':
      radius = 1.0;
      break;
    case 'outside':
      radius = 1.25 + 0.15 * ((index * 3) % 3);
      break;
    default:
      radius = 0;
  }
  if (radius === 0) return { dx: 0, dy: 0 }; // no signed zero from cos/sin
  return { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) };
}

export type SchematicMember = {
  id: string;
  name: string;
  state: WindowMemberState;
  dx: number;
  dy: number;
};

/** Wire members as drawable spots; opted-out members sit at the centre and are not drawn. */
export function schematicMembers(members: WindowMember[]): SchematicMember[] {
  return members.map((m, i) => ({
    id: m.participationId,
    name: m.displayName,
    state: m.state,
    ...schematicOffset(m.state, i),
  }));
}
