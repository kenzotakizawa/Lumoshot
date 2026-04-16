# QA Guide (Local)

This guide is for manual verification and release-quality checks.

## 1. One-command quality gate

Run all checks:

```bash
npm run qa:gate
```

What this includes:

- Type safety: `typecheck`
- Unit/integration tests: `test:all`
- Runtime smoke checks: `qa:smoke`

Expected result:

- Exit code `0`
- `QA smoke checks completed successfully.`

## 1.1 Optional live-site canary checks

Run checks against real public pages:

```bash
npm run qa:live
```

Targets (required):

- `https://www.w3schools.com/html/html_forms.asp`
- `https://www.demoblaze.com/`

Optional target:

```bash
npm run qa:live:amazon
```

This adds `https://www.amazon.com/` as a non-required target.

### Retry and backoff

Each target is retried up to 3 times (default) with exponential backoff before being
counted as failed. This tolerates transient network blips and slow CDN responses.

| Env var | Default | Meaning |
|---|---|---|
| `LUMOSHOT_LIVE_RETRIES` | `3` | Max attempts per target |
| `LUMOSHOT_LIVE_BACKOFF_MS` | `2000` | Base backoff in ms (attempt 2: 2s, attempt 3: 4s) |

Log output:

```
[WARN]  ecommerce_demo attempt 1/3 failed: failed: links=3 (need >=6); ...
[RETRY] ecommerce_demo (attempt 2/3) after 2000ms backoff
[PASS]  ecommerce_demo (passed on attempt 2/3) - links=8, ...
```

### Artifacts

- `lumoshot-live-output/<run-id>/capture_*.png`
- `lumoshot-live-output/<run-id>/raw_*.png`
- `lumoshot-live-output/<run-id>/live-summary.json`

### `live-summary.json` schema

Each entry in `results[]` contains:

| Field | Type | Description |
|---|---|---|
| `id` | string | Target identifier |
| `status` | `pass\|fail\|error` | Final status after all attempts |
| `reason` | string | Human-readable outcome detail |
| `failed_criteria` | string[] | Which specific checks failed (populated on fail) |
| `attempts_used` | number | How many attempts were made |
| `attempts` | object[] | Per-attempt records with `status`, `reason`, `duration_ms` |
| `url` | string | Target URL |
| `labels_sample` | string[] | First 20 element labels detected (for debugging) |
| `element_types` | object | Count by element type (button, input, link, …) |
| `screenshot` | string | Absolute path to annotated PNG from last successful attempt |
| `total_duration_ms` | number | Wall time across all attempts |

Use `failed_criteria` to quickly pinpoint which selectors or labels weren't found when a
live check fails. Use `attempts[]` to see whether failure was consistent or intermittent.

### Notes

- Live checks are canary tests, not deterministic release gates.
- Prefer `qa:gate` for CI/release decisions.
- Use `qa:gate:live` before major releases to catch real-world regressions.
- A target is only counted as failed when **all** retry attempts fail.

## 2. Fast checks while developing

```bash
npm run test:masking
npm run test:integration
```

Use these during development before running full gate.

## 3. MCP behavior checks in your client

In your MCP client (Claude Code/Cursor), run:

1. `get_diagnostics`
2. `capture_page` on a normal page
3. `execute_flow` with 2-3 steps
4. `annotate_screenshot` on one output image

Confirm:

- `get_diagnostics` returns `ready`, `issues`, `capabilities`, and `license`.
- `capture_page` returns screenshot path, element refs, and diagnostics.
- `execute_flow` writes `flow_meta.json` and step screenshots.
- `annotate_screenshot` produces a new image and warnings (if any).
- Generated screenshot paths actually exist on disk.

## 4. iframe acceptance criteria

- Same-origin iframe:
  - iframe elements appear in `elements`.
  - `diagnostics.iframe_cross_origin` is `false`.

- Cross-origin iframe:
  - iframe elements are NOT included in `elements`.
  - `diagnostics.iframe_cross_origin` is `true`.
  - `diagnostics.iframe_frame_stats.cross_origin_frames >= 1`.

## 5. Masking acceptance criteria

- With `security.send_input_values: true`:
  - secret-like input values are returned as `[REDACTED]`
  - password field values are `[REDACTED]`
- `diagnostics.redacted_count` increases accordingly

## 5.1 Live checks acceptance criteria

Each criterion below must pass on at least one of the retry attempts.

- W3Schools Forms:
  - `input` count is at least 2.
  - Labels include form context (e.g. `HTML Forms`) and `First name`.
  - Screenshot artifact exists and is non-trivial size.

- E-commerce demo (Demoblaze):
  - Link count is at least 6.
  - Labels include `PRODUCT STORE` and at least two category labels (`Phones`, `Laptops`, `Monitors`).
  - At least one product-like link label is detected.
  - Screenshot artifact exists and is non-trivial size.

- Amazon (optional):
  - At least 1 input, 3 links.
  - Labels include `search`, `account` or `sign in`, and `cart`.
  - Screenshot artifact exists and is non-trivial size.

When a live check fails, inspect `live-summary.json`:
1. Check `failed_criteria[]` to see which specific criteria weren't met.
2. Check `labels_sample[]` to see what was actually detected.
3. Check `attempts[]` to see if failure was consistent across retries.
4. If only 1 of 3 attempts failed, the failure is likely transient — not a regression.

## 6. Release checklist

Before publishing or sharing builds:

1. `npm run qa:gate` passes
2. `npm run qa:live` required targets pass
3. No unresolved diagnostics errors in `get_diagnostics`
4. Capture outputs are generated in expected directory
5. Free-tier count does not unexpectedly increase during test runs

Note: `qa:smoke` runs in an isolated temporary HOME, so usage counters are not polluted.

## 7. RC Preparation

Recommended sequence before RC tagging:

1. `npm run -s qa:gate`
2. `npm run -s qa:live`
3. `npm pack --dry-run`

For `npm pack --dry-run`, confirm package contents are limited to runtime artifacts
(`dist/`, `README.md`, `LICENSE`) and do not include `src/`, `test/`, `docs/`,
or temporary output directories.

## 8. Known Runtime Constraints

1. `before_after` should be used as a standalone annotation operation.
2. `callout` tail join can be slightly off near viewport edges.
3. `os_frame` has minor visual edge mismatch between title bar and body.
