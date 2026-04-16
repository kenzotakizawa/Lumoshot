# Lumoshot MCP Server

Local-first MCP server for automated annotated screenshots.

## Quick Start

```bash
npm install
npm run build
npm run dev
```

MCP config example:

```json
{
  "lumoshot": {
    "command": "node",
    "args": ["/absolute/path/to/mcp-server/dist/index.js"]
  }
}
```

## Security Model

- Screenshots, DOM metadata, and annotation rendering run on the local machine.
- Lumoshot does not handle or store your AI provider API token.
- Secret masking defaults:
  - `security.redact_secrets: true`
  - `security.redact_pii: false`
  - `security.send_input_values: false`
- Trusted domains can relax masking behavior. Enable only for safe environments.

## Recommended AI Flow

1. Call `get_diagnostics` first.
2. If `ready: false`, inspect `issues` and guide the user to resolve setup problems.
3. Run `capture_page` to get current element refs.
4. Use `execute_flow` for multi-step operations.
5. Use `annotate_screenshot` for post-processing annotations.

## iframe Behavior

- Same-origin iframe elements are included in `elements`.
- Cross-origin iframes are not parsed and are surfaced via:
  - `diagnostics.iframe_cross_origin`
  - `diagnostics.iframe_frame_stats`

## License Behavior

- No license key: free tier mode.
- Free tier limit: 30 captures per month.
- License verification cache TTL: 7 days.
- With a valid cache, Lumoshot works offline until cache expiry.
- If cache is expired and verification fails:
  - network/offline: explicit verification error
  - server-side failure: explicit verification error

`LUMOSHOT_LICENSE_URL` can override the verification endpoint for local testing.

## Configuration

Config load order (later wins):

1. `~/.lumoshot/config.json` (legacy)
2. `~/.lumoshot/lumoshot.config.json`
3. `./lumoshot.config.json` (project override)

Example:

```json
{
  "security": {
    "redact_secrets": true,
    "redact_pii": false,
    "send_input_values": false,
    "trusted_domains": ["localhost", "127.0.0.1"]
  },
  "output": {
    "directory": "./lumoshot-output",
    "filename_template": "{name}_{viewport}_{timestamp}",
    "metadata_format": "yaml"
  }
}
```

`filename_template` variables:

- `{name}`: logical name like `capture` or `step_01`
- `{viewport}`: `WIDTHxHEIGHT`
- `{timestamp}`: `YYYYMMDDTHHMMSS`

`metadata_format`:

- `json`: default
- `yaml`: writes flow/elements metadata as `.yaml`

## Tests

```bash
npm run test:masking
npm run test:integration
npm run test:flow
npm run test:annotator
npm run test:license
npm run test:config
npm run test:all
```

## Quality Gate

```bash
npm run qa:gate
```

Detailed checklist: [docs/QA.md](./docs/QA.md)

## Live Canary (Optional)

```bash
npm run qa:live
```

This runs real-site checks (W3Schools Forms + Demoblaze) and saves screenshots under
`lumoshot-live-output/<run-id>/`.

## Day7 MCP Check (Optional)

```bash
npm run qa:day7
```

This launches the MCP server over stdio and validates the real tool chain:
`get_diagnostics` → `capture_page` → `execute_flow` → `annotate_screenshot`.

## Known Limitations

- `before_after` should be used as a standalone annotation operation.
- `os_frame` title bar corners and image body edge can look slightly unnatural.
- `callout` tail join may be slightly misaligned near page edges.
