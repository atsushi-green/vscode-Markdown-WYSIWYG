# ROADMAP — 機能バックログ

自動開発ループ（`/evolve`）が参照・更新する機能バックログ。

- ループは **上から順に** `todo` の項目を1つ選んで実装する
- 完了したらこのファイルから該当項目を削除し、[docs/roadmap-done.md](./roadmap-done.md) に完了日とコミットハッシュを添えて `done` として追記する
- 実装中に問題があり見送った場合は `blocked` にして理由を書く
- 新しいアイデアを思いついたら適切な優先度の位置に `todo` で追加する

## 凡例

- **サイズ**: S（〜1時間相当）/ M（半日相当）/ L（要分割）
- Lの項目はそのまま着手せず、まずS/Mに分割してから実装する

## バグ修正（最優先 — 通常機能より先に上から順に着手する）

新たに報告・発見された不具合はここに追記し、通常機能より優先して上から順に着手します。

| 状態 | 不具合 | サイズ | メモ |
|------|--------|--------|------|
| todo | **要実機確認** ブロック数式コピー: foreignObject 経路が canvas taint で機能しない場合の対処（MathJax SVG出力への切替検討） | M | 配線は実装済み（`(未付与)`＝blockToPngBlob を foreignObject 方式へ差し替え・fetchフォント埋め込み・html2canvas フォールバック）だが、**Chromium は `<foreignObject>` を含む SVG を `<img>`→canvas に `drawImage` すると canvas を taint し `toBlob()` が SecurityError を投げる**という長年の挙動があり、これが VS Code webview（Electron/Chromium）でも起きると新経路は毎回 catch されて html2canvas フォールバック（＝従来の崩れた画像）へ落ち、**崩れ修正が実際には発現しない**恐れがある。**まず実機（拡張機能開発ホスト）で、数式ブロックを右クリック「画像としてコピー」した際に (a) 崩れが直った画像がコピーされるか (b) DevTools コンソールに `foreignObject rasterize failed, falling back to html2canvas` の警告が出て taint しているか、を確認する**。taint するなら本 todo に着手: 代替として **数式レンダラを MathJax(SVG出力) へ差し替える**（純粋な SVG になり foreignObject 不要＝taint 回避で画像化が自明。ただし影響大＝インライン/ブロック数式の描画・往復・生Markdown表示の全経路に波及するため、まず S/M へ分割）。taint しない（＝修正が効いている）なら本 todo は close。 |
| todo | 行番号がすべての行に表示されない（行番号ガターの欠落）※優先度低め | S | Raw モードの行番号ガター（`fcf630e` で実装）で、一部の行に行番号が表示されない。全論理行に対して番号が振られるべき。原因候補: ガターの行番号生成が textarea の実際の行数とずれている（末尾行・空行の扱い、あるいはミラー測定の高さずれ）。ユーザー申告により**優先度は低め**でよい。まず実機で再現確認 |

## 優先度: 高

