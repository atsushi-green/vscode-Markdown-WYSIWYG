# 実装済み機能一覧

このドキュメントは、`src/` および `media/` の実装を調査して洗い出した、現時点で実装済みの機能を網羅的にまとめたものです。

## 1. カスタムエディタ（WYSIWYG編集の基盤）

- VS Codeの `CustomTextEditorProvider` を用いた独自エディタ（`viewType: markdownWysiwyg.editor`）。
- `*.md` ファイルに対して `priority: default` で登録されており、ユーザーは標準テキストエディタとWYSIWYGエディタを切り替え可能。
- `contenteditable` なDOM（`#editor`）でリッチテキスト編集を行い、裏側でMarkdown文字列と相互変換する方式。
- ドキュメントの変更（他の場所からの編集・保存・外部変更）はVS Code側で監視し、Webviewへ `update` メッセージとして反映。Webview側の編集は `edit` メッセージで拡張機能へ送り、変更前後の共通部分を除いた**最小範囲のみ**を `WorkspaceEdit` で置換（差分適用。Undo履歴の肥大化とカーソル飛びを防止）。ドキュメント側の改行コード（CRLF/LF）も保持される。
- 無限ループ防止のため、直前に送信したMarkdown文字列（`lastSentMarkdown`）を保持し、同一内容の再送・再描画をスキップ。
- 編集中でも可能な限りキャレット（カーソル）位置を保存・復元。

## 2. コマンド（コマンドパレット）

| コマンドID | タイトル | 内容 |
|---|---|---|
| `markdown-wysiwyg-editor.openEditor` | Markdown: WYSIWYGエディタで開く | アクティブなMarkdownファイルをWYSIWYGエディタで開く |
| `markdown-wysiwyg-editor.openAsText` | Markdown: テキストエディタで開く | アクティブなタブを標準テキストエディタで開き直す |
| `markdown-wysiwyg-editor.toggleEditor` | Markdown: エディタ切り替え (WYSIWYG/テキスト) | 現在開いているタブの種類を判定し、WYSIWYG⇔テキストエディタを切り替える |
| `markdown-wysiwyg-editor.newMarkdownFile` | Markdown: 新しいWYSIWYGドキュメントを作成 | 新規Markdownファイルを作成しWYSIWYGエディタで開く |

- `openEditor` / `openAsText` / `toggleEditor` は `resourceLangId == markdown` のときのみコマンドパレットに表示。
- `editor/title` メニュー（エディタ右上のタイトルバーのボタン）には**何も配置しない**。以前は `openEditor` を置いていたが、`customEditors` の `priority: "default"` により `.md` は既定でWYSIWYGエディタで開くため不要であり、ユーザー要望で削除した。WYSIWYGで開き直したい場合はコマンドパレットの `openEditor`、または `Ctrl+Shift+M` / `Cmd+Shift+M`（`toggleEditor`）を使う。
- `toggleEditor` にはキーボードショートカット `Ctrl+Shift+M`（Mac: `Cmd+Shift+M`）を割当。

## 3. Markdown ⇔ HTML 相互変換

`media/modules/markdown.js` が変換ロジックを担当。

