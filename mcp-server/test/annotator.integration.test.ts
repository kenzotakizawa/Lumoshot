import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupAnnotatorHarness,
  type AnnotatorHarness,
} from './helpers/annotator-harness.js';
import { registerAnnotatorOverlayScenarios } from './scenarios/annotator/overlay.scenarios.js';
import { registerAnnotatorStructuralScenarios } from './scenarios/annotator/structural.scenarios.js';
import { registerAnnotatorCompositionScenarios } from './scenarios/annotator/composition.scenarios.js';

let harness: AnnotatorHarness | null = null;

function getHarness(): AnnotatorHarness {
  assert.ok(harness, 'annotator harness is not initialized');
  return harness;
}

test.before(async () => {
  harness = await setupAnnotatorHarness();
});

test.after(() => {
  if (harness) {
    harness.cleanup();
  }
});

registerAnnotatorOverlayScenarios(getHarness);
registerAnnotatorStructuralScenarios(getHarness);
registerAnnotatorCompositionScenarios(getHarness);
