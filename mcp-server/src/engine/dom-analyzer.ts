import type { Frame, Page } from 'playwright';
import type { InteractiveElement, ElementType, BoundingBox } from '../types.js';
import { applyMasking } from './masking.js';
import type { SecurityConfig } from '../types.js';

interface RawElement {
  ref: number;
  type: ElementType;
  role: string;
  label: string;
  value: string;
  bbox: BoundingBox;
  interactive: boolean;
  disabled: boolean;
  ariaHidden: boolean;
  sensitive: boolean;
}

interface FrameScanResult {
  elements: RawElement[];
  nextRef: number;
}

export interface DOMAnalysisResult {
  elements: InteractiveElement[];
  iframe_cross_origin: boolean;
  frame_stats: {
    total_frames: number;
    same_origin_frames: number;
    cross_origin_frames: number;
  };
}

const DOM_ANALYZER_FUNCTION = (startRef: number): FrameScanResult => {
  const elements: RawElement[] = [];
  let refCounter = startRef;

  const getElementType = (el: Element): ElementType | null => {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (
      tag === 'button' ||
      role === 'button' ||
      (tag === 'input' && (type === 'submit' || type === 'button' || type === 'reset'))
    ) {
      return 'button';
    }
    if ((tag === 'a' && el.hasAttribute('href')) || role === 'link') return 'link';
    if (tag === 'input' && ['text', 'email', 'password', 'number', 'search', 'tel', 'url'].includes(type)) return 'input';
    if (tag === 'textarea') return 'input';
    if (tag === 'select' || role === 'listbox' || role === 'combobox') return 'select';
    if ((tag === 'input' && type === 'checkbox') || role === 'checkbox') return 'checkbox';
    if ((tag === 'input' && type === 'radio') || role === 'radio') return 'radio';
    if (role === 'tab') return 'tab';
    if (role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio') return 'menu_item';
    if (role === 'switch') return 'toggle';

    // ── Clickable detection ──────────────────────────────────────────────────
    // cursor:pointer alone is too noisy: many decorative elements inherit it
    // from parent CSS without being genuinely interactive.
    // Require cursor:pointer PLUS at least one additional interactivity signal,
    // OR a direct onclick handler (with or without cursor:pointer).
    const style = window.getComputedStyle(el);
    const hasCursorPointer = style.cursor === 'pointer';
    const hasOnclick =
      !!(el as HTMLElement).onclick || !!el.getAttribute('onclick');
    // tabindex >= 0 means the author explicitly made this element keyboard-focusable.
    const hasUsableTabindex =
      el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
    // Common data attributes used by frameworks/libraries to attach click behaviour.
    const INTERACTION_DATA_ATTRS = [
      'data-action', 'data-click', 'data-href', 'data-toggle',
      'data-dismiss', 'data-target', 'data-url', 'data-link',
      'data-modal', 'data-route',
    ];
    const hasInteractionData = INTERACTION_DATA_ATTRS.some(
      (attr) => el.hasAttribute(attr)
    );

    if (hasOnclick) return 'clickable';
    if (hasCursorPointer && (hasUsableTabindex || hasInteractionData)) return 'clickable';
    // cursor:pointer alone → skip (too many false positives from CSS cascade)

    return null;
  };

  const getLabel = (el: Element): string => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label') || '';

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const lbEl = document.getElementById(labelledBy);
      if (lbEl) return lbEl.textContent?.trim() || '';
    }

    const htmlEl = el as HTMLElement;
    if (htmlEl.id) {
      const label = document.querySelector(`label[for=\"${htmlEl.id}\"]`);
      if (label) return label.textContent?.trim() || '';
    }

    const maybeInput = el as HTMLInputElement | HTMLTextAreaElement;
    if (maybeInput.placeholder) return maybeInput.placeholder;

    const text = el.textContent?.trim() || '';
    if (text.length > 0 && text.length < 200) return text;

    const img = el.querySelector('img');
    if (img?.alt) return img.alt;

    return el.getAttribute('title') || el.getAttribute('name') || '';
  };

  const isVisible = (el: Element): boolean => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  };

  const allElements = document.querySelectorAll('*');
  allElements.forEach((el) => {
    const type = getElementType(el);
    if (!type) return;
    if (!isVisible(el)) return;
    if (el.getAttribute('aria-hidden') === 'true') return;
    if (el.closest('[aria-hidden=\"true\"]')) return;

    const rect = (el as HTMLElement).getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const inputType = (el.getAttribute('type') || '').toLowerCase();
    const isPassword = tag === 'input' && inputType === 'password';
    const sensitive =
      el.hasAttribute('data-sensitive') ||
      el.hasAttribute('data-secret') ||
      el.hasAttribute('data-redact');

    const currentRef = refCounter++;
    el.setAttribute('data-lumoshot-ref', String(currentRef));

    const valueCandidate = (el as HTMLInputElement | HTMLTextAreaElement).value || '';

    elements.push({
      ref: currentRef,
      type,
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      label: getLabel(el),
      value: isPassword ? '[REDACTED_PASSWORD]' : valueCandidate,
      bbox: [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      ],
      interactive: !(el as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled,
      disabled: !!(el as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled,
      ariaHidden: el.getAttribute('aria-hidden') === 'true',
      sensitive,
    });
  });

  return { elements, nextRef: refCounter };
};

function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isSameOriginFrame(mainOrigin: string | null, frameUrl: string): boolean {
  if (!mainOrigin) return true;
  if (frameUrl.startsWith('about:') || frameUrl.startsWith('data:') || frameUrl.startsWith('blob:')) {
    return true;
  }

  const frameOrigin = getOrigin(frameUrl);
  if (!frameOrigin) return false;
  return frameOrigin === mainOrigin;
}

async function getFrameOffset(page: Page, frame: Frame): Promise<{ x: number; y: number } | null> {
  if (frame === page.mainFrame()) {
    return { x: 0, y: 0 };
  }

  try {
    const frameElement = await frame.frameElement();
    const box = await frameElement.boundingBox();
    await frameElement.dispose();
    if (!box) return null;
    return { x: Math.round(box.x), y: Math.round(box.y) };
  } catch {
    return null;
  }
}

export async function analyzeDOM(
  page: Page,
  security: SecurityConfig
): Promise<DOMAnalysisResult> {
  const mainOrigin = getOrigin(page.url());
  const frames = page.frames();

  let nextRef = 1;
  let sameOriginFrames = 0;
  let crossOriginFrames = 0;
  const rawElements: RawElement[] = [];

  for (const frame of frames) {
    const isMainFrame = frame === page.mainFrame();
    const sameOrigin = isMainFrame || isSameOriginFrame(mainOrigin, frame.url());

    if (!sameOrigin) {
      crossOriginFrames += 1;
      continue;
    }

    const offset = await getFrameOffset(page, frame);
    if (!offset) {
      continue;
    }

    let frameResult: FrameScanResult;
    try {
      frameResult = await frame.evaluate(DOM_ANALYZER_FUNCTION, nextRef);
    } catch {
      continue;
    }

    sameOriginFrames += 1;
    nextRef = frameResult.nextRef;

    for (const el of frameResult.elements) {
      rawElements.push({
        ...el,
        bbox: [
          el.bbox[0] + offset.x,
          el.bbox[1] + offset.y,
          el.bbox[2],
          el.bbox[3],
        ],
      });
    }
  }

  const elements: InteractiveElement[] = rawElements.map((el) => {
    const { maskedLabel, maskedValue, redacted } = applyMasking(
      el.label,
      el.value,
      security
    );

    const isSensitive = el.sensitive;
    const finalRedacted = redacted || isSensitive;

    return {
      ref: el.ref,
      type: el.type,
      role: el.role,
      label: isSensitive && maskedLabel ? '[REDACTED]' : maskedLabel,
      ...(security.send_input_values && maskedValue
        ? { value: isSensitive ? '[REDACTED]' : maskedValue }
        : {}),
      bbox: el.bbox,
      interactive: el.interactive,
      ...(finalRedacted ? { redacted: true } : {}),
    };
  });

  return {
    elements,
    iframe_cross_origin: crossOriginFrames > 0,
    frame_stats: {
      total_frames: frames.length,
      same_origin_frames: sameOriginFrames,
      cross_origin_frames: crossOriginFrames,
    },
  };
}

const BADGE_SIZE = 32;
const BADGE_GAP = 8;
const BADGE_GRID = 12;
const BADGE_GRID_RING = 6;

interface BadgeBounds {
  width: number;
  height: number;
}

export function assignBadges(
  elements: InteractiveElement[],
  bounds?: BadgeBounds
): InteractiveElement[] {
  const occupiedBadgeBBoxes: BoundingBox[] = [];
  const elementBBoxes = elements.map((el) => el.bbox);
  let badgeNum = 1;

  return elements.map((el) => {
    const position = findBadgePosition(el.bbox, elementBBoxes, occupiedBadgeBBoxes, bounds);
    occupiedBadgeBBoxes.push([position[0], position[1], BADGE_SIZE, BADGE_SIZE]);
    return {
      ...el,
      badge_number: badgeNum++,
      badge_position: position,
    };
  });
}

function intersects(a: BoundingBox, b: BoundingBox): boolean {
  const ax2 = a[0] + a[2];
  const ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2];
  const by2 = b[1] + b[3];
  return a[0] < bx2 && ax2 > b[0] && a[1] < by2 && ay2 > b[1];
}

