import sharp from 'sharp';
import type { Page } from 'playwright';
import type { BoundingBox, InteractiveElement, ScreenRegion, ScreenRegionKind } from '../../types.js';

type RegionSource = 'dom' | 'image';

interface RawRegion {
  kind: ScreenRegionKind;
  label: string;
  bbox: BoundingBox;
  confidence: number;
}

export interface RegionDetectionOptions {
  granularity?: 'coarse' | 'normal' | 'fine';
}

const LANDMARK_DEFINITIONS: Array<{
  kind: ScreenRegionKind;
  label: string;
  confidence: number;
  selectors: string[];
}> = [
  {
    kind: 'toolbar',
    label: 'Toolbar',
    confidence: 0.9,
    selectors: ['header', '[role="banner"]', '[role="toolbar"]', '.toolbar', '#toolbar'],
  },
  {
    kind: 'sidebar',
    label: 'Sidebar',
    confidence: 0.88,
    selectors: ['aside', '[role="complementary"]', '.sidebar', '#sidebar', '.sidenav', '#sidenav'],
  },
  {
    kind: 'main',
    label: 'Main Content',
    confidence: 0.92,
    selectors: ['main', '[role="main"]', '.main', '#main', '#content', '.content'],
  },
  {
    kind: 'footer',
    label: 'Footer',
    confidence: 0.86,
    selectors: ['footer', '[role="contentinfo"]', '[role="status"]', '.footer', '#footer'],
  },
];

function clampBoxToViewport(
  bbox: BoundingBox,
  viewport: { width: number; height: number },
): BoundingBox {
  const x = Math.max(0, Math.min(Math.round(bbox[0]), viewport.width));
  const y = Math.max(0, Math.min(Math.round(bbox[1]), viewport.height));
  const maxW = Math.max(0, viewport.width - x);
  const maxH = Math.max(0, viewport.height - y);
  const w = Math.max(0, Math.min(Math.round(bbox[2]), maxW));
  const h = Math.max(0, Math.min(Math.round(bbox[3]), maxH));
  return [x, y, w, h];
}

function bboxArea(bbox: BoundingBox): number {
  return Math.max(0, bbox[2]) * Math.max(0, bbox[3]);
}

function bboxIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = bboxArea(a) + bboxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

function dedupeRegions(regions: RawRegion[]): RawRegion[] {
  const sorted = [...regions].sort((a, b) => b.confidence - a.confidence);
  const kept: RawRegion[] = [];
  for (const region of sorted) {
    const overlaps = kept.some((k) => {
      if (k.kind !== region.kind) return false;
      return bboxIoU(k.bbox, region.bbox) >= 0.75;
    });
    if (!overlaps) kept.push(region);
  }
  return kept;
}

function granularityLimit(granularity: RegionDetectionOptions['granularity']): number {
  switch (granularity) {
    case 'coarse':
      return 4;
    case 'fine':
      return 8;
    default:
      return 6;
  }
}

function finalizeRegions(
  regions: RawRegion[],
  source: RegionSource,
  options: RegionDetectionOptions,
): ScreenRegion[] {
  const deduped = dedupeRegions(regions)
    .filter((r) => bboxArea(r.bbox) >= 2_000)
    .sort((a, b) => {
      const ay = a.bbox[1] - b.bbox[1];
      if (ay !== 0) return ay;
      return a.bbox[0] - b.bbox[0];
    })
    .slice(0, granularityLimit(options.granularity));

  return deduped.map((region, idx) => ({
    id: `region_${idx + 1}`,
    kind: region.kind,
    label: region.label,
    bbox: region.bbox,
    source,
    confidence: Number(region.confidence.toFixed(2)),
  }));
}

function classifyCell(
  cell: BoundingBox,
  viewport: { width: number; height: number },
): { kind: ScreenRegionKind; label: string; confidence: number } {
  const [x, y, w, h] = cell;
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const nx = x / vw;
  const ny = y / vh;
  const nw = w / vw;
  const nh = h / vh;

  if (ny <= 0.12 && nw >= 0.7 && nh <= 0.24) {
    return { kind: 'toolbar', label: 'Top Bar', confidence: 0.8 };
  }
  if (ny + nh >= 0.86 && nw >= 0.6 && nh <= 0.2) {
    return { kind: 'statusbar', label: 'Status Bar', confidence: 0.74 };
  }
  if (nx <= 0.18 && nh >= 0.35 && nw <= 0.32) {
    return { kind: 'sidebar', label: 'Sidebar', confidence: 0.82 };
  }
  if (nw >= 0.42 && nh >= 0.3) {
    return { kind: 'main', label: 'Main Area', confidence: 0.76 };
  }
  return { kind: 'panel', label: 'Panel', confidence: 0.62 };
}

