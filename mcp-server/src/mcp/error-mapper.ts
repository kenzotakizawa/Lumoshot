import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { LicenseVerificationError, UsageLimitError } from '../license/license.js';

export function formatJsonResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function mapToolError(err: unknown): CallToolResult {
  if (err instanceof UsageLimitError) {
    return formatJsonResult(
      {
        error: {
          type: 'free_limit_reached',
          message: err.message,
          suggestion: 'Upgrade to Pro for unlimited captures.',
          usage: err.usage,
        },
      },
      true,
    );
  }

  if (err instanceof LicenseVerificationError) {
    return formatJsonResult(
      {
        error: {
          type: 'license_verification_failed',
          reason: err.reason,
          message: err.message,
          suggestion:
            err.reason === 'offline'
              ? 'Connect to the internet to re-verify your license (cached for 7 days after verification).'
              : err.reason === 'not_configured'
                ? 'Set the LUMOSHOT_LICENSE_URL environment variable.'
                : 'Try again later or contact support.',
        },
      },
      true,
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
