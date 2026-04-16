# Lumoshot MCP Server 引き継ぎ書（Claude Code向け）

- 作成日: 2026-04-15 (JST)
- 対象ディレクトリ: `/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server`
- 目的: 途中実装をClaude Codeに安全に引き継ぎ、次の開発判断を早くする

## 1. 現在の到達点（要約）

- MCPサーバー本体は `capture_page / execute_flow / annotate_screenshot / get_diagnostics` の主要経路が動作する状態。
- iframe対応（same-origin 解析 / cross-origin スキップ通知）とマスキング周り（redaction flag, mosaic注釈）が実装済み。
- QAは「固定テスト」と「外部サイトカナリア」の2層に整理済み。
- ユーザー懸念だった「採番バッジ確認中心でHTMLが弱い」点に対し、実運用寄りフォームの統合テストと外部サイト実検証を追加済み。

## 2. 今回の主要変更点

## 2.1 既存機能の実装・整備（このブランチ状態で反映済み）

- `get_diagnostics` ツール追加とライセンス情報返却。
- freeプラン上限到達時の `UsageLimitError` と構造化エラー返却。
- `capture_page`:
  - ライセンス検証/上限判定。
  - trusted domain時のマスキング緩和判定。
  - redacted要素へのモザイク注釈適用。
  - iframe診断情報を `diagnostics/page_meta` に反映。
- `execute_flow`:
  - ライセンス判定連携。
  - trusted domain反映。
  - redaction注釈反映。
  - iframe cross-origin 検知の集約反映。
- DOM解析:
  - same-origin iframe 解析対応。
  - cross-origin iframe スキップ + 統計返却。
  - `data-sensitive / data-secret / data-redact` 対応。
- config:
  - `~/.lumoshot/lumoshot.config.json` を読めるように拡張（旧パス互換あり）。

## 2.2 ユーザー懸念に対する追加改善（今回の重点）

- `scripts/qa-live.mjs` を強化:
  - 単純件数判定だけでなく、ページ固有ラベル判定を追加。
  - スクショ実体の存在・サイズチェックを追加。
  - `live-summary.json` に `labels_sample` を追加。
  - wait戦略をターゲットごとに selector 指定化。
- npm scripts追加:
  - `qa:live`
  - `qa:live:strict`
  - `qa:live:amazon`
  - `qa:gate:live`
- 統合テスト追加:
  - `capture_page extracts realistic form controls and excludes aria-hidden controls`
  - 実フォーム構造（input/select/checkbox/radio/button/clickable）と redaction/aria-hidden を検証
- ドキュメント更新:
  - `docs/QA.md`: live-site canary の運用ルール・合格基準を追記
  - `README.md`: Live Canary セクション追加

## 3. 変更ファイル（重要）

- `src/index.ts`
- `src/tools/capture-page.ts`
- `src/tools/execute-flow.ts`
- `src/tools/annotate-screenshot.ts`
- `src/engine/dom-analyzer.ts`
- `src/engine/annotator.ts`
- `src/license/license.ts`
- `src/config.ts`
- `src/types.ts`
- `test/capture-page.integration.test.ts`
- `scripts/qa-smoke.mjs`
- `scripts/qa-live.mjs`
- `docs/QA.md`
- `README.md`
- `package.json`

## 4. 実行確認結果（2026-04-15）

- `npm run -s qa:gate` → PASS
  - masking test: 6 pass
  - integration test: 5 pass
  - smoke: PASS
- `npm run -s qa:live` → PASS
  - `w3schools_forms`: PASS
  - `ecommerce_demo`: PASS
- `npm run -s qa:live:amazon` → PASS
  - `amazon_home`: PASS（optional target）

補足:
- Codexサンドボックス内では Playwright/tsx が権限エラーになることがあるため、同環境で再現する際は権限付き実行が必要。
- ユーザーの通常ローカル端末（非サンドボックス）では通常実行で問題ない想定。

## 5. 生成済み実ファイル（確認用）

- 最新 live 実行出力:
  - `/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server/lumoshot-live-output/2026-04-15T13-32-14-506Z`
- 含まれるもの:
  - `capture_*.png`（注釈済み）
  - `raw_*.png`（生画像）
  - `live-summary.json`

## 6. 未着手/残課題（優先順）

1. `qa-live` の再試行戦略
- ネットワーク揺らぎ/サイト変更で偽陰性が出るため、target単位で retry + backoff を追加したい。

2. live判定の可観測性向上
- `live-summary.json` に失敗時のURL/最終title/主要selector確認結果を入れると切り分けが速い。

3. DOM解析の false-positive（clickable過検知）抑制
- 現状 `cursor:pointer` だけで拾うため、W3Schoolsで `clickable` が多くなる傾向。
- 実クリック可能性の判定条件を厳密化する余地あり。

4. 画像の品質自動評価
- 現状は存在/サイズチェック中心。将来的には baseline比較や視覚差分導入で品質担保を上げる余地。

## 7. Claude Code に渡すときの推奨プロンプト

以下をそのまま渡せばよい:

```text
この引き継ぎ書に沿って作業を再開してください:
/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server/docs/HANDOVER_CLAUDE_CODE_2026-04-15.md

まずは現在の品質ゲートを再実行して現状を再確認してください:
1) npm run -s qa:gate
2) npm run -s qa:live

その後、残課題の最優先である「qa-live の retry + backoff」を実装し、
docs/QA.md に運用ルールを追記してください。
```

## 8. 注意事項

- リポジトリルートは dirty 状態（`mcp-server` 以外にも変更あり）。`mcp-server` 以外は原則触らないこと。
- `mcp-server` は現時点でルートから見ると untracked 扱い。コミット戦略（分割コミット/まとめコミット）は作業再開時に明示決定が必要。
