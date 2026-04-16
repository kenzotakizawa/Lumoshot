import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function logPass(name, details = '') {
  process.stdout.write(`[PASS] ${name}${details ? ` - ${details}` : ''}\n`);
}

function logFail(name, details = '') {
  process.stdout.write(`[FAIL] ${name}${details ? ` - ${details}` : ''}\n`);
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to resolve server address'));
        return;
      }

      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, doneErr) => server.close((err) => (err ? doneErr(err) : done()))),
      });
    });
  });
}

async function main() {
  const keepArtifacts = process.env.LUMOSHOT_QA_KEEP === '1';
  const originalHome = process.env.HOME ?? '';
  const originalUserProfile = process.env.USERPROFILE ?? '';
  const originalPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '';
  const originalCwd = process.cwd();

  const tempRoot = mkdtempSync(join(tmpdir(), 'lumoshot-qa-'));
  let failed = false;

  try {
    mkdirSync(join(tempRoot, '.lumoshot'), { recursive: true });

    process.env.HOME = tempRoot;
    process.env.USERPROFILE = tempRoot;
    process.env.PLAYWRIGHT_BROWSERS_PATH = join(originalHome, 'Library', 'Caches', 'ms-playwright');
    process.chdir(tempRoot);

    writeFileSync(
      join(tempRoot, 'lumoshot.config.json'),
      JSON.stringify(
        {
          security: {
            trusted_domains: [],
          },
          output: {
            directory: './out',
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const { capturePage } = await import('../dist/tools/capture-page.js');
    const { executeFlow } = await import('../dist/tools/execute-flow.js');
    const { runDiagnostics } = await import('../dist/diagnostics.js');
    const { checkLicense } = await import('../dist/license/license.js');
    const { closeBrowser } = await import('../dist/engine/browser.js');

    // 1) diagnostics shape
    try {
      const diagnostics = await runDiagnostics();
      const license = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
      assertCondition(typeof diagnostics.ready === 'boolean', 'diagnostics.ready must be boolean');
      assertCondition(Array.isArray(diagnostics.issues), 'diagnostics.issues must be an array');
      assertCondition(typeof diagnostics.capabilities?.screenshot === 'boolean', 'capabilities.screenshot must be boolean');
      assertCondition(typeof license.plan === 'string', 'license.plan must be string');
      logPass('Diagnostics and license shape');
    } catch (err) {
      failed = true;
      logFail('Diagnostics and license shape', String(err));
    }

    // 2) same-origin iframe
    try {
      const server = await startServer((req, res) => {
        if (req.url === '/inner') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<html><body><button id="inner">Inner</button></body></html>');
          return;
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<html><body><button id="outer">Outer</button><iframe src="/inner" style="width:320px;height:120px;"></iframe></body></html>'
        );
      });

      try {
        const result = await capturePage({ url: `${server.origin}/same` });
        const labels = result.elements.map((el) => el.label);
        assertCondition(labels.includes('Outer'), 'Outer button not found');
        assertCondition(labels.includes('Inner'), 'Inner iframe button not found');
        assertCondition(result.diagnostics.iframe_cross_origin === false, 'iframe_cross_origin should be false');
        assertCondition(result.elements.every((el) => typeof el.badge_number === 'number'), 'badge_number should exist on all elements');
        assertCondition(existsSync(result.screenshot), 'capture screenshot file should exist');
        logPass('Same-origin iframe detection', `elements=${labels.length}`);
      } finally {
        await server.close();
      }
    } catch (err) {
      failed = true;
      logFail('Same-origin iframe detection', String(err));
    }

    // 3) cross-origin iframe
    try {
      const innerServer = await startServer((req, res) => {
        if (req.url === '/inner') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<html><body><button id="inner-cross">InnerCross</button></body></html>');
          return;
        }
        res.writeHead(404);
        res.end('not found');
      });

      const outerServer = await startServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          `<html><body><button id="outer">Outer</button><iframe src="${innerServer.origin}/inner" style="width:320px;height:120px;"></iframe></body></html>`
        );
      });

      try {
        const result = await capturePage({ url: `${outerServer.origin}/cross` });
        const labels = result.elements.map((el) => el.label);
        assertCondition(labels.includes('Outer'), 'Outer button not found');
        assertCondition(!labels.includes('InnerCross'), 'Cross-origin iframe element should not be included');
        assertCondition(result.diagnostics.iframe_cross_origin === true, 'iframe_cross_origin should be true');
        assertCondition((result.diagnostics.iframe_frame_stats?.cross_origin_frames ?? 0) >= 1, 'cross_origin_frames should be >= 1');
        assertCondition(existsSync(result.screenshot), 'capture screenshot file should exist');
        logPass('Cross-origin iframe flagging', `cross_origin_frames=${result.diagnostics.iframe_frame_stats?.cross_origin_frames ?? 0}`);
      } finally {
        await outerServer.close();
        await innerServer.close();
      }
    } catch (err) {
      failed = true;
      logFail('Cross-origin iframe flagging', String(err));
    }

    // 4) redaction behavior
    try {
      const server = await startServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body>
              <input type="text" aria-label="API Key" value="sk_live_1234567890ABCDEFGH123456" />
              <input type="password" aria-label="Password" value="super-secret-password" />
            </body>
          </html>
        `);
      });

      try {
        const result = await capturePage({
          url: `${server.origin}/redaction`,
          security: {
            send_input_values: true,
            redact_secrets: true,
            redact_pii: true,
          },
        });
        const api = result.elements.find((el) => el.label === 'API Key');
        const pwd = result.elements.find((el) => el.label === 'Password');
        assertCondition(api?.value === '[REDACTED]', 'API Key value should be redacted');
        assertCondition(pwd?.value === '[REDACTED]', 'Password value should be redacted');
        assertCondition(result.diagnostics.redacted_count >= 2, 'redacted_count should be >= 2');
        assertCondition(existsSync(result.screenshot), 'capture screenshot file should exist');
        logPass('Redaction behavior', `redacted_count=${result.diagnostics.redacted_count}`);
      } finally {
        await server.close();
      }
    } catch (err) {
      failed = true;
      logFail('Redaction behavior', String(err));
    }

    // ─── 5) execute_flow: click + fill annotation presence ────────────────────
    // This test verifies that the CORE value prop works:
    //   - Click steps produce a click_icon annotation
    //   - Fill steps produce a step_number annotation
    //   - Annotated PNG differs from the raw PNG (SVG overlay was composited)
    try {
      const LOGIN_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="padding:32px;font-family:system-ui">
        <form id="f" method="post" action="/ok">
          <label for="em">Email</label><br>
          <input id="em" type="email" name="email" style="display:block;width:280px;padding:8px;margin:6px 0 14px"><br>
          <label for="pw">Password</label><br>
          <input id="pw" type="password" name="password" style="display:block;width:280px;padding:8px;margin:6px 0 14px"><br>
          <button type="submit" id="loginBtn" style="padding:10px 24px;background:#3182CE;color:white;border:none;border-radius:4px;cursor:pointer">
            ログイン
          </button>
        </form>
      </body></html>`;
      const OK_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>OK</h1></body></html>`;

      const flowServer = await startServer((req, res) => {
        const html = req.url === '/ok' ? OK_HTML : LOGIN_HTML;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      });

      try {
        // Discover refs via capture_page first
        const capture = await capturePage({ url: `${flowServer.origin}/` });
        const emailRef  = capture.elements.find((e) => e.type === 'input' && /email|em/i.test(e.label))?.ref
                        ?? capture.elements.find((e) => e.type === 'input')?.ref
                        ?? 1;
        const passRef   = capture.elements.filter((e) => e.type === 'input')[1]?.ref
                        ?? 2;
        const submitRef = capture.elements.find((e) => e.type === 'button')?.ref ?? 3;

        const flowResult = await executeFlow({
          url: `${flowServer.origin}/`,
          preset: 'friendly',
          default_wait: { strategy: 'auto', timeout: 2000 },
          auto_capture_each_step: true,
          steps: [
            { action: 'capture' },
            { action: 'fill',  ref: emailRef,  value: 'smoke@test.com' },
            { action: 'fill',  ref: passRef,   value: 'smokePass1' },
            { action: 'click', ref: submitRef },
          ],
        });

        const steps = flowResult.steps;
        assertCondition(steps.length === 4, `expected 4 steps, got ${steps.length}`);

        // Screenshots must exist and be real images
        for (const s of steps) {
          if (!s.screenshot) continue;
          assertCondition(existsSync(s.screenshot), `step ${s.step_number} screenshot missing`);
          assertCondition(statSync(s.screenshot).size > 5_000, `step ${s.step_number} screenshot too small`);
        }

        // fill steps must carry step_number annotation
        const fillSteps = steps.filter((s) => s.action === 'fill');
        for (const s of fillSteps) {
          assertCondition(s.annotation?.type === 'step_number',
            `fill step ${s.step_number} must have step_number annotation, got ${s.annotation?.type}`);
          const [ax, ay] = s.annotation.position;
          assertCondition(ax >= 0 && ay >= 0, `fill annotation position must be non-negative`);
        }

        // click step must carry click_icon annotation
        const clickSteps = steps.filter((s) => s.action === 'click');
        for (const s of clickSteps) {
          assertCondition(s.annotation?.type === 'click_icon',
            `click step ${s.step_number} must have click_icon annotation, got ${s.annotation?.type}`);
          const [ax, ay] = s.annotation.position;
          assertCondition(ax >= 0 && ay >= 0, `click annotation position must be non-negative`);
        }

        // Annotated PNG must differ from raw (SVG overlay applied)
        const outputDir = join(tempRoot, 'out');
        const rawDir = join(outputDir, 'raw');
        if (existsSync(rawDir)) {
          const rawFiles = readdirSync(rawDir);
          const clickStep = clickSteps[0];
          if (clickStep?.screenshot) {
            const prefix = `step_0${clickStep.step_number}`;
            const rawFile = rawFiles.find((f) => f.startsWith(prefix) && f.endsWith('.png'));
            if (rawFile) {
              const annotatedSize = statSync(clickStep.screenshot).size;
              const rawSize = statSync(join(rawDir, rawFile)).size;
              assertCondition(annotatedSize !== rawSize,
                `click step annotated PNG must differ from raw (annotation not composited)`);
            }
          }
        }

        const noErrors = steps.filter((s) => s.status === 'error').length;
        logPass('execute_flow click+fill annotation',
          `steps=${steps.length}, fill_annot=${fillSteps.length}, click_annot=${clickSteps.length}, errors=${noErrors}`);
      } finally {
        await flowServer.close();
      }
    } catch (err) {
      failed = true;
      logFail('execute_flow click+fill annotation', String(err));
    }

    await closeBrowser();
  } finally {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    if (originalPlaywrightPath) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = originalPlaywrightPath;
    } else {
      delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    }

    if (!keepArtifacts && existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  if (failed) {
    if (keepArtifacts) {
      process.stdout.write(`QA artifacts preserved at: ${join(tempRoot, 'out')}\n`);
    }
    process.exit(1);
  }

  if (keepArtifacts) {
    process.stdout.write(`QA artifacts preserved at: ${join(tempRoot, 'out')}\n`);
  }
  process.stdout.write('QA smoke checks completed successfully.\n');
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
