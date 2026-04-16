/**
 * Annotator — renders annotation overlays onto screenshots.
 *
 * Strategy:
 * - Vector annotations (boxes, arrows, badges, callouts, text, step numbers,
 *   click icons, spotlight) → SVG composited over the image via Sharp.
 * - Raster annotations (mosaic/blur) → Sharp extract + blur + composite.
 * - OS frame → SVG frame drawn around the image.
 * - Crop / Resize → Sharp operations.
 * - Before/After → side-by-side layout with Sharp.
 */

import sharp from 'sharp';
import { readFileSync } from 'fs';

// Sharp's toBuffer() returns Buffer<ArrayBufferLike> which conflicts with NonSharedBuffer.
// Wrap every toBuffer() call through this helper to get a plain Buffer.
async function toBuffer(s: sharp.Sharp): Promise<Buffer> {
  const buf = await s.toBuffer();
  return Buffer.from(buf);
}
import type {
  Annotation,
  BoundingBox,
  PresetColors,
  Preset,
} from '../types.js';
import { PRESETS } from '../types.js';
import type { InteractiveElement } from '../types.js';
import { platform } from 'os';

// ─── Preset resolution ────────────────────────────────────────────────────────

export function resolvePreset(preset: Preset): PresetColors {
  if (preset === 'auto' || !(preset in PRESETS)) return PRESETS.friendly;
  return PRESETS[preset as keyof typeof PRESETS];
}

// Color rotation for multi-annotation presets
const COLOR_ROTATION_PRECISE = ['#E53E3E', '#ED8936', '#D69E2E'];
const COLOR_ROTATION_FRIENDLY = ['#3182CE', '#38B2AC', '#38A169', '#9F7AEA'];
const COLOR_ROTATION_NEUTRAL = ['#718096', '#4A5568', '#2D3748'];

export function getRotatedColor(preset: PresetColors, index: number): string {
  if (preset.primary === PRESETS.precise.primary) {
    return COLOR_ROTATION_PRECISE[index % COLOR_ROTATION_PRECISE.length];
  }
  if (preset.primary === PRESETS.neutral.primary) {
    return COLOR_ROTATION_NEUTRAL[index % COLOR_ROTATION_NEUTRAL.length];
  }
  return COLOR_ROTATION_FRIENDLY[index % COLOR_ROTATION_FRIENDLY.length];
}

// ─── Helper: bbox center / edge ──────────────────────────────────────────────

function bboxCenter(bbox: BoundingBox): [number, number] {
  return [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2];
}

/**
 * Returns the point on the bbox edge that lies in direction (ux, uy) from the center.
 * Used so arrows start/end at element edges rather than element centers.
 */
function bboxEdgePoint(bbox: BoundingBox, ux: number, uy: number): [number, number] {
  const [x, y, w, h] = bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (ux === 0 && uy === 0) return [cx, cy];
  const tx = ux !== 0 ? (w / 2) / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? (h / 2) / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);
  return [cx + ux * t, cy + uy * t];
}

function bboxForRef(
  ref: number,
  elements: InteractiveElement[]
): BoundingBox | null {
  const el = elements.find((e) => e.ref === ref);
  return el ? el.bbox : null;
}

