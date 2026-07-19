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
| todo | 編集中に突然キャレットが先頭へ飛ぶ — 根本対策の残り（innerHTML全書き換え経路のブロックID基準アンカー化）※応急処置＋インプレース経路のノード基準化は実装済み | M | **これまでに完了**: (a) 応急処置＝復元失敗時に先頭へ飛ばさず最寄りへフォールバック（`cb86e8c`）。(b) **ノード基準アンカー化（インプレース経路）**＝`saveCursorPosition` が `range.endContainer`/`endOffset` を保持し、`restoreCursorPosition` は保存ノードが**テキストノードとしてエディタ内に生きていれば**文字数オフセット走査を経ずにそのノードへ直接復元する（`?` サイクル）。これで入力イベント経路（[editor.js:373-377](../media/editor.js#L373)・`applyInlineFormatting` 後の復元。`normalize` で保存ノードが消えた場合はオフセット方式へフォールバック）では、埋め込みウィジェット（数式・Mermaid・テーブル）の内部テキスト量が変わってもキャレットがずれない。**残る根本原因**: `handleUpdateMessage` の **innerHTML 全書き換え経路**（[editor.js:607-632](../media/editor.js#L607)）では保存ノードが破棄されるためノード基準が使えず、文字数オフセット方式（＋最寄りフォールバック）のままで、Mermaid の**非同期**再描画（復元は `setTimeout(0)`）や埋め込みウィジェットのテキスト量差でキャレットがずれ得る。**修正方針**: (1) 全書き換え経路のアンカーを「保存対象トップレベルブロックのインデックス／ID＋ブロック内オフセット」で保持し、再描画後に対応ブロックを見つけて復元する（`computeEditorLineMap` 系のブロック対応の考え方が流用できる）。(2) Mermaid等の非同期描画完了後に復元する。(3) `handleUpdateMessage` の全書き換えを差分適用へ変える／競合する古い `update` を無視する（バージョン番号付与, [markdownEditor.ts:54-66](../src/markdownEditor.ts#L54)）。実機（拡張機能開発ホスト）での高速入力・数式/Mermaid編集時の確認が前提 |
| todo | ブロック数式コピー画像の崩れ修正 — blockToPngBlob の foreignObject 差し替え＋KaTeXフォント埋め込み（2/2・実機確認前提） | M | **分割(2/2)。(1/2) の純粋関数 `math.buildMathBlockSvgMarkup`（SVG/foreignObject 組み立て・背景色対応）は実装済み（`36e6631`）。本(2/2)はそれを呼び出して配線する**。`blockToPngBlob`（[math.js:167](../media/modules/math.js#L167)）を html2canvas から foreignObject SVG 方式へ差し替える: クローンの実寸を `getBoundingClientRect` で採寸→(1/2)でSVG文字列化→`new Image()` の `src` に `data:image/svg+xml`（CSPは `img-src … data:` 許可済み）→canvasへ描画→PNG Blob。**重要な障壁（調査で判明）**: foreignObject を `<img>` 経由でラスタライズすると SVG は**隔離コンテキスト**で描画され、外部（`webview.cspSource`）のCSSもフォントも参照できない。KaTeXのCSSは(1/2)で `<style>` インライン化するが、**フォントは現状 CSP `font-src ${webview.cspSource}` のみで `data:` 不許可**（[markdownEditor.ts:172-177](../src/markdownEditor.ts#L172)）。そのため (a) KaTeXの woff2 を fetch→base64 の `@font-face(src: url(data:font/woff2;base64,…))` としてSVG内 `<style>` へ埋め込み、かつ (b) CSP へ `font-src … data:` を追加、の両方が要る（`src/markdownEditor.ts` を触るため統合テスト対象サイクル）。フォント埋め込みが重ければ、代替として **数式レンダラを MathJax(SVG出力) へ差し替える**大改修も選択肢（画像化が自明になるが影響大・別途要検討）。**見た目・クリップボード貼り付けは実機（拡張機能開発ホスト）でしか検証できない**ため実機確認が必須。あわせて数式の背景色選択（[[Mermaid図の画像コピー／保存時に背景色を選べるようにする（透過・白・黒）]] と同趣旨・`blockToPngBlob` は現状 `#ffffff` 固定, [math.js:192,205](../media/modules/math.js#L192)）も (1/2) の `background` 引数経由で同時対応できる |
| todo | 行番号がすべての行に表示されない（行番号ガターの欠落）※優先度低め | S | Raw モードの行番号ガター（`fcf630e` で実装）で、一部の行に行番号が表示されない。全論理行に対して番号が振られるべき。原因候補: ガターの行番号生成が textarea の実際の行数とずれている（末尾行・空行の扱い、あるいはミラー測定の高さずれ）。ユーザー申告により**優先度は低め**でよい。まず実機で再現確認 |

## 優先度: 高

| 状態 | 機能 | サイズ | メモ |
|------|------|--------|------|
| todo | Mermaid図の画像コピー／保存時に背景色を選べるようにする（透過・白・黒） | M | ユーザー要望。現状 Mermaid図のPNG化は背景が **白で固定**（`mermaid.js` の `svgToPngBlob` が `ctx = getContext('2d', { alpha: false })` で不透明キャンバスを作り `ctx.fillStyle = '#ffffff'`／`fillRect` で白背景を塗っている, [mermaid.js:442-457](../media/modules/mermaid.js#L442)）。「画像をコピー」（`copyToClipboard`→`svgToPngBlob`）と「PNG画像として保存」（`saveAsPng`→`svgToPngBlob`）の**両方**で背景色を **透過／白／黒** から選べるようにする。**実装方針**: (1) `svgToPngBlob(svgElement, scale, background)` に背景引数を追加。`'transparent'` のときは `getContext('2d', { alpha: true })`（不透明化を外す）で `fillRect` を行わず透過PNGにし、`'white'`/`'black'` のときは従来どおり不透明キャンバスに該当色を塗る。html2canvas 経由の中間ラスタライズ（`backgroundColor: '#ffffff'`, [mermaid.js:421](../media/modules/mermaid.js#L421)）も透過時は `null`／`'transparent'` にする必要がある点に注意（ここで白が焼き込まれると最終段で透過にできない）。(2) 呼び出し側 `copyToClipboard`/`saveAsPng` に背景色を渡す。(3) UIは Mermaid右クリックメニュー（`src/markdownEditor.ts` の `#mermaidContextMenu`＝`data-action="copyImage"`／`"savePng"` の2項目, [markdownEditor.ts:236-238](../src/markdownEditor.ts#L236)）を拡張する。各アクションを背景色つきに増やす（例: 「画像をコピー（白／黒／透過）」のサブメニューまたは3項目）か、メニューに背景色トグルを設けて選択状態を `svgToPngBlob` へ渡す。メニュー項目のクリック配線は `mermaid.js` の `setupContextMenuEvents`（`data-action` 分岐, [mermaid.js:586-600](../media/modules/mermaid.js#L586)）。**注意**: 数式（`math.js` の `blockToPngBlob`）も同様に白背景固定だが本項目のスコープ外（必要なら別途 todo 化）。PNGの見た目・クリップボード/保存はレイアウト・OS依存のため**実機（拡張機能開発ホスト）確認が前提**。ユニットテストは背景引数の分岐（透過時に `fillRect` を呼ばない・`alpha` 設定が切り替わる）を純粋に検証できる範囲で追加 |

## 優先度: 中

| 状態 | 機能 | サイズ | メモ |
|------|------|--------|------|
| todo | 表挿入の右クリックメニュー＋行数・列数入力ダイアログUI（トリガー） | M | 中核（`table.buildEmptyTableMarkdown(rows, cols)`／`table.insertTable(rows, cols)`）は実装済み（`78b0295`）。残りは**呼び出しUIのみ**: エディタ空欄で右クリック→メニュー「表を挿入…」→行数・列数を入力するダイアログ→`table.insertTable(rows, cols)` を呼ぶ。メニューは `math.js` の `setupContextMenu`/`showContextMenu`/`computeMenuPosition`（動的生成・`markdownEditor.ts` 非変更・`.mermaid-context-menu` CSS共有）のパターンを流用、行数・列数ダイアログは `#linkDialog` 相当を動的生成（`prompt()` はWebview不可）。**注意**: メニュー/ダイアログ/キャレット挙動はレイアウト・操作依存で**実機（拡張機能開発ホスト）確認が前提**。`/`入力コマンドメニュー（下の項目）とメニュー基盤を共通化できると効率的 |
| todo | 画像のクリップボード貼り付け（ファイル保存＋相対パス挿入） | L | 拡張機能側でファイル書き込みが必要。分割して実装 |
| todo | スクロール時に現在位置の見出しをパンくず状に上部固定表示する | M | エディタをスクロールした際、いま見ている位置の見出しを**祖先の階層すべて**パンくず状に画面最上部へ固定表示する（「今どこを見ているか」が一目で分かるように）。例: 現在位置が `### 詳細` なら、その上位の `## 機能テスト`・`# ドキュメント` も連ねて `# ドキュメント > ## 機能テスト > ### 詳細` のように表示する（直近の見出し1つだけではない）。現状`#editor`に`scroll`イベントリスナーは無く新規実装。ツールバー直下に固定バーを追加し、`scroll`イベント（間引き必須）でビューポート内の最初の見出し要素を特定した後、そこから前方の見出しを辿ってレベルが小さくなるものを拾い上げて祖先チェーンを組み立てる（`h1`〜`h6`。途中のレベルが飛んでいる場合＝`#` の次が `###` などは、存在するものだけを並べる）。各パンくずのクリックで該当見出しへスクロールできると便利（`commands.scrollToAnchor` と見出しの `id` が流用できる） |
| todo | `/`入力によるNotion風コマンドメニューの表示（初期スコープ: 表の挿入・目次挿入） | M | contentEditable内で`/`を入力した直後にポップアップメニューを表示し、選択した項目に応じたコマンドを実行する。既存の`mermaidContextMenu`（`media/modules/mermaid.js`の`showContextMenu`/`hideContextMenu`）のポップアップ実装パターンを流用できる。初回スコープは「目次挿入」（`insertToc`を呼ぶだけで実装可能）と「表の挿入」（上記の表挿入機能と合流させて実装するのが効率的）の2コマンドに絞る |
| todo | 表の矩形選択とコピー＆ペースト（Excel等外部アプリとの相互貼り付け対応） | L | 現状`table.js`は単一セル選択（`selectCell`）とTSVテキストでの表全体コピー（`copy`）／単一始点セルへのTSV貼り付け（`pasteData`）のみで、複数セルにまたがる矩形範囲のドラッグ選択・ハイライト表示が無い。まずS/Mに分割してから着手。方向性: (1)マウスドラッグでのセル範囲選択とハイライトCSSの実装、(2)選択範囲のみをTSVテキスト＋`text/html`（`<table>`）の両方でクリップボードへ書き込み（Excel貼り付けはTSVプレーンテキストで十分だが、エディタ内貼り付けの表現力を保つにはHTML形式も有効）、(3)選択範囲を貼り付け先として`pasteData`を拡張し矩形置換に対応 |

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
