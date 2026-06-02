import { describe, it, expect } from 'vitest';
import { guessAisle, normaliseName } from './categorise';

describe('guessAisle', () => {
  it('maps common items to the right aisle', () => {
    expect(guessAisle('Milk')).toBe('dairy');
    expect(guessAisle('Bananas')).toBe('produce');
    expect(guessAisle('Sourdough bread')).toBe('bakery');
    expect(guessAisle('Chicken breasts')).toBe('meat');
    expect(guessAisle('Loo roll')).toBe('household');
  });

  it('falls back to "other" when unknown', () => {
    expect(guessAisle('Widget')).toBe('other');
    expect(guessAisle('')).toBe('other');
  });
});

describe('normaliseName', () => {
  it('lowercases, trims and collapses whitespace for dedupe', () => {
    expect(normaliseName('  Oat   Milk ')).toBe('oat milk');
    expect(normaliseName('MILK')).toBe('milk');
  });
});
