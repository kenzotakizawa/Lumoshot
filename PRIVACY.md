# プライバシーポリシー / Privacy Policy

**制定日 (Effective Date):** 2026年3月4日  
**アプリ名 (App Name):** Lumoshot

---

## 🇯🇵 日本語版 (Japanese)

### 1. はじめに
Lumoshot（以下「本拡張機能」）は、ユーザーのプライバシーとデータセキュリティを第一に考えた**「完全オフライン・ローカルファースト」**の設計思想に基づいて開発されています。
本プライバシーポリシーでは、本拡張機能が取り扱うデータの種類とその安全性について説明します。

### 2. 収集する情報とその利用目的
本拡張機能は、ユーザーのデバイス外（外部サーバー等）へデータを送信・収集することは**一切ありません**。機能の提供に必要なすべての処理は、ユーザーのブラウザ内で完結します。

#### 2.1 スクリーンショット画像およびクリップボードデータ
* **収集内容:** ユーザーが指定した画面領域の画像データ、またはクリップボードからペーストされた画像データ。
* **利用目的:** ユーザーのブラウザ上に編集（注釈）用キャンバスを表示し、画像編集機能を提供するためのみに使用します。
* **保存場所:** 編集中の画像データは、ブラウザの一時的なセッションまたはローカルストレージ（`chrome.storage.local`）にのみ保存されます。ブラウザを閉じるか、ユーザーが明示的に削除することで破棄されます。

#### 2.2 ユーザー設定データ
* **収集内容:** ダークモード設定や、最後に使用した色や線の太さなどの軽微な環境設定。
* **利用目的:** 次回起動時にユーザーの好みの設定を復元するため。
* **保存場所:** ブラウザのローカルストレージにのみ保存されます。

### 3. データの共有・第三者への提供
本拡張機能は、外部APIとの通信を行わず、データベースや分析トラッカー（Google Analytics等）も一切組み込んでいません。
したがって、**ユーザーの個人情報や画像データが第三者と共有、販売、貸与されることは技術的に不可能**です。

### 4. データの保護とセキュリティ
* **完全ローカル処理:** スクリーンショットの撮影、画像の加工、画像の生成のすべてがユーザーの端末内（クライアントサイド）で実行されます。
* **機密情報の保護:** 画面上に表示されているパスワードやAPIキーなどの機密情報を安全に隠すための「モザイク/ぼかし」機能を標準で提供しています。

### 5. 免責事項
本拡張機能の利用により生じた損害（データの消失、業務の遅滞等）について、開発者は一切の責任を負わないものとします。

### 6. お問い合わせ
本プライバシーポリシーに関するご質問や、不具合の報告につきましては、以下のGitHub Issuesまでお願いいたします。

* **GitHub Issues:** [https://github.com/takukimatsuda/Lumoshot/issues](https://github.com/takukimatsuda/Lumoshot/issues)

---

## 🇺🇸 English Version

### 1. Introduction
Lumoshot (hereinafter referred to as the "Extension") is developed based on a **"Strictly Offline and Local-First"** design philosophy, prioritizing your privacy and data security. 
This Privacy Policy explains the types of data handled by the Extension and how we ensure its safety.

### 2. Information Handled and Purpose of Use
The Extension **NEVER** transmits or collects any of your data outside of your device (e.g., to external servers). All processing required to provide our features is completed entirely within your browser.

#### 2.1 Screenshot Images and Clipboard Data
* **Data Handled:** Image data of the screen area specified by the user, or image data pasted from the clipboard.
* **Purpose:** Solely used to display the editing (annotation) canvas on your browser and provide image editing capabilities.
* **Storage:** Image data being edited is securely stored only in your browser's temporary session or local storage (`chrome.storage.local`). It is discarded when you close the extension or explicitly clear it.

#### 2.2 User Preference Data
* **Data Handled:** Minor preference data such as Dark Mode settings, last used colors, and stroke widths.
* **Purpose:** To restore your preferred environment the next time you launch the Extension.
* **Storage:** Secured exclusively in your browser's local storage.

### 3. Data Sharing and Third-Party Disclosure
The Extension does not communicate with external APIs, nor does it embed any databases or analytics trackers (such as Google Analytics).
Therefore, **it is technically impossible for your personal information or image data to be shared, sold, or rented to any third parties.**

### 4. Data Protection and Security
* **100% Local Processing:** Capturing screenshots, applying annotations, and exporting images are all executed entirely on your local machine (client-side).
* **Confidentiality:** The Extension intentionally provides a built-in "Blur" tool to help you safely redact sensitive information (such as passwords or API keys) visible on your screen before sharing your images elsewhere.

### 5. Disclaimer
The developer shall not be held liable for any damages (including data loss or business interruption) arising from the use of the Extension.

### 6. Contact Information
If you have any questions regarding this Privacy Policy or wish to report a bug, please contact us via GitHub Issues:

* **GitHub Issues:** [https://github.com/takukimatsuda/Lumoshot/issues](https://github.com/takukimatsuda/Lumoshot/issues)
