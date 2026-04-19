import sharp from 'sharp';
import { readFileSync } from 'fs';
import type { Annotation, BoundingBox, InteractiveElement, Preset, Theme } from '../../types.js';
import { DEFAULT_BOX_BORDER_COLOR, getRotatedColor, resolvePreset, resolveTheme } from './presets.js';
import {
  bboxCenter,
  bboxEdgePoint,
  bboxForRef,
  bboxNearlyEqual,
  clamp,
  estimateTextWidth,
  offsetBBoxOutward,
} from './geometry.js';
import {
  svgArrow,
  svgBox,
  svgCallout,
  svgClickIcon,
  svgOsFrame,
  svgSpotlight,
  svgStepBadge,
  svgText,
} from './svg-primitives.js';
import type { AnnotationWarning } from './types.js';

// Sharp's toBuffer() returns Buffer<ArrayBufferLike> which conflicts with NonSharedBuffer.
// Wrap every toBuffer() call through this helper to get a plain Buffer.
async function toBuffer(s: sharp.Sharp): Promise<Buffer> {
  const buf = await s.toBuffer();
  return Buffer.from(buf);
}

const BADGE_DIAMETER = 32;
const BADGE_MARGIN = 8;
const BADGE_GRID_STEP = 12;
const BADGE_GRID_RING = 6;

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}

function intersects(a: BoundingBox, b: BoundingBox): boolean {
  const ax2 = a[0] + a[2];
  const ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2];
  const by2 = b[1] + b[3];
  return a[0] < bx2 && ax2 > b[0] && a[1] < by2 && ay2 > b[1];
}

function findBadgeTopLeft(
  target: BoundingBox,
  occupied: BoundingBox[],
  imageSize: { width: number; height: number },
  preferred?: [number, number],
): [number, number] {
  const [x, y, w, h] = target;
  const half = BADGE_DIAMETER / 2;

  const candidates: Array<[number, number]> = [
    [x + w + BADGE_MARGIN, y - half],
    [x - BADGE_MARGIN - BADGE_DIAMETER, y - half],
    [x + w + BADGE_MARGIN, y + h - half],
    [x - BADGE_MARGIN - BADGE_DIAMETER, y + h - half],
    [x + w / 2 - half, y - BADGE_MARGIN - BADGE_DIAMETER],
    [x + w / 2 - half, y + h + BADGE_MARGIN],
  ];
  if (preferred) {
    candidates.unshift(preferred);
  }

  const toClampedCandidate = (rawX: number, rawY: number): BoundingBox => {
    const bx = Math.round(clamp(rawX, 0, Math.max(0, imageSize.width - BADGE_DIAMETER)));
    const by = Math.round(clamp(rawY, 0, Math.max(0, imageSize.height - BADGE_DIAMETER)));
    return [bx, by, BADGE_DIAMETER, BADGE_DIAMETER];
  };

  for (const [rawX, rawY] of candidates) {
    const candidate = toClampedCandidate(rawX, rawY);
    if (intersects(candidate, target)) continue;
    if (occupied.some((ob) => intersects(candidate, ob))) continue;
    return [candidate[0], candidate[1]];
  }

  for (const [baseX, baseY] of candidates) {
    for (let ring = 1; ring <= BADGE_GRID_RING; ring++) {
      for (let gx = -ring; gx <= ring; gx++) {
        for (let gy = -ring; gy <= ring; gy++) {
          if (Math.abs(gx) !== ring && Math.abs(gy) !== ring) continue;
          const candidate = toClampedCandidate(
            baseX + gx * BADGE_GRID_STEP,
            baseY + gy * BADGE_GRID_STEP,
          );
          if (intersects(candidate, target)) continue;
          if (occupied.some((ob) => intersects(candidate, ob))) continue;
          return [candidate[0], candidate[1]];
        }
      }
    }
  }

  const [fallbackX, fallbackY] = candidates[0];
  return [
    Math.round(clamp(fallbackX, 0, Math.max(0, imageSize.width - BADGE_DIAMETER))),
    Math.round(clamp(fallbackY, 0, Math.max(0, imageSize.height - BADGE_DIAMETER))),
  ];
}

