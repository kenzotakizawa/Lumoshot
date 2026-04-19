import type { SecurityConfig } from '../../types.js';
import { isTrustedDomain } from './trusted-domain.js';

export type SecurityOverrideInput = Partial<
  Pick<SecurityConfig, 'redact_secrets' | 'redact_pii' | 'send_input_values'>
>;

export function mergeSecurityConfig(
  base: SecurityConfig,
  override?: SecurityOverrideInput,
): SecurityConfig {
  if (!override) return base;
  return {
    ...base,
    ...override,
  };
}

export function resolveSecurityForUrl(
  url: string,
  baseSecurity: SecurityConfig,
): SecurityConfig {
  if (isTrustedDomain(url, baseSecurity.trusted_domains)) {
    return { ...baseSecurity, redact_secrets: false, redact_pii: false };
  }
  return baseSecurity;
}

