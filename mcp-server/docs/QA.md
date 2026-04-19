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

- `https://ja.wikipedia.org/wiki/メインページ`
- `https://www.amazon.co.jp/` (can be skipped with `LUMOSHOT_INCLUDE_AMAZON=0`)

Flow targets (default enabled, optional unless strict-required):

- `wikipedia_search_flow`

Optional toggle:

```bash
LUMOSHOT_INCLUDE_AMAZON=0 npm run qa:live
```

Flow toggles:

| Env var | Default | Meaning |
|---|---|---|
| `LUMOSHOT_INCLUDE_FLOW` | `1` | Include `execute_flow` live scenarios |
| `LUMOSHOT_FLOW_REQUIRED` | `0` | Treat flow scenarios as required targets |

### Retry and backoff

Each target is retried up to 3 times (default) with exponential backoff before being
counted as failed. This tolerates transient network blips and slow CDN responses.

| Env var | Default | Meaning |
|---|---|---|
| `LUMOSHOT_LIVE_RETRIES` | `3` | Max attempts per target |
| `LUMOSHOT_LIVE_BACKOFF_MS` | `2000` | Base backoff in ms (attempt 2: 2s, attempt 3: 4s) |

Log output:

```
[WARN]  amazon_home attempt 1/3 failed: failed: label "cart" not found; ...
[RETRY] amazon_home (attempt 2/3) after 2000ms backoff
[PASS]  amazon_home (passed on attempt 2/3) - inputs=1, links=12, ...
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
| `kind` | string | `execute_flow` for flow scenarios (omitted for capture-only) |
| `flow_step_count` | number | Number of `execute_flow` steps |
| `flow_screenshot_count` | number | Number of screenshots produced by `execute_flow` |
| `end_url` | string | Final URL from `execute_flow` result |

Use `failed_criteria` to quickly pinpoint which selectors or labels weren't found when a
live check fails. Use `attempts[]` to see whether failure was consistent or intermittent.

### Notes

- Live checks are canary tests, not deterministic release gates.
- Prefer `qa:gate` for CI/release decisions.
- Use `qa:gate:live` before major releases to catch real-world regressions.
- Use `qa:release` for final publish checks (`qa:gate` → `qa:live` → `qa:day7`).
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

- Wikipedia main page:
  - `input` count is at least 1.
  - `link` count is at least 8.
  - Labels include Wikipedia brand (`Wikipedia` / `ウィキペディア`) and search context (`search` / `検索`).
  - Screenshot artifact exists and is non-trivial size.

- Amazon (required by default, skippable via env):
  - At least 1 input, 3 links.
  - Labels include search/account/cart context (English or Japanese variants).
  - Screenshot artifact exists and is non-trivial size.

- Wikipedia Search Flow (optional by default):
  - At least 2 flow steps.
  - At least 2 screenshots generated.
  - Fill/click annotation exists.
  - No step errors/timeouts.
  - Navigation is observed (`end_url !== start_url`).

When a live check fails, inspect `live-summary.json`:
1. Check `failed_criteria[]` to see which specific criteria weren't met.
2. Check `labels_sample[]` to see what was actually detected.
3. Check `attempts[]` to see if failure was consistent across retries.
4. If only 1 of 3 attempts failed, the failure is likely transient — not a regression.

## 6. Release checklist

Before publishing or sharing builds:

1. `npm run qa:gate` passes
2. `npm run qa:live` required targets pass
3. `npm run qa:day7` passes (stdio MCP toolchain check)
4. No unresolved diagnostics errors in `get_diagnostics`
5. Capture outputs are generated in expected directory
6. Free-tier count does not unexpectedly increase during test runs

Note: `qa:smoke` runs in an isolated temporary HOME, so usage counters are not polluted.

## 7. RC Preparation

Recommended sequence before RC tagging:

1. `npm run -s qa:release`
2. `npm pack --dry-run`

For `npm pack --dry-run`, confirm package contents are limited to runtime artifacts
(`dist/`, `README.md`, `LICENSE`) and do not include `src/`, `test/`, `docs/`,
or temporary output directories.

## 8. Known Runtime Constraints

1. `before_after` should be used as a standalone annotation operation.
2. `callout` tail join can be slightly off near viewport edges.
3. `os_frame` has minor visual edge mismatch between title bar and body.
