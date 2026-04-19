# Lumoshot MCP Server — 実装仕様書

> **バージョン:** 0.1.0（Draft）
> **作成日:** 2026-04-15
> **対象:** Claude Code 実装担当エージェント

---

## 1. 製品概要

### 1.1 何を作るか

AIコーディングエージェント（Claude Code, Cursor等）が、Webページの**注釈付きスクリーンショット**を自律的に撮影・生成できるローカル実行型MCPサーバー。

### 1.2 誰が使うか

- QAエンジニア：テスト証跡の自動記録
- CSカスタマーエンジニア：操作手順書の自動生成
- 開発者：UIドキュメントの自動化

### 1.3 使い方の前提

ユーザーが手動で注釈を付けるのではない。AIエージェントに「このページの操作手順を記録して」と指示すると、AIが自律的にページを開き、操作し、注釈付きスクショを撮影し、証跡ドキュメントを生成する。**人間は結果を確認するだけ。**

### 1.4 設計原則

- **撮影・注釈・DOM解析はすべてユーザーのローカルマシンで完結**する。スクショやDOM情報が外部サーバーに送信されることはない
- **AIのAPIトークンはユーザー自身が管理する**。Lumoshotはトークンを一切扱わない
- **インフラコストはユーザー数に比例しない**。サーバー側はライセンス検証のみ

---

## 2. アーキテクチャ

### 2.1 全体構成

```
ユーザーのマシン（ローカル）
├── Lumoshot MCP Server（Node.js プロセス）
│   ├── Playwright（ブラウザ制御）
│   ├── DOM解析エンジン（インタラクティブ要素検知）
│   ├── マスキングエンジン（秘匿情報の自動検知・除去）
│   ├── 注釈レンダラー（SVGオーバーレイ生成）
│   └── ライセンスモジュール（起動時検証、7日キャッシュ）
│
├── AIエージェント（Claude Code / Cursor / etc.）
│   └── MCPプロトコルで Lumoshot に接続
│
└── Chromium（Playwrightが制御するブラウザインスタンス）

外部（Takuki管理）
└── Supabase（ライセンス検証APIのみ）
    ├── licenses テーブル
    ├── users テーブル
    └── Edge Function: verify-license
```

### 2.2 データフロー

```
AIエージェント
  ↓ MCPプロトコル（ローカルstdio）
Lumoshot MCP Server
  ↓ Playwright API
Chromium（ページを開く・操作する）
  ↓ DOM解析
インタラクティブ要素マップ生成
  ↓ マスキングエンジン
秘匿情報を除去
  ↓ スクリーンショット撮影
生のスクショ画像
  ↓ 注釈レンダラー
注釈オーバーレイ済み画像 + メタデータJSON
  ↓ MCPレスポンス
AIエージェントに返却
```

### 2.3 インストール・セットアップ

```bash
npm install -g lumoshot-mcp
```

Claude Code の MCP設定に追加:

```json
{
  "lumoshot": {
    "command": "lumoshot-mcp",
    "args": []
  }
}
```

---

## 3. 初回起動時の診断

MCPサーバーの初回起動時に環境診断を行い、問題があれば構造化された診断情報をAIに返す。MCPサーバー自身が環境を自動修正することはしない。判断と実行はAI側に委ねる。

### 3.1 診断項目

#### 3.1.1 日本語フォントチェック

```jsonc
{
  "status": "font_missing",
  "message": "Japanese font not found. Text annotations may render incorrectly.",
  "diagnosis": {
    "os": "darwin",  // "darwin" | "linux" | "win32"
    "checked_fonts": ["Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo"],
    "found": [],
    "install_commands": {
      "darwin": "brew install --cask font-noto-sans-jp",
      "linux": "sudo apt install fonts-noto-cjk",
      "win32": "winget install Google.NotoSansCJK"
    }
  }
}
```

#### 3.1.2 Playwrightブラウザチェック

Playwrightが使用するChromiumがインストール済みか確認。未インストールなら `npx playwright install chromium` の実行を案内。

#### 3.1.3 ライセンスチェック

ライセンスキーの有無と有効性を確認。無料枠の残数も返す。

