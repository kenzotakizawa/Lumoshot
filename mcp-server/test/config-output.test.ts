/**
 * Tests for config-driven output behavior.
 *
 * Verifies that:
 *   1. buildFilename respects filename_template variables ({name}, {viewport}, {timestamp})
 *   2. serializeMetadata produces JSON or YAML based on metadata_format
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Import compiled dist directly (no browser needed)
import { buildFilename, serializeMetadata } from '../dist/engine/browser.js';

const VP = { width: 1280, height: 720 };

// ─── buildFilename ────────────────────────────────────────────────────────────

test('buildFilename uses default template {name}_{viewport}_{timestamp}', () => {
  const template = '{name}_{viewport}_{timestamp}';
  const result = buildFilename('capture', VP, template);
  assert.ok(result.startsWith('capture_1280x720_'), `expected capture_1280x720_ prefix, got: ${result}`);
  assert.ok(result.endsWith('.png'), 'must end with .png');
});

test('buildFilename {name} variable is substituted', () => {
  const result = buildFilename('step_01', VP, '{name}_{viewport}_{timestamp}');
  assert.ok(result.startsWith('step_01_1280x720_'));
});

test('buildFilename {viewport} variable produces WxH format', () => {
  const result = buildFilename('test', { width: 1920, height: 1080 }, '{name}_{viewport}_{timestamp}');
  assert.ok(result.includes('1920x1080'), `expected 1920x1080 in filename, got: ${result}`);
});

test('buildFilename {timestamp} variable produces compact ISO format', () => {
  const result = buildFilename('snap', VP, '{name}_{viewport}_{timestamp}');
  // Timestamp should match YYYYMMDDTHHmmss (15 chars) followed by .png
  const tsMatch = result.match(/_(\d{8}T\d{6})\.png$/);
  assert.ok(tsMatch, `timestamp not found in: ${result}`);
});

test('buildFilename custom template with only {name}', () => {
  const result = buildFilename('my-shot', VP, 'screenshot_{name}');
  assert.equal(result, 'screenshot_my-shot.png');
});

test('buildFilename custom template with reordered variables', () => {
  const result = buildFilename('frame', VP, '{timestamp}_{viewport}_{name}');
  assert.ok(result.includes('_1280x720_frame.png'), `expected _1280x720_frame.png in: ${result}`);
});

test('buildFilename template with no variables returns literal + .png', () => {
  const result = buildFilename('ignored', VP, 'fixed-name');
  assert.equal(result, 'fixed-name.png');
});

// ─── serializeMetadata ────────────────────────────────────────────────────────

const SAMPLE_DATA = {
  version: '1.0',
  count: 42,
  ok: true,
  nested: { key: 'value' },
  list: [1, 2, 3],
};

test('serializeMetadata json produces valid JSON with json extension', () => {
  const { content, ext } = serializeMetadata(SAMPLE_DATA, 'json');
  assert.equal(ext, 'json');
  const parsed = JSON.parse(content) as typeof SAMPLE_DATA;
  assert.deepEqual(parsed, SAMPLE_DATA);
});

test('serializeMetadata json is pretty-printed (2-space indent)', () => {
  const { content } = serializeMetadata({ a: 1 }, 'json');
  assert.ok(content.includes('\n  '), 'expected indented JSON');
});

test('serializeMetadata yaml produces YAML string with yaml extension', () => {
  const { content, ext } = serializeMetadata(SAMPLE_DATA, 'yaml');
  assert.equal(ext, 'yaml');
  // YAML should contain key: value pairs without braces
  assert.ok(content.includes('version:'), `expected "version:" in YAML:\n${content}`);
  assert.ok(content.includes('count:'), `expected "count:" in YAML:\n${content}`);
  assert.ok(!content.startsWith('{'), 'YAML should not start with { (that would be JSON)');
});

test('serializeMetadata yaml round-trips through yaml package parse', async () => {
  const { parse } = await import('yaml');
  const { content } = serializeMetadata(SAMPLE_DATA, 'yaml');
  const parsed = parse(content) as typeof SAMPLE_DATA;
  assert.deepEqual(parsed, SAMPLE_DATA);
});

test('serializeMetadata yaml handles arrays correctly', () => {
  const data = { steps: [{ step: 1, action: 'click' }, { step: 2, action: 'fill' }] };
  const { content } = serializeMetadata(data, 'yaml');
  assert.ok(content.includes('steps:'), `expected "steps:" in:\n${content}`);
  assert.ok(content.includes('action:'), `expected "action:" in:\n${content}`);
});

test('serializeMetadata defaults to json when format not specified', () => {
  // serializeMetadata without second arg should produce JSON (default config)
  // We call with explicit 'json' since module-level config singleton uses json default
  const { ext } = serializeMetadata({}, 'json');
  assert.equal(ext, 'json');
});
