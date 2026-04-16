# Lumoshot MCP Server 引き継ぎ書（2026-04-17）

- 作成日: 2026-04-17 (JST)
- 対象ディレクトリ: `/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server`
- 前回引き継ぎ書: `docs/HANDOVER_CLAUDE_CODE_2026-04-16.md`
- リリース計画: `docs/RELEASE_PLAN_2026-04-16.md`

---

## 1. 現在の品質ゲート状態

```
npm run -s qa:gate → 全 63 チェック PASS

  masking tests:        6/6   PASS
  capture-page tests:   6/6   PASS  ← 今回 +1（clickable ノイズ低減テスト追加）
  execute-flow tests:   4/4   PASS
  annotator tests:     27/27  PASS  ← 今回 +5（before_after / callout left/right）
  license tests:        7/7   PASS  ← 今回追加
  config-output tests: 13/13  PASS  ← 今回追加
  qa:smoke (5項目):     5/5   PASS
```

---

## 2. 今回セッション（2026-04-17）で完了した作業

### Day 1（2026-04-16 完了分の確認含む）

#### 2.1 `before_after` の `changed_regions` / `slider` を schema・types から除外

- `src/types.ts`: `BeforeAfterAnnotation` から `changed_regions?: 'auto' | BoundingBox[]` を削除
- `src/tools/annotate-screenshot.ts`: Zod スキーマの `changed_regions` 行を削除

#### 2.2 `package.json` に `"files"` フィールドを追加

```json
"files": ["dist/", "README.md", "LICENSE"]
```

`npm pack --dry-run` で `src/` / `test/` / `scripts/` / `docs/` / `sample-annotations/` が含まれないことを確認済み。

---

### Day 2: ライセンス本番化

#### 2.3 `LicenseVerificationError` クラス追加（`src/license/license.ts`）

- reason: `'offline'` / `'server_error'` / `'not_configured'` の 3 種
- オフライン時のサイレント free tier 降格を廃止 → 明確エラーに変更
- キャッシュ有効期間内 → キャッシュ使用（オフライン対応）
- キャッシュ切れ + オフライン → `LicenseVerificationError('offline')` を throw

| 状態 | 挙動 |
|---|---|
| ライセンスキーなし | free tier（正常） |
| キャッシュ有効（7日以内） | キャッシュ使用、ネットワーク不要 |
| キャッシュ切れ + オンライン | リモート検証、キャッシュ更新 |
| キャッシュ切れ + オフライン | `LicenseVerificationError('offline')` |
| サーバー 4xx/5xx | `LicenseVerificationError('server_error')` |
| `LUMOSHOT_LICENSE_URL` 未設定（空文字） | `LicenseVerificationError('not_configured')` |

#### 2.4 本番 URL の確定・コード反映

```typescript
// src/license/license.ts
const VERIFY_URL =
  process.env.LUMOSHOT_LICENSE_URL ??
  'https://cqiyquckogeqjzrkmsqg.supabase.co/functions/v1/verify-license';
```

`LUMOSHOT_LICENSE_URL` はローカルテスト用オーバーライドとして残す。

#### 2.5 `src/index.ts` に `LicenseVerificationError` ハンドラを追加

ツール呼び出しエラー時、`reason` / `message` / `suggestion` を含む JSON を返す。

#### 2.6 `test/license.test.ts` 新規作成（7 テスト）

- no key → free tier
- valid cache → キャッシュ使用（ネットワーク不要）
- expired cache + online → リモート検証 + キャッシュ更新
- expired cache + offline → `LicenseVerificationError('offline')`
- server error → `LicenseVerificationError('server_error')`
- `LUMOSHOT_LICENSE_URL=""` → `LicenseVerificationError('not_configured')`
- free tier usage limit → `UsageLimitError`

---

### Day 3: `annotate_screenshot` 仕様一致

#### 2.7 `before_after` の構造バグ修正（`src/engine/annotator.ts`）