### 3.2 診断レスポンス形式

```jsonc
{
  "ready": false,
  "issues": [
    {
      "type": "font_missing",
      "severity": "warning",  // "error" | "warning"
      "detail": { /* 上記の診断情報 */ }
    }
  ],
  "capabilities": {
    "screenshot": true,
    "text_annotation": false,  // フォント不足のため
    "flow_execution": true
  }
}
```

`severity: "warning"` の場合はスクショ撮影自体は可能。テキスト注釈が正しく描画されない可能性がある旨をAIに伝える。

---

## 4. MCPツール仕様

### 4.1 `capture_page` — ページキャプチャ

ページを開き、DOM解析・マスキング・注釈付きスクショ撮影を一括実行する。

#### 入力

```jsonc
{
  "url": "https://app.example.com/settings",    // 必須

  // 待機戦略（省略時: auto）
  "wait": {
    "strategy": "auto",
    // "auto"    → networkidle待ち + MutationObserverで500ms安定を確認
    // "selector"→ 指定セレクタが出現するまで待機
    // "timeout" → 指定ミリ秒だけ待つ
    "selector": "#main-content",   // strategy=selector の場合
    "timeout": 5000                // 全strategyに適用される最大待機時間（ms）
  },

  // キャプチャモード（省略時: auto）
  "capture_mode": "auto",
  // "auto"     → ページ高さ ≤ viewport高さ×2 なら full、超えたら viewport
  //              autoでviewportになった場合、レスポンスに理由を含める
  // "viewport" → 現在の表示領域のみ
  // "full"     → フルページスクショ
  // "element"  → 特定要素とその周辺のみ
  "element_ref": 5,       // capture_mode=element の場合
  "element_padding": 40,  // 要素周辺の余白px（デフォルト: 40）

  // 注釈プリセット（省略時: auto）
  "preset": "auto",
  // "auto"     → AIの指示文脈から自動判定
  // "precise"  → 赤系、シャープ枠線、バグ報告・エラー指摘向き
  // "friendly" → 青緑系、角丸、手順説明・ガイド向き
  // "neutral"  → グレー系、最小装飾、ドキュメント添付向き

  // セキュリティ（省略時: config.json のデフォルト値）
  "security": {
    "redact_secrets": true,
    "redact_pii": false,
    "send_input_values": false
  },

  // バッジ描画
  "include_badges": true,          // デフォルト: true
  "badge_color": "#E53E3E"         // 省略時は赤。任意色で上書き可
}
```

#### 出力

```jsonc
{
  // 注釈オーバーレイ済みスクショ画像のファイルパス
  "screenshot": "/path/to/capture_1280x720_2026-04-15T143022.png",

  // 検知されたインタラクティブ要素のリスト（マスキング適用済み）
  "elements": [
    {
      "ref": 1,
      "type": "button",            // button | link | input | select | checkbox | radio | tab | etc.
      "role": "submit",            // ARIA role
      "label": "Submit Order",     // 表示テキスト（マスキング適用済み）
      "bbox": [120, 340, 200, 60], // [x, y, width, height] in px
      "interactive": true,
      "badge_number": 1,           // 注釈バッジの番号
      "badge_position": [120, 340] // バッジ描画位置
    },
    {
      "ref": 2,
      "type": "input",
      "role": "textbox",
      "label": "API Key",
      "value": "[REDACTED]",       // マスキング適用
      "bbox": [120, 420, 300, 40],
      "interactive": true,
      "redacted": true,            // マスク済みフラグ
      "badge_number": 2,
      "badge_position": [120, 420]
    }
  ],

  // ページメタデータ
  "page_meta": {
    "title": "Dashboard - Settings",
    "url": "https://app.example.com/settings",
    "viewport": { "width": 1280, "height": 720 },
    "device_pixel_ratio": 2,
    "scroll_position": { "x": 0, "y": 0 },
    "captured_at": "2026-04-15T14:30:22+09:00",
    "page_height": 1800
  },

  // 診断情報
  "diagnostics": {
    "font_check": null,            // 問題なければnull
    "redacted_count": 3,           // マスキングされた要素数
    "capture_mode_used": "viewport",
    "badge_density_mode": "compact",       // full | compact | disabled
    "badge_numbering_mode": "reindexed",   // original | reindexed | disabled
    "badge_rendered_count": 24,
    "badge_suppressed_count": 45,
    "capture_mode_reason": "Page height 4200px exceeds auto threshold 1.6x viewport (1152px). Full page available via capture_mode='full'."
  }
}
```

