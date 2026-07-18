# ROADMAP — 完了 (done)

[docs/ROADMAP.md](./ROADMAP.md) の完了項目アーカイブ。`/evolve` はサイクル完了時にここへ行を追記する（完了日・コミットハッシュ付き）。追記ルールは ROADMAP.md 側の凡例に従う。

| 完了日 | 機能 | コミット |
|--------|------|----------|
| 2026-07-19 | バグ修正: マウスドラッグでの本文選択が装飾記号（`**` 等）に到達すると解除される問題。**根本原因**: `selectionchange` ごとに走る `commands.syncRawMarkdownToCaret` が、選択の開始位置（`startContainer`）の所属だけで判定して装飾（`**太字**` 等）を生Markdownへ**展開／折り畳み**＝DOM書き換えしていたため、ドラッグ中（範囲選択中）に装飾へ差しかかると選択が破棄されていた。**修正**: 生Markdown表示は「キャレット位置」を示す機能であり範囲選択中は不要なので、選択が非collapsed（範囲）の間は `syncRawMarkdownToCaret` を早期returnして一切DOMを触らないようにした。既に展開中のspanも範囲選択中は折り畳まれず、展開テキストのドラッグ編集は維持される。ユニットテスト3件（装飾をまたぐ範囲選択で非展開・選択保持／開始が装飾内でも非展開／展開中spanの非折り畳み）。`media/modules/` のみ＝統合テスト非対象 | `042b500` |
| 2026-07-19 | バグ修正の基盤(1/2): ブロック数式コピー画像の崩れ修正に向けた foreignObject SVG マークアップ組み立ての純粋関数 `math.buildMathBlockSvgMarkup(innerHtml, cssText, width, height, background)` を追加。**調査で根本原因を特定**（KaTeX を `output:'html'` で描画→画像化の html2canvas が `.katex` のCSS配置＝`vertical-align`/負マージン/絶対配置/√overline を再現できず崩れる）し、対策方式を「html2canvas をやめ foreignObject＝ブラウザネイティブ描画でラスタライズ」へ確定。本サイクルはその前段の文字列組み立て（SVG/xhtml名前空間・`<style>`インライン・寸法正規化・背景色 `transparent`可・属性エスケープ）を実装しユニットテスト6件で検証（実機不要）。実際の `blockToPngBlob` 差し替え・KaTeXフォントの base64 埋め込み・CSP `font-src data:` 追加は(2/2)＝実機確認前提で ROADMAP に残置。`media/modules/` のみ＝統合テスト非対象 | `36e6631` |
| 2026-07-19 | バグ修正（応急処置）: 「編集中に突然キャレットが先頭へ飛ぶ」問題の対症療法。`utils.restoreCursorPosition` が復元先の文字数オフセットに届かない（保存時より本文が短くなった）とき、従来は range を一切設定せず、直前の `innerHTML` 全書き換えで選択が失われているとブラウザがキャレットをエディタ先頭へ描画していた。復元失敗時、①エディタ内に妥当な選択が残っていればそれを尊重、②選択が失われている（rangeCount=0 または `(editor,0)` へ collapse＝先頭飛びそのもの）ときのみ、到達できた最寄り位置（最後のテキストノード末尾、本文が無ければエディタ末尾）へフォールバックするよう変更。コードレビュー（`/code-review high`）指摘で `(editor,0)` collapse を妥当な選択と誤判定するギャップを発見し同サイクルで修正。ユニットテスト4件。**根本原因（オフセット方式）は未解決のため ROADMAP に根本対策として残置。** `media/modules/` のみ＝統合テスト非対象 | `cb86e8c` |
| 2026-07-19 | バグ修正: 見出し行でEnterを押すと改行直後の新しい行にも見出しテキストが重複表示される問題。**根本原因**: `utils.findBlockAncestor` が見出し（h1〜h6）をブロックとして扱わず、`commands.handleHeadingConfirm` が「レンダリング済み見出し内でのEnter」を捕まえられずブラウザ既定のEnter処理（見出しの複製・分割）に委ねていた。`## ああ` 入力後 150ms のsyncで段落がh2へ再レンダリングされてから押されたEnterがこの経路に落ちていた。**修正**: `handleHeadingConfirm` に見出し祖先（`findAncestor` で h1〜h6）検出を追加し、`confirmRenderedHeading` でキャレット以降を新しい段落へ切り出して見出し直下に挿入・キャレットを移動し、`preventDefault` でブラウザ既定を抑止（末尾なら空段落・途中なら後半のみ移動でテキストは失われない）。ユニットテスト5件を追加。`media/modules/` のみ＝統合テスト非対象 | `bec3a24` |
| 2026-07-19 | バグ修正: 全選択への上書き貼り付け（Ctrl+A→Ctrl+V）で先頭に空見出しの殻 `# ` が残る問題。`commands.js` の `handleMarkdownPaste` の殻ブロック掃除が生 `textContent` で空判定していたため、`.heading-hash` スパン（`# `）を含む空見出しが除去されず残っていた。空判定を同関数内の `shellIsEmpty`（heading-hash を本文から除外）へ置換して解消。前サイクルで発見し `/evolve` のテストゲートを落としていた既存失敗テストが解消（回帰テスト1件追加）。`media/modules/` のみ＝統合テスト非対象 | `ec815e5` |
| 2026-07-19 | バグ修正: ブロック数式（`$$…$$`）を新規入力しても自動レンダリングされず生ファイルが `\$\$` に破損する問題。`commands.js` に `convertMathBlocks` を追加し `applyInlineFormatting`（入力イベント）から `walkInline` 前に実行。エディタ直下の平文ブロック（class無しP/DIV）の単独 `$$` 行を開き・次の単独 `$$` 行を閉じとして、間の平文ブロックの生テキスト（`$` 非エスケープ）を式本文に集め `markdown.buildMathBlockHtml`〈読込時と同じ〉で math-block へ畳む。閉じ `$$` 無しは非変換、キャレットが範囲内なら直後に空段落を挿入して移す（`caretHandled`）。ユニットテスト7件。`media/modules/` のみ＝統合テスト非対象 | `bebed92` |
| 2026-07-18 | 表挿入の中核: `table.buildEmptyTableMarkdown(rows, cols)`（空テーブルMarkdown生成・純粋関数）＋ `table.insertTable(rows, cols)`（キャレット位置の直後＝無ければ末尾へ挿入し `render()` で即インタラクティブ化。挿入方式は `commands.insertToc` と同じ）。ユニットテスト6件。呼び出しUI（右クリックメニュー＋行数・列数ダイアログ）はROADMAPに分割（実機確認前提） | `78b0295` |
| 2026-07-18 | 行番号表示 (3/3 描画): WYSIWYGモードの行番号ガター描画とスクロール同期。`#editor` を flex ラッパーで包み、`computeEditorLineMap` の各ブロック上端（`getBoundingClientRect`）へ開始行番号を絶対配置、`transform` で縦スクロール追従。input（デバウンス）/文書更新/リサイズで再配置。`markdownEditor.ts` 非変更。**これで行番号表示（元L項目の3分割）が一通り完了**。ピクセル整列は実機確認前提 | `5c82d73` |
| 2026-07-18 | 行番号表示 (3/3 橋渡し): ライブ`#editor`から「表示ブロック→開始行」を対応づける `markdown.computeEditorLineMap`。clone整形を `getCleanEditorClone` へ切り出して `getCleanHtmlFromEditor` と共有、Mermaidの隠しpreを除外し可視コンテナ・テーブルの `.table-container` へ対応。jsdomでユニットテスト（元L項目の分割(3/3)前段。残りはガター描画＝実機確認前提） | `092f2a3` |
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
