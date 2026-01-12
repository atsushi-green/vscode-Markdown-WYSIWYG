# Markdown WYSIWYG Editor

VS Code上でMarkdownファイルをWYSIWYG（What You See Is What You Get）形式で編集できる拡張機能です。

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.108.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 特徴

* **直感的なWYSIWYG編集**: Markdownの構文を意識せずに、見たままの状態で編集可能
* **リッチテキストツールバー**: 太字、斜体、見出し、リスト、リンク、コードブロック、引用などをボタン一つで挿入
* **シンタックスハイライト**: コードブロック内のコードが自動的に色付け（Python、Bash、PowerShell、C、SQL対応）
* **リアルタイム同期**: WYSIWYGビューとMarkdownソースが常に同期
* **キーボードショートカット**: `Ctrl+B`（太字）、`Ctrl+I`（斜体）など、一般的なショートカットをサポート
* **VS Codeテーマに対応**: エディタのカラーテーマに自動的に適応

## 🚀 使い方

### インストール

1. または、VS Codeのコマンドパレット（`Ctrl+P`）を開き、以下を実行:
2. または、VS Codeのコマンドパレット（`Ctrl+P`）を開き、以下を実行:

   ```
   ext install markdown-wysiwyg-editor
   ```

### 既存のMarkdownファイルを開く

1. または、右クリックメニューから「エディターの再オープン...」→「Markdown WYSIWYG Editor」を選択
2. または、右クリックメニューから「エディターの再オープン...」→「Markdown WYSIWYG Editor」を選択
3. または、右クリックメニューから「エディターの再オープン...」→「Markdown WYSIWYG Editor」を選択

### 新しいMarkdownファイルを作成

1. 「Markdown: 新しいWYSIWYGドキュメントを作成」を実行
2. 「Markdown: 新しいWYSIWYGドキュメントを作成」を実行

## 

## 📋 対応しているMarkdown記法

* 見出し（H1-H6）
* 太字、斜体、太字斜体
* リンク
* 箇条書きリスト・番号付きリスト
* コードブロック・インラインコード（シンタックスハイライト対応）
* 引用
* 段落と改行

### 🎨 シンタックスハイライト対応言語

* Python
* Bash / Shell
* PowerShell
* C / C++
* SQL

## 🔧 設定

現在、特別な設定は不要です。インストール後すぐに使用できます。

## 🐛 既知の問題

* 複雑なMarkdown構文（テーブル、脚注など）は完全にサポートされていません
* 画像の挿入はまだサポートされていません（今後のアップデートで対応予定）
* シンタックスハイライトは限定された言語のみ対応（Python、Bash、PowerShell、C、SQL）

## 🛠️ 開発

### 前提条件

* Node.js (v18以上)
* VS Code (v1.108.1以上)

### ローカルでの実行

```bash
# 依存関係のインストール
npm install

# コンパイル
npm run compile

# 拡張機能のテスト実行
F5キーを押して新しいVS Codeウィンドウで拡張機能を起動
```

### ビルド

```bash
# プロダクションビルド
npm run package
```

## 📝 変更履歴

詳細は[CHANGELOG.md](CHANGELOG.md)を参照してください。

## 📮 サポート

問題や質問がある場合は、[GitHubのIssue](https://github.com/your-username/markdown-wysiwyg-editor/issues)で報告してください。