### 4.2 `execute_flow` — 操作フロー実行・証跡記録

複数ステップの操作を自律実行し、各ステップで注釈付きスクショを撮影する。証跡記録の本体。

#### 入力

```jsonc
{
  "url": "https://app.example.com/login",  // 必須: 開始URL
  "preset": "friendly",                     // 省略時: auto
  "badge_color": "#E53E3E",                 // fillのstep_number色（省略時は赤）

  "steps": [
    // capture: 現在の画面をスクショ
    { "action": "capture" },

    // click: 要素をクリック
    { "action": "click", "ref": 3 },

    // fill: 入力フィールドに値を入力
    { "action": "fill", "ref": 5, "value": "test@example.com", "badge_color": "#16A34A" },

    // click with description: 説明付きクリック（注釈ラベルに使用）
    {
      "action": "click",
      "ref": 7,
      "description": "ログインボタン押下",
      "callout_background": "#E53E3E",
      "callout_border_color": "#C53030",
      "callout_text_color": "#FFFFFF"
    },

    // wait: 条件を満たすまで待機
    {
      "action": "wait",
      "strategy": "selector",
      "selector": "#dashboard",
      "timeout": 10000
    },

    // capture: 操作後の画面をスクショ
    { "action": "capture" },

    // scroll: ページをスクロール
    { "action": "scroll", "direction": "down", "amount": 500 },

    // select: ドロップダウン選択
    { "action": "select", "ref": 12, "value": "option_2" },

    // hover: 要素にホバー（ツールチップ表示等の確認用）
    { "action": "hover", "ref": 15 }
  ],

  // オプション: 各ステップで自動キャプチャするか（デフォルト: true）
  // falseの場合、明示的な "capture" アクションのみでスクショを撮る
  "auto_capture_each_step": true,

  // オプション: 待機のデフォルト設定
  "default_wait": {
    "strategy": "auto",
    "timeout": 5000
  }
}
```

#### 出力

```jsonc
{
  "steps": [
    {
      "step_number": 1,
      "action": "capture",
      "screenshot": "step_01_1280x720_2026-04-15T143022.png",
      "elements": [ /* その時点のインタラクティブ要素リスト */ ],
      "meta": {
        "url": "https://app.example.com/login",
        "viewport": { "width": 1280, "height": 720 },
        "captured_at": "2026-04-15T14:30:22+09:00",
        "scroll_position": { "x": 0, "y": 0 }
      }
    },
    {
      "step_number": 2,
      "action": "click",
      "target_ref": 3,
      "target_label": "Username",
      "screenshot": "step_02_1280x720_2026-04-15T143024.png",
      "annotation": {
        "type": "click_icon",
        "position": [240, 180],
        "badge_number": 1
      },
      "meta": { /* ... */ }
    },
    {
      "step_number": 3,
      "action": "fill",
      "target_ref": 5,
      "target_label": "Email",
      "filled_value": "test@example.com",
      "screenshot": "step_03_...",
      "annotation": {
        "type": "step_number",
        "position": [120, 420],
        "badge_number": 2
      },
      "meta": { /* ... */ }
    }
    // ...
  ],

  // フロー全体のメタデータ
  "flow_meta": {
    "total_steps": 7,
    "total_screenshots": 7,
    "duration_ms": 12340,
    "preset": "friendly",
    "start_url": "https://app.example.com/login",
    "end_url": "https://app.example.com/dashboard",
    "viewport": { "width": 1280, "height": 720 }
  }
}
```

#### フロー実行中のエラーハンドリング

