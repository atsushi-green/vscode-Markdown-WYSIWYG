# アーキテクチャ

## 全体構成

```
拡張機能ホスト (Node.js / VS Code Extension Host)
├── src/extension.ts        … エントリーポイント、コマンド登録
└── src/markdownEditor.ts   … CustomTextEditorProvider実装、Webviewとの橋渡し
        │  postMessage
        ▼
Webview (ブラウザコンテキスト、media/ 配下)
├── editor.html (markdownEditor.ts内で生成)
├── editor.css
├── editor.js                … メインエントリーポイント
└── modules/
    ├── state.js             … グローバル状態管理
    ├── utils.js              … 汎用ユーティリティ
    ├── markdown.js           … Markdown⇔HTML変換
    ├── mermaid.js            … Mermaid図機能
    ├── table.js              … テーブル編集機能
    ├── search.js             … 検索ウィジェット
    └── commands.js           … コマンド・フォーマット・オートブロック変換
```

## 拡張機能ホスト側

### `src/extension.ts`

- `activate()` で以下を登録:
  - `MarkdownEditorProvider.register(context)`（カスタムエディタプロバイダー）
  - コマンド `openEditor` / `newMarkdownFile` / `openAsText` / `toggleEditor`
- `openAsText` と `toggleEditor` は `vscode.window.tabGroups.activeTabGroup.activeTab` からアクティブなタブの種類（`TabInputCustom` か `TabInputText`）を判定し、`vscode.openWith` で開き直す方式でエディタ切り替えを実現。

### `src/markdownEditor.ts`

`MarkdownEditorProvider implements vscode.CustomTextEditorProvider`

- `viewType = 'markdownWysiwyg.editor'`
- `register()`: `vscode.window.registerCustomEditorProvider` を `retainContextWhenHidden: true`、`supportsMultipleEditorsPerDocument: false` で登録。
- `resolveCustomTextEditor()`:
  - Webviewのオプション設定（`enableScripts: true`, `localResourceRoots` を拡張機能ルートに限定）。
  - `getHtmlForWebview()` で生成したHTMLをセット。
  - `vscode.workspace.onDidChangeTextDocument` を購読し、対象ドキュメントの変更があれば `update` メッセージをWebviewへpostMessage。
  - Webviewの `onDidReceiveMessage` で以下のメッセージ種別をハンドル:
    - `edit`: `updateTextDocument()` でドキュメント全体を `WorkspaceEdit.replace` により置換。
    - `log`: デバッグ用に拡張機能ホストのコンソールへ出力。
    - `saveMermaidPng`: `saveMermaidPng()` を実行。
  - 初期化時に一度 `updateWebview()` を呼び、現在のドキュメント内容を送信。
- `getHtmlForWebview()`:
  - `nonce` を生成し、`Content-Security-Policy` に設定（`script-src 'nonce-...' 'unsafe-eval'`、`img-src` は `data:`/`blob:` を許可）。
  - CSS・JSモジュール・highlight.js言語バンドル・mermaid.js・html2canvasのURIを `webview.asWebviewUri` で解決し、`<script>` タグとして読み込み順序を明示（`state.js` → `utils.js` → `markdown.js` → `mermaid.js` → `table.js` → `search.js` → `commands.js` → `editor.js`、依存関係の都合で順序が重要）。
  - 本文には `#editor`（contenteditable）、`#rawEditor`（textarea, 非表示初期値）、検索ウィジェット、Mermaid右クリックメニューのDOMを直接埋め込み。
- `updateTextDocument()`: 変更前後のテキストの共通する先頭・末尾を除いた最小範囲のみを `WorkspaceEdit` で置換する差分適用方式。Undo履歴の肥大化と、同一ファイルをテキストエディタで並行して開いている場合のカーソル飛びを防ぐ。ドキュメント側のEOL（CRLF/LF）に合わせて改行コードを正規化するため、ファイルの改行コードが勝手に変わらない。内容が同一の場合は編集を適用しない。
- `saveMermaidPng()`: `vscode.window.showSaveDialog` でファイルパスを取得 → Base64文字列をバイナリ変換 → `vscode.workspace.fs.writeFile` で書き込み → 成功/失敗を `showInformationMessage`/`showErrorMessage` で通知。

## Webview側モジュール構成

`media/editor.js` がエントリーポイントで、DOMContentLoaded時に各モジュールを初期化する。モジュールは `window.XxxModule` としてIIFEで公開され、モジュール間の依存はグローバル参照経由。

### `state.js`
- `acquireVsCodeApi()` の呼び出しとDOM要素参照の一元管理。
- 編集フラグ（`isUpdating`, `isFormatting`, `isCreatingCodeBlock`, `isRawMode`, `isEditingMermaid`, `isEditingTable`）で相互の更新ループを防止。
- Mermaid/テーブルのIDカウンター、検索状態（`findOptions`, `findMatches`, `currentMatchIndex`）、直前送信Markdown（`lastSentMarkdown`）などを保持。

### `utils.js`
- 改行コード正規化（`normalizeEol`）、トースト通知表示（`showToast`）、キャレット位置の保存・復元（テキストオフセットベース）、DOM探索ヘルパー（祖先探索、ブロック要素探索、キャレット直前のコード要素検出など）。

