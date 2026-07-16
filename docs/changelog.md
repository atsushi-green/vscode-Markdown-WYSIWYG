# 実装の変遷（gitログベース）

`git log` の履歴（時系列順）と、各コミットで追加・変更された内容の要約です。あわせて、現時点でまだコミットされていない作業中の変更（`git status` 時点）も記載します。

## コミット履歴

| 日付 | コミット | 内容 |
|---|---|---|
| 2026-01-13 | `7422a1d` first commit | プロジェクト初期構築。CustomTextEditorProviderによるWYSIWYG編集、Markdown⇔HTML変換、Mermaid図サポート、シンタックスハイライト（highlight.js）、基本的なキーボードショートカット、検索ウィジェットなど中核機能一式。 |
| 2026-01-13 | `df5b421` mermaid図保存時の余白の調整 | Mermaid図をPNGとしてエクスポートする際の余白（パディング）計算を調整。 |
| 2026-01-13 | `7443dd9` インストール方法の記載 | README.mdにWindows/macOS向けのインストール手順を追記。 |
| 2026-01-13 | `e27289c` sampleに表の追加 | `sample.md` にテーブル記法のサンプルを追加。 |
| 2026-01-15 | `4ee2ab5` 表機能の追加 | Markdownテーブルをインタラクティブに編集できるテーブル機能を実装（セル編集、キーボードナビゲーション、行列の追加削除、Excelデータの貼り付け・コピー）。 |
| 2026-01-15 | `e1acb88` fix: 拡張機能画面で意図しない編集が起きるバグを修正 | Webviewと文書の同期処理における意図しない編集発生の不具合を修正。 |
| 2026-01-15 | `62c4000` エディタ切り替えショートカットの実装 | `toggleEditor` コマンドとキーバインド（`Ctrl+Shift+M`/`Cmd+Shift+M`）を追加し、WYSIWYG⇔テキストエディタの相互切り替えを実装。 |
| 2026-07-15 | `cf42195` feat: タスクリスト（チェックボックス）の追加 | GFMタスクリスト記法（`- [ ]` / `- [x]`）をチェックボックス付きリストとして表示し、クリックで完了/未完了を切り替え可能に。状態はMarkdownソースへ即時反映。あわせて自動開発ループ用の `docs/ROADMAP.md` と `/evolve` コマンド定義を追加。 |
| 2026-07-15 | `9e1ab6b` feat: ネスト引用（> >）の追加 | 入れ子の引用ブロック（`> > text` / `>> text`）をMarkdown⇔HTML双方向で保持するように。ツールバーへの引用ボタン設置は書式ツールバー全体の追加としてROADMAPに分離。 |
| 2026-07-15 | `904bba7` feat: 水平線（---）の追加 | `---` / `***` / `___` の単独行を `<hr>` として双方向変換。`---` 行でEnterを押すとその場で水平線に自動変換。commands.jsをユニットテスト対象に追加。 |
| 2026-07-15 | `7f78fdc` feat: 書式ツールバーの追加 | エディタ上部に太字・斜体・下線・見出しH1〜H3・リスト・引用・リンク・コードブロックのボタン列を設置。`executeCommand` の配線は既存で、ボタンのみ未設置だった。mousedown抑止で選択範囲を保持。 |
| 2026-07-15 | `4cfbb21` feat: 取り消し線（~~text~~）の追加 | GFMの取り消し線を双方向変換・ライブ変換に対応（`<del>`/`<s>`/`<strike>` からの復元も可）。Ctrl+Shift+Xショートカットとツールバーボタンを追加。 |
| 2026-07-15 | `9246e08` feat: タスクリストのライブ入力対応 | エディタ上で `- [ ]` / `- []` / `-[]`（スペース有無を問わず）を入力した時点でチェックボックスGUIへ即時変換するように。従来はファイル読込時のパーサでしか解釈されず入力中はテキストのまま残っていた。`commands.js` に `convertTaskLists` を追加し、入力イベントの整形フローへ組み込み。 |
| 2026-07-15 | `67080b7` fix: 太字・取り消し線のライブ変換が実機で効かない問題を修正 | contenteditableが入力中のテキストを複数の隣接テキストノードに分割するため、`**` や `~~` の開始と終了が別ノードに割れて `convertInlineText` の正規表現にマッチしないことがあった。`applyInlineFormatting` で走査前に `editor.normalize()` して隣接テキストノードを結合（要素境界はまたがない）することで解消。分割ノード相当のユニットテストを追加。 |
| 2026-07-15 | `19ff5cc` feat: 引用内での「> 」入力によるネスト引用の作成 | 引用ブロック内の行頭で `> ` を入力すると1段深いネスト引用（`> > `）が作られるように。従来は `findBlockAncestor` が BLOCKQUOTE を返さず `handleAutoBlock` が発火しなかった。`commands.js` に `handleNestedQuote` を追加。ネスト構造は既存の `buildQuoteHtml`/`serializeBlockquoteLines` が往復対応済み。引用UX改善（Enterで抜ける等）の残タスクはROADMAPに分割。 |
| 2026-07-15 | `cc7a1d6` feat: 引用ブロックのEnter/Shift+Enter対応 | 引用ブロックの末尾で `Enter` を押すと引用を抜けて後続の段落へ移り、`Shift+Enter` では引用内で改行（`<br>`）して引用を継続するように。`commands.js` に `handleBlockquoteEnter` を追加し、`editor.js` のkeydown処理（コードブロックEnter処理の前）に配線。`<br>` は `> 行1` / `> 行2` として往復変換される。 |
| 2026-07-15 | `9db72a8` docs+test: JS/TS/JSON/YAML/Go/Rust のシンタックスハイライト対応を明文化 | 同梱の `highlight.min.js` は highlight.js の commonビルドで、これら6言語（と `js`/`ts`/`yml`/`golang`/`rs` 別名）を含む約36言語を登録済みであることを確認。個別バンドルの追加は不要だった。回帰テスト `syntax-highlight.test.ts` を追加し、README/AGENTS/features のハイライト対応言語の記述を実態（旧: Python/Bash/PowerShell/C/SQLのみ）に合わせて更新。 |
| 2026-07-15 | `4b86e1c` feat: 単語数・文字数のステータス表示 | エディタ右下に固定表示するステータスバーで、単語数と文字数（空白除外・Unicodeコードポイント単位）をリアルタイム表示。数え上げは純粋関数 `utils.countText` として実装しユニットテストを追加、UIは `editor.js` が動的生成（`markdownEditor.ts` は変更しない）。通常/Rawモード両方に対応。 |
| 2026-07-15 | `83433dc` feat: 見出しから目次(TOC)を生成・挿入するコマンド | `Ctrl+Shift+O`（Mac: `Cmd+Shift+O`）で見出し(h1〜h6)からGitHub風アンカーリンク付きの目次を生成し、キャレット位置へ挿入。`markdown.slugify`/`markdown.buildTocMarkdown`（純粋関数）＋ `commands.insertToc`（DOM挿入）を追加。重複見出しは `-1`/`-2` 付与、往復変換で安定。ツールバーボタンは未設置（キーボードショートカットのみ）。 |
| 2026-07-16 | `e8b89aa` fix: TOC目次リンクの見出し遷移バグを修正 | 目次のアンカーリンク（`[見出し](#slug)`）をクリックしても該当見出しへ遷移しなかった問題を修正。`markdownToHtml` が見出しへ `buildTocMarkdown` と同一のスラッグ生成・重複連番（`-1`/`-2`）で `id` を付与するようにし、contentEditable内で既定遷移が効かないアンカークリックを `commands.scrollToAnchor` で該当 `id` へスクロールするよう明示処理。`id` は `htmlToMarkdown` で出力されず往復に非影響。ユニットテスト（markdown/commands）を追加。 |
| 2026-07-16 | `482e72d` fix: インラインコード内の記法が往復で欠損するバグを修正 | `` `**太字**` `` のようにインラインコード内へ書いた `**`/`~~`/`++`/`[]()` が装飾として解釈され `<code><strong>太字</strong></code>` に化け、WYSIWYG往復で記法が失われていた問題を修正。`convertInline`（`markdown.js`）と `convertInlineText`（`commands.js`）でインラインコードを先にプレースホルダ（NUL文字＋通し番号）へ退避し、他のインライン整形適用後に `<code>` として復元することでコード内を保護。ユニットテスト（往復含む5件）を追加。 |
| 2026-07-16 | `fd898ed` fix: ダークモードで太字が視認しにくい問題の改善 | `#editor strong` のウェイトを 600 から 700 へ引き上げ、ダークテーマ・ダーク系ハイコントラストでは 800 へさらに強調するテーマ別ルールを `media/editor.css` に追加。テーマ判定は body の `vscode-dark`/`vscode-high-contrast(-light)` クラス（`mermaid.js` の判定と同規則）を利用。 |
| 2026-07-16 | `c7b2f9f` fix: 下端スクロールでツールバーが画面外に消える問題の修正 | `#editor`/`#rawEditor` の `min-height` を `100%` から `0` へ変更。flexの子に `min-height:100%` があるとツールバー分を無視して伸び、body側がはみ出してツールバーごとスクロールしていた。`min-height:0` で残り領域内に収め、スクロールを本文領域内部（`overflow-y:auto`）へ閉じ込めることで、ツールバーが常時上部固定されるように修正。 |
| 2026-07-16 | `38d686e` refactor: 冗長な個別ハイライトバンドルの読み込み整理 | commonビルド `highlight.min.js` に既に含まれる `hljs-python`/`hljs-bash`/`hljs-c`/`hljs-sql` の個別読み込み（`src/markdownEditor.ts`）と同梱ファイルを削除。commonビルド外の PowerShell のみ個別バンドルを残す。対応言語は変わらず（`syntax-highlight.test.ts` で回帰確認済み）、拡張機能サイズを約15KB削減。統合テスト（`npm test`）8件で拡張機能のアクティベート・コマンド登録・エディタ起動を確認。 |
| 2026-07-16 | `31dcbe8` feat: GitHubアラート記法（`> [!NOTE]` など）の表示対応 | 引用の先頭行が `[!NOTE]`/`[!TIP]`/`[!IMPORTANT]`/`[!WARNING]`/`[!CAUTION]` のみの場合、タイプ別に色分けしたアラートボックスへ変換（`markdown.js` の `tryBuildAlertHtml`/`serializeAlert`）。`data-alert-type` を保持し `> [!TYPE]\n> 本文` へ双方向変換（往復テスト済み）。マーカー大文字必須・行内に余分なテキストがあると通常引用（GitHub準拠）。色はVS Codeテーマ変数を参照。ユニットテスト9件を追加。 |
| 2026-07-16 | `297c41a` feat: 目次(TOC)生成をツールバーボタンに追加 | 書式ツールバーに 📑 ボタン（`data-command="toc"`）を追加し、キーボードショートカット `Ctrl+Shift+O` に加えてクリックからも目次を挿入可能に。ボタンの配線は既存の汎用ハンドラ（`data-command`→`executeCommand`）で自動的に有効化。`src/markdownEditor.ts` のツールバーHTMLへの追加のため統合テスト（`npm test`）8件で拡張機能のアクティベート等を確認。 |
| 2026-07-16 | `d304706` feat: 検索ウィジェットに置換機能を追加 | 検索欄の下に置換欄・「置換」「全置換」ボタンを追加。`search.js` に `replaceCurrent`（現在のマッチ）/`replaceAll`（全マッチ）を実装し、WYSIWYG（ハイライト要素をテキストへ置換）・RAW（検索正規表現で一括置換）の両モードに対応。置換はリテラル（`$&` 等を展開しない）。置換後は `input` イベントで書き戻し・再検索を実行。find widgetを検索行/置換行の2段構成へ再構成（`src/markdownEditor.ts`・`media/editor.css`）。ユニットテスト7件＋統合テスト8件で確認。 |
| 2026-07-16 | `a8d69d4` fix: GitHubアラートのライブ変換対応（手入力・ペーストで即時反映） | ユーザー報告: アラート記法を手入力・ペーストしてもレンダリングされず、Raw切替や再読込までアラートboxにならなかった（読込時パーサ `markdownToHtml` のみ対応でライブ変換が無かった）。`commands.js` に `convertAlerts` を追加し `applyInlineFormatting`（入力イベント）へ配線: 対象ブロック（blockquote / 平文の `>[!NOTE]`）をシリアライズ→再パースし「単一のアラートdiv」になる場合のみ置換するため判定は読込時と常に一致。変換後キャレットは本文へ移動（空本文はゼロ幅文字で受け）。ユニットテスト10件を追加。 |
| 2026-07-16 | `123edab` fix: 検索ウィジェットが Cmd+F で開かないバグを修正（macOS） | ユーザー報告: `Ctrl+F`/`Cmd+F` を押しても検索ウィジェットが表示されなかった。`editor.js` の `setupGlobalKeyboardShortcuts` が `Ctrl+F`/`Ctrl+/`/`Ctrl+G` を `e.ctrlKey` のみで判定しており、macOSの `Cmd`（`e.metaKey`）を受け付けていなかった。書式系ショートカット（太字等）と同様に `e.ctrlKey || e.metaKey` で両対応に修正し、文字キーは大文字小文字を無視。カスタムエディタは `enableFindWidget` 未設定（既定false）のためVS Code側のfindには奪われない。 |
| 2026-07-17 | `318194a` feat: アラートbox本文内のEnter操作に対応 | アラートboxの本文（`.markdown-alert-body`）内でEnterがブラウザ既定挙動のままで、boxをキーボードだけで抜ける手段が分かりにくかった問題に対応。`commands.js` に `handleAlertEnter` を追加し `editor.js` のkeydownへ配線（引用の `handleBlockquoteEnter` の前）: 本文末尾のEnterはboxを抜けて後続の段落へ、本文の途中のEnterとShift+Enterは `<br>` 改行。`<br>` 挿入と末尾プレースホルダ補完は `handleBlockquoteEnter` から共通ヘルパ `insertLineBreak` へ切り出して共用。ユニットテスト10件を追加（往復変換の確認を含む）。 |
| 2026-07-17 | `407a321` feat: リンク上にカーソルがある間の生Markdown表示 | カーソルがリンク（`<a>`）の内側のどこかにある間ずっと、生Markdown記法（`[text](url)`）を薄く（等幅・`--vscode-descriptionForeground`）表示し、URLやリンクテキストを直接修正できるように。`commands.js` に `syncRawMarkdownToCaret` を追加し、`editor.js` の `setupRawMarkdownCaretEvent` が `selectionchange`（documentのみ発火）を監視して配線（切り替えが選択を変えて再発火するため再入抑止）。対象リンクを `<span class="raw-markdown">` の生テキストへ展開し、カーソルが外れたら記法をパースしてリンクへ復帰（壊れていればプレーンテキストとして残す）。展開中は `utils.shouldSkipInline` が `walkInline` の再変換を抑止。spanの中身は生Markdownそのもので `serializeInline` のSPAN分岐が素通しするため、展開中でもMarkdownは展開前と同一（往復に非影響・書き戻し不要）。あわせて `utils.placeCaretAt` の末尾の `focus()` を「未フォーカス時のみ」へ限定（ブラウザでは既にフォーカス済みなら no-op のため実機の挙動は不変。jsdomでは選択がリセットされキャレット位置をテストできなかった）。ユニットテスト12件を追加。実機（拡張機能開発ホスト）で見た目・カーソル挙動を確認済み。 |
| 2026-07-17 | `PENDING` fix: ダークモードで太字がまだ視認しにくい問題の改善（フォントサイズの拡大） | ユーザー再報告: `fd898ed` でウェイトを 600→700（ダーク系は 800）へ引き上げたが、まだダークモードだと太字が分かりにくかった。ウェイトに加えて `#editor strong` の `font-size` を `1.05em` へわずかに拡大（`media/editor.css`）。拡大は**全テーマ共通**（テーマによって太字の大きさが変わらないようにするため。ウェイトのみ従来どおりテーマ別に出し分け）。`px` 固定ではなく `em` 指定とし、見出し内の太字も見出しサイズに対して相対的に拡大されるようにした。`#editor` 配下の `line-height` は body の単位なし `1.6` を継承し各要素の `font-size` 基準で計算されるため、拡大すると太字を含む行だけ行の高さが伸びて前後の行がずれる。これを避けるため `strong` の `line-height` を `calc(1.6 / 1.05)` へ補正して行の高さを据え置いた。CSSのみの変更のためユニットテストは追加せず、実機（拡張機能開発ホスト）でダーク／ライト両テーマの見え方と行送りが跳ねないことを確認。 |
| 2026-07-17 | `c7b61b4` feat: リンクの挿入・編集ダイアログ（Ctrl+K） | 従来の `insertLink` はWebviewで使えない `prompt()` を呼んでおり、ツールバーのリンクボタンが実質機能していなかった。自前のダイアログ（`#linkDialog`＝`markdownEditor.ts` のWebview HTML＋`editor.css`。配色・角丸は検索ウィジェットに合わせた）を追加し、`Ctrl+K`（Mac: `Cmd+K`）とツールバーのリンクボタンから開くように。`commands.js` に `insertLink`（開く・初期値決定）/`applyLinkDialog`（適用）/`removeLinkFromDialog`（リンク解除）/`closeLinkDialog` を実装し、`editor.js` の `setupLinkDialogEvents` で配線（Enterで適用・Escapeでキャンセル）。既存リンク（`<a>`／生Markdown展開中のspan）内にキャレットがあれば編集モード、テキスト選択中なら選択文字列をリンクテキストの初期値に、それ以外は新規挿入。入力欄へフォーカスすると選択が失われるため `state.linkDialogRange`/`linkDialogTarget` を保持して適用時に使う。既存リンクは要素ごと置換するため二重リンクにならない。テキスト未入力ならURLをリンクテキストにし、URL未入力では適用しない。適用後のキャレットはリンク直後（内側だと生Markdown展開が走るため）。`state.js` はDOM参照をgetterで公開する作りのため、stateリテラル・`initDOMReferences`・getterの3箇所を更新（getter追加漏れで `state.linkDialog` がundefinedになりダイアログが出ない不具合をテストで検出）。ユニットテスト12件を追加＋統合テスト8件（`src/markdownEditor.ts` 変更のため）で確認。 |
| 2026-07-17 | `528cbfb` feat: リンクのクリック挙動を Ctrl/Cmd+クリックでの遷移へ変更 | ユーザー要望: 編集中は通常クリックでカーソルを合わせたいのに、目次のアンカーリンクは通常クリックで遷移していた。`commands.js` の `handleLinkClick`（クリックリスナーから切り出し・テスト可能に）で、修飾キー無しのクリックはキャレット設置のみとし、`Ctrl`（Mac: `Cmd`）+クリックのときだけ遷移するよう変更。遷移の処理は `click` ではなく `mousedown` で行う（clickの時点ではキャレット設置→`selectionchange`→`syncRawMarkdownToCaret` により `<a>` が `span.raw-markdown` へ置き換わっており辿れず、実機で「Cmd+クリックしても飛ばない」不具合になったため）。既にキャレットがリンク内にあり展開済みのspanも記法をパースして遷移対象とする。修飾キー付きのクリックは `preventDefault` でキャレット移動も抑止（VS Code本体と同様）、通常クリックでは抑止しない（キャレットが動かなくなるため／既定遷移の抑止は `click` 側で実施）。ページ内アンカー（`#slug`）は従来通り `scrollToAnchor`、外部リンクは新設の `openLink` メッセージ→`markdownEditor.ts` の `openLink` が `vscode.env.openExternal` で開く（contentEditableでは既定遷移が効かないため従来は外部リンクを開く手段が無かった）。スキームは http/https/mailto のホワイトリストに限定し `javascript:` 等は無視、Webviewからのメッセージは信頼せず拡張機能側でも同じ検証を実施。`#editor a` に `cursor: text` を設定し通常クリック＝キャレット設置であることを示す。ユニットテスト14件を追加＋統合テスト8件（`src/markdownEditor.ts` 変更のため）で確認。 |

