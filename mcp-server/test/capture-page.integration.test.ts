import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupCapturePageHarness,
  type CapturePageHarness,
} from './helpers/capture-page-harness.js';
import { registerCapturePageIframeScenarios } from './scenarios/capture-page/iframe.scenarios.js';
import { registerCapturePageSecurityScenarios } from './scenarios/capture-page/security.scenarios.js';
import { registerCapturePageModeScenarios } from './scenarios/capture-page/capture-mode.scenarios.js';
import { registerCapturePageOutputAndScrollScenarios } from './scenarios/capture-page/output-and-scroll.scenarios.js';
import { registerCapturePageRegionScenarios } from './scenarios/capture-page/regions.scenarios.js';

let harness: CapturePageHarness | null = null;

function getHarness(): CapturePageHarness {
  assert.ok(harness, 'capture_page harness is not initialized');
  return harness;
}

test.before(async () => {
  harness = await setupCapturePageHarness();
});

test.after(async () => {
  if (harness) {
    await harness.restore();
  }
});

registerCapturePageIframeScenarios(getHarness);
registerCapturePageSecurityScenarios(getHarness);
registerCapturePageModeScenarios(getHarness);
registerCapturePageOutputAndScrollScenarios(getHarness);
registerCapturePageRegionScenarios(getHarness);
