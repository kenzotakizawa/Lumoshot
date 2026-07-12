# Lumoshot コードレビュー & 改善計画（2026-07）

> 作成: Opus 4.8（レビュー担当） / 実装: Sonnet 5 想定
> 対象: `main` @ 8b854f3（縁取り4辺化・ガイド刷新マージ後）
> 本文中の行番号は当該コミット時点の目安。実装時はシンボル名で再検索すること。

---

## 0. 現状サマリ

| 項目 | 状態 |
|---|---|
| 構成 | 1リポジトリ → 拡張機能(`dist/extension`) + Web版(`dist/web`) の2成果物 |
| エディタ | `src/editor/Editor.tsx` **2143行**（god component）、`: any` 38箇所 |
| Webシェル | `src/web/WebApp.tsx` 412行（landing / 履歴15件 / 自動保存） |
| 環境差分 | `src/platform/`（extension=chrome.storage / web=シェル供給）+ `src/lib/i18n.ts` |
| ビルド | `vite.config.extension.ts` / `vite.config.web.ts`、`npm run build` で両方 |
| テスト | **ゼロ**（typecheckのみ） |
| デプロイ | Cloudflare Pages（main自動デプロイ）+ Chrome Web Store |

製品戦略（確定済み・変更しない）:
- ポジション =「手順書のためのスクショ仕上げエディタ」（軽量・無料・日本語ファースト）
- サーバー処理なし・アカウントなし・画像は端末内完結
- OCRは**不採用**（Chrome内蔵Geminiで代替可のため。再提案しない）
- 課金は将来。`src/lib/entitlement.ts` の `isPro()` が唯一の窓口（現状常にtrue）

---

## 1. バグ（優先度順）

### BUG-1 [High] Undo/Redo後にUI状態が非同期（枠二重化バグの再来）
- **場所**: `restoreState()`（Editor.tsx:140付近）
- **現象**: `handleUndo`/`handleRedo` → `restoreState` はキャンバスをJSONから復元するが、React状態（`hasFrame` / `outlineEnabled` / `outlineColor` / `outlineWidth` / `isBAMode` / `hasAfterImage`）と各ref（`frameOffsets` / `beforeBAWidth` / `baHeaderHeight` / `afterImageDataUrl` / `blurCanvasRef` / `backgroundDataUrl` / `baseImageSize`）を**一切同期しない**。
  - 例: フレーム追加→Undo→ボタンはON表示のまま→再クリックで状態が破綻（過去に再オープンで直した同種バグのUndo/Redo版）。
  - 例: BA適用→Undo→BAツールバー表示や削除ハンドラのrefが不整合。
  - 例: クロップ/Before削除をまたぐUndoで `blurCanvasRef` が古い背景のまま→ぼかしツールがズレる。
- **修正方針**: `restoreSnapshotOnLoad()`（Editor.tsx:880-940付近）内の「オブジェクトからUI状態を導出する」ブロックを **`syncUIStateFromCanvas(canvas, dims)` として関数抽出**し、`restoreState` の復元完了後にも呼ぶ。blurCanvas再構築・`baseImageSize`更新も同関数に含める（restoreSnapshotOnLoadの既存ロジックをそのまま移す。重複実装を残さないこと）。
- **検証**: フレームON→Undo→ボタンOFF表示＆再ONで二重化しない / BA適用→Undo→Redo→BA削除が正常 / クロップ→Undo→ぼかし位置が正しい。

### BUG-2 [High] クロップ後に縁取りが再適用されない
- **場所**: `confirmCrop`（`originalSize`更新＋`setDimensions`はするが `applyOutline` 呼び出しなし。grep確認済み）
- **現象**: 縁取りON→クロップ確定→縁取り矩形が旧サイズのまま（新しい出力境界に合わない）。`handleResize`/BA適用・削除/`toggleFrame`/`loadBackgroundToCanvas` には再適用があるがクロップだけ漏れ。
- **修正方針**: confirmCropの `originalSize` 更新後に `if (outlineEnabled) applyOutline(true, outlineColor, outlineWidth);` を追加（handleResizeと同パターン）。
- **注意**: クロップは全オブジェクトを平行移動/切替する実装のため、旧縁取り4矩形が移動済みで残る。applyOutlineは既存`isOutline`を全削除してから描くので追加1行で足りるはずだが、クロップが縁取り矩形自体を巻き込んで座標移動しても最終的に消して引き直すので問題ない。実機確認必須。