**問題**: `before_after` が overlay ループ内で早期 `return` → ループ前の mosaic composite が捨てられる  
**修正**: `before_after` を関数冒頭で先行処理し即 `return`

```typescript
// applyAnnotations() の冒頭で処理
const beforeAfterAnn = annotations.find((a) => a.type === 'before_after');
if (beforeAfterAnn && beforeAfterAnn.type === 'before_after') {
  // side_by_side または overlay を処理して return
}
// それ以外は overlay/structural ループへ
```

#### 2.8 `callout` の `tail: 'left'` / `tail: 'right'` を実装（`src/engine/annotator.ts`）

- `left`: callout が要素の右側に配置、tail が左側から要素を指す
- `right`: callout が要素の左側に配置、tail が右側から要素を指す
- schema（Zod）は元から `left`/`right` を受け付けていたが実装がなく `top` にフォールスルーしていた

#### 2.9 `test/annotator.integration.test.ts` に 5 テスト追加（22 → 27）

- `callout tail=left` / `callout tail=right`
- `before_after side_by_side`（幅が 2 倍になることを確認）
- `before_after overlay`（同サイズを確認）
- `before_after` regression（構造バグ修正の確認）

---

### Day 4: 設定反映の実効化

#### 2.10 `buildFilename` をテンプレート対応に更新（`src/engine/browser.ts`）

**Before**: `${prefix}_${viewport.width}x${viewport.height}_${ts}.png`（固定フォーマット）  
**After**: `config.output.filename_template` を使用、`{name}` / `{viewport}` / `{timestamp}` を置換

```typescript
export function buildFilename(
  name: string,
  viewport: { width: number; height: number },
  template = config.output.filename_template,
): string { ... }
```

#### 2.11 デフォルトテンプレートを修正（`src/config.ts`）

```
Before: 'step_{number}_{viewport}_{timestamp}'  （{number} が未使用で残っていた）
After:  '{name}_{viewport}_{timestamp}'
```

#### 2.12 `serializeMetadata` ヘルパーを追加（`src/engine/browser.ts`）

```typescript
export function serializeMetadata(
  data: unknown,
  format: 'json' | 'yaml' = config.output.metadata_format,
): { content: string; ext: 'json' | 'yaml' } { ... }
```

`yaml` 形式は `yaml` npm パッケージ（v2.x）を使用。

#### 2.13 `execute-flow.ts` のメタデータファイル出力を設定反映

- `flow_meta.json` → `flow_meta.{json|yaml}`
- `elements/step_XX_elements.json` → `elements/step_XX_elements.{json|yaml}`

#### 2.14 `test/config-output.test.ts` 新規作成（13 テスト）

- `buildFilename` テンプレート変数置換 × 7
- `serializeMetadata` JSON/YAML シリアライズ × 6

---

### Day 5: DOM clickable 過検知抑制

#### 2.15 `getElementType` の `clickable` 判定を複合条件に強化（`src/engine/dom-analyzer.ts`）

**Before**: `cursor:pointer` OR `onclick` → clickable  
**After**:

```typescript
if (hasOnclick) return 'clickable';
if (hasCursorPointer && (hasUsableTabindex || hasInteractionData)) return 'clickable';
// cursor:pointer 単独 → skip
```

`hasInteractionData` で検出する data 属性:
`data-action`, `data-click`, `data-href`, `data-toggle`, `data-dismiss`, `data-target`, `data-url`, `data-link`, `data-modal`, `data-route`

#### 2.16 `test/capture-page.integration.test.ts` を更新

- 既存テストの HTML を更新（`cursor:pointer` 単独の div を除外、複合条件の div を追加）
- `capture_page clickable noise reduction` テスト追加（6 種のアサーション）

---