```jsonc
// 要素が見つからない場合
{
  "step_number": 3,
  "action": "click",
  "status": "error",
  "error": {
    "type": "element_not_found",
    "message": "ref:15 not found in current DOM. Page may have changed.",
    "suggestion": "Re-run capture_page to get updated element refs."
  },
  "screenshot": "step_03_error_..." // エラー時点のスクショも撮る
}

// タイムアウトの場合
{
  "step_number": 5,
  "action": "wait",
  "status": "timeout",
  "error": {
    "type": "wait_timeout",
    "message": "Selector '#dashboard' not found within 10000ms.",
    "suggestion": "Check if navigation succeeded. Current URL: https://app.example.com/login"
  },
  "screenshot": "step_05_timeout_..."
}
```

### 4.3 `annotate_screenshot` — 追加注釈

既存のスクショに注釈を追加する。AIが証跡を見返して追記する場合に使用。

#### 入力

```jsonc
{
  // 対象スクショ（execute_flowのstep番号 or ファイルパス）
  "screenshot_ref": "step_02",  // or "/path/to/image.png"

  // 注釈リスト（複数指定可、描画順に処理）
  "annotations": [

    // 四角形: 要素を囲む
    {
      "type": "box",
      "ref": 2,            // 要素ref指定（bbox自動取得）
      "color": "red",      // preset配色を使う場合は省略可
      "line_width": 2,     // px（デフォルト: 2）
      "label": "要確認"     // 枠の近くにラベル表示（省略可）
    },

    // 角丸四角形
    {
      "type": "rounded_box",
      "ref": 4,
      "color": "teal",
      "border_radius": 8    // px（デフォルト: 8）
    },

    // 矢印: 要素間の関係を示す
    {
      "type": "arrow",
      "from_ref": 2,
      "to_ref": 5,
      "color": "red",
      "label": "この順に操作"  // 矢印の中間に表示（省略可）
    },

    // 吹き出し
    {
      "type": "callout",
      "ref": 3,                // 吹き出しの「しっぽ」が指す先
      "text": "ここに正しい値を入力してください",
      "tail": "auto",          // "auto" | "top" | "bottom" | "left" | "right"
      "background": "#ffffff",
      "border_color": "blue"
    },

    // テキスト: 任意位置にテキスト配置
    {
      "type": "text",
      "position": [10, 10],    // [x, y] in px
      "text": "手順2: ログイン画面",
      "font_size": 16,
      "color": "#333333",
      "background": "rgba(255,255,255,0.8)"  // 省略可
    },

    // ステップ番号バッジ
    {
      "type": "step_number",
      "ref": 6,
      "number": 3             // 表示する番号
    },

    // クリックアイコン（集中線付き）
    {
      "type": "click_icon",
      "ref": 7,
      "click_type": "left"    // "left" | "right" | "double"
    },

    // スポットライト
    {
      "type": "spotlight",
      "ref": 8,               // ref指定 or bbox指定
      "shape": "auto"         // "auto" | "rect" | "ellipse"
      // "auto" → 要素のアスペクト比から自動判定
      // 初回利用時にユーザーに好みを確認し、設定に保存することを推奨
    },

    // モザイク / ぼかし
    {
      "type": "mosaic",
      "ref": 9,               // ref指定 or bbox指定
      "intensity": "strong"   // "light" | "medium" | "strong"
    },

    // OSフレーム
    {
      "type": "os_frame",
      "style": "auto"         // "auto" | "macos" | "windows" | "linux"
      // "auto" → ユーザーのOS検出結果を使用
      // 初回利用時に好みを確認し、設定に保存することを推奨
    },

    // クロップ
    {
      "type": "crop",
      "bbox": [100, 200, 600, 400]  // [x, y, width, height]
      // ref指定も可: "ref": 5, "padding": 40
    },

    // リサイズ
    {
      "type": "resize",
      "width": 800            // heightは比率維持で自動計算
    },

    // Before/After
    {
      "type": "before_after",
      "before_ref": "step_01",    // スクショ参照
      "after_ref": "step_05",
      "changed_regions": "auto",  // "auto" | [[x,y,w,h], ...]
      // "auto" → 画像diffで変化箇所を自動検出
      // 複数箇所検出時は、AIに「全部表示 or 主要な変更のみ」の判断を委ねる
      "layout": "side_by_side"    // "side_by_side" | "slider" | "overlay"
    }
  ]
}
```