### BUG-3 [Med-High] Undo履歴が無制限（メモリ膨張）
- **場所**: `saveState()`（Editor.tsx:124 `history.current.push(stateEntry)`。上限チェックなし。grep確認済み）
- **現象**: 各履歴エントリは `canvas.toObject()` のJSON文字列で、**背景画像のdataURL（base64）を丸ごと含む**。4Kスクショなら1エントリ数MB×編集回数分。長い編集セッションでタブがメモリ数百MB〜GBに達しうる。
- **修正方針（段階1・必須）**: `MAX_HISTORY = 30` を導入し、pushで超過したら `history.current.shift()`（undo可能回数30で十分）。
- **修正方針（段階2・任意）**: 背景dataURLを履歴から分離（`isBackground`のsrcを別refで1回だけ保持し、履歴には注釈のみ）。効果は大きいが復元パスの書き換えが広いため、段階1で様子見してよい。

### BUG-4 [Med] `restoreState` の `loadFromJSON` コールバック誤用
- **場所**: Editor.tsx:157付近 `canvas.loadFromJSON(canvasData, () => {...})`
- **問題**: fabric v7の第2引数は**reviver（オブジェクトごとに呼ばれる）**で完了コールバックではない。Promiseを返す設計。現状は「オブジェクト数ぶん `requestRenderAll` と `isHistoryProcessing=false` が呼ばれる」動きで、復元完了前にフラグが下りるレースの温床。
- **修正方針**: `canvas.loadFromJSON(canvasData).then(() => { canvas.requestRenderAll(); isHistoryProcessing.current = false; syncUIStateFromCanvas(...); })` に統一（`restoreSnapshotOnLoad`は既にthen方式）。BUG-1と同時に直すのが自然。

### BUG-5 [Low-Med] `beforeunload` が保存済みでも常に警告
- **場所**: WebApp.tsx:111-127
- **修正方針**: `saveStatus` をrefにミラー（`saveStatusRef`）し、`onBeforeUnload` 内で「保存済み(=Saved)なら `preventDefault` しない」。編集開始直後（未保存）と保存中のみ警告。

### BUG-6 [Low] `goHome` がブラウザ履歴と不整合
- **場所**: WebApp.tsx:217-220（`enterEditor`で`pushState`するがgoHomeは`setStarted(false)`のみ）
- **現象**: ホームボタンで戻った後、ブラウザ戻るを押すと「何も起きない」1回が挟まる。
- **修正方針**: `goHome` は `window.history.back()` を呼ぶだけにし、実際の画面遷移は既存の `popstate` ハンドラに一本化（二重実行に注意。popstate側で `refreshGallery` 済み）。

### BUG-7 [Low] 保存容量表示のフォーマット
- **場所**: WebApp.tsx `fmtMB`（"0.2MB / 147048.4MB" と表示される）
- **修正方針**: 1GB超はGB表示（`fmtBytes`に置換）。もしくはquota表示自体を省き「使用中: 0.2MB」だけにする。

### BUG-8 [Low] サムネイルがビューポート依存
- **場所**: `createSnapshot()`（Editor.tsx:84-106、`lowerCanvasEl`をそのまま縮小）
- **現象**: ズーム率・キャンバス表示サイズに依存し、低ズーム時はボケる。スクロールの影響は受けない（lowerCanvasは全体描画）が画質が不安定。
- **修正方針**: `canvas.toDataURL({ format:'jpeg', quality:0.6, multiplier: 320 / (canvas.getWidth()/canvas.getZoom()) ... })` 等、fabricのtoDataURLでゾーン指定レンダリングに置換。優先度低（実害小）。

### BUG-9 [Low] `deleteBeforeImage` の `canvas.clear()` がイベントストーム
- **場所**: Editor.tsx:1219
- **現象**: clearで全オブジェクトの `object:removed` が発火し、ステップ番号の再採番ロジック等が空回り（デバウンスで実害はほぼ無し）。
- **修正方針**: clear前後で `isHistoryProcessing.current = true/false` で囲むだけで抑止できる。

---

## 2. リファクタリング計画（段階実行・各段階でtypecheck+ビルド+スモーク）

