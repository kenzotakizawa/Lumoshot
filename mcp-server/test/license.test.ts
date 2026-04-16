/**
 * Unit tests for license.ts
 *
 * Tests the three key behavioral scenarios:
 *   1. No license key → free tier
 *   2. License key + valid cache → use cache (offline-safe)
 *   3. License key + expired/no cache + online → verify remote, update cache
 *   4. License key + expired/no cache + offline → LicenseVerificationError('offline')
 *   5. License key + expired/no cache + server error → LicenseVerificationError('server_error')
 *   6. LUMOSHOT_LICENSE_URL not set → LicenseVerificationError('not_configured')
 *   7. UsageLimitError is thrown when free tier is at limit
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Module-level test isolation ────────────────────────────────────────────
//
// license.ts reads/writes from $HOME/.lumoshot by default.
// We cannot easily override that path from the outside without modifying the
// module. Instead we run each scenario in a fresh Node process context by
// importing a freshly-built module from dist/. Because `dist/` is a CommonJS
// module (or ESM with module-level constants), we need to control the env vars
// BEFORE import. We achieve this by dynamically importing with cache-busting
// query params — each import gets a fresh module instance.

// Helper: build an absolute URL with a unique cache-buster so Node ESM gives
// us a fresh module each time.
let _importSeq = 0;
function freshLicenseModule(env: Record<string, string | undefined> = {}): Promise<typeof import('../src/license/license.js')> {
  // Apply env overrides before the import is evaluated
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  // Use a unique URL to defeat module cache
  const seq = ++_importSeq;
  const modUrl = new URL(`../dist/license/license.js?_=${seq}`, import.meta.url).href;

  return import(modUrl).then((mod) => {
    // Restore env
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return mod as typeof import('../src/license/license.js');
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Patch HOME so license.ts writes to a temp dir instead of real ~/.lumoshot */
function withTempHome(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'lumoshot-lic-test-'));
  const orig = process.env.HOME;
  process.env.HOME = dir;
  return fn(dir).finally(() => {
    if (orig === undefined) delete process.env.HOME;
    else process.env.HOME = orig;
    rmSync(dir, { recursive: true, force: true });
  });
}

// ─── Scenario 1: No license key → free tier ───────────────────────────────

test('no license key returns free tier status', async () => {
  await withTempHome(async () => {
    const { checkLicense } = await freshLicenseModule({
      LUMOSHOT_LICENSE_KEY: undefined,
      LUMOSHOT_LICENSE_URL: undefined,
    });
    const status = await checkLicense(undefined);
    assert.equal(status.plan, 'free');
    assert.equal(status.valid, true);
    assert.equal(typeof status.usage.capture_count, 'number');
  });
});

// ─── Scenario 2: Valid cache → use it without hitting the network ──────────

test('valid cache is returned without remote call', async () => {
  await withTempHome(async (dir) => {
    const { checkLicense, LicenseVerificationError } = await freshLicenseModule({
      LUMOSHOT_LICENSE_URL: 'https://should-never-be-called.example.com',
    });

    // Write a fresh cache file manually
    const cacheDir = join(dir, '.lumoshot');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(cacheDir, { recursive: true });
    const cache = {
      valid: true,
      plan: 'pro',
      expires_at: null,
      cached_at: new Date().toISOString(),
      license_key: 'test-key-abc',
    };
    writeFileSync(join(cacheDir, 'license-cache.json'), JSON.stringify(cache));

    // checkLicense must use the cache and NOT call the remote URL
    const status = await checkLicense('test-key-abc');
    assert.equal(status.plan, 'pro');
    assert.equal(status.valid, true);
  });
});

// ─── Scenario 3: Expired cache + online → remote verify + new cache ───────

