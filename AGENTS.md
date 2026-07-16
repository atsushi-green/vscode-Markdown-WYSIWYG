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
- **シンタックスハイライト**: コードブロック内のコードを自動的に色付け。`highlight.min.js`（highlight.js commonビルド）が JavaScript/TypeScript/JSON/YAML/Go/Rust を含む約36言語を登録済みで、加えて PowerShell を個別バンドルで追加。未登録・未指定の言語は自動判定
- **リアルタイム同期**: WYSIWYGビューとMarkdownソースの双方向同期
- **単語数・文字数表示**: エディタ右下に固定表示するステータスバーで単語数・文字数（空白除外・コードポイント単位）をリアルタイム更新（数え上げは `utils.js` の `countText`、UIは `editor.js` が動的生成。`markdownEditor.ts` のHTMLには手を入れない）
- **目次(TOC)生成**: 見出し(h1〜h6)から目次を生成してキャレット位置へ挿入（ツールバーの 📑 ボタン / `Ctrl+Shift+O` / `executeCommand('toc')`）。スラッグ生成 `markdown.slugify`・目次組み立て `markdown.buildTocMarkdown`（純粋関数）＋ `commands.insertToc`（DOM挿入）。重複見出しは `-1`/`-2` 付与、`> > text` 同様に往復変換で安定。`markdownToHtml` は見出しへ同一規則の `id` を付与し、目次リンク（`#slug`）を `Ctrl`/`Cmd`+クリックすると `commands.scrollToAnchor` が該当見出しへスクロール（contentEditableでは既定遷移が効かないため明示処理／`id` は往復に非出力）
- **リンクの挿入・編集ダイアログ**: `Ctrl+K`（Mac: `Cmd+K`）／ツールバーのリンクボタンで自前ダイアログ（`#linkDialog`）を表示（`commands.insertLink`/`applyLinkDialog`/`removeLinkFromDialog`/`closeLinkDialog`、配線は `editor.js` の `setupLinkDialogEvents`）。Webviewでは `prompt()` が使えず従来の `insertLink` は実質機能していなかった。既存リンク（`<a>`／生Markdown展開中のspan）内なら編集モード（「リンク解除」ボタンを表示）、選択中ならその文字列をリンクテキストの初期値に。入力欄へのフォーカスで選択が失われるため `state.linkDialogRange`/`linkDialogTarget` を保持。適用後のキャレットはリンク直後（内側だと生Markdown展開が走るため）。**`state.js` はDOM参照・状態を明示的なgetter/setterで公開しているため、フィールド追加時は state リテラル・`initDOMReferences`・getter の3箇所を更新すること**
- **リンクのクリック挙動**: 通常クリックはキャレット設置のみ（リンク先へ飛ばない・`cursor: text`）、`Ctrl`（Mac: `Cmd`）+クリックで遷移（`commands.handleLinkClick`）。**`click` ではなく `mousedown` で処理**（clickの時点ではキャレット設置→`selectionchange`→`syncRawMarkdownToCaret` で `<a>` が `span.raw-markdown` に置き換わり辿れないため）。展開済みspanも遷移対象（記法をパースしてhrefを取得）。修飾キー付きは `preventDefault` でキャレット移動も抑止、通常クリックは抑止しない（キャレットが動かなくなる）。`#slug` は `scrollToAnchor`、外部リンクは `openLink` メッセージ→`markdownEditor.ts` の `openLink` が `vscode.env.openExternal` で開く。スキームは http/https/mailto のホワイトリスト（`javascript:` 等は無視／Webviewを信頼せず拡張機能側でも再検証）。相対パスは未対応（キャレット設置のみ）
- **リンクの生Markdown表示**: キャレットがリンク（`<a>`）の内側にある間だけ生Markdown（`[text](url)`）を薄く表示（`commands.syncRawMarkdownToCaret`／`editor.js` の `setupRawMarkdownCaretEvent` が `selectionchange` を監視・再入抑止）。対象リンクを `<span class="raw-markdown">` の生テキストへ展開し、キャレットが外れたら記法をパースしてリンクへ復帰（壊れていればプレーンテキスト）。展開中は `utils.shouldSkipInline` が `walkInline` の再変換を抑止。spanの中身は生Markdownそのもので `serializeInline` のSPAN分岐がテキストを素通しするため往復に非影響（＝展開中でもMarkdownは不変・書き戻し不要）
- **書式ツールバー**: 太字・斜体・下線・見出し・リスト・引用・リンク・コードブロックのボタン列（選択範囲を保持したまま適用）
- **インラインライブ変換**: `**太字**` / `~~取り消し線~~` 等を入力中に即時変換（`commands.js` の `applyInlineFormatting`）。contenteditableが入力テキストを複数の隣接テキストノードに分割しても記法がマッチするよう、走査前に `editor.normalize()` でテキストノードを結合する（要素境界はまたがない）。インラインコード（`` `...` ``）内の記法は装飾せず保持する: `convertInline`（`markdown.js`）と `convertInlineText`（`commands.js`）はコードを先にプレースホルダ（NUL文字＋通し番号）へ退避し、他の整形適用後に `<code>` として復元する。これにより `` `**太字**` `` が装飾へ化けず、WYSIWYG往復での記法欠損を防ぐ
- **オートブロック変換**: 行頭の `- ` / `1. ` / `> ` をその場でリスト・引用へ変換（`commands.js` の `handleAutoBlock`）。引用ブロック内で `> ` を入力すると1段深いネスト引用を作る（`handleNestedQuote`。往復変換は `> > ` 形式）
- **引用ブロックのEnter操作**: 引用の末尾で `Enter` は引用を抜けて後続段落へ、`Shift+Enter` は引用内改行（`<br>`）（`commands.js` の `handleBlockquoteEnter`。`editor.js` のkeydownでコードブロックEnter処理より前に配線）
- **GitHubアラート**: 引用の先頭行が `[!NOTE]`/`[!TIP]`/`[!IMPORTANT]`/`[!WARNING]`/`[!CAUTION]` のみのとき、色分けアラートboxへ変換（`markdown.js` の `tryBuildAlertHtml`）。`data-alert-type` を保持し `serializeAlert` で `> [!TYPE]\n> 本文` へ往復。マーカー大文字必須・行内に余分なテキストがあると通常引用（GitHub準拠）。色はテーマ変数（`--vscode-editorInfo/Warning/Error-foreground`・`--vscode-charts-*`）。手入力・ペーストは `commands.js` の `convertAlerts`（`applyInlineFormatting` 経由の入力イベント）がライブ変換: 対象ブロックをシリアライズ→再パースし単一アラートdivになる場合のみ置換（読込時パーサと判定が常に一致）、変換後キャレットは本文へ。本文内のEnterは `handleAlertEnter` が処理: 末尾ならboxを抜けて後続段落へ、途中およびShift+Enterなら `<br>` 改行（ブラウザ既定のEnterは本文divを分割しbox構造を壊すため常に自前処理）。`<br>` 挿入＋末尾プレースホルダ補完は `handleBlockquoteEnter` と共通の `insertLineBreak` を使用
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

