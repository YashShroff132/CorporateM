/**
 * Mockup_Renderer — template selection and text-fit logic (Requirement 14).
 *
 * This module implements the *pure, testable* cores of the Mockup_Renderer:
 * - `selectTemplate` picks the Blank_Template whose garment + color match the
 *   request, or returns a no-matching-template error (Req 14.1, 14.7).
 * - `fitText` auto-fits a slogan into a print area by choosing the largest font
 *   size in the 12..144 pt range and inserting line breaks so the rendered text
 *   lies entirely within the print-area boundaries (Req 14.2, 14.3). When the
 *   text cannot fit even at 12 pt it returns a too-long error and produces no
 *   layout (Req 14.8).
 * - Layout presets provide at least two presets per Tier, including a monospace
 *   preset for the Operator Collection (Req 14.6).
 *
 * Preview generation and object-storage side effects (Req 14.4, 14.5, 14.9) are
 * intentionally NOT implemented here — they belong to the preview/storage step
 * (task 19.2). Keeping the fit algorithm free of I/O makes it deterministic and
 * property-testable.
 *
 * ## Units and the text-metrics model
 *
 * All geometry is expressed in *typographic points* so that the print-area
 * dimensions and the font size share one unit. Because a real font renderer is
 * not available in this pure layer, text width is estimated with a simple
 * per-glyph advance model: each glyph advances `charWidthRatio * fontSize`
 * points and each line occupies `lineHeightRatio * fontSize` points of height.
 * A monospace preset uses a wider, constant advance. This model is monotonic in
 * font size (smaller font never occupies more space), which lets the fitter
 * binary-search for the largest fitting size.
 */

import { type Result, ok, err } from '../lib/result';
import type { Tier } from './catalog';

// ---------------------------------------------------------------------------
// Geometry and layout types
// ---------------------------------------------------------------------------