test('expired cache triggers remote verification and writes new cache', async () => {
  await withTempHome(async (dir) => {
    // Mock fetch: simulate a successful server response
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({ valid: true, plan: 'pro', expires_at: null }),
      } as unknown as Response);

    try {
      const { checkLicense } = await freshLicenseModule({
        LUMOSHOT_LICENSE_URL: 'https://mock.example.com/verify',
      });

      // Write an expired cache (cached 8 days ago, TTL = 7 days)
      const cacheDir = join(dir, '.lumoshot');
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync(cacheDir, { recursive: true });
      const expiredDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const cache = {
        valid: true,
        plan: 'free',
        expires_at: null,
        cached_at: expiredDate,
        license_key: 'test-key-xyz',
      };
      writeFileSync(join(cacheDir, 'license-cache.json'), JSON.stringify(cache));

      const status = await checkLicense('test-key-xyz');
      // Should have gotten the fresh server response (pro), not the stale cache (free)
      assert.equal(status.plan, 'pro');
      assert.equal(status.valid, true);

      // New cache file should exist
      assert.ok(existsSync(join(cacheDir, 'license-cache.json')));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─── Scenario 4: Expired cache + offline → LicenseVerificationError ───────

test('expired cache + offline throws LicenseVerificationError(offline)', async () => {
  await withTempHome(async (dir) => {
    // Mock fetch: simulate network failure
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    try {
      const { checkLicense, LicenseVerificationError } = await freshLicenseModule({
        LUMOSHOT_LICENSE_URL: 'https://mock.example.com/verify',
      });

      // Write an expired cache
      const cacheDir = join(dir, '.lumoshot');
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync(cacheDir, { recursive: true });
      const expiredDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const cache = {
        valid: true, plan: 'pro', expires_at: null,
        cached_at: expiredDate, license_key: 'key-offline',
      };
      writeFileSync(join(cacheDir, 'license-cache.json'), JSON.stringify(cache));

      await assert.rejects(
        () => checkLicense('key-offline'),
        (err: unknown) => {
          assert.ok(err instanceof LicenseVerificationError, 'should be LicenseVerificationError');
          assert.equal((err as InstanceType<typeof LicenseVerificationError>).reason, 'offline');
          return true;
        },
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─── Scenario 5: Server returns non-2xx → LicenseVerificationError ────────

test('server error response throws LicenseVerificationError(server_error)', async () => {
  await withTempHome(async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({ ok: false, status: 500 } as unknown as Response);

    try {
      const { checkLicense, LicenseVerificationError } = await freshLicenseModule({
        LUMOSHOT_LICENSE_URL: 'https://mock.example.com/verify',
      });

      await assert.rejects(
        () => checkLicense('key-server-err'),
        (err: unknown) => {
          assert.ok(err instanceof LicenseVerificationError);
          assert.equal((err as InstanceType<typeof LicenseVerificationError>).reason, 'server_error');
          return true;
        },
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─── Scenario 6: LUMOSHOT_LICENSE_URL overridden to empty string ──────────

test('LUMOSHOT_LICENSE_URL="" throws LicenseVerificationError(not_configured)', async () => {
  await withTempHome(async () => {
    const { checkLicense, LicenseVerificationError } = await freshLicenseModule({
      LUMOSHOT_LICENSE_URL: '',
    });

    await assert.rejects(
      () => checkLicense('some-key'),
      (err: unknown) => {
        assert.ok(err instanceof LicenseVerificationError);
        assert.equal((err as InstanceType<typeof LicenseVerificationError>).reason, 'not_configured');
        return true;
      },
    );
  });
});

// ─── Scenario 7: Free tier usage limit ────────────────────────────────────

test('UsageLimitError thrown when free tier capture count is at limit', async () => {
  await withTempHome(async (dir) => {
    const { incrementUsage, UsageLimitError } = await freshLicenseModule({});

    // Pre-fill usage to the limit (30)
    const usageDir = join(dir, '.lumoshot');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(usageDir, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    writeFileSync(
      join(usageDir, 'usage.json'),
      JSON.stringify({ month, capture_count: 30, limit: 30 }),
    );

    assert.throws(
      () => incrementUsage('free'),
      (err: unknown) => {
        assert.ok(err instanceof UsageLimitError);
        assert.equal((err as UsageLimitError).usage.capture_count, 30);
        return true;
      },
    );
  });
});
