# Lumoshot MCP Server 出荷計画（1週間）

- 作成日: 2026-04-16 (JST)
- 対象: `/Users/takukimatsuda/Desktop/Dev/Lumoshot/mcp-server`
- 目的: 出荷レベル到達に必要なタスクを1週間で完了するための実行計画

## 期間

- 2026-04-16 〜 2026-04-22

## Day 1: 4/16（出荷スコープ固定 + 土台整備）

1. P0項目の最終確定（実装対象/見送り対象を明確化）
2. `before_after` の方針決定
   - A: 仕様どおり実装
   - B: いったん未対応としてスキーマ/仕様から除外
3. 配布物制御の整備
   - `.npmignore` または `package.json.files` を設定
   - `npm pack` で不要ファイルが入らないことを確認

完了条件:
- 配布物が意図した最小構成になっている
- 仕様と実装の対応方針が確定している

## Day 2: 4/17（ライセンス本番化）

1. `verify-license` URL を本番値で必須化
2. ライセンス検証失敗時の挙動を固定
   - 例: キャッシュ有効期間のみ継続許可
   - 期限切れ後は明確エラー
3. エラーメッセージをユーザー/AI向けに明確化

完了条件:
- オンライン/オフライン/キャッシュ期限切れの挙動が仕様化され、テストで確認済み

## Day 3: 4/18（`before_after` 仕様一致）

1. `changed_regions` の扱いを実装に反映
2. `layout` の仕様一致
   - `slider` を実装するか、非対応として仕様・スキーマから外す
3. `annotate_screenshot` 入力スキーマと実動作を一致させる

完了条件:
- ドキュメント仕様、入力スキーマ、実行結果が一致

## Day 4: 4/19（設定反映の実効化）

1. `output.filename_template` をファイル名生成に適用
2. `output.metadata_format`（json/yaml）を出力処理に適用
3. 設定反映のテスト追加

完了条件:
- 設定変更が実出力に反映されることを自動テストで保証

## Day 5: 4/20（DOM検知精度改善）

1. `clickable` 過検知の抑制
   - `cursor:pointer` 単独判定を見直し
   - role/属性/実イベント有無などを組み合わせて厳密化
2. 実サイトで効果測定
   - W3Schools / Demoblaze でノイズ率比較

完了条件:
- `elements` ノイズが減少
- `execute_flow` の操作成功率を悪化させない

## Day 6: 4/21（回帰確認 + ドキュメント + RC準備）

1. 回帰確認
   - `npm run -s qa:gate`
   - `npm run -s qa:live`
2. README/QAドキュメント最終更新
   - セキュリティ方針
   - 既知の制約
   - 運用手順
3. RC（Release Candidate）作成準備

完了条件:
- テスト/QAが連続成功
- ドキュメントだけで運用判断できる状態

## Day 7: 4/22（最終判定 + 出荷）

1. MCPクライアント実機確認
   - `get_diagnostics`
   - `capture_page`
   - `execute_flow`
   - `annotate_screenshot`
2. 最終 Go/No-Go 判定
3. `npm publish`

完了条件:
- Go条件を全て満たして公開完了

## Go / No-Go 条件（最低ライン）

1. `qa:gate` が全PASS
2. `qa:live` requiredターゲットがPASS
3. ライセンス失敗時ポリシーが固定済み
4. 仕様・スキーマ・実装の不一致がない
5. `npm pack` の成果物が意図どおり

## 補足

- `qa:live` はネットワーク依存のため CI 必須にはせず、リリース前カナリアとして運用
- 未対応機能を残す場合は、必ずスキーマ/README/仕様書に「未対応」を明記する