function clampBadgePosition(
  x: number,
  y: number,
  bounds?: BadgeBounds
): [number, number] {
  const minX = 0;
  const minY = 0;
  const maxX = bounds ? Math.max(minX, bounds.width - BADGE_SIZE) : Number.POSITIVE_INFINITY;
  const maxY = bounds ? Math.max(minY, bounds.height - BADGE_SIZE) : Number.POSITIVE_INFINITY;
  return [
    Math.round(Math.max(minX, Math.min(x, maxX))),
    Math.round(Math.max(minY, Math.min(y, maxY))),
  ];
}

function isValidBadgePosition(
  position: [number, number],
  elementBBoxes: BoundingBox[],
  occupiedBadgeBBoxes: BoundingBox[],
): boolean {
  const candidate: BoundingBox = [position[0], position[1], BADGE_SIZE, BADGE_SIZE];
  if (elementBBoxes.some((bbox) => intersects(candidate, bbox))) {
    return false;
  }
  if (occupiedBadgeBBoxes.some((bbox) => intersects(candidate, bbox))) {
    return false;
  }
  return true;
}

function badgeCandidatesForElement(bbox: BoundingBox): Array<[number, number]> {
  const [x, y, w, h] = bbox;
  const half = BADGE_SIZE / 2;
  return [
    [x + w + BADGE_GAP, y - half], // right-top (primary)
    [x - BADGE_GAP - BADGE_SIZE, y - half], // left-top
    [x + w + BADGE_GAP, y + h - half], // right-bottom
    [x - BADGE_GAP - BADGE_SIZE, y + h - half], // left-bottom
    [x + w / 2 - half, y - BADGE_GAP - BADGE_SIZE], // top-center
    [x + w / 2 - half, y + h + BADGE_GAP], // bottom-center
  ];
}

function findBadgePosition(
  bbox: BoundingBox,
  elementBBoxes: BoundingBox[],
  occupiedBadgeBBoxes: BoundingBox[],
  bounds?: BadgeBounds
): [number, number] {
  const candidates = badgeCandidatesForElement(bbox);

  for (const rawPos of candidates) {
    const pos = clampBadgePosition(rawPos[0], rawPos[1], bounds);
    if (isValidBadgePosition(pos, elementBBoxes, occupiedBadgeBBoxes)) {
      return pos;
    }
  }

  const [baseX, baseY] = candidates[0];
  for (let ring = 1; ring <= BADGE_GRID_RING; ring++) {
    for (let gx = -ring; gx <= ring; gx++) {
      for (let gy = -ring; gy <= ring; gy++) {
        if (Math.abs(gx) !== ring && Math.abs(gy) !== ring) continue;
        const pos = clampBadgePosition(baseX + gx * BADGE_GRID, baseY + gy * BADGE_GRID, bounds);
        if (isValidBadgePosition(pos, elementBBoxes, occupiedBadgeBBoxes)) {
          return pos;
        }
      }
    }
  }

  return clampBadgePosition(baseX, baseY, bounds);
}