## 3. 変更ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `src/types.ts` | `BeforeAfterAnnotation.changed_regions` 削除 |
| `src/tools/annotate-screenshot.ts` | Zod スキーマの `changed_regions` 削除 |
| `src/license/license.ts` | `LicenseVerificationError` 追加、本番 URL 設定、オフライン fallback 修正 |
| `src/index.ts` | `LicenseVerificationError` ハンドラ追加 |
| `src/engine/annotator.ts` | `before_after` 構造バグ修正、`callout` left/right 実装 |
| `src/engine/browser.ts` | `buildFilename` テンプレート対応、`serializeMetadata` 追加 |
| `src/engine/dom-analyzer.ts` | `clickable` 判定を複合条件に強化 |
| `src/tools/execute-flow.ts` | メタデータ出力を `serializeMetadata` 経由に変更 |
| `src/config.ts` | デフォルトテンプレート修正 |
| `package.json` | `files` 追加、`yaml` 依存追加、各テストスクリプト追加 |
| `test/license.test.ts` | 新規作成（7 テスト） |
| `test/config-output.test.ts` | 新規作成（13 テスト） |
| `test/annotator.integration.test.ts` | 5 テスト追加（22 → 27） |
| `test/capture-page.integration.test.ts` | clickable ノイズ低減テスト追加・既存テスト更新 |

---

## 4. 残課題（Day 6・7）

### Day 6: 回帰確認 + ドキュメント + RC 準備

#### 4.1 `qa:live` の実行と確認

```bash
npm run -s qa:live
```

- ネットワーク依存のため CI には含めない。リリース前手動確認として実施
- 失敗時は `live-summary.json` の `failed_criteria` → `attempts` の順に確認

#### 4.2 README / QA ドキュメント最終更新

以下の内容を README に反映：

- **セキュリティ方針**（redact_secrets / redact_pii / send_input_values の説明）
- **ライセンス挙動**（free tier 制限、キャッシュ TTL 7 日、オフライン時の挙動）
- **既知の制約**:
  - `before_after` は他の annotation と同時使用不可（単独で使うこと）
  - `os_frame` のタイトルバー角丸と画像本体の境界が不自然（低優先度 TODO）
  - `callout` の tail 三角とボックスの接合部が画面端で微妙にずれる場合がある
- **設定ファイル例**（`~/.lumoshot/lumoshot.config.json` / `lumoshot.config.json`）
- **`filename_template` の使い方**（`{name}`, `{viewport}`, `{timestamp}` 変数）
- **`metadata_format: yaml` の使い方**

#### 4.3 RC タグ作成

```bash
git tag v0.1.0-rc.1
```

---

### Day 7: 最終判定 + npm publish

#### 4.4 MCP クライアント実機確認

Claude Desktop / Cursor 等の MCP クライアントから以下を実際に呼び出して確認：

1. `get_diagnostics` — ライセンス状態・Playwright 状態が返ること
2. `capture_page` — スクリーンショットと elements が正常に返ること
3. `execute_flow` — click / fill ステップが動作し、注釈付き画像が生成されること
4. `annotate_screenshot` — `before_after` / `spotlight` が Pro 判定されること

#### 4.5 Go / No-Go 判定（全条件を満たすこと）

| 条件 | 確認方法 |
|---|---|
| `qa:gate` が全 PASS | `npm run -s qa:gate` |
| `qa:live` required ターゲットが PASS | `npm run -s qa:live` |
| ライセンス失敗時ポリシーが固定済み | Day 2 で完了 ✓ |
| 仕様・スキーマ・実装の不一致がない | Day 3 で解消 ✓ |
| `npm pack` の成果物が意図どおり | Day 1 で確認 ✓ |

#### 4.6 npm publish

```bash
npm publish --access public
```

---

## 5. 注意事項

- `sample-annotations/` ディレクトリ（開発用サンプル PNG）はコミット不要
- `mcp-server` はリポジトリルートから untracked 扱い。コミット戦略は作業再開時に明示決定
- `LUMOSHOT_LICENSE_URL` の env override はローカルテスト専用。本番 URL はコードに埋め込み済み
- Supabase DB（`licenses` テーブル + `verify-license` Edge Function）は別途セットアップが必要。設計は `docs/HANDOVER_CLAUDE_CODE_2026-04-17.md` §5 参照

