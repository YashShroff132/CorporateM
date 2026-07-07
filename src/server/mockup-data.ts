/**
 * Mockup preview rendering + storage (task 19.2, Req 14.4, 14.5, 14.9).
 *
 * Composes the pure {@link TextLayout} produced by the Mockup_Renderer into a
 * self-contained SVG preview (≥1000px on its longest edge, Req 14.4), records a
 * placeholder reference for the future hi-res print-ready file (Req 14.4), and
 * stores the preview to object storage when configured — recording the public
 * URL on the associated Design and Product (Req 14.5).
 *
 * Storage uses a generic HTTP scheme (no AWS SDK): when an upload base URL is
 * configured the preview is PUT there via `fetch`; the object is then served
 * from `R2_PUBLIC_BASE_URL`. When storage is unconfigured the preview degrades
 * to an inline `data:` URL placeholder with a note, so the pipeline still works
 * locally and the build never requires storage credentials.
 *
 * If a configured upload FAILS, no URL is recorded on the Design/Product and an
 * error is returned (Req 14.9).
 */

import { type Result, ok, err } from '@/lib/result';
import type { TextLayout } from '@/services/mockup';

/** Minimum longest-edge size for the web preview image (Req 14.4). */
export const PREVIEW_MIN_LONGEST_EDGE_PX = 1000;

/** Discriminated error describing why preview generation/storage failed. */
export type MockupPreviewError =
  | { readonly kind: 'STORAGE_FAILED'; readonly message: string }
  | { readonly kind: 'RENDER_FAILED'; readonly message: string };

/** Object-storage configuration resolved from the environment (Req 14.5). */
export interface StorageConfig {
  /** Public base URL objects are served from (no trailing slash required). */
  readonly publicBaseUrl: string;
  /** Base URL to HTTP PUT the object to; defaults to the public base URL. */
  readonly uploadBaseUrl: string;
  /** Optional bearer token sent as Authorization on the PUT. */
  readonly uploadToken?: string;
}

/** Resolve storage config from env; returns null when storage is unconfigured. */
export function resolveStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): StorageConfig | null {
  const publicBaseUrl = (env.R2_PUBLIC_BASE_URL ?? '').trim();
  if (publicBaseUrl.length === 0) return null;
  const uploadBaseUrl = (env.R2_UPLOAD_BASE_URL ?? '').trim();
  const uploadToken = (env.R2_UPLOAD_TOKEN ?? '').trim();
  return {
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
    uploadBaseUrl: (uploadBaseUrl.length > 0 ? uploadBaseUrl : publicBaseUrl).replace(
      /\/+$/,
      '',
    ),
    uploadToken: uploadToken.length > 0 ? uploadToken : undefined,
  };
}

/** Escape text for safe inclusion in SVG/XML content. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Compose an SVG preview string from a rendered {@link TextLayout}. Pure and
 * deterministic. The canvas is scaled so its longest edge is at least
 * {@link PREVIEW_MIN_LONGEST_EDGE_PX} (Req 14.4).
 *
 * Renders a self-contained, premium-looking oversized t-shirt mockup with the
 * slogan overlaid on the chest area. Uses SVG gradients and shadows for a
 * studio-quality appearance. No external resources — works as a data: URL.
 */
