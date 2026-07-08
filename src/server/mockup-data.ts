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

import fs from 'fs';
import path from 'path';
import { type Result, ok, err } from '@/lib/result';
import type { TextLayout } from '@/services/mockup';

// Cache for inlined base64 images to prevent reading from disk repeatedly
const base64Cache: Record<string, string> = {};

function getBase64Image(relativePath: string): string {
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  if (base64Cache[cleanPath]) {
    return base64Cache[cleanPath];
  }
  try {
    const filePath = path.join(process.cwd(), 'public', cleanPath);
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(cleanPath).slice(1);
    const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    const base64 = fileBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    base64Cache[cleanPath] = dataUrl;
    return dataUrl;
  } catch (err) {
    console.error(`Failed to load base64 image for ${cleanPath}:`, err);
    return relativePath; // Fallback
  }
}

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

  const textColor = isWhiteShirt ? '#111111' : '#f5f5f5';

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

  const bgImg = isWhiteShirt ? '/model-front-white.png' : '/model-front-black.png';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="${getBase64Image(bgImg)}" x="0" y="0" width="${width}" height="${height}" />`,
    `<desc>${escapeXml(options.garment)} preview</desc>`,
    textElements,
    '</svg>',
  ].join('');
}

/**
 * Compose a BACK-view SVG preview for the t-shirt. Shows the model from behind
 * with 'CORPORATE CULT' branding on the upper back. Pure and deterministic.
 * Uses the same sizing contract as composePreviewSvg so front/back match.
 */
export function composeBackSvg(
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

  const textColor = isWhiteShirt ? '#111111' : '#f5f5f5';
  const bgImg = isWhiteShirt ? '/model-back-white.png' : '/model-back-black.png';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="${getBase64Image(bgImg)}" x="0" y="0" width="${width}" height="${height}" />`,
    `<desc>${escapeXml(options.garment)} back preview</desc>`,
    `<text x="500" y="420" font-family="'Inter', 'Helvetica Neue', sans-serif" font-size="42" font-weight="900" fill="${textColor}" text-anchor="middle" letter-spacing="8" opacity="0.85">CORPORATE</text>`,
    `<text x="500" y="470" font-family="'Inter', 'Helvetica Neue', sans-serif" font-size="42" font-weight="900" fill="${textColor}" text-anchor="middle" letter-spacing="8" opacity="0.85">CULT</text>`,
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
