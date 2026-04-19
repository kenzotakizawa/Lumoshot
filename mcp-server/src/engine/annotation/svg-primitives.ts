import { platform } from 'os';
import type { BoundingBox } from '../../types.js';
import { clamp, estimateTextWidth, overlapArea } from './geometry.js';

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function svgBox(
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
    svg += `<text x="${lx}" y="${ly - 2}" text-anchor="middle"
      font-family="system-ui,sans-serif" font-size="${fontSize}" fill="#fff">${escapeXml(label)}</text>`;
  }
  return svg;
}

export function svgArrow(
  from: [number, number],
  to: [number, number],
  color: string,
  strokeWidth: number,
  label?: string,
  elbow = false,
): string {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const markerId = `arrow-${Math.random().toString(36).slice(2)}`;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ux = dist > 0 ? dx / dist : 1;
  const uy = dist > 0 ? dy / dist : 0;

  const GAP = 20;
  let ex = dist > GAP * 2 ? x2 - ux * GAP : x2;
  let ey = dist > GAP * 2 ? y2 - uy * GAP : y2;

  let svg = `
<defs>
  <marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5"
    markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" />
  </marker>
</defs>
`;

  let labelAnchor: [number, number];
  let labelNormal: [number, number];

  // Bend ratio for elbow arrows: 0.58 places the turn slightly past the midpoint
  // toward the destination, giving a natural L-shape that reads as directional.
  const ELBOW_BEND_RATIO = 0.58;

  const canElbow = elbow && Math.abs(x2 - x1) > 28 && Math.abs(y2 - y1) > 28;
  if (canElbow) {
    const horizontalFirst = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    if (horizontalFirst) {
      const bendX = x1 + (x2 - x1) * ELBOW_BEND_RATIO;
      const endDir = x2 >= bendX ? 1 : -1;
      ex = x2 - endDir * Math.min(GAP, Math.abs(x2 - bendX) / 2);
      ey = y2;
      svg += `<polyline points="${x1},${y1} ${bendX},${y1} ${bendX},${ey} ${ex},${ey}"
  fill="none" stroke="${color}" stroke-width="${strokeWidth}" marker-end="url(#${markerId})" />`;
      labelAnchor = [bendX, (y1 + ey) / 2];
      labelNormal = [1, 0];
    } else {
      const bendY = y1 + (y2 - y1) * ELBOW_BEND_RATIO;
      const endDir = y2 >= bendY ? 1 : -1;
      ex = x2;
      ey = y2 - endDir * Math.min(GAP, Math.abs(y2 - bendY) / 2);
      svg += `<polyline points="${x1},${y1} ${x1},${bendY} ${ex},${bendY} ${ex},${ey}"
  fill="none" stroke="${color}" stroke-width="${strokeWidth}" marker-end="url(#${markerId})" />`;
      labelAnchor = [(x1 + ex) / 2, bendY];
      labelNormal = [0, 1];
    }
  } else {
    svg += `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"
  stroke="${color}" stroke-width="${strokeWidth}"
  marker-end="url(#${markerId})" />`;
    labelAnchor = [(x1 + ex) / 2, (y1 + ey) / 2];
    labelNormal = [-uy, ux];
  }

  if (label) {
    const [mx, my] = labelAnchor;
    const [nx, ny] = labelNormal;
    const lx = mx + nx * 16;
    const ly = my + ny * 16;

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

export function svgStepBadge(
  cx: number,
  cy: number,
  num: number,
  bgColor: string,
  textColor: string,
  targetBbox?: BoundingBox
): string {
  const r = 14;
  let svg = '';

  if (targetBbox) {
    const [bx, by, bw, bh] = targetBbox;
    // Nearest-edge-midpoint: connect leader line to the midpoint of the element
    // edge that faces the badge. This avoids the "pointing at a corner" artifact
    // of the naive clamp-to-nearest-point approach.
    const elemCx = bx + bw / 2;
    const elemCy = by + bh / 2;
    const ddx = cx - elemCx;
    const ddy = cy - elemCy;
    let anchorX: number;
    let anchorY: number;
    if (Math.abs(ddx) >= Math.abs(ddy)) {
      anchorX = ddx > 0 ? bx + bw : bx;
      anchorY = by + bh / 2;
    } else {
      anchorX = bx + bw / 2;
      anchorY = ddy > 0 ? by + bh : by;
    }
    const dx = anchorX - cx;
    const dy = anchorY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > r + 2) {
      const ux = dx / dist;
      const uy = dy / dist;
      const startX = cx + ux * (r + 2);
      const startY = cy + uy * (r + 2);
      const endX = anchorX - ux * 2;
      const endY = anchorY - uy * 2;
      svg += `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}"
  stroke="${bgColor}" stroke-width="1.5" stroke-linecap="round" />`;
    }
  }

  svg += `
<circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="white" />
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bgColor}" />
<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="middle"
  font-family="system-ui,sans-serif" font-size="${num > 9 ? '11' : '13'}" font-weight="bold"
  fill="${textColor}">${num}</text>`;
  return svg;
}

type TailDirection = 'top' | 'bottom' | 'left' | 'right';

export interface CalloutRenderResult {
  svg: string;
  bbox: BoundingBox;
  tail: TailDirection;
  baselineTail: TailDirection;
  baselineBbox: BoundingBox;
}

export function svgCallout(
  bbox: BoundingBox,
  text: string,
  tail: string,
  bgColor: string,
  borderColor: string,
  textColor: string,
  occupied: BoundingBox[] = [],
  imageSize?: { width: number; height: number },
): CalloutRenderResult {
  const [bx, by, bw, bh] = bbox;
  const pad = 10;
  const fontSize = 13;
  const lineHeight = fontSize + 4;
  const maxBubbleWidth = 280;
  const minBubbleWidth = 120;
  const maxTextWidth = maxBubbleWidth - pad * 2;
  const lines = wrapText(text, fontSize, maxTextWidth);
  const widestLine = Math.max(
    1,
    ...lines.map((line) => estimateTextWidth(line, fontSize)),
  );
  const cw = clamp(Math.ceil(widestLine + pad * 2), minBubbleWidth, maxBubbleWidth);
  const ch = lines.length * lineHeight + pad * 2;
  const tailH = 16;
  const margin = 8;

  const parsedTail: TailDirection | 'auto' = tail === 'auto'
    ? 'auto'
    : tail === 'top' || tail === 'bottom' || tail === 'left' || tail === 'right'
      ? tail
      : 'top';

  const autoBaselineTail: TailDirection = by > ch + tailH + 20 ? 'bottom' : 'top';
  const baselineTail: TailDirection = parsedTail === 'auto'
    ? autoBaselineTail
    : parsedTail;

  const candidateTails: TailDirection[] = parsedTail === 'auto'
    ? ['bottom', 'top', 'right', 'left']
    : [baselineTail];

  const offsetsByTail: Record<TailDirection, number[]> = {
    top: [0, -80, 80, -160, 160],
    bottom: [0, -80, 80, -160, 160],
    left: [0, -60, 60, -120, 120],
    right: [0, -60, 60, -120, 120],
  };

  function computePlacement(effectiveTail: TailDirection, shift: number): {
    tail: TailDirection;
    bbox: BoundingBox;
    tailPath: string;
  } {
    let cx = 0;
    let cy = 0;
    let tipX = 0;
    let tipY = 0;

    if (effectiveTail === 'bottom') {
      cx = bx + bw / 2 - cw / 2 + shift;
      cy = by - ch - tailH - 4;
      tipX = bx + bw / 2;
      tipY = by - 4;
    } else if (effectiveTail === 'top') {
      cx = bx + bw / 2 - cw / 2 + shift;
      cy = by + bh + tailH + 4;
      tipX = bx + bw / 2;
      tipY = by + bh + 4;
    } else if (effectiveTail === 'left') {
      cx = bx + bw + tailH + 4;
      cy = by + bh / 2 - ch / 2 + shift;
      tipX = bx + bw + 4;
      tipY = by + bh / 2;
    } else {
      cx = bx - cw - tailH - 4;
      cy = by + bh / 2 - ch / 2 + shift;
      tipX = bx - 4;
      tipY = by + bh / 2;
    }

    if (imageSize) {
      const maxX = Math.max(margin, imageSize.width - cw - margin);
      const maxY = Math.max(margin, imageSize.height - ch - margin);
      cx = clamp(cx, margin, maxX);
      cy = clamp(cy, margin, maxY);
    } else {
      cx = Math.max(margin, cx);
      cy = Math.max(margin, cy);
    }

    let tailPath = '';
    if (effectiveTail === 'bottom') {
      const baseY = cy + ch;
      const baseX = clamp(tipX, cx + 10, cx + cw - 10);
      const safeTipYRaw = Math.max(tipY, baseY + 4);
      const safeTipY = imageSize
        ? clamp(safeTipYRaw, margin, imageSize.height - margin)
        : safeTipYRaw;
      tailPath = `M ${baseX} ${safeTipY} L ${baseX - 8} ${baseY} L ${baseX + 8} ${baseY} Z`;
    } else if (effectiveTail === 'top') {
      const baseY = cy;
      const baseX = clamp(tipX, cx + 10, cx + cw - 10);
      const safeTipYRaw = Math.min(tipY, baseY - 4);
      const safeTipY = imageSize
        ? clamp(safeTipYRaw, margin, imageSize.height - margin)
        : safeTipYRaw;
      tailPath = `M ${baseX} ${safeTipY} L ${baseX - 8} ${baseY} L ${baseX + 8} ${baseY} Z`;
    } else if (effectiveTail === 'left') {
      const baseX = cx;
      const baseY = clamp(tipY, cy + 10, cy + ch - 10);
      const safeTipXRaw = Math.max(tipX, baseX + 4);
      const safeTipX = imageSize
        ? clamp(safeTipXRaw, margin, imageSize.width - margin)
        : safeTipXRaw;
      tailPath = `M ${safeTipX} ${baseY} L ${baseX} ${baseY - 8} L ${baseX} ${baseY + 8} Z`;
    } else {
      const baseX = cx + cw;
      const baseY = clamp(tipY, cy + 10, cy + ch - 10);
      const safeTipXRaw = Math.min(tipX, baseX - 4);
      const safeTipX = imageSize
        ? clamp(safeTipXRaw, margin, imageSize.width - margin)
        : safeTipXRaw;
      tailPath = `M ${safeTipX} ${baseY} L ${baseX} ${baseY - 8} L ${baseX} ${baseY + 8} Z`;
    }

    return {
      tail: effectiveTail,
      bbox: [cx, cy, cw, ch],
      tailPath,
    };
  }

  const baselinePlacement = computePlacement(baselineTail, 0);

  let bestPlacement = baselinePlacement;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const t of candidateTails) {
    for (const shift of offsetsByTail[t]) {
      const candidate = computePlacement(t, shift);
      const overlapScore = occupied.reduce((acc, ob) => acc + overlapArea(candidate.bbox, ob), 0);
      const shiftPenalty = Math.abs(shift) * 0.2;
      const tailPenalty = t === baselineTail ? 0 : 8;
      const score = overlapScore + shiftPenalty + tailPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestPlacement = candidate;
      }
    }
  }

  const [cx, cy] = bestPlacement.bbox;
  let svg = `
<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"
  rx="6" ry="6" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5" />
<path d="${bestPlacement.tailPath}" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5" />`;

  lines.forEach((line, i) => {
    svg += `<text x="${cx + pad}" y="${cy + pad + fontSize + i * lineHeight}"
      font-family="system-ui,sans-serif" font-size="${fontSize}" fill="${textColor}">${escapeXml(line)}</text>`;
  });

  return {
    svg,
    bbox: bestPlacement.bbox,
    tail: bestPlacement.tail,
    baselineTail,
    baselineBbox: baselinePlacement.bbox,
  };
}

