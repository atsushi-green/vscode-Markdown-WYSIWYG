# AGENT.md - Markdown WYSIWYG Editor

## プロジェクト概要

このプロジェクトは、VS Code上でMarkdownファイルをWYSIWYG（What You See Is What You Get）形式で編集できる拡張機能です。ユーザーはMarkdownの構文を意識せずに、見たままの状態で文書を編集できます。

## 主要機能

- **WYSIWYG編集**: Markdownの構文を意識せずに直感的に編集
- **シンタックスハイライト**: コードブロック内のコードを自動的に色付け（Python、Bash、PowerShell、C、SQL対応）
- **リアルタイム同期**: WYSIWYGビューとMarkdownソースの双方向同期
- **キーボードショートカット**: 一般的なショートカット（Ctrl+B、Ctrl+Iなど）をサポート
- **テーマ対応**: VS Codeのカラーテーマに自動適応

## 技術スタック

- **言語**: TypeScript
- **プラットフォーム**: VS Code Extension API
- **ビルドツール**: esbuild
- **依存関係**:
  - highlight.js: コードブロックのシンタックスハイライト
- **開発依存関係**:
  - TypeScript 5.9.3
  - ESLint 9.39.2
  - @vscode/test-electron: 拡張機能のテスト

## プロジェクト構造

```
vscode-Markdown-WYSIWYG-/
├── src/
│   ├── extension.ts           # 拡張機能のエントリーポイント
│   ├── markdownEditor.ts      # カスタムエディタの実装
│   └── test/
│       └── extension.test.ts  # ユニットテスト
├── media/                     # Webviewのリソース（CSS、JSなど）
├── dist/                      # ビルド出力ディレクトリ
├── package.json               # 拡張機能のマニフェスト
├── tsconfig.json              # TypeScript設定
├── esbuild.js                 # ビルドスクリプト
├── eslint.config.mjs          # ESLint設定
└── README.md                  # ユーザー向けドキュメント
```

## アーキテクチャ

### 1. エントリーポイント（extension.ts）
- 拡張機能の初期化と登録
- コマンドの登録
- カスタムエディタプロバイダーの登録

### 2. カスタムエディタ（markdownEditor.ts）
- VS CodeのCustom Editor APIを使用したWYSIWYGエディタの実装
- Webviewを使用したリッチテキスト編集インターフェース
- Markdownとの双方向変換処理
- ドキュメントの保存・編集イベントの処理

### 3. Webview
- ContentEditable属性を使用したリッチテキスト編集
- ツールバーによる書式設定機能
- highlight.jsを使用したコードブロックのシンタックスハイライト
- VS Codeのメッセージングシステムを使用した拡張機能との通信

## 開発ワークフロー

### セットアップ

```bash
# 依存関係のインストール
npm install

# 型チェック
npm run check-types

# リント
npm run lint

# ビルド
npm run compile

# 開発モード（watch）
npm run watch
```

### デバッグ

1. VS Codeでプロジェクトを開く
2. F5キーを押して拡張機能開発ホストを起動
3. 新しいウィンドウでMarkdownファイルを開いて動作確認

### テスト

```bash
# テストの実行
npm run test

# テストのコンパイル
npm run compile-tests
```

### ビルド

```bash
# プロダクションビルド
npm run package
```

## カスタムエディタAPI

このプロジェクトは、VS CodeのCustom Editor APIを活用しています。

- **viewType**: `markdownWysiwyg.editor`
- **優先度**: `default`（ユーザーはテキストエディタとWYSIWYGエディタを切り替え可能）
- **対象ファイル**: `*.md`（すべてのMarkdownファイル）

## 今後の拡張可能性

### 短期的な改善
- テーブルのサポート
- 画像の挿入機能
- より多くの言語のシンタックスハイライト対応
- タスクリスト（チェックボックス）のサポート

### 長期的な改善
- 脚注のサポート
- リアルタイムコラボレーション
- マークダウンテンプレート機能
- カスタムCSSテーマ

## 貢献ガイドライン

### コーディング規約
- TypeScriptの型安全性を重視
- ESLintルールに準拠
- コミット前に`npm run lint`と`npm run check-types`を実行

### プルリクエスト
1. フォークしてブランチを作成
2. 変更を実装
3. テストを追加/更新
4. リントと型チェックをパス
5. PRを作成して説明を記載

## トラブルシューティング

### ビルドエラー
- `npm install`で依存関係を再インストール
- `node_modules`と`dist`を削除して再ビルド

### 拡張機能が動作しない
- VS Codeのバージョンを確認（v1.108.0以上が必要）
- 開発者ツール（Help > Toggle Developer Tools）でエラーを確認
- 拡張機能ホストを再起動

