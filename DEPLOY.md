# Lumoshot — デプロイ手順

このリポジトリは 1 つのソースから **2 つの成果物**をビルドします。

| 成果物 | ビルド | 出力先 | 配布先 |
|---|---|---|---|
| Web アプリ | `npm run build:web` | `dist/web` | Cloudflare Pages |
| Chrome 拡張 | `npm run build:ext` | `dist/extension` | Chrome Web Store |

`npm run build` で型チェック → 両方をビルドします。

---

## Web アプリ → Cloudflare Pages（無料）

### 方法 A：Git 連携（推奨・自動デプロイ）

1. GitHub にこのリポジトリを push
2. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. リポジトリを選択し、ビルド設定を入力：
   - **Framework preset**: `None`
   - **Build command**: `npm run build:web`
   - **Build output directory**: `dist/web`
   - **Node version**: 20 以上（環境変数 `NODE_VERSION=20` でも可）
4. **Save and Deploy** → 数分で `https://<project>.pages.dev` が公開される
5. 以後は push するたびに自動デプロイ

### 方法 B：手元から直接アップロード（Wrangler）

```sh
npm run build:web
npx wrangler pages deploy dist/web --project-name=lumoshot
```

（初回は `npx wrangler login` でブラウザ認証）

---

## サブドメインの紐付け（app.example.com）

DNS が Cloudflare 管理なら、ほぼクリックだけ：

1. Pages プロジェクト → **Custom domains** → **Set up a custom domain**
2. `app.<あなたのドメイン>` を入力
3. Cloudflare が CNAME を自動追加 + SSL を自動発行 → 数分で有効化

> 1 階層のサブドメイン（`app.`）は Universal SSL の対象なので追加証明書は不要。

---

## Chrome 拡張 → Web Store

```sh
npm run build:ext          # → dist/extension
cd dist/extension && zip -r ../../lumoshot-extension.zip .
```

`lumoshot-extension.zip` を Chrome Web Store のデベロッパーダッシュボードからアップロード。

---

## メモ
- Web アプリはサーバー処理ゼロ（静的配信のみ）。画像はすべてブラウザ内で処理。
- 過去の編集は端末の IndexedDB に最大 15 件保存（`src/web/projectStore.ts`）。
- PWA 対応済み（初回読み込み後はオフラインでも編集可能 / インストール可能）。
