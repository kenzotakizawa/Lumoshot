import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { isTrustedDomain } from '../dist/domain/security/trusted-domain.js';
import { mergeSecurityConfig, resolveSecurityForUrl } from '../dist/domain/security/redact-policy.js';
import { resolveScreenshotRef } from '../dist/domain/output/screenshot-ref.js';
import { detectCjkTextRequirement, hasCjkCharacters } from '../dist/domain/diagnostics/cjk-font.js';
import { estimateTextWidth } from '../dist/engine/annotation/geometry.js';
import { svgCallout } from '../dist/engine/annotation/svg-primitives.js';
import { assignBadges } from '../dist/engine/dom-analyzer.js';
import type { InteractiveElement, SecurityConfig } from '../dist/types.js';

test('isTrustedDomain matches exact and subdomain entries', () => {
  assert.equal(isTrustedDomain('https://localhost:3000', ['localhost']), true);
  assert.equal(isTrustedDomain('https://app.staging.myapp.com', ['staging.myapp.com']), true);
  assert.equal(isTrustedDomain('https://example.com', ['staging.myapp.com']), false);
});

test('mergeSecurityConfig applies override fields only', () => {
  const base: SecurityConfig = {
    redact_secrets: true,
    redact_pii: false,
    send_input_values: false,
    custom_redact_patterns: ['ABC'],
    trusted_domains: ['localhost'],
  };
  const merged = mergeSecurityConfig(base, { redact_pii: true });
  assert.equal(merged.redact_secrets, true);
  assert.equal(merged.redact_pii, true);
  assert.equal(merged.send_input_values, false);
  assert.deepEqual(merged.custom_redact_patterns, ['ABC']);
});

test('resolveSecurityForUrl relaxes redaction for trusted domains', () => {
  const base: SecurityConfig = {
    redact_secrets: true,
    redact_pii: true,
    send_input_values: false,
    custom_redact_patterns: [],
    trusted_domains: ['localhost', 'staging.myapp.com'],
  };

  const trusted = resolveSecurityForUrl('https://staging.myapp.com/settings', base);
  assert.equal(trusted.redact_secrets, false);
  assert.equal(trusted.redact_pii, false);
  assert.equal(trusted.send_input_values, false);

  const untrusted = resolveSecurityForUrl('https://example.com', base);
  assert.equal(untrusted.redact_secrets, true);
  assert.equal(untrusted.redact_pii, true);
});

test('resolveScreenshotRef resolves step alias and absolute path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumoshot-domain-'));
  const aliasPath = join(dir, 'step_02_1280x720_20260417T000000.png');
  const absPath = join(dir, 'manual.png');
  writeFileSync(aliasPath, Buffer.from('alias'));
  writeFileSync(absPath, Buffer.from('manual'));

  const fromAlias = resolveScreenshotRef('step_02', { outputDirectory: dir });
  const fromAbs = resolveScreenshotRef(absPath, { outputDirectory: dir });

  assert.equal(fromAlias, aliasPath);
  assert.equal(fromAbs, absPath);
});

test('detectCjkTextRequirement resolves explicit/locale/text heuristics', () => {
  const explicit = detectCjkTextRequirement({ requireCjkText: true });
  assert.equal(explicit.required, true);
  assert.equal(explicit.reason, 'explicit');

  const locale = detectCjkTextRequirement({ locale: 'ja-JP' });
  assert.equal(locale.required, true);
  assert.equal(locale.reason, 'locale');

  const sample = detectCjkTextRequirement({ textSamples: ['Open settings', '送信ボタンを押す'] });
  assert.equal(sample.required, true);
  assert.equal(sample.reason, 'text_sample');

  const englishOnly = detectCjkTextRequirement({ locale: 'en-US', textSamples: ['Click submit'] });
  assert.equal(englishOnly.required, false);
  assert.equal(englishOnly.reason, 'none');
});

test('hasCjkCharacters detects CJK scripts and ignores plain ASCII', () => {
  assert.equal(hasCjkCharacters('hello world'), false);
  assert.equal(hasCjkCharacters('メールアドレス'), true);
  assert.equal(hasCjkCharacters('한글 테스트'), true);
  assert.equal(hasCjkCharacters('中文測試'), true);
});

