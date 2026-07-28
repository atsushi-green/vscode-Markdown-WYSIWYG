# ROADMAP — 機能バックログ

自動開発ループ（`/evolve`）が参照・更新する機能バックログ。

- ループは **上から順に** `todo` の項目を1つ選んで実装する
- 完了したらこのファイルから該当項目を削除し、[docs/roadmap-done.md](./roadmap-done.md) に完了日とコミットハッシュを添えて `done` として追記する
- 実装中に問題があり見送った場合は `blocked` にして理由を書く
- 新しいアイデアを思いついたら適切な優先度の位置に `todo` で追加する
- **外部ホストとの通信が必要になる機能は実装しない。** 拡張機能/Webview からの `fetch` や外部URLの画像・スクリプト読み込み（shields.io バッジ、OGPプレビュー取得など）はセキュリティ・プライバシー上のリスク（意図しない外部送信・CSP緩和・SSRF類似リスク）があるため対象外とする。該当するアイデアは `todo` に追加せず、直接「見送り (blocked)」へ理由付きで記載する

## 凡例

- **サイズ**: S（〜1時間相当）/ M（半日相当）/ L（要分割）
- Lの項目はそのまま着手せず、まずS/Mに分割してから実装する

## バグ修正（最優先 — 通常機能より先に上から順に着手する）

新たに報告・発見された不具合はここに追記し、通常機能より優先して上から順に着手します。

| 状態 | 不具合 | サイズ | メモ |
|------|--------|--------|------|
| todo | 文書の途中に書いた脚注定義を末尾へ集約する際、本文側の空行が1つ増える | S | `本文[^x]です。\n\n[^x]: A\n\n後書き。` が往復後に `本文[^x]です。\n\n\n後書き。\n\n[^x]: A` になる。定義が末尾の脚注一覧へ移動すること自体は設計（一般的なMarkdownの脚注と同じ）だが、**本文側の空行が1つ増える部分は設計ではなく単なるロス**。原因は「最初の定義の直前の空行」と「最後の定義の直後の空行」の両方が本文へ残ること。冪等ではある（増えるのは1回だけ）がラウンドトリップ保持という必須要件に反する。定義間空行の保持対応（`blanksBefore`）と同型の仕組みで、定義ブロック全体の前後の空行も控えれば直せる見込み。`/local-review` B-1 由来（severity medium、旧版と同挙動＝回帰ではない） |
| todo | 未参照の「定義行らしき行」が挟まると脚注定義間の空行がまだ失われる | S | `本文[^a][^b]\n\n[^a]: A\n\n[^0-9]: 地の文\n\n[^b]: B` のように、参照の無い定義風の行が定義の間に挟まると `[^a]`/`[^b]` の間の空行が失われる（`afterDef` が非空行でリセットされる仕様上の限界）。定義間空行の保持対応の取りこぼし。`/local-review` B-2 由来（severity low、旧版と同挙動＝回帰ではない） |

## 優先度: 中

| 状態 | 機能 | サイズ | メモ |
|------|------|--------|------|

## 優先度: 低

