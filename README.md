# Lumoshot

<div align="center">
  <h3>A powerful, fast, and beautiful screenshot annotation tool for professionals.</h3>
  <p>エンジニアやデザイナーのための、爆速で伝わるスクリーンショット作成ツール。</p>
</div>

---

## 🇺🇸 English Guide

### Overview
Lumoshot is a Chrome Extension designed to make system reviews, bug reports, and UX feedback 10x faster and clearer. Capture your screen and instantly annotate it with unique, professional tools.

### Getting Started
1. **Capture**: Click the extension icon and choose to capture the **Entire Screen**, **Visible Area**, or a **Selected Area**.
2. **Annotate**: Use the sidebar tools to draw, hide, or highlight specific areas.
3. **Export**: Press `Cmd + C` (Ctrl + C) to copy the image to your clipboard, or `Cmd + S` (Ctrl + S) to download it, and paste it directly into Slack, GitHub, or Notion.

### ✨ Unique Features

#### 1. Spotlight (`L` key)
Dims the entire background and brightly highlights only the specific rectangle or circle you draw. Perfect for guiding the viewer's eyes directly to the important part of the UI.

#### 2. Click Icon (`C` key)
Places a mouse cursor icon with dynamic action lines (speed lines). 
Instantly conveys "Click Here" without needing to write text. You can toggle between "Left Click" and "Right Click" from the top property bar to change the direction of the lines.

#### 3. Speech Bubble (`B` key)
A text bubble with a customizable tail. You can drag the blue control point at the tip of the tail to point exactly at what you are explaining, making your feedback perfectly clear.

### 💡 Pro Tips
* **Keyboard Shortcuts**: You don't need to click the sidebar to switch tools. Use `A` (Arrow), `P` (Pen), `T` (Text), `L` (Spotlight), or `V` (Select).
* **Z-Index Control**: If a shape hides your text, right-click it and select "Send to Back", or use the `[` and `]` keys to adjust the layer order.
* **Re-editable Shapes**: All annotations remain editable! Switch to the **Select (`V`)** tool to move, resize, or change colors of any shape you've already drawn.

---

## 🇯🇵 日本語ガイド

### 概要
Lumoshotは、「エンジニアやデザイナーが、システムレビューやバグ報告を10倍速く・分かりやすく伝えるため」に作られたChrome拡張キャプチャツールです。

### 基本的な使い方
1. **撮る**: 拡張機能アイコンをクリックし、「画面全体」「表示範囲」「エリア選択」からキャプチャ範囲を選びます。
2. **描く**: 左側のツールバーからツールを選んで注釈やハイライトを入れます。
3. **出す**: `Cmd + C` (Ctrl + C) でクリップボードにコピー、または `Cmd + S` (Ctrl + S) でダウンロードして、そのままSlackやGitHubに貼り付けます。

### ✨ 必修機能ベスト3（Lumoshotならではの機能）

#### 1. Spotlight（スポットライト） [ショートカット: `L`]
画面全体を暗く落とし、注目してほしい部分だけを明るく見せる機能。
四角形か円形を選んでドラッグするだけで、不要な情報を隠し、視線を誘導できます。

#### 2. Click Icon（クリック指示） [ショートカット: `C`]
マウスカーソルのアイコンと、集中線（速線）スタンプを付与します。
「ここを左クリックして」「ここを右クリックして」という操作指示が、文字を書かなくてもキャプチャ1枚で明確に伝わります。画面上のプロパティバーから LEFT / RIGHT を切り替え可能です。

#### 3. Speech Bubble（吹き出し） [ショートカット: `B`]
ただの文字ではなく、しっぽ（Tail）のついた吹き出しを作れます。
しっぽの先端にある青い丸（コントロールポイント）をドラッグすれば、指し示す先を自由に変更可能です。

### 💡 プロ向け Tips
* **ショートカット完全対応**: マウスでツールを選ぶ必要はありません。矢印は `A`、ペンは `P`、テキストは `T`。消したいときは `Delete` か `Backspace`。手戻りは `Cmd+Z` です。
* **Z-Indexの調整**: 「線を描いたけど文字の下に隠れてしまった…」そんな時は、図形を右クリックして「最背面へ移動 (Send to Back)」を選ぶか、`[` `]` キーで重なり順を調整できます。
* **再編集のためのドラッグ**: 一度描いた図形も、「T（テキスト）」や「A（矢印）」ツールではなく「V（選択）」ツールに持ち替えれば、後から何度でも移動・サイズ変更・色変更が可能です。

---

### Development
Built with React, TypeScript, Fabric.js, and Vite.
