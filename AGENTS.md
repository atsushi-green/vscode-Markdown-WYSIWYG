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
- **Rawモードの行番号ガター**: Rawモード（`#rawEditor` textarea）左端にソース行番号を表示（`.raw-line-gutter`）。行番号を論理行と1対1で揃えるため textarea を `white-space: pre`（折り返しオフ・横スクロール＝VS Code既定と同じ）に変更。行数は純粋関数 `utils.countLines`（`\n` 区切り・空文字は1行・末尾改行は+1行）、番号列は `utils.buildLineNumberText`（`1\n…\nN`）で生成し `utils.test.ts` で検証。ガターは `white-space: pre` の1要素へ番号を流し込み、縦スクロールに `transform: translateY(-scrollTop)` で追従（横スクロールでは動かさない）。font/line-height/上padding(20px)を textarea と一致。UIは `editor.js` が `#rawEditor` を flex 行のラッパー（`.raw-editor-wrap`）で包む形で動的生成し、`markdownEditor.ts` は非変更（`media/` のみ＝統合テスト非対象）。入力・文書更新・Raw突入時に更新、モード可視制御はラッパーの `display` で行う。WYSIWYG側の行番号は ROADMAP に分割済み（(2/3)対応付けは実装済み・(3/3)ガター描画は残）
- **WYSIWYG行番号の「ブロック→ソース開始行」対応付け（行番号表示 2/3）**: 純粋関数 `markdown.computeBlockStartLines(finalMarkdown, blockMarkdowns)`。`finalMarkdown`（`htmlToMarkdown` の確定ソース＝唯一の変換規則）と、各トップレベルブロックを `serializeBlockElement` 相当で直列化した文字列配列を受け、各ブロックの**1始まり開始行番号**の配列を返す（本文を持たない空ブロックは `null`）。各ブロックの本文行（`coreLinesOf` で前後の空行を落とした行列）は `finalMarkdown` 内に順序どおり連続で現れるため、直前に確定した位置（cursor）から前方一致で開始行を探す。これによりブロック間の空行畳み込み（`\n{3,}`→`\n\n`）・先頭空行除去に依存せず、同一本文が複数あっても順序で正しく対応づく。DOM非依存でユニットテスト済み（`markdown.test.ts`）。
- **WYSIWYG行番号の「表示ブロック→開始行」対応（行番号表示 3/3 橋渡し）**: `markdown.computeEditorLineMap(editorEl)` がライブの`#editor`から `{ block: 表示中のライブ要素, line: 開始行 }` の配列を返す（本文なしブロックは除外）。クリーン化を `getCleanHtmlFromEditor` と共有するため clone生成部を `getCleanEditorClone(editorEl)` へ切り出し（`getCleanHtmlFromEditor` はその `.innerHTML` を返すだけの薄いラッパへ）。クリーンなクローンから `finalMarkdown`（全体）と各トップレベルブロックの直列化を得て `computeBlockStartLines` で開始行を求め、それを「表示中のライブ要素列」（Mermaidの隠し `pre.mermaid-source` を除外）とインデックスで対応づける。クリーンのトップレベル数と表示中ライブ要素数は常に一致する（Mermaidの隠しpre↔可視 `.mermaid-container`、テーブルの `.table-container`→`table` アンラップを経ても）。レイアウト非依存＝jsdomでユニットテスト済み（Mermaid/テーブルの対応も検証）
- **WYSIWYG行番号ガター描画（行番号表示 3/3）**: `editor.js` が `#editor` を flex ラッパー（`.wysiwyg-editor-wrap`）で包み左に `.wysiwyg-line-gutter` を置く（Rawガターと同方式・`markdownEditor.ts` 非変更）。`computeEditorLineMap` の各 `{block, line}` について、ブロック上端を `getBoundingClientRect().top - editorRect.top + scrollTop`（offsetParent非依存）で `#editor` 内容座標へ変換し、その `top` に行番号を絶対配置。縦スクロールは `transform: translateY(-scrollTop)` で追従（`#editor` の `scroll`）、内容変化（input・デバウンス／文書更新後の `scheduleWysiwygGutterUpdate`）とリサイズで再配置。可視制御はラッパーの `display`（`toggleRawMode` の `editor.style.display` 直接操作を `showWysiwygLineGutter`/`hideWysiwygLineGutter` へ置換）。ピクセル整列はレイアウト依存のため実機確認前提（jsdomでは検証不可）
- **目次(TOC)生成**: 見出し(h1〜h6)から目次を生成してキャレット位置へ挿入（ツールバーの 📑 ボタン / `Ctrl+Shift+O` / `executeCommand('toc')`）。スラッグ生成 `markdown.slugify`・目次組み立て `markdown.buildTocMarkdown`（純粋関数）＋ `commands.insertToc`（DOM挿入）。重複見出しは `-1`/`-2` 付与、`> > text` 同様に往復変換で安定。`markdownToHtml` は見出しへ同一規則の `id` を付与し、目次リンク（`#slug`）を `Ctrl`/`Cmd`+クリックすると `commands.scrollToAnchor` が該当見出しへスクロール（contentEditableでは既定遷移が効かないため明示処理／`id` は往復に非出力）
- **リンクの挿入・編集ダイアログ**: `Ctrl+K`（Mac: `Cmd+K`）／ツールバーのリンクボタンで自前ダイアログ（`#linkDialog`）を表示（`commands.insertLink`/`applyLinkDialog`/`removeLinkFromDialog`/`closeLinkDialog`、配線は `editor.js` の `setupLinkDialogEvents`）。Webviewでは `prompt()` が使えず従来の `insertLink` は実質機能していなかった。既存リンク（`<a>`／生Markdown展開中のspan）内なら編集モード（「リンク解除」ボタンを表示）、選択中ならその文字列をリンクテキストの初期値に。入力欄へのフォーカスで選択が失われるため `state.linkDialogRange`/`linkDialogTarget` を保持。適用後のキャレットはリンク直後（内側だと生Markdown展開が走るため）。**`state.js` はDOM参照・状態を明示的なgetter/setterで公開しているため、フィールド追加時は state リテラル・`initDOMReferences`・getter の3箇所を更新すること**
- **リンクのクリック挙動**: 通常クリックはキャレット設置のみ（リンク先へ飛ばない・`cursor: text`）、`Ctrl`（Mac: `Cmd`）+クリックで遷移（`commands.handleLinkClick`）。**`click` ではなく `mousedown` で処理**（clickの時点ではキャレット設置→`selectionchange`→`syncRawMarkdownToCaret` で `<a>` が `span.raw-markdown` に置き換わり辿れないため）。展開済みspanも遷移対象（記法をパースしてhrefを取得）。修飾キー付きは `preventDefault` でキャレット移動も抑止、通常クリックは抑止しない（キャレットが動かなくなる）。`#slug` は `scrollToAnchor`、外部リンクは `openLink` メッセージ→`markdownEditor.ts` の `openLink` が `vscode.env.openExternal` で開く。スキームは http/https/mailto のホワイトリスト（`javascript:` 等は無視／Webviewを信頼せず拡張機能側でも再検証）。相対パスは未対応（キャレット設置のみ）
- **生Markdown表示（リンク・強調記法）**: キャレットがインライン装飾（リンク `[](…)`・太字 `**`・斜体 `*`・取り消し線 `~~`・下線 `++` とその入れ子）の内側にある間だけ生Markdownを薄く表示（`commands.syncRawMarkdownToCaret`／`editor.js` の `setupRawMarkdownCaretEvent` が `selectionchange` を監視・再入抑止）。`outermostInlineDecoration` で**最も外側の装飾要素ごと** `<span class="raw-markdown">` へ展開（内側だけだと `***` が壊れる）、外れたら復帰。展開は `markdown.serializeInline`、復帰は `markdown.convertInline`（どちらも htmlToMarkdown/markdownToHtml と同じ関数）に委譲するため生表示⇔レンダリングが通常変換と一致・往復非影響。展開中は `utils.shouldSkipInline`（`.raw-markdown` を除外）が `walkInline` の再変換を抑止。`RAW_INLINE_TAGS` に対象タグを定義（`CODE` は含めない＝コード内は記法解釈しない）。**数式**も同じ `raw-markdown` の仕組みを共有するが、数式コンテナは `contenteditable="false"` でキャレットが内側へ入れないため展開のトリガーだけは**クリック**（`commands.handleMathClick`／`expandMathToRaw`）で行う。インラインは `<span class="raw-markdown">$式$`、ブロックは `<div class="raw-markdown raw-math-block">$$…$$`。復帰は `collapseRawMarkdown` が担い、ブロックは `markdown.buildMathBlockHtml` で `math-block` を再生成＋`MathModule.render` で再描画、インラインは既存の `convertInline`（`$...$` 対応済み）＋再描画。直列化は `markdown.rawMarkdownText`（`raw-markdown` 要素の生テキスト＝`$` を非エスケープ・`<br>`→改行）で往復不変
- **数式（KaTeX）**: インライン `$...$` → `span.math-inline[data-math]`、ブロック `$$...$$` → `div.math-block[data-math]`（どちらも `contenteditable="false"`）。**生の式は `data-math` が唯一の正**で `htmlToMarkdown` は必ずそこから復元する（KaTeXの生成DOMは直列化に不使用＝描画失敗でも式が消えない）。`markdown.js` は空コンテナを出すだけでKaTeX非依存（変換は純粋関数のままテスト可能）、描画は `math.js` の `render(root)` が担当し `data-math-rendered` で二重描画を防ぐ。呼び出しは `editor.js`（読込時・input時・Rawからの復帰時。Mermaidと同じ箇所）。式の中身はプレースホルダ退避で他のインライン整形から保護（`$\alpha^*$` の `*` が斜体化するのを防ぐ）。**インライン数式のライブ変換**: `commands.js` の `convertInlineText`（`applyInlineFormatting`→`walkInline` 経由の入力イベント）が `markdown.js` の `convertInline` と同じ退避順序（`\$` 退避→`$...$` を `math-inline` コンテナへ退避→復元）で `$...$` を変換し、input末尾の `MathModule.render` が描画する。閉じ `$` を打つまで正規表現がマッチしないため入力途中で壊れない。入力テキストは未エスケープなので `data-math` は `escapeHtml`＋`"` の順でエスケープ（読込パスと同一の `data-math` を生成、突き合わせテスト有り）。**エスケープ**: 素の `$` は数式開始、通常のドル記号は `\$`。直列化時はテキストノードの `$` を `\$` へ戻す（CODE/PRE は textContent を使う別分岐なので影響なし）。KaTeXは `media/katex/`（js+css+`fonts/*.woff2`）へ同梱＝CSPで外部CDN不可。`katex.min.css` がフォントを相対 `fonts/` で参照するため配置固定。**ブロック数式のPNGコピー**: `div.math-block` の右クリックで自前メニュー（`math.js` の `setupContextMenu`／`showContextMenu`／`hideContextMenu`。`markdownEditor.ts` は触らず初回に動的生成して `body` へ挿入・CSSは `.math-context-menu`/`.math-menu-item` が `.mermaid-context-menu` 系と同ルールを共有）を出し、「画像としてコピー」で `blockToPngBlob`→`navigator.clipboard.write(ClipboardItem)`。KaTeXはSVGでなくHTML+CSSのため `svgToPngBlob`（SVG→canvas）は使えず `html2canvas` で `math-block` のクローン（白背景・余白付き）を直接ラスタライズ。字形崩れ防止に `document.fonts.ready` を待つ。`editor.js` 初期化で `mathModule.setupContextMenu(state.editor)` を配線（`media/modules/` のみ変更＝統合テスト非対象。ユニットは `math.js` を helper の `MODULE_FILES` に追加して純粋関数〈`findMathBlock`/`computeMenuPosition`〉とメニュー表示・フォールバックを検証）
- **太字の表示**: `#editor strong` はウェイト 700（ダーク系テーマのみ 800・body の `vscode-dark`/`vscode-high-contrast` クラスで判定）に加え、`font-size: 1.05em`（**全テーマ共通**・`em` なので見出し内でも相対拡大）。`#editor` 配下の `line-height` は body の単位なし `1.6` を継承＝各要素の `font-size` 基準で計算されるため、拡大すると太字を含む行だけ行高が伸びる。`line-height: calc(1.6 / 1.05)` で補正して行高を据え置いている（`media/editor.css`）
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

