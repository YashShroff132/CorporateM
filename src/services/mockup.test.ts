/**
 * Unit tests for the Mockup_Renderer template selection and text-fit logic
 * (Requirement 14.1, 14.2, 14.3, 14.6, 14.7, 14.8).
 */

import { describe, it, expect } from 'vitest';
import {
  selectTemplate,
  fitText,
  presetsForTier,
  presetsForCollection,
  OPERATOR_MONO_PRESET,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  LAYOUT_PRESETS,
  type BlankTemplate,
} from './mockup';
import { isOk, isErr } from '../lib/result';
import type { Tier } from './catalog';

const TIERS: Tier[] = ['SAFE', 'DIRECT', 'VERY_DIRECT'];

const templates: BlankTemplate[] = [
  {
    id: 't1',
    garment: 'tee',
    color: 'black',
    printArea: { width: 300, height: 400 },
    preset: 'default',
  },
  {
    id: 't2',
    garment: 'tee',
    color: 'white',
    printArea: { width: 300, height: 400 },
    preset: 'default',
  },
  {
    id: 't3',
    garment: 'hoodie',
    color: 'black',
    printArea: { width: 250, height: 350 },
    preset: 'chest',
  },
];

describe('selectTemplate (Req 14.1, 14.7)', () => {
  it('selects the template matching garment and color', () => {
    const result = selectTemplate(templates, 'tee', 'black');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.id).toBe('t1');
  });

  it('matches case-insensitively and trims whitespace', () => {
    const result = selectTemplate(templates, '  TEE ', 'White');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.id).toBe('t2');
  });

  it('can further constrain the match by preset', () => {
    const result = selectTemplate(templates, 'hoodie', 'black', 'chest');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.id).toBe('t3');
  });

  it('returns NO_MATCHING_TEMPLATE when no garment/color matches', () => {
    const result = selectTemplate(templates, 'tee', 'green');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('NO_MATCHING_TEMPLATE');
  });

  it('returns NO_MATCHING_TEMPLATE when the preset does not match', () => {
    const result = selectTemplate(templates, 'tee', 'black', 'chest');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('NO_MATCHING_TEMPLATE');
  });
});

describe('fitText (Req 14.2, 14.3, 14.8)', () => {
  const printArea = { width: 300, height: 400 };

  it('selects a font size within 12..144 and lines that fit the width', () => {
    const result = fitText('Reply All Energy', printArea);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const { fontSize, lines, width, preset } = result.value;
      expect(fontSize).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
      expect(fontSize).toBeLessThanOrEqual(FONT_SIZE_MAX);
      // Every line stays within the print-area width.
      expect(width).toBeLessThanOrEqual(printArea.width);
      for (const line of lines) {
        const lineWidth = line.length * preset.charWidthRatio * fontSize;
        expect(lineWidth).toBeLessThanOrEqual(printArea.width + 1e-9);
      }
    }
  });

  it('keeps the composited text height within the print area', () => {
    const result = fitText('Notice period energy activated today', printArea);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.height).toBeLessThanOrEqual(printArea.height + 1e-9);
    }
  });

  it('inserts line breaks so long slogans wrap onto multiple lines', () => {
    const narrow = { width: 120, height: 600 };
    const result = fitText('one two three four five six', narrow);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.lines.length).toBeGreaterThan(1);
  });

  it('prefers the largest fitting font size (bigger area -> bigger font)', () => {
    const small = fitText('Hi', { width: 100, height: 100 });
    const large = fitText('Hi', { width: 1000, height: 1000 });
    expect(isOk(small)).toBe(true);
    expect(isOk(large)).toBe(true);
    if (isOk(small) && isOk(large)) {
      expect(large.value.fontSize).toBeGreaterThanOrEqual(small.value.fontSize);
    }
  });

  it('returns TEXT_TOO_LONG when a single word cannot fit at 12pt', () => {
    // A very long unbreakable word in a tiny area cannot fit even at 12pt.
    const result = fitText('supercalifragilisticexpialidocious', {
      width: 10,
      height: 400,
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('TEXT_TOO_LONG');
  });

  it('returns TEXT_TOO_LONG when too many lines are needed for the height', () => {
    const result = fitText('a b c d e f g h i j k', { width: 30, height: 20 });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('TEXT_TOO_LONG');
  });

  it('rejects empty slogan text', () => {
    const result = fitText('   ', printArea);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('EMPTY_TEXT');
  });

  it('rejects a non-positive print area', () => {
    const result = fitText('Hello', { width: 0, height: 400 });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('INVALID_PRINT_AREA');
  });

  it('uses the provided preset', () => {
    const result = fitText('Operator mode', { width: 400, height: 400 }, OPERATOR_MONO_PRESET);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.preset.id).toBe('operator-mono');
  });
});

describe('layout presets (Req 14.6)', () => {
  it('provides at least two presets per tier', () => {
    for (const tier of TIERS) {
      expect(presetsForTier(tier).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every tier preset id is unique within the tier', () => {
    for (const tier of TIERS) {
      const ids = LAYOUT_PRESETS[tier].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('exposes a monospace preset for the Operator collection', () => {
    const presets = presetsForCollection('operator', 'DIRECT');
    expect(presets.some((p) => p.monospace)).toBe(true);
    expect(presets).toContain(OPERATOR_MONO_PRESET);
  });

  it('is case-insensitive for the Operator collection slug', () => {
    const presets = presetsForCollection('  Operator ', 'SAFE');
    expect(presets[0]).toBe(OPERATOR_MONO_PRESET);
  });

  it('does not add the monospace preset for non-Operator collections', () => {
    const presets = presetsForCollection('wfh-vs-wfo', 'SAFE');
    expect(presets).not.toContain(OPERATOR_MONO_PRESET);
    expect(presets.length).toBeGreaterThanOrEqual(2);
  });
});