/**
 * Estimates rendered text width accounting for CJK full-width characters.
 * CJK code points occupy ~1.05× the font size; Latin ~0.62×.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const isCJK =
      (cp >= 0x3000 && cp <= 0x9FFF) ||
      (cp >= 0xF900 && cp <= 0xFFEF) ||
      (cp >= 0xFF00 && cp <= 0xFFEF);
    w += isCJK ? fontSize * 1.05 : fontSize * 0.62;
  }
  return w;
}

// ─── SVG builders ────────────────────────────────────────────────────────────

function svgBox(
  bbox: BoundingBox,
  color: string,
  lineWidth: number,
  radius: number,
  label?: string,
  textColor?: string
): string {
  const [x, y, w, h] = bbox;
  const pad = lineWidth / 2;
  let svg = `<rect x="${x - pad}" y="${y - pad}" width="${w + lineWidth}" height="${h + lineWidth}"
    fill="none" stroke="${color}" stroke-width="${lineWidth}"
    rx="${radius}" ry="${radius}" />`;

  if (label) {
    const fontSize = 12;
    const lx = x + w / 2;
    const ly = y - lineWidth - 4;
    const labelW = estimateTextWidth(label, fontSize) + 10;
    svg += `<rect x="${lx - labelW / 2}" y="${ly - fontSize - 2}"
      width="${labelW}" height="${fontSize + 4}"
      fill="${color}" rx="3" />`;
    // Always use white text on the coloured label background for contrast.
    svg += `<text x="${lx}" y="${ly - 2}" text-anchor="middle"
      font-family="system-ui,sans-serif" font-size="${fontSize}" fill="#fff">${escapeXml(label)}</text>`;
  }
  return svg;
}

function svgArrow(
  from: [number, number],
  to: [number, number],
  color: string,
  strokeWidth: number,
  label?: string
): string {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const markerId = `arrow-${Math.random().toString(36).slice(2)}`;

  // Unit vector along the arrow direction
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ux = dist > 0 ? dx / dist : 1;
  const uy = dist > 0 ? dy / dist : 0;

  // Pull the arrowhead back so the tip stops at the target element's edge,
  // not buried inside it. 20 px gap keeps the arrowhead clearly visible.
  const GAP = 20;
  const ex = dist > GAP * 2 ? x2 - ux * GAP : x2;
  const ey = dist > GAP * 2 ? y2 - uy * GAP : y2;

  let svg = `
<defs>
  <marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5"
    markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" />
  </marker>
</defs>
<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"
  stroke="${color}" stroke-width="${strokeWidth}"
  marker-end="url(#${markerId})" />`;

  if (label) {
    // Place label perpendicular to the arrow, offset 16 px to avoid the shaft.
    const mx = (x1 + ex) / 2;
    const my = (y1 + ey) / 2;
    // Perpendicular direction (rotate 90° CCW): (-uy, ux)
    const lx = mx + (-uy) * 16;
    const ly = my + ux * 16;

    const fontSize = 12;
    const padX = 6;
    const padY = 3;
    const textW = estimateTextWidth(label, fontSize) + padX * 2;
    const textH = fontSize + padY * 2;

    svg += `
<rect x="${lx - textW / 2}" y="${ly - textH / 2}" width="${textW}" height="${textH}"
  rx="3" fill="white" fill-opacity="0.88" />
<text x="${lx}" y="${ly + fontSize / 2 - 1}" text-anchor="middle"
  font-family="system-ui,sans-serif" font-size="${fontSize}" fill="${color}">${escapeXml(label)}</text>`;
  }

  return svg;
}

function svgStepBadge(
  cx: number,
  cy: number,
  num: number,
  bgColor: string,
  textColor: string
): string {
  const r = 14;
  return `
<circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="white" />
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bgColor}" />
<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="middle"
  font-family="system-ui,sans-serif" font-size="${num > 9 ? '11' : '13'}" font-weight="bold"
  fill="${textColor}">${num}</text>`;
}

function svgCallout(
  bbox: BoundingBox,
  text: string,
  tail: string,
  bgColor: string,
  borderColor: string,
  textColor: string
): string {
  const [bx, by, bw, bh] = bbox;
  const pad = 10;
  const fontSize = 13;
  const lines = text.split('\n');
  const maxLen = Math.max(...lines.map((l) => l.length));
  const cw = Math.max(120, maxLen * 7.5 + pad * 2);
  const ch = lines.length * (fontSize + 4) + pad * 2;
  const tailH = 16;

  // Place callout: auto picks above (bottom tail) or below (top tail) based on space.
  // left/right position the callout to the right/left of the element respectively.
  const effectiveTail = tail === 'auto'
    ? (by > ch + tailH + 20 ? 'bottom' : 'top')
    : tail;

  let cx: number, cy: number;
  let tipX: number, tipY: number;
  let tailPath = '';

  if (effectiveTail === 'bottom') {
    // Callout above element, tail points down from callout bottom
    cx = bx + bw / 2 - cw / 2;
    cy = by - ch - tailH - 4;
    cx = Math.max(4, cx);
    cy = Math.max(4, cy);
    tipX = bx + bw / 2;
    tipY = by - 4;
    const baseY = cy + ch;
    tailPath = `M ${tipX} ${tipY} L ${tipX - 8} ${baseY} L ${tipX + 8} ${baseY} Z`;
  } else if (effectiveTail === 'top') {
    // Callout below element, tail points up from callout top
    cx = bx + bw / 2 - cw / 2;
    cy = by + bh + tailH + 4;
    cx = Math.max(4, cx);
    cy = Math.max(4, cy);
    tipX = bx + bw / 2;
    tipY = by + bh + 4;
    const baseY = cy;
    tailPath = `M ${tipX} ${tipY} L ${tipX - 8} ${baseY} L ${tipX + 8} ${baseY} Z`;
  } else if (effectiveTail === 'left') {
    // Callout to the right of element, tail points left from callout left edge
    cx = bx + bw + tailH + 4;
    cy = by + bh / 2 - ch / 2;
    cx = Math.max(4, cx);
    cy = Math.max(4, cy);
    tipX = bx + bw + 4;
    tipY = by + bh / 2;
    const baseX = cx;
    tailPath = `M ${tipX} ${tipY} L ${baseX} ${tipY - 8} L ${baseX} ${tipY + 8} Z`;
  } else {
    // right: Callout to the left of element, tail points right from callout right edge
    cx = bx - cw - tailH - 4;
    cy = by + bh / 2 - ch / 2;
    cx = Math.max(4, cx);
    cy = Math.max(4, cy);
    tipX = bx - 4;
    tipY = by + bh / 2;
    const baseX = cx + cw;
    tailPath = `M ${tipX} ${tipY} L ${baseX} ${tipY - 8} L ${baseX} ${tipY + 8} Z`;
  }

  let svg = `
<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"
  rx="6" ry="6" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5" />
<path d="${tailPath}" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5" />`;

  lines.forEach((line, i) => {
    svg += `<text x="${cx + pad}" y="${cy + pad + fontSize + i * (fontSize + 4)}"
      font-family="system-ui,sans-serif" font-size="${fontSize}" fill="${textColor}">${escapeXml(line)}</text>`;
  });

  return svg;
}

function svgText(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
  background?: string
): string {
  const lines = text.split('\n');
  const maxLen = Math.max(...lines.map((l) => l.length));
  const w = maxLen * fontSize * 0.6 + 12;
  const h = lines.length * (fontSize + 4) + 8;

  let svg = '';
  if (background) {
    svg += `<rect x="${x - 4}" y="${y - fontSize - 2}" width="${w}" height="${h}"
      rx="3" fill="${background}" />`;
  }
  lines.forEach((line, i) => {
    svg += `<text x="${x}" y="${y + i * (fontSize + 4)}"
      font-family="system-ui,sans-serif" font-size="${fontSize}" fill="${color}">${escapeXml(line)}</text>`;
  });
  return svg;
}

function svgClickIcon(cx: number, cy: number, color: string, clickType: string): string {
  // Cursor tip position relative to group
  const TIP_X = cx + 10;
  const TIP_Y = cy + 10;
  const STROKE = 2;
  const DARK = '#1a1a2e';
  const LINE_GAP = 8;
  const CENTER_ANGLE = clickType === 'right' ? 325 : 215;
  const angles = [CENTER_ANGLE - 20, CENTER_ANGLE, CENTER_ANGLE + 20];
  const lens = [18, 24, 18];

  let svg = '';

  // Motion lines — drawn twice: white halo first, then coloured on top.
  // This ensures lines are visible regardless of the element's background colour.
  angles.forEach((deg, i) => {
    const rad = deg * Math.PI / 180;
    const x1 = TIP_X + Math.cos(rad) * LINE_GAP;
    const y1 = TIP_Y + Math.sin(rad) * LINE_GAP;
    const x2 = TIP_X + Math.cos(rad) * (LINE_GAP + lens[i]);
    const y2 = TIP_Y + Math.sin(rad) * (LINE_GAP + lens[i]);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="white" stroke-width="${STROKE + 3}" stroke-linecap="round" />`;
  });
  angles.forEach((deg, i) => {
    const rad = deg * Math.PI / 180;
    const x1 = TIP_X + Math.cos(rad) * LINE_GAP;
    const y1 = TIP_Y + Math.sin(rad) * LINE_GAP;
    const x2 = TIP_X + Math.cos(rad) * (LINE_GAP + lens[i]);
    const y2 = TIP_Y + Math.sin(rad) * (LINE_GAP + lens[i]);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" />`;
  });

  // Cursor arrow path
  const cursorPath = `M ${TIP_X} ${TIP_Y} L ${TIP_X} ${TIP_Y + 28} L ${TIP_X + 6} ${TIP_Y + 22} L ${TIP_X + 11} ${TIP_Y + 34} L ${TIP_X + 15} ${TIP_Y + 32} L ${TIP_X + 10} ${TIP_Y + 20} L ${TIP_X + 18} ${TIP_Y + 20} Z`;

  svg += `<path d="${cursorPath}" fill="white" stroke="none" />`;
  svg += `<path d="${cursorPath}" fill="none" stroke="${DARK}" stroke-width="${STROKE}" stroke-linejoin="round" />`;

  if (clickType === 'double') {
    svg += `<circle cx="${TIP_X + 9}" cy="${TIP_Y - 8}" r="4" fill="${color}" />`;
    svg += `<circle cx="${TIP_X + 9}" cy="${TIP_Y - 18}" r="4" fill="${color}" />`;
  }

  return svg;
}

function svgSpotlight(
  imgWidth: number,
  imgHeight: number,
  bbox: BoundingBox,
  shape: string
): string {
  const [x, y, w, h] = bbox;
  const clipId = `spot-${Math.random().toString(36).slice(2)}`;
  const pad = 4;

  let holeClip = '';
  if (shape === 'ellipse') {
    holeClip = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2 + pad}" ry="${h / 2 + pad}" />`;
  } else {
    holeClip = `<rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${h + pad * 2}" rx="4" />`;
  }

  return `
<defs>
  <clipPath id="${clipId}" clip-rule="evenodd">
    <rect x="0" y="0" width="${imgWidth}" height="${imgHeight}" />
    ${holeClip}
  </clipPath>
</defs>
<rect x="0" y="0" width="${imgWidth}" height="${imgHeight}"
  fill="rgba(0,0,0,0.65)"
  clip-path="url(#${clipId})"
  clip-rule="evenodd" />`;
  // Note: evenodd hole via mask approach
}

function svgOsFrame(
  imgWidth: number,
  imgHeight: number,
  style: string
): { svgOverlay: string; padTop: number; padSide: number; padBottom: number } {
  const os = style === 'auto'
    ? (platform() === 'darwin' ? 'macos' : platform() === 'win32' ? 'windows' : 'linux')
    : style;

  const titleBarH = 38;
  const padSide = 0;
  const padBottom = 0;

  let titleBar = '';
  if (os === 'macos') {
    const bColors = ['#FF5F57', '#FEBC2E', '#28C840'];
    const bX = 12;
    bColors.forEach((c, i) => {
      titleBar += `<circle cx="${bX + i * 20}" cy="${titleBarH / 2}" r="6" fill="${c}" />`;
    });
    // Title bar bg
    titleBar = `<rect x="0" y="0" width="${imgWidth + padSide * 2}" height="${titleBarH}"
      rx="12" ry="12" fill="#e0e0e0" />\n` + titleBar;
  } else if (os === 'windows') {
    const btnW = 46;
    titleBar = `<rect x="0" y="0" width="${imgWidth}" height="${titleBarH}" fill="#202020" />`;
    // Close/min/max buttons
    ['minimize', 'maximize', 'close'].forEach((_, i) => {
      const bx = imgWidth - btnW * (3 - i);
      titleBar += `<rect x="${bx}" y="0" width="${btnW}" height="${titleBarH}" fill="transparent" />`;
    });
    // Close X
    const cx = imgWidth - btnW / 2;
    const cy = titleBarH / 2;
    titleBar += `<line x1="${cx - 6}" y1="${cy - 6}" x2="${cx + 6}" y2="${cy + 6}" stroke="white" stroke-width="1.5"/>`;
    titleBar += `<line x1="${cx + 6}" y1="${cy - 6}" x2="${cx - 6}" y2="${cy + 6}" stroke="white" stroke-width="1.5"/>`;
  } else {
    // Linux - generic
    titleBar = `<rect x="0" y="0" width="${imgWidth}" height="${titleBarH}" fill="#333" />`;
    titleBar += `<circle cx="${imgWidth - 14}" cy="${titleBarH / 2}" r="6" fill="#e74c3c" />`;
    titleBar += `<circle cx="${imgWidth - 34}" cy="${titleBarH / 2}" r="6" fill="#f39c12" />`;
    titleBar += `<circle cx="${imgWidth - 54}" cy="${titleBarH / 2}" r="6" fill="#2ecc71" />`;
  }

  const svgOverlay = titleBar;
  return { svgOverlay, padTop: titleBarH, padSide, padBottom };
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Main annotation function ─────────────────────────────────────────────────

export interface AnnotationWarning {
  type: string;
  refs?: number[];
  message: string;
}

export async function applyAnnotations(
  imagePath: string,
  annotations: Annotation[],
  elements: InteractiveElement[],
  preset: Preset
): Promise<{ buffer: Buffer; warnings: AnnotationWarning[] }> {
  const presetColors = resolvePreset(preset);
  const warnings: AnnotationWarning[] = [];

  let img = sharp(imagePath);
  const meta = await img.metadata();
  let imgWidth = meta.width ?? 1280;
  let imgHeight = meta.height ?? 720;
  let imgBuffer: Buffer = Buffer.from(readFileSync(imagePath));

  // ── before_after: constructs an entirely new image from two source files.
  // Handle it first and return immediately — it is incompatible with other
  // overlay/structural annotations (which operate on the base imagePath).
  const beforeAfterAnn = annotations.find((a) => a.type === 'before_after');
  if (beforeAfterAnn && beforeAfterAnn.type === 'before_after') {
    const layout = beforeAfterAnn.layout ?? 'side_by_side';
    try {
      const beforeBuf = readFileSync(beforeAfterAnn.before_ref);
      const afterBuf = readFileSync(beforeAfterAnn.after_ref);
      const bMeta = await sharp(beforeBuf).metadata();
      const aMeta = await sharp(afterBuf).metadata();

      if (layout === 'overlay') {
        const width = bMeta.width ?? 1280;
        const height = bMeta.height ?? 720;
        const beforeResized = await toBuffer(
          sharp(beforeBuf).resize({ width, height, fit: 'fill' }).png()
        );
        const afterResized = await toBuffer(
          sharp(afterBuf).resize({ width, height, fit: 'fill' }).png()
        );
        const result = await toBuffer(
          sharp(beforeResized).composite([{ input: afterResized, blend: 'overlay' }]).png()
        );
        return { buffer: result, warnings };
      }

      // side_by_side (default)
      const maxH = Math.max(bMeta.height ?? 720, aMeta.height ?? 720);
      const beforeW = bMeta.width ?? 1280;
      const afterW = aMeta.width ?? 1280;
      const DIVIDER = 4;
      const result = await toBuffer(
        sharp({
          create: {
            width: beforeW + afterW + DIVIDER,
            height: maxH,
            channels: 4,
            background: { r: 200, g: 200, b: 200, alpha: 1 },
          },
        }).composite([
          { input: beforeBuf, left: 0, top: 0 },
          { input: afterBuf, left: beforeW + DIVIDER, top: 0 },
        ]).png()
      );
      return { buffer: result, warnings };
    } catch (err) {
      warnings.push({ type: 'before_after_error', message: String(err) });
      // Fall through and return the original image
      return { buffer: imgBuffer, warnings };
    }
  }

  // Separate structural ops from overlay ops
  const overlayAnnotations: Annotation[] = [];
  const structuralAnnotations: Annotation[] = [];

  for (const ann of annotations) {
    if (ann.type === 'crop' || ann.type === 'resize' || ann.type === 'os_frame') {
      structuralAnnotations.push(ann);
    } else {
      overlayAnnotations.push(ann);
    }
  }

  // Build SVG overlays
  let svgParts: string[] = [];
  const composites: sharp.OverlayOptions[] = [];

  // Pre-assign colors by primary ref so all annotations targeting the same
  // element share a colour. Arrows use to_ref as their primary ref.
  function primaryRefOf(ann: Annotation): number | null {
    if ('ref' in ann && ann.ref != null) return ann.ref;
    if ('to_ref' in ann && (ann as { to_ref?: number }).to_ref != null)
      return (ann as { to_ref: number }).to_ref;
    return null;
  }
  const refColorMap = new Map<number, string>();
  let nextRefColorIdx = 0;
  for (const ann of overlayAnnotations) {
    const pRef = primaryRefOf(ann);
    if (pRef != null && !refColorMap.has(pRef)) {
      refColorMap.set(pRef, getRotatedColor(presetColors, nextRefColorIdx++));
    }
  }
  let unrefColorIdx = nextRefColorIdx;

  function resolveColor(ann: Annotation, userColor?: string): string {
    if (userColor) return userColor;
    const pRef = primaryRefOf(ann);
    return pRef != null && refColorMap.has(pRef)
      ? refColorMap.get(pRef)!
      : getRotatedColor(presetColors, unrefColorIdx++);
  }

  for (const ann of overlayAnnotations) {
    const color = resolveColor(ann);

    if (ann.type === 'box') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const r = 0;
      svgParts.push(svgBox(bbox, ann.color ?? color, ann.line_width ?? presetColors.line_width, r, ann.label, presetColors.text_color));
    }

    else if (ann.type === 'rounded_box') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const r = ann.border_radius ?? presetColors.border_radius ?? 8;
      svgParts.push(svgBox(bbox, ann.color ?? color, presetColors.line_width, r));
    }

    else if (ann.type === 'arrow') {
      const fromBbox = ann.from_bbox ?? (ann.from_ref != null ? bboxForRef(ann.from_ref, elements) : null);
      const toBbox = ann.to_bbox ?? (ann.to_ref != null ? bboxForRef(ann.to_ref, elements) : null);
      if (!fromBbox || !toBbox) continue;
      // Draw arrow from source bbox EDGE to target bbox EDGE (not center→center),
      // so the shaft doesn't pierce the source element and the arrowhead is visible.
      const [fcx, fcy] = bboxCenter(fromBbox);
      const [tcx, tcy] = bboxCenter(toBbox);
      const adx = tcx - fcx;
      const ady = tcy - fcy;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist === 0) continue;
      const aux = adx / adist;
      const auy = ady / adist;
      svgParts.push(svgArrow(
        bboxEdgePoint(fromBbox, aux, auy),
        bboxEdgePoint(toBbox, -aux, -auy),
        ann.color ?? color,
        presetColors.line_width,
        ann.label,
      ));
    }

    else if (ann.type === 'callout') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      svgParts.push(svgCallout(
        bbox, ann.text,
        ann.tail ?? 'auto',
        ann.background ?? '#ffffff',
        ann.border_color ?? color,
        presetColors.text_color
      ));
    }

    else if (ann.type === 'text') {
      svgParts.push(svgText(
        ann.position[0], ann.position[1], ann.text,
        ann.font_size ?? 14, ann.color ?? presetColors.text_color, ann.background
      ));
    }

    else if (ann.type === 'step_number') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      svgParts.push(svgStepBadge(
        bbox[0], bbox[1],
        ann.number,
        ann.color ?? presetColors.badge_bg,
        presetColors.badge_text
      ));
    }

    else if (ann.type === 'click_icon') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const [cx, cy] = bboxCenter(bbox);
      svgParts.push(svgClickIcon(cx - 20, cy - 20, color, ann.click_type ?? 'left'));
    }

    else if (ann.type === 'spotlight') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const [, , w, h] = bbox;
      const shape = ann.shape === 'auto'
        ? (w / h > 1.5 || h / w > 1.5 ? 'ellipse' : 'rect')
        : (ann.shape ?? 'rect');
      svgParts.push(svgSpotlight(imgWidth, imgHeight, bbox, shape));
    }

    else if (ann.type === 'mosaic') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const [mx, my, mw, mh] = bbox;
      const sigma = ann.intensity === 'light' ? 4 : ann.intensity === 'strong' ? 20 : 10;

      try {
        const blurred = await toBuffer(
          sharp(imgBuffer).extract({ left: mx, top: my, width: mw, height: mh }).blur(sigma)
        );
        composites.push({ input: blurred, left: mx, top: my });
      } catch {
        warnings.push({ type: 'mosaic_error', message: `Failed to apply mosaic at [${bbox}]` });
      }
    }

  }

  // Composite SVG overlay
  if (svgParts.length > 0) {
    const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">
${svgParts.join('\n')}
</svg>`;
    composites.push({ input: Buffer.from(svgOverlay), top: 0, left: 0 });
  }

  // Apply structural annotations in order
  let processedBuffer: Buffer = Buffer.from(imgBuffer);

  for (const ann of structuralAnnotations) {
    if (ann.type === 'crop') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const pad = ann.padding ?? 0;
      const [cx, cy, cw, ch] = bbox;
      processedBuffer = await toBuffer(
        sharp(processedBuffer).extract({
          left: Math.max(0, cx - pad),
          top: Math.max(0, cy - pad),
          width: Math.min(imgWidth - cx + pad, cw + pad * 2),
          height: Math.min(imgHeight - cy + pad, ch + pad * 2),
        })
      );
      const newMeta = await sharp(processedBuffer).metadata();
      imgWidth = newMeta.width ?? imgWidth;
      imgHeight = newMeta.height ?? imgHeight;
    }

    else if (ann.type === 'resize') {
      processedBuffer = await toBuffer(sharp(processedBuffer).resize({ width: ann.width }));
      const newMeta = await sharp(processedBuffer).metadata();
      imgWidth = newMeta.width ?? ann.width;
      imgHeight = newMeta.height ?? imgHeight;
    }

    else if (ann.type === 'os_frame') {
      const style = ann.style ?? 'auto';
      const { svgOverlay, padTop } = svgOsFrame(imgWidth, imgHeight, style);

      // Extend canvas upward to fit title bar
      const extended = await toBuffer(
        sharp({
          create: {
            width: imgWidth,
            height: imgHeight + padTop,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          }
        }).composite([
          { input: processedBuffer, top: padTop, left: 0 },
        ]).png()
      );

      const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight + padTop}">
${svgOverlay}
</svg>`;
      processedBuffer = await toBuffer(
        sharp(extended).composite([{ input: Buffer.from(frameSvg), top: 0, left: 0 }]).png()
      );
      imgHeight = imgHeight + padTop;
    }
  }

  // Apply all composites (mosaic + SVG overlays)
  if (composites.length > 0) {
    processedBuffer = await toBuffer(sharp(processedBuffer).composite(composites).png());
  }

  return { buffer: processedBuffer, warnings };
}

// ─── In-browser SVG injection (for capture_page / execute_flow) ───────────────

/**
 * Injects a lightweight SVG overlay into the page for badge rendering,
 * takes a screenshot, then removes the overlay.
 */