| 状態 | 機能 | サイズ | メモ |
|------|------|--------|------|
| todo | 表の列追加・削除時に他列のセパレーター書式（スペース有無・アライメント）を維持する | S | 表区切り行の元表記保持（`data-sep`、[roadmap-done.md](./roadmap-done.md)参照）は現状、列数がヘッダーと食い違うと全列がデフォルト`---`書式にフォールバックする実装（`serializeTable`）。列追加・削除（`table.js`の`addColumn`/`deleteColumn`）で`data-sep`も同時に更新し、変更していない他列の書式だけは保つようにすると良い。`/local-review`指摘（severity low, PLAUSIBLE）由来 |
| todo | PDFエクスポート機能 | L | まずS/Mに分割してから着手。方式候補: (1) VS Code標準の印刷（Webview→ブラウザ印刷ダイアログ）にCSS `@media print` を用意して委ねる案（軽量・依存追加なし）、(2) `puppeteer-core` 等でHTML→PDFをヘッドレス変換する案（見た目の再現度は高いが依存が重く拡張機能サイズが増える）。Mermaid図のPNG化（html2canvas）で確立した「クリーンHTML抽出→変換」の流れを流用できる。まずは(1)の印刷スタイル対応から着手し、要望が強ければ(2)を検討するのが妥当 |
| todo | 見出しパンくずバーの更新をデバウンス化する | S | 現状 `editor.js` の `updateHeadingBreadcrumb` は入力イベント（`setupEditorInputEvent`）から同期・無条件に呼ばれ、見出し数分の `getBoundingClientRect` を毎キー入力ごとに計算する。同じ関数内の行番号ガター更新（`scheduleWysiwygGutterUpdate`）は変換コストが高いためデバウンス済みだが、パンくず側は未対応。見出しの多い文書でタイピング中の遅延要因になりうるため、同様に `setTimeout`（150ms程度）でデバウンスすると良い。`/local-review`指摘（severity low）由来 |
| todo | 「/」コマンドメニューを見出し・引用・テーブルセルなど`P`/`DIV`/`LI`以外のブロックでも使えるようにする | S | 現状 `utils.findBlockAncestor` が `P`/`DIV`/`LI` タグでしか停止しないため、`editor.js` の `updateSlashCommandMenu`（`commands.isSlashCommandTrigger`）は空の見出し（`<h1>/</h1>`等）・引用・テーブルセル内での「/」入力を検出できずメニューが出ない（初期実装の意図的な制限）。見出し直後の新規行などユーザーが「/」を打ちそうな場面もあるため、`findBlockAncestor`の対象タグ拡張や、対象ブロック種別ごとの分岐を検討すると良い。`/local-review`指摘（severity low, 確信度中）由来 |
| todo | 同一段落内で同じ脚注ラベルを複数回参照すると`id="fnref-label"`が重複する | S | `markdown.js`の`convertInline`・`commands.js`の`convertInlineText`はいずれも脚注参照ごとに`id="fnref-" + label`を採番しており、同一ラベルを同じ段落内で2回以上参照すると`id`が重複する（バックリンクは最初の要素にしかジャンプできない）。既存の`markdown.js`側の設計をそのまま踏襲した挙動で今回のライブ変換対応起因の新規バグではないが、脚注機能全体として直す価値がある。連番サフィックス（`fnref-label-2`等）を付与する対応を検討。`/local-review`指摘（severity low）由来 あわせて、脚注一覧の `<li>` 上でEnterを押して項目を分割すると contenteditable が属性を複製するため、`id`・`data-footnote-label`・`data-footnote-blanks` が重複コピーされる（`/local-review` C-2 由来。分割時の属性複製として同じ対応で扱うのが良い）。 |
| todo | 脚注参照ライブ変換の`footnoteLabels`収集クエリをキャッシュ/軽量化する | S | `commands.js`の`walkInline`は`applyInlineFormatting`が呼ばれるたび（ほぼ毎キー入力）に`root.querySelectorAll('section.footnotes li[data-footnote-label]')`を実行する。脚注が多い文書での実害は未確認だが、脚注セクションのDOM変化時のみ再計算するキャッシュ導入や、脚注が存在しない文書での早期スキップを検討すると良い。`/local-review`指摘（severity low）由来 |
| todo | 見出しパンくずバーの差分描画とキーボード操作対応 | S | (1) `editor.js` の `renderHeadingBreadcrumb` はスクロールのたび（rAF間引き後）にバー内DOMを毎回全消去→再構築している。チェーンが前回と同一なら再構築をスキップすると無駄なreflowを減らせる。(2) パンくず項目は `<span>`+`click`のみで`tabindex`/`role`/`keydown`が無くキーボード操作不可（既存TOCリンクは`<a>`で自然に操作可）。`<a>`化するか`tabindex="0"`+`Enter`ハンドラを追加すると良い。`/local-review`指摘（severity low）由来2件をまとめて記載 |
| todo | `table.js`の`makeEditable`が行・列追加のたびに全セルへイベントリスナーを多重登録する | S | `makeEditable`は`addRow`/`addColumn`から呼ばれるたびに既存セルも含めて再実行され、`click`/`keydown`/`input`/`paste`/`mousedown`/`mouseenter`のリスナーが解除されずに積み上がる（各処理自体は冪等なため機能的には壊れないが、行列操作を繰り返す大きな表でリスナー数がO(操作回数)で増え続ける）。新規セルだけにリスナーを付ける、または再アタッチ前に一度除去するよう直すと良い。`/local-review`指摘（severity low-medium）由来 |
| todo | 表の矩形範囲選択のハイライト計算が大きな表でO(セル数×行数)になる | S | `table.js`の`applyRangeHighlight`はドラッグの`mouseenter`毎に全セルを走査し、各セルで`cellPosition`（`indexOf`＝O(行数)）を呼ぶため全体でO(セル数×行数)。挿入UIの上限（行50×列20＝最大1000セル）まで表を大きくしてドラッグすると、mouseenter毎に重い処理が走り操作がもたつく可能性がある。行・列インデックスを`data-`属性等で事前計算しO(1)で引けるようにすると改善できる。現状の典型的な小さな表では体感できない。`/local-review`指摘（severity low）由来 |
| todo | `table.js`の`buildTsvFromMatrix`がセル内のタブ・改行文字をエスケープしない | S | セル内容にタブ`\t`や改行`\n`が含まれる場合、TSV区切りとして貼り付け先で列・行がずれる。`copy()`の旧実装（表全体コピーのみ）から存在する既存の制約で、今回の矩形範囲コピー追加が原因ではない。エスケープ（例: タブ→スペース、改行→`<br>`相当の別区切りにするか、そもそもセル内改行自体が現状想定されているか要確認）を検討すると良い。`/local-review`指摘（severity low）由来 |
| todo | `table.js`の`writeToClipboard`が`new ClipboardItem(...)`の同期例外を捕捉できない | S | `writeToClipboard`は`navigator.clipboard.write(...).then().catch()`のPromiseチェーンのみで失敗を捕捉するが、`new ClipboardItem({...})`自体がPromiseではなく同期的に例外を投げるブラウザ実装（MIMEタイプの組み合わせによっては起こりうる）の場合、この`try`の外側で例外が発生し「❌ コピーに失敗しました」トーストが出ないまま失敗しうる。VS Code Webview（Chromium）では`text/plain`+`text/html`の組み合わせは通常サポートされ発生可能性は低いが、`writeToClipboard`内で`try/catch`し失敗をPromiseとして返すようにすると防げる。`/local-review`指摘（severity low、確信度低）由来 |
| todo | `table.js`の`writeMatrixIntoTable`が全行のセル数をヘッダ行（`rows[0]`）のセル数に一律依存して算出している | S | `writeMatrixIntoTable`の`colCount = Array.from(rows[0].cells).length`は、全行がヘッダ行と同じセル数であることを前提にした暗黙の不変条件（現状のテーブル生成・行列追加削除ロジックはこれを保っている）。旧`pasteData`実装は本文行ごとに実セル数（`querySelectorAll('td').length`）を個別に見ていたため、この前提への依存はより強くなっている。将来的に不揃いな行（rowspan/colspan等）を扱うようになった場合にずれるリスクがあるため、行ごとの実セル数を見るよう戻すか、テーブルが常に矩形であることをコメントで明記しておくと良い。`/local-review`指摘（severity low）由来 |
| todo | `table.js`の`writeMatrixIntoTable`が書き込みのたびに`Array.from(rows[row].cells)`を再生成する | S | `targets.forEach`のループ内で対象行ごとに`Array.from(...)`を毎回呼んでおり、小規模テーブル前提のため実害はないが行ごとにキャッシュすれば無駄な配列生成を避けられる（simplification）。`/local-review`指摘（severity low）由来 |
| todo | `utils.findBlockAncestor`が`DT`/`DD`を認識しないため、定義リスト内では自動整形（`---`→`<hr>`化、` ``` `→コードフェンス化、`- `/`> `/`1. `入力によるリスト・引用への自動変換等）が一律無効化される | S | `findBlockAncestor`は`P`/`DIV`/`LI`タグでしか停止しないため、`<dt>`/`<dd>`にカーソルがある間はcommands.jsの各種オートフォーマット判定がすべて無反応になる（クラッシュはしない）。`DT`/`DD`を対象タグへ追加するか、対象ブロック種別ごとの分岐を検討する。定義リスト機能追加時の`/local-review`指摘（severity low〜medium, 確信度中）由来 |
| todo | 定義リストの用語・定義本文中の`[^label]`が脚注参照として変換されない | S | `buildDefListHtml`は`convertInline`を呼ぶ際に`footnoteLabels`を渡していないため、`<dt>`/`<dd>`中の`[^1]`はリンクへ変換されずリテラル文字列のまま表示される。見出し・リスト・テーブルセルも同様にfootnoteLabelsを渡していない既存の設計（脚注参照は段落のみ対象）を踏襲しているだけで新規の非一貫性ではないが、対応する価値はある。定義リスト機能追加時の`/local-review`指摘（severity low, 確信度低〜中）由来 |
| todo | front matterヘッダの折りたたみ/展開トグルがマウス操作限定でキーボード操作不可 | S | `.frontmatter-header`は`contenteditable="false"`のプレーンな`<div>`で、`tabindex`/`keydown`/`aria-expanded`が無い。既存の`.code-lang-selector`・数式クリック展開も同様にマウス操作限定であり既存方針を踏襲しているだけだが、a11y改善候補として記録。`tabindex="0"`＋`Enter`/`Space`ハンドラ、`role="button"`＋`aria-expanded`の付与を検討。front matter機能追加時の`/local-review`指摘（severity low）由来 |
| todo | front matterヘッダのラベルが英語表記（"Front Matter"）で他のUI文言と不統一 | S | 他のUI文言（「コードをコピー」「見出しが見つかりません」等）は日本語だが、front matterヘッダだけ`Front Matter`と英語表記になっている。日本語ラベル（例:「フロントマター」）への統一を検討。front matter機能追加時の`/local-review`指摘（severity low）由来 |
| todo | 文書が水平線（`---`）から始まり後方にも`---`があると、内容を検証せずfront matterと誤認される | S | `parseFrontMatter`は「1行目が`---`」「後続のどこかに`---`」という位置関係のみで判定し、中身がYAMLらしいか等は検証しない。文書が装飾目的の水平線から始まり、後方に別の水平線がある通常のMarkdown文書（稀なケース）だと、間の内容が丸ごと折りたたみ済みfront matterとして表示されてしまう（保存されるMarkdown自体は保たれるが表示が崩れる）。実際のJekyll/Hugo等も同様に内容検証をしない設計のため妥当な面もあるが、実害があれば内容行がYAMLの`key: value`らしいかを軽く検証するなど再検討する。front matter機能追加時の`/local-review`指摘（severity low〜medium, 確信度中）由来 |
| todo | Rawモードの行折り返しトグルボタンがWYSIWYGモード中も常時表示・クリック可能で、効果が見えず誤解を招きうる | S | `#toggleRawWrap`は`#toggleView`（Raw/WYSIWYG切替）と異なり、モードに応じた表示/無効化制御が無い。WYSIWYGモード中にクリックしてもRawモードに入るまでボタンの`active`表示以外に見た目の変化が無いため、初見のユーザーが「効いていない」と誤解しうる（title属性で補足説明済みのため実害は小さい）。Rawモード中のみ表示・有効化する、または常時表示のままでも問題ないと判断するかを検討。行折り返しトグル機能追加時の`/local-review`指摘（severity low, 確信度中）由来 |
| todo | `table.js`の`computeMenuPosition`/`computeDialogPosition`が右端・下端のはみ出し補正のみで、左端・上端（負のanchor座標）を補正しない | S | `computeMenuPosition`は`left + menuWidth > viewportWidth`等の右下方向のはみ出ししか補正せず、`anchor.x`/`anchor.y`が負の場合（例: エディタが水平スクロールしていてキャレット由来のanchorが画面左に出る等）にダイアログ/メニューが画面外（左上）へはみ出す可能性がある。マウス右クリック由来の座標は通常負にならないため従来は顕在化しなかったが、表挿入ダイアログの位置修正でキャレット矩形（`range.getBoundingClientRect()`）由来のanchorを使う経路が増えたことで理論上の発生余地が生まれた。`left`/`top`にも`Math.max(0, ...)`相当の下限クランプを追加すると良い。表挿入ダイアログ位置修正時の`/local-review`指摘（severity low, PLAUSIBLE）由来 |
| todo | Windowsで別ドライブに画像がある場合、`toMarkdownRelativePath` が相対パスでなく絶対パスを返す | S | `src/imagePaste.ts` の `toMarkdownRelativePath` は `path.relative` に委ねているため、Windowsで `docDir` と画像が別ドライブにあると相対化できず `D:\foo\bar.png` のような絶対パスが返り、それが `D:/foo/bar.png` として `![]()` に埋まる。現在の呼び出し元（`markdownEditor.ts` の `saveClipboardImage`）は保存先をドキュメントと同一フォルダに固定しているため到達不能で、サブフォルダ／任意保存先へ拡張する際に対処が要る（ドライブが異なる場合は絶対パスのままにするか、`file:` URI にするか等の方針決めが必要）。`/local-review` B-2 由来 |
| todo | 属性値エスケープ（`escapeHtml`＋`"`潰し）の重複を1箇所へ寄せる | S | `commands.js`の`attrValue`（タイトル記法対応で新設）と、同ファイルのインライン数式・画像が個別に行っている`markdown.escapeHtml(x).replace(/"/g, '&quot;')`は同一処理で、実体は`markdown.escapeAttr ∘ escapeHtml`。数式側も含めて`attrValue`（または`markdown`側の公開関数）へ寄せられる。`/local-review` B-2 由来（simplification, severity low） |
| todo | `unstashToText` が2モジュールに完全重複している | S | `markdown.js`と`commands.js`の`unstashToText`は、エスケープ関数の違い以外ロジックもコメントも同一。実際に本サイクルのレビューで「復元順序が逆」というバグが見つかっており、**片方だけ直す事故が起きやすい**。`parseLinkDestination`/`buildTitleAttr`と同様に、退避配列を受け取って復元関数を返すファクトリを`MarkdownModule`側で公開して共有すると良い。`/local-review` B-1 由来（severity low） |
| todo | URL中の `\$` を href にバックスラッシュ付きで入れるか、`$` にして直列化時に再エスケープするか | S | 現在は往復優先で`[t](http://e/\$100)`の`href`を`http://e/\$100`（バックスラッシュ入り）にしている。CommonMark解釈ではURLは`http://e/$100`なので、**リンクを実際に開いたときの遷移先がずれる**可能性がある。「表示・遷移は`$`、直列化時に`\$`へ再エスケープ」へ変える選択肢もあるが、その場合は`serializeInline`が`href`中の素の`$`もエスケープすることになり、`http://e/a$b`のような正当なURLの表記が保存で変わる副作用を検討する必要がある。実機でのリンク遷移の挙動を見てから判断するのが妥当。`/local-review` C-1 由来（severity low, 確信度中） |
| todo | `$…$` が `)` をまたぐとリンク記法自体が変換されなくなる | S | 数式の退避がリンク解析より前にあるため、`[t](http://e/$a)$b`のような入力では`)`が数式プレースホルダに飲まれ、リンク記法が閉じずに変換されない。退避順序に元からある制約で、URL/タイトルの退避戻し（`unstashToText`）でも解消しない。`/local-review` B-2 由来（severity low、既存） |
| todo | 段落以外のブロック（見出し・リスト・表・引用・定義リスト・脚注本文）で脚注参照が変換されない | S | `markdown.js` は `footnoteLabels` を段落（`<p>`）の `convertInline` にしか渡さないため、それ以外のブロックでは `[^label]` が脚注に変換されずリテラルのまま残る。**さらにラベルに `_` を2つ以上含むと、脚注変換されないまま強調変換だけが効いて文字列自体が変わる**（実測: `- 項目[^a_b_c]` → 往復後 `- 項目[^a*b*c]`。脚注定義の本文中に書いた参照も同様）。段落だけを正しくした結果、同一文書内でブロック種別により挙動が食い違う非対称が可視化された。既存の「定義リストの用語・定義本文中の`[^label]`が脚注参照として変換されない」項目と同根のため、対応時は「段落以外全般」としてまとめて扱うのが良い。`/local-review` B-2 由来（severity low〜medium） |
| todo | 脚注一覧の直列化が `querySelectorAll('li')` でネストしたリストの `<li>` まで拾う | S | `markdown.js` のSECTIONケースは `el.querySelectorAll('li')` で脚注項目を集めるため、脚注本文の中に箇条書きがあるとその `<li>` まで脚注定義として拾い、`[^]: nested` のようなゴミ行が生成される（実測で再現）。`el.querySelectorAll(':scope > ol > li')` 相当へ限定すれば直る。`/local-review` B-3 由来（severity low、既存） |

