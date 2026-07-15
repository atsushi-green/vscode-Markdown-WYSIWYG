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
        'P', 'DIV', 'PRE', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'HR'
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
     * インラインMarkdown記法をHTMLへ変換（エスケープ済みテキストに適用）
     * commands.jsのライブ変換（convertInlineText）と同じ記法をサポートする
     */
    function convertInline(escapedText) {
        let html = escapedText;

        // リンク
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // インラインコード
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

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
     * コードフェンス行の判定
     */
    function matchFence(line) {
        return /^```(\S*)\s*$/.exec(line);
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
            let html = `<${tag}>`;

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
        const lines = src.split('\n');
        const out = [];
        let i = 0;

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

            // --- 空行 ---
            if (!line.trim()) {
                i++;
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
                out.push(
                    `<h${level}><span class="heading-hash">${h[1]} </span>` +
                    `${convertInline(escapeHtml(h[2]))}</h${level}>`
                );
                i++;
                continue;
            }

            // --- テーブル ---
            if (isTableStart(line, lines[i + 1])) {
                const headers = splitTableRow(line);
                i += 2; // ヘッダー行 + セパレーター行

                const rows = [];
                while (i < lines.length && /^\s*\|/.test(lines[i]) && lines[i].trim()) {
                    rows.push(splitTableRow(lines[i]));
                    i++;
                }

                let tableHtml = '<table><thead><tr>';
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
                out.push(buildQuoteHtml(quoteItems));
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
            out.push('<p>' + paraLines.map(l => convertInline(escapeHtml(l))).join('<br>') + '</p>');
        }

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
     * 単一ノードをインラインMarkdownへ直列化
     */
    function serializeInline(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return stripZeroWidth(node.textContent);
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
            case 'SPAN':
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

            const marker = ordered ? `${index++}. ` : '* ';
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
        md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
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

        // 余分な空行を削除
        markdown = markdown.replace(/\n{3,}/g, '\n\n');

        // 先頭の空行を削除、末尾は改行1つに揃える
        markdown = markdown.replace(/^\n+/, '');
        if (!markdown.trim()) {
            return '';
        }
        markdown = markdown.replace(/\n*$/, '\n');

        return markdown;
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
     * エディタDOMからクリーンなHTMLを取得（UI要素を除去し、隠されたソースを復元）
     */
    function getCleanHtmlFromEditor() {
        // エディタのDOMをクローン
        const clone = state.editor.cloneNode(true);

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
            const originalContainer = state.editor.querySelector(`.mermaid-container[data-mermaid-id="${diagramId}"]`);
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

        return clone.innerHTML;
    }

    // 公開API
    return {
        markdownToHtml: markdownToHtml,
        htmlToMarkdown: htmlToMarkdown,
        convertTableToMarkdown: convertTableToMarkdown,
        getCleanHtmlFromEditor: getCleanHtmlFromEditor,
        slugify: slugify,
        buildTocMarkdown: buildTocMarkdown
    };
})();
