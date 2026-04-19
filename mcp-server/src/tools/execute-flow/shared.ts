import type { DOMAnalysisResult } from '../../engine/dom-analyzer.js';
import { config } from '../../config.js';
import { resolveSecurityForUrl as resolveSecurityForUrlWithBase } from '../../domain/security/redact-policy.js';
import type { SecurityConfig } from '../../types.js';

export interface FrameStatsState {
  iframeCrossOriginDetected: boolean;
  maxCrossOriginFrames: number;
}

export function createFrameStatsState(): FrameStatsState {
  return {
    iframeCrossOriginDetected: false,
    maxCrossOriginFrames: 0,
  };
}

export function updateFrameStats(state: FrameStatsState, analysis: DOMAnalysisResult): void {
  if (analysis.iframe_cross_origin) {
    state.iframeCrossOriginDetected = true;
  }
  if (analysis.frame_stats.cross_origin_frames > state.maxCrossOriginFrames) {
    state.maxCrossOriginFrames = analysis.frame_stats.cross_origin_frames;
  }
}

export type SecurityResolver = (url: string) => SecurityConfig;

export const resolveSecurityForUrl: SecurityResolver = (url: string): SecurityConfig => {
  return resolveSecurityForUrlWithBase(url, config.security);
};