export function composePreviewSvg(
  layout: TextLayout,
  options: { garment: string; color: string } = { garment: 'tee', color: '#111111' },
): string {
  const width = 1000;
  const height = 1200;

  const colorLower = options.color.toLowerCase();
  const isWhiteShirt =
    colorLower.includes('white') ||
    colorLower.includes('#fff') ||
    colorLower.includes('#f5f5f5') ||
    colorLower.includes('#fafafa');

  // Color palette
  const shirtFill = isWhiteShirt ? '#f0f0f0' : '#1c1c1c';
  const shirtHighlight = isWhiteShirt ? '#fafafa' : '#2a2a2a';
  const shirtShadow = isWhiteShirt ? '#d5d5d5' : '#0f0f0f';
  const textColor = isWhiteShirt ? '#111111' : '#f5f5f5';
  const bgOuter = isWhiteShirt ? '#b0b0b0' : '#080808';
  const bgInner = isWhiteShirt ? '#d8d8d8' : '#1a1a1a';
  const strokeColor = isWhiteShirt ? '#c8c8c8' : '#2f2f2f';

  // Realistic oversized t-shirt silhouette (dropped shoulders, wide body)
  const tshirtPath = [
    // Start at left shoulder
    'M 340 220',
    // Left shoulder slope (dropped/oversized)
    'L 170 290',
    // Left sleeve outer curve
    'Q 100 320 80 430',
    // Left sleeve bottom
    'Q 90 470 160 480',
    // Left armpit curve
    'Q 230 490 260 370',
    // Left body side (slight curve for fabric drape)
    'Q 250 650 260 980',
    // Bottom hem left curve
    'Q 265 1020 320 1020',
    // Bottom hem
    'L 680 1020',
    // Bottom hem right curve
    'Q 735 1020 740 980',
    // Right body side
    'Q 750 650 740 370',
    // Right armpit curve
    'Q 770 490 840 480',
    // Right sleeve bottom
    'Q 910 470 920 430',
    // Right sleeve outer curve
    'Q 900 320 830 290',
    // Right shoulder
    'L 660 220',
    // Neckline (crew neck curve)
    'Q 580 175 500 170',
    'Q 420 175 340 220',
    'Z',
  ].join(' ');

  // Neckline ribbing detail
  const neckPath = [
    'M 370 225',
    'Q 420 190 500 185',
    'Q 580 190 630 225',
    'Q 580 205 500 200',
    'Q 420 205 370 225',
    'Z',
  ].join(' ');

  // Fabric fold lines for realism
  const foldLines = [
    // Center chest fold
    `<line x1="500" y1="280" x2="498" y2="850" stroke="${strokeColor}" stroke-width="0.8" opacity="0.3"/>`,
    // Left body fold
    `<line x1="360" y1="400" x2="350" y2="900" stroke="${strokeColor}" stroke-width="0.6" opacity="0.2"/>`,
    // Right body fold
    `<line x1="640" y1="400" x2="650" y2="900" stroke="${strokeColor}" stroke-width="0.6" opacity="0.2"/>`,
  ].join('');

  // Print area for text: centered chest region
  const printCenterX = width / 2;
  const printTop = 350;
  const printAreaHeight = 350;
  const printWidth = 380;

  const anchor =
    layout.preset.align === 'center'
      ? 'middle'
      : layout.preset.align === 'right'
        ? 'end'
        : 'start';

  // Scale font so text block fits within the print area width
  const maxLineChars = Math.max(...layout.lines.map((l) => l.length), 1);
  const naturalWidth = maxLineChars * layout.preset.charWidthRatio * layout.fontSize;
  const scaleFactor = naturalWidth > printWidth ? printWidth / naturalWidth : 1;
  const fontSize = Math.min(layout.fontSize * scaleFactor, 56);
  const lineStep = fontSize * layout.preset.lineHeightRatio;

  const xPos =
    anchor === 'middle'
      ? printCenterX
      : anchor === 'end'
        ? printCenterX + printWidth / 2
        : printCenterX - printWidth / 2;

  const blockHeight = lineStep * layout.lines.length;
  const startY = printTop + (printAreaHeight - blockHeight) / 2 + fontSize * 0.75;

  const textElements = layout.lines
    .map((line, i) => {
      const y = startY + i * lineStep;
      return `<text x="${xPos.toFixed(1)}" y="${y.toFixed(1)}" font-family='${escapeXml(
        layout.preset.fontFamily,
      )}' font-size="${fontSize.toFixed(1)}" font-weight="bold" fill="${textColor}" text-anchor="${anchor}" letter-spacing="1">${escapeXml(
        line,
      )}</text>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    // Definitions: gradients and filters
    '<defs>',
    // Background radial gradient (studio lighting)
    `<radialGradient id="bg" cx="50%" cy="40%" r="60%">`,
    `<stop offset="0%" stop-color="${bgInner}"/>`,
    `<stop offset="100%" stop-color="${bgOuter}"/>`,
    '</radialGradient>',
    // Shirt body gradient (subtle 3D feel)
    `<linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="${shirtHighlight}"/>`,
    `<stop offset="50%" stop-color="${shirtFill}"/>`,
    `<stop offset="100%" stop-color="${shirtShadow}"/>`,
    '</linearGradient>',
    // Drop shadow filter
    '<filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">',
    '<feDropShadow dx="0" dy="8" stdDeviation="20" flood-opacity="0.4"/>',
    '</filter>',
    '</defs>',
    // Background
    `<rect width="100%" height="100%" fill="url(#bg)"/>`,
    // T-shirt with shadow
    `<g filter="url(#shadow)">`,
    `<path d="${tshirtPath}" fill="url(#shirt)"/>`,
    `</g>`,
    // Neckline ribbing
    `<path d="${neckPath}" fill="${shirtShadow}" opacity="0.5"/>`,
    // Fabric fold details
    foldLines,
    // Shirt outline (very subtle)
    `<path d="${tshirtPath}" fill="none" stroke="${strokeColor}" stroke-width="1" opacity="0.3"/>`,
    `<desc>${escapeXml(options.garment)} preview</desc>`,
    // Slogan text
    textElements,
    '</svg>',
  ].join('');
}

/** Build a `data:` URL placeholder from an SVG string (base64 for portability). */
export function svgToDataUrl(svg: string): string {
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/** The outcome of a successful preview render + store. */
export interface PreviewResult {
  /** The URL recorded on Design/Product — a storage URL or a data-URL placeholder. */
  readonly url: string;
  /** True when the URL is a real stored object; false for the inline placeholder. */
  readonly stored: boolean;
  /** Placeholder reference for the future hi-res print-ready file (Req 14.4). */
  readonly hiResPlaceholder: string;
  /** Human-readable note (present when a placeholder was used). */
  readonly note?: string;
}

/**
 * Render a preview from the layout and, when storage is configured, upload it
 * and return the public URL (Req 14.4, 14.5). When storage is unconfigured a
 * `data:` URL placeholder is returned with a note. A configured-upload FAILURE
 * returns a STORAGE_FAILED error and records no URL (Req 14.9).
 */
export async function renderAndStorePreview(
  layout: TextLayout,
  key: string,
  options: {
    garment: string;
    color: string;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  },
): Promise<Result<PreviewResult, MockupPreviewError>> {
  let svg: string;
  try {
    svg = composePreviewSvg(layout, { garment: options.garment, color: options.color });
  } catch (cause) {
    return err({
      kind: 'RENDER_FAILED',
      message:
        cause instanceof Error ? `Preview render failed: ${cause.message}` : 'Preview render failed',
    });
  }

  const objectKey = `${key.replace(/[^a-zA-Z0-9_-]/g, '-')}.svg`;
  const hiResPlaceholder = `pending-hires:${objectKey}`;
  const storage = resolveStorageConfig(options.env ?? process.env);

  // Unconfigured storage → inline data-URL placeholder (Req 14.4 still met by
  // the SVG dimensions; a note flags that no object was stored).
  if (storage === null) {
    return ok({
      url: svgToDataUrl(svg),
      stored: false,
      hiResPlaceholder,
      note: 'Object storage is not configured — using an inline preview placeholder.',
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const uploadUrl = `${storage.uploadBaseUrl}/${objectKey}`;
  const publicUrl = `${storage.publicBaseUrl}/${objectKey}`;

  try {
    const headers: Record<string, string> = { 'content-type': 'image/svg+xml' };
    if (storage.uploadToken !== undefined) {
      headers.authorization = `Bearer ${storage.uploadToken}`;
    }
    const response = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers,
      body: svg,
    });
    if (!response.ok) {
      // Storage failure → record no URL, return an error (Req 14.9).
      return err({
        kind: 'STORAGE_FAILED',
        message: `Preview upload failed with status ${response.status}`,
      });
    }
  } catch (cause) {
    return err({
      kind: 'STORAGE_FAILED',
      message:
        cause instanceof Error
          ? `Preview upload failed: ${cause.message}`
          : 'Preview upload failed',
    });
  }

  return ok({ url: publicUrl, stored: true, hiResPlaceholder });
}

/**
 * Record a preview URL on both the Design and its Product (Req 14.5). Best-effort
 * for the Product (a Design may not yet be linked to a Product); returns false
 * when the DB is unreachable so the caller can surface a storage error.
 */
export async function recordPreviewUrl(
  designId: string,
  url: string,
): Promise<boolean> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const design = await prisma.design.update({
      where: { id: designId },
      data: { mockupUrl: url },
      select: { productId: true },
    });
    if (design.productId !== null) {
      await prisma.product.update({
        where: { id: design.productId },
        data: { mockupUrl: url },
      });
    }
    return true;
  } catch {
    return false;
  }
}