function smoothSeries(values: number[]): number[] {
  if (values.length <= 2) return values;
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    const prev = values[Math.max(0, i - 1)] ?? values[i] ?? 0;
    const curr = values[i] ?? 0;
    const next = values[Math.min(values.length - 1, i + 1)] ?? values[i] ?? 0;
    out[i] = (prev + curr + next) / 3;
  }
  return out;
}

function pickBoundaries(
  energy: number[],
  axisSize: number,
  maxCuts: number,
): number[] {
  if (energy.length < 8) return [];
  const smoothed = smoothSeries(energy);
  const mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
  const variance = smoothed.reduce((a, b) => a + (b - mean) ** 2, 0) / smoothed.length;
  const std = Math.sqrt(variance);
  const threshold = mean + std * 1.15;
  const minDistance = Math.max(18, Math.round(axisSize * 0.08));

  const candidates = smoothed
    .map((score, idx) => ({ idx, score }))
    .filter((p) => p.idx > minDistance && p.idx < axisSize - minDistance && p.score >= threshold)
    .sort((a, b) => b.score - a.score);

  const cuts: number[] = [];
  for (const candidate of candidates) {
    if (cuts.length >= maxCuts) break;
    const tooClose = cuts.some((cut) => Math.abs(cut - candidate.idx) < minDistance);
    if (!tooClose) cuts.push(candidate.idx);
  }

  return cuts.sort((a, b) => a - b);
}

export async function detectRegionsFromImage(
  imagePath: string,
  options: RegionDetectionOptions = {},
): Promise<ScreenRegion[]> {
  const meta = await sharp(imagePath).metadata();
  const origW = meta.width ?? 1280;
  const origH = meta.height ?? 720;
  const scale = Math.min(1, 1280 / origW, 720 / origH);
  const scanW = Math.max(160, Math.round(origW * scale));
  const scanH = Math.max(120, Math.round(origH * scale));
  const sx = origW / scanW;
  const sy = origH / scanH;

  const { data, info } = await sharp(imagePath)
    .resize({ width: scanW, height: scanH, fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const rowEnergy = new Array(height).fill(0);
  const colEnergy = new Array(width).fill(0);

  for (let y = 1; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const prev = ((y - 1) * width + x) * channels;
      const a = data[idx] ?? 0;
      const b = data[prev] ?? 0;
      sum += Math.abs(a - b);
    }
    rowEnergy[y] = sum / width;
  }
  for (let x = 1; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * channels;
      const prev = (y * width + (x - 1)) * channels;
      const a = data[idx] ?? 0;
      const b = data[prev] ?? 0;
      sum += Math.abs(a - b);
    }
    colEnergy[x] = sum / height;
  }

  const maxCuts = options.granularity === 'fine' ? 4 : options.granularity === 'coarse' ? 2 : 3;
  const xCuts = [0, ...pickBoundaries(colEnergy, width, maxCuts), width];
  const yCuts = [0, ...pickBoundaries(rowEnergy, height, maxCuts), height];

  const rawRegions: RawRegion[] = [];
  for (let yi = 0; yi < yCuts.length - 1; yi++) {
    for (let xi = 0; xi < xCuts.length - 1; xi++) {
      const x0 = xCuts[xi] ?? 0;
      const x1 = xCuts[xi + 1] ?? width;
      const y0 = yCuts[yi] ?? 0;
      const y1 = yCuts[yi + 1] ?? height;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < width * 0.1 || h < height * 0.08) continue;
      if (w * h < width * height * 0.03) continue;

      const mapped: BoundingBox = [
        Math.round(x0 * sx),
        Math.round(y0 * sy),
        Math.round(w * sx),
        Math.round(h * sy),
      ];
      const { kind, label, confidence } = classifyCell(mapped, { width: origW, height: origH });
      rawRegions.push({ kind, label, bbox: mapped, confidence });
    }
  }

  if (!rawRegions.some((r) => r.kind === 'main')) {
    rawRegions.push({
      kind: 'main',
      label: 'Main Area',
      bbox: [Math.round(origW * 0.2), Math.round(origH * 0.12), Math.round(origW * 0.75), Math.round(origH * 0.78)],
      confidence: 0.5,
    });
  }

  return finalizeRegions(rawRegions, 'image', options);
}