### `markdown.js`
- `markdownToHtml`: 行ベースのブロックパーサー。行単位でブロック種別（コードフェンス→空行→見出し→テーブル→引用→リスト→段落）を判定して構造を組み立てるため、対応の取れた正しいHTMLのみを生成する。ネストしたリスト（インデント2スペース or タブで1階層）に対応。
- `htmlToMarkdown`: DOMウォーカーによるシリアライザ。HTML文字列を一時要素にパースし、ブロック要素（`serializeBlocks`/`serializeBlockElement`）とインライン要素（`serializeInline`）を再帰的に辿ってMarkdownを生成。ネスト構造の保持、hljs装飾spanの自動除去（`textContent`ベース）、`heading-hash`スパンのスキップ、テーブルセル内装飾の保持を実現。往復変換（md→HTML→md）が1往復で収束することをテストで保証。
- `getCleanHtmlFromEditor`: 編集用DOMからMermaid/テーブルのUI要素・検索ハイライトspanを取り除いた「保存用」のクリーンなHTMLを生成。

### `mermaid.js`
- mermaid.jsの初期化（`theme: 'dark'`, `securityLevel: 'loose'`）。
- コードブロック（`data-lang="mermaid"`）の検出・レンダリング、プレビュー/分割ビューの構築、ソース編集のデバウンス処理と再レンダリング、右クリックメニュー、`html2canvas` を用いたSVG→PNG変換（bbox計算、devicePixelRatio考慮のスケーリング、パディング付与）、クリップボードコピー・保存メッセージ送信。

### `table.js`
- `<table>` 要素をツールバー付きインタラクティブテーブルへ変換（`makeEditable`）。
- セルへのキーボードナビゲーション（矢印/Tab/Enter）、行・列の追加/削除、ペースト時のタブ区切りデータ展開、テーブル全体のクリップボードコピー、編集内容のMarkdownへの反映（デバウンス300ms）。

### `search.js`
- 検索ウィジェットの開閉、DOM検索（WYSIWYGモード: `TreeWalker` でテキストノードを走査しハイライト用spanを挿入）、テキストエリア検索（RAWモード）、正規表現・大文字小文字・単語単位オプション、前後移動。

### `commands.js`
- ツールバー/ショートカットからの書式コマンド実行（`document.execCommand` ベースの太字・斜体・見出し・リスト・リンク・コードブロック・引用挿入）。
- シンタックスハイライト適用（highlight.js、対応言語 + 自動判定、Mermaidブロックは除外）。
- インラインMarkdown記法のライブ変換（`convertInlineText`: リンク・インラインコード・下線・太字・斜体）とキャレット位置の追跡。
- オートブロック変換（リスト/引用のプレフィックス検出）、コードフェンス確定、見出し確定、インラインコード末尾からの脱出などのキー入力ハンドリング。

### `editor.js`（メインエントリーポイント）
- 各モジュールの初期化統括、ツールバー/トグルボタン/検索/Mermaidメニューのイベント登録。
- エディタの `input` イベント: インラインフォーマット適用 → シンタックスハイライト → Mermaid更新 → クリーンHTML抽出 → Markdown変換 → `edit` メッセージ送信、という一連のパイプラインを実行。
- VS Codeからの `update` メッセージ処理: 受信したMarkdownと現在のエディタ内容を比較し、実質的な差分がある場合のみDOMを再構築（無限ループ防止のため `lastSentMarkdown` との比較を行う）。
- Raw/プレビュー切り替えロジック（`toggleRawMode`）。
- グローバルキーボードショートカット（`Ctrl+/`, `Ctrl+F`, `Escape`, `Alt+C/W/R`, `F3`/`Ctrl+G`）とエディタ内ショートカット（`Ctrl+B/I/U`、コードブロック内Enter処理など）の登録。
- `waitForLibraries()`: highlight.js / mermaid.js の非同期読み込み完了をポーリングで待ってから初期描画を実行。

## データフロー（編集時）

1. ユーザーがWYSIWYGエディタ（`#editor`）を編集 → `input` イベント発火。
2. インラインフォーマット適用・シンタックスハイライト・Mermaid更新を同期実行（表示系はキャレット維持のため即時）。
3. 文書への書き戻しは150msデバウンス後に実行: `getCleanHtmlFromEditor()` でUI装飾を除去したHTMLを取得し、`htmlToMarkdown()` でMarkdown文字列に変換。直前送信内容（`lastSentMarkdown`）と同一なら送信しない。
4. `vscode.postMessage({ type: 'edit', content })` で拡張機能ホストへ送信。
5. `markdownEditor.ts` が変更前後の共通部分を除いた最小範囲のみを `WorkspaceEdit` で置換（差分適用）。
6. `onDidChangeTextDocument` が発火し、`update` メッセージがWebviewへ返る。
7. Webview側は受信内容と現在の内容・直前送信内容を比較し、実質的な変更がなければ何もしない（無限ループ防止）。変換の往復安定性（冪等性）により、同期の振動は発生しない。

## ビルド構成

- TypeScript（`src/`）は esbuild（`esbuild.js`）でバンドルし `dist/extension.js` を生成。
- Webview側（`media/`）はバンドルせず、素のJSファイルを `<script>` タグで順序通り読み込む構成（モジュールバンドラーを介さないシンプルな構成）。