#### 出力

```jsonc
{
  "screenshot": "/path/to/annotated_step_02.png",
  "annotations_applied": 5,
  "warnings": [
    // 注釈が重なった場合の警告等
    {
      "type": "overlap",
      "refs": [2, 3],
      "message": "Annotations on ref:2 and ref:3 overlap. Positions adjusted automatically."
    }
  ]
}
```

---

## 5. DOM解析エンジン

### 5.1 検知対象

以下の要素を「インタラクティブ要素」として検知し、refを付与する:

| 要素タイプ | 検知条件 |
|-----------|---------|
| button | `<button>`, `[role="button"]`, `input[type="submit"]`, `input[type="button"]` |
| link | `<a href>`, `[role="link"]` |
| input | `<input>` (text, email, password, number, search, tel, url), `<textarea>` |
| select | `<select>`, `[role="listbox"]`, `[role="combobox"]` |
| checkbox | `<input type="checkbox">`, `[role="checkbox"]` |
| radio | `<input type="radio">`, `[role="radio"]` |
| tab | `[role="tab"]`, `[role="tablist"]` 内のクリッカブル要素 |
| menu_item | `[role="menuitem"]`, `[role="menuitemcheckbox"]`, `[role="menuitemradio"]` |
| toggle | `[role="switch"]` |
| clickable | 上記に該当しないが、`onclick`ハンドラ、`cursor: pointer` CSS、`addEventListener('click')` を持つ要素 |

### 5.2 要素情報の抽出範囲

DOM解析はプライバシーを考慮して3層に分離する:

**第1層: 構造情報（常にAIに送信）**

- 要素の種類（type）
- ARIA role, aria-label
- バウンディングボックス（位置・サイズ）
- tabindex, disabled 等の状態属性

**第2層: 表示テキスト（デフォルト送信、マスキング適用済み）**

- ボタンラベル、リンクテキスト、placeholder
- 見出し、メニュー項目名
- ※ マスキングエンジン（後述）を通過した後のテキスト

**第3層: フォーム入力値・非表示属性（デフォルト送信しない）**

- `input.value`, `textarea.value`
- `hidden` input の value
- `data-*` カスタム属性の値
- ※ `security.send_input_values: true` で送信可能

### 5.3 検知ロジックの実行方法

Playwright の `page.evaluate()` でブラウザコンテキスト内のJavaScriptとして実行する。アクセシビリティツリー（`page.accessibility.snapshot()`）と DOM 走査を組み合わせ、ARIA情報とイベントリスナー情報の両方を取得する。

---

## 6. マスキングエンジン

### 6.1 パターンマッチによる自動検知

第2層テキストおよび第3層値に対して、以下のパターンを検知しマスキングする:

| カテゴリ | パターン | 例 |
|---------|---------|-----|
| APIキー | `sk-[a-zA-Z0-9]{20,}`, `sk_live_`, `sk_test_` | Stripe, OpenAI |
| GitHub Token | `ghp_[a-zA-Z0-9]{36}`, `gho_`, `ghs_`, `ghr_` | GitHub PAT |
| AWS | `AKIA[0-9A-Z]{16}` | AWS Access Key |
| Slack | `xoxb-`, `xoxp-`, `xoxa-` | Slack Bot Token |
| 秘密鍵 | `-----BEGIN (RSA\|EC\|OPENSSH\|PGP\|DSA )?PRIVATE KEY-----` | PEM形式 |
| JWT | `eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.` | JSON Web Token |
| クレジットカード | Luhnアルゴリズム検証可能な14-19桁数字 | カード番号 |
| パスワード | `input[type="password"]` の value | フォームパスワード |
| 汎用シークレット | `[a-zA-Z0-9_]*(secret\|token\|key\|password\|credential\|auth)[a-zA-Z0-9_]*\s*[:=]\s*['"][^'"]+['"]` | 設定値 |

### 6.2 DOM属性による検知

- `[data-sensitive]`, `[data-secret]`, `[data-redact]` 属性を持つ要素
- `input[type="password"]` の value（常時マスク）
- `[aria-hidden="true"]` の要素（注釈対象から除外）

