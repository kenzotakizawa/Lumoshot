import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMasking, countRedacted } from '../src/engine/masking.js';
import type { SecurityConfig } from '../src/types.js';

const baseSecurity: SecurityConfig = {
  redact_secrets: true,
  redact_pii: false,
  send_input_values: false,
  custom_redact_patterns: [],
  trusted_domains: [],
};

test('masks API keys and marks as redacted', () => {
  const input = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
  const result = applyMasking('OpenAI Key', input, baseSecurity);

  assert.equal(result.redacted, true);
  assert.equal(result.maskedValue, '[REDACTED]');
});

test('masks password sentinel value', () => {
  const result = applyMasking('Password', '[REDACTED_PASSWORD]', baseSecurity);

  assert.equal(result.redacted, true);
  assert.equal(result.maskedValue, '[REDACTED]');
});

test('masks credit-card-like values via Luhn', () => {
  const result = applyMasking('Card', '4242 4242 4242 4242', baseSecurity);

  assert.equal(result.redacted, true);
  assert.equal(result.maskedValue, '[REDACTED]');
});

test('custom redact pattern is applied', () => {
  const security: SecurityConfig = {
    ...baseSecurity,
    custom_redact_patterns: ['INTERNAL-[A-Z0-9]{8}'],
  };

  const result = applyMasking('Token', 'INTERNAL-AB12CD34', security);
  assert.equal(result.redacted, true);
  assert.equal(result.maskedValue, '[REDACTED]');
});

test('PII masking is optional', () => {
  const email = 'user@example.com';

  const withoutPii = applyMasking('Email', email, baseSecurity);
  assert.equal(withoutPii.redacted, false);
  assert.equal(withoutPii.maskedValue, email);

  const withPii = applyMasking('Email', email, { ...baseSecurity, redact_pii: true });
  assert.equal(withPii.redacted, true);
  assert.equal(withPii.maskedValue, '[REDACTED]');
});

test('countRedacted counts redacted flags', () => {
  const count = countRedacted([
    { redacted: true },
    { redacted: false },
    {},
    { redacted: true },
  ]);

  assert.equal(count, 2);
});