/** A rectangle in typographic points. `x`/`y` default to 0 when omitted. */
export interface Rect {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

/** Horizontal alignment of composited text within the print area. */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * A layout preset describing the typographic treatment used to composite a
 * slogan. `charWidthRatio` and `lineHeightRatio` feed the text-metrics model.
 */
export interface LayoutPreset {
  id: string;
  /** CSS font-family stack applied when the mockup is finally rendered. */
  fontFamily: string;
  /** Whether this preset uses a fixed-pitch (monospace) font. */
  monospace: boolean;
  /** Average glyph advance as a fraction of the font size. */
  charWidthRatio: number;
  /** Line box height as a fraction of the font size. */
  lineHeightRatio: number;
  align: TextAlign;
}

/** The output of a successful auto-fit: font size, wrapped lines, and bounds. */
export interface TextLayout {
  /** Selected font size in points, always within FONT_SIZE_MIN..FONT_SIZE_MAX. */
  fontSize: number;
  /** The slogan split into lines that each fit within the print-area width. */
  lines: string[];
  /** Width of the widest rendered line, in points. */
  width: number;
  /** Total height of all rendered lines, in points. */
  height: number;
  /** The preset used to produce this layout. */
  preset: LayoutPreset;
}

/** A reusable garment mockup base with a defined print area (Req glossary). */
export interface BlankTemplate {
  id: string;
  garment: string;
  color: string;
  printArea: Rect;
  preset: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Discriminated error describing why a mockup operation was rejected. */
export type MockupError =
  | { readonly kind: 'NO_MATCHING_TEMPLATE'; readonly message: string }
  | { readonly kind: 'TEXT_TOO_LONG'; readonly message: string }
  | { readonly kind: 'EMPTY_TEXT'; readonly message: string }
  | { readonly kind: 'INVALID_PRINT_AREA'; readonly message: string };

// ---------------------------------------------------------------------------
// Constants (Requirement 14.3)
// ---------------------------------------------------------------------------

/** Minimum auto-fit font size in points (Req 14.3, 14.8). */
export const FONT_SIZE_MIN = 12;
/** Maximum auto-fit font size in points (Req 14.3). */
export const FONT_SIZE_MAX = 144;

// ---------------------------------------------------------------------------
// Layout presets (Requirement 14.6)
// ---------------------------------------------------------------------------

/**
 * The monospace preset used for the Operator Collection (Req 14.6). Exported so
 * the collection-aware selector and seed data can reference it by identity.
 */
export const OPERATOR_MONO_PRESET: LayoutPreset = {
  id: 'operator-mono',
  fontFamily: '"JetBrains Mono", "Courier New", monospace',
  monospace: true,
  // Monospace advances are wide and constant.
  charWidthRatio: 0.6,
  lineHeightRatio: 1.3,
  align: 'left',
};

/**
 * The default layout preset used when a caller does not supply one — the SAFE
 * "classic" preset. Exported as a definite {@link LayoutPreset} so it can serve
 * as a non-optional default parameter (see {@link fitText}).
 */
export const SAFE_CLASSIC_PRESET: LayoutPreset = {
  id: 'safe-classic',
  fontFamily: '"Inter", system-ui, sans-serif',
  monospace: false,
  charWidthRatio: 0.5,
  lineHeightRatio: 1.2,
  align: 'center',
};

/**
 * At least two layout presets per Tier (Req 14.6). Ratios differ per preset so
 * distinct tiers/presets wrap and size text differently.
 */
export const LAYOUT_PRESETS: Readonly<Record<Tier, readonly LayoutPreset[]>> = {
  SAFE: [
    SAFE_CLASSIC_PRESET,
    {
      id: 'safe-stacked',
      fontFamily: '"Inter", system-ui, sans-serif',
      monospace: false,
      charWidthRatio: 0.48,
      lineHeightRatio: 1.35,
      align: 'left',
    },
  ],
  DIRECT: [
    {
      id: 'direct-bold',
      fontFamily: '"Archivo", system-ui, sans-serif',
      monospace: false,
      charWidthRatio: 0.55,
      lineHeightRatio: 1.15,
      align: 'center',
    },
    {
      id: 'direct-condensed',
      fontFamily: '"Archivo Narrow", system-ui, sans-serif',
      monospace: false,
      charWidthRatio: 0.42,
      lineHeightRatio: 1.2,
      align: 'left',
    },
  ],
  VERY_DIRECT: [
    {
      id: 'very-direct-impact',
      fontFamily: '"Anton", Impact, sans-serif',
      monospace: false,
      charWidthRatio: 0.52,
      lineHeightRatio: 1.1,
      align: 'center',
    },
    {
      id: 'very-direct-slab',
      fontFamily: '"Zilla Slab", serif',
      monospace: false,
      charWidthRatio: 0.56,
      lineHeightRatio: 1.25,
      align: 'left',
    },
  ],
};

/**
 * The layout presets available for a Tier — always at least two (Req 14.6).
 */
export function presetsForTier(tier: Tier): readonly LayoutPreset[] {
  return LAYOUT_PRESETS[tier];
}

/**
 * The layout presets available for a product given its Tier and Collection.
 * The Operator Collection additionally offers the monospace preset (Req 14.6).
 *
 * @param collectionSlug case-insensitive collection slug (e.g. "operator").
 */
export function presetsForCollection(
  collectionSlug: string,
  tier: Tier,
): readonly LayoutPreset[] {
  const tierPresets = presetsForTier(tier);
  if (collectionSlug.trim().toLowerCase() === 'operator') {
    return [OPERATOR_MONO_PRESET, ...tierPresets];
  }
  return tierPresets;
}

// ---------------------------------------------------------------------------
// Template selection (Requirement 14.1, 14.7)
// ---------------------------------------------------------------------------

/**
 * Select the Blank_Template whose garment and color match the request
 * (case-insensitive, whitespace-trimmed). Returns a NO_MATCHING_TEMPLATE error
 * when none matches, so the caller renders no mockup (Req 14.1, 14.7).
 *
 * When a `preset` is supplied, the match is further constrained to that preset.
 */
export function selectTemplate(
  templates: readonly BlankTemplate[],
  garment: string,
  color: string,
  preset?: string,
): Result<BlankTemplate, MockupError> {
  const wantGarment = garment.trim().toLowerCase();
  const wantColor = color.trim().toLowerCase();
  const wantPreset = preset?.trim().toLowerCase();

  const match = templates.find(
    (t) =>
      t.garment.trim().toLowerCase() === wantGarment &&
      t.color.trim().toLowerCase() === wantColor &&
      (wantPreset === undefined || t.preset.trim().toLowerCase() === wantPreset),
  );

  if (!match) {
    const presetSuffix = preset ? `, preset "${preset}"` : '';
    return err({
      kind: 'NO_MATCHING_TEMPLATE',
      message: `No blank template available for garment "${garment}", color "${color}"${presetSuffix}`,
    });
  }
  return ok(match);
}

// ---------------------------------------------------------------------------
// Text-metrics model and word wrapping
// ---------------------------------------------------------------------------

/** Estimated advance width (points) of `text` at `fontSize` under `preset`. */
function measureWidth(
  text: string,
  fontSize: number,
  preset: LayoutPreset,
): number {
  return text.length * preset.charWidthRatio * fontSize;
}

/** Height (points) of a line box at `fontSize` under `preset`. */
function lineHeight(fontSize: number, preset: LayoutPreset): number {
  return fontSize * preset.lineHeightRatio;
}

/**
 * Greedily wrap `words` into lines no wider than `maxWidth` at `fontSize`.
 * Returns `null` when a single word is wider than `maxWidth` (words are never
 * split mid-word), signalling that this font size does not fit.
 */
function wrapWords(
  words: readonly string[],
  fontSize: number,
  preset: LayoutPreset,
  maxWidth: number,
): string[] | null {
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    // A single word that cannot fit on an empty line means this size fails.
    if (measureWidth(word, fontSize, preset) > maxWidth) {
      return null;
    }
    const candidate = current === '' ? word : `${current} ${word}`;
    if (measureWidth(candidate, fontSize, preset) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') {
    lines.push(current);
  }
  return lines;
}

/**
 * Attempt to lay the words out at exactly `fontSize`. Succeeds only when every
 * line fits the width and the stacked lines fit the height of the print area.
 */
function layoutAt(
  words: readonly string[],
  fontSize: number,
  preset: LayoutPreset,
  printArea: Rect,
): TextLayout | null {
  const lines = wrapWords(words, fontSize, preset, printArea.width);
  if (lines === null) return null;

  const totalHeight = lines.length * lineHeight(fontSize, preset);
  if (totalHeight > printArea.height) return null;

  const width = lines.reduce(
    (max, line) => Math.max(max, measureWidth(line, fontSize, preset)),
    0,
  );

  return { fontSize, lines, width, height: totalHeight, preset };
}

// ---------------------------------------------------------------------------
// Auto-fit (Requirement 14.2, 14.3, 14.8)
// ---------------------------------------------------------------------------

/**
 * Auto-fit `text` into `printArea` by selecting the largest font size in
 * FONT_SIZE_MIN..FONT_SIZE_MAX for which the wrapped text fits entirely within
 * the print-area boundaries (Req 14.2, 14.3).
 *
 * Because the text-metrics model is monotonic in font size, the set of fitting
 * sizes is a prefix `[12..best]`; the largest fitting size is found with a
 * binary search. When the text cannot fit even at FONT_SIZE_MIN (12 pt), no
 * layout is produced and a TEXT_TOO_LONG error is returned (Req 14.8).
 *
 * @param preset optional layout preset; defaults to the SAFE classic preset.
 */
export function fitText(
  text: string,
  printArea: Rect,
  preset: LayoutPreset = SAFE_CLASSIC_PRESET,
): Result<TextLayout, MockupError> {
  if (printArea.width <= 0 || printArea.height <= 0) {
    return err({
      kind: 'INVALID_PRINT_AREA',
      message: `Print area must have positive width and height, received ${printArea.width}x${printArea.height}`,
    });
  }

  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return err({ kind: 'EMPTY_TEXT', message: 'Slogan text is empty' });
  }