### 6.3 マスキング処理

- **スクショ画像上:** 検知領域にガウシアンぼかしを適用
- **DOM情報上:** 該当テキストを `[REDACTED]` に置換
- **メタデータ:** `redacted: true` フラグを付与し、AIにマスク済みであることを通知

### 6.4 オプション: PII検知（デフォルトOFF）

`security.redact_pii: true` で有効化:

- メールアドレス: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- 電話番号: 日本 `0\d{1,4}-?\d{1,4}-?\d{3,4}`, 国際 `\+?[1-9]\d{7,14}`
- マイナンバー: `\d{4}\s?\d{4}\s?\d{4}` （12桁）

---

## 7. 注釈レンダラー

### 7.1 描画方式

ページ上にSVGオーバーレイを注入してからスクリーンショットを撮影する方式。画像の後処理（ピクセル操作）ではなく、DOM上のSVGレイヤーとして描画するため、ブラウザのレンダリングエンジンがアンチエイリアス等を担当し、高品質な出力が得られる。

ただし、モザイク/ぼかしとBefore/After、OSフレーム、クロップ、リサイズは撮影後の画像処理として実行する（Sharpまたはcanvas）。

### 7.2 プリセット配色

#### `precise`（バグ報告・エラー指摘向き）

| 用途 | 色 |
|-----|-----|
| 枠線・矢印 | `#E53E3E`（赤） |
| 枠線サブ | `#ED8936`（オレンジ） |
| バッジ背景 | `#E53E3E` |
| バッジ文字 | `#FFFFFF` |
| テキスト | `#1A202C` |
| 枠線スタイル | 角張り、line_width: 2px |

#### `friendly`（手順説明・ガイド向き）

| 用途 | 色 |
|-----|-----|
| 枠線・矢印 | `#3182CE`（青） |
| 枠線サブ | `#38B2AC`（ティール） |
| 枠線サブ2 | `#38A169`（緑） |
| バッジ背景 | `#3182CE` |
| バッジ文字 | `#FFFFFF` |
| テキスト | `#2D3748` |
| 枠線スタイル | 角丸（border-radius: 8px）、line_width: 2px |

#### `neutral`（ドキュメント添付向き）

| 用途 | 色 |
|-----|-----|
| 枠線・矢印 | `#718096`（グレー） |
| バッジ背景 | `#4A5568` |
| バッジ文字 | `#FFFFFF` |
| テキスト | `#4A5568` |
| 枠線スタイル | 角丸（border-radius: 4px）、line_width: 1px |

### 7.3 自動色ローテーション

1つのスクショに複数の注釈がある場合、プリセットの配色セットからローテーションで割り当て、視覚的に区別しやすくする。

### 7.4 注釈の重なり回避

> **実装時の注意事項（Claude Code向け）:**
> 要素が密集しているページで、バッジや枠線が重なって読めなくなる問題が発生する。
> 以下の戦略で重なりを回避すること:
>
> 1. **バッジ配置:** バッジは要素の左上を基準に配置するが、
>    他のバッジや要素と重なる場合は時計回りに代替位置を探索する
>    （左上 → 右上 → 右下 → 左下 → 上中央 → 下中央）
>
> 2. **枠線オフセット:** 枠線が他の枠線と完全に重なる場合、
>    外側に2pxずつオフセットして視覚的に区別する
>
> 3. **吹き出し配置:** 吹き出しは対象要素から最も空間が広い方向に配置する。
>    他の注釈との重なりを検出し、重なる場合は位置をシフトする
>
> 4. **重なり検出API:** `annotate_screenshot` のレスポンスに重なり警告を含め、
>    AIが必要に応じて位置調整を再指示できるようにする

---

## 8. セキュリティ設定

### 8.1 設定ファイル: `lumoshot.config.json`

プロジェクトルートまたはホームディレクトリに配置。プロジェクトルート側が優先。