- **Markdown→HTML（行ベースのブロックパーサー）**: 正規表現の一括置換ではなく、行単位でブロック構造（コードフェンス→見出し→テーブル→引用→リスト→段落）を判定して組み立てる方式。開き/閉じタグが対応した正しいHTMLのみを生成する。
- **HTML→Markdown（DOMウォーカー）**: 文字列への正規表現適用ではなく、DOMツリーを再帰的に辿ってシリアライズする方式。ネスト構造（リストの入れ子、`<strong><em>` の入れ子、テーブルセル内の装飾）を正しく保持する。
- **見出し（H1〜H6）**: `#` の数に応じて変換。編集画面では `#` 記号自体を `<span class="heading-hash">` として表示し、視認性を保ちつつMarkdownへ正しく戻せるようにしている。
- **強調**: 太字（`**`/`__`)、斜体（`*`/`_`)、太字斜体（`***`/`___`)、下線（`++text++` ⇔ `<u>`）、取り消し線（`~~text~~` ⇔ `<del>`、`<s>`/`<strike>` からの復元にも対応）の相互変換。入力中も記法を打ち切った時点でライブ変換される（contenteditableがテキストを複数ノードに分割してもマッチするよう、走査前に隣接テキストノードを結合している）。太字の表示ウェイトはテーマに追従し、通常は 700、ダークテーマ・ダーク系ハイコントラストでは 800 として通常文字との差を保つ（`media/editor.css`、body の `vscode-dark`/`vscode-high-contrast` クラスで判定）。ウェイトだけではダークテーマで判別しにくいため、あわせて太字のフォントサイズを `1.05em` へわずかに拡大する（**拡大は全テーマ共通**。テーマで太字の大きさが変わらないようにするため。`em` 指定なので見出し内の太字も見出しサイズに対して相対的に拡大される）。`#editor` 配下の `line-height` は body の単位なし `1.6` を継承し各要素の `font-size` 基準で計算されるため、拡大すると太字を含む行だけ行の高さが伸びて前後がずれる。これを避けるため `strong` の `line-height` を `calc(1.6 / 1.05)` へ補正し、行の高さを拡大前と同じに保っている。
- **数式（KaTeX）**: インライン `$...$` ⇔ `<span class="math-inline" data-math="式">`、ブロック `$$...$$`（複数行・1行 `$$ x $$` の両方）⇔ `<div class="math-block" data-math="式">`。**生の式を `data-math` に保持し、`htmlToMarkdown` は常にこの属性から復元する**ため、KaTeXが生成したDOMの中身はMarkdownへ影響せず、レンダリングに失敗しても式は失われない（Mermaidの `data-*` 保持と同じ考え方）。`markdown.js` は空のコンテナを出力するだけでKaTeXに依存せず（＝変換は純粋関数のままユニットテスト可能）、実際の描画は `math.js` の `render()` が担う。式の中身は他のインライン整形が適用されないようプレースホルダへ退避する（退避しないと `$\alpha^*$` の `*` が斜体に、`$a_1$` の `_` が強調に化ける。インラインコード退避と同じ方針）。コンテナは `contenteditable="false"`（KaTeXの生成DOMをキャレット編集で壊さないため。式の編集はコンテナを**クリック**すると生Markdown表示へ展開して行う＝後述）。**ライブ変換対応**: WYSIWYG上でインライン数式 `$...$` を手入力・ペーストしても、閉じの `$` を打った時点で即座に `math-inline` コンテナへ変換され描画される（`commands.js` の `convertInlineText` が `markdown.js` の `convertInline` と同じ順序で `\$` の退避→数式の退避→復元を行い、`editor.js` の入力イベント末尾で `MathModule.render` が描画する）。閉じの `$` が無いうちは正規表現がマッチしないため、入力途中で式が壊れることはない。**ブロック数式のPNGコピー**: レンダリング済みの `div.math-block` を**右クリック**すると自前のコンテキストメニュー（`math.js` の `setupContextMenu`／`showContextMenu`。UIはMermaidのメニューと同じCSSを共有し、Webview HTMLには持たせず初回に動的生成して `body` へ挿入）が開き、「画像としてコピー」でPNG画像をクリップボードへ書き込む。KaTeXの出力はSVGではなくHTML+CSSのためMermaidのSVG→canvasは使えず、同梱の `html2canvas` で `math-block` のクローン（白背景・余白付き）をラスタライズする（`blockToPngBlob`）。Webフォント（KaTeXのwoff2）の読み込み完了前だと字形が崩れるため `document.fonts.ready` を待ってから描画し、`navigator.clipboard.write` の `ClipboardItem` で書き込む。失敗しても例外は投げずトーストで通知する。**エスケープ**: 素の `$` は数式の開始として扱うため、通常のドル記号は `\$100` と書く（GitHub/Pandoc流）。`\$` はリテラルの `$` として描画し、`htmlToMarkdown` ではテキスト中の `$` を `\$` へ戻す（次回読込で数式に化けないように）。インラインコード・コードブロック内の `$` は数式化もエスケープもしない。KaTeXは**CSPで外部CDNを読めないため `media/katex/` へ同梱**（`katex.min.js`＋`katex.min.css`＋`fonts/*.woff2` の20ファイル。`katex.min.css` がフォントを相対パス `fonts/` で参照するため配置場所が固定される。CSPは `font-src` で許可済み）。
- **リンク**: `[text](url)` ⇔ `<a href="url">text</a>`。カーソルがリンクの内側にある間は生Markdown表示に切り替わる（後述）。
- **インラインコード**: `` `code` `` ⇔ `<code>`。コード内に書いた `**`/`~~`/`++`/`[]()` などの記法は装飾へ変換せずそのまま保持する（`convertInline`/`convertInlineText` はインラインコードを先にプレースホルダへ退避してから他のインライン整形を適用し、最後に復元する）。これにより `` `**太字**` `` が `<code>**太字**</code>` として表示され、WYSIWYG往復でも記法が失われない。
- **引用（ネスト対応）**: `> ` 行を `<blockquote>` に変換し、連続する引用行は1つの `blockquote` にマージ（複数行対応）。`> > `（または `>>`）による入れ子の引用を双方向で保持する。
- **GitHubアラート**: 引用の先頭行が `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` のみの場合、タイプ別に色分けしたアラートボックス（`<div class="markdown-alert markdown-alert-<type>">`、タイトル＋本文）に変換する。マーカーが大文字でない、または同じ行に余分なテキストがある場合は通常の引用として扱う（GitHub準拠）。`data-alert-type` にタイプを保持し、`> [!TYPE]\n> 本文` へ双方向で復元する。色は `--vscode-editorInfo/Warning/Error-foreground` や `--vscode-charts-*` などのテーマ変数を参照しライト/ダークに追従。**ライブ変換対応**: 手入力・ペーストでもマーカーが完成した時点（`]` 入力時）で即座にアラートboxへ変換される（`commands.js` の `convertAlerts`。対象ブロックを一度Markdownへシリアライズして `markdownToHtml` に通し「単一のアラートdiv」になった場合のみ置換するため、判定は読込時パーサと常に一致する）。`> [!NOTE]`（blockquote化済み）と `>[!NOTE]`（スペース無しの平文）の両方に対応し、変換後はキャレットが本文へ移動する。
- **リスト（ネスト対応）**: `*` / `-` の箇条書き、`1.` の番号付きリスト。インデント（2スペース or タブ）による入れ子リストを双方向で保持する。
- **タスクリスト**: GFMのタスクリスト記法（`- [ ]` / `- [x]`、大文字 `X` も可）をチェックボックス付きリスト項目に変換。チェックボックスのクリックで完了/未完了を切り替えられ、状態はMarkdownソースへ即時反映される（`[ ]` ⇔ `[x]`）。入力中も `- [ ]` / `- []` / `-[]`（角括弧の中身やスペースの有無を問わず）を打った時点でチェックボックスへライブ変換される。
- **水平線**: `---` / `***` / `___`（3文字以上の単独行）を `<hr>` に変換し、双方向で保持（出力は `---` に正規化）。
- **段落・改行**: 空行区切りを `<p>`、単一改行を `<br>` に変換。
- **コードブロック**: `` ```lang ... ``` `` を変換（HTMLエスケープ、`language-*` クラス付与、`data-lang` 属性保持）。ブロック内のMarkdown記法は変換されない。閉じフェンスがない場合も安全に処理。
- **テーブル**: パイプ区切りのMarkdownテーブルをHTML `<table>` に変換（後述のインタラクティブテーブル機能と連携）。空セルの保持（列ずれ防止）、セル内容のHTMLエスケープ、エスケープされたパイプ（`\|`）、セル内のインライン装飾（太字・リンク等）の往復保持に対応。
- **往復安定性**: `markdown → HTML → markdown` の変換が1往復で収束（冪等）することをテストで保証しており、エディタ⇔ドキュメント間の同期ループが発生しない。
- **クリーンHTML抽出**（`getCleanHtmlFromEditor`）: エディタDOMをクローンし、Mermaidのプレビュー用DOM・テーブルツールバー・`contenteditable`属性・ボタン要素・検索ハイライトspanなど「UI専用の装飾」をすべて除去してから、Markdownへ変換できる状態にする。

