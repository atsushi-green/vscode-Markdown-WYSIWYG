# AGENT.md - Markdown WYSIWYG Editor

## プロジェクト概要

このプロジェクトは、VS Code上でMarkdownファイルをWYSIWYG（What You See Is What You Get）形式で編集できる拡張機能です。ユーザーはMarkdownの構文を意識せずに、見たままの状態で文書を編集できます。

## 主要機能

- **WYSIWYG編集**: Markdownの構文を意識せずに直感的に編集
- **Mermaid図のサポート**: Mermaid記法によるダイアグラムのリアルタイムプレビューと編集
  - 分割表示モード（ソースコードとプレビューの同時表示）
  - 高解像度PNG画像としてエクスポート（4x スケール + デバイスピクセル比考慮）
  - クリップボードへの画像コピー
- **テーブル編集機能**: Excel風のインタラクティブなテーブル編集
  - 方向キーでのセル移動（↑↓←→、Tab、Enter）
  - セルの直接編集
  - 行・列の追加/削除
  - Excelからのデータ貼り付け（タブ区切りデータ対応）
  - テーブル全体のコピー（Excel等へ貼り付け可能）
  - Markdown形式との自動相互変換
- **タスクリスト**: GFMのタスクリスト記法（`- [ ]` / `- [x]`）をチェックボックスとして表示し、クリックで完了/未完了を切り替え（Markdownソースへ即時反映）。入力中も `- [ ]` / `- []` / `-[]`（スペース有無を問わず）を打った時点でチェックボックスへライブ変換（`commands.js` の `convertTaskLists`）
- **シンタックスハイライト**: コードブロック内のコードを自動的に色付け（Python、Bash、PowerShell、C、SQL対応）
- **リアルタイム同期**: WYSIWYGビューとMarkdownソースの双方向同期
- **書式ツールバー**: 太字・斜体・下線・見出し・リスト・引用・リンク・コードブロックのボタン列（選択範囲を保持したまま適用）
- **キーボードショートカット**: 一般的なショートカット（Ctrl+B、Ctrl+Iなど）をサポート
- **テーマ対応**: VS Codeのカラーテーマに自動適応

## 技術スタック

- **言語**: TypeScript
- **プラットフォーム**: VS Code Extension API
- **ビルドツール**: esbuild
- **依存関係**:
  - highlight.js: コードブロックのシンタックスハイライト
  - mermaid.js: ダイアグラムレンダリング
  - html2canvas: SVGからPNG画像への変換（高解像度エクスポート）
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
- Mermaid図の高解像度レンダリングとエクスポート
  - デフォルト4倍スケール
  - デバイスピクセル比を考慮した自動高解像度化
  - Canvas 2D APIの高品質レンダリング設定（imageSmoothingQuality: 'high'）
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
# ユニットテスト（jsdom上でWebviewモジュールを検証・高速）
npm run test:unit

# 統合テスト（VS Code実機でコマンド・カスタムエディタを検証）
npm run test

# 両方を実行
npm run test:all

# テストのコンパイルのみ
npm run compile-tests
```

- **ユニットテスト** (`src/test/unit/`): `media/modules/` のWebviewモジュール
  （Markdown⇔HTML変換、テーブル編集、検索、コマンド・オートブロック変換、
  ユーティリティ）をjsdomで構築したWebview相当のDOM環境で検証する。`src/test/unit/helper.ts` が実際のWebviewと
  同じ順序でモジュールを読み込み、`acquireVsCodeApi` をスタブする。
- **統合テスト** (`src/test/extension.test.ts`): `@vscode/test-cli` でVS Code本体を
  起動し、コマンド登録、WYSIWYG⇔テキストエディタ切り替え、`updateTextDocument` の
  最小範囲編集・EOL保持を検証する。

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
- 画像の挿入機能
- より多くの言語のシンタックスハイライト対応
- テーブルのセル結合機能

（機能バックログの詳細は `docs/ROADMAP.md` を参照）

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

### 機能追加時の注意事項
- **ドキュメントの更新**: 新しい機能を追加した場合は、以下のドキュメントを必ず更新してください
  - `README.md`: ユーザー向けの機能説明
  - `AGENT.md`: 開発者向けの技術詳細（このファイル）
  - `sample.md`: 新機能のサンプルコードや使用例
- 特に`sample.md`には実際に動作確認できる例を追加することで、ユーザーと開発者の両方にとって有用なリファレンスになります

## トラブルシューティング

### ビルドエラー
- `npm install`で依存関係を再インストール
- `node_modules`と`dist`を削除して再ビルド

### 拡張機能が動作しない
- VS Codeのバージョンを確認（v1.108.0以上が必要）
- 開発者ツール（Help > Toggle Developer Tools）でエラーを確認
- 拡張機能ホストを再起動