```jsonc
{
  "security": {
    "redact_secrets": true,         // 秘密鍵・APIキー自動マスク（デフォルト: ON）
    "redact_pii": false,            // メール・電話番号マスク（デフォルト: OFF）
    "send_input_values": false,     // フォーム入力値をAIに送るか（デフォルト: OFF）
    "custom_redact_patterns": [     // ユーザー定義の追加パターン（正規表現）
      "INTERNAL-[A-Z0-9]{8}",
      "CORP-SECRET-\\d+"
    ],
    "trusted_domains": [            // このドメインではマスキングを緩和
      "localhost",
      "127.0.0.1",
      "staging.myapp.com"
    ]
  },

  "capture": {
    "default_viewport": { "width": 1280, "height": 720 },
    "default_preset": "auto",
    "default_wait_timeout": 5000,
    "default_capture_mode": "auto",
    "max_badge_overlays": 24       // capture_page で描画するバッジ数の上限（0で無効化）
  },

  "annotation": {
    "spotlight_shape": "auto",      // 初回確認後に設定
    "os_frame_style": "auto",       // 初回確認後に設定
    "dark_mode": "auto"             // "auto" | "light" | "dark"
  },

  "output": {
    "directory": "./lumoshot-output",
    "filename_template": "step_{number}_{viewport}_{timestamp}",
    "metadata_format": "json"       // "json" | "yaml"
  }
}
```

### 8.2 セキュリティの原則（ドキュメント・READMEに明記すること）

- スクショとDOM情報はローカルにのみ保存され、Lumoshotのサーバーには**一切送信されない**
- ライセンス検証時に送信されるのは**ライセンスキーのみ**
- AI APIへの画像送信は**ユーザー自身のAPIキーと判断による**
- 「完全に安全」とは謳わない。データの流れを透明に開示する

---

## 9. ライセンスシステム

### 9.1 プラン

| | Free | Pro |
|--|------|-----|
| 月額 | $0 | $3〜5 |
| 月間スクショ | 30枚 | 無制限 |
| 基本注釈 | ○ | ○ |
| 高度注釈（Before/After, spotlight等） | × | ○ |
| カスタムマスキングパターン | × | ○ |
| プリセットカスタマイズ | × | ○ |

### 9.2 ライセンス検証フロー

1. MCPサーバー起動時に Supabase Edge Function へ問い合わせ
2. レスポンス: `{ valid: true, plan: "pro", expires_at: "2026-04-22T00:00:00Z" }`
3. レスポンスをローカルにキャッシュ（7日間有効）
4. キャッシュ期限まではオフラインでも動作
5. キャッシュ期限切れ後、次の起動時に再検証

### 9.3 無料枠のカウント

`chrome.storage.local`（ではなくNode.js環境なので`~/.lumoshot/usage.json`）にカウンターを保持。月初にリセット。

```jsonc
{
  "month": "2026-04",
  "capture_count": 12,
  "limit": 30
}
```

> **意図的な割り切り:** クライアント側カウントは改ざん可能だが、$3-5の価格帯でサーバー側の厳密管理を行うコストの方が高い。改ざんするリテラシーのある人は元々課金しない層であり、ここにインフラコストをかけない。

### 9.4 Supabase構成

```sql
-- licenses テーブル
create table licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  user_email text not null,
  plan text not null default 'free',  -- 'free' | 'pro'
  valid_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ライセンス検証 Edge Function（verify-license）
-- POST /verify-license
-- Body: { "license_key": "..." }
-- Response: { "valid": true, "plan": "pro", "expires_at": "..." }
```

### 9.5 決済

Lemon Squeezy または Stripe を使用。Webhook で Supabase の licenses テーブルを更新する。月額サブスクリプションモデル。

---

## 10. 出力ファイル構造

```
lumoshot-output/
├── flow_meta.json                           # フロー全体のメタデータ
├── step_01_1280x720_2026-04-15T143022.png   # 注釈済みスクショ
├── step_02_1280x720_2026-04-15T143024.png
├── step_03_1280x720_2026-04-15T143027.png
├── raw/                                      # 注釈なしの生スクショ（オプション）
│   ├── step_01_raw.png
│   ├── step_02_raw.png
│   └── step_03_raw.png
└── elements/                                 # ステップごとの要素情報
    ├── step_01_elements.json
    ├── step_02_elements.json
    └── step_03_elements.json
```