| 状態 | 機能 | サイズ | メモ |
|------|------|--------|------|
| todo | Mermaid図の画像コピー／保存時に背景色を選べる（透過・白・黒）— UI配線（2/2・実機確認前提） | M | **中核(1/2)は実装済み（`9e8ea82`）**: `mermaid.js` に純粋関数 `resolveImageBackground(background)`（`'transparent'`→alpha有効・塗りつぶし無し・html2canvas背景 null／`'white'`/`'black'`→不透明＋該当色／未指定・未知→白フォールバック）を追加し、`svgToPngBlob(svg, scale, background='white')` がこれを使って `getContext('2d',{alpha})`・`fillRect` 有無・html2canvas の `backgroundColor` を切り替えるようにした。`copyToClipboard(previewPanel, background)`／`saveAsPng(previewPanel, background)` も背景を受けて渡す（**既定は 'white' で従来動作のまま**）。ユニットテスト5件（背景解決の全分岐）。**残る(2/2)＝呼び出しUIの配線**: Mermaid右クリックメニュー（`src/markdownEditor.ts` の `#mermaidContextMenu`＝`data-action="copyImage"`／`"savePng"` の2項目, [markdownEditor.ts:236-238](../src/markdownEditor.ts#L236)）を拡張し、背景色（透過／白／黒）を選んで `copyToClipboard`/`saveAsPng` の第2引数へ渡す。案: 各アクションを3背景ぶんに増やす（`data-action="copyImage" data-bg="transparent|white|black"` 等）か背景トグルを設ける。クリック配線は `mermaid.js` の `setupContextMenuEvents`（`data-action` 分岐, [mermaid.js:611-625](../media/modules/mermaid.js#L611)）。`src/markdownEditor.ts` を触るため統合テスト対象サイクル。**PNGの透過/白/黒の見た目・クリップボード/保存は実機（拡張機能開発ホスト）でしか検証できない**ため実機確認が必須（特に html2canvas が透過時に白を焼き込まないかを実機で確認）。**注意**: 数式（`math.js` の `blockToPngBlob`）も白背景固定だが本項目のスコープ外（`resolveImageBackground` を共有して同様対応できる。必要なら別 todo 化） |

## 優先度: 中

| 状態 | 機能 | サイズ | メモ |
|------|------|--------|------|
| todo | ブロック数式コピー画像の背景色選択（透過・白・黒）UI配線 | S | 基盤は実装済み: `blockToPngBlob(block, scale, background)` が `background` を受け、既定 `'white'`／`'transparent'`／`'black'` を `buildMathBlockSvgMarkup` の背景rect（透過は無描画）とフォールバック html2canvas 背景に橋渡し済み。残りは**呼び出しUIのみ**: 数式の右クリックメニュー（`math.js` の `setupContextMenu`／`showContextMenu`）へ背景選択（透過/白/黒）を足し、`copyBlockAsPng`→`blockToPngBlob` の第3引数へ渡す。[[Mermaid図の画像コピー／保存時に背景色を選べる（透過・白・黒）— UI配線]] とパターン共通。**先に上の foreignObject taint 実機確認を済ませてから**着手するのが妥当（画像化経路自体が確定してから背景UIを載せる）。実機確認前提 |
| todo | 表挿入の右クリックメニュー＋行数・列数入力ダイアログUI（トリガー） | M | 中核（`table.buildEmptyTableMarkdown(rows, cols)`／`table.insertTable(rows, cols)`）は実装済み（`78b0295`）。残りは**呼び出しUIのみ**: エディタ空欄で右クリック→メニュー「表を挿入…」→行数・列数を入力するダイアログ→`table.insertTable(rows, cols)` を呼ぶ。メニューは `math.js` の `setupContextMenu`/`showContextMenu`/`computeMenuPosition`（動的生成・`markdownEditor.ts` 非変更・`.mermaid-context-menu` CSS共有）のパターンを流用、行数・列数ダイアログは `#linkDialog` 相当を動的生成（`prompt()` はWebview不可）。**注意**: メニュー/ダイアログ/キャレット挙動はレイアウト・操作依存で**実機（拡張機能開発ホスト）確認が前提**。`/`入力コマンドメニュー（下の項目）とメニュー基盤を共通化できると効率的 |
| todo | 画像のクリップボード貼り付け（ファイル保存＋相対パス挿入） | L | 拡張機能側でファイル書き込みが必要。分割して実装 |
| todo | スクロール時に現在位置の見出しをパンくず状に上部固定表示する | M | エディタをスクロールした際、いま見ている位置の見出しを**祖先の階層すべて**パンくず状に画面最上部へ固定表示する（「今どこを見ているか」が一目で分かるように）。例: 現在位置が `### 詳細` なら、その上位の `## 機能テスト`・`# ドキュメント` も連ねて `# ドキュメント > ## 機能テスト > ### 詳細` のように表示する（直近の見出し1つだけではない）。現状`#editor`に`scroll`イベントリスナーは無く新規実装。ツールバー直下に固定バーを追加し、`scroll`イベント（間引き必須）でビューポート内の最初の見出し要素を特定した後、そこから前方の見出しを辿ってレベルが小さくなるものを拾い上げて祖先チェーンを組み立てる（`h1`〜`h6`。途中のレベルが飛んでいる場合＝`#` の次が `###` などは、存在するものだけを並べる）。各パンくずのクリックで該当見出しへスクロールできると便利（`commands.scrollToAnchor` と見出しの `id` が流用できる） |
| todo | `/`入力によるNotion風コマンドメニューの表示（初期スコープ: 表の挿入・目次挿入） | M | contentEditable内で`/`を入力した直後にポップアップメニューを表示し、選択した項目に応じたコマンドを実行する。既存の`mermaidContextMenu`（`media/modules/mermaid.js`の`showContextMenu`/`hideContextMenu`）のポップアップ実装パターンを流用できる。初回スコープは「目次挿入」（`insertToc`を呼ぶだけで実装可能）と「表の挿入」（上記の表挿入機能と合流させて実装するのが効率的）の2コマンドに絞る |
| todo | 表の矩形選択とコピー＆ペースト（Excel等外部アプリとの相互貼り付け対応） | L | 現状`table.js`は単一セル選択（`selectCell`）とTSVテキストでの表全体コピー（`copy`）／単一始点セルへのTSV貼り付け（`pasteData`）のみで、複数セルにまたがる矩形範囲のドラッグ選択・ハイライト表示が無い。まずS/Mに分割してから着手。方向性: (1)マウスドラッグでのセル範囲選択とハイライトCSSの実装、(2)選択範囲のみをTSVテキスト＋`text/html`（`<table>`）の両方でクリップボードへ書き込み（Excel貼り付けはTSVプレーンテキストで十分だが、エディタ内貼り付けの表現力を保つにはHTML形式も有効）、(3)選択範囲を貼り付け先として`pasteData`を拡張し矩形置換に対応 |
| todo | シールドバッジ画像の表示（`![Version](https://img.shields.io/...)` 等をバッジとして表示） | M | shields.io などのバッジ画像URLを指す画像記法をエディタ内でバッジ画像として表示する（例: `![Version](https://img.shields.io/badge/version-0.0.1-blue)`、リンク付きなら `[![Version](badge-url)](link)`）。**まず調査が必要**: 現状の画像記法 `![alt](url)` のレンダリング有無と往復（`markdown.js` の htmlToMarkdown/markdownToHtml で `<img>`⇔`![]()` が保たれるか）を確認し、未対応なら画像表示の基盤から着手。**CSPの壁**: Webview の `img-src` は現状 `${webview.cspSource} data:` 等に限定されており（[markdownEditor.ts:172-177](../src/markdownEditor.ts#L172)）、外部ホスト（`https://img.shields.io`）の画像読み込みは**ブロックされる**。表示するには CSP に `https:`（または対象ホスト）を許可する必要があり、外部画像を読み込むこと自体のプライバシー/セキュリティ是非も要検討（`src/markdownEditor.ts` を触るため統合テスト対象サイクル）。ユーザー要望。実機で画像表示・往復・CSPを確認 |
| todo | 素のURLをリンクカードとして表示（OGP風プレビュー） | L | 本文に単独で書かれた URL（自動リンク）を、タイトル・説明・サムネイル付きの「カード」表示にする。**まずS/Mに分割してから着手**。方向性と論点: (1) 素URLの検出（行内に単独の `https?://…` があるブロック。既存の自動リンク処理と整合を取る）、(2) メタ情報（OGPタグ）の取得は**外部サイトへのHTTPフェッチが必要**で Webview から直接は CSP/CORS で不可 → 拡張機能側（`src/`）で `fetch` して og:title/og:description/og:image を抽出し Webview へ渡す設計になる（ネットワークアクセス・プライバシーの是非、取得結果のキャッシュ、失敗時フォールバック＝通常リンク表示、が要検討）、(3) カードのDOM生成と往復（カードは表示専用で、ソースには素URLのまま保持＝`data-` 属性やクラスで表現しhtmlToMarkdownでURLへ戻す）。サムネイル画像は上記「シールドバッジ」と同じ外部 `img-src` CSPの制約を受ける。ユーザー要望。実機確認前提 |
| todo | 脚注のホバーツールチップ表示（`[^1]` にマウスホバーで注釈内容をポップアップ） | M | 脚注参照（`[^1]`）にマウスホバーすると、対応する脚注定義の本文をツールチップ/ポップアップで表示する。**前提**: 脚注機能そのものが未実装（[[脚注（`[^1]`）のサポート]]＝優先度:低 の todo）。**脚注の表示・往復変換を先に実装してから**本項目に着手するのが自然（順序依存）。実装方向: 脚注参照に `data-footnote-id` を付与し、`mouseenter`/`mouseleave`（間引き・遅延表示）で対応する脚注定義本文を小さなポップアップに描画（既存の `.mermaid-context-menu`／`.link-dialog` 系のフローティングUIパターンとCSSを流用可能・`markdownEditor.ts` 非変更で動的生成）。位置は参照要素の矩形基準（`computeMenuPosition` 系を流用）。ユーザー要望。ホバー操作感は実機確認前提 |

## 優先度: 低

| 状態 | 機能 | サイズ | メモ |
|------|------|--------|------|
| todo | 脚注（`[^1]`）のサポート | M | |
| todo | 定義リストのサポート | M | |
| todo | YAML front matter の折りたたみ表示 | M | |
| todo | テーブルのセル結合 | L | Markdown標準外。方式検討から |
| todo | Rawモードの行折り返し ON/OFF トグル | S | 行番号ガター(1/3, `fcf630e`)で Raw の textarea を `white-space: pre`（折り返しオフ・横スクロール＝VS Code既定）に変更した。長い散文を書く人向けに折り返しONへ切り替える手段があると親切。ツールバーかコンテキストで `pre`⇔`pre-wrap` を切り替える。**注意**: 折り返しONにすると行番号ガターが論理行とずれるため、折り返し時は「開始行のみ番号を出す」ミラー測定（隠しdivで各論理行の表示高さを測ってガター側の各番号の高さを合わせる）が要る＝Sを超える可能性あり。まず折り返しトグル＋折り返し時はガター非表示（or 開始行のみ簡易対応）から検討 |
| todo | HTMLエクスポート機能 | M | |
| todo | PDFエクスポート機能 | L | まずS/Mに分割してから着手。方式候補: (1) VS Code標準の印刷（Webview→ブラウザ印刷ダイアログ）にCSS `@media print` を用意して委ねる案（軽量・依存追加なし）、(2) `puppeteer-core` 等でHTML→PDFをヘッドレス変換する案（見た目の再現度は高いが依存が重く拡張機能サイズが増える）。Mermaid図のPNG化（html2canvas）で確立した「クリーンHTML抽出→変換」の流れを流用できる。まずは(1)の印刷スタイル対応から着手し、要望が強ければ(2)を検討するのが妥当 |

## 完了 (done)

完了した項目は [docs/roadmap-done.md](./roadmap-done.md) にまとめています。

## 見送り (blocked)

| 機能 | 理由 |
|------|------|