## 作業中（未コミット）の変更

ドキュメント作成時点（2026-07-14）でワーキングツリーに存在する、コミット前の変更内容です。

- **`media/modules/` の新規追加（大規模リファクタリング）**: これまで単一ファイル（`media/editor.js`）に実装されていたロジックを、`state.js` / `utils.js` / `markdown.js` / `mermaid.js` / `table.js` / `search.js` / `commands.js` の7モジュールに分割。`editor.js` はオーケストレーション用のエントリーポイントとして再構成された（3148行規模の削減に相当する構造変更）。
- **`src/markdownEditor.ts` の変更**: 新しいモジュールファイル群を `<script>` として読み込むようにWebview HTML生成部分を更新。
- **`package.json` の変更**:
  - `engines.vscode` / `@types/vscode` のバージョン要件を `^1.108.x` から `^1.95.0` に緩和。
  - `openAsText` / `toggleEditor` コマンドをコントリビュートに追加。
  - `toggleEditor` 用のキーバインドを追加。
- **`sample.md` の軽微な修正**。
- **`sample_original.md`**: リファクタリング前の比較用ファイルとして追加（未追跡）。

### 2026-07-14 のバグ修正・設計改善（未コミット）

**明確なバグの修正:**
- 下線コマンド（`Ctrl+U`）が太字を実行していた問題を修正。`++text++` ⇔ `<u>` の往復変換も全パーサで統一。
- Markdownテーブルの空セルが変換時に削除され列がずれる問題を修正。
- テーブルセルからフォーカスが抜けられなくなるフォーカストラップを解消。
- 検索ハイライトのspanが保存用HTMLに混入する問題を修正。
- テーブルセル内容がHTMLエスケープされずに埋め込まれていた問題を修正。

