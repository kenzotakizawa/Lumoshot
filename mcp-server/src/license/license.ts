import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro';

export interface LicenseCache {
  valid: boolean;
  plan: Plan;
  expires_at: string | null;
  cached_at: string;
  license_key: string | null;
}

export interface UsageData {
  month: string;
  capture_count: number;
  limit: number;
}

export class UsageLimitError extends Error {
  usage: UsageData;
  constructor(usage: UsageData) {
    super(`Free tier limit reached (${usage.capture_count}/${usage.limit} this month).`);
    this.name = 'UsageLimitError';
    this.usage = usage;
  }
}

export type LicenseVerificationReason = 'offline' | 'server_error' | 'not_configured';

export class LicenseVerificationError extends Error {
  reason: LicenseVerificationReason;
  constructor(reason: LicenseVerificationReason) {
    const messages: Record<LicenseVerificationReason, string> = {
      offline:
        'License verification failed: cannot reach the license server. ' +
        'Check your internet connection. If you are offline, wait for the cache to be valid again ' +
        '(licenses are cached for 7 days after a successful verification).',
      server_error:
        'License verification failed: the license server returned an error. ' +
        'Please try again later. If the problem persists, contact support.',
      not_configured:
        'License server URL is not configured. ' +
        'Set the LUMOSHOT_LICENSE_URL environment variable to the production endpoint.',
    };
    super(messages[reason]);
    this.name = 'LicenseVerificationError';
    this.reason = reason;
  }
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const LUMOSHOT_DIR = join(homedir(), '.lumoshot');
const CACHE_PATH = join(LUMOSHOT_DIR, 'license-cache.json');
const USAGE_PATH = join(LUMOSHOT_DIR, 'usage.json');

const CACHE_TTL_DAYS = 7;
const FREE_LIMIT = 30;

// Supabase Edge Function URL.
// Override with LUMOSHOT_LICENSE_URL env var for local testing only.
const VERIFY_URL =
  process.env.LUMOSHOT_LICENSE_URL ??
  'https://cqiyquckogeqjzrkmsqg.supabase.co/functions/v1/verify-license';

// ─── File helpers ────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(LUMOSHOT_DIR)) {
    mkdirSync(LUMOSHOT_DIR, { recursive: true });
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Usage tracking ──────────────────────────────────────────────────────────

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export function readUsage(): UsageData {
  const data = readJson<UsageData>(USAGE_PATH);
  const month = currentMonth();
  if (!data || data.month !== month) {
    return { month, capture_count: 0, limit: FREE_LIMIT };
  }
  return data;
}

export function incrementUsage(plan: Plan = 'free'): UsageData {
  const usage = readUsage();
  if (plan === 'free' && usage.capture_count >= usage.limit) {
    throw new UsageLimitError(usage);
  }
  usage.capture_count += 1;
  writeJson(USAGE_PATH, usage);
  return usage;
}

// ─── License cache ────────────────────────────────────────────────────────────

function isCacheValid(cache: LicenseCache): boolean {
  const cachedAt = new Date(cache.cached_at);
  const now = new Date();
  const diffDays = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays < CACHE_TTL_DAYS;
}

function readCache(): LicenseCache | null {
  const cache = readJson<LicenseCache>(CACHE_PATH);
  if (!cache) return null;
  if (!isCacheValid(cache)) return null;
  return cache;
}

function writeCache(data: Omit<LicenseCache, 'cached_at'>): LicenseCache {
  const cache: LicenseCache = { ...data, cached_at: new Date().toISOString() };
  writeJson(CACHE_PATH, cache);
  return cache;
}

// ─── Remote verification ──────────────────────────────────────────────────────

async function verifyRemote(licenseKey: string): Promise<LicenseCache> {
  if (!VERIFY_URL) {
    throw new LicenseVerificationError('not_configured');
  }

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Network error (offline, DNS failure, timeout, etc.)
    throw new LicenseVerificationError('offline');
  }

  if (!res.ok) {
    throw new LicenseVerificationError('server_error');
  }

  const data = await res.json() as { valid: boolean; plan: Plan; expires_at: string | null };
  return writeCache({
    valid: data.valid,
    plan: data.plan,
    expires_at: data.expires_at ?? null,
    license_key: licenseKey,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LicenseStatus {
  valid: boolean;
  plan: Plan;
  usage: UsageData;
  at_limit: boolean;
}

export async function checkLicense(licenseKey?: string): Promise<LicenseStatus> {
  // No license key → free tier (local-only)
  if (!licenseKey) {
    const usage = readUsage();
    return {
      valid: true,
      plan: 'free',
      usage,
      at_limit: usage.capture_count >= usage.limit,
    };
  }

  // Check cache first
  const cached = readCache();
  if (cached && cached.license_key === licenseKey) {
    const usage = readUsage();
    return {
      valid: cached.valid,
      plan: cached.plan,
      usage,
      at_limit: cached.plan === 'free' && usage.capture_count >= usage.limit,
    };
  }

  // Remote verification — no silent fallback.
  // If the server cannot be reached and there is no valid cache, throw so the
  // caller can surface a clear message to the user / AI agent.
  const fresh = await verifyRemote(licenseKey);
  const usage = readUsage();
  return {
    valid: fresh.valid,
    plan: fresh.plan,
    usage,
    at_limit: fresh.plan === 'free' && usage.capture_count >= usage.limit,
  };
}

export function isPremiumFeature(feature: string): boolean {
  const premiumFeatures = ['before_after', 'spotlight', 'custom_redact_patterns', 'preset_customize'];
  return premiumFeatures.includes(feature);
}