## 4. リアルタイム双方向同期・オートフォーマット

`media/modules/commands.js`, `media/editor.js` が担当。

- 入力のたびにインラインMarkdown記法（`**bold**`, `*italic*`, `` `code` ``, `[text](url)`, `++underline++`）を即座にHTML要素へ変換するライブフォーマット。
- 変換後もキャレット位置がずれないよう、変換前後の位置を計算して復元。
- 行頭で `-`/`*` + スペース、`1.` + スペース、`>` + スペースを入力すると、その場でリスト/引用ブロックに自動変換（オートブロック変換）。引用ブロック内の行頭で再度 `> ` を入力すると、1段深いネスト引用（`> > `）が作られる。
- 引用ブロックの末尾で `Enter` を押すと引用を抜けて後続の段落へ移り、`Shift+Enter` では引用内で改行（`<br>`）して引用を継続する。
- アラートbox（`.markdown-alert`）の本文でも同じ方針でEnterを扱う（`commands.js` の `handleAlertEnter`）。本文末尾での `Enter` はboxを抜けて後続の段落へ移り、本文の途中での `Enter` と `Shift+Enter` は本文内で改行（`<br>`）してboxを継続する。ブラウザ既定のEnterは本文div（`.markdown-alert-body`）を分割してbox構造を壊すため、本文内では常に自前で処理する。`<br>` 挿入と末尾のプレースホルダ補完は引用ブロックと共通のヘルパ（`insertLineBreak`）を使う。
- **生Markdown表示（リンク・強調記法）**: カーソルがインライン装飾の内側のどこかにある間ずっと、レンダリング表示ではなく生のMarkdown記法を薄く（等幅・`--vscode-descriptionForeground`）表示し、記法ごと直接修正できる（`commands.js` の `syncRawMarkdownToCaret`）。対象はリンク（`[text](url)`）・太字（`**`）・斜体（`*`）・取り消し線（`~~`）・下線（`++`）とその入れ子（`***太字斜体***` 等）。`selectionchange`（documentにしか発火しないためdocumentで監視）でキャレットの所属要素を判定し、**最も外側の装飾要素ごと** `<span class="raw-markdown">` の生テキストへ展開する（内側だけ展開すると `***` の外側が壊れるため）。展開中は記法が見えているので、次に入力する文字を装飾の内側／外側どちらに含めるかはキャレットを記法の内側／外側どちらへ置くかで示せる（`**太字**` の `**` より内側に置けば装飾継続、外へ置き直せば抜ける）。カーソルが外れた時点でレンダリング表示へ復帰し、編集内容が反映される。記法が壊れている場合はプレーンテキストとして残す。展開中のテキストは `utils.shouldSkipInline`（`.raw-markdown` を除外）により `walkInline` の再変換対象から外れる（編集中に装飾へ戻らない）。**展開は `markdown.serializeInline`、復帰は `markdown.convertInline` に委譲する**（どちらも `htmlToMarkdown`/`markdownToHtml` と同じ関数）ため、生表示⇔レンダリングが通常の変換結果と必ず一致し、往復に影響しない。切り替え自体がDOM・選択を変更して `selectionchange` を再発火させるため、`editor.js` 側で再入を抑止している。
- **数式の生Markdown表示（クリックで展開）**: 上記の生Markdown表示を数式にも広げたもの。ただし数式コンテナ（`math-inline` / `math-block`）は `contenteditable="false"` でキャレットが内側へ入れないため、キャレット所属判定では展開できない。そこで**クリック**を展開トリガーとする（`commands.handleMathClick` → `expandMathToRaw`）: インライン数式は `<span class="raw-markdown">$式$</span>`、ブロック数式は `<div class="raw-markdown raw-math-block">$$\n式\n$$</div>` へ展開し、開き記法の直後へキャレットを置く。以降の再変換抑止（`utils.shouldSkipInline`）・キャレット離脱時の復帰（`syncRawMarkdownToCaret` → `collapseRawMarkdown`）はリンク・強調と同じ `raw-markdown` の仕組みを共有する。復帰はブロックのみ専用処理で、`markdown.buildMathBlockHtml` で `math-block` コンテナを再生成し `MathModule.render` で再描画する（`convertInline` は `$$` を解釈しないため。記法が壊れていれば `markdownToHtml` に委ねて内容を保全）。インライン数式（`$...$`）は `convertInline` が対応済みのため、復帰は共通経路＋再描画で済む。直列化は `markdown.rawMarkdownText`（`raw-markdown` 要素の生テキストを取り出す。`$` を非エスケープ・contenteditableが生成した `<br>` は改行へ戻す）を `serializeInline`（SPAN）と `serializeBlockElement`（DIV）の `raw-markdown` 分岐が使い、展開の前後でMarkdownが変わらない（往復非影響）。
- **リンクの挿入・編集ダイアログ（`Ctrl+K` / `Cmd+K`・ツールバーのリンクボタン）**: Webviewでは `prompt()` が使えない（従来の `insertLink` は `prompt()` を呼んでいたため実質機能していなかった）ため、自前のダイアログ（`#linkDialog`、`markdownEditor.ts` のWebview HTML＋`editor.css`）を表示する。開いた時点の状態で初期値が決まる: キャレットが既存リンク（`<a>` / 生Markdown表示中のspan）の内側ならそのリンクの編集（テキスト・URLを読み込み、「リンク解除」ボタンを表示）、テキスト選択中なら選択文字列がリンクテキストの初期値、それ以外は空で新規挿入。入力欄へフォーカスを移すとエディタの選択が失われるため、開いた時点のRange（`state.linkDialogRange`）と編集対象要素（`state.linkDialogTarget`）を保持して適用時に使う。既存リンクの編集は要素ごと置き換えるため二重リンクにならない。テキスト未入力ならURLをリンクテキストにする。URL未入力では適用しない。適用後のキャレットはリンクの直後へ置く（リンク内に置くと生Markdown表示へ展開されてしまうため）。Enterで適用、Escapeでキャンセル。
- **リンクのクリック挙動**: 編集中の誤遷移を防ぐため、通常クリックではリンク先へ移動せずキャレットを合わせるだけ（`cursor: text` でテキストカーソルを出す）。`Ctrl`（Mac: `Cmd`）+クリックのときだけリンク先へ移動する（VS Codeエディタ本体と同じ操作感）。`commands.js` の `handleLinkClick` が処理し、ページ内アンカー（`#slug`）は `scrollToAnchor` でスクロール、外部リンクは `openLink` メッセージで拡張機能側（`markdownEditor.ts` の `openLink`）へ渡して `vscode.env.openExternal` で開く（contentEditable内ではリンクの既定遷移が効かないため明示的に処理）。**`click` ではなく `mousedown` で処理する**: クリックするとキャレット設置→`selectionchange`→`syncRawMarkdownToCaret` の順で `<a>` が `span.raw-markdown` へ置き換わるため、`click` の時点では `<a>` を辿れない。あわせて、既にキャレットがリンク内にあり生Markdownへ展開済みのspanも遷移の対象とする（クリックでキャレットを入れてから修飾キー+クリックする流れが自然なため）。修飾キー付きのときは `preventDefault` でキャレット移動自体も抑止する（VS Code本体と同様）。通常クリック時は `preventDefault` してはいけない（キャレットが動かなくなる）ため、既定遷移の抑止は `click` 側で行う。開けるスキームは http/https/mailto のホワイトリストに限定し、`javascript:` 等は無視する。Webviewからのメッセージは信頼せず拡張機能側でも同じ検証を行う。相対パス等は現状なにもしない（キャレット設置のみ）。
- `---` / `***` / `___` のみの行でEnterを押すと、その場で水平線に自動変換（リスト項目内では無効）。
- 見出し記法（`# `〜`###### `）を入力した行でEnterキーを押すと、見出し要素として確定し、次の段落へキャレットを移動。
- コードフェンス（` ``` `または` ```lang `）のみの行でEnterを押すと、その場でコードブロック（`<pre><code>`）に変換し、言語クラス・`data-lang`属性を設定してキャレットをコード内へ移動。
- コードブロック内でのEnterキーは改行文字を挿入するのみ（ブロックを抜けない）。
- インラインコードの末尾で `→`（ArrowRight）キーを押すと、コード要素の外へキャレットを脱出させる特殊ハンドリング。