export async function injectAndCapture(
  page: import('playwright').Page,
  elements: InteractiveElement[],
  preset: Preset
): Promise<Buffer> {
  const presetColors = resolvePreset(preset);

  const svgBadges = elements
    .filter((el) => el.badge_number != null && el.badge_position != null)
    .map((el, i) => {
      const color = getRotatedColor(presetColors, i);
      const [bx, by] = el.badge_position!;
      return svgStepBadge(bx + 12, by + 12, el.badge_number!, color, presetColors.badge_text);
    })
    .join('\n');

  const viewportSize = page.viewportSize() ?? { width: 1280, height: 720 };

  if (svgBadges) {
    await page.evaluate(
      ({ svg, vw, vh }: { svg: string; vw: number; vh: number }) => {
        const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        overlay.setAttribute('id', '__lumoshot_overlay__');
        overlay.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        overlay.setAttribute('width', String(vw));
        overlay.setAttribute('height', String(vh));
        overlay.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;';
        overlay.innerHTML = svg;
        document.documentElement.appendChild(overlay);
      },
      { svg: svgBadges, vw: viewportSize.width, vh: viewportSize.height }
    );
  }

  const screenshotBuffer = await page.screenshot({ type: 'png' });

  // Remove overlay
  await page.evaluate(() => {
    const el = document.getElementById('__lumoshot_overlay__');
    if (el) el.remove();
  });

  return screenshotBuffer;
}
