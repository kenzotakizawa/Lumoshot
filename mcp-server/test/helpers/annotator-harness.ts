import sharp from 'sharp';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type BBox = [number, number, number, number];

export interface FakeElement {
  ref: number;
  type: string;
  role: string;
  label: string;
  value: undefined;
  bbox: BBox;
  interactive: boolean;
}

export const IMG_W = 800;
export const IMG_H = 600;

export const ELEMENTS: FakeElement[] = [
  {
    ref: 1,
    type: 'button',
    role: 'button',
    label: '送信',
    value: undefined,
    bbox: [300, 250, 140, 44],
    interactive: true,
  },
  {
    ref: 2,
    type: 'input',
    role: 'textbox',
    label: 'メール',
    value: undefined,
    bbox: [80, 120, 240, 36],
    interactive: true,
  },
  {
    ref: 3,
    type: 'link',
    role: 'link',
    label: '詳細を見る',
    value: undefined,
    bbox: [80, 400, 120, 24],
    interactive: true,
  },
];

export type ApplyAnnotationsFn = (
  imagePath: string,
  annotations: unknown[],
  elements: unknown[],
  preset: string,
  options?: { theme?: 'red' | 'blue' | 'mono' },
) => Promise<{ buffer: Buffer; warnings: unknown[] }>;

export interface AnnotatorHarness {
  tempDir: string;
  basePng: string;
  applyAnnotations: ApplyAnnotationsFn;
  savePng: (name: string, buf: Buffer) => string;
  differsFromBase: (buf: Buffer) => boolean;
  imgMeta: (buf: Buffer) => ReturnType<typeof sharp.prototype.metadata>;
  cleanup: () => void;
}

export async function setupAnnotatorHarness(): Promise<AnnotatorHarness> {
  const tempDir = mkdtempSync(join(tmpdir(), 'lumoshot-ann-test-'));

  const grey = { r: 245, g: 245, b: 245, alpha: 1 as const };
  const white = { r: 255, g: 255, b: 255, alpha: 1 as const };
  const blue = { r: 49, g: 130, b: 206, alpha: 1 as const };

  const inputRect = await sharp({
    create: { width: 240, height: 36, channels: 4, background: white },
  }).png().toBuffer();
  const submitBtn = await sharp({
    create: { width: 140, height: 44, channels: 4, background: blue },
  }).png().toBuffer();

  const baseBuf = await sharp({
    create: { width: IMG_W, height: IMG_H, channels: 4, background: grey },
  }).composite([
    { input: inputRect, left: 80, top: 120 },
    { input: submitBtn, left: 300, top: 250 },
  ]).png().toBuffer();

  const basePng = join(tempDir, 'base.png');
  writeFileSync(basePng, Buffer.from(baseBuf));
  const basePngBytes = readFileSync(basePng);

  const mod = await import('../../dist/engine/annotator.js');
  const applyAnnotations = mod.applyAnnotations as ApplyAnnotationsFn;

  return {
    tempDir,
    basePng,
    applyAnnotations,
    savePng(name: string, buf: Buffer): string {
      const p = join(tempDir, `${name}.png`);
      writeFileSync(p, buf);
      return p;
    },
    differsFromBase(buf: Buffer): boolean {
      return !buf.equals(basePngBytes);
    },
    imgMeta(buf: Buffer) {
      return sharp(buf).metadata();
    },
    cleanup() {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}