> 原則: **挙動不変**。1フェーズ=1コミット。フェーズ間で `npm run typecheck && npm run build` と手動スモーク（サンプル→注釈→縁取り→フレーム→BA→保存→再オープン→Undo/Redo）を必ず通す。

### Phase 0: リポジトリ衛生（30分）
1. ルート直下の作業スクリプト削除: `apply_offset_tail.py` `apply_tooltips.py` `debug_control.py` `debug_speechbubble.py` `fallback_tail_control.py` `fix_editor_selection.py` `fix_missing_tail.py` `fix_selection_group.py` `fix_undo_onclick.py` `inject_history_logs.py` `refactor.py` `restore_tail_control.py` `swap_browser_to_chrome.py` `test-clip.js` `test-controls.ts`（`scripts/`配下の2つのguide用pyは残す）
2. `src/background/background.backup.ts` 削除
3. クラウド同期の重複ファイル削除: `"* 2.gif"` `"src/web/* 2.tsx"` `"* 2.ts"` 等（`git status`の`??`のうち` 2.`を含むもの全部）。`.gitignore` に `* 2.*` を追加して再発防止
4. 空ディレクトリ `Lumoshot/` 削除、`CHANGELOG.md` を1.6系まで追記
5. `README.md` にWeb版の記述を追加（現状拡張機能のみの説明想定。URL・2成果物ビルドの説明）

### Phase 1: Editor.tsx 分割（最重要・2143行→600行台目標）
新設 `src/editor/hooks/` へ、**状態とロジックをセットで**移す。propsバケツリレーを避けるため、fabricCanvas refと共有refは引数で渡す薄いカスタムフック構成にする。

1. `src/editor/constants.ts`: `CUSTOM_PROPS`配列（toObjectの引数。現在createSnapshot内にベタ書き）、コントロール共通設定（`cornerColor:'#4f46e5'`等が3箇所に重複）を定数化
2. `src/editor/types.ts`: `LumoObject = FabricObject & { get(k: CustomPropKey): ... }` 相当の型付け。**38箇所の `: any` を段階的に置換**（このフェーズでは新設ファイル内のみ厳密化、既存はエイリアス置換に留めて挙動不変を守る）
3. `useEditorHistory.ts`: `history`/`redoStack`/`isHistoryProcessing`/`saveState`/`createSnapshot`/`restoreState`/`handleUndo`/`handleRedo` + **BUG-1/3/4の修正をここで同時に実施**（`syncUIStateFromCanvas`はこのフックがコールバック経由で呼ぶ）
4. `useOutline.ts`: `applyOutline`/`toggleOutline`/`handleOutlineColor`/`handleOutlineWidth`/`commitOutline` + 状態3つ
5. `useFrame.ts`: `toggleFrame`/`frameOffsets`/`hasFrame`（スクロール補正ロジック含む）
6. `useBeforeAfter.ts`: BA一式（`handleAfterImageProvided`/`deleteAfterImage`/`deleteBeforeImage` + refs）
7. `useCropTool.ts`: crop一式 + **BUG-2修正**
8. `useExport.ts`: `handleDownload`/`handleCopy` の共通部（zoom=1で一時レンダリング→dataURL→復元）を `renderFullResolution(): string` に抽出。コピーは `fetch(dataURL)` でなく `lowerCanvasEl.toBlob` 直行に簡素化可
9. Editor.tsx 本体は「キャンバス初期化・イベント配線・レイアウト」だけ残す

**分割時の罠**:
- `saveState` は多数のuseCallbackの依存に入っている。フック化で参照が安定するとeslint警告も減る
- `applyOutline` は `useFrame`/`useBeforeAfter`/`useCropTool`/`loadBackgroundToCanvas` から呼ばれる（依存方向: 各フック→useOutline。循環しないよう「再適用コールバック」をEditor本体で合成して渡す）
- `zoomLevel` を閉じ込めたクロージャが多い。stale closure に注意（既存コードも同リスクを持つ。挙動を変えないこと）

