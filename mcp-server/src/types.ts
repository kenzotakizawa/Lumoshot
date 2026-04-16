// ─────────────────────────────────────────────────────────────────────────────
// Shared Types for Lumoshot MCP Server
// ─────────────────────────────────────────────────────────────────────────────

export type BoundingBox = [number, number, number, number]; // [x, y, width, height]

export type ElementType =
  | 'button'
  | 'link'
  | 'input'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'tab'
  | 'menu_item'
  | 'toggle'
  | 'clickable';

export interface InteractiveElement {
  ref: number;
  type: ElementType;
  role: string;
  label: string;
  value?: string;
  bbox: BoundingBox;
  interactive: boolean;
  redacted?: boolean;
  badge_number?: number;
  badge_position?: [number, number];
}

export interface PageMeta {
  title: string;
  url: string;
  viewport: { width: number; height: number };
  device_pixel_ratio: number;
  scroll_position: { x: number; y: number };
  captured_at: string;
  page_height: number;
  iframe_cross_origin?: boolean;
  iframe_frame_stats?: {
    total_frames: number;
    same_origin_frames: number;
    cross_origin_frames: number;
  };
}

export interface CaptureResult {
  screenshot: string;
  elements: InteractiveElement[];
  page_meta: PageMeta;
  diagnostics: {
    font_check: string | null;
    redacted_count: number;
    capture_mode_used: string;
    capture_mode_reason?: string;
    iframe_cross_origin?: boolean;
    iframe_frame_stats?: {
      total_frames: number;
      same_origin_frames: number;
      cross_origin_frames: number;
    };
  };
}

export interface StepResult {
  step_number: number;
  action: string;
  screenshot: string;
  elements?: InteractiveElement[];
  meta: {
    url: string;
    viewport: { width: number; height: number };
    captured_at: string;
    scroll_position: { x: number; y: number };
  };
  target_ref?: number;
  target_label?: string;
  filled_value?: string;
  annotation?: {
    type: string;
    position: [number, number];
    badge_number?: number;
  };
  status?: 'ok' | 'error' | 'timeout';
  error?: {
    type: string;
    message: string;
    suggestion: string;
  };
}

export interface FlowResult {
  steps: StepResult[];
  flow_meta: {
    total_steps: number;
    total_screenshots: number;
    duration_ms: number;
    preset: string;
    start_url: string;
    end_url: string;
    viewport: { width: number; height: number };
    iframe_cross_origin?: boolean;
    max_cross_origin_frames?: number;
  };
}

export interface AnnotateResult {
  screenshot: string;
  annotations_applied: number;
  warnings: Array<{
    type: string;
    refs?: number[];
    message: string;
  }>;
}

// ─── Security config ──────────────────────────────────────────────────────────

export interface SecurityConfig {
  redact_secrets: boolean;
  redact_pii: boolean;
  send_input_values: boolean;
  custom_redact_patterns: string[];
  trusted_domains: string[];
}

// ─── Preset types ─────────────────────────────────────────────────────────────

export type Preset = 'auto' | 'precise' | 'friendly' | 'neutral';

export interface PresetColors {
  primary: string;
  secondary: string;
  badge_bg: string;
  badge_text: string;
  text_color: string;
  border_radius: number;
  line_width: number;
}

export const PRESETS: Record<Exclude<Preset, 'auto'>, PresetColors> = {
  precise: {
    primary: '#E53E3E',
    secondary: '#ED8936',
    badge_bg: '#E53E3E',
    badge_text: '#FFFFFF',
    text_color: '#1A202C',
    border_radius: 0,
    line_width: 2,
  },
  friendly: {
    primary: '#3182CE',
    secondary: '#38B2AC',
    badge_bg: '#3182CE',
    badge_text: '#FFFFFF',
    text_color: '#2D3748',
    border_radius: 8,
    line_width: 2,
  },
  neutral: {
    primary: '#718096',
    secondary: '#718096',
    badge_bg: '#4A5568',
    badge_text: '#FFFFFF',
    text_color: '#4A5568',
    border_radius: 4,
    line_width: 1,
  },
};

// ─── Annotation input types ───────────────────────────────────────────────────

export type AnnotationType =
  | 'box'
  | 'rounded_box'
  | 'arrow'
  | 'callout'
  | 'text'
  | 'step_number'
  | 'click_icon'
  | 'spotlight'
  | 'mosaic'
  | 'os_frame'
  | 'crop'
  | 'resize'
  | 'before_after';

export interface BaseAnnotation {
  type: AnnotationType;
}

export interface BoxAnnotation extends BaseAnnotation {
  type: 'box';
  ref?: number;
  bbox?: BoundingBox;
  color?: string;
  line_width?: number;
  label?: string;
}

export interface RoundedBoxAnnotation extends BaseAnnotation {
  type: 'rounded_box';
  ref?: number;
  bbox?: BoundingBox;
  color?: string;
  border_radius?: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  from_ref?: number;
  to_ref?: number;
  from_bbox?: BoundingBox;
  to_bbox?: BoundingBox;
  color?: string;
  label?: string;
}

export interface CalloutAnnotation extends BaseAnnotation {
  type: 'callout';
  ref?: number;
  bbox?: BoundingBox;
  text: string;
  tail?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  background?: string;
  border_color?: string;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  position: [number, number];
  text: string;
  font_size?: number;
  color?: string;
  background?: string;
}

export interface StepNumberAnnotation extends BaseAnnotation {
  type: 'step_number';
  ref?: number;
  bbox?: BoundingBox;
  number: number;
  color?: string;
}

export interface ClickIconAnnotation extends BaseAnnotation {
  type: 'click_icon';
  ref?: number;
  bbox?: BoundingBox;
  click_type?: 'left' | 'right' | 'double';
}

export interface SpotlightAnnotation extends BaseAnnotation {
  type: 'spotlight';
  ref?: number;
  bbox?: BoundingBox;
  shape?: 'auto' | 'rect' | 'ellipse';
}

export interface MosaicAnnotation extends BaseAnnotation {
  type: 'mosaic';
  ref?: number;
  bbox?: BoundingBox;
  intensity?: 'light' | 'medium' | 'strong';
}

export interface OsFrameAnnotation extends BaseAnnotation {
  type: 'os_frame';
  style?: 'auto' | 'macos' | 'windows' | 'linux';
}

export interface CropAnnotation extends BaseAnnotation {
  type: 'crop';
  bbox?: BoundingBox;
  ref?: number;
  padding?: number;
}

export interface ResizeAnnotation extends BaseAnnotation {
  type: 'resize';
  width: number;
}

export interface BeforeAfterAnnotation extends BaseAnnotation {
  type: 'before_after';
  before_ref: string;
  after_ref: string;
  // changed_regions and slider layout are not supported in v1.
  layout?: 'side_by_side' | 'overlay';
}

export type Annotation =
  | BoxAnnotation
  | RoundedBoxAnnotation
  | ArrowAnnotation
  | CalloutAnnotation
  | TextAnnotation
  | StepNumberAnnotation
  | ClickIconAnnotation
  | SpotlightAnnotation
  | MosaicAnnotation
  | OsFrameAnnotation
  | CropAnnotation
  | ResizeAnnotation
  | BeforeAfterAnnotation;