### 10.1 `flow_meta.json` の構造

```jsonc
{
  "lumoshot_version": "0.1.0",
  "flow": {
    "start_url": "https://app.example.com/login",
    "end_url": "https://app.example.com/dashboard",
    "total_steps": 7,
    "duration_ms": 12340,
    "started_at": "2026-04-15T14:30:22+09:00",
    "completed_at": "2026-04-15T14:30:34+09:00"
  },
  "environment": {
    "os": "darwin",
    "viewport": { "width": 1280, "height": 720 },
    "device_pixel_ratio": 2,
    "browser": "chromium",
    "lumoshot_preset": "friendly"
  },
  "steps": [
    {
      "step_number": 1,
      "action": "capture",
      "screenshot": "step_01_1280x720_2026-04-15T143022.png",
      "url": "https://app.example.com/login",
      "captured_at": "2026-04-15T14:30:22+09:00"
    }
    // ...
  ]
}
```

---

## 11. 技術スタック

| 項目 | 技術 |
|------|------|
| ランタイム | Node.js 20+ |
| ブラウザ制御 | Playwright |
| 画像処理（後処理） | Sharp |
| MCPプロトコル | @modelcontextprotocol/sdk |
| 配布 | npm（`lumoshot-mcp`） |
| ライセンスAPI | Supabase Edge Functions |
| 決済 | Lemon Squeezy or Stripe |

---

## 12. 実装上の注意事項

### 12.1 注釈の重なり回避（再掲・重要）

要素が密集しているページではバッジや枠線が重なる問題が必ず発生する。バッジ配置時に他の注釈との衝突判定を行い、自動オフセットするロジックを注釈レンダラーに実装すること。詳細は「7.4 注釈の重なり回避」を参照。

### 12.2 SPAへの対応

SPAではページ遷移がDOMの部分更新で行われるため、`execute_flow` のステップ間で要素のrefが変わる可能性がある。各アクションの前に自動でDOM再解析を行い、refマップを更新すること。

### 12.3 iframe 対応

iframe内の要素も検知対象にすべきだが、クロスオリジンiframeの中身は取得できない。同一オリジンのiframeのみ対応し、クロスオリジンの場合はメタデータに `"iframe_cross_origin": true` を付与して、AIに判断を委ねる。

### 12.4 パフォーマンス

DOM解析は要素数が多いページ（1000+要素）で遅くなる可能性がある。visible（viewport内）な要素のみを対象とするモードをデフォルトにし、全要素解析はオプションとする。

### 12.5 テスト戦略

- ユニットテスト: マスキングエンジンのパターンマッチ
- インテグレーションテスト: 固定HTMLページに対する `capture_page` の出力検証
- ビジュアルリグレッション: 注釈レンダラーの出力画像のスナップショットテスト

---

## 13. ユーザー確認が必要な場面

以下の場面では、MCPサーバーがAIに「ユーザーに確認を求めるべき」という情報を返す。AIが直接ユーザーに問い合わせる:

| 場面 | 返す情報 | 確認内容 |
|------|---------|---------|
| 初回起動・フォント不足 | 診断結果 + インストールコマンド | フォントをインストールしてよいか |
| capture_mode=auto でフルページ超過 | 現在のモードと理由 | viewport / full どちらがよいか |
| spotlight 初回利用 | 形状オプション | rect / ellipse のどちらを好むか |
| os_frame 初回利用 | OS検出結果 | macOS / Windows / Linux のどのフレームか |
| before_after で変化箇所が複数 | 検出箇所リスト | 全箇所表示 / 主要変更のみ |
| 吹き出し配置が曖昧 | 推定配置のプレビュー情報 | 配置方向の確認 |

---

## 14. 将来の拡張候補（本バージョンでは未実装）

- Chrome拡張連携（ユーザーのリアルセッション撮影）
- 動画キャプチャ（操作フローのGIF/MP4出力）
- Markdownドキュメント自動生成（スクショ + 説明文のガイド出力）
- チーム共有機能（注釈テンプレートの共有）
- Figma/Notion等への直接エクスポート