### Phase 2: パフォーマンス（PageSpeed診断の残項目）
1. **Editorの遅延読み込み**: WebApp.tsxで `const Editor = React.lazy(() => import('../editor/Editor'))` + Suspense。landing初期バンドルからfabric一式（約200KB gz）を外す（PageSpeed「未使用JS 156KiB」への直接回答）
2. fabricの**静的/動的import混在を解消**（ビルド警告が毎回出ている）: Editor.tsx / useCanvasTools.ts 内の `await import('fabric')` を静的importへ統一（遅延はPhase 2-1のEditor単位遅延で担保する設計に変える）
3. `vite.config.web.ts` に `build.rollupOptions.output.manualChunks` で `fabric` / `react-dom` を分離（キャッシュ効率）
4. Cloudflare Pages用 `public-web/_headers` 追加: `/assets/*` に `Cache-Control: public, max-age=31536000, immutable`、全体に `X-Content-Type-Options: nosniff` / `Referrer-Policy: strict-origin-when-cross-origin` / `X-Frame-Options: DENY`

### Phase 3: テスト基盤（現状ゼロ→最小限）
1. Vitest導入（`npm i -D vitest fake-indexeddb`）
   - `projectStore.test.ts`: LRU（15件超過で最古削除）、サイズ上限、rename/delete/clear
   - `i18n.test.ts`: ja/enフォールバック、キー欠落時
2. Playwright スモーク1本（`npm i -D @playwright/test`）: サンプル→矢印1本→縁取りON→保存→リロード→再オープン→復元確認→Undo。CIは無し（ローカル実行でよい）
3. `package.json` に `"test": "vitest run"` 追加。**リファクタPhase 1の前にこれを先にやる選択も可**（安全網として。ただし工数優先ならPhase 1後でも許容）

---

## 3. 追加機能の検討（優先度順・戦略整合）

> 戦略: 「手順書のためのスクショ仕上げエディタ」。差別化3本柱 = ①スタイル一貫性 ②多枚数の速さ ③隠す作業の速さ（過去セッションで合意済み）

### F-1 [P1] スタイルプリセット（差別化の本命・工数中）
- **内容**: 矢印色/太さ・フォント設定・縁取り色/太さ・クリックアイコンscheme を名前付きプリセットとして保存/適用。「このマニュアルは赤矢印+角丸番号」を1回決めて使い回す
- **設計**:
  - `src/editor/presets.ts`: `interface StylePreset { id, name, strokeColor, strokeWidth, fontColor, fontSize, outlineColor, outlineWidth, clickIconScheme }`
  - 保存先: localStorage（`lumoshot.presets`、上限10個）。Web/拡張共通コードでOK
  - UI: SubHeader右端にプリセットドロップダウン＋「現在の設定を保存」。適用時は各setterを一括呼び出し（既存のsetStrokeColor等をまとめて呼ぶだけ。キャンバス既存オブジェクトへの一括適用は**やらない**＝新規描画にのみ効く、と明記してスコープを絞る）
- **検証**: プリセット保存→リロード→適用→新規矢印が指定色になる

### F-2 [P1] `.lumoshot` プロジェクトの書き出し/読み込み（工数小・dead code解消）
- **内容**: 編集状態をファイルとして保存/復元（端末移行・共有PC対策・バックアップ）
- **設計**:
  - 形式: `{ version: 1, name, savedAt, state, thumbnail }` をJSONで `xxx.lumoshot` としてBlobダウンロード
  - 読み込み: ホームのドロップ/アップロードで拡張子 `.lumoshot` を判別 → **既存の `createProjectFromFile()`（projectStore.ts:59、現在デッドコード）に配線** → 履歴に追加して再オープン
  - エディタ側: ヘッダーのメニュー等に「プロジェクトを書き出す」1ボタン
- **注意**: stateには背景dataURLが入るのでファイルは数MBになる。それで正しい（自己完結が目的）

### F-3 [P2] モザイク（ピクセル化）ツール（工数中）
- **内容**: ぼかしと並ぶ隠し表現の定番。手順書用途で要望が多い
- **設計**: 既存Blur実装（`src/editor/utils/drawTools/blur.ts`、offscreen blurCanvasをパターンにする方式）を踏襲し、blurの代わりに縮小→拡大（`imageSmoothingEnabled=false`）でピクセル化したoffscreenを用意。ツールとしては「ぼかし」のサブモード（サブツールバーで ぼかし/モザイク 切替）にするとSidebarが増えない
- **検証**: 保存/コピーへの反映、リサイズ/フレーム移動追従（blurと同じ`fire('moving')`再整列パスに乗せる）