/**
 * Composes a before/after comparison image.
 * Kept separate from the main overlay pipeline because it operates on two source
 * images and returns a new canvas rather than annotating the input image.
 */
async function composeBeforeAfter(
  ann: Extract<import('../../types.js').Annotation, { type: 'before_after' }>,
  fallbackBuffer: Buffer,
  warnings: AnnotationWarning[],
): Promise<{ buffer: Buffer; warnings: AnnotationWarning[] }> {
  const layout = ann.layout ?? 'side_by_side';
  try {
    const beforeBuf = readFileSync(ann.before_ref);
    const afterBuf = readFileSync(ann.after_ref);
    const bMeta = await sharp(beforeBuf).metadata();
    const aMeta = await sharp(afterBuf).metadata();
    const beforeLabel = escapeSvgText(ann.before_label ?? 'BEFORE');
    const afterLabel = escapeSvgText(ann.after_label ?? 'AFTER');
    const canvasW = Math.max(bMeta.width ?? 1280, aMeta.width ?? 1280);
    const canvasH = Math.max(bMeta.height ?? 720, aMeta.height ?? 720);

    if (layout === 'overlay') {
      const width = canvasW;
      const height = canvasH;
      const beforeResized = await toBuffer(
        sharp(beforeBuf).resize({ width, height, fit: 'contain', background: '#ffffff' }).png()
      );
      const afterResized = await toBuffer(
        sharp(afterBuf).resize({ width, height, fit: 'contain', background: '#ffffff' }).png()
      );
      const labelSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <rect x="12" y="12" width="126" height="30" rx="8" fill="#111827" fill-opacity="0.84"/>
          <text x="24" y="33" font-size="14" font-family="Arial, sans-serif" fill="#FFFFFF">${beforeLabel} + ${afterLabel}</text>
        </svg>`,
      );
      const result = await toBuffer(
        sharp(beforeResized).composite([
          { input: afterResized, blend: 'overlay' },
          { input: labelSvg },
        ]).png()
      );
      return { buffer: result, warnings };
    }

    const padding = Math.max(16, Math.round(Math.min(canvasW, canvasH) * 0.02));
    const gap = Math.max(12, Math.round(canvasW * 0.012));
    const labelHeight = Math.max(26, Math.round(canvasH * 0.06));
    const panelTop = padding + labelHeight;
    const panelHeight = Math.max(1, canvasH - panelTop - padding);
    const panelWidth = Math.max(1, Math.floor((canvasW - padding * 2 - gap) / 2));
    const beforeLeft = padding;
    const afterLeft = padding + panelWidth + gap;
    const panelRadius = 10;

    const beforePanel = await toBuffer(
      sharp(beforeBuf)
        .resize({ width: panelWidth, height: panelHeight, fit: 'contain', background: '#FFFFFF' })
        .png(),
    );
    const afterPanel = await toBuffer(
      sharp(afterBuf)
        .resize({ width: panelWidth, height: panelHeight, fit: 'contain', background: '#FFFFFF' })
        .png(),
    );
    const chromeSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
        <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#F3F4F6"/>
        <rect x="${beforeLeft}" y="${panelTop}" width="${panelWidth}" height="${panelHeight}" rx="${panelRadius}" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="1"/>
        <rect x="${afterLeft}" y="${panelTop}" width="${panelWidth}" height="${panelHeight}" rx="${panelRadius}" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="1"/>
        <rect x="${beforeLeft}" y="${padding}" width="110" height="${labelHeight - 6}" rx="8" fill="#7F1D1D"/>
        <text x="${beforeLeft + 14}" y="${padding + labelHeight - 11}" font-size="14" font-family="Arial, sans-serif" fill="#FFFFFF">${beforeLabel}</text>
        <rect x="${afterLeft}" y="${padding}" width="94" height="${labelHeight - 6}" rx="8" fill="#991B1B"/>
        <text x="${afterLeft + 14}" y="${padding + labelHeight - 11}" font-size="14" font-family="Arial, sans-serif" fill="#FFFFFF">${afterLabel}</text>
        <line x1="${beforeLeft + panelWidth + Math.floor(gap / 2)}" y1="${panelTop + 8}" x2="${beforeLeft + panelWidth + Math.floor(gap / 2)}" y2="${panelTop + panelHeight - 8}" stroke="#D1D5DB" stroke-width="1"/>
      </svg>`,
    );

    const result = await toBuffer(
      sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 4,
          background: { r: 243, g: 244, b: 246, alpha: 1 },
        },
      }).composite([
        { input: chromeSvg, left: 0, top: 0 },
        { input: beforePanel, left: beforeLeft, top: panelTop },
        { input: afterPanel, left: afterLeft, top: panelTop },
      ]).png()
    );
    return { buffer: result, warnings };
  } catch (err) {
    warnings.push({ type: 'before_after_error', message: String(err) });
    return { buffer: fallbackBuffer, warnings };
  }
}

