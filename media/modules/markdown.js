/**
 * markdown.js - Markdown変換モジュール
 * Markdown⇔HTML の相互変換を担当
 *
 * - markdownToHtml: 行ベースのブロックパーサー。
 *   正規表現の一括置換ではなくブロック単位で構造を組み立てるため、
 *   不正なHTML（対応しない開き/閉じタグ）を生成しない。
 *   ネストしたリスト（インデント2スペース or タブ）に対応。
 * - htmlToMarkdown: DOMウォーカーによるシリアライザ。
 *   文字列への正規表現適用ではなくDOMツリーを再帰的に辿るため、
 *   ネスト構造（リスト・強調の入れ子・テーブルセル内の装飾）を保持できる。
 */
window.MarkdownModule = (function() {
    'use strict';

    const state = window.EditorState;

    // ブロックレベル要素のタグ集合（シリアライズ時の判定に使用）
    const BLOCK_TAGS = new Set([
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'P', 'DIV', 'PRE', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'HR', 'SECTION', 'DL'
    ]);

    // 水平線（--- / *** / ___ 3文字以上の単独行）の判定
    const HR_PATTERN = /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/;

    /**
     * ゼロ幅文字を除去
     */
    function stripZeroWidth(text) {
        return text.replace(new RegExp(state.ZERO_WIDTH, 'g'), '');
    }

    /**
     * HTMLの特殊文字をエスケープ
     */
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * data-* 属性値へ埋め込むための追加エスケープ。
     * escapeHtml 済みのテキスト（`&`/`<`/`>` は変換済み）に対し、属性を閉じてしまう
     * ダブルクォートだけをさらに潰す。取り出しは getAttribute で行うため
     * `&amp;`/`&lt;`/`&gt;`/`&quot;` は自動的に元の文字へ戻る（＝生の式が復元される）。
     */
    function escapeAttr(escapedText) {
        return escapedText.replace(/"/g, '&quot;');
    }

    /**
     * ブロック数式（`$$ ... $$`）のコンテナHTMLを生成する。
     * 生の式は data-math に保持し、`htmlToMarkdown`（serializeBlockElement）で復元する。
     * 中身のレンダリングは math.js（KaTeX）が後から行うため、ここでは空のまま返す。
     * contenteditable=false でキャレットがKaTeXの生成DOM内へ入らないようにする
     * （式の編集は生Markdown表示の項目で対応予定。現状はRawモードで編集する）。
     */
    function buildMathBlockHtml(expr) {
        return '<div class="math-block" data-math="' + escapeAttr(escapeHtml(expr)) +
            '" contenteditable="false"></div>';
    }

    /**
     * 画像・リンクの丸括弧の中身（`(url "title")` の `url "title"` 部分）を
     * URLとタイトルへ分ける純粋関数。Markdown標準のタイトル記法に対応する。
     *
     * タイトルは `"…"` と `'…'` の両方を受け付け、**URLとの間に空白が必要**
     * （`a"b"` のような空白無しはURLの一部とみなす＝ファイル名に引用符を含む
     * パスを誤ってタイトル扱いしない）。閉じ引用符は文字列の末尾になければ
     * ならず、`a "b" c` のような不正な形はタイトル無しとして扱う。
     *
     * **URLの前後の空白は落とす**（`[t]( u )` → `href="u"`）。CommonMark と同じ
     * 正規化で、Markdownとしての意味は変わらないが、保存時にバイト列は変わる。
     *
     * **引用符が2組ある場合**（`(u "a" "b")`）はURL側を最短・タイトル側を最長に
     * 取るため `url="u"` / `title='a" "b'` になる。CommonMark は不正として扱うが、
     * 往復は保たれるためこの解釈を許容する。
     *
     * **既知の制約**: 呼び出し元の正規表現が `([^)]+)` で丸括弧の中身を取るため、
     * URL・タイトルのどちらにも `)` を含められない（タイトル記法の追加で
     * 生じた制約ではなく、リンク・画像記法に元からある制約）。CommonMarkの
     * `(…)` 形式のタイトルも、この `)` 制約と両立しないため非対応。
     *
     * @param {string} dest 丸括弧の中身
     * @returns {{url: string, title: string|null}} タイトルが無ければ title は null
     */
    function parseLinkDestination(dest) {
        const s = String(dest == null ? '' : dest);
        // 先頭から最短でURLを取り、空白＋引用符で囲まれた末尾をタイトルとみなす
        const m = /^([\s\S]*?)\s+(["'])([\s\S]*)\2\s*$/.exec(s);
        if (!m) {
            return { url: s.trim(), title: null };
        }
        return { url: m[1].trim(), title: m[3] };
    }

    /**
     * `title` 属性のHTML断片（` title="…"`）を組み立てる。タイトルが無ければ空文字。
     * @param {string|null} title
     * @param {function(string): string} escape 属性値へ埋め込む際のエスケープ関数
     */
    function buildTitleAttr(title, escape) {
        return title === null ? '' : ' title="' + escape(title) + '"';
    }

    /**
     * インラインMarkdown記法をHTMLへ変換（エスケープ済みテキストに適用）
     * commands.jsのライブ変換（convertInlineText）と同じ記法をサポートする
     */
    function convertInline(escapedText, footnoteLabels) {
        // インラインコードを最初にプレースホルダ（NUL文字で囲んだ通し番号）へ退避し、
        // コード内の文字列に他のインライン整形（リンク・強調・取り消し線など）が
        // 適用されて `<code>**太字**</code>` が `<code><strong>太字</strong></code>`
        // へ化けるのを防ぐ。整形完了後に復元する。NUL文字と数字だけのプレースホルダは
        // 記法文字（*, _, ~, +, [）を含まないため後続の置換に一切マッチしない。
        const codeSpans = [];
        let html = escapedText.replace(/`([^`]+)`/g, function (_m, p1) {
            codeSpans.push(p1);
            return '\u0000' + (codeSpans.length - 1) + '\u0000';
        });

        // エスケープされたドル記号（\$）を退避する。素の $ は数式の開始として扱うため、
        // 通常のドル記号（$100 など）を書きたい場合は \$100 と書く仕様。
        // 先に退避しておくことで \$ が数式の区切りとして拾われるのを防ぐ。
        // 復元はゼロ幅スペース付きの `$`（$ + ZERO_WIDTH）で行い、DOM上でも
        // 「エスケープ由来の $」と素の `$` を区別できるようにする。これが無いと、
        // 同じテキストノードに \$ が2つ以上あるとき、編集時の再変換
        // （commands.js の convertInlineText）が `$…$` をインライン数式に
        // 変換してしまい、書き戻しでバックスラッシュが失われる。
        // ゼロ幅スペースは直列化（serializeInline の stripZeroWidth）で取り除かれ、
        // `$` は `\$` へ再エスケープされるため、往復でファイルは変わらない。
        const escapedDollars = [];
        html = html.replace(/\\\$/g, function () {
            escapedDollars.push('$' + state.ZERO_WIDTH);
            return '\u0001' + (escapedDollars.length - 1) + '\u0001';
        });

        // インライン数式（$...$）。中身は data-math に生のまま保持し、要素ごと
        // プレースホルダへ退避する。退避しないと `$\alpha^*$` の `*` が斜体に、
        // `$a_1$` の `_` が強調に化けてしまう（インラインコード退避と同じ方針）。
        // 実際のレンダリングは math.js（KaTeX）が data-math を読んで後から行う。
        const mathSpans = [];
        // 属性値（URL・タイトル・alt）へ戻すための元のMarkdownテキストも控える
        const mathSources = [];
        html = html.replace(/\$([^$\n]+)\$/g, function (m, expr) {
            mathSpans.push('<span class="math-inline" data-math="' + escapeAttr(expr) +
                '" contenteditable="false"></span>');
            mathSources.push(m);
            return '\u0002' + (mathSpans.length - 1) + '\u0002';
        });

        /**
         * 画像・リンクの**属性になる部分**（URL・タイトル・alt）に紛れ込んだ
         * コード・数式・`\$` のプレースホルダを、元のMarkdownテキストへ戻す。
         *
         * これらの退避は画像・リンクより**前**に行われ、復元は**後**に行われるため、
         * 戻さないとプレースホルダが属性値の中に取り込まれたまま復元され、
         * `href="http://e/a<code>b</code>c"` のように値が壊れる。数式に至っては
         * 復元される `<span class="math-inline" …>` が `"` を含むため属性値がそこで
         * 途中終了し、**タグ構造ごと壊れる**（往復結果が `["&gt;t](http://e/<span class=)`
         * のようになる）。
         *
         * 戻す先はHTMLではなく**元の記法テキスト**にする。URLやタイトルの中の
         * `` `…` `` や `$…$` は「コード」「数式」ではなく単なる文字列なので、
         * 文字どおり保つのが往復にとっても正しい。
         *
         * リンクテキスト（`[…]` の中身）はHTMLの流れに残って通常どおり復元されるため、
         * ここでは戻さない（`` [`code`](u) `` のリンクテキスト内コードは従来どおり）。
         */
        function unstashToText(s) {
            // **戻す順序は退避の逆**（数式 → コード → `\$`）にする。数式の退避は
            // コード・`\$` の退避より後に行われるため、控えている元テキストの中には
            // それらのプレースホルダが残っている。コード→数式の順で戻すと、最後に
            // 差し戻した数式ソース中のプレースホルダを誰も復元しないまま
            // 属性値へ入ってしまい、元の不具合（`href` への `<code>` 混入や、
            // コード内の `"` による属性値の早期終了＝タグ構造の破壊）が再発する。
            // 入れ子は1段しか起こらない（コードの中身と `\$` にはプレースホルダが
            // 入り得ない）ので、この順序なら単一パスで解決する。
            return String(s)
                .replace(/\u0002(\d+)\u0002/g, function (_m, i) {
                    return mathSources[Number(i)];
                })
                .replace(/\u0000(\d+)\u0000/g, function (_m, i) {
                    return '`' + codeSpans[Number(i)] + '`';
                })
                .replace(/\u0001(\d+)\u0001/g, function () {
                    return '\\$';
                });
        }

        // 画像（![alt](url)）。リンクより**先に**処理する（`![` を `!`＋リンクに
        // 割らないため）。alt は空も許容（貼り付け画像は alt 無し）。属性を閉じる
        // `"` は escapeAttr で潰す（テキストは escapeHtml 済みで `<>&` は実体参照）。
        // 生成した `<img>` はプレースホルダへ退避しておく。退避しないとURL/alt中の
        // `_`/`*`/`~`/`+` が後続の強調変換で `src="a<em>b</em>c"` のように壊れ、往復が
        // 崩れる（インラインコード・数式と同じ保護方針）。
        const imgSpans = [];
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_m, alt, dest) {
            const d = parseLinkDestination(unstashToText(dest));
            imgSpans.push('<img src="' + escapeAttr(d.url) +
                '" alt="' + escapeAttr(unstashToText(alt)) +
                '"' + buildTitleAttr(d.title, escapeAttr) + '>');
            return '' + (imgSpans.length - 1) + '';
        });

        // リンク（`(url "title")` のタイトルは title 属性へ分離する）。
        // 画像と同じ理由で**開始タグをプレースホルダへ退避する**。退避しないと
        // URL・タイトル中の `_`/`*` が後続の強調変換に拾われ、
        // `href="a<em>b</em>c"` のように属性値が壊れて往復が崩れる。
        // 画像（void要素）と違いリンクは中身を持つため、退避するのは**開始タグだけ**で、
        // テキストと `</a>` はそのまま残す（`[**太字**](url)` のようにリンクテキスト内の
        // 強調は従来どおり変換される必要があるため）。`</a>` は記法文字を含まないので
        // 強調変換に巻き込まれない。
        const linkSpans = [];
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, text, dest) {
            const d = parseLinkDestination(unstashToText(dest));
            linkSpans.push('<a href="' + escapeAttr(d.url) + '"' +
                buildTitleAttr(d.title, escapeAttr) + '>');
            return '\u0005' + (linkSpans.length - 1) + '\u0005' + text + '</a>';
        });

        // 脚注参照（[^label]）。対応する脚注定義（footnoteLabelsに含まれるラベル）が
        // 実在する場合のみ変換し、無ければリテラルテキストのまま残す
        // （未定義ラベルを誤って脚注扱いしない・呼び出し元がfootnoteLabelsを渡さない
        // 場合＝見出し・リスト等は現状この変換の対象外＝本文段落のみが対象）。
        // 直後に`:`が続くもの（`[^label]:`＝定義行の体裁。重複ラベルで無効化された
        // 定義が通常の段落へ回されたケースなど）は参照として変換しない
        // （extractFootnoteDefinitionsの参照カウント側と同じ`(?!:)`ガード）。
        // 生成した `<sup>` はプレースホルダへ退避する（commands.js の convertInlineText と
        // 同じ方針・同じ番号 4）。実HTMLのまま埋めると、ラベルが許す `_` を2つ以上
        // 含むとき（`[^a_b_c]`）に後続の強調変換が属性値まで巻き込み、
        // `data-footnote-label="a<em>b</em>c"`・`href="#fn-a<em>b</em>c"`・
        // `id="fnref-a<em>b</em>c"` に化けて脚注リンクのジャンプが壊れる
        // （脚注一覧側の `<li>` は別経路で生成されるため無事で、参照側だけがずれる）。
        const footnoteSpans = [];
        if (footnoteLabels) {
            html = html.replace(/\[\^([A-Za-z0-9_-]+)\](?!:)/g, function (match, label) {
                if (!footnoteLabels.has(label)) {
                    return match;
                }
                footnoteSpans.push('<sup class="footnote-ref" data-footnote-label="' + label + '">' +
                    '<a href="#fn-' + label + '" id="fnref-' + label + '">' + label + '</a></sup>');
                return '\u0004' + (footnoteSpans.length - 1) + '\u0004';
            });
        }

        // 下線（++text++）
        html = html.replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>');

        // 取り消し線（~~text~~）
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // 太字斜体
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');

        // 太字
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

        // 斜体
        html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
        html = html.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');

        // 退避したリンクの開始タグを復元（属性中の記法文字を強調変換から守った）
        html = html.replace(/\u0005(\d+)\u0005/g, function (_m, i) {
            return linkSpans[Number(i)];
        });

        // 退避した画像を <img> として復元（属性中の記法文字を強調変換から守った）
        html = html.replace(/(\d+)/g, function (_m, i) {
            return imgSpans[Number(i)];
        });

        // 退避した数式を復元（中身は整形しない。KaTeXでのレンダリングは math.js が行う）
        html = html.replace(/\u0002(\d+)\u0002/g, function (_m, i) {
            return mathSpans[Number(i)];
        });

        // 退避した \$ をリテラルのドル記号として復元（この時点なら数式判定は済んでいる）
        html = html.replace(/\u0001(\d+)\u0001/g, function (_m, i) {
            return escapedDollars[Number(i)];
        });

        // 退避した脚注参照を <sup> として復元。デリミタ付きなので順序には依存しないが、
        // commands.js の convertInlineText と同じ「全復元の最後（コード復元の直前）」に
        // 揃えている（ほぼ同一の2関数を並べて読むため、位置がずれていると片側だけ
        // 直す事故を招く）。
        html = html.replace(/\u0004(\d+)\u0004/g, function (_m, i) {
            return footnoteSpans[Number(i)];
        });

        // 退避したインラインコードを <code> として復元（中身は整形しない）
        html = html.replace(/\u0000(\d+)\u0000/g, function (_m, i) {
            return '<code>' + codeSpans[Number(i)] + '</code>';
        });

        return html;
    }

    /**
     * テーブル行をセル配列に分解
     * 外周パイプ由来の空要素のみ除去し、中身が空のセルは保持（列ずれ防止）。
     * エスケープされたパイプ（\|）はセル内文字として扱う。
     */
    function splitTableRow(line) {
        const ESC = '\u0000';
        const cells = line
            .replace(/\\\|/g, ESC)
            .split('|')
            .map(c => c.replace(new RegExp(ESC, 'g'), '|').trim());
        if (cells.length && cells[0] === '') {
            cells.shift();
        }
        if (cells.length && cells[cells.length - 1] === '') {
            cells.pop();
        }
        return cells;
    }

    /**
     * 表のセパレーター行（`|---|---:|` 等）を列ごとの生テキストに分解する。
     * splitTableRowと異なり各セルをtrimしない＝スペース有無・アライメントコロンの
     * 表記そのままを保持し、serializeTableで往復復元できるようにする。
     */
    function splitSeparatorRow(line) {
        let inner = line.trim();
        if (inner.startsWith('|')) {
            inner = inner.slice(1);
        }
        if (inner.endsWith('|')) {
            inner = inner.slice(0, -1);
        }
        return inner.split('|');
    }

    /**
     * コードフェンス行の判定。
     * 返り値の [1] はフェンス文字列（バッククォート3個以上）、[2] は言語指定。
     * 3個固定にしないのは、本文に ``` を含むコードブロックを
     * `serializePre` が4個以上のフェンスで囲む（`fenceLengthFor`）ため。
     */
    function matchFence(line) {
        return /^(`{3,})(\S*)\s*$/.exec(line);
    }

    /**
     * 閉じフェンス行の判定。CommonMark どおり、開きフェンス以上の長さの
     * バッククォートだけで構成された行を閉じとみなす（言語指定は付かない）。
     * これにより ``` を含む本文が4個フェンスの内側で閉じずに済む。
     */
    function isClosingFence(line, openLength) {
        const match = /^(`{3,})\s*$/.exec(line);
        return !!match && match[1].length >= openLength;
    }

    // 脚注定義行（`[^label]: 本文`）の判定。ラベルはid/href属性にそのまま使うため
    // 英数字・アンダースコア・ハイフンのみに制限する（それ以外の文字を含む見た目の
    // 定義行は通常のテキスト行として扱う＝安全側のフォールバック）。
    // `:`直後の空白（0文字以上）は第2キャプチャで独立して取り出し、往復時に
    // 元の空白数（例: `[^1]:  本文`の空白2つ）をそのまま復元できるようにする
    // （`\s?`で1文字だけ吸収し残りを本文側に混ぜていた旧実装は、本文の
    // 直列化時にtrim()され余分な空白が失われていた）。
    const FOOTNOTE_DEF_PATTERN = /^\[\^([A-Za-z0-9_-]+)\]:(\s*)(.*)$/;

    // 脚注「参照」（`[^label]`）の判定。定義行自身のラベル（`[^label]:`）と区別する
    // ため、直後に`:`が続くものは除外する（負の先読み）。
    const FOOTNOTE_REF_PATTERN = /\[\^([A-Za-z0-9_-]+)\](?!:)/g;

    /**
     * Markdownソースの行配列から脚注定義行（`[^label]: 本文`）を抜き出す。
     * **同じ文書内でそのラベルが実際に参照（`[^label]`）されている場合のみ**定義として
     * 認める。これが無いと、正規表現の説明（`[^0-9]: 数字以外にマッチ`のような普通の
     * 文章）が誤って脚注定義として剥がされてしまう（脚注機能と無関係な地の文の事故）。
     * コードフェンス（```）・ブロック数式（$$）の中は定義としても参照としても
     * 解釈しない（中で使われている記法例をうっかり実際の脚注として扱わないため）。
     * 同じラベルが複数回定義された場合は最初のものを使う。
     *
     * 確定した定義行は`contentLines`から単純に取り除く（リスト・引用・テーブルは
     * 各行自身が`- `/`>`/`|`等の記法で自己申告するため、間の行が抜けて前後が
     * 直接隣接しても元々同じブロックだった行同士が正しく結合される＝望ましい動作）。
     * ただし、用語行の直後に`: `定義行が続くかどうかだけで判定する定義リスト
     * （`scanDefListTerms`）は行の中身に自己申告的な記法が無いため、除去によって
     * 生じた「本来隣接していなかった行同士の隣接」を区別できず誤結合し得る
     * （例: `Term`\n`[^1]: 本文`\n`: Definition` で `[^1]: 本文` を除去すると
     * `Term`と`: Definition`が隣接し、無関係な定義リストとして誤結合される）。
     * そのため`seamIndices`（`contentLines`中で「直前の行との隣接性が失われている
     * 位置」の集合）を合わせて返し、`scanDefListTerms`だけがこれを参照して
     * 縫い目をまたいだ用語/定義行の結合を防ぐ。
     * `frontMatterEndIndex`（呼び出し側が`lines`自体から`parseFrontMatter`で計算した
     * front matter終端行index。無ければ-1やundefined）以下の行はコードフェンス・
     * ブロック数式と同様に生テキストとして保護し、脚注定義/参照として解釈しない
     * （front matter内に偶然`[^label]:`に一致する行があっても剥がされないように）。
     * この判定を関数内で`lines`から再計算せず引数として受け取るのは、呼び出し側
     * （`markdownToHtml`）が同じ`lines`に対して一度だけfront matter判定を行い、
     * その結果を本関数と本文パースの両方で共有するため（別々に`parseFrontMatter`を
     * 呼ぶと、本関数が返す`contentLines`＝脚注除去後の行配列に対して呼び出し側が
     * 再度判定した場合に、たまたま除去後の行が`---`で始まってしまうケースなどで
     * 判定がずれる可能性があった。/local-review指摘対応）。
     *
     * **定義同士の間にあった空行は、後続の定義の`blanksBefore`へ付け替えて
     * `contentLines`から取り除く。** 取り除かないと定義行だけが本文から消えて空行が
     * 本文側に残り、往復すると最初の定義の前へ空行が集まってしまう
     * （`\n\n[^x]: A\n\n[^y]: B` → `\n\n\n[^x]: A\n[^y]: B`）。
     * 定義の間に本文行が挟まっていても、その定義の直前に空行があれば
     * `blanksBefore` を立てる（脚注一覧側の区切りとして復元するため）。ただしこの場合
     * **本文側の空行はそのまま残す**（本文の区切りとして必要。脚注一覧は文書末尾に
     * 独立して出るため二重計上にはならない）。
     *
     * 定義の連なりが途切れた場合（次が本文行・文書末尾）は保留した空行を本文へ戻すが、
     * その定義（の連なり）が**前後の両方を空行に挟まれていた**場合は戻す空行を1つ減らす。
     * 減らさないと、定義行だけが消えて前後の空行が両方残り、本文側の空行が1つ増える
     * （`本文` / `` / `[^x]: A` / `` / `後書き` → 空行2つ）。「定義行を消すときは
     * 隣の改行も一緒に消す」という手編集と同じ結果にするための調整。
     * **後ろに空行が無い定義では減らさない**（減らすと本来必要な区切りが失われ、
     * リスト・引用・テーブルが融合したり連続空行が1つ失われる）。
     * @returns {{ defs: {label:string, sep:string, text:string, blanksBefore:number}[],
     *            labels: Set<string>, contentLines: string[], seamIndices: Set<number> }}
     */
    function extractFootnoteDefinitions(lines, frontMatterEndIndex) {
        const boundary = typeof frontMatterEndIndex === 'number' ? frontMatterEndIndex : -1;

        // 1st pass: コードフェンス/ブロック数式の中かどうかを行ごとに判定しつつ、
        // 定義行らしき行を仮判定する（まだ確定しない＝参照の有無を見てから決める）。
        const entries = [];
        // 開いているコードフェンスの長さ（0 ＝ フェンスの外）。単なる真偽のトグルにすると、
        // 本文に ``` を含む4個フェンスのブロック（`fenceLengthFor` が出力する）で
        // 内側の ``` を閉じと誤認し、以降の内外判定がすべて反転する
        let fenceLength = 0;
        let inMathBlock = false;

        lines.forEach(function (line, index) {
            if (index <= boundary) {
                entries.push({ line: line, def: null, scannable: false });
                return;
            }
            if (!inMathBlock) {
                if (fenceLength === 0) {
                    const fence = matchFence(line);
                    if (fence) {
                        fenceLength = fence[1].length;
                        entries.push({ line: line, def: null, scannable: false });
                        return;
                    }
                } else {
                    // 開きフェンス以上の長さの行だけが閉じる（内側の短い ``` は本文）
                    if (isClosingFence(line, fenceLength)) {
                        fenceLength = 0;
                    }
                    entries.push({ line: line, def: null, scannable: false });
                    return;
                }
            }
            if (fenceLength === 0 && /^\$\$\s*$/.test(line)) {
                inMathBlock = !inMathBlock;
                entries.push({ line: line, def: null, scannable: false });
                return;
            }
            if (inMathBlock) {
                entries.push({ line: line, def: null, scannable: false });
                return;
            }
            const m = FOOTNOTE_DEF_PATTERN.exec(line);
            if (m) {
                entries.push({ line: line, def: { label: m[1], sep: m[2], text: m[3] }, scannable: true });
                return;
            }
            entries.push({ line: line, def: null, scannable: true });
        });

        // 2nd pass: フェンス/数式ブロックの外側から参照ラベルを集める
        // （定義候補行は本文側＝`: `以降のテキストのみを対象にする）。
        const referencedLabels = new Set();
        entries.forEach(function (entry) {
            if (!entry.scannable) {
                return;
            }
            const text = entry.def ? entry.def.text : entry.line;
            FOOTNOTE_REF_PATTERN.lastIndex = 0;
            let m;
            while ((m = FOOTNOTE_REF_PATTERN.exec(text))) {
                referencedLabels.add(m[1]);
            }
        });

        // 3rd pass: 参照が実在する定義候補だけを本物の定義として確定する。
        // 参照が無い（＝地の文が偶然この形をしていただけ）候補は通常の行として残す。
        // 確定した定義行は削除し、直後にpushされる行の位置をseamIndicesへ記録する
        // （複数行が連続して除去されても、次に実際にpushされる1箇所だけに立てれば
        // 十分＝「その位置は直前の行と本来隣接していなかった」という情報として足りる）。
        const defs = [];
        const labels = new Set();
        const contentLines = [];
        const seamIndices = new Set();
        let pendingSeam = false;
        // 定義の直後に続く空行を保留するバッファ。次に来るのがまた定義なら
        // 「定義同士の間の空行」として定義側（blanksBefore）へ付け替え、
        // そうでなければ本文行として contentLines へ戻す。付け替えないと、
        // 定義行だけが本文から取り除かれて空行が本文側に残り、往復すると
        // 最初の定義の前へ空行が集まってしまう
        // （`\n\n[^x]: A\n\n[^y]: B` → `\n\n\n[^x]: A\n[^y]: B`）。
        let pendingBlanks = [];
        let afterDef = false;

        /**
         * 保留していた空行を本文行として戻す。
         *
         * **定義（の連なり）の直後の flush でだけ**、戻す空行を1つ減らす。定義の
         * 前後の**両方**に空行がある場合、定義行だけを取り除くと空行が2つ残って
         * 本文側の空行が1つ増えてしまうため（`本文\n\n後書き` であるべきところが
         * `本文\n\n\n後書き` になる）、定義行とその片側の空行で1つのまとまりと
         * みなす＝「定義行を消すときは隣の改行も一緒に消す」という手編集と同じ結果。
         *
         * **後ろに空行が無い定義では減らしてはいけない。** その場合は定義行を
         * 取り除いても余分な空行は生じず、逆に前の空行を消すと本来必要な区切りが
         * 失われる（リスト・引用・テーブルのブロックパーサは `seamIndices` を見ず
         * 空行だけが区切りなので、`- item1` / `` / `[^x]: A` / `- item2` の
         * ような入力で項目が融合する。連続空行の保持＝空段落も1つ失われる）。
         * `afterDef` で「この flush が定義の連なりを閉じるものか」を判定している。
         *
         * 減らすのは1つだけなので、空行が2つ以上並んでいた場合は必ず1つ以上残る
         * ＝連続空行の保持機能とは衝突しない。
         */
        function flushPendingBlanks() {
            const precededByBlank = contentLines.length > 0 &&
                /^\s*$/.test(contentLines[contentLines.length - 1]);
            if (afterDef && precededByBlank && pendingBlanks.length > 0) {
                pendingBlanks.shift();
            }
            pendingBlanks.forEach(function (line) {
                if (pendingSeam) {
                    seamIndices.add(contentLines.length);
                    pendingSeam = false;
                }
                contentLines.push(line);
            });
            pendingBlanks = [];
        }

        entries.forEach(function (entry) {
            if (entry.def && referencedLabels.has(entry.def.label) && !labels.has(entry.def.label)) {
                if (afterDef) {
                    // 直前も定義＝保留分はまるごと「定義同士の間の空行」。個数を
                    // そのまま持たせて脚注一覧の連結時に復元する（本文へは戻さない）
                    entry.def.blanksBefore = pendingBlanks.length;
                    pendingBlanks = [];
                } else {
                    // 直前は本文（または文書先頭）。定義の間に本文行が挟まっていても
                    // 「定義の前に空行があった」という書式は脚注一覧側で復元したいので
                    // blanksBefore を立てる。ただし**本文側の空行はそのまま残す**
                    // （本文の区切りとして必要。脚注一覧は文書末尾に独立して出るため
                    // 二重計上にはならない）。最初の定義の分は連結に使われず消える。
                    entry.def.blanksBefore =
                        defs.length > 0 && pendingBlanks.length > 0 ? 1 : 0;
                    // ここでの flush は定義を閉じるものではないので空行を減らさない
                    // （この分岐は afterDef === false のときだけ通り、そのとき
                    //  pendingSeam も必ず false ＝ seam は下の本文行 push 経路で
                    //  立てて同じ場所で消費されるため、ここで seam が漏れることはない）
                    flushPendingBlanks();
                }
                labels.add(entry.def.label);
                defs.push(entry.def);
                pendingSeam = true;
                afterDef = true;
                return;
            }
            if (/^\s*$/.test(entry.line)) {
                pendingBlanks.push(entry.line);
                return;
            }
            flushPendingBlanks();
            afterDef = false;
            if (pendingSeam) {
                seamIndices.add(contentLines.length);
                pendingSeam = false;
            }
            contentLines.push(entry.line);
        });
        // 文書が「定義＋空行」で終わる場合、保留したままの空行を戻す
        flushPendingBlanks();

        return { defs: defs, labels: labels, contentLines: contentLines, seamIndices: seamIndices };
    }

    /**
     * 脚注定義配列から脚注一覧セクションのHTMLを組み立てる。ラベルは
     * `FOOTNOTE_DEF_PATTERN` で既に英数字・アンダースコア・ハイフンのみに
     * 制限されているため、id/href属性へそのまま使ってよい（エスケープ不要）。
     * `:`直後の元の空白（`def.sep`。空白のみで構成されるため属性値として安全）を
     * `data-footnote-sep`へ保持し、htmlToMarkdownの直列化時に`: `固定ではなく
     * 元の空白数で復元できるようにする。
     */
    function buildFootnotesSectionHtml(defs) {
        if (!defs.length) {
            return '';
        }
        let html = '<section class="footnotes" data-footnotes="true"><ol>';
        defs.forEach(function (def) {
            // 直前の定義との間にあった空行の数（0なら属性自体を出さない＝
            // 従来生成されたHTMLとの互換も保つ）
            const blanks = def.blanksBefore ? ' data-footnote-blanks="' + def.blanksBefore + '"' : '';
            html += '<li id="fn-' + def.label + '" data-footnote-label="' + def.label +
                '" data-footnote-sep="' + def.sep + '"' + blanks + '>' +
                convertInline(escapeHtml(def.text)) +
                ' <a href="#fnref-' + def.label + '" class="footnote-backref">↩</a></li>';
        });
        html += '</ol></section>';
        return html;
    }

    /**
     * テーブル開始の判定（現在行がヘッダー行、次行がセパレーター行）
     */
    function isTableStart(line, nextLine) {
        return /^\s*\|.*\|\s*$/.test(line) &&
            nextLine !== undefined &&
            /^\s*\|[\s\-:|]+\|\s*$/.test(nextLine);
    }

    /**
     * 文書先頭のYAML front matter（`---`で始まり`---`で閉じるブロック）を検出する。
     * 文書の絶対先頭（lines[0]）にのみ有効（本文中に現れる`---`は水平線として扱う。
     * 水平線判定 HR_PATTERN と記法が重なるが、呼び出し側は`i === 0`のときだけ
     * この判定を試みるため衝突しない）。閉じの`---`が見つからない場合はfront matter
     * として扱わず null を返す（通常のブロックパースへフォールバック＝安全側）。
     * @returns {{ raw: string, endIndex: number } | null} endIndexは閉じ`---`の行index
     */
    function parseFrontMatter(lines) {
        if (!lines.length || lines[0] !== '---') {
            return null;
        }
        for (let k = 1; k < lines.length; k++) {
            if (lines[k] === '---') {
                return { raw: lines.slice(1, k).join('\n'), endIndex: k };
            }
        }
        return null;
    }

    /**
     * front matterの生YAMLテキストから折りたたみ表示用のHTMLを組み立てる。
     * YAMLはMarkdownのインライン記法（強調等）を持たないためconvertInlineは通さず、
     * escapeHtmlのみ適用する。既定は折りたたみ状態（editor.css側で`.frontmatter-body`を
     * 非表示にする）。ヘッダをクリックすると`frontmatter-expanded`クラスがトグルされる
     * （配線はcommands.js）。折りたたみ状態はUI表示のみの一時状態であり、Markdown文書の
     * 内容には影響しないため往復対象にしない（保存・再読込のたびに既定の折りたたみへ戻る）。
     * 注意: 「本文0行（`---\n---`）」と「空行1行だけ（`---\n\n---`）」はどちらも`raw`が
     * 空文字列になり区別できない。パース時に判明する行数をdata属性へ保持する案も検討したが、
     * `.frontmatter-body`はcontenteditableでユーザーが自由に編集できるため、その属性は
     * 編集直後に実際の内容と食い違う「陳腐化した値」になり、直列化時にユーザーが入力した
     * 内容そのものを誤って捨ててしまう重大なデータ消失リスクがあった（/local-review指摘）。
     * そのため実装せず、保存のたびに「空行1行だけの本文」は「本文0行」へ正規化される仕様
     * として受け入れる（実害の乏しい稀なケースであり、静的属性によるデータ消失リスクの
     * 方が明確に深刻なため）。
     */
    function buildFrontMatterHtml(raw) {
        // HTML仕様上、<pre>開始タグ直後の最初のLFトークンはパース時に無視される
        // （<textarea>も同様）。rawの先頭行が空行の場合にこの1文字が失われるのを
        // 防ぐため、常にダミーの改行を1つ先頭へ足しておく（パーサーが必ずこの分だけ
        // 食うので、rawの実際の内容には影響しない。実際に<div>へinnerHTML経由で
        // 反映される際・htmlToMarkdownでcontainer.innerHTMLへ設定する際の両方で
        // このパース仕様が働くため、常に付与しておく必要がある）。
        return '<div class="frontmatter">' +
            '<div class="frontmatter-header" contenteditable="false">' +
            '<span class="frontmatter-toggle-icon">▶</span> Front Matter' +
            '</div>' +
            '<pre class="frontmatter-body">' + '\n' + escapeHtml(raw) + '</pre>' +
            '</div>';
    }

    // 定義リストの定義行（`: 定義本文`）の判定。用語行はこの形にマッチしない
    // 通常のテキスト行という以外の制約は無い（他のブロック開始行との衝突は
    // 呼び出し側で isOtherBlockStart 等により先に弾かれている前提）。
    // `:`直後の空白（0文字以上）は第1キャプチャで独立して取り出す（脚注定義行の
    // `FOOTNOTE_DEF_PATTERN`と同じ設計）。これにより`: 定義`（空白1つ）と
    // `:   定義`（空白3つ）などの元の空白数を変換往復で保持できる。
    const DEFLIST_DEF_PATTERN = /^:(\s*)(.*)$/;

    /**
     * 定義リスト以外のブロック開始行か判定する（フェンス・見出し・引用・水平線・
     * リスト・テーブル）。`isBlockStart`から定義リスト判定を除いた部分を切り出した
     * もので、`scanDefListTerms`が用語候補を「他ブロックの開始行ではない」という
     * 条件で絞り込む際に使う（`isBlockStart`をそのまま使うと、定義リスト自身の
     * 判定が混ざり用語行を「ブロック開始＝除外対象」と誤検知して自己矛盾する）。
     */
    function isOtherBlockStart(line, nextLine) {
        if (matchFence(line)) return true;
        if (/^(#{1,6}) /.test(line)) return true;
        if (/^> ?/.test(line)) return true;
        if (HR_PATTERN.test(line)) return true;
        if (/^(\s*)([-*]|\d+\.) /.test(line)) return true;
        if (isTableStart(line, nextLine)) return true;
        return false;
    }

    /**
     * lines[i] から定義リストの「用語行の並び」を読み取る。
     * 用語候補（空行でも`:`定義行でも他ブロックの開始行でもない通常行）を
     * 連続する限り集め、直後に`: `定義行が最低1つ続く場合のみ結果を返す
     * （続かなければ定義リストではないので null＝呼び出し側は通常の段落等へ委ねる）。
     * 複数の用語行が同じ定義群を共有するケース（`Term A`\n`Term B`\n`: 定義`）に対応する。
     * `seamIndices`（`extractFootnoteDefinitions`が返す、除去された脚注定義行を
     * 挟んで前後の隣接性が失われている位置の集合）を渡すと、その縫い目をまたいで
     * 用語行を集めたり定義行を確定したりしない（無関係な行同士の誤結合防止）。
     * @returns {{ terms: string[], afterTermsIndex: number } | null}
     */
    function scanDefListTerms(lines, i, seamIndices) {
        const terms = [];
        let j = i;
        while (j < lines.length) {
            if (j > i && seamIndices && seamIndices.has(j)) {
                break;
            }
            const l = lines[j];
            if (!l.trim() || DEFLIST_DEF_PATTERN.test(l) || isOtherBlockStart(l, lines[j + 1])) {
                break;
            }
            terms.push(l);
            j++;
        }
        if (!terms.length) {
            return null;
        }
        if (seamIndices && seamIndices.has(j)) {
            return null;
        }
        if (!DEFLIST_DEF_PATTERN.test(lines[j] || '')) {
            return null;
        }
        return { terms: terms, afterTermsIndex: j };
    }

    /**
     * ブロック要素の開始行か判定（段落の継続判定に使用）
     */
    function isBlockStart(line, nextLine) {
        if (isOtherBlockStart(line, nextLine)) return true;
        if (!DEFLIST_DEF_PATTERN.test(line) && DEFLIST_DEF_PATTERN.test(nextLine || '')) return true;
        return false;
    }

    /**
     * リストアイテム配列からネストしたリストHTMLを構築
     * items: [{ level, ordered, task, checked, text }]
     * タスクアイテムはチェックボックス付きのliとして構築する。
     * チェック状態は属性（checked）で持たせ、クローン・innerHTML経由でも保持されるようにする。
     */
    function buildListHtml(items) {
        let index = 0;

        function build(level) {
            const ordered = items[index].ordered;
            const tag = ordered ? 'ol' : 'ul';
            // 箇条書きは元マーカー（`-`/`*`）を data-marker に保持して往復で復元する。
            // このリスト（同レベルの連続）の先頭アイテムのマーカーを採用する。
            const bullet = items[index].marker === '-' ? '-' : '*';
            const markerAttr = ordered ? '' : ` data-marker="${bullet}"`;
            let html = `<${tag}${markerAttr}>`;

            while (index < items.length && items[index].level >= level) {
                const item = items[index];
                if (item.task) {
                    const checkedAttr = item.checked ? ' checked' : '';
                    html += '<li class="task-list-item">' +
                        `<input type="checkbox" class="task-checkbox" contenteditable="false"${checkedAttr}> ` +
                        convertInline(escapeHtml(item.text));
                } else {
                    html += `<li>${convertInline(escapeHtml(item.text))}`;
                }
                index++;
                // 次のアイテムがより深い場合は、このliの中にネストさせる
                if (index < items.length && items[index].level > level) {
                    html += build(items[index].level);
                }
                html += '</li>';
            }

            html += `</${tag}>`;
            return html;
        }

        return items.length ? build(items[0].level) : '';
    }

    /**
     * 引用行アイテム配列からネストしたblockquote HTMLを構築
     * items: [{ level, text }]
     * 同一レベルの連続行は<br>で連結し、深いレベルは入れ子のblockquoteにする。
     */
    function buildQuoteHtml(items) {
        let index = 0;

        function build(level) {
            let html = '<blockquote>';
            let needBr = false;

            while (index < items.length && items[index].level >= level) {
                if (items[index].level > level) {
                    html += build(level + 1);
                    needBr = false;
                } else {
                    if (needBr) {
                        html += '<br>';
                    }
                    html += convertInline(escapeHtml(items[index].text));
                    needBr = true;
                    index++;
                }
            }

            return html + '</blockquote>';
        }

        return items.length ? build(items[0].level) : '';
    }

    /**
     * 定義リストアイテム配列（`scanDefListTerms`が集めたグループの並び）から
     * `<dl>` HTMLを構築する。1グループにつき用語の数だけ`<dt>`、定義の数だけ
     * `<dd>`を並べる（複数用語が定義群を共有する`Term A`/`Term B`/`: 定義`にも対応）。
     * `:`直後の元の空白（`def.sep`。空白のみで構成されるため属性値として安全）を
     * `data-def-sep`へ保持し、htmlToMarkdownの直列化時に`: `固定ではなく
     * 元の空白数で復元できるようにする（脚注定義行の`data-footnote-sep`と同じ設計）。
     * items: [{ terms: string[], defs: {sep:string, text:string}[] }]
     */
    function buildDefListHtml(items) {
        let html = '<dl>';
        items.forEach(function (item) {
            item.terms.forEach(function (term) {
                html += '<dt>' + convertInline(escapeHtml(term)) + '</dt>';
            });
            item.defs.forEach(function (def) {
                html += '<dd data-def-sep="' + def.sep + '">' +
                    convertInline(escapeHtml(def.text)) + '</dd>';
            });
        });
        html += '</dl>';
        return html;
    }

    // GitHubアラートのタイプ→表示タイトル
    const ALERT_TITLES = {
        NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important',
        WARNING: 'Warning', CAUTION: 'Caution'
    };

    /**
     * GitHubアラート（`> [!NOTE]` など）の判定とHTML生成。
     * 引用行アイテムが「全行レベル1」かつ「先頭行が `[!TYPE]` マーカーのみ」の場合だけ
     * アラート用のdivを返し、それ以外は null（通常の引用として描画させる）。
     * 対応タイプ: NOTE / TIP / IMPORTANT / WARNING / CAUTION。
     * data-alert-type にタイプを保持し、htmlToMarkdown 側で `> [!TYPE]` へ復元する。
     */
    function tryBuildAlertHtml(items) {
        if (!items.length || items[0].level !== 1) {
            return null;
        }
        const marker = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/.exec(items[0].text.trim());
        if (!marker || items.some(it => it.level !== 1)) {
            return null;
        }
        const type = marker[1];
        const bodyHtml = items.slice(1)
            .map(it => convertInline(escapeHtml(it.text)))
            .join('<br>');
        return '<div class="markdown-alert markdown-alert-' + type.toLowerCase() +
            '" data-alert-type="' + type + '">' +
            '<p class="markdown-alert-title" contenteditable="false">' + ALERT_TITLES[type] + '</p>' +
            '<div class="markdown-alert-body">' + bodyHtml + '</div>' +
            '</div>';
    }

    /**
     * 見出しテキストをアンカー用スラッグへ変換する（GitHub風）。
     * 小文字化し、文字・数字・アンダースコア・ハイフン・空白以外の記号を除去、
     * 空白はハイフンに変換する。日本語などの文字はそのまま残す。
     */
    function slugify(text) {
        return (text || '')
            .trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N}_\s-]/gu, '')
            .replace(/\s+/g, '-');
    }

    /**
     * 見出しの生Markdownテキストから、表示される可視テキストを取り出す。
     * インライン記法をHTMLへ変換してからタグを除去し、escapeHtmlで導入した
     * 実体参照を元に戻すことで、レンダリング後のheading要素のtextContent
     * （commands.jsのheadingTextが返す値）と一致させる。
     * これにより見出しに付与するidスラッグをTOCのアンカーと確実に揃える。
     */
    function headingPlainText(rawText) {
        return convertInline(escapeHtml(rawText))
            .replace(/<[^>]*>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
    }

    /**
     * 見出し配列から目次（TOC）のMarkdownを組み立てる（純粋関数）。
     * headings: [{ level, text }]
     * - 最も浅い見出しをインデント0段として相対化する
     * - 各行は `* [text](#slug)` 形式。重複スラッグには -1, -2 ... を付与
     *   （GitHubの見出しアンカー生成と同じ規則）
     * - リストマーカーは htmlToMarkdown の出力（`* `）に合わせ、往復で安定させる
     */
    function buildTocMarkdown(headings) {
        if (!headings || !headings.length) {
            return '';
        }
        const minLevel = headings.reduce((m, h) => Math.min(m, h.level), Infinity);
        const seen = {};
        const lines = headings.map(h => {
            let slug = slugify(h.text) || 'section';
            if (seen[slug] === undefined) {
                seen[slug] = 0;
            } else {
                seen[slug] += 1;
                slug = slug + '-' + seen[slug];
            }
            const indent = '  '.repeat(Math.max(0, h.level - minLevel));
            return indent + '* [' + h.text + '](#' + slug + ')';
        });
        return lines.join('\n') + '\n';
    }

    /**
     * MarkdownからHTMLへの変換（行ベースのブロックパーサー）
     */
    function markdownToHtml(markdown) {
        const src = stripZeroWidth(markdown).replace(/\r\n?/g, '\n');
        // 末尾の空行はここで落としておく（末尾の空行はhtmlToMarkdown側で常に
        // 1つの改行へ正規化され往復に影響しないが、定義行が文末近くにあると
        // 除去後に隣接する空行と連結して余分な空段落が生じるため、先に潰しておく）。
        const rawLines = src.replace(/\n+$/, '').split('\n');
        // YAML front matterの判定は元の行配列（rawLines）に対して一度だけ行い、
        // extractFootnoteDefinitions（保護対象の判定に使う）と本文パースループの
        // 両方でこの同じ結果を共有する。脚注除去後の行配列（contentLines）に対して
        // 別途再判定すると、たまたま除去後の行が`---`で始まってしまうケースなどで
        // front matterの判定がずれる可能性があるため（/local-review指摘対応）。
        const frontMatter = parseFrontMatter(rawLines);
        // 脚注定義行（`[^label]: 本文`）は通常のブロックパースの対象から外し、
        // 文書末尾の脚注一覧セクションとして別途組み立てる（末尾に集約するのは
        // 一般的な脚注表示の慣習に合わせたもの＝定義が文書中程にあった場合、
        // 保存すると末尾へ移動する。既知の仕様）。
        const footnoteInfo = extractFootnoteDefinitions(
            rawLines, frontMatter ? frontMatter.endIndex : -1
        );
        const lines = footnoteInfo.contentLines;
        const out = [];
        let i = 0;
        // 見出しidの重複を連番（-1, -2 ...）で解消する。buildTocMarkdownと同じ規則。
        const seenSlugs = {};

        while (i < lines.length) {
            const line = lines[i];

            // --- YAML front matter（文書の絶対先頭にのみ有効） ---
            if (i === 0) {
                if (frontMatter) {
                    out.push(buildFrontMatterHtml(frontMatter.raw));
                    i = frontMatter.endIndex + 1;
                    continue;
                }
            }

            // --- コードブロック ---
            const fence = matchFence(line);
            if (fence) {
                const openLength = fence[1].length;
                const language = (fence[2] || '').trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !isClosingFence(lines[i], openLength)) {
                    codeLines.push(lines[i]);
                    i++;
                }
                i++; // 閉じフェンス（無い場合は終端到達）をスキップ

                const safeClass = language.replace(/[^\w-]+/g, '');
                const classAttr = safeClass ? ` class="language-${safeClass}"` : '';
                const dataAttr = language ? ` data-lang="${language}"` : '';
                out.push(`<pre><code${classAttr}${dataAttr}>${escapeHtml(codeLines.join('\n') + '\n')}</code></pre>`);
                continue;
            }

            // --- ブロック数式（$$ ... $$） ---
            // 1行完結（`$$ x $$`）と複数行（`$$` で開いて `$$` で閉じる）の両方に対応。
            // コードブロックと同じく中身は一切インライン整形せず、生の式を data-math に持つ。
            const inlineBlockMath = /^\$\$(.+?)\$\$\s*$/.exec(line);
            if (inlineBlockMath) {
                out.push(buildMathBlockHtml(inlineBlockMath[1].trim()));
                i++;
                continue;
            }
            if (/^\$\$\s*$/.test(line)) {
                const mathLines = [];
                i++;
                while (i < lines.length && !/^\$\$\s*$/.test(lines[i])) {
                    mathLines.push(lines[i]);
                    i++;
                }
                i++; // 閉じの `$$`（無い場合は終端到達）をスキップ
                out.push(buildMathBlockHtml(mathLines.join('\n')));
                continue;
            }

            // --- 空行 ---
            // 連続する空行（2行以上）は2行目以降を空段落として保持する。
            // ブロック間の区切り1行分は直列化時にブロック自身が `\n\n` を出すため、
            // 空段落は「余分な空行」1行に対応する（空Pの直列化は `\n` 1つ）。
            // これで `a\n\n\nb` のような複数空行が往復（コピー・保存）で失われない。
            // 文書先頭の空行は従来どおり無視する。
            if (!line.trim()) {
                let run = 0;
                while (i < lines.length && !lines[i].trim()) {
                    run++;
                    i++;
                }
                if (out.length > 0) {
                    for (let k = 0; k < run - 1; k++) {
                        out.push('<p><br></p>');
                    }
                }
                continue;
            }

            // --- 水平線 ---
            if (HR_PATTERN.test(line)) {
                out.push('<hr>');
                i++;
                continue;
            }

            // --- 見出し ---
            const h = /^(#{1,6}) (.*)$/.exec(line);
            if (h) {
                const level = h[1].length;
                // TOC（buildTocMarkdown）と同一のスラッグ生成・重複連番規則でidを付与し、
                // 目次のアンカーリンク（[text](#slug)）から該当見出しへ遷移できるようにする。
                let slug = slugify(headingPlainText(h[2])) || 'section';
                if (seenSlugs[slug] === undefined) {
                    seenSlugs[slug] = 0;
                } else {
                    seenSlugs[slug] += 1;
                    slug = slug + '-' + seenSlugs[slug];
                }
                out.push(
                    `<h${level} id="${slug}"><span class="heading-hash">${h[1]} </span>` +
                    `${convertInline(escapeHtml(h[2]))}</h${level}>`
                );
                i++;
                continue;
            }

            // --- テーブル ---
            if (isTableStart(line, lines[i + 1])) {
                const headers = splitTableRow(line);
                const sepCells = splitSeparatorRow(lines[i + 1]);
                i += 2; // ヘッダー行 + セパレーター行

                const rows = [];
                while (i < lines.length && /^\s*\|/.test(lines[i]) && lines[i].trim()) {
                    rows.push(splitTableRow(lines[i]));
                    i++;
                }

                // セパレーター行の元表記（スペース有無・アライメントコロン）を
                // data-sep に保持し、serializeTableで触っていない表の書式を変えず復元する。
                // 許可文字は空白・-・:のみ（isTableStartの正規表現より）でカンマを含まないため、
                // カンマ区切りでそのままHTML属性値にできる。
                const sepAttr = sepCells.length === headers.length
                    ? ` data-sep="${sepCells.join(',')}"`
                    : '';

                let tableHtml = `<table${sepAttr}><thead><tr>`;
                headers.forEach(header => {
                    tableHtml += `<th>${convertInline(escapeHtml(header))}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
                rows.forEach(row => {
                    if (row.length > 0) {
                        tableHtml += '<tr>';
                        row.forEach(cell => {
                            tableHtml += `<td>${convertInline(escapeHtml(cell))}</td>`;
                        });
                        tableHtml += '</tr>';
                    }
                });
                tableHtml += '</tbody></table>';
                out.push(tableHtml);
                continue;
            }

            // --- 引用（ネスト対応: > > で1階層深く） ---
            if (/^> ?/.test(line)) {
                const quoteItems = [];
                while (i < lines.length && /^>/.test(lines[i])) {
                    const m = /^((?:> ?)+)(.*)$/.exec(lines[i]);
                    quoteItems.push({
                        level: (m[1].match(/>/g) || []).length,
                        text: m[2]
                    });
                    i++;
                }
                // GitHubアラート（`> [!NOTE]` 等）に該当すればアラートdivを、
                // そうでなければ通常のblockquoteを生成する。
                const alertHtml = tryBuildAlertHtml(quoteItems);
                out.push(alertHtml !== null ? alertHtml : buildQuoteHtml(quoteItems));
                continue;
            }

            // --- リスト（ネスト対応: インデント2スペース or タブで1階層） ---
            if (/^(\s*)([-*]|\d+\.) /.test(line)) {
                const items = [];
                while (i < lines.length && /^(\s*)([-*]|\d+\.) /.test(lines[i])) {
                    const m = /^(\s*)([-*]|\d+\.) (.*)$/.exec(lines[i]);
                    const indent = m[1].replace(/\t/g, '  ').length;
                    // タスクリスト記法（GFM: - [ ] / - [x]）の検出
                    const task = /^\[([ xX])\] (.*)$/.exec(m[3]);
                    items.push({
                        level: Math.floor(indent / 2),
                        ordered: /^\d+\.$/.test(m[2]),
                        // 元の箇条書きマーカー（`-` / `*`）を保持し、直列化で復元する
                        // （触っていない行の `- ` が `* ` に書き換わるのを防ぐ）。
                        marker: m[2],
                        task: task !== null,
                        checked: task !== null && task[1].toLowerCase() === 'x',
                        text: task !== null ? task[2] : m[3]
                    });
                    i++;
                }
                out.push(buildListHtml(items));
                continue;
            }

            // --- 定義リスト（Term\n: Definition ...） ---
            {
                let defScan = scanDefListTerms(lines, i, footnoteInfo.seamIndices);
                if (defScan) {
                    const items = [];
                    while (defScan) {
                        i = defScan.afterTermsIndex;
                        const defs = [];
                        // 縫い目（除去された脚注定義行の跡）をまたいで後続の`: `行を
                        // 同じ定義として取り込まない（/local-review再指摘対応）。
                        while (i < lines.length && DEFLIST_DEF_PATTERN.test(lines[i]) &&
                            !footnoteInfo.seamIndices.has(i)) {
                            const dm = DEFLIST_DEF_PATTERN.exec(lines[i]);
                            defs.push({ sep: dm[1], text: dm[2] });
                            i++;
                        }
                        items.push({ terms: defScan.terms, defs: defs });
                        // 次の用語/定義グループの開始位置自体が縫い目なら、同じ<dl>へは
                        // 続けない（外側のディスパッチループへ戻り、別の<dl>として扱う）。
                        if (footnoteInfo.seamIndices.has(i)) {
                            break;
                        }
                        defScan = scanDefListTerms(lines, i, footnoteInfo.seamIndices);
                    }
                    out.push(buildDefListHtml(items));
                    continue;
                }
            }

            // --- 段落（連続する通常行をまとめ、行内の改行は<br>） ---
            // 除去された脚注定義行を挟む「縫い目」（footnoteInfo.seamIndices）では
            // 段落を継続しない。段落は各行が自己申告的な記法を持たないため、
            // scanDefListTerms同様、縫い目をまたぐと本来隣接していなかった行を
            // 誤って同じ段落へ結合してしまう（/local-review指摘対応）。
            const paraLines = [line];
            i++;
            while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1]) &&
                !footnoteInfo.seamIndices.has(i)) {
                paraLines.push(lines[i]);
                i++;
            }
            out.push('<p>' + paraLines.map(l => convertInline(escapeHtml(l), footnoteInfo.labels)).join('<br>') + '</p>');
        }

        out.push(buildFootnotesSectionHtml(footnoteInfo.defs));

        return out.join('');
    }

    // ==================== HTML → Markdown（DOMウォーカー） ====================

    /**
     * 要素の子ノードをインラインとして直列化
     */
    function serializeInlineChildren(el) {
        let md = '';
        el.childNodes.forEach(child => {
            md += serializeInline(child);
        });
        return md;
    }

    /**
     * 生Markdown表示中の要素（`span.raw-markdown` / `div.raw-markdown`）から
     * 生のMarkdownテキストを取り出す。中身は既に生の記法テキストそのもののため、
     * `$` のエスケープは行わない（そのまま書き戻せば展開前と同一のMarkdownになる）。
     * contenteditableが改行に対して生成する `<br>` や行divは改行へ戻す
     * （ブロック数式 `$$ ... $$` の複数行編集を保つため）。
     * リンク・強調（インライン）・数式（インライン／ブロック）で共有する。
     */
    function rawMarkdownText(el) {
        let text = '';
        el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += stripZeroWidth(node.textContent);
            } else if (node.nodeName === 'BR') {
                text += '\n';
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (text && !text.endsWith('\n')) {
                    text += '\n';
                }
                text += rawMarkdownText(node);
            }
        });
        return text;
    }

    /**
     * `<a>`/`<img>` の `title` 属性を Markdown のタイトル記法（` "title"`）へ戻す。
     * 属性が無ければ空文字を返す（`parseLinkDestination` の逆変換）。
     *
     * 引用符はタイトルの中身に応じて選ぶ: `"` を含むなら `'…'`、そうでなければ
     * `"…"`。`"` と `'` の両方を含むタイトルは記法で表現できないため、
     * `"` をエスケープせずそのまま `'…'` で囲む（再パースでは末尾の `'` が
     * 閉じとして働くので往復は保たれる）。
     *
     * **`)` と改行を含むタイトルはタイトルごと捨てる**。`)` は呼び出し元の
     * 正規表現が `([^)]+)` で丸括弧の中身を取る以上表現できず、改行はリンク記法が
     * 1行内で完結する前提を壊す。どちらもそのまま出力すると再パース時に記法が
     * 途中で切れ、**リンク記法の外まで文字列が漏れて文書が壊れる**。タイトルだけを
     * 失う方が被害が小さいためこちらを選ぶ（`parseLinkDestination` 経由では
     * どちらも生じ得ず、HTMLを直接貼り付けた場合のみ到達する）。
     * @param {Element} node
     * @returns {string} ` "title"` 形式、またはタイトルが無ければ空文字
     */
    function serializeTitle(node) {
        const title = node.getAttribute && node.getAttribute('title');
        if (title === null || title === undefined || title === '') {
            return '';
        }
        if (/[)\r\n]/.test(title)) {
            return '';
        }
        const quote = title.indexOf('"') !== -1 ? "'" : '"';
        return ' ' + quote + title + quote;
    }

    /**
     * 単一ノードをインラインMarkdownへ直列化
     */
    function serializeInline(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // 素の $ は数式の開始として解釈されるため、テキストとしての $ は
            // \$ へエスケープして書き戻す（次に読み込んだとき数式に化けないように）。
            // インラインコード（CODE）・コードブロック（PRE）は textContent を
            // 直接使う別分岐のため、この置換の影響を受けない。
            return stripZeroWidth(node.textContent).replace(/\$/g, '\\$');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const tag = node.tagName;
        switch (tag) {
            case 'BR':
                return '\n';
            case 'STRONG':
            case 'B': {
                const inner = serializeInlineChildren(node);
                return inner ? `**${inner}**` : '';
            }
            case 'EM':
            case 'I': {
                const inner = serializeInlineChildren(node);
                return inner ? `*${inner}*` : '';
            }
            case 'U': {
                const inner = serializeInlineChildren(node);
                return inner ? `++${inner}++` : '';
            }
            case 'DEL':
            case 'S':
            case 'STRIKE': {
                // execCommand('strikeThrough')はブラウザによりstrike/sを生成する
                const inner = serializeInlineChildren(node);
                return inner ? `~~${inner}~~` : '';
            }
            case 'CODE': {
                const text = stripZeroWidth(node.textContent);
                return text ? `\`${text}\`` : '';
            }
            case 'A': {
                const href = node.getAttribute('href') || '';
                return `[${serializeInlineChildren(node)}](${href}${serializeTitle(node)})`;
            }
            case 'SUP': {
                // 脚注参照（<sup class="footnote-ref"><a>label</a></sup>）は
                // 中のリンクを辿らず、保持しておいたラベルから `[^label]` を復元する。
                if (node.classList && node.classList.contains('footnote-ref')) {
                    const label = node.getAttribute('data-footnote-label') || '';
                    return label ? `[^${label}]` : '';
                }
                return serializeInlineChildren(node);
            }
            case 'IMG': {
                // 画像は void 要素で子を持たない。元のパスは `data-original-src`
                // （ローカル画像表示のためsrcをwebview URIへ差し替える場合に使う）を
                // 優先し、無ければ `src` を使う。alt は属性から復元する。
                const src = node.getAttribute('data-original-src') ||
                    node.getAttribute('src') || '';
                const alt = node.getAttribute('alt') || '';
                return src ? `![${alt}](${src}${serializeTitle(node)})` : '';
            }
            case 'SPAN':
                // 生Markdown表示中のspan（リンク・強調・インライン数式の展開中）は
                // 中身の生テキストをそのまま返す（`$` もエスケープしない）。
                // これで展開の前後でMarkdownが変わらない（往復に非影響）。
                if (node.classList.contains('raw-markdown')) {
                    return rawMarkdownText(node);
                }
                // インライン数式は data-math の生の式から `$...$` を復元する
                // （KaTeXがレンダリングしたDOMではなく、保持した元の式が唯一の正）
                if (node.classList.contains('math-inline')) {
                    return '$' + (node.getAttribute('data-math') || '') + '$';
                }
                // 見出しの#マーク表示用スパンは見出しシリアライズ側で再生成する
                if (node.classList.contains('heading-hash')) {
                    return '';
                }
                return serializeInlineChildren(node);
            default:
                // ブロック要素が紛れ込んでいた場合はブロックとして処理
                if (BLOCK_TAGS.has(tag)) {
                    return serializeBlockElement(node);
                }
                return serializeInlineChildren(node);
        }
    }

    /**
     * コード本文を囲むのに安全なバッククォートの数を返す。
     * 本文自体が ``` を含む場合（Markdownの書き方を説明するコード片など）、
     * 3個固定で囲むとそこでフェンスが閉じてしまい往復が壊れるため、
     * **閉じフェンスになり得る行の最長バッククォート連続数 +1**（最低3）で囲む。
     *
     * 数えるのは「バッククォートだけの行」に限る（先頭スペースはCommonMarkが
     * 許す3個まで見る）——`isClosingFence` と同じ条件。行中の ``` （`const md = "```";`
     * など）はどのCommonMark実装でもフェンスを閉じないので、数えると
     * 無意味にフェンスが伸びて差分ノイズになるだけ。
     */
    function fenceLengthFor(body) {
        let longest = 0;
        body.split('\n').forEach(function (line) {
            const match = /^ {0,3}(`+)\s*$/.exec(line);
            if (match) {
                longest = Math.max(longest, match[1].length);
            }
        });
        return Math.max(3, longest + 1);
    }

    /**
     * pre要素をコードフェンスへ直列化
     */
    function serializePre(pre) {
        const code = pre.querySelector('code');
        const target = code || pre;

        let language = '';
        if (code) {
            language = code.getAttribute('data-lang') ||
                ((/(?:^|\s)language-([\w-]+)/.exec(code.className) || [])[1] || '');
        }

        // highlight.jsの装飾spanはtextContentで自動的に剥がれる
        let body = stripZeroWidth(target.textContent || '');
        if (!body.endsWith('\n')) {
            body += '\n';
        }
        const fence = '`'.repeat(fenceLengthFor(body));
        return `${fence}${language}\n${body}${fence}\n\n`;
    }

    /**
     * ul/ol要素をネスト対応でMarkdownリストへ直列化
     */
    function serializeList(listEl, depth) {
        const ordered = listEl.tagName === 'OL';
        // 箇条書きマーカーは data-marker（読込時に保持した元マーカー）を尊重する。
        // 無い（新規入力・execCommand 生成の ul）／不正値なら従来どおり `*`。
        const rawMarker = listEl.getAttribute && listEl.getAttribute('data-marker');
        const bullet = (rawMarker === '-' || rawMarker === '*') ? rawMarker : '*';
        let md = '';
        let index = 1;

        Array.from(listEl.children).forEach(li => {
            if (li.tagName !== 'LI') {
                return;
            }

            // li直下のインライン内容と、ネストしたリスト・タスクチェックボックスを分離
            let text = '';
            const nestedLists = [];
            let checkbox = null;
            li.childNodes.forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE &&
                    (child.tagName === 'UL' || child.tagName === 'OL')) {
                    nestedLists.push(child);
                } else if (child.nodeType === Node.ELEMENT_NODE &&
                    child.tagName === 'INPUT' &&
                    child.getAttribute('type') === 'checkbox') {
                    checkbox = child;
                } else {
                    text += serializeInline(child);
                }
            });

            // チェック状態は属性を優先（クローン・innerHTML経由ではプロパティが失われるため）
            let taskPrefix = '';
            if (checkbox) {
                const checked = checkbox.hasAttribute('checked') || checkbox.checked;
                taskPrefix = checked ? '[x] ' : '[ ] ';
            }

            const marker = ordered ? `${index++}. ` : (bullet + ' ');
            md += '  '.repeat(depth) + marker + taskPrefix + text.replace(/\n+/g, ' ').trim() + '\n';

            nestedLists.forEach(nested => {
                md += serializeList(nested, depth + 1);
            });
        });

        return md;
    }

    /**
     * blockquote要素の内容を行の配列へ直列化（ネスト対応）
     * 返す行はこのblockquote内での相対表現（ネストした引用は既に「> 」プレフィックス付き）。
     */
    function serializeBlockquoteLines(el) {
        const lines = [];
        let buffer = '';

        const flush = () => {
            const text = buffer.replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '');
            if (text.trim()) {
                text.split('\n').forEach(l => lines.push(l.trim()));
            }
            buffer = '';
        };

        el.childNodes.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'BLOCKQUOTE') {
                flush();
                serializeBlockquoteLines(child).forEach(l => lines.push('> ' + l));
            } else {
                buffer += serializeInline(child);
            }
        });
        flush();

        return lines;
    }

    /**
     * GitHubアラートのdiv（.markdown-alert）を `> [!TYPE]` 形式の引用へ直列化する。
     * data-alert-type からタイプを取り、本文（.markdown-alert-body）の各行を
     * `> ` プレフィックスで連ねる。空行は落とす（buildQuoteHtml/serializeBlockquoteLines
     * と同じ扱い）。これにより `> [!NOTE]\n> 本文` へ往復する。
     */
    function serializeAlert(el) {
        const type = (el.getAttribute('data-alert-type') || 'NOTE').toUpperCase();
        const lines = ['> [!' + type + ']'];
        const body = el.querySelector('.markdown-alert-body');
        if (body) {
            serializeInlineChildren(body).split('\n').forEach(l => {
                const t = l.trim();
                if (t) {
                    lines.push('> ' + t);
                }
            });
        }
        return lines.join('\n') + '\n\n';
    }

    // 列を追加したときにセパレーター行へ入れる既定の表記。`sepCells.join('|')` を
    // `|…|` で挟むと `| --- |` になり、serializeTable のフォールバック書式と一致する。
    const DEFAULT_SEP_CELL = ' --- ';

    /**
     * `data-sep`（表のセパレーター行の元表記をカンマ区切りで保持したもの）へ
     * 新しい列を挿入したときの属性値を組み立てる純粋関数。
     *
     * 列の追加・削除で `data-sep` を更新しないと、列数がヘッダーと食い違って
     * `serializeTable` が全列をデフォルト書式へフォールバックさせるため、
     * **触っていない列のアライメント（`:---` 等）や空白の有無まで失われる**。
     *
     * 属性が無い場合や、現在の列数と食い違っている（＝既に陳腐化している）場合は
     * `null` を返して**更新しない**。陳腐化した値を splice すると、偶然列数が
     * 一致してしまい誤った書式が復元されるおそれがあるため。
     *
     * 範囲外の index も `null` を返して更新しない（`removeSepColumn` と同じ方針）。
     * 黙ってクランプすると、DOM 側の挿入位置とずれた場合に**列数だけは一致して
     * しまい**、アライメントが1列ずれた表がそのまま書き出される（サイレントな
     * データ破損）。更新しなければ列数不一致でデフォルト書式へフォールバックする
     * だけなので、そちらが安全側。
     *
     * @param {string|null} rawSep 現在の `data-sep` 属性値
     * @param {number} index 挿入位置（0〜現在の列数。末尾への追加は列数と等しい）
     * @param {number} currentColumnCount 挿入前の列数
     * @returns {string|null} 新しい属性値。更新すべきでなければ null
     */
    function insertSepColumn(rawSep, index, currentColumnCount) {
        const cells = splitSepAttr(rawSep, currentColumnCount);
        if (!cells || index < 0 || index > cells.length) {
            return null;
        }
        cells.splice(index, 0, DEFAULT_SEP_CELL);
        return cells.join(',');
    }

    /**
     * `data-sep` から指定位置の列を取り除いた属性値を組み立てる純粋関数。
     * 更新すべきでない場合（属性が無い・列数が食い違う・indexが範囲外）は null。
     * @param {string|null} rawSep 現在の `data-sep` 属性値
     * @param {number} index 削除する列のindex
     * @param {number} currentColumnCount 削除前の列数
     * @returns {string|null} 新しい属性値。更新すべきでなければ null
     */
    function removeSepColumn(rawSep, index, currentColumnCount) {
        const cells = splitSepAttr(rawSep, currentColumnCount);
        if (!cells || index < 0 || index >= cells.length) {
            return null;
        }
        cells.splice(index, 1);
        return cells.join(',');
    }

    /**
     * `data-sep` を列ごとの配列へ分解する。属性が無い、または現在の列数と
     * 食い違う場合は null（呼び出し側は更新しない＝従来どおりフォールバックする）。
     */
    function splitSepAttr(rawSep, expectedLength) {
        if (typeof rawSep !== 'string' || rawSep === '') {
            return null;
        }
        const cells = rawSep.split(',');
        return cells.length === expectedLength ? cells : null;
    }

    /**
     * table要素をMarkdownテーブルへ直列化
     * セル内のインライン装飾（太字・リンク等）も保持する
     */
    function serializeTable(table) {
        const escapeCell = (text) => text.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
        const cellsOf = (tr) => Array.from(tr.children)
            .filter(c => c.tagName === 'TH' || c.tagName === 'TD')
            .map(c => escapeCell(serializeInlineChildren(c)));

        const theadRow = table.querySelector('thead tr');
        let bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        if (!bodyRows.length) {
            bodyRows = Array.from(table.querySelectorAll('tr')).filter(r => r !== theadRow);
        }

        let headers;
        if (theadRow) {
            headers = cellsOf(theadRow);
        } else if (bodyRows.length) {
            headers = cellsOf(bodyRows.shift());
        } else {
            return '';
        }

        if (!headers.length) {
            return '';
        }

        let md = '| ' + headers.join(' | ') + ' |\n';
        // 読込時に保持したセパレーター行の元表記（data-sep）があり、かつ列数が
        // 変わっていなければそれをそのまま復元する（触っていない表の書式を壊さない）。
        // 列数が変わっている場合（列の追加・削除）はデフォルト書式にフォールバックする。
        const rawSep = table.getAttribute && table.getAttribute('data-sep');
        const sepCells = rawSep ? rawSep.split(',') : null;
        if (sepCells && sepCells.length === headers.length) {
            md += '|' + sepCells.join('|') + '|\n';
        } else {
            md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
        }
        bodyRows.forEach(tr => {
            const cells = cellsOf(tr);
            if (cells.length) {
                md += '| ' + cells.join(' | ') + ' |\n';
            }
        });

        return md + '\n';
    }

    /**
     * ブロック要素をMarkdownへ直列化
     */
    function serializeBlockElement(el) {
        switch (el.tagName) {
            case 'H1':
            case 'H2':
            case 'H3':
            case 'H4':
            case 'H5':
            case 'H6': {
                const level = Number(el.tagName[1]);
                let text = '';
                el.childNodes.forEach(child => {
                    // #マーク表示用スパンは除外（マークはここで再生成）
                    if (child.nodeType === Node.ELEMENT_NODE &&
                        child.classList &&
                        child.classList.contains('heading-hash')) {
                        return;
                    }
                    text += serializeInline(child);
                });
                return '#'.repeat(level) + ' ' + text.trim() + '\n\n';
            }
            case 'P': {
                const inner = serializeInlineChildren(el).replace(/\n+$/, '');
                return inner.trim() ? inner + '\n\n' : '\n';
            }
            case 'DIV': {
                // 生Markdown表示中のブロック（ブロック数式 `$$ ... $$` の展開中）は
                // 中身の生テキストをそのまま返す（`$` もエスケープしない）。
                if (el.classList && el.classList.contains('raw-markdown')) {
                    const raw = rawMarkdownText(el);
                    return raw.trim() ? raw + '\n\n' : '';
                }
                // GitHubアラートのdivは `> [!TYPE]` 形式の引用へ復元
                if (el.classList && el.classList.contains('markdown-alert')) {
                    return serializeAlert(el);
                }
                // ブロック数式は data-math の生の式から `$$ ... $$` を復元
                if (el.classList && el.classList.contains('math-block')) {
                    return '$$\n' + (el.getAttribute('data-math') || '') + '\n$$\n\n';
                }
                // YAML front matterは`.frontmatter-body`（<pre>、textContentがそのまま
                // 生YAML）から`---\n...\n---`を復元する。折りたたみ状態（UI表示のみ）は
                // 復元に含めない。「本文0行」と「空行1行だけ」はどちらも`raw`が空文字列に
                // なり区別できないが、後者は前者へ正規化される仕様として受け入れる
                // （`buildFrontMatterHtml`のコメント参照。パース時の行数をdata属性へ
                // 保持する案は、contenteditableな本文を編集すると属性が陳腐化しユーザーの
                // 入力内容を誤って捨てるデータ消失リスクがあるため見送った）。
                if (el.classList && el.classList.contains('frontmatter')) {
                    const body = el.querySelector('.frontmatter-body');
                    const raw = body ? stripZeroWidth(body.textContent || '') : '';
                    return raw ? ('---\n' + raw + '\n---\n\n') : '---\n---\n\n';
                }
                // ブロック子要素を含む場合はコンテナとして再帰
                const hasBlockChild = Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName));
                if (hasBlockChild) {
                    return serializeBlocks(el);
                }
                // contenteditableが生成する行単位のdiv
                const inner = serializeInlineChildren(el);
                return inner.trim() ? inner + '\n' : '\n';
            }
            case 'PRE':
                return serializePre(el);
            case 'UL':
            case 'OL':
                return serializeList(el, 0) + '\n';
            case 'BLOCKQUOTE': {
                const lines = serializeBlockquoteLines(el);
                if (!lines.length) {
                    return '';
                }
                return lines.map(l => '> ' + l).join('\n') + '\n\n';
            }
            case 'TABLE':
                return serializeTable(el);
            case 'HR':
                return '---\n\n';
            case 'DL': {
                // 定義リスト（<dt>用語</dt><dd>定義</dd>...）を`Term`/`: 定義`の並びへ復元する。
                // 子要素の出現順をそのまま辿るだけで、複数用語が定義群を共有するケース
                // （<dt><dt><dd>）も自然に処理できる。
                const lines = [];
                Array.from(el.children).forEach(child => {
                    const text = serializeInlineChildren(child).trim();
                    if (child.tagName === 'DT') {
                        lines.push(text);
                    } else if (child.tagName === 'DD') {
                        // `:`直後の元の空白を復元する（属性が無い＝この機能追加前に生成された
                        // HTML等の場合は従来どおり半角スペース1つへフォールバック）。
                        const sepAttr = child.getAttribute('data-def-sep');
                        const sep = sepAttr === null ? ' ' : sepAttr;
                        lines.push(':' + sep + text);
                    }
                });
                return lines.length ? lines.join('\n') + '\n\n' : '';
            }
            case 'SECTION': {
                // 脚注一覧セクション（<section class="footnotes"><ol><li>…</li></ol></section>）
                // を `[^label]: 本文` の並びへ復元する。それ以外のsectionはブロックコンテナとして再帰。
                if (!el.classList || !el.classList.contains('footnotes')) {
                    return serializeBlocks(el);
                }
                const items = Array.from(el.querySelectorAll('li'));
                if (!items.length) {
                    return '';
                }
                // 定義同士の間の空行数（data-footnote-blanks）を復元する。
                // 属性が無い＝この対応より前に生成されたHTML等は0（空行なし）扱い。
                // 外部由来のHTMLを貼り付けられた場合に備えて上限をクランプする
                // （巨大値だと String.repeat が RangeError を投げ、保存経路である
                // htmlToMarkdown ごと落ちるため）。実際に書ける空行数として十分な範囲。
                const blanksBefore = items.map(li => {
                    const raw = parseInt(li.getAttribute('data-footnote-blanks') || '0', 10);
                    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 0;
                });
                const lines = items.map(li => {
                    const label = li.getAttribute('data-footnote-label') || '';
                    // `:`直後の元の空白を復元する（属性が無い＝この機能追加前に生成された
                    // HTML等の場合は従来どおり半角スペース1つへフォールバック）。
                    const sepAttr = li.getAttribute('data-footnote-sep');
                    const sep = sepAttr === null ? ' ' : sepAttr;
                    // 脚注本文の直列化時は戻りリンク（↩）を除いてから行う
                    const clone = li.cloneNode(true);
                    const backref = clone.querySelector('.footnote-backref');
                    if (backref) {
                        backref.remove();
                    }
                    const text = serializeInlineChildren(clone).trim();
                    return `[^${label}]:${sep}${text}`;
                });
                // 定義同士は改行1つで連結し、間にあった空行の数だけ改行を足す
                return lines
                    .map((line, idx) => (idx === 0 ? '' : '\n'.repeat(blanksBefore[idx])) + line)
                    .join('\n') + '\n\n';
            }
            default:
                return serializeInlineChildren(el);
        }
    }

    /**
     * コンテナ配下のノード列をブロック単位でMarkdownへ直列化
     * ブロック要素の間に挟まったインラインノード（テキスト・br等）は段落として扱う
     */
    function serializeBlocks(root) {
        let md = '';
        let inlineBuffer = '';

        const flush = () => {
            const text = inlineBuffer.replace(/^\n+|\n+$/g, '');
            if (text.trim()) {
                md += text + '\n\n';
            }
            inlineBuffer = '';
        };

        root.childNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName)) {
                flush();
                md += serializeBlockElement(node);
            } else {
                inlineBuffer += serializeInline(node);
            }
        });
        flush();

        return md;
    }

    /**
     * HTMLからMarkdownへの変換（DOMウォーカー）
     */
    function htmlToMarkdown(html) {
        const container = document.createElement('div');
        container.innerHTML = html;

        let markdown = serializeBlocks(container);

        // ノーブレークスペースを通常スペースへ
        markdown = markdown.replace(/\u00a0/g, ' ');

        // 先頭の空行を削除、末尾は改行1つに揃える
        // （かつてはここで `\n{3,}` を `\n\n` に潰していたが、空段落＝意図的な
        //   連続空行を保持するため行わない。空Pは `\n` 1つに直列化され、
        //   ブロック区切りの `\n\n` と合わさって空行1行分として現れる）
        markdown = markdown.replace(/^\n+/, '');
        if (!markdown.trim()) {
            return '';
        }
        markdown = markdown.replace(/\n*$/, '\n');

        return markdown;
    }

    /**
     * ブロックの直列化文字列から、前後の空行だけを取り除いた「本文行の配列」を返す。
     * 各ブロックは末尾に `\n\n` を付けて直列化されるため、その空行を落として
     * 実際に本文が占める行だけにする。全て空なら空配列（＝行を占めないブロック）。
     */
    function coreLinesOf(blockMarkdown) {
        const lines = (blockMarkdown || '').replace(/\r\n?/g, '\n').split('\n');
        let start = 0;
        let end = lines.length;
        while (start < end && lines[start].trim() === '') {
            start++;
        }
        while (end > start && lines[end - 1].trim() === '') {
            end--;
        }
        return lines.slice(start, end);
    }

    /**
     * WYSIWYGの各トップレベルブロックが、Markdownソースの何行目から始まるかを求める
     * （行番号表示 2/3 の中核。純粋関数＝DOM非依存でユニットテスト可能）。
     *
     * `finalMarkdown` は `htmlToMarkdown` が出力した確定ソース（唯一の変換規則）、
     * `blockMarkdowns` は各トップレベルブロックを `serializeBlockElement` で直列化した
     * 文字列の配列（`finalMarkdown` と同じ順序）。
     *
     * 各ブロックの本文行は `finalMarkdown` 内に順番どおり連続して現れるため、
     * 直前に確定した位置（cursor）から前方一致で探して開始行を確定する。こうすることで
     * ブロック間の空行の畳み込み（`\n{3,}`→`\n\n`）や先頭空行の除去に依存せず、
     * 同一本文が複数あっても順序で正しく対応づく。
     *
     * 戻り値は各ブロックの1始まりの開始行番号の配列。本文を持たない
     * （空段落など、ソース上に行を占めない）ブロックは `null`。
     */
    function computeBlockStartLines(finalMarkdown, blockMarkdowns) {
        const docLines = (finalMarkdown || '').replace(/\r\n?/g, '\n').split('\n');
        const starts = [];
        let cursor = 0; // 次に探索を始める行インデックス（0始まり）

        (blockMarkdowns || []).forEach(function (blockMd) {
            const core = coreLinesOf(blockMd);
            if (core.length === 0) {
                starts.push(null);
                return;
            }
            // cursor 以降で本文先頭行に一致する行を探す
            let found = -1;
            for (let i = cursor; i < docLines.length; i++) {
                if (docLines[i] === core[0]) {
                    found = i;
                    break;
                }
            }
            if (found === -1) {
                // 想定外（入力が不整合）: 行番号を付けずに次へ
                starts.push(null);
                return;
            }
            starts.push(found + 1); // 1始まり
            cursor = found + core.length; // 本文行数だけ進める（間の空行は次回スキップ）
        });

        return starts;
    }

    /**
     * テーブルHTML（innerHTML文字列）をMarkdownに変換するヘルパー関数
     */
    function convertTableToMarkdown(tableContent) {
        const tmp = document.createElement('table');
        tmp.innerHTML = tableContent;
        return serializeTable(tmp);
    }

    /**
     * エディタDOM（またはそれ相当の要素）をクローンし、UI要素を除去して
     * 隠されたソースを復元した「クリーンなクローン要素」を返す。
     * `getCleanHtmlFromEditor`（文書への直列化）と `computeEditorLineMap`
     * （行番号の対応付け）が同じクリーン結果を共有するために切り出した。
     * トップレベルの子要素数は、Mermaid（隠し `pre.mermaid-source` を残し
     * `.mermaid-container` を削除）とテーブル（`.table-container` を `table` へ
     * アンラップ）を経ても「表示中のライブ要素列」と1対1で対応する。
     */
    function getCleanEditorClone(editorEl) {
        const source = editorEl || state.editor;
        // エディタのDOMをクローン
        const clone = source.cloneNode(true);

        // 検索ハイライトのspanをアンラップ（中身のテキストは残す）
        clone.querySelectorAll('span.find-highlight').forEach(span => {
            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            parent.removeChild(span);
        });

        // Mermaid: 隠されているソースブロックを復元し、UIコンテナを削除
        clone.querySelectorAll('pre.mermaid-source').forEach(pre => {
            const diagramId = pre.getAttribute('data-mermaid-id');

            // 元のエディタから編集中のtextareaの値を取得
            const originalContainer = source.querySelector(`.mermaid-container[data-mermaid-id="${diagramId}"]`);
            if (originalContainer) {
                const textarea = originalContainer.querySelector('.mermaid-source-code');
                if (textarea && textarea.value) {
                    const codeElement = pre.querySelector('code');
                    if (codeElement) {
                        codeElement.textContent = textarea.value;
                    }
                }
            }

            // クローン内のコンテナを削除
            const cloneContainer = pre.nextElementSibling;
            if (cloneContainer && cloneContainer.classList.contains('mermaid-container')) {
                cloneContainer.remove();
            }

            // ソースブロックを表示状態に戻す
            pre.style.display = '';
            pre.classList.remove('mermaid-source');
            pre.removeAttribute('data-mermaid-id');
        });

        // Mermaidコンテナが残っていれば削除
        clone.querySelectorAll('.mermaid-container').forEach(el => el.remove());

        // コードブロックのUI（言語セレクタ・コピーボタン）を削除
        clone.querySelectorAll('.code-block-toolbar').forEach(el => el.remove());
        clone.querySelectorAll('.code-lang-selector').forEach(el => el.remove());

        // テーブル: ツールバーとボタンを削除
        clone.querySelectorAll('.table-toolbar').forEach(el => el.remove());
        clone.querySelectorAll('.table-container button').forEach(el => el.remove());

        // すべてのボタン要素を削除
        clone.querySelectorAll('button').forEach(el => el.remove());

        // テーブルセルのcontenteditable属性を削除
        clone.querySelectorAll('[contenteditable]').forEach(el => {
            el.removeAttribute('contenteditable');
        });

        // テーブルコンテナをアンラップ
        clone.querySelectorAll('.table-container').forEach(container => {
            const table = container.querySelector('table');
            if (table) {
                container.replaceWith(table);
            }
        });

        return clone;
    }

    /**
     * エディタDOMからクリーンなHTMLを取得（UI要素を除去し、隠されたソースを復元）
     */
    function getCleanHtmlFromEditor() {
        return getCleanEditorClone(state.editor).innerHTML;
    }

    /**
     * WYSIWYGエディタの「表示中のトップレベルブロック」と、それが対応する
     * Markdownソースの開始行番号（1始まり）を対応づける（行番号表示 3/3 の橋渡し）。
     *
     * クリーンなクローン（`getCleanEditorClone`）からソース全体（`finalMarkdown`）と
     * 各ブロックの直列化を得て `computeBlockStartLines` で開始行を求め、それを
     * 「表示中のライブ要素列」（Mermaidの隠し `pre.mermaid-source` を除外）と
     * インデックスで対応づける。クリーンのトップレベル数と表示中ライブ要素数は
     * 常に一致する（Mermaidの隠しpre↔可視コンテナ、テーブルのアンラップを経ても）。
     *
     * 戻り値は `{ block: ライブ要素, line: 開始行 }` の配列（本文を持たない
     * ブロック＝開始行 null は除外）。ガター描画（次段）が各 block の `offsetTop` に
     * 行番号を置くために使う。DOMのみで完結しレイアウト非依存＝ユニットテスト可能。
     */
    function computeEditorLineMap(editorEl) {
        const source = editorEl || state.editor;
        if (!source) {
            return [];
        }
        const clone = getCleanEditorClone(source);
        const finalMarkdown = htmlToMarkdown(clone.innerHTML);

        const cleanBlocks = Array.prototype.slice.call(clone.children);
        const blockMarkdowns = cleanBlocks.map(function (c) {
            return htmlToMarkdown(c.outerHTML);
        });
        const startLines = computeBlockStartLines(finalMarkdown, blockMarkdowns);

        // 位置決め対象は「表示中の」ライブ要素（Mermaidの隠しソースpreは除外）
        const liveVisible = Array.prototype.slice.call(source.children).filter(function (el) {
            return !(el.classList && el.classList.contains('mermaid-source'));
        });

        const map = [];
        startLines.forEach(function (line, i) {
            if (line === null) {
                return;
            }
            const block = liveVisible[i];
            if (block) {
                map.push({ block: block, line: line });
            }
        });
        return map;
    }

    /**
     * `<img src>` がローカル相対パス（webview のベースURIで解決すべきもの）か判定する
     * 純粋関数。スキーム付きURL（`http:`/`https:`/`data:`/`blob:`/`vscode-webview:` 等）・
     * プロトコル相対（`//host`）・ルート絶対（`/foo`）は解決しない（false）。
     * 解決済み（asWebviewUri でスキームが付いた）srcも scheme 判定で false になる。
     * @param {string} src
     * @returns {boolean}
     */
    function isResolvableRelativeImageSrc(src) {
        if (!src || typeof src !== 'string') {
            return false;
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
            return false; // scheme: 付き（http:/data:/vscode-webview: など）
        }
        if (src.indexOf('//') === 0) {
            return false; // プロトコル相対 //host/…
        }
        if (src.indexOf('/') === 0) {
            return false; // ルート絶対 /foo（基準が曖昧なので触らない）
        }
        return true;
    }

    /**
     * ローカル相対パスの画像srcを、webview のベースURI（ドキュメントフォルダの
     * webview URI）と結合して解決する純粋関数。先頭の `./` は除去する。
     * `../` を含む相対はブラウザのURL正規化に委ねる（文字列結合のみ）。
     * @param {string} baseUri 末尾スラッシュ有無を問わないベースURI
     * @param {string} src 相対パス
     * @returns {string} 解決後のURL（baseUri が空なら src のまま）
     */
    function resolveImageSrc(baseUri, src) {
        if (!baseUri) {
            return src;
        }
        const base = String(baseUri).replace(/\/+$/, '');
        // 先頭 ./ を除去し、URLとして誤解釈される `#`（フラグメント）・`?`（クエリ）を
        // エンコードする。既に %20 等が入っている可能性があるため `%` はエンコードしない
        // （二重エンコード回避）。
        const rel = String(src)
            .replace(/^\.\//, '')
            .replace(/#/g, '%23')
            .replace(/\?/g, '%3F');
        return base + '/' + rel;
    }

    // 公開API
    return {
        markdownToHtml: markdownToHtml,
        htmlToMarkdown: htmlToMarkdown,
        isResolvableRelativeImageSrc: isResolvableRelativeImageSrc,
        resolveImageSrc: resolveImageSrc,
        // 生Markdown表示（commands.syncRawMarkdownToCaret）が、任意のインライン要素
        // ⇔ 生Markdown の相互変換に使う。読込時の変換と同じ関数を共有することで、
        // 展開／復帰の結果が通常のレンダリング結果と食い違わないことを保証する。
        serializeInline: serializeInline,
        convertInline: convertInline,
        parseLinkDestination: parseLinkDestination,
        insertSepColumn: insertSepColumn,
        removeSepColumn: removeSepColumn,
        buildTitleAttr: buildTitleAttr,
        serializeTitle: serializeTitle,
        // ブロック数式の生Markdown表示（commands.js）が、復帰時に math-block
        // コンテナを再生成するために使う（読込時の変換と同じ関数を共有する）。
        buildMathBlockHtml: buildMathBlockHtml,
        // 生Markdown表示中の要素から生テキストを取り出す（<br>→改行）。
        rawMarkdownText: rawMarkdownText,
        escapeHtml: escapeHtml,
        convertTableToMarkdown: convertTableToMarkdown,
        getCleanEditorClone: getCleanEditorClone,
        getCleanHtmlFromEditor: getCleanHtmlFromEditor,
        slugify: slugify,
        buildTocMarkdown: buildTocMarkdown,
        // 行番号表示（2/3）: 各トップレベルブロックのソース開始行の対応付け。
        coreLinesOf: coreLinesOf,
        computeBlockStartLines: computeBlockStartLines,
        // 行番号表示（3/3 橋渡し）: 表示中ブロック→開始行の対応（DOM／レイアウト非依存）。
        computeEditorLineMap: computeEditorLineMap,
        // 脚注（[^label] / [^label]: 本文）のサポート
        extractFootnoteDefinitions: extractFootnoteDefinitions,
        buildFootnotesSectionHtml: buildFootnotesSectionHtml,
        // 定義リスト（Term\n: Definition）のサポート
        scanDefListTerms: scanDefListTerms,
        buildDefListHtml: buildDefListHtml,
        // YAML front matter の折りたたみ表示
        parseFrontMatter: parseFrontMatter,
        buildFrontMatterHtml: buildFrontMatterHtml
    };
})();