  // Binary search for the largest fitting integer font size in [min, max].
  let lo = FONT_SIZE_MIN;
  let hi = FONT_SIZE_MAX;
  let best: TextLayout | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const layout = layoutAt(words, mid, preset, printArea);
    if (layout) {
      best = layout;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === null) {
    return err({
      kind: 'TEXT_TOO_LONG',
      message: `Slogan does not fit within the print area at the minimum ${FONT_SIZE_MIN}pt font size`,
    });
  }
  return ok(best);
}

// ---------------------------------------------------------------------------
// Service surface
// ---------------------------------------------------------------------------

/**
 * The pure portion of the Mockup_Renderer available at this step. Preview
 * rendering + storage (`render`) is added in task 19.2.
 */
export interface Mockup_Renderer {
  selectTemplate(
    templates: readonly BlankTemplate[],
    garment: string,
    color: string,
    preset?: string,
  ): Result<BlankTemplate, MockupError>;
  fitText(
    text: string,
    printArea: Rect,
    preset?: LayoutPreset,
  ): Result<TextLayout, MockupError>;
  presetsForTier(tier: Tier): readonly LayoutPreset[];
  presetsForCollection(
    collectionSlug: string,
    tier: Tier,
  ): readonly LayoutPreset[];
}

/** Create a Mockup_Renderer exposing the pure selection/fit logic. */
export function createMockupRenderer(): Mockup_Renderer {
  return {
    selectTemplate,
    fitText,
    presetsForTier,
    presetsForCollection,
  };
}
