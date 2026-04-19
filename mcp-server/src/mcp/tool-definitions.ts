import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CapturePageInputSchema } from '../tools/capture-page/index.js';
import { ExecuteFlowInputSchema } from '../tools/execute-flow/schema.js';
import { AnnotateScreenshotInputSchema } from '../tools/annotate-screenshot/index.js';

// Keep this schema in one place so ListTools and runtime validation do not drift.
export const GetDiagnosticsInputSchema = z.object({
  refresh: z.boolean().optional(),
  require_cjk_text: z.boolean().optional(),
  locale: z.string().optional(),
  text_samples: z.array(z.string()).optional(),
});

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolSchemaSource {
  name: McpToolDefinition['name'];
  description: McpToolDefinition['description'];
  zodSchema: z.ZodTypeAny;
}

function toMcpInputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  // MCP consumers do not need the meta keyword and we keep schemas compact.
  const { $schema: _schema, ...rest } = jsonSchema;
  return rest;
}

const TOOL_SCHEMA_SOURCES: ToolSchemaSource[] = [
  {
    name: 'get_diagnostics',
    description:
      'Run environment diagnostics (fonts, Playwright Chromium, license/usage) and return structured readiness info that an AI agent can use for setup decisions.',
    zodSchema: GetDiagnosticsInputSchema,
  },
  {
    name: 'capture_page',
    description:
      'Navigate to a URL (or analyze a local image via image_path), detect interactive elements/regions, apply security masking, inject annotation badges, and return an annotated screenshot with element metadata. On dense pages, badge rendering is auto-compacted (and reindexed) for readability while full element refs are still returned. Supports optional badge_color override. Returns element refs/regions that can be used in execute_flow and annotate_screenshot.',
    zodSchema: CapturePageInputSchema,
  },
  {
    name: 'execute_flow',
    description:
      'Execute a multi-step browser flow (navigate, click, fill, scroll, wait). Supports optional pre_steps (login/setup), cookie injection for authenticated sessions, theme selection (red/blue/mono), badge color override (`badge_color`), callout color overrides (`callout_background`, `callout_border_color`, `callout_text_color`), output format/scale, auto tab switch when click opens a new tab, and visualization_mode (`step` or `summary_only`). Returns per-step results and flow metadata (including summary screenshot in summary_only mode). Element refs from capture_page can be reused.',
    zodSchema: ExecuteFlowInputSchema,
  },
  {
    name: 'annotate_screenshot',
    description:
      'Add annotations (boxes, arrows, callouts, step numbers, click icons, spotlight, mosaic, OS frame, crop, resize) to an existing screenshot. Supports arrow elbow routing (`{\"type\":\"arrow\",\"elbow\":true}`), before_after labels (`before_label`/`after_label`), callout color overrides (`background`, `border_color`, `text_color`), theme selection (red/blue/mono), and output format/scale. Accepts a step_NN alias or absolute file path.',
    zodSchema: AnnotateScreenshotInputSchema,
  },
];

export const MCP_TOOLS: McpToolDefinition[] = TOOL_SCHEMA_SOURCES.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: toMcpInputSchema(tool.zodSchema),
}));
