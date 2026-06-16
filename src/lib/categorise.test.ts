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

describe('guessAisle — unknown items fall to "other"', () => {
  it('returns "other" for a completely unrecognised item', () => {
    expect(guessAisle('Widget')).toBe('other');
    expect(guessAisle('Zorbatron 9000')).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(guessAisle('')).toBe('other');
  });

  it('uses the longest keyword match so "loo roll" beats "roll" (bakery→household)', () => {
    // "roll" is in bakery; "loo roll" is in household — longest wins
    expect(guessAisle('loo roll')).toBe('household');
  });

  it('correctly identifies each major aisle by a representative item', () => {
    expect(guessAisle('orange juice')).toBe('drinks');
    expect(guessAisle('frozen peas')).toBe('frozen');
    expect(guessAisle('tin of beans')).toBe('cupboard');
    expect(guessAisle('chocolate bar')).toBe('snacks');
    expect(guessAisle('nappy bag')).toBe('baby');
    expect(guessAisle('vitamin C')).toBe('health');
  });
});