## 5. シンタックスハイライト

`media/modules/commands.js` + highlight.js（commonビルド `media/highlight.min.js` ＋ commonビルド外の PowerShell 個別バンドル `media/hljs-powershell.min.js`）。

- 対応言語: `media/highlight.min.js` は highlight.js の **commonビルド**で、JavaScript/TypeScript/JSON/YAML/Go/Rust を含む約36言語を登録済み（`js`/`ts`/`yml`/`golang`/`rs` などの別名も解決）。加えて PowerShell を個別バンドル（`hljs-powershell.min.js`）で追加。言語未指定・未登録の場合は `highlightAuto` による自動言語判定。登録言語は `src/test/unit/syntax-highlight.test.ts` で回帰的に検証。
- コードブロックの言語ラベルをCSSの `::before` で右上に表示（`data-lang` 属性を利用）。
- 二重ハイライト防止（`hljs`クラスや `hljs-*` スパンの有無をチェックしてから適用）。
- Mermaidコードブロック（`data-lang="mermaid"`）はハイライト対象から除外し、Mermaidモジュールに処理を委譲。
- VS Code Darkテーマ相当の配色（`vs2015`風のキーワード・文字列・コメント・数値・関数名などの配色）をCSSで独自定義。

## 6. Mermaid図サポート

