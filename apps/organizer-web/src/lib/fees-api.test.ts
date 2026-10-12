// Copyright 2026- At Day. All rights reserved.
// Facts: money renders in the currency's own format from minor units, parses what an organizer
// types (separators and symbols ignored, nothing negative), and round-trips through an input.

import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney, toMajor } from './fees-api';

describe('money helpers', () => {
  it('formats minor units per currency', () => {
    expect(formatMoney(450_000, 'KRW')).toBe('₩450,000');
    expect(formatMoney(12_050, 'USD')).toBe('$12,050.00'.replace('12,050.00', '120.50'));
    expect(formatMoney(0, 'EUR')).toBe('€0.00');
    expect(formatMoney(1_500, 'JPY')).toBe('¥1,500');
  });

  it('parses typed amounts and rejects garbage', () => {
    expect(parseMoney('450,000', 'KRW')).toBe(450_000);
    expect(parseMoney('₩450000', 'KRW')).toBe(450_000);
    expect(parseMoney('120.50', 'USD')).toBe(12_050);
    expect(parseMoney('-1', 'KRW')).toBeNull();
    expect(parseMoney('', 'KRW')).toBeNull();
  });

  it('gives inputs a major-unit value', () => {
    expect(toMajor(450_000, 'KRW')).toBe('450000');
    expect(toMajor(12_050, 'USD')).toBe('120.50');
  });
});