export async function detectRegionsFromPage(
  page: Page,
  elements: InteractiveElement[],
  options: RegionDetectionOptions = {},
): Promise<ScreenRegion[]> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  const regionsFromLandmarks = await page.evaluate((definitions) => {
    type Candidate = {
      kind: string;
      label: string;
      bbox: [number, number, number, number];
      confidence: number;
    };

    const out: Candidate[] = [];
    const isVisible = (el: Element): boolean => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width < 40 || rect.height < 24) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
    };

    for (const def of definitions as Array<{ kind: string; label: string; confidence: number; selectors: string[] }>) {
      let best: Candidate | null = null;
      for (const selector of def.selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          if (!isVisible(node)) continue;
          const r = (node as HTMLElement).getBoundingClientRect();
          const bbox: [number, number, number, number] = [
            Math.round(r.left),
            Math.round(r.top),
            Math.round(r.width),
            Math.round(r.height),
          ];
          const area = bbox[2] * bbox[3];
          if (!best || area > best.bbox[2] * best.bbox[3]) {
            best = { kind: def.kind, label: def.label, bbox, confidence: def.confidence };
          }
        }
      }
      if (best) out.push(best);
    }
    return out;
  }, LANDMARK_DEFINITIONS);

  const rawRegions: RawRegion[] = regionsFromLandmarks.map((r) => ({
    kind: r.kind as ScreenRegionKind,
    label: r.label,
    bbox: clampBoxToViewport(r.bbox as BoundingBox, viewport),
    confidence: r.confidence,
  }));

  if (!rawRegions.some((r) => r.kind === 'main') && elements.length > 0) {
    const left = Math.min(...elements.map((e) => e.bbox[0]));
    const top = Math.min(...elements.map((e) => e.bbox[1]));
    const right = Math.max(...elements.map((e) => e.bbox[0] + e.bbox[2]));
    const bottom = Math.max(...elements.map((e) => e.bbox[1] + e.bbox[3]));
    rawRegions.push({
      kind: 'main',
      label: 'Main Content',
      bbox: clampBoxToViewport([left, top, right - left, bottom - top], viewport),
      confidence: 0.62,
    });
  }

  if (!rawRegions.some((r) => r.kind === 'sidebar')) {
    const sidebarEls = elements.filter((el) => el.bbox[0] < viewport.width * 0.2);
    if (sidebarEls.length >= 4) {
      const left = Math.min(...sidebarEls.map((e) => e.bbox[0]));
      const top = Math.min(...sidebarEls.map((e) => e.bbox[1]));
      const right = Math.max(...sidebarEls.map((e) => e.bbox[0] + e.bbox[2]));
      const bottom = Math.max(...sidebarEls.map((e) => e.bbox[1] + e.bbox[3]));
      rawRegions.push({
        kind: 'sidebar',
        label: 'Sidebar',
        bbox: clampBoxToViewport([left, top, right - left, bottom - top], viewport),
        confidence: 0.58,
      });
    }
  }

  if (!rawRegions.some((r) => r.kind === 'toolbar')) {
    const topEls = elements.filter((el) => el.bbox[1] < viewport.height * 0.16);
    if (topEls.length >= 3) {
      const left = Math.min(...topEls.map((e) => e.bbox[0]));
      const top = Math.min(...topEls.map((e) => e.bbox[1]));
      const right = Math.max(...topEls.map((e) => e.bbox[0] + e.bbox[2]));
      const bottom = Math.max(...topEls.map((e) => e.bbox[1] + e.bbox[3]));
      rawRegions.push({
        kind: 'toolbar',
        label: 'Top Bar',
        bbox: clampBoxToViewport([left, top, right - left, bottom - top], viewport),
        confidence: 0.55,
      });
    }
  }

  if (!rawRegions.some((r) => r.kind === 'panel')) {
    const candidatePanels = elements
      .filter((el) => bboxArea(el.bbox) >= viewport.width * viewport.height * 0.06)
      .slice(0, 2);
    for (const panel of candidatePanels) {
      rawRegions.push({
        kind: 'panel',
        label: 'Panel',
        bbox: clampBoxToViewport(panel.bbox, viewport),
        confidence: 0.5,
      });
    }
  }

  return finalizeRegions(rawRegions, 'dom', options);
}