`media/modules/mermaid.js` + mermaid.js（`media/mermaid.min.js`）+ html2canvas（`media/html2canvas.min.js`）。

- `` ```mermaid `` コードブロックを検出し、自動的にプレビューへ変換（元のソースコードブロックは非表示化して保持）。
- 表示モード切り替え:
  - 👁️ **プレビューのみ**表示
  - ⊞ **分割表示**（ソースコード編集用テキストエリア + プレビューを左右に並べる）
- 分割表示中はソースコードをその場で編集可能。500msデバウンスで再レンダリングし、構文エラー時はプレビュー内にインラインエラーメッセージを表示（直前の正常な描画は保持）。
- ソース編集結果は元のコードブロック・Markdown文書へ即座に反映される。
- **右クリックコンテキストメニュー**（プレビュー領域）:
  - 📋 画像をコピー（クリップボードへPNGとしてコピー）
  - 💾 PNG画像として保存（VS Codeの保存ダイアログを表示しファイル書き込み）
- **高解像度PNGエクスポート**:
  - SVGの実コンテンツ境界（bbox）を計算してトリミング。
  - 基本4倍スケール × デバイスピクセル比を考慮した実効スケールで `html2canvas` にレンダリング。
  - 一定の余白（パディング）を均等に付与。
  - Canvas 2D APIで高品質リサンプリング設定（`imageSmoothingQuality: 'high'`）を適用してPNG Blobを生成。
- PNG保存は拡張機能ホスト側（`markdownEditor.ts`）でBase64→バイナリ変換し、`vscode.window.showSaveDialog` → `vscode.workspace.fs.writeFile` で保存。保存後は通知メッセージを表示。
- Raw/プレビュー切り替えやトグル時にはMermaidの一時DOM（コンテナ等）をクリーンアップしてから再構築する仕組み。

## 7. テーブル編集機能（Excel風インタラクティブ編集）

`media/modules/table.js` が担当。

- Markdownのパイプテーブルをレンダリング時にHTML `<table>` へ変換し、さらにツールバー付きのインタラクティブテーブルへ加工。
- 各セル（`th`/`td`）を `contenteditable` にして直接編集可能。
- **キーボードナビゲーション**:
  - `↑`/`↓`: 同じ列の上下の行（ヘッダー行も含む）へ移動
  - `←`/`→`: キャレットがセルの端にあるときに隣接セルへ移動
  - `Tab`/`Shift+Tab`: 次/前のセルへ移動
  - `Enter`: 同じ列の次の行へ移動（ヘッダー行では最初のデータ行へ）
- **ツールバー操作**:
  - ⬆️ 上に行を追加 / ⬇️ 下に行を追加
  - ⬅️ 左に列を追加 / ➡️ 右に列を追加
  - 🗑️ 行を削除 / 🗑️ 列を削除（最後の1行・1列は削除不可のガード付き）
  - 📋 テーブル全体をコピー（タブ区切りテキストとしてクリップボードへ、Excel等へ貼り付け可能）
- **貼り付け対応**: セルへのペースト時、タブ・改行区切りデータ（Excelなどからのコピー）を検出して複数セルへ展開して貼り付け。通常のテキストはそのまま挿入。
- セル編集は300msデバウンスでMarkdown文書へ反映。
- Raw/プレビュー切り替え時にテーブルのUI装飾（ツールバー・`contenteditable`属性等）をクリーンアップしてから元のMarkdownへ戻す仕組み。

## 8. 検索機能（Find Widget）

`media/modules/search.js` が担当。

- `Ctrl+F`（Mac: `Cmd+F`）で検索ウィジェットを表示。選択中のテキストがあれば検索語として自動入力。
- WYSIWYGモードではDOM内のテキストノードを走査してハイライト用の `<span class="find-highlight">` を挿入。RAWモードではテキストエリアの選択範囲を使って一致箇所を示す。
- 検索オプション:
  - `Aa` 大文字・小文字を区別（`Alt+C`）
  - `ab` 単語単位で検索（`Alt+W`）
  - `.*` 正規表現を使用（`Alt+R`、不正な正規表現はエラーメッセージ表示）
- 次・前の一致へ移動（`Enter`/`Shift+Enter`、ボタン、`F3`/`Ctrl+G`/`Shift+F3`/`Ctrl+Shift+G`）。
- 一致件数表示（`n/m` 形式、一致なしの場合は「結果なし」）。
- **置換**: 検索欄の下に置換欄があり、「置換」（置換欄で `Enter` も可）で現在のマッチを、「全置換」で全マッチをまとめて置き換える。置換文字列はリテラル（正規表現の `$&`/`$1` 等は展開しない）。WYSIWYGモードは検出済みハイライト要素をテキストノードへ置換、RAWモードは検索正規表現（グローバル）で一括置換する。置換後は編集フローへ `input` イベントで通知し（`editor.js` が文書へ書き戻し）、自動的に再検索してハイライトを更新する（`search.js` の `replaceCurrent`/`replaceAll`）。
- `Escape` または閉じるボタンでウィジェットを閉じ、ハイライトをクリア。

## 9. Raw/プレビュー表示切り替え

- ツールバーの `📄 Raw` / `👁️ Preview` ボタン、または `Ctrl+/`（Mac: `Cmd+/`）でMarkdownソース（テキストエリア）とWYSIWYGプレビューを切り替え。
- 切り替え時にMermaid・テーブルのUI状態を適切にクリーンアップ/再構築。
- RawモードでもMarkdownソースへの直接編集がリアルタイムに文書へ反映される。

## 9.5 単語数・文字数のステータス表示

- エディタ右下に固定表示されるステータスバー（`.word-count-status`）で、現在の**単語数**と**文字数**をリアルタイム表示。
- 数え上げは純粋関数 `utils.countText(text)` が担当し、`src/test/unit/utils.test.ts` で検証。
  - 単語数: 空白区切りの語数（`\S+` の個数）。日本語のように空白を使わない言語では目安。
  - 文字数: 空白・改行を除いた文字数。Unicodeコードポイント単位（絵文字などサロゲートペアも1文字）。
- 通常モードではエディタのテキスト、Rawモードでは生Markdownを対象に、入力・文書更新・モード切り替えのたびに更新。
- ステータスバーはWebview内でJSから動的生成し、拡張機能側のHTMLテンプレート（`markdownEditor.ts`）には手を入れない設計。

## 9.6 目次(TOC)の自動生成

- `Ctrl+Shift+O`（Mac: `Cmd+Shift+O`）、ツールバーの 📑 ボタン、または `executeCommand('toc')` で、ドキュメント内の見出し(h1〜h6)から目次を生成し、キャレット位置のブロック直後（キャレットが無ければ先頭）へ挿入する。
- 目次はネストした箇条書き＋GitHub風のアンカーリンク（`* [見出し](#slug)`）。
  - `markdown.slugify(text)`: 小文字化・記号除去・空白のハイフン化（日本語などの文字はそのまま）。
  - `markdown.buildTocMarkdown(headings)`: 最も浅い見出しをインデント0段に相対化し、重複スラッグには `-1` / `-2` … を付与（GitHubのアンカー生成と同じ規則）。純粋関数で `src/test/unit/markdown.test.ts` にて往復含めて検証。
  - `commands.insertToc()`: 見出し収集（`heading-hash` スパンの `#` は除外）→ 目次Markdown生成 → HTML化 → DOM挿入。
- 生成した目次は `markdownToHtml` ⇔ `htmlToMarkdown` の往復で保持される（リストマーカーはシリアライザに合わせ `* `）。
- **目次リンクの遷移**: `markdownToHtml` は見出し要素へ `buildTocMarkdown` と同一のスラッグ生成・重複連番（`-1`/`-2` …）で `id` を付与する。目次のアンカーリンク（`[見出し](#slug)`）を `Ctrl`（Mac: `Cmd`）+クリックすると `commands.scrollToAnchor` が対応する `id` の見出しへスクロールする（後述のリンククリック挙動を参照）。付与した `id` は `htmlToMarkdown` では出力されず往復に影響しない。

## 10. キーボードショートカット（書式設定）

- 太字: `Ctrl+B` / `Cmd+B`
- 斜体: `Ctrl+I` / `Cmd+I`
- 下線: `Ctrl+U` / `Cmd+U`（内部的には太字トグルの `bold` コマンドを使用）

エディタ上部の書式ツールバーからも同じフォーマットコマンド（太字・斜体・下線・見出しH1〜H3・箇条書き・番号付きリスト・引用・リンク・コードブロック挿入）をボタンで実行可能。ボタンクリックでエディタの選択範囲は失われない（`mousedown` 抑止）。ツールバーは常に画面上部に固定され、本文を下端までスクロールしても消えない（`body` を縦フレックス、`#editor`/`#rawEditor` を `flex:1; min-height:0; overflow-y:auto` として、スクロールを本文領域の内部に閉じ込めている）。

## 11. テーマ対応

- 配色・余白・フォントなどはすべてVS CodeのCSS変数（`--vscode-editor-background` 等）を参照しており、ユーザーのカラーテーマに自動追従。
- ハイライトカラーやMermaid/テーブルUIも同様にテーマ変数ベース。

## 12. セキュリティ

- Webviewには厳格な `Content-Security-Policy` を設定（`nonce` によるスクリプト許可、`img-src` は `data:`/`blob:` を含めて限定、外部通信不可の `default-src 'none'`)。
- `localResourceRoots` を拡張機能ディレクトリに限定。

## 既知の未実装・制限事項

- 画像挿入機能は未実装。
- テーブルのセル結合は未対応。
- 脚注は未対応。
- シンタックスハイライトは明示対応言語（Python/Bash/PowerShell/C/SQL）以外は自動判定に依存。
- リスト項目内の複数段落（項目の続き行）は未対応。
