# ROADMAP — 完了 (done)

[docs/ROADMAP.md](./ROADMAP.md) の完了項目アーカイブ。`/evolve` はサイクル完了時にここへ行を追記する（完了日・コミットハッシュ付き）。追記ルールは ROADMAP.md 側の凡例に従う。

| 完了日 | 機能 | コミット |
|--------|------|----------|
| 2026-07-18 | 行番号表示 (2/3): WYSIWYG側「ブロック→ソース開始行」対応付け。純粋関数 `markdown.computeBlockStartLines(finalMarkdown, blockMarkdowns)`＋補助 `coreLinesOf` を追加。各ブロックの本文先頭行を確定ソース内から前方一致で探し1始まりの開始行を返す（空ブロックは `null`・空行畳み込みに非依存）。DOM非依存でユニットテスト（元L項目の分割(2/3)・UIは(3/3)） | `5b72280` |
| 2026-07-18 | 行番号表示 (1/3): Rawモード（textarea）の行番号ガター。左端にソース行番号を表示、行を揃えるため textarea を `white-space: pre`（折り返しオフ）へ変更。行数/番号列は純粋関数 `utils.countLines`/`buildLineNumberText`（ユニットテスト）、ガターは `transform` で縦スクロール追従。UIは `#rawEditor` をラッパーで包む動的生成で `markdownEditor.ts` 非変更。ユーザー要望（元L項目の分割(1/3)） | `fcf630e` |
| 2026-07-18 | ブロック数式を右クリックでPNG画像としてクリップボードにコピー。`math.js` に自前コンテキストメニュー（動的生成・`markdownEditor.ts` 非変更）＋`html2canvas` での `math-block`→PNG化（`document.fonts.ready` 待機）を追加。CSSは `.mermaid-context-menu` 系と共有。ユーザー要望 | `44b4031` |
| 2026-07-18 | 数式のライブ変換（入力・ペースト時点で即時レンダリング）。`commands.convertInlineText` に `$...$` の分岐を追加し、`markdown.convertInline` と同じ退避順序で `math-inline` コンテナへ変換→入力イベント末尾の `MathModule.render` で描画。閉じ `$` を打つまで非変換で入力途中に壊れない。`data-math` は読込パスと同一（突き合わせテスト有り）。ユーザー要望 | `45d5bc2` |
| 2026-07-18 | 数式の内側にカーソルがある間、生Markdownを表示する（数式コンテナは `contenteditable="false"` でキャレットが入れないため、クリックで `$...$` / `$$...$$` の生Markdownへ展開＝`commands.handleMathClick`／`expandMathToRaw`。復帰・再変換抑止は既存の `syncRawMarkdownToCaret`／`raw-markdown` クラスを共有し、`collapseRawMarkdown` にブロック数式（`raw-math-block`→`buildMathBlockHtml`＋`MathModule.render`）分岐を追加。直列化は `markdown.rawMarkdownText` で `$` を非エスケープ・`<br>`→改行。ユーザー要望） | `f3426e1` |
| 2026-07-18 | 強調記法（太字・斜体・取り消し線・下線）とリンクの生Markdown表示（`syncRawMarkdownToCaret` を汎用化・`outermostInlineDecoration`・展開は `serializeInline`／復帰は `convertInline` に委譲・入れ子は最外要素ごと展開） | `7c82d3b` |
| 2026-07-17 | 数式（インライン `$...$` / ブロック `$$...$$`）の表示・双方向変換（KaTeXを `media/katex/` へ同梱・生の式は `data-math` に保持・描画は `math.js`・`\$` エスケープ対応。ユーザー要望） | `fd2a368` |
| 2026-07-17 | エディタ右上の「Markdown: WYSIWYGエディタで開く」ボタンの削除（`menus.editor/title` のエントリを削除。コマンド定義とコマンドパレットは維持。ユーザー要望） | `4fb531b` |
| 2026-07-17 | ダークモードで太字がまだ視認しにくい問題の改善（ウェイトに加え `font-size: 1.05em` へ拡大・全テーマ共通。`line-height: calc(1.6 / 1.05)` で行高を据え置き。ユーザー再報告） | `0306fcf` |
| 2026-07-17 | リンクの挿入・編集ダイアログ（`Ctrl+K`・選択テキストのリンク化／既存リンクの編集・解除。自前ダイアログ＝Webviewでは `prompt()` が使えないため） | `c7b61b4` |
| 2026-07-17 | リンクのクリック挙動を Ctrl/Cmd+クリックでの遷移へ変更（通常クリックはキャレット設置のみ。`handleLinkClick`＋拡張機能側 `openLink`／`vscode.env.openExternal`。ユーザー要望・実機確認済み） | `528cbfb` |
| 2026-07-17 | リンク上にカーソルがある間、生Markdownを薄く表示（`syncRawMarkdownToCaret`・`selectionchange`監視・`span.raw-markdown`へ展開／復帰。実機確認済み） | `407a321` |
| 2026-07-17 | アラートbox本文内のEnter操作（末尾でboxを抜けて段落へ／途中とShift+Enterは`<br>`改行。`handleAlertEnter`・共通ヘルパ`insertLineBreak`） | `318194a` |
| 2026-07-16 | 検索ウィジェットが Cmd+F で開かない問題の修正（macOSの `metaKey` 対応・`Ctrl/Cmd+F/G//`。ユーザー報告バグ） | `123edab` |
| 2026-07-16 | GitHubアラートのライブ変換（手入力・ペーストで即時反映。`convertAlerts`・ユーザー報告バグの修正） | `a8d69d4` |
| 2026-07-16 | 検索ウィジェットに置換機能（`replaceCurrent`/`replaceAll`・WYSIWYG/RAW両対応・リテラル置換） | `d304706` |
| 2026-07-16 | 目次(TOC)生成をツールバーの 📑 ボタンからも実行できるように（`data-command="toc"`） | `297c41a` |
| 2026-07-16 | GitHubアラート記法（`> [!NOTE]`/`[!TIP]`/`[!IMPORTANT]`/`[!WARNING]`/`[!CAUTION]`）の表示・双方向変換対応 | `31dcbe8` |
| 2026-07-16 | 冗長な個別ハイライトバンドル（python/bash/c/sql）の読み込み・ファイル削除（commonビルドに既存・PowerShellのみ残す） | `38d686e` |
| 2026-07-16 | 下端スクロールでツールバーが画面外に消える問題の修正（`#editor`/`#rawEditor` の `min-height` を `100%`→`0`） | `c7b2f9f` |
| 2026-07-16 | ダークモードで太字が視認しにくい問題の改善（`#editor strong` を 700、ダーク系は 800 へ・テーマ別ルール） | `fd898ed` |
| 2026-07-16 | インラインコード内の記法（`**`/`~~`/`++`/`[]()`）が装飾に化けて往復欠損するバグの修正（`convertInline`/`convertInlineText` でコードを退避・復元） | `482e72d` |
| 2026-07-16 | TOCの目次リンク（`[見出し](#slug)`）クリックで該当見出しへ遷移（見出しへの`id`付与＋`commands.scrollToAnchor`） | `e8b89aa` |
| 2026-07-15 | タスクリスト（`- [ ]` / `- [x]`）のチェックボックス表示とクリックでのトグル | `cf42195` |
| 2026-07-15 | ネスト引用（`> >` / `>>`）の双方向変換対応 | `9e1ab6b` |
| 2026-07-15 | 水平線（`---` / `***` / `___`）の双方向変換とEnterでの自動変換 | `904bba7` |
| 2026-07-15 | 書式ツールバー（太字・斜体・下線・見出し・リスト・引用・リンク・コードブロック）の設置 | `7f78fdc` |
| 2026-07-15 | 取り消し線（`~~text~~`、Ctrl+Shift+X、ツールバーボタン） | `4cfbb21` |
| 2026-07-15 | タスクリストのライブ入力対応（`- [ ]` / `- []` / `-[]` を入力した時点でチェックボックス化） | `9246e08` |
| 2026-07-15 | 太字・取り消し線のライブ変換が分割テキストノードでマッチしない問題の修正（走査前に `normalize()`） | `67080b7` |
| 2026-07-15 | 引用内での `> ` 入力によるネスト引用の作成（`handleNestedQuote`） | `19ff5cc` |
| 2026-07-15 | 引用ブロックのEnter（引用を抜ける）/Shift+Enter（引用内改行）対応（`handleBlockquoteEnter`） | `cc7a1d6` |
| 2026-07-15 | JS/TS/JSON/YAML/Go/Rust のシンタックスハイライト対応の明文化（commonビルドに既存・回帰テスト追加） | `9db72a8` |
| 2026-07-15 | 単語数・文字数のステータス表示（右下バー・`utils.countText`） | `4b86e1c` |
| 2026-07-15 | 見出しから目次(TOC)を生成・挿入するコマンド（`Ctrl+Shift+O`・`slugify`/`buildTocMarkdown`/`insertToc`） | `83433dc` |
