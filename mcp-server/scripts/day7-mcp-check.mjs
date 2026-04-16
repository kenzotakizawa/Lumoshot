import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function parseToolTextResult(result, toolName) {
  const item = result.content?.find((c) => c.type === 'text');
  assertCondition(item?.text, `${toolName}: text result is missing`);
  try {
    return JSON.parse(item.text);
  } catch (err) {
    throw new Error(`${toolName}: failed to parse JSON response: ${String(err)}\nRaw: ${item.text}`);
  }
}

function startFixtureServer() {
  const html = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>Lumoshot Day7 Fixture</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; }
      .panel { max-width: 520px; border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      label { display: block; margin-top: 12px; }
      input { width: 100%; padding: 8px; margin-top: 4px; }
      button { margin-top: 14px; padding: 10px 16px; background: #3182ce; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
      #result { margin-top: 16px; color: #2f855a; font-weight: 600; }
    </style>
  </head>
  <body>
    <main class="panel" id="app-ready">
      <h1>Day7 MCP Check</h1>
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="name@example.com" />

      <label for="note">Note</label>
      <input id="note" type="text" value="fixture note" />

      <button id="submit" type="button" aria-label="Submit Form"
        onclick="document.getElementById('result').textContent='Submitted';">
        Submit
      </button>
      <div id="result"></div>
    </main>
  </body>
</html>`;

  return new Promise((resolvePromise, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('failed to resolve fixture server address'));
        return;
      }
      resolvePromise({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done, doneErr) => server.close((err) => (err ? doneErr(err) : done()))),
      });
    });
  });
}

async function main() {
  const projectRoot = resolve(process.cwd());
  const distEntry = resolve(projectRoot, 'dist/index.js');
  const runId = nowId();

  const tempRoot = mkdtempSync(join(tmpdir(), 'lumoshot-day7-'));
  const outputRoot = resolve(projectRoot, 'lumoshot-day7-output', runId);
  mkdirSync(outputRoot, { recursive: true });
  mkdirSync(join(tempRoot, '.lumoshot'), { recursive: true });

  writeFileSync(
    join(tempRoot, 'lumoshot.config.json'),
    JSON.stringify(
      {
        security: {
          trusted_domains: [],
        },
        output: {
          directory: outputRoot,
          filename_template: '{name}_{viewport}_{timestamp}',
          metadata_format: 'json',
        },
      },
      null,
      2
    ),
    'utf-8'
  );

  const fixture = await startFixtureServer();
  const originalHome = process.env.HOME ?? '';
  const playwrightPath = join(originalHome, 'Library', 'Caches', 'ms-playwright');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [distEntry],
    cwd: tempRoot,
    env: {
      ...process.env,
      HOME: tempRoot,
      USERPROFILE: tempRoot,
      PLAYWRIGHT_BROWSERS_PATH: playwrightPath,
    },
  });

  const client = new Client(
    { name: 'lumoshot-day7-check-client', version: '0.1.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    for (const required of ['get_diagnostics', 'capture_page', 'execute_flow', 'annotate_screenshot']) {
      assertCondition(toolNames.includes(required), `required tool not found: ${required}`);
    }

    const diagnosticsRaw = await client.callTool({ name: 'get_diagnostics', arguments: {} });
    const diagnostics = parseToolTextResult(diagnosticsRaw, 'get_diagnostics');
    assertCondition(typeof diagnostics.ready === 'boolean', 'get_diagnostics: ready is not boolean');

    const captureRaw = await client.callTool({
      name: 'capture_page',
      arguments: {
        url: fixture.origin,
        wait: { strategy: 'selector', selector: '#app-ready', timeout: 5000 },
        capture_mode: 'viewport',
        preset: 'friendly',
      },
    });
    const capture = parseToolTextResult(captureRaw, 'capture_page');
    assertCondition(existsSync(capture.screenshot), `capture_page screenshot not found: ${capture.screenshot}`);
    assertCondition((capture.elements?.length ?? 0) >= 2, 'capture_page elements are too few');

    const emailRef = capture.elements.find((el) => /email/i.test(el.label))?.ref;
    const submitRef =
      capture.elements.find((el) => /submit/i.test(el.label))?.ref ??
      capture.elements.find((el) => el.type === 'button')?.ref;
    assertCondition(typeof emailRef === 'number', 'capture_page: email ref not found');
    assertCondition(typeof submitRef === 'number', 'capture_page: submit ref not found');

    const flowRaw = await client.callTool({
      name: 'execute_flow',
      arguments: {
        url: fixture.origin,
        preset: 'friendly',
        auto_capture_each_step: true,
        default_wait: { strategy: 'auto', timeout: 4000 },
        steps: [
          { action: 'capture' },
          { action: 'fill', ref: emailRef, value: 'day7@example.com' },
          { action: 'click', ref: submitRef, description: 'Submit click' },
          { action: 'capture' },
        ],
      },
    });
    const flow = parseToolTextResult(flowRaw, 'execute_flow');
    assertCondition((flow.steps?.length ?? 0) === 4, 'execute_flow: unexpected step length');
    const stepShotCount = flow.steps.filter((s) => !!s.screenshot).length;
    assertCondition(stepShotCount >= 3, 'execute_flow: screenshots were not generated');

    const annotateRaw = await client.callTool({
      name: 'annotate_screenshot',
      arguments: {
        screenshot_ref: capture.screenshot,
        preset: 'friendly',
        elements_json: JSON.stringify(capture.elements),
        annotations: [
          { type: 'box', ref: submitRef, label: '確認ポイント' },
          { type: 'text', position: [16, 24], text: 'Day7 MCP Real Check' },
        ],
      },
    });
    const annotated = parseToolTextResult(annotateRaw, 'annotate_screenshot');
    assertCondition(existsSync(annotated.screenshot), `annotate_screenshot output not found: ${annotated.screenshot}`);
    assertCondition(statSync(annotated.screenshot).size > 5000, 'annotated screenshot file is too small');

    const summary = {
      run_id: runId,
      checked_at: new Date().toISOString(),
      fixture_url: fixture.origin,
      tools_verified: ['get_diagnostics', 'capture_page', 'execute_flow', 'annotate_screenshot'],
      diagnostics_ready: diagnostics.ready,
      capture_screenshot: capture.screenshot,
      capture_elements: capture.elements.length,
      execute_flow_steps: flow.steps.length,
      execute_flow_total_screenshots: flow.flow_meta?.total_screenshots ?? stepShotCount,
      annotated_screenshot: annotated.screenshot,
      output_root: outputRoot,
    };
    writeFileSync(join(outputRoot, 'day7-mcp-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

    process.stdout.write('Day7 MCP check completed successfully.\n');
    process.stdout.write(`Summary: ${join(outputRoot, 'day7-mcp-summary.json')}\n`);
    process.stdout.write(`Capture: ${capture.screenshot}\n`);
    process.stdout.write(`Annotated: ${annotated.screenshot}\n`);
  } finally {
    await transport.close().catch(() => {});
    await fixture.close().catch(() => {});
  }
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
