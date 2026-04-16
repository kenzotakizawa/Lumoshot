import type { SecurityConfig } from '../types.js';

// ─── Secret patterns ──────────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk_live_[a-zA-Z0-9]+/g,
  /sk_test_[a-zA-Z0-9]+/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]+/g,
  /ghs_[a-zA-Z0-9]+/g,
  /ghr_[a-zA-Z0-9]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /xoxb-[a-zA-Z0-9-]+/g,
  /xoxp-[a-zA-Z0-9-]+/g,
  /xoxa-[a-zA-Z0-9-]+/g,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\./g,
  /[a-zA-Z0-9_]*(secret|token|key|password|credential|auth)[a-zA-Z0-9_]*\s*[:=]\s*['"][^'"]{4,}['"]/gi,
];

// Luhn algorithm for credit card detection
function isLikelyCreditCard(s: string): boolean {
  const digits = s.replace(/[\s-]/g, '');
  if (!/^\d{14,19}$/.test(digits)) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// ─── PII patterns ─────────────────────────────────────────────────────────────

const PII_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /0\d{1,4}-?\d{1,4}-?\d{3,4}/g,
  /\+?[1-9]\d{7,14}/g,
  /\d{4}\s?\d{4}\s?\d{4}/g, // Japanese My Number
];

function maskText(text: string, patterns: RegExp[]): { result: string; changed: boolean } {
  let result = text;
  let changed = false;
  for (const pattern of patterns) {
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    const masked = result.replace(patternCopy, '[REDACTED]');
    if (masked !== result) {
      changed = true;
      result = masked;
    }
  }
  return { result, changed };
}

export interface MaskingResult {
  maskedLabel: string;
  maskedValue: string;
  redacted: boolean;
}

export function applyMasking(
  label: string,
  value: string,
  security: SecurityConfig
): MaskingResult {
  let maskedLabel = label;
  let maskedValue = value;
  let redacted = false;

  // Always mask password fields (already [REDACTED_PASSWORD] from DOM analyzer)
  if (value === '[REDACTED_PASSWORD]') {
    maskedValue = '[REDACTED]';
    redacted = true;
  }

  if (security.redact_secrets) {
    const patterns = [...SECRET_PATTERNS];

    // Add user-defined patterns
    for (const p of security.custom_redact_patterns) {
      try {
        patterns.push(new RegExp(p, 'g'));
      } catch {
        // Invalid regex, skip
      }
    }

    const labelResult = maskText(maskedLabel, patterns);
    const valueResult = maskText(maskedValue, patterns);

    if (labelResult.changed) { maskedLabel = labelResult.result; redacted = true; }
    if (valueResult.changed) { maskedValue = valueResult.result; redacted = true; }

    // Credit card check on value
    if (isLikelyCreditCard(maskedValue)) {
      maskedValue = '[REDACTED]';
      redacted = true;
    }
  }

  if (security.redact_pii) {
    const labelResult = maskText(maskedLabel, PII_PATTERNS);
    const valueResult = maskText(maskedValue, PII_PATTERNS);

    if (labelResult.changed) { maskedLabel = labelResult.result; redacted = true; }
    if (valueResult.changed) { maskedValue = valueResult.result; redacted = true; }
  }

  return { maskedLabel, maskedValue, redacted };
}

export function countRedacted(elements: Array<{ redacted?: boolean }>): number {
  return elements.filter((el) => el.redacted).length;
}
