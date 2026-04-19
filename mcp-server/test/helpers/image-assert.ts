import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { config } from '../../src/config.js';

export function hasBadgesInImage(annotatedPath: string, rawPath: string): boolean {
  if (!existsSync(annotatedPath) || !existsSync(rawPath)) return false;
  const annotatedSize = statSync(annotatedPath).size;
  const rawSize = statSync(rawPath).size;
  return annotatedSize !== rawSize;
}

export function findRawForStep(outputDir: string, stepPrefix: string): string | null {
  const rawDir = join(outputDir, 'raw');
  if (!existsSync(rawDir)) return null;
  const files = readdirSync(rawDir);
  const match = files.find((f) =>
    f.startsWith(stepPrefix) && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
  );
  return match ? join(rawDir, match) : null;
}

export async function hasRedOutlineNearBBox(
  imagePath: string,
  bbox: [number, number, number, number],
): Promise<boolean> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // bbox coordinates are CSS pixels. The image is captured at device_pixel_ratio,
  // so multiply by DPR to get physical pixel positions in the image.
  const dpr = config.capture.device_pixel_ratio;
  const [x0, y0, w0, h0] = bbox.map((n) => Math.round(n * dpr));
  const x = Math.max(0, x0);
  const y = Math.max(0, y0);
  const w = Math.max(1, Math.min(w0, info.width - x));
  const h = Math.max(1, Math.min(h0, info.height - y));
  const ch = info.channels;

  let redHits = 0;

  const isRed = (px: number, py: number): boolean => {
    if (px < 0 || py < 0 || px >= info.width || py >= info.height) return false;
    const i = (py * info.width + px) * ch;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = ch >= 4 ? (data[i + 3] ?? 255) : 255;
    return r >= 180 && g <= 110 && b <= 110 && a >= 140;
  };

  for (let dx = 0; dx < w; dx += 2) {
    for (const oy of [-1, 0, 1, h - 1, h, h + 1]) {
      if (isRed(x + dx, y + oy)) redHits++;
    }
  }
  for (let dy = 0; dy < h; dy += 2) {
    for (const ox of [-1, 0, 1, w - 1, w, w + 1]) {
      if (isRed(x + ox, y + dy)) redHits++;
    }
  }

  return redHits >= Math.max(16, Math.floor((w + h) / 8));
}
