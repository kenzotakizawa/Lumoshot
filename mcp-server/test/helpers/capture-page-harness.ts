import { setupLumoshotHarness } from './lumoshot-harness.js';

export interface CapturePageTestResult {
  screenshot: string;
  elements: Array<{
    ref: number;
    label: string;
    type: string;
    bbox: [number, number, number, number];
    value?: string;
    redacted?: boolean;
    badge_number?: number;
    badge_position?: [number, number];
  }>;
  regions: Array<{
    id: string;
    kind: string;
    label: string;
    bbox: [number, number, number, number];
    source: 'dom' | 'image';
    confidence: number;
  }>;
  page_meta: {
    page_height: number;
    scroll_position?: { x: number; y: number };
  };
  diagnostics: {
    capture_mode_used: string;
    capture_mode_reason?: string;
    redacted_count: number;
    badge_density_mode?: 'full' | 'compact' | 'disabled';
    badge_numbering_mode?: 'original' | 'reindexed' | 'disabled';
    badge_rendered_count?: number;
    badge_suppressed_count?: number;
    iframe_cross_origin?: boolean;
    iframe_frame_stats?: {
      total_frames: number;
      same_origin_frames: number;
      cross_origin_frames: number;
    };
    region_count?: number;
    region_source?: 'dom' | 'image' | 'none';
    scroll_to_ref_result?: 'applied' | 'ref_not_found';
  };
}

export type CapturePageFn = (input: Record<string, unknown>) => Promise<CapturePageTestResult>;

export interface CapturePageHarness {
  capturePage: CapturePageFn;
  restore: () => Promise<void>;
}

export async function setupCapturePageHarness(): Promise<CapturePageHarness> {
  const harness = setupLumoshotHarness({
    tmpPrefix: 'lumoshot-int-',
    outputDirectory: './out',
    trustedDomains: [],
  });

  const captureModule = await import('../../dist/tools/capture-page.js');
  const browserModule = await import('../../dist/engine/browser.js');

  return {
    capturePage: captureModule.capturePage as CapturePageFn,
    restore: () => harness.restore(browserModule.closeBrowser as (() => Promise<void>) | null),
  };
}
