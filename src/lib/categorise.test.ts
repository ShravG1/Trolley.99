import { describe, it, expect } from 'vitest';
import { guessAisle, normaliseName, resolveAisle } from './categorise';

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

describe('resolveAisle — learned memory beats the keyword guess (0016)', () => {
  it('falls back to the keyword guess with no memory at all', () => {
    expect(resolveAisle('Milk')).toBe('dairy');
    expect(resolveAisle('Milk', null)).toBe('dairy');
    expect(resolveAisle('Milk', {})).toBe('dairy');
  });

  it('uses what the household taught it, overruling the guess', () => {
    // "Ice cream" keyword-guesses frozen; this household files it under snacks.
    expect(guessAisle('Ice cream')).toBe('frozen');
    expect(resolveAisle('Ice cream', { 'ice cream': 'snacks' })).toBe('snacks');
  });

  it('rescues names the keyword list has never heard of', () => {
    expect(guessAisle('Oatly')).toBe('other');
    expect(resolveAisle('Oatly', { oatly: 'dairy' })).toBe('dairy');
  });

  it('matches on the normalised name, so casing and spacing do not matter', () => {
    const memory = { 'oat milk': 'dairy' } as const;
    expect(resolveAisle('  Oat   Milk ', memory)).toBe('dairy');
    expect(resolveAisle('OAT MILK', memory)).toBe('dairy');
  });

  it('ignores a memory entry with an unknown aisle key', () => {
    // Memory can come from localStorage, which the user can edit.
    expect(resolveAisle('Milk', { milk: 'made-up' } as never)).toBe('dairy');
  });

  it('is not fooled by inherited object properties', () => {
    expect(resolveAisle('constructor', {})).toBe('other');
    expect(resolveAisle('toString', {})).toBe('other');
  });

  it('returns "other" for an empty name', () => {
    expect(resolveAisle('   ', { '': 'dairy' } as never)).toBe('other');
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