## 完了 (done)

完了した項目は [docs/roadmap-done.md](./roadmap-done.md) にまとめています。

## 見送り (blocked)

| 機能 | 理由 |
|------|------|
| シールドバッジ画像の表示（`![Version](https://img.shields.io/...)` 等をバッジとして表示） | セキュリティ上の問題。Webview の `img-src` は現状 `${webview.cspSource} data:` 等に限定されており（[markdownEditor.ts:172-177](../src/markdownEditor.ts#L172)）、外部ホスト（`https://img.shields.io`）のバッジ画像を表示するには CSP を `https:`（または対象ホスト）へ緩める必要がある。任意の外部ホストへの画像リクエストを許可するとリファラ経由の情報漏えいや任意画像の埋め込みリスクがあり、見送り |
| 素のURLをリンクカードとして表示（OGP風プレビュー） | セキュリティ上の問題。タイトル・説明・サムネイルを得るには**外部サイトへのHTTPフェッチ**（拡張機能側 `src/` からの `fetch` によるOGPタグ取得）が必須で、ファイルを開くだけでユーザーの意図しない任意の外部ホストへ通信が発生する（開いているURLの漏えい・SSRF類似のリスク）。サムネイル画像の表示も外部 `img-src` CSP を緩める必要があり、シールドバッジと同種の問題を抱えるため見送り |
