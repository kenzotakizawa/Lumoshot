import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('loadConfig reads capture.max_badge_overlays from project config', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'lumoshot-config-load-'));
  const originalCwd = process.cwd();
  const originalHome = process.env.HOME ?? '';
  const originalUserProfile = process.env.USERPROFILE ?? '';

  try {
    mkdirSync(join(tempRoot, '.lumoshot'), { recursive: true });
    process.env.HOME = tempRoot;
    process.env.USERPROFILE = tempRoot;
    process.chdir(tempRoot);

    writeFileSync(
      join(tempRoot, 'lumoshot.config.json'),
      JSON.stringify(
        {
          capture: {
            max_badge_overlays: 7,
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const { loadConfig } = await import('../dist/config.js');
    const loaded = loadConfig();
    assert.equal(loaded.capture.max_badge_overlays, 7);
  } finally {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('loadConfig defaults capture.max_badge_overlays to 24', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'lumoshot-config-default-'));
  const originalCwd = process.cwd();
  const originalHome = process.env.HOME ?? '';
  const originalUserProfile = process.env.USERPROFILE ?? '';

  try {
    mkdirSync(join(tempRoot, '.lumoshot'), { recursive: true });
    process.env.HOME = tempRoot;
    process.env.USERPROFILE = tempRoot;
    process.chdir(tempRoot);

    const { loadConfig } = await import('../dist/config.js');
    const loaded = loadConfig();
    assert.equal(loaded.capture.max_badge_overlays, 24);
  } finally {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