function wrapText(text: string, fontSize: number, maxTextWidth: number): string[] {
  const wrapped: string[] = [];
  const rawLines = text.split('\n');

  for (const rawLine of rawLines) {
    if (rawLine.length === 0) {
      wrapped.push('');
      continue;
    }

    let current = '';
    for (const ch of rawLine) {
      const next = current + ch;
      if (estimateTextWidth(next, fontSize) <= maxTextWidth || current.length === 0) {
        current = next;
        continue;
      }
      wrapped.push(current);
      current = ch;
    }
    if (current.length > 0) {
      wrapped.push(current);
    }
  }

  return wrapped.length > 0 ? wrapped : [''];
}

export function svgText(
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

export function svgClickIcon(cx: number, cy: number, color: string, clickType: string): string {
  const TIP_X = cx + 10;
  const TIP_Y = cy + 10;
  const STROKE = 2;
  const DARK = '#1a1a2e';
  const LINE_GAP = 8;
  const CENTER_ANGLE = clickType === 'right' ? 325 : 215;
  const angles = [CENTER_ANGLE - 20, CENTER_ANGLE, CENTER_ANGLE + 20];
  const lens = [18, 24, 18];

  let svg = '';

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

  const cursorPath = `M ${TIP_X} ${TIP_Y} L ${TIP_X} ${TIP_Y + 28} L ${TIP_X + 6} ${TIP_Y + 22} L ${TIP_X + 11} ${TIP_Y + 34} L ${TIP_X + 15} ${TIP_Y + 32} L ${TIP_X + 10} ${TIP_Y + 20} L ${TIP_X + 18} ${TIP_Y + 20} Z`;

  svg += `<path d="${cursorPath}" fill="white" stroke="none" />`;
  svg += `<path d="${cursorPath}" fill="none" stroke="${DARK}" stroke-width="${STROKE}" stroke-linejoin="round" />`;

  if (clickType === 'double') {
    svg += `<circle cx="${TIP_X + 9}" cy="${TIP_Y - 8}" r="4" fill="${color}" />`;
    svg += `<circle cx="${TIP_X + 9}" cy="${TIP_Y - 18}" r="4" fill="${color}" />`;
  }

  return svg;
}

export function svgSpotlight(
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
}

export function svgOsFrame(
  imgWidth: number,
  _imgHeight: number,
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
    titleBar = `<rect x="0" y="0" width="${imgWidth + padSide * 2}" height="${titleBarH}"
      rx="12" ry="12" fill="#e0e0e0" />\n` + titleBar;
  } else if (os === 'windows') {
    const btnW = 46;
    titleBar = `<rect x="0" y="0" width="${imgWidth}" height="${titleBarH}" fill="#202020" />`;
    ['minimize', 'maximize', 'close'].forEach((_, i) => {
      const bx = imgWidth - btnW * (3 - i);
      titleBar += `<rect x="${bx}" y="0" width="${btnW}" height="${titleBarH}" fill="transparent" />`;
    });
    const cx = imgWidth - btnW / 2;
    const cy = titleBarH / 2;
    titleBar += `<line x1="${cx - 6}" y1="${cy - 6}" x2="${cx + 6}" y2="${cy + 6}" stroke="white" stroke-width="1.5"/>`;
    titleBar += `<line x1="${cx + 6}" y1="${cy - 6}" x2="${cx - 6}" y2="${cy + 6}" stroke="white" stroke-width="1.5"/>`;
  } else {
    titleBar = `<rect x="0" y="0" width="${imgWidth}" height="${titleBarH}" fill="#333" />`;
    titleBar += `<circle cx="${imgWidth - 14}" cy="${titleBarH / 2}" r="6" fill="#e74c3c" />`;
    titleBar += `<circle cx="${imgWidth - 34}" cy="${titleBarH / 2}" r="6" fill="#f39c12" />`;
    titleBar += `<circle cx="${imgWidth - 54}" cy="${titleBarH / 2}" r="6" fill="#2ecc71" />`;
  }

  const svgOverlay = titleBar;
  return { svgOverlay, padTop: titleBarH, padSide, padBottom };
}