test('estimateTextWidth treats CJK text as full-width', () => {
  const ascii = estimateTextWidth('abcdef', 13);
  const cjk = estimateTextWidth('あいうえおか', 13);
  const hangul = estimateTextWidth('한글테스트', 13);
  const fullWidthLatin = estimateTextWidth('ＡＢＣＤＥＦ', 13);

  assert.ok(cjk > ascii * 1.3, `expected CJK width to be larger than ascii: ascii=${ascii}, cjk=${cjk}`);
  assert.ok(hangul > ascii * 1.3, `expected Hangul width to be larger than ascii: ascii=${ascii}, hangul=${hangul}`);
  assert.ok(fullWidthLatin > ascii * 1.3, `expected full-width latin to be larger than ascii: ascii=${ascii}, fw=${fullWidthLatin}`);
});

test('svgCallout wraps long Japanese text and keeps max width', () => {
  const longJa = 'この機能を使うと、ツールバーから注釈を追加して手順をわかりやすく共有できます。';
  const callout = svgCallout(
    [60, 80, 140, 40],
    longJa,
    'auto',
    '#FFFFFF',
    '#E53E3E',
    '#1A202C',
    [],
    { width: 1280, height: 720 },
  );

  assert.ok(callout.bbox[2] <= 280, `callout width must be <= 280, got ${callout.bbox[2]}`);
  const textNodeCount = (callout.svg.match(/<text /g) ?? []).length;
  assert.ok(textNodeCount >= 2, `long Japanese text should wrap to multiple lines, got ${textNodeCount}`);
});

test('svgCallout keeps bubble and tail coordinates inside viewport near edges', () => {
  const image = { width: 1280, height: 720 };
  const callout = svgCallout(
    [1080, 680, 160, 36],
    '画面端でも切れないこと',
    'auto',
    '#E53E3E',
    '#E53E3E',
    '#FFFFFF',
    [],
    image,
  );

  const [x, y, w, h] = callout.bbox;
  assert.ok(x >= 0 && y >= 0, `callout bbox should stay in viewport: ${callout.bbox}`);
  assert.ok(x + w <= image.width, `callout bbox width overflows viewport: ${callout.bbox}`);
  assert.ok(y + h <= image.height, `callout bbox height overflows viewport: ${callout.bbox}`);

  const tailPathMatch = callout.svg.match(/<path d="([^"]+)"/);
  assert.ok(tailPathMatch, 'callout tail path should exist');
  const coords = (tailPathMatch?.[1] ?? '')
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map((n) => Number(n)) ?? [];
  assert.ok(coords.length >= 6, `tail path coordinates should be parseable: ${tailPathMatch?.[1] ?? ''}`);
  for (let i = 0; i + 1 < coords.length; i += 2) {
    const cx = coords[i];
    const cy = coords[i + 1];
    assert.ok(cx >= 0 && cx <= image.width, `tail x out of viewport: ${cx}`);
    assert.ok(cy >= 0 && cy <= image.height, `tail y out of viewport: ${cy}`);
  }
});

test('assignBadges places badges outside target elements and avoids overlap', () => {
  const elements: InteractiveElement[] = [
    { ref: 1, type: 'button', role: 'button', label: 'A', bbox: [20, 20, 100, 40], interactive: true },
    { ref: 2, type: 'button', role: 'button', label: 'B', bbox: [140, 20, 100, 40], interactive: true },
    { ref: 3, type: 'input', role: 'textbox', label: 'C', bbox: [20, 80, 220, 36], interactive: true },
  ];

  const withBadges = assignBadges(elements, { width: 360, height: 220 });

  for (const el of withBadges) {
    assert.ok(el.badge_position, `badge_position missing for ref:${el.ref}`);
    const [bx, by] = el.badge_position!;
    const badgeBox: [number, number, number, number] = [bx, by, 32, 32];
    const [ex, ey, ew, eh] = el.bbox;
    const overlapsSelf =
      badgeBox[0] < ex + ew
      && badgeBox[0] + badgeBox[2] > ex
      && badgeBox[1] < ey + eh
      && badgeBox[1] + badgeBox[3] > ey;
    assert.equal(overlapsSelf, false, `badge overlaps target bbox for ref:${el.ref}`);
  }

  for (let i = 0; i < withBadges.length; i++) {
    for (let j = i + 1; j < withBadges.length; j++) {
      const [ax, ay] = withBadges[i].badge_position!;
      const [bx, by] = withBadges[j].badge_position!;
      const overlap =
        ax < bx + 32
        && ax + 32 > bx
        && ay < by + 32
        && ay + 32 > by;
      assert.equal(overlap, false, `badges overlap: ref:${withBadges[i].ref} and ref:${withBadges[j].ref}`);
    }
  }
});
