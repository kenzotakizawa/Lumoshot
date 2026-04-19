import type { Annotation, AnnotateResult } from '../../types.js';

type BBox = [number, number, number, number];
type ElementWithBox = { ref: number; bbox: BBox; [k: string]: unknown };

function bboxFromRef(ref: number | undefined, elements: ElementWithBox[]): BBox | null {
  if (ref == null) return null;
  const found = elements.find((el) => el.ref === ref);
  return found?.bbox ?? null;
}

function resolveAnnotationBBox(annotation: Annotation, elements: ElementWithBox[]): BBox | null {
  switch (annotation.type) {
    case 'box':
    case 'rounded_box':
    case 'callout':
    case 'step_number':
    case 'click_icon':
    case 'spotlight':
    case 'mosaic':
    case 'crop':
      return annotation.bbox ?? bboxFromRef(annotation.ref, elements);
    case 'arrow': {
      const from = annotation.from_bbox ?? bboxFromRef(annotation.from_ref, elements);
      const to = annotation.to_bbox ?? bboxFromRef(annotation.to_ref, elements);
      if (!from || !to) return null;
      const left = Math.min(from[0], to[0]);
      const top = Math.min(from[1], to[1]);
      const right = Math.max(from[0] + from[2], to[0] + to[2]);
      const bottom = Math.max(from[1] + from[3], to[1] + to[3]);
      return [left, top, right - left, bottom - top];
    }
    case 'text': {
      const fontSize = annotation.font_size ?? 14;
      const width = Math.max(60, annotation.text.length * Math.max(6, fontSize * 0.6));
      const height = fontSize + 10;
      return [annotation.position[0], annotation.position[1] - fontSize, width, height];
    }
    case 'resize':
    case 'os_frame':
    case 'before_after':
      return null;
  }
}

function overlaps(a: BBox, b: BBox): boolean {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function detectOverlapWarnings(
  annotations: Annotation[],
  elements: ElementWithBox[],
): AnnotateResult['warnings'] {
  const warnings: AnnotateResult['warnings'] = [];
  const seen = new Set<string>();

  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    const boxA = resolveAnnotationBBox(a, elements);
    if (!boxA) continue;

    for (let j = i + 1; j < annotations.length; j++) {
      const b = annotations[j];
      const boxB = resolveAnnotationBBox(b, elements);
      if (!boxB || !overlaps(boxA, boxB)) continue;

      const key = `${i}:${j}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const refs: number[] = [];
      if ('ref' in a && typeof a.ref === 'number') refs.push(a.ref);
      if ('ref' in b && typeof b.ref === 'number') refs.push(b.ref);

      warnings.push({
        type: 'overlap',
        ...(refs.length > 0 ? { refs } : {}),
        message: `Annotations ${i + 1} and ${j + 1} overlap. Positions may be adjusted automatically.`,
      });
    }
  }

  return warnings;
}
