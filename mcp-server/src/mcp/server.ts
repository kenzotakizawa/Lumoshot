import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { runDiagnostics } from '../diagnostics.js';
import { checkLicense } from '../license/license.js';
import { AnnotateScreenshotInputSchema, annotateScreenshot } from '../tools/annotate-screenshot/index.js';
import { CapturePageInputSchema, capturePage } from '../tools/capture-page/index.js';
import { ExecuteFlowInputSchema } from '../tools/execute-flow/schema.js';
import { executeFlow } from '../tools/execute-flow/runner.js';
import { GetDiagnosticsInputSchema, MCP_TOOLS } from './tool-definitions.js';
import { formatJsonResult, mapToolError } from './error-mapper.js';

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'lumoshot-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_diagnostics': {
          const input = GetDiagnosticsInputSchema.parse(args ?? {});
          const diagnostics = await runDiagnostics({
            refresh: input.refresh,
            requireCjkText: input.require_cjk_text,
            locale: input.locale,
            textSamples: input.text_samples,
          });
          const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
          return formatJsonResult({
            ...diagnostics,
            license: {
              valid: licenseStatus.valid,
              plan: licenseStatus.plan,
              usage: licenseStatus.usage,
              at_limit: licenseStatus.at_limit,
            },
          });
        }

        case 'capture_page': {
          const input = CapturePageInputSchema.parse(args);
          const result = await capturePage(input);
          return formatJsonResult(result);
        }

        case 'execute_flow': {
          const input = ExecuteFlowInputSchema.parse(args);
          const result = await executeFlow(input);
          return formatJsonResult(result);
        }

        case 'annotate_screenshot': {
          const input = AnnotateScreenshotInputSchema.parse(args);
          const result = await annotateScreenshot(input);
          return formatJsonResult(result);
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      return mapToolError(err);
    }
  });

  return server;
}

export async function startMcpServer(): Promise<void> {
  const diagnostics = await runDiagnostics();
  if (!diagnostics.ready || diagnostics.issues.length > 0) {
    process.stderr.write(`[lumoshot-mcp] Diagnostics: ${JSON.stringify(diagnostics, null, 2)}\n`);
  }

  const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
  if (licenseStatus.at_limit) {
    process.stderr.write(
      `[lumoshot-mcp] Warning: Free tier limit reached (${licenseStatus.usage.capture_count}/${licenseStatus.usage.limit} this month). Upgrade to Pro for unlimited captures.\n`,
    );
  }

  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[lumoshot-mcp] Server started on stdio\n');
}