**設計改善:**
- Mermaid図がキーストロークごとに全破棄・全再描画されていた処理を、新規ブロックのみ描画する方式に変更。
- MermaidテーマをVS Codeのカラーテーマ（light/dark）に追従させ、テーマ切替時も再描画するように変更。
- メイン入力からの文書書き戻しを150msデバウンス化し、無変更時は送信しないように変更。

**根本対策（アーキテクチャ改善）:**
- `updateTextDocument` を全文置換から**差分適用**（共通の先頭・末尾を除いた最小範囲のみ置換）へ変更。Undo履歴の肥大化とカーソル飛びを解消。ドキュメントのEOL（CRLF/LF）も保持。
- `markdownToHtml` を正規表現の一括置換から**行ベースのブロックパーサー**へ刷新。不正なHTML（対応しない閉じタグ）の生成を解消し、ネストしたリストに対応。
- `htmlToMarkdown` を正規表現ベースから**DOMウォーカー**へ刷新。ネスト構造・テーブルセル内の装飾を往復で保持。
- 往復変換の冪等性（1往復で収束）をユニットテスト（40ケース）で検証済み。

> 注: 本ドキュメントはワーキングツリーの実ファイルを調査して作成しているため、上記の未コミット変更も「実装済み機能」として [features.md](./features.md) と [architecture.md](./architecture.md) に反映済みです。
