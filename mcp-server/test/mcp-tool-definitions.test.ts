import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_TOOLS } from '../dist/mcp/tool-definitions.js';

function getTool(name: string) {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  assert.ok(tool, `tool not found: ${name}`);
  return tool;
}

test('capture_page schema includes include_badges and security options', () => {
  const schemaText = JSON.stringify(getTool('capture_page').inputSchema);
  assert.ok(schemaText.includes('"image_path"'));
  assert.ok(schemaText.includes('"include_badges"'));
  assert.ok(schemaText.includes('"include_regions"'));
  assert.ok(schemaText.includes('"region_granularity"'));
  assert.ok(schemaText.includes('"scroll_to_ref"'));
  assert.ok(schemaText.includes('"output_format"'));
  assert.ok(schemaText.includes('"scale"'));
  assert.ok(schemaText.includes('"badge_color"'));
  assert.ok(schemaText.includes('"redact_secrets"'));
  assert.ok(schemaText.includes('"send_input_values"'));
});

test('get_diagnostics schema includes optional cjk context fields', () => {
  const schemaText = JSON.stringify(getTool('get_diagnostics').inputSchema);
  assert.ok(schemaText.includes('"refresh"'));
  assert.ok(schemaText.includes('"require_cjk_text"'));
  assert.ok(schemaText.includes('"locale"'));
  assert.ok(schemaText.includes('"text_samples"'));
});

test('execute_flow schema includes selector/label_query, select strategy, cookies, and pre_steps', () => {
  const schemaText = JSON.stringify(getTool('execute_flow').inputSchema);
  assert.ok(schemaText.includes('"selector"'));
  assert.ok(schemaText.includes('"label_query"'));
  assert.ok(schemaText.includes('"strategy"'));
  assert.ok(schemaText.includes('"combobox"'));
  assert.ok(schemaText.includes('"cookies"'));
  assert.ok(schemaText.includes('"sameSite"'));
  assert.ok(schemaText.includes('"pre_steps"'));
  assert.ok(schemaText.includes('"navigate"'));
  assert.ok(schemaText.includes('"theme"'));
  assert.ok(schemaText.includes('"visualization_mode"'));
  assert.ok(schemaText.includes('"summary_only"'));
  assert.ok(schemaText.includes('"output_format"'));
  assert.ok(schemaText.includes('"scale"'));
  assert.ok(schemaText.includes('"badge_color"'));
  assert.ok(schemaText.includes('"callout_background"'));
  assert.ok(schemaText.includes('"callout_border_color"'));
  assert.ok(schemaText.includes('"callout_text_color"'));
});

test('annotate_screenshot schema includes before_after layout support', () => {
  const schemaText = JSON.stringify(getTool('annotate_screenshot').inputSchema);
  assert.ok(schemaText.includes('"before_after"'));
  assert.ok(schemaText.includes('"layout"'));
  assert.ok(schemaText.includes('"before_label"'));
  assert.ok(schemaText.includes('"after_label"'));
  assert.ok(schemaText.includes('"elbow"'));
  assert.ok(schemaText.includes('"theme"'));
  assert.ok(schemaText.includes('"output_format"'));
  assert.ok(schemaText.includes('"scale"'));
  assert.ok(schemaText.includes('"text_color"'));
});
