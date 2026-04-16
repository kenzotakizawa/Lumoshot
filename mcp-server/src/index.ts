#!/usr/bin/env node
/**
 * Lumoshot MCP Server
 *
 * Provides AI agents with annotated screenshot capture capabilities.
 * Tools:
 *   - capture_page      : Navigate to a URL and capture an annotated screenshot
 *   - execute_flow      : Execute multi-step browser flows with per-step screenshots
 *   - annotate_screenshot: Add annotations to an existing screenshot
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { runDiagnostics } from './diagnostics.js';
import { checkLicense, UsageLimitError, LicenseVerificationError } from './license/license.js';
import { capturePage, CapturePageInputSchema } from './tools/capture-page.js';
import { executeFlow, ExecuteFlowInputSchema } from './tools/execute-flow.js';
import { annotateScreenshot, AnnotateScreenshotInputSchema } from './tools/annotate-screenshot.js';

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'lumoshot-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_diagnostics',
        description:
          'Run environment diagnostics (fonts, Playwright Chromium, license/usage) and return structured readiness info that an AI agent can use for setup decisions.',
        inputSchema: {
          type: 'object',
          properties: {
            refresh: {
              type: 'boolean',
              description: 'Force a fresh diagnostics check. Reserved for future use.',
            },
          },
        },
      },
      {
        name: 'capture_page',
        description:
          'Navigate to a URL, analyze interactive DOM elements, apply security masking, inject annotation badges, and return an annotated screenshot with element metadata. Returns element refs that can be used in execute_flow and annotate_screenshot.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Page URL to capture (required)' },
            wait: {
              type: 'object',
              properties: {
                strategy: { type: 'string', enum: ['auto', 'selector', 'timeout'], description: 'Wait strategy. Default: auto' },
                selector: { type: 'string', description: 'CSS selector to wait for (strategy=selector)' },
                timeout: { type: 'number', description: 'Max wait time in ms' },
              },
            },
            capture_mode: {
              type: 'string',
              enum: ['auto', 'viewport', 'full', 'element'],
              description: 'auto=smart detect, viewport=current view, full=full page, element=specific element',
            },
            element_ref: { type: 'number', description: 'Element ref to capture (capture_mode=element)' },
            element_padding: { type: 'number', description: 'Padding around element in px (default: 40)' },
            preset: {
              type: 'string',
              enum: ['auto', 'precise', 'friendly', 'neutral'],
              description: 'Annotation color preset. auto=AI context detection',
            },
            security: {
              type: 'object',
              properties: {
                redact_secrets: { type: 'boolean', description: 'Mask API keys/tokens (default: true)' },
                redact_pii: { type: 'boolean', description: 'Mask emails/phones (default: false)' },
                send_input_values: { type: 'boolean', description: 'Include form input values (default: false)' },
              },
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'execute_flow',
        description:
          'Execute a multi-step browser flow (navigate, click, fill, scroll, wait) with annotated screenshots captured at each step. Returns per-step results and a flow_meta.json summary. Element refs from capture_page can be reused.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Starting URL (required)' },
            preset: {
              type: 'string',
              enum: ['auto', 'precise', 'friendly', 'neutral'],
              description: 'Annotation color preset',
            },
            steps: {
              type: 'array',
              description: 'List of steps to execute',
              items: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['capture', 'click', 'fill', 'scroll', 'hover', 'select', 'wait'],
                  },
                  ref: { type: 'number', description: 'Element ref (for click/fill/hover/select)' },
                  value: { type: 'string', description: 'Value to fill or select' },
                  direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
                  amount: { type: 'number', description: 'Scroll amount in px' },
                  description: { type: 'string', description: 'Step description for annotation label' },
                  strategy: { type: 'string', enum: ['auto', 'selector', 'timeout'], description: 'Wait strategy' },
                  selector: { type: 'string', description: 'CSS selector to wait for' },
                  timeout: { type: 'number', description: 'Wait timeout in ms' },
                },
                required: ['action'],
              },
            },
            auto_capture_each_step: {
              type: 'boolean',
              description: 'Capture screenshot after each action (default: true)',
            },
            default_wait: {
              type: 'object',
              properties: {
                strategy: { type: 'string', enum: ['auto', 'selector', 'timeout'] },
                timeout: { type: 'number' },
              },
            },
          },
          required: ['url', 'steps'],
        },
      },
      {
        name: 'annotate_screenshot',
        description:
          'Add annotations (boxes, arrows, callouts, step numbers, click icons, spotlight, mosaic, OS frame, crop, resize) to an existing screenshot. Accepts a step_NN alias or absolute file path.',
        inputSchema: {
          type: 'object',
          properties: {
            screenshot_ref: {
              type: 'string',
              description: 'step_02 alias or absolute file path to the screenshot',
            },
            annotations: {
              type: 'array',
              description: 'List of annotations to apply in order',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['box', 'rounded_box', 'arrow', 'callout', 'text', 'step_number', 'click_icon', 'spotlight', 'mosaic', 'os_frame', 'crop', 'resize', 'before_after'],
                  },
                  ref: { type: 'number', description: 'Element ref' },
                  bbox: { type: 'array', items: { type: 'number' }, description: '[x, y, width, height]' },
                  color: { type: 'string' },
                  line_width: { type: 'number' },
                  label: { type: 'string' },
                  border_radius: { type: 'number' },
                  from_ref: { type: 'number' },
                  to_ref: { type: 'number' },
                  text: { type: 'string' },
                  tail: { type: 'string', enum: ['auto', 'top', 'bottom', 'left', 'right'] },
                  background: { type: 'string' },
                  border_color: { type: 'string' },
                  position: { type: 'array', items: { type: 'number' } },
                  font_size: { type: 'number' },
                  number: { type: 'number' },
                  click_type: { type: 'string', enum: ['left', 'right', 'double'] },
                  shape: { type: 'string', enum: ['auto', 'rect', 'ellipse'] },
                  intensity: { type: 'string', enum: ['light', 'medium', 'strong'] },
                  style: { type: 'string', enum: ['auto', 'macos', 'windows', 'linux'] },
                  width: { type: 'number' },
                  padding: { type: 'number' },
                  before_ref: { type: 'string' },
                  after_ref: { type: 'string' },
                  layout: { type: 'string', enum: ['side_by_side', 'overlay'] },
                },
                required: ['type'],
              },
            },
            preset: {
              type: 'string',
              enum: ['auto', 'precise', 'friendly', 'neutral'],
            },
            elements_json: {
              type: 'string',
              description: 'JSON string of elements from a previous capture_page call (for ref-based annotations)',
            },
          },
          required: ['screenshot_ref', 'annotations'],
        },
      },
    ],
  };
});

// ─── Tool call handler ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_diagnostics': {
        const diagnostics = await runDiagnostics();
        const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...diagnostics,
                  license: {
                    valid: licenseStatus.valid,
                    plan: licenseStatus.plan,
                    usage: licenseStatus.usage,
                    at_limit: licenseStatus.at_limit,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'capture_page': {
        const input = CapturePageInputSchema.parse(args);
        const result = await capturePage(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'execute_flow': {
        const input = ExecuteFlowInputSchema.parse(args);
        const result = await executeFlow(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'annotate_screenshot': {
        const input = AnnotateScreenshotInputSchema.parse(args);
        const result = await annotateScreenshot(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    if (err instanceof UsageLimitError) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: {
                  type: 'free_limit_reached',
                  message: err.message,
                  suggestion: 'Upgrade to Pro for unlimited captures.',
                  usage: err.usage,
                },
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    if (err instanceof LicenseVerificationError) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
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
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Run diagnostics and log to stderr (not stdout — MCP uses stdout for protocol)
  const diagnostics = await runDiagnostics();
  if (!diagnostics.ready || diagnostics.issues.length > 0) {
    process.stderr.write(
      `[lumoshot-mcp] Diagnostics: ${JSON.stringify(diagnostics, null, 2)}\n`
    );
  }

  // License check (non-blocking — free tier works without a key)
  const licenseKey = process.env.LUMOSHOT_LICENSE_KEY;
  const licenseStatus = await checkLicense(licenseKey);
  if (licenseStatus.at_limit) {
    process.stderr.write(
      `[lumoshot-mcp] Warning: Free tier limit reached (${licenseStatus.usage.capture_count}/${licenseStatus.usage.limit} this month). Upgrade to Pro for unlimited captures.\n`
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('[lumoshot-mcp] Server started on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[lumoshot-mcp] Fatal: ${err}\n`);
  process.exit(1);
});