export async function applyAnnotations(
  imagePath: string,
  annotations: Annotation[],
  elements: InteractiveElement[],
  preset: Preset,
  options?: { theme?: Theme; dpr?: number }
): Promise<{ buffer: Buffer; warnings: AnnotationWarning[] }> {
  const basePresetColors = resolvePreset(preset);
  const themePreset = resolveTheme(options?.theme);
  const presetColors = themePreset ?? basePresetColors;
  // dpr: device pixel ratio of the screenshot. When > 1 (e.g. Retina 2x), the
  // physical image is dpr× larger than CSS pixel coordinates from the DOM.
  // All annotation coordinates are in CSS pixels; SVG is wrapped in scale(dpr).
  const dpr = options?.dpr ?? 1;
  const warnings: AnnotationWarning[] = [];

  const img = sharp(imagePath);
  const meta = await img.metadata();
  let imgWidth = meta.width ?? 1280;
  let imgHeight = meta.height ?? 720;
  // CSS-pixel canvas dimensions (used for viewport clamping inside the scaled group)
  const cssWidth = Math.round(imgWidth / dpr);
  const cssHeight = Math.round(imgHeight / dpr);
  const imgBuffer: Buffer = Buffer.from(readFileSync(imagePath));

  const beforeAfterAnn = annotations.find((a) => a.type === 'before_after');
  if (beforeAfterAnn && beforeAfterAnn.type === 'before_after') {
    return composeBeforeAfter(beforeAfterAnn, imgBuffer, warnings);
  }

  const overlayAnnotations: Annotation[] = [];
  const structuralAnnotations: Annotation[] = [];

  for (const ann of annotations) {
    if (ann.type === 'crop' || ann.type === 'resize' || ann.type === 'os_frame') {
      structuralAnnotations.push(ann);
    } else {
      overlayAnnotations.push(ann);
    }
  }

  const svgParts: string[] = [];
  const composites: sharp.OverlayOptions[] = [];

  function primaryRefOf(ann: Annotation): number | null {
    if ('ref' in ann && ann.ref != null) return ann.ref;
    if ('to_ref' in ann && (ann as { to_ref?: number }).to_ref != null) {
      return (ann as { to_ref: number }).to_ref;
    }
    return null;
  }

  const refColorMap = new Map<number, string>();
  let nextRefColorIdx = 0;
  for (const ann of overlayAnnotations) {
    const pRef = primaryRefOf(ann);
    if (pRef != null && !refColorMap.has(pRef)) {
      refColorMap.set(pRef, themePreset ? presetColors.primary : getRotatedColor(presetColors, nextRefColorIdx++));
    }
  }
  let unrefColorIdx = nextRefColorIdx;

  function resolveColor(ann: Annotation, userColor?: string): string {
    if (userColor) return userColor;
    if (themePreset) return presetColors.primary;
    const pRef = primaryRefOf(ann);
    return pRef != null && refColorMap.has(pRef)
      ? refColorMap.get(pRef)!
      : getRotatedColor(presetColors, unrefColorIdx++);
  }

  const boxOverlapCounter = new Map<string, number>();
  const occupiedOverlayBBoxes: BoundingBox[] = [];

  for (const ann of overlayAnnotations) {
    const color = resolveColor(ann);

    if (ann.type === 'box') {
      const sourceBbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!sourceBbox) continue;
      const boxKey = sourceBbox.map((n) => Math.round(n)).join(':');
      const overlapCount = boxOverlapCounter.get(boxKey) ?? 0;
      boxOverlapCounter.set(boxKey, overlapCount + 1);
      const bbox = overlapCount > 0
        ? offsetBBoxOutward(sourceBbox, overlapCount * 2)
        : sourceBbox;

      if (overlapCount > 0) {
        warnings.push({
          type: 'annotation_adjusted',
          ...(ann.ref != null ? { refs: [ann.ref] } : {}),
          message: `Box annotation on ${ann.ref != null ? `ref:${ann.ref}` : 'bbox'} overlapped with another box and was offset outward.`,
          adjusted: true,
          from: { bbox: sourceBbox },
          to: { bbox },
        });
      }
      const r = 0;
      svgParts.push(
        svgBox(
          bbox,
          ann.color ?? (themePreset ? presetColors.primary : DEFAULT_BOX_BORDER_COLOR),
          ann.line_width ?? presetColors.line_width,
          r,
          ann.label,
          presetColors.text_color
        )
      );
      occupiedOverlayBBoxes.push(bbox);
    } else if (ann.type === 'rounded_box') {
      const sourceBbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!sourceBbox) continue;
      const boxKey = sourceBbox.map((n) => Math.round(n)).join(':');
      const overlapCount = boxOverlapCounter.get(boxKey) ?? 0;
      boxOverlapCounter.set(boxKey, overlapCount + 1);
      const bbox = overlapCount > 0
        ? offsetBBoxOutward(sourceBbox, overlapCount * 2)
        : sourceBbox;

      if (overlapCount > 0) {
        warnings.push({
          type: 'annotation_adjusted',
          ...(ann.ref != null ? { refs: [ann.ref] } : {}),
          message: `Rounded box annotation on ${ann.ref != null ? `ref:${ann.ref}` : 'bbox'} overlapped with another box and was offset outward.`,
          adjusted: true,
          from: { bbox: sourceBbox },
          to: { bbox },
        });
      }
      const r = ann.border_radius ?? presetColors.border_radius ?? 8;
      svgParts.push(
        svgBox(
          bbox,
          ann.color ?? (themePreset ? presetColors.primary : DEFAULT_BOX_BORDER_COLOR),
          presetColors.line_width,
          r
        )
      );
      occupiedOverlayBBoxes.push(bbox);
    } else if (ann.type === 'arrow') {
      const fromBbox = ann.from_bbox ?? (ann.from_ref != null ? bboxForRef(ann.from_ref, elements) : null);
      const toBbox = ann.to_bbox ?? (ann.to_ref != null ? bboxForRef(ann.to_ref, elements) : null);
      if (!fromBbox || !toBbox) continue;
      const [fcx, fcy] = bboxCenter(fromBbox);
      const [tcx, tcy] = bboxCenter(toBbox);
      const adx = tcx - fcx;
      const ady = tcy - fcy;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist === 0) continue;
      const aux = adx / adist;
      const auy = ady / adist;
      svgParts.push(
        svgArrow(
          bboxEdgePoint(fromBbox, aux, auy),
          bboxEdgePoint(toBbox, -aux, -auy),
          ann.color ?? color,
          presetColors.line_width,
          ann.label,
          ann.elbow ?? false,
        )
      );
    } else if (ann.type === 'callout') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const defaultCalloutBackground = themePreset ? presetColors.primary : DEFAULT_BOX_BORDER_COLOR;
      const defaultCalloutBorder = themePreset ? presetColors.primary : DEFAULT_BOX_BORDER_COLOR;
      const defaultCalloutText = '#FFFFFF';
      const calloutBackground = ann.background ?? defaultCalloutBackground;
      const calloutBorder = ann.border_color ?? defaultCalloutBorder;
      const calloutTextColor = ann.text_color ?? (ann.background ? presetColors.text_color : defaultCalloutText);
      const callout = svgCallout(
        bbox,
        ann.text,
        ann.tail ?? 'auto',
        calloutBackground,
        calloutBorder,
        calloutTextColor,
        occupiedOverlayBBoxes,
        { width: cssWidth, height: cssHeight },
      );
      svgParts.push(callout.svg);
      occupiedOverlayBBoxes.push(callout.bbox);

      if (callout.tail !== callout.baselineTail || !bboxNearlyEqual(callout.bbox, callout.baselineBbox)) {
        warnings.push({
          type: 'annotation_adjusted',
          ...(ann.ref != null ? { refs: [ann.ref] } : {}),
          message: `Callout placement adjusted to reduce overlaps (${callout.baselineTail} → ${callout.tail}).`,
          adjusted: true,
          from: { tail: callout.baselineTail, bbox: callout.baselineBbox },
          to: { tail: callout.tail, bbox: callout.bbox },
        });
      }
    } else if (ann.type === 'text') {
      svgParts.push(
        svgText(
          ann.position[0],
          ann.position[1],
          ann.text,
          ann.font_size ?? 14,
          ann.color ?? presetColors.text_color,
          ann.background
        )
      );
      const textFontSize = ann.font_size ?? 14;
      const textW = Math.max(
        60,
        ann.text.split('\n').reduce((m, line) => Math.max(m, estimateTextWidth(line, textFontSize)), 0) + 12
      );
      const textH = ann.text.split('\n').length * (textFontSize + 4) + 8;
      occupiedOverlayBBoxes.push([ann.position[0], ann.position[1] - textFontSize, textW, textH]);
    } else if (ann.type === 'step_number') {
      const sourceEl = ann.ref != null ? elements.find((e) => e.ref === ann.ref) : undefined;
      const bbox = ann.bbox ?? sourceEl?.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const preferredBadgeTopLeft: [number, number] = sourceEl?.badge_position
        ? [sourceEl.badge_position[0], sourceEl.badge_position[1]]
        : [bbox[0] + bbox[2] + BADGE_MARGIN, bbox[1] - BADGE_DIAMETER / 2];
      const badgeTopLeft = findBadgeTopLeft(
        bbox,
        [...elements.map((e) => e.bbox), ...occupiedOverlayBBoxes],
        // Badge coordinates are CSS pixels (inside scale(dpr) group), so clamp
        // against CSS canvas dimensions, not physical pixel dimensions.
        { width: cssWidth, height: cssHeight },
        preferredBadgeTopLeft,
      );
      const badgeCx = badgeTopLeft[0] + BADGE_DIAMETER / 2;
      const badgeCy = badgeTopLeft[1] + BADGE_DIAMETER / 2;
      const preferredBbox = preferredBadgeTopLeft
        ? [preferredBadgeTopLeft[0], preferredBadgeTopLeft[1], BADGE_DIAMETER, BADGE_DIAMETER] as BoundingBox
        : null;
      const placedBbox: BoundingBox = [badgeTopLeft[0], badgeTopLeft[1], BADGE_DIAMETER, BADGE_DIAMETER];
      if (preferredBbox && !bboxNearlyEqual(preferredBbox, placedBbox, 0)) {
        warnings.push({
          type: 'annotation_adjusted',
          ...(ann.ref != null ? { refs: [ann.ref] } : {}),
          message: `Step badge on ${ann.ref != null ? `ref:${ann.ref}` : 'bbox'} overlapped with another annotation and was repositioned.`,
          adjusted: true,
          from: { bbox: preferredBbox },
          to: { bbox: placedBbox },
        });
      }
      svgParts.push(
        svgStepBadge(
          badgeCx,
          badgeCy,
          ann.number,
          ann.color ?? (themePreset ? presetColors.badge_bg : DEFAULT_BOX_BORDER_COLOR),
          presetColors.badge_text,
          bbox,
        )
      );
      occupiedOverlayBBoxes.push([badgeTopLeft[0], badgeTopLeft[1], BADGE_DIAMETER, BADGE_DIAMETER]);
    } else if (ann.type === 'click_icon') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const [cx, cy] = bboxCenter(bbox);
      svgParts.push(svgClickIcon(cx - 20, cy - 20, ann.color ?? color, ann.click_type ?? 'left'));
    } else if (ann.type === 'spotlight') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      const [, , w, h] = bbox;
      const shape = ann.shape === 'auto'
        ? (w / h > 1.5 || h / w > 1.5 ? 'ellipse' : 'rect')
        : (ann.shape ?? 'rect');
      // Use CSS dimensions: inside the scale(dpr) group, coordinates are CSS pixels.
      svgParts.push(svgSpotlight(cssWidth, cssHeight, bbox, shape));
    } else if (ann.type === 'mosaic') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      // Bbox is in CSS pixels; scale to physical pixels for sharp's pixel-level extract.
      const [mx, my, mw, mh] = bbox.map((n) => Math.round(n * dpr)) as [number, number, number, number];
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

  if (svgParts.length > 0) {
    // The SVG canvas is at physical pixel dimensions. Annotation coordinates are
    // CSS pixels, so we wrap them in a scale(dpr) group so they land correctly
    // on Retina (2x) and other high-DPR screenshots.
    const innerContent = dpr !== 1
      ? `<g transform="scale(${dpr})">\n${svgParts.join('\n')}\n</g>`
      : svgParts.join('\n');
    const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">
${innerContent}
</svg>`;
    composites.push({ input: Buffer.from(svgOverlay), top: 0, left: 0 });
  }

  let processedBuffer: Buffer = Buffer.from(imgBuffer);

  for (const ann of structuralAnnotations) {
    if (ann.type === 'crop') {
      const bbox = ann.bbox ?? (ann.ref != null ? bboxForRef(ann.ref, elements) : null);
      if (!bbox) continue;
      // bbox is in CSS pixels; scale to physical pixels for sharp's extract().
      const physPad = Math.round((ann.padding ?? 0) * dpr);
      const [cx, cy, cw, ch] = bbox.map((n) => Math.round(n * dpr)) as [number, number, number, number];
      processedBuffer = await toBuffer(
        sharp(processedBuffer).extract({
          left: Math.max(0, cx - physPad),
          top: Math.max(0, cy - physPad),
          width: Math.min(imgWidth - cx + physPad, cw + physPad * 2),
          height: Math.min(imgHeight - cy + physPad, ch + physPad * 2),
        })
      );
      const newMeta = await sharp(processedBuffer).metadata();
      imgWidth = newMeta.width ?? imgWidth;
      imgHeight = newMeta.height ?? imgHeight;
    } else if (ann.type === 'resize') {
      processedBuffer = await toBuffer(sharp(processedBuffer).resize({ width: ann.width }));
      const newMeta = await sharp(processedBuffer).metadata();
      imgWidth = newMeta.width ?? ann.width;
      imgHeight = newMeta.height ?? imgHeight;
    } else if (ann.type === 'os_frame') {
      const style = ann.style ?? 'auto';
      const { svgOverlay, padTop } = svgOsFrame(imgWidth, imgHeight, style);

      const extended = await toBuffer(
        sharp({
          create: {
            width: imgWidth,
            height: imgHeight + padTop,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
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

  if (composites.length > 0) {
    processedBuffer = await toBuffer(sharp(processedBuffer).composite(composites).png());
  }

  return { buffer: processedBuffer, warnings };
}

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
      return svgStepBadge(
        bx + BADGE_DIAMETER / 2,
        by + BADGE_DIAMETER / 2,
        el.badge_number!,
        color,
        presetColors.badge_text,
        el.bbox,
      );
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

  await page.evaluate(() => {
    const el = document.getElementById('__lumoshot_overlay__');
    if (el) el.remove();
  });

  return screenshotBuffer;
}
