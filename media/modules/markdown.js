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
        'P', 'DIV', 'PRE', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'HR', 'SECTION'
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
        html = html.replace(/\$([^$\n]+)\$/g, function (_m, expr) {
            mathSpans.push('<span class="math-inline" data-math="' + escapeAttr(expr) +
                '" contenteditable="false"></span>');
            return '\u0002' + (mathSpans.length - 1) + '\u0002';
        });

        // 画像（![alt](url)）。リンクより**先に**処理する（`![` を `!`＋リンクに
        // 割らないため）。alt は空も許容（貼り付け画像は alt 無し）。属性を閉じる
        // `"` は escapeAttr で潰す（テキストは escapeHtml 済みで `<>&` は実体参照）。
        // 生成した `<img>` はプレースホルダへ退避しておく。退避しないとURL/alt中の
        // `_`/`*`/`~`/`+` が後続の強調変換で `src="a<em>b</em>c"` のように壊れ、往復が
        // 崩れる（インラインコード・数式と同じ保護方針）。
        const imgSpans = [];
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_m, alt, url) {
            imgSpans.push('<img src="' + escapeAttr(url) + '" alt="' + escapeAttr(alt) + '">');
            return '' + (imgSpans.length - 1) + '';
        });

        // リンク
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // 脚注参照（[^label]）。対応する脚注定義（footnoteLabelsに含まれるラベル）が
        // 実在する場合のみ変換し、無ければリテラルテキストのまま残す
        // （未定義ラベルを誤って脚注扱いしない・呼び出し元がfootnoteLabelsを渡さない
        // 場合＝見出し・リスト等は現状この変換の対象外＝本文段落のみが対象）。
        // 直後に`:`が続くもの（`[^label]:`＝定義行の体裁。重複ラベルで無効化された
        // 定義が通常の段落へ回されたケースなど）は参照として変換しない
        // （extractFootnoteDefinitionsの参照カウント側と同じ`(?!:)`ガード）。
        if (footnoteLabels) {
            html = html.replace(/\[\^([A-Za-z0-9_-]+)\](?!:)/g, function (match, label) {
                if (!footnoteLabels.has(label)) {
                    return match;
                }
                return '<sup class="footnote-ref" data-footnote-label="' + label + '">' +
                    '<a href="#fn-' + label + '" id="fnref-' + label + '">' + label + '</a></sup>';
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
     * コードフェンス行の判定
     */
    function matchFence(line) {
        return /^```(\S*)\s*$/.exec(line);
    }

    // 脚注定義行（`[^label]: 本文`）の判定。ラベルはid/href属性にそのまま使うため
    // 英数字・アンダースコア・ハイフンのみに制限する（それ以外の文字を含む見た目の
    // 定義行は通常のテキスト行として扱う＝安全側のフォールバック）。
    const FOOTNOTE_DEF_PATTERN = /^\[\^([A-Za-z0-9_-]+)\]:\s?(.*)$/;

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
     * @returns {{ defs: {label:string, text:string}[], labels: Set<string>, contentLines: string[] }}
     */
    function extractFootnoteDefinitions(lines) {
        // 1st pass: コードフェンス/ブロック数式の中かどうかを行ごとに判定しつつ、
        // 定義行らしき行を仮判定する（まだ確定しない＝参照の有無を見てから決める）。
        const entries = [];
        let inFence = false;
        let inMathBlock = false;

        lines.forEach(function (line) {
            if (!inMathBlock && matchFence(line)) {
                inFence = !inFence;
                entries.push({ line: line, def: null, scannable: false });
                return;
            }
            if (!inFence && /^\$\$\s*$/.test(line)) {
                inMathBlock = !inMathBlock;
                entries.push({ line: line, def: null, scannable: false });
                return;
            }
            if (inFence || inMathBlock) {
                entries.push({ line: line, def: null, scannable: false });
                return;
            }
            const m = FOOTNOTE_DEF_PATTERN.exec(line);
            if (m) {
                entries.push({ line: line, def: { label: m[1], text: m[2] }, scannable: true });
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
        const defs = [];
        const labels = new Set();
        const contentLines = [];
        entries.forEach(function (entry) {
            if (entry.def && referencedLabels.has(entry.def.label) && !labels.has(entry.def.label)) {
                labels.add(entry.def.label);
                defs.push(entry.def);
                return;
            }
            contentLines.push(entry.line);
        });

        return { defs: defs, labels: labels, contentLines: contentLines };
    }

    /**
     * 脚注定義配列から脚注一覧セクションのHTMLを組み立てる。ラベルは
     * `FOOTNOTE_DEF_PATTERN` で既に英数字・アンダースコア・ハイフンのみに
     * 制限されているため、id/href属性へそのまま使ってよい（エスケープ不要）。
     */
    function buildFootnotesSectionHtml(defs) {
        if (!defs.length) {
            return '';
        }
        let html = '<section class="footnotes" data-footnotes="true"><ol>';
        defs.forEach(function (def) {
            html += '<li id="fn-' + def.label + '" data-footnote-label="' + def.label + '">' +
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
     * ブロック要素の開始行か判定（段落の継続判定に使用）
     */
    function isBlockStart(line, nextLine) {
        if (matchFence(line)) return true;
        if (/^(#{1,6}) /.test(line)) return true;
        if (/^> ?/.test(line)) return true;
        if (HR_PATTERN.test(line)) return true;
        if (/^(\s*)([-*]|\d+\.) /.test(line)) return true;
        if (isTableStart(line, nextLine)) return true;
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
        // 脚注定義行（`[^label]: 本文`）は通常のブロックパースの対象から外し、
        // 文書末尾の脚注一覧セクションとして別途組み立てる（末尾に集約するのは
        // 一般的な脚注表示の慣習に合わせたもの＝定義が文書中程にあった場合、
        // 保存すると末尾へ移動する。既知の仕様）。
        // 末尾の空行はここで落としておく（末尾の空行はhtmlToMarkdown側で常に
        // 1つの改行へ正規化され往復に影響しないが、定義行が文末近くにあると
        // 除去後に隣接する空行と連結して余分な空段落が生じるため、先に潰しておく）。
        const footnoteInfo = extractFootnoteDefinitions(src.replace(/\n+$/, '').split('\n'));
        const lines = footnoteInfo.contentLines;
        const out = [];
        let i = 0;
        // 見出しidの重複を連番（-1, -2 ...）で解消する。buildTocMarkdownと同じ規則。
        const seenSlugs = {};

        while (i < lines.length) {
            const line = lines[i];

            // --- コードブロック ---
            const fence = matchFence(line);
            if (fence) {
                const language = (fence[1] || '').trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !/^```\s*$/.test(lines[i])) {
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

            // --- 段落（連続する通常行をまとめ、行内の改行は<br>） ---
            const paraLines = [line];
            i++;
            while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) {
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
                return `[${serializeInlineChildren(node)}](${href})`;
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
                return src ? `![${alt}](${src})` : '';
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
        return `\`\`\`${language}\n${body}\`\`\`\n\n`;
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
                const lines = items.map(li => {
                    const label = li.getAttribute('data-footnote-label') || '';
                    // 脚注本文の直列化時は戻りリンク（↩）を除いてから行う
                    const clone = li.cloneNode(true);
                    const backref = clone.querySelector('.footnote-backref');
                    if (backref) {
                        backref.remove();
                    }
                    const text = serializeInlineChildren(clone).trim();
                    return `[^${label}]: ${text}`;
                });
                return lines.join('\n') + '\n\n';
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
        buildFootnotesSectionHtml: buildFootnotesSectionHtml
    };
})();