### Supabase テーブル設計（再掲）

`licenses` テーブル:
- `id` uuid PK
- `license_key` text UNIQUE NOT NULL
- `plan` text NOT NULL default 'pro' CHECK (plan IN ('free', 'pro'))
- `valid` boolean NOT NULL default true
- `expires_at` timestamptz NULL
- `email` text NULL
- `stripe_customer_id` text NULL
- `stripe_subscription_id` text NULL
- `created_at` / `updated_at` timestamptz

Edge Function `verify-license`:
- POST `{ license_key }` → `{ valid, plan, expires_at }`
- service_role キーで DB 接続
- 行なし → `{ valid: false, plan: "free", expires_at: null }`

---

## 6. 次のセッションに渡す推奨プロンプト

```text
この引き継ぎ書に沿って作業を再開してください:
/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server/docs/HANDOVER_CLAUDE_CODE_2026-04-17.md

まず現在の品質ゲートを再確認してください:
  npm run -s qa:gate

その後、Day 6（README 最終更新 + qa:live 確認 + RC 準備）から着手してください。
```

---

## 7. Day 6 実施ログ（Codex, 2026-04-17）

### 7.1 実行結果

- `npm run -s qa:gate` → PASS（全 63 チェック PASS）
- `npm run -s qa:live` → PASS
  - `w3schools_forms`: PASS
  - `ecommerce_demo`: PASS
  - artifacts: `/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server/lumoshot-live-output/2026-04-16T16-30-56-903Z`

### 7.2 Day 6 ドキュメント更新

- `README.md` を最終更新
  - セキュリティ方針
  - ライセンス挙動（free tier / TTL 7日 / 検証失敗時）
  - 設定ファイル優先順位と例
  - `filename_template` 変数（`{name}`/`{viewport}`/`{timestamp}`）
  - `metadata_format: yaml` の説明
  - 既知制約（before_after, callout, os_frame）
- `docs/QA.md` を最終更新
  - Release checklist に `qa:live` を追加
  - RC Preparation 手順（`qa:gate` / `qa:live` / `npm pack --dry-run`）
  - 既知ランタイム制約の明記

### 7.3 RC タグについて

- **未実施**。理由: リポジトリルートから `mcp-server/` は untracked のため、現時点で `git tag v0.1.0-rc.1` を切っても変更内容を含むコミットを指せない。
- RCタグは `mcp-server` をコミットした後に実施すること。

---

## 8. Day 7 実施ログ（Codex, 2026-04-17）

### 8.1 実機MCP確認（stdio 経由）

以下の順で、**MCPクライアントとして実際に stdio 接続**して実行確認済み:

1. `get_diagnostics`
2. `capture_page`
3. `execute_flow`
4. `annotate_screenshot`

実行スクリプト:
- `scripts/day7-mcp-check.mjs`
- npm shortcut: `npm run -s qa:day7`

### 8.2 実行結果

- 実行: `node scripts/day7-mcp-check.mjs`
- 結果: PASS
- summary: `/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server/lumoshot-day7-output/2026-04-16T16-43-09-994Z/day7-mcp-summary.json`

summary 抜粋:
- `tools_verified`: `get_diagnostics`, `capture_page`, `execute_flow`, `annotate_screenshot`
- `diagnostics_ready`: `true`
- `capture_elements`: `3`
- `execute_flow_steps`: `4`
- `execute_flow_total_screenshots`: `4`

### 8.3 出力アーティファクト

- 出力ディレクトリ:
  - `/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server/lumoshot-day7-output/2026-04-16T16-43-09-994Z`
- 主なファイル:
  - `capture_1280x720_20260416T164310.png`
  - `capture_1280x720_20260416T164310_annotated.png`
  - `step_01_...png` 〜 `step_04_...png`
  - `flow_meta.json`
  - `elements/step_XX_elements.json`
