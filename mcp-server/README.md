# Lumoshot MCP Server

**AI エージェントに目を与える MCP サーバー。**  
Claude から URL を渡すだけで、注釈付きスクリーンショットと要素リストが返ってきます。

> Works with **Claude Code**, **Claude Desktop**, and any MCP-compatible client.

---

## インストール

```bash
npx playwright install chromium
```

Playwright の Chromium が必要です。次のコマンドで確認できます。

```bash
npx lumoshot-mcp --version
```

---

## Claude Code への設定

`.claude/mcp.json` に追記：

```json
{
  "lumoshot": {
    "command": "npx",
    "args": ["-y", "lumoshot-mcp"]
  }
}
```

ライセンスキーを使う場合：

```json
{
  "lumoshot": {
    "command": "npx",
    "args": ["-y", "lumoshot-mcp"],
    "env": {
      "LUMOSHOT_LICENSE_KEY": "your-key-here"
    }
  }
}
```

---

## Claude Desktop への設定

`claude_desktop_config.json` に追記：

```json
{
  "mcpServers": {
    "lumoshot": {
      "command": "npx",
      "args": ["-y", "lumoshot-mcp"]
    }
  }
}
```

---

## できること

### `capture_page` — ページをキャプチャする

URL を渡すと、スクリーンショットとインタラクティブ要素のリスト（ref 番号付き）が返ります。

```
capture_page(url="https://example.com")
```

- ボタン・入力欄・リンクに番号バッジを自動付与
- 要素の ref 番号を使って `execute_flow` や `annotate_screenshot` で参照できる
- API キー・パスワードなどは自動マスク

### `execute_flow` — 複数ステップを自動実行する

クリック・入力・スクロールなどのステップを順番に実行し、各ステップの注釈付きスクリーンショットを返します。

```
execute_flow(
  url="https://example.com/login",
  steps=[
    { action: "fill", selector: "#email", value: "user@example.com" },
    { action: "fill", selector: "#password", value: "••••••••" },
    { action: "click", selector: "button[type=submit]" },
    { action: "capture" }
  ]
)
```

### `annotate_screenshot` — スクリーンショットに注釈を加える

既存のスクリーンショットに矢印・吹き出し・ハイライトなどを追加します。

```
annotate_screenshot(
  screenshot_ref="step_01",
  annotations=[
    { type: "callout", ref: 3, text: "ここをクリック" },
    { type: "arrow", from_ref: 1, to_ref: 5 }
  ]
)
```

対応アノテーション：`box` / `rounded_box` / `arrow` / `callout` / `text` / `step_number` / `click_icon` / `spotlight` / `mosaic` / `crop` / `resize` / `os_frame` / `before_after`

### `get_diagnostics` — 動作確認

```
get_diagnostics()
```

Playwright の状態・ライセンス・CJK フォントの有無を確認できます。

---

## AI への推奨フロー

Claude に以下の順で使わせると効果的です：

1. `get_diagnostics` — 環境確認
2. `capture_page` — ページを把握して ref 番号を取得
3. `execute_flow` — 操作を自動実行
4. `annotate_screenshot` — 結果に注釈を追加

---

## セキュリティ

- スクリーンショット・DOM 解析・注釈レンダリングはすべてローカルで実行
- AI プロバイダーの API トークンは Lumoshot を経由しない
- デフォルトで API キー・パスワードを自動マスク（`redact_secrets: true`）

信頼ドメインでマスクを緩める場合は設定ファイルで `trusted_domains` を指定してください。

---

## 設定ファイル（任意）

`./lumoshot.config.json` または `~/.lumoshot/lumoshot.config.json` に置きます。
後から読まれたファイルが優先されます。

```json
{
  "capture": {
    "device_pixel_ratio": 2,
    "max_badge_overlays": 24
  },
  "output": {
    "directory": "./lumoshot-output",
    "keep_raw": false
  },
  "security": {
    "redact_secrets": true,
    "redact_pii": false,
    "trusted_domains": ["localhost", "127.0.0.1"]
  }
}
```

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `capture.device_pixel_ratio` | `2` | Retina 2x。`1` にするとファイルサイズが半分になる |
| `capture.max_badge_overlays` | `24` | バッジの最大表示数。`0` で無効化 |
| `output.directory` | `./lumoshot-output` | 出力先ディレクトリ |
| `output.keep_raw` | `false` | `true` にすると注釈前の raw 画像を残す |

---

## ライセンス

- **Free**: 月 30 回まで無料
- **Pro**: 無制限（ライセンスキーが必要）

ライセンスは 7 日間ローカルキャッシュされるため、一時的なオフライン環境でも動作します。

---

## 既知の制限

- `before_after` は単独アノテーションとして使用してください（他のアノテーションと同時指定不可）
- `os_frame` のタイトルバーコーナーは一部不自然に見える場合があります
- クロスオリジン iframe 内の要素は取得できません

---

## ライセンス (License)

MIT © Lumoshot
