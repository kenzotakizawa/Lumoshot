import { existsSync, statSync } from 'node:fs';

export function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function countByType(elements) {
  const counts = {};
  for (const el of elements ?? []) {
    counts[el.type] = (counts[el.type] ?? 0) + 1;
  }
  return counts;
}

export function normalizeLabel(text) {
  return (text ?? '').trim().toLowerCase();
}

export function hasLabel(labels, keyword) {
  const q = normalizeLabel(keyword);
  return (labels ?? []).some((label) => normalizeLabel(label).includes(q));
}

export function getLabelHits(labels, keywords) {
  return (keywords ?? []).filter((keyword) => hasLabel(labels, keyword));
}

export function checkScreenshotArtifact(path) {
  if (!path || !existsSync(path)) {
    return { ok: false, reason: 'screenshot file was not generated' };
  }

  const size = statSync(path).size;
  if (size < 10_000) {
    return { ok: false, reason: `screenshot file is too small (${size} bytes)` };
  }

  return { ok: true, reason: `screenshot_size=${size}bytes` };
}
