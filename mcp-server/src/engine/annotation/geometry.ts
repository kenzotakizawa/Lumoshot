import type { BoundingBox, InteractiveElement } from '../../types.js';

export function bboxCenter(bbox: BoundingBox): [number, number] {
  return [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2];
}

/**
 * Returns the point on the bbox edge that lies in direction (ux, uy) from the center.
 * Used so arrows start/end at element edges rather than element centers.
 */
export function bboxEdgePoint(bbox: BoundingBox, ux: number, uy: number): [number, number] {
  const [x, y, w, h] = bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (ux === 0 && uy === 0) return [cx, cy];
  const tx = ux !== 0 ? (w / 2) / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? (h / 2) / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);
  return [cx + ux * t, cy + uy * t];
}

export function bboxForRef(
  ref: number,
  elements: InteractiveElement[]
): BoundingBox | null {
  const el = elements.find((e) => e.ref === ref);
  return el ? el.bbox : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function overlapArea(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a[0] + a[2];
  const ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2];
  const by2 = b[1] + b[3];
  const iw = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(ay2, by2) - Math.max(a[1], b[1]));
  return iw * ih;
}

export function bboxNearlyEqual(a: BoundingBox, b: BoundingBox, tolerance = 1): boolean {
  return Math.abs(a[0] - b[0]) <= tolerance
    && Math.abs(a[1] - b[1]) <= tolerance
    && Math.abs(a[2] - b[2]) <= tolerance
    && Math.abs(a[3] - b[3]) <= tolerance;
}

export function offsetBBoxOutward(bbox: BoundingBox, offset: number): BoundingBox {
  return [bbox[0] - offset, bbox[1] - offset, bbox[2] + offset * 2, bbox[3] + offset * 2];
}

/**
 * Estimates rendered text width accounting for CJK full-width characters.
 * CJK code points occupy ~1.05x the font size; Latin ~0.62x.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const isFullWidth =
      (cp >= 0x1100 && cp <= 0x115F) || // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0x9FFF) || // CJK radicals + kana + han
      (cp >= 0xAC00 && cp <= 0xD7AF) || // Hangul syllables
      (cp >= 0xF900 && cp <= 0xFAFF) || // CJK compatibility ideographs
      (cp >= 0xFF01 && cp <= 0xFF60) || // Full-width punctuation/latin
      (cp >= 0xFFE0 && cp <= 0xFFE6); // Full-width symbol variants
    w += isFullWidth ? fontSize * 1.05 : fontSize * 0.62;
  }
  return w;
}