### F-4 [P2] 楕円/円の基本図形（工数小）
- **内容**: 現在プレーンな丸ツールが無い（スポットライト楕円・ズーム楕円のみ）。丸で囲むのは注釈の基本動作
- **設計**: `drawTools/rect.ts` を複製して `ellipse.ts`（fabric.Ellipse）。Sidebar追加、ショートカット `O`。CUSTOM_PROPSへの追加不要（標準プロパティのみ）

### F-5 [P2] エクスポート形式の選択（工数小）
- **内容**: PNG固定 → PNG / JPG / WebP + 倍率(1x/2x)。ファイルサイズを気にするチャット貼付ユーザー向け
- **設計**: `useExport` の `renderFullResolution` にformat/quality/multiplier引数。保存ボタン長押し or 保存ボタン横の小さな▾でメニュー。既定はPNG 1x（現行維持）

### F-6 [P3] ショートカット一覧オーバーレイ（工数小）
- **内容**: `?` キーでモーダル表示。Guide.tsxのショートカット表とデータを共通化（`src/editor/shortcuts.ts` に配列で持ち、Guideとモーダル両方がレンダリング）

### F-7 [P3] OGP画像とguideのSEO仕上げ（工数小）
- 1200x630のOG画像を作成し `public-web/og.png`、index.htmlの `og:image` を差し替え（現状icon128で見栄えが悪い）
- guide.htmlにも description/canonical/OGを追加、sitemap.xmlは既に `/guide` 収載済み

### F-8 [P3] 複数スクショトレイ（手順書ワークフロー本命・工数大→分割）
- 一気にやらない。5a: エディタ内からプロジェクト切替パネル（ホームに戻らず横断） → 5b: ステップ番号のプロジェクト間継続オプション → 5c: 選択プロジェクトの一括PNG出力（JSZipは増量+30KB程度で許容）
- 5aだけでも「多枚数の速さ」が体感で変わる。P1昇格の価値があるが、Phase 1リファクタ完了後に着手（Editor分割前に足すと負債が増える）

### 見送り（再提案しないこと）
- OCR/文字起こし（Chrome内蔵Geminiで代替、決定済み）
- クラウド同期・アカウント（サーバーレス方針に反する）
- 操作自動記録・手順書自動生成（Tango/Scribeの土俵。軽さが死ぬ）
- 広告（UX毀損 > 収益。ドメイン実費は自己負担で確定済み）

---

## 4. 実装順の推奨ロードマップ

```
Sprint 1（安全網と即効バグ）
  Phase 0 衛生 → BUG-2(クロップ縁取り) → BUG-3(履歴上限) → BUG-5/6/7 → Phase 3-1(Vitest最小)
Sprint 2（構造改善）
  Phase 1 Editor分割（BUG-1/4を内包して修正） → Phase 3-2(Playwrightスモーク)
Sprint 3（体感改善+小機能）
  Phase 2 遅延読み込み/manualChunks/_headers → F-2(.lumoshot) → F-4(楕円) → F-5(形式)
Sprint 4（差別化）
  F-1(プリセット) → F-3(モザイク) → F-6/F-7
以降: F-8(トレイ)を5a→5b→5cで
```

## 5. 実装者（Sonnet 5）への注意事項

1. **各変更後に必ず**: `npm run typecheck && npm run build`。UI変更はプレビューで実機確認（`npm run dev` はweb版）。esbuildバイナリがクラウド同期で壊れることがある（`esbuild 2`等にリネームされる）。ビルド不能時は `node_modules/@esbuild/darwin-arm64/bin/` を確認
2. **拡張機能を壊さない**: `src/editor` は両成果物で共有。chrome API直呼びは `@platform` / `src/lib/i18n.ts` 経由のみ。`npm run build:ext` も毎回確認
3. **Undo/Redoの回帰が最頻出**: 縁取り・フレーム・BAはすべて「システムオブジェクト＋React状態」の二重管理。オブジェクトを足す/消す変更をしたら、Undo→Redo→再操作の3手を必ず手で確認
4. **履歴の意味単位**: スライダー類は「ドラッグ中ライブ更新・確定時のみsaveState」の既存パターン（縁取り実装参照）を踏襲
5. **コミット**: 1フェーズ=1コミット、日本語メッセージ、`main`直コミットはせずセッション運用に従う（これまでは feat/web-app → main マージ運用）
6. デプロイはmainへのpushで自動（Cloudflare Pages）。拡張機能はストア再申請が必要なので、拡張側の見た目変更はまとめてリリース
