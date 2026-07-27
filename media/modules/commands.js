/**
 * commands.js - コマンド・フォーマット機能モジュール
 * エディタコマンド、キーボードショートカット、インラインフォーマットを担当
 */
window.CommandsModule = (function() {
    'use strict';

    const state = window.EditorState;
    const utils = window.EditorUtils;
    const markdown = window.MarkdownModule;

    /**
     * highlight.jsが読み込まれたかチェック
     */
    function isHighlightJsReady() {
        return typeof hljs !== 'undefined';
    }

    /**
     * コードブロックにシンタックスハイライトを適用
     */
    function applySyntaxHighlighting() {
        if (!isHighlightJsReady()) {
            console.warn('[Syntax Highlight] highlight.js is not loaded yet');
            return;
        }

        state.editor.querySelectorAll('pre code').forEach((block) => {
            highlightCodeBlock(block, false);
        });
    }

    /**
     * 単一のコードブロックにシンタックスハイライトを適用
     *
     * force=true の場合は既存のハイライト装飾を剥がしてから塗り直す。
     * 言語変更時はこれを使う（未指定だと「ハイライト済み」判定で
     * スキップされ、古い言語の色が残ってしまう）。
     */
    function highlightCodeBlock(block, force) {
        if (!isHighlightJsReady()) {
            return;
        }

        const lang = block.getAttribute('data-lang');

        // mermaidは別処理
        if (lang === 'mermaid') {
            return;
        }

        const hasHljsSpans = block.querySelector('span[class^="hljs-"]');
        const isHighlighted = block.classList.contains('hljs') || !!hasHljsSpans;

        if (isHighlighted) {
            if (!force) {
                return;
            }
            // 既存の装飾spanを剥がしてプレーンテキストへ戻す
            block.classList.remove('hljs');
            block.textContent = block.textContent;
        }

        const codeText = block.textContent || '';
        if (!codeText.trim()) {
            return;
        }

        try {
            let result;
            if (lang && hljs.getLanguage(lang)) {
                result = hljs.highlight(codeText, { language: lang, ignoreIllegals: true });
            } else {
                // 言語未指定、またはhljsが知らない言語 → 自動判定
                result = hljs.highlightAuto(codeText);
            }

            if (result && result.value) {
                block.innerHTML = result.value;
                block.classList.add('hljs');
            }
        } catch (e) {
            console.error('[Syntax Highlight] Error:', e);
        }
    }

    // 言語補完用datalistを生成済みかどうか
    let langDatalistReady = false;

    /**
     * コードブロックの言語補完用datalistを一度だけ生成
     */
    function ensureLangDatalist() {
        if (langDatalistReady || document.getElementById('code-lang-datalist')) {
            langDatalistReady = true;
            return;
        }

        const datalist = document.createElement('datalist');
        datalist.id = 'code-lang-datalist';

        const langs = new Set();
        if (isHighlightJsReady() && typeof hljs.listLanguages === 'function') {
            hljs.listLanguages().forEach(l => langs.add(l));
        }
        // よく使う言語（hljs未ロード時のフォールバックも兼ねる）
        [
            'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp',
            'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'html', 'css',
            'json', 'yaml', 'xml', 'markdown', 'bash', 'shell', 'powershell',
            'sql', 'mermaid', 'plaintext'
        ].forEach(l => langs.add(l));

        Array.from(langs).sort().forEach(l => {
            const opt = document.createElement('option');
            opt.value = l;
            datalist.appendChild(opt);
        });
        document.body.appendChild(datalist);
        langDatalistReady = true;
    }

    /**
     * すべてのコードブロックに言語セレクタ・コピーボタンUIを付与（未付与のもののみ）
     *
     * ラベル・アイコンはCSSの content で描画するため、
     * DOM上のテキストノードは増えず、キャレット位置計算に影響しない。
     */
    function decorateCodeBlocks() {
        if (!state.editor) {
            return;
        }
        ensureLangDatalist();

        state.editor.querySelectorAll('pre').forEach(pre => {
            // Mermaidブロックは専用UIがあるため対象外
            if (pre.classList.contains('mermaid-source') || pre.style.display === 'none') {
                return;
            }
            const code = pre.querySelector('code');
            if (!code || code.getAttribute('data-lang') === 'mermaid') {
                return;
            }

            const lang = code.getAttribute('data-lang') || '';

            let toolbar = pre.querySelector(':scope > .code-block-toolbar');
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.className = 'code-block-toolbar';
                toolbar.setAttribute('contenteditable', 'false');
                pre.insertBefore(toolbar, pre.firstChild);
            }

            let selector = toolbar.querySelector(':scope > .code-lang-selector');
            if (selector) {
                // 編集中でなければ表示ラベルだけ最新化
                if (selector.getAttribute('data-editing') !== 'true') {
                    selector.setAttribute('data-lang', lang || 'plaintext');
                }
            } else {
                selector = document.createElement('div');
                selector.className = 'code-lang-selector';
                selector.setAttribute('contenteditable', 'false');
                selector.setAttribute('data-lang', lang || 'plaintext');
                selector.setAttribute('title', 'クリックして言語を変更');
                toolbar.appendChild(selector);
            }

            if (!toolbar.querySelector(':scope > .code-copy-btn')) {
                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'code-copy-btn';
                copyBtn.setAttribute('contenteditable', 'false');
                copyBtn.setAttribute('data-state', 'idle');
                copyBtn.setAttribute('title', 'コードをコピー');
                copyBtn.setAttribute('aria-label', 'コードをコピー');
                toolbar.appendChild(copyBtn);
            }
        });
    }

    /**
     * コードブロックの中身をクリップボードへコピー
     */
    async function copyCodeBlock(btn) {
        const pre = btn.closest('pre');
        const code = pre && pre.querySelector('code');
        if (!code) {
            return;
        }

        // highlight.jsの装飾spanはtextContentで剥がれる。
        // 末尾の改行はフェンス由来のため取り除く。
        const text = (code.textContent || '')
            .replace(new RegExp(state.ZERO_WIDTH, 'g'), '')
            .replace(/\n$/, '');

        try {
            await writeTextToClipboard(text);
            btn.setAttribute('data-state', 'copied');
            setTimeout(() => btn.setAttribute('data-state', 'idle'), 1500);
            utils.showToast('📋 コードをコピーしました');
        } catch (error) {
            console.error('[CodeBlock] Copy failed:', error);
            utils.showToast(`⚠️ コピーに失敗しました: ${error.message}`);
        }
    }

    /**
     * クリップボードへの書き込み（Clipboard API不可の環境ではexecCommandへフォールバック）
     */
    async function writeTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch (error) {
                console.warn('[CodeBlock] Clipboard API failed, falling back:', error);
            }
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        state.editor.focus();

        if (!ok) {
            throw new Error('execCommand("copy") が拒否されました');
        }
    }

    /**
     * コードブロックの言語を設定（data-lang属性とlanguage-*クラスを更新）
     */
    function setCodeLanguage(code, lang) {
        const safeClass = lang.replace(/[^\w-]+/g, '');
        // 既存の language-* / hljs クラスを除去
        code.className = code.className
            .split(/\s+/)
            .filter(c => c && c !== 'hljs' && !/^language-/.test(c))
            .join(' ');
        if (lang) {
            code.setAttribute('data-lang', lang);
        } else {
            code.removeAttribute('data-lang');
        }
        if (safeClass) {
            code.classList.add(`language-${safeClass}`);
        }
    }

    /**
     * 言語セレクタを編集モードにする（inputを表示）
     */
    function startEditingLang(selector) {
        if (selector.getAttribute('data-editing') === 'true') {
            return;
        }
        const pre = selector.closest('pre');
        const code = pre && pre.querySelector('code');
        if (!code) {
            return;
        }
        ensureLangDatalist();

        const current = code.getAttribute('data-lang') || '';
        selector.setAttribute('data-editing', 'true');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'code-lang-input';
        input.value = current;
        input.setAttribute('list', 'code-lang-datalist');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('placeholder', 'language');
        selector.appendChild(input);

        // input内のイベントはエディタ側へ伝播させない（誤同期・ショートカット暴発を防止）
        input.addEventListener('input', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditingLang(selector, code, input.value.trim(), current);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEditingLang(selector, code, current, current);
            }
        });
        input.addEventListener('blur', () => {
            finishEditingLang(selector, code, input.value.trim(), current);
        });

        input.focus();
        input.select();
    }

    /**
     * 言語セレクタの編集を確定
     */
    function finishEditingLang(selector, code, value, prevLang) {
        if (selector.getAttribute('data-editing') !== 'true') {
            return;
        }
        selector.setAttribute('data-editing', 'false');

        const input = selector.querySelector('.code-lang-input');
        if (input) {
            input.remove();
        }
        selector.setAttribute('data-lang', value || 'plaintext');

        if (value === prevLang) {
            state.editor.focus();
            return;
        }

        setCodeLanguage(code, value);
        state.editor.focus();

        // 変更をMarkdownへ書き戻す
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));

        // 新しい言語で強制的に塗り直す。
        // input処理（applySyntaxHighlighting等）の後に実行することで、
        // パイプライン側の「ハイライト済みならスキップ」判定に負けないようにする。
        highlightCodeBlock(code, true);
    }

    /**
     * 言語セレクタ・コピーボタンのクリックイベントを設定（イベント委譲）
     */
    function setupCodeLangEvents() {
        if (!state.editor) {
            return;
        }
        state.editor.addEventListener('mousedown', (e) => {
            const target = e.target;
            if (!target || typeof target.closest !== 'function') {
                return;
            }
            // input自体のクリックは通常処理（カーソル移動・選択のため）
            if (target.classList && target.classList.contains('code-lang-input')) {
                return;
            }

            // コピーボタン: キャレットが入らないよう抑止のみ行い、実処理はclickで実行
            if (target.closest('.code-copy-btn')) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // front matterヘッダも同様にキャレットが入らないよう抑止し、実処理はclickで実行
            if (target.closest('.frontmatter-header')) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const selector = target.closest('.code-lang-selector');
            if (!selector) {
                return;
            }
            // contenteditableへキャレットが入らないよう抑止してからinputへフォーカス
            e.preventDefault();
            e.stopPropagation();
            startEditingLang(selector);
        });

        state.editor.addEventListener('click', (e) => {
            const target = e.target;
            if (!target || typeof target.closest !== 'function') {
                return;
            }
            const copyBtn = target.closest('.code-copy-btn');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                copyCodeBlock(copyBtn);
                return;
            }
            // 数式（`contenteditable="false"`）はキャレットが内側へ入れないため、
            // クリックで生Markdown表示（`$...$` / `$$...$$`）へ展開して編集可能にする。
            const mathEl = target.closest('.math-inline, .math-block');
            if (mathEl) {
                e.preventDefault();
                e.stopPropagation();
                handleMathClick(mathEl);
                return;
            }
            // YAML front matterのヘッダクリックで折りたたみ/展開をトグルする
            // （`contenteditable="false"`なのでキャレットは入らない。折りたたみ状態は
            // UI表示のみで文書には影響しないため保存対象にしない＝クラスの付け外しのみ）。
            const frontMatterHeader = target.closest('.frontmatter-header');
            if (frontMatterHeader) {
                e.preventDefault();
                e.stopPropagation();
                toggleFrontMatter(frontMatterHeader);
                return;
            }
            // 通常クリックでリンク先へ飛ばないよう既定遷移を抑止する
            // （キャレット設置はmousedownで済んでいるため影響しない）。
            if (target.closest('a[href]')) {
                e.preventDefault();
            }
        });

        // Ctrl/Cmd+クリックでの遷移はmousedownで処理する。
        // clickの時点ではキャレット設置→selectionchange→syncRawMarkdownToCaret により
        // リンクが span.raw-markdown へ置き換わっており、<a> を辿れないため。
        state.editor.addEventListener('mousedown', (e) => {
            handleLinkClick(e);
        });
    }

    /**
     * エディタ外部で開くことを許可するURLスキーム。
     * `javascript:` 等を踏ませないようホワイトリストで判定する（拡張機能側でも再検証する）。
     */
    const EXTERNAL_LINK_SCHEME = /^(https?|mailto):/i;

    /**
     * `Ctrl`（Mac: `Cmd`）+クリックでのリンク遷移を処理する（`mousedown` から呼ぶ）。
     * 編集中の誤遷移を防ぐため、通常クリックではリンクへ飛ばずキャレットを合わせるだけとし
     * （既定挙動に任せる＝ここでは何もしない）、修飾キー付きのときだけ遷移する。
     * VS Codeエディタ本体のリンクと同じ操作感。
     * - ページ内アンカー（TOCの `[text](#slug)` など）: 該当id要素へスクロール
     * - 外部リンク（http/https/mailto）: 拡張機能側へ通知しブラウザ等で開く
     *   （contentEditable内ではリンクの既定遷移が効かないため明示的に処理する）
     * 生Markdown表示中（キャレットが既にリンク内にあり `[text](url)` へ展開済み）のspanも
     * 対象にする。この状態のリンクを続けて修飾キー+クリックする流れが自然なため。
     * 戻り値: リンク先へ移動した場合 true
     */
    function handleLinkClick(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            return false;
        }

        // 修飾キー無しのクリックはキャレット設置に任せる（preventDefaultするとキャレットが動かない）
        if (!event.ctrlKey && !event.metaKey) {
            return false;
        }

        const anchor = target.closest('a[href]');
        const raw = target.closest('span.' + RAW_MARKDOWN_CLASS);
        if (!anchor && !raw) {
            return false;
        }

        let href;
        if (anchor) {
            href = anchor.getAttribute('href') || '';
        } else {
            const parsed = parseRawLink(raw.textContent);
            if (!parsed) {
                return false;
            }
            href = parsed.href;
        }

        if (href.charAt(0) === '#') {
            scrollToAnchor(href);
        } else if (EXTERNAL_LINK_SCHEME.test(href)) {
            state.vscode.postMessage({ type: 'openLink', href: href });
        } else {
            // 相対パス等、扱いを決めていないリンクは何もしない（キャレット設置のみ）
            return false;
        }

        // キャレット設置（＝生Markdownへの展開）を抑止する。VS Code本体と同様、
        // Ctrl/Cmd+クリックではキャレットを動かさずに遷移だけ行う。
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    /**
     * ページ内アンカー（`#slug`）に対応するid要素へスクロールする。
     * 見出しレンダリング（markdownToHtml）がslugifyと同じ規則で付与したidと突き合わせる。
     */
    function scrollToAnchor(href) {
        if (!href || href.charAt(0) !== '#') {
            return;
        }
        let id = href.slice(1);
        try {
            id = decodeURIComponent(id);
        } catch (_e) {
            // 不正なエスケープはそのまま扱う
        }
        if (!id) {
            return;
        }
        let el = null;
        // idにCSSセレクタで扱いにくい文字（日本語等）が含まれてもよいよう属性で探す。
        const escaped = id.replace(/["\\]/g, '\\$&');
        try {
            el = state.editor.querySelector('[id="' + escaped + '"]');
        } catch (_e) {
            el = null;
        }
        if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * スクロール位置パンくず用に、エディタ内の見出し要素を出現順の階層情報配列へ変換する。
     * `id` は markdownToHtml が付与したスラッグ（scrollToAnchor と同じ規則で遷移できる）。
     */
    function collectHeadings(editor) {
        const headings = [];
        editor.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
            headings.push({
                level: Number(h.tagName[1]),
                id: h.id || '',
                text: headingText(h),
                el: h
            });
        });
        return headings;
    }

    /**
     * 脚注ホバーツールチップ用に、指定ラベルの脚注定義本文をエディタから取り出す。
     * `#fn-label` の`<li>`（`markdown.js`の`buildFootnotesSectionHtml`が生成）から
     * 戻りリンク（`.footnote-backref`）を除いたテキストを返す。見つからなければ空文字。
     * ラベルは`markdownToHtml`側で英数字・アンダースコア・ハイフンのみに制限されて
     * いるため、属性セレクタへそのまま埋め込んでも安全（`"`等を含み得ない）。
     */
    function getFootnoteDefinitionText(editor, label) {
        if (!editor || !label) {
            return '';
        }
        let li;
        try {
            li = editor.querySelector('li[id="fn-' + label + '"]');
        } catch (_e) {
            li = null;
        }
        if (!li) {
            return '';
        }
        const clone = li.cloneNode(true);
        const backref = clone.querySelector('.footnote-backref');
        if (backref) {
            backref.remove();
        }
        return (clone.textContent || '').trim();
    }

    /**
     * 見出しの上端位置（配列。出現順＝昇順）とスクロール位置から、
     * 「いま見ている位置」に対応する見出しのインデックスを求める（純粋関数）。
     * スクロール位置以前の最後の見出し＝現在読んでいる節の見出しとみなす。
     * 最初の見出しより手前（まだどの見出しも通過していない）なら -1。
     */
    function findCurrentHeadingIndex(tops, scrollTop) {
        let result = -1;
        for (let i = 0; i < tops.length; i++) {
            if (tops[i] <= scrollTop) {
                result = i;
            } else {
                break;
            }
        }
        return result;
    }

    /**
     * 現在の見出しインデックスから、祖先の階層すべてを連ねたパンくずチェーンを組み立てる（純粋関数）。
     * currentIndexの見出し自身を末尾に置き、そこから手前へ辿ってレベルが
     * それまでの最小値より小さい見出しだけを先頭へ積み上げる（レベル飛び＝存在するものだけ）。
     */
    function buildBreadcrumbChain(headings, currentIndex) {
        if (!headings || currentIndex < 0 || currentIndex >= headings.length) {
            return [];
        }
        const chain = [headings[currentIndex]];
        let minLevel = headings[currentIndex].level;
        for (let i = currentIndex - 1; i >= 0 && minLevel > 1; i--) {
            if (headings[i].level < minLevel) {
                chain.unshift(headings[i]);
                minLevel = headings[i].level;
            }
        }
        return chain;
    }

    /**
     * ブロックが「/」入力直後のスラッシュコマンド起動状態か判定する純粋関数。
     * `table.isBlockEmpty` と同様の考え方で、ブロックの可視テキストが半角スラッシュ
     * 1文字だけ（前後に他のテキスト・`<br>`以外の要素を含まない）ならtrue。
     * それ以外（空・2文字以上・スラッシュ以外）はfalse＝メニューを出さない/閉じる対象。
     */
    function isSlashCommandTrigger(block) {
        if (!block) {
            return false;
        }
        const text = (block.textContent || '').replace(/\u200B/g, '');
        if (text !== '/') {
            return false;
        }
        return !Array.prototype.some.call(block.children || [], child => child.tagName !== 'BR');
    }

    /**
     * コマンドの実行
     */
    function executeCommand(command) {
        document.execCommand('styleWithCSS', false, false);

        switch (command) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'underline':
                document.execCommand('underline', false, null);
                break;
            case 'strikethrough':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'h1':
                formatHeading(1);
                break;
            case 'h2':
                formatHeading(2);
                break;
            case 'h3':
                formatHeading(3);
                break;
            case 'ul':
                document.execCommand('insertUnorderedList', false, null);
                break;
            case 'ol':
                document.execCommand('insertOrderedList', false, null);
                break;
            case 'link':
                insertLink();
                break;
            case 'code':
                insertCodeBlock();
                break;
            case 'quote':
                insertBlockquote();
                break;
            case 'toc':
                insertToc();
                break;
        }

        state.editor.focus();
    }

    /**
     * 見出し要素からアンカー表示用の `#` スパンを除いたテキストを取り出す
     */
    function headingText(heading) {
        let text = '';
        heading.childNodes.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE &&
                child.classList &&
                child.classList.contains('heading-hash')) {
                return;
            }
            text += child.textContent;
        });
        return text.trim();
    }

    /**
     * エディタ内の見出しから目次（TOC）を生成し、キャレット位置のブロックの
     * 直後（キャレットが無ければ先頭）に挿入する。
     * 見出しが無い場合はトーストで知らせて何もしない。
     * @returns {boolean} 実際に目次を挿入できたか（見出しが無い等で挿入しなかった場合はfalse。
     * スラッシュコマンドメニュー等、挿入できたかどうかで後続処理を分けたい呼び出し元向け）
     */
    function insertToc() {
        const headings = [];
        state.editor.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
            const text = headingText(h);
            if (text) {
                headings.push({ level: Number(h.tagName[1]), text: text });
            }
        });

        if (!headings.length) {
            utils.showToast('見出しが見つかりません');
            return false;
        }

        const tocMarkdown = markdown.buildTocMarkdown(headings);
        const temp = document.createElement('div');
        temp.innerHTML = markdown.markdownToHtml(tocMarkdown);
        const nodes = Array.prototype.slice.call(temp.childNodes);
        if (!nodes.length) {
            return false;
        }

        // 挿入位置を決める（キャレットのあるトップレベルブロックの直後）
        const selection = window.getSelection();
        let block = null;
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (state.editor.contains(range.startContainer)) {
                block = utils.findBlockAncestor(range.startContainer);
                while (block && block.parentNode !== state.editor) {
                    block = block.parentNode;
                }
            }
        }

        if (block && block.parentNode === state.editor) {
            let ref = block;
            nodes.forEach(n => {
                ref.after(n);
                ref = n;
            });
        } else {
            // YAML front matterは文書の絶対先頭でなければ再パース時に認識されなくなる
            // （通常の水平線として扱われてしまう）ため、先頭がfront matterブロックなら
            // その直後へ挿入する（先頭に割り込ませない）。
            const first = state.editor.firstChild;
            const frontMatter = first && first.classList && first.classList.contains('frontmatter')
                ? first
                : null;
            if (frontMatter) {
                let ref = frontMatter;
                nodes.forEach(n => {
                    ref.after(n);
                    ref = n;
                });
            } else {
                nodes.forEach(n => {
                    state.editor.insertBefore(n, first);
                });
            }
        }

        // 文書へ反映
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    /**
     * `buildImageMarkdown` がパーセントエンコードする文字の対応表。
     * 目的は2つ:
     *
     * 1. **生Markdownとして正しいURLにする** — `#`（フラグメント）・`?`（クエリ）は
     *    URLの区切りなので、外部ビューア（VS Codeのプレビュー・GitHub など）が
     *    この行を読んだときにその位置以降がパスから切り落とされ、画像が表示されない。
     *    エディタ内の表示だけなら `resolveImageSrc`（markdown.js）が結合時に
     *    `%23`/`%3F` へ逃がすため既に壊れないが、**保存されたMarkdownファイル自体**を
     *    正しく保つのはこちらの責務。半角スペース・丸括弧・`<`/`>`/`"`/`\` も
     *    URL／Markdown記法上あいまいになる（`(` はリンク記法の閉じ括弧、
     *    `"` は `![](url "title")` のタイトル記法、`\` はMarkdownのエスケープ文字）。
     * 2. **インライン変換の退避処理に巻き込まれないようにする** —
     *    `convertInlineText`（および markdown.js の `convertInline`）は
     *    インラインコード `` ` `` と数式 `$…$` を**画像より先に**プレースホルダへ
     *    退避し、画像の復元より**後で**復元する。そのためパスにこれらが含まれると、
     *    画像を組み立てたあとの属性値の中でプレースホルダが展開されてしまう:
     *    - `` ` `` → `<img src="a<code>b</code>c.png">`。属性値は引用符の中なので
     *      HTML構造は壊れないが、`src` の**値そのもの**が汚染されて往復が崩れる。
     *    - `$` → 復元される `<span class="math-inline" data-math="…">` が `"` を含み、
     *      属性値がそこで途中で閉じるため**HTML構造ごと壊れる**（残骸が本文へ落ちる）。
     *
     * `_`・`*`・`~`・`+` などの強調記法文字は**あえてエンコードしない**。両変換関数は
     * 画像を生成した時点でプレースホルダへ退避し、強調変換が終わってから復元するため
     * 属性値が強調に化けることはなく、エンコードするとパスが徒に読みにくくなる
     * （`image_1.png` → `image%5F1.png`）。同じ理由で日本語などの非ASCII文字も
     * そのまま残す（ブラウザ側でエンコードされて解決される）。ただし全角スペース
     * （U+3000）等の**非ASCIIの空白**は下記 `\s` にマッチするためエンコード対象。
     */
    const IMAGE_PATH_ENCODE_MAP = {
        '%': '%25', // 先頭に置く意味はない（単一パス置換のため二重エンコードは起きない）
        ' ': '%20',
        '(': '%28',
        ')': '%29',
        '<': '%3C',
        '>': '%3E',
        '"': '%22',
        '`': '%60',
        '$': '%24',
        '#': '%23',
        '?': '%3F',
        '\\': '%5C',
        '[': '%5B',
        ']': '%5D'
    };

    /**
     * 相対パスから画像のMarkdown記法 `![](path)` を組み立てる純粋関数。
     * alt は空（貼り付け画像に説明は無いため）。パス中の記号は
     * `IMAGE_PATH_ENCODE_MAP` に従ってパーセントエンコードする。
     *
     * 置換は**1回の走査で行う**（`.replace()` の連鎖にしない）。連鎖すると先に
     * 生成した `%` が後段の `%` エンコードに拾われて `%2520` のような二重エンコードに
     * なるため。
     *
     * 直列化（`serializeInline` の IMG 分岐）はエンコード済み文字列をそのまま
     * `![](…)` へ戻すため往復は不変。表示時は `resolveImageSrc` がベースURIと結合し、
     * パーセント記法はブラウザがデコードして実ファイルへ解決する（既存の `%20` と同じ）。
     * @param {string} relPath 画像への相対パス（POSIX区切り）
     * @returns {string} `![](encoded)`
     */
    function buildImageMarkdown(relPath) {
        const encoded = String(relPath || '')
            .replace(/[%\s()<>"`$#?\\[\]]/g, function (ch) {
                // 対応表に無い空白（タブ・改行など）は encodeURIComponent に委ねる
                // （`%20` へ潰すと別の文字になってしまい実ファイルへ解決できない）。
                return IMAGE_PATH_ENCODE_MAP[ch] || encodeURIComponent(ch);
            });
        return '![](' + encoded + ')';
    }

    /**
     * クリップボードの items（`DataTransferItemList` 相当）から最初の画像アイテムを返す
     * 純粋関数。`type` が `image/` で始まるものを探す。無ければ null。
     * @param {ArrayLike<{kind?:string,type?:string}>} items
     * @returns {any|null}
     */
    function findClipboardImageItem(items) {
        if (!items) {
            return null;
        }
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it && typeof it.type === 'string' && it.type.indexOf('image/') === 0) {
                return it;
            }
        }
        return null;
    }

    /**
     * 画像の相対パスから `![](path)` を組み立て、現在のキャレット位置へテキストとして
     * 挿入する（クリップボード画像貼り付けの受け取り側）。選択がエディタ外／無い場合は
     * エディタ末尾へフォールバックする。挿入後に input を発火して文書へ反映する。
     *
     * テキストノードとして挿入するが、直後の input で走るライブ変換
     * （`convertInlineText`）が `![](path)` を `<img>` に描画する（`convertInline` と同経路）。
     * ソースには `![](path)` が保たれる（直列化は `serializeInline` の IMG 分岐＝往復不変）。
     * @param {string} relPath 画像への相対パス
     * @returns {boolean} 挿入したら true
     */
    function insertImageMarkdown(relPath) {
        if (!relPath) {
            return false;
        }
        const md = buildImageMarkdown(relPath);
        const selection = window.getSelection();
        let range = null;
        if (selection && selection.rangeCount > 0 &&
            state.editor.contains(selection.getRangeAt(0).startContainer)) {
            range = selection.getRangeAt(0);
        } else {
            range = document.createRange();
            range.selectNodeContents(state.editor);
            range.collapse(false);
        }
        range.deleteContents();
        const textNode = document.createTextNode(md);
        range.insertNode(textNode);
        // キャレットを挿入テキストの直後へ移す
        range.setStartAfter(textNode);
        range.collapse(true);
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    /**
     * 見出しのフォーマット
     */
    function formatHeading(level) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const element = range.commonAncestorContainer.parentElement;

        if (element && element.tagName && element.tagName.match(/^H[1-6]$/)) {
            document.execCommand('formatBlock', false, 'p');
        }

        document.execCommand('formatBlock', false, `h${level}`);
    }

    /**
     * リンクの挿入
     */
    /**
     * リンクの挿入・編集ダイアログを開く（`Ctrl+K` / ツールバーのリンクボタン）。
     * Webviewでは `prompt()` が使えないため自前のダイアログ（`#linkDialog`）を表示する。
     * 開いた時点の状態に応じて初期値を決める:
     * - キャレットが既存リンク（`<a>` / 生Markdown表示中のspan）の内側: そのリンクを編集
     * - テキストを選択中: 選択文字列をリンクテキストの初期値にする
     * - それ以外: 空のまま新規挿入
     * 入力欄へフォーカスを移すとエディタの選択が失われるため、Rangeを保持しておく。
     */
    function insertLink() {
        const selection = window.getSelection();
        const range = (selection && selection.rangeCount > 0)
            ? selection.getRangeAt(0)
            : null;
        if (!range || !state.editor.contains(range.startContainer)) {
            return false;
        }

        // 編集対象の既存リンクを探す（生Markdown展開中のspanも対象）
        const anchor = utils.findAncestor(range.startContainer, function(el) {
            return el.tagName === 'A';
        });
        const raw = utils.findAncestor(range.startContainer, isRawMarkdownSpan);
        const rawLink = raw ? parseRawLink(raw.textContent) : null;

        let text = '';
        let href = '';
        let target = null;
        // 編集対象が元々持っていたタイトルを控えておき、適用時に引き継ぐ。
        // ダイアログはテキストとURLしか編集できないため、引き継がないと
        // ユーザーが触っていないタイトルが保存時に消える（データ喪失）。
        let title = null;
        if (anchor) {
            target = anchor;
            text = anchor.textContent;
            href = anchor.getAttribute('href') || '';
            title = anchor.hasAttribute('title') ? anchor.getAttribute('title') : null;
        } else if (rawLink) {
            target = raw;
            text = rawLink.text;
            href = rawLink.href;
            title = rawLink.title;
        } else {
            text = range.toString();
        }
        state.linkDialogLinkTitle = title;

        state.linkDialogRange = range.cloneRange();
        state.linkDialogTarget = target;
        showLinkDialog({ isEdit: !!target, text: text, href: href });
        return true;
    }

    /**
     * リンクダイアログを表示して初期値を設定する
     */
    function showLinkDialog(options) {
        if (!state.linkDialog) {
            return;
        }
        state.linkDialogTitle.textContent = options.isEdit ? 'リンクの編集' : 'リンクの挿入';
        state.linkTextInput.value = options.text || '';
        state.linkUrlInput.value = options.href || '';
        state.linkDialogRemove.style.display = options.isEdit ? '' : 'none';
        state.linkDialog.style.display = '';
        // URLが未入力（新規）ならURL欄、URL既存（編集）ならテキスト欄から埋めたいことが多い
        const focusUrl = !options.href;
        const input = focusUrl ? state.linkUrlInput : state.linkTextInput;
        input.focus();
        input.select();
    }

    /**
     * リンクダイアログを閉じ、保持していた選択状態を破棄する
     */
    function closeLinkDialog() {
        if (!state.linkDialog) {
            return;
        }
        state.linkDialog.style.display = 'none';
        state.linkDialogRange = null;
        state.linkDialogTarget = null;
        state.editor.focus();
    }

    /**
     * ダイアログの入力内容をエディタへ適用する。
     * URLが空の場合は何もしない（リンクの解除は removeLinkFromDialog が担当）。
     * テキストが空の場合はURLをそのままリンクテキストにする。
     * 戻り値: 適用した場合 true
     */
    function applyLinkDialog() {
        const href = (state.linkUrlInput.value || '').trim();
        if (!href) {
            return false;
        }
        const text = (state.linkTextInput.value || '').trim() || href;

        const a = document.createElement('a');
        a.setAttribute('href', href);
        // 編集前のリンクが持っていたタイトルを引き継ぐ（insertLink が控えた値）
        if (state.linkDialogLinkTitle !== null && state.linkDialogLinkTitle !== undefined) {
            a.setAttribute('title', state.linkDialogLinkTitle);
        }
        a.textContent = text;

        const target = state.linkDialogTarget;
        const range = state.linkDialogRange;
        if (target && target.parentNode) {
            // 既存リンクの編集（生Markdown展開中のspanもここで置き換わる）
            target.parentNode.replaceChild(a, target);
        } else if (range) {
            range.deleteContents();
            range.insertNode(a);
        } else {
            return false;
        }

        closeLinkDialog();
        // キャレットをリンクの直後へ置く（リンク内に置くと生Markdown表示へ展開されるため）
        const after = document.createRange();
        after.setStartAfter(a);
        after.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(after);
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    /**
     * 編集中のリンクを解除し、リンクテキストだけを残す。
     * 戻り値: 解除した場合 true
     */
    function removeLinkFromDialog() {
        const target = state.linkDialogTarget;
        if (!target || !target.parentNode) {
            return false;
        }
        const text = (target.tagName === 'A')
            ? target.textContent
            : (parseRawLink(target.textContent) || { text: target.textContent }).text;
        const node = document.createTextNode(text);
        target.parentNode.replaceChild(node, target);

        closeLinkDialog();
        const after = document.createRange();
        after.setStartAfter(node);
        after.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(after);
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    /**
     * コードブロックの挿入
     */
    function insertCodeBlock() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = selection.toString() || 'コードをここに入力';
        pre.appendChild(code);

        range.deleteContents();
        range.insertNode(pre);
    }

    /**
     * 引用の挿入
     */
    function insertBlockquote() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const blockquote = document.createElement('blockquote');
        blockquote.textContent = selection.toString() || '引用テキスト';

        range.deleteContents();
        range.insertNode(blockquote);
    }

    /**
     * インラインコード末尾で→押下時にコード外へキャレットを移動
     */
    function handleInlineCodeExitRight(event) {
        if (event.key !== 'ArrowRight' || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        const { endContainer, endOffset } = range;

        let codeEl = utils.findAncestor(endContainer, (el) => el.nodeName === 'CODE');
        let inPre = utils.findAncestor(endContainer, (el) => el.nodeName === 'PRE');
        let atEnd = false;

        if (codeEl && !inPre) {
            atEnd = (() => {
                if (endContainer.nodeType === Node.TEXT_NODE) {
                    return endOffset === endContainer.textContent.length && codeEl.contains(endContainer);
                }
                if (endContainer === codeEl) {
                    return endOffset === codeEl.childNodes.length;
                }
                return false;
            })();
        }

        if (!atEnd) {
            const siblingInfo = utils.findCodeBeforeCaret(endContainer, endOffset);
            if (siblingInfo) {
                codeEl = siblingInfo;
                inPre = utils.findAncestor(codeEl, (el) => el.nodeName === 'PRE');
                if (inPre) {
                    return false;
                }
                atEnd = true;
            }
        }

        if (!codeEl || inPre || !atEnd) {
            return false;
        }

        event.preventDefault();

        const nextText = utils.ensureTrailingTextNode(codeEl);

        const after = document.createRange();
        if (nextText) {
            const len = nextText.textContent.length;
            after.setStart(nextText, Math.min(len, len === 0 ? 0 : len));
        } else {
            after.setStartAfter(codeEl);
        }
        after.collapse(true);
        selection.removeAllRanges();
        selection.addRange(after);
        state.editor.focus();

        return true;
    }

    /**
     * ノードがキャレット位置より前にあるかを判定する
     */
    function isNodeBeforeCaret(node, range) {
        const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
        // (parent, idx + 1) = node の直後の位置。それがキャレット以前ならnodeは前にある
        return range.comparePoint(node.parentNode, idx + 1) <= 0;
    }

    /**
     * ブロック内でキャレットの属する行を区切る<br>を探す。
     * dir='before': キャレット直前の<br>（無ければnull＝行はブロック先頭から）
     * dir='after' : キャレット直後の<br>（無ければnull＝行はブロック末尾まで）
     */
    function findLineBr(block, range, dir) {
        const brs = block.querySelectorAll('br');
        let before = null;
        for (let i = 0; i < brs.length; i++) {
            if (isNodeBeforeCaret(brs[i], range)) {
                before = brs[i];
            } else if (dir === 'after') {
                return brs[i];
            }
        }
        return dir === 'before' ? before : null;
    }

    /**
     * エディタ直下に直接入力された裸テキスト（ブロック未生成）を
     * ブロック変換のプレフィックスらしい場合だけ<p>で包んで返す。
     * 空ドキュメントに「> 」等を入力したケースで発生する。
     */
    function wrapBareTextAtRoot(range) {
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE || node.parentNode !== state.editor) {
            return null;
        }
        const prefix = node.textContent.slice(0, range.startOffset).trim();
        if (!/^([-*]|\d+\.|>)$/.test(prefix)) {
            return null;
        }
        const offset = range.startOffset;
        const p = document.createElement('p');
        state.editor.insertBefore(p, node);
        p.appendChild(node);
        // ノード移動でrangeが無効化されるため張り直す
        range.setStart(node, offset);
        range.collapse(true);
        return p;
    }

    /**
     * 先頭プレフィックス入力でブロックを変換。
     * 複数行ブロック（Shift+Enter改行や複数行Markdown段落由来）では
     * <br>区切りの「現在行」を対象に判定・変換する。
     */
    function handleAutoBlock(event) {
        if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        let block = utils.findBlockAncestor(range.startContainer);
        if (!block) {
            // 引用ブロック内で「> 」を入力した場合はネストした引用を作る
            // （findBlockAncestor は BLOCKQUOTE を返さないためここで専用処理する）
            if (handleNestedQuote(event, range)) {
                return true;
            }
            // 空ドキュメント等でエディタ直下に直接入力されたケース
            block = wrapBareTextAtRoot(range);
            if (!block) {
                return false;
            }
        }

        // 現在行（直前の<br>から）のテキストで判定する
        const brBefore = findLineBr(block, range, 'before');
        const lineStart = document.createRange();
        if (brBefore) {
            lineStart.setStartAfter(brBefore);
        } else {
            lineStart.setStart(block, 0);
        }
        lineStart.setEnd(range.startContainer, range.startOffset);
        const trimmed = lineStart.toString().trim();

        const unordered = /^[-*]$/.test(trimmed);
        const ordered = /^\d+\.$/.test(trimmed);
        const quote = /^>$/.test(trimmed);

        if (!unordered && !ordered && !quote) {
            return false;
        }

        // remaining: キャレットから行末（次の<br>またはブロック末尾）まで
        const brAfter = findLineBr(block, range, 'after');
        const lineEnd = document.createRange();
        lineEnd.setStart(range.startContainer, range.startOffset);
        if (brAfter) {
            lineEnd.setEndBefore(brAfter);
        } else {
            lineEnd.setEnd(block, block.childNodes.length);
        }
        const remaining = lineEnd.toString().replace(/^\s+/, '');

        event.preventDefault();

        let newBlock;
        let caretTarget;
        if (unordered || ordered) {
            newBlock = document.createElement(ordered ? 'ol' : 'ul');
            const li = document.createElement('li');
            newBlock.appendChild(li);
            caretTarget = li;
        } else {
            newBlock = document.createElement('blockquote');
            caretTarget = newBlock;
        }
        if (remaining) {
            caretTarget.textContent = remaining;
        } else {
            // 空ブロックは高さゼロで描画されない（blockquoteの左ボーダーも
            // 見えずキャレットも失われる）ため、プレースホルダの<br>で
            // 1行分の高さを確保する
            caretTarget.appendChild(document.createElement('br'));
        }

        if (!brBefore && !brAfter) {
            // 単一行ブロック: そのまま置き換え
            block.replaceWith(newBlock);
        } else {
            // 複数行ブロック: 現在行だけを変換し、前後の行は残す
            if (brAfter) {
                const tail = document.createRange();
                tail.setStartAfter(brAfter);
                tail.setEnd(block, block.childNodes.length);
                const tailFrag = tail.extractContents();
                // 内容のない後続行（末尾のプレースホルダ<br>のみ等）は残さない
                if (tailFrag.textContent || tailFrag.querySelector('br,img')) {
                    const tailBlock = document.createElement('p');
                    tailBlock.appendChild(tailFrag);
                    block.after(tailBlock);
                }
            }
            const line = document.createRange();
            if (brBefore) {
                line.setStartBefore(brBefore);
            } else {
                line.setStart(block, 0);
            }
            line.setEnd(block, block.childNodes.length);
            line.deleteContents();
            block.after(newBlock);
            if (!brBefore || (!block.textContent && !block.querySelector('br,img'))) {
                block.remove();
            }
        }

        if (remaining) {
            utils.placeCaretAt(caretTarget, 0);
        } else {
            // placeCaretAtは空テキストノードを作ってしまうため、
            // プレースホルダ<br>の前（要素先頭）に直接キャレットを置く
            const caretRange = document.createRange();
            caretRange.setStart(caretTarget, 0);
            caretRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(caretRange);
            state.editor.focus();
        }
        return true;
    }

    /**
     * 引用ブロック内の行頭で「> 」を入力したとき、1段深いネスト引用を作る。
     * 対象行が「>」のみ（フレッシュな行頭）のときだけ発火する安全側の実装。
     * ネスト構造は buildQuoteHtml / serializeBlockquoteLines が
     * `> > text` として往復変換に対応済み。
     */
    function handleNestedQuote(event, range) {
        const bq = utils.findAncestor(range.startContainer, function(el) {
            return el.tagName === 'BLOCKQUOTE';
        });
        if (!bq) {
            return false;
        }

        const textBefore = utils.getTextBeforeCaret(bq, range);
        if (textBefore.trim() !== '>') {
            return false;
        }
        const remaining = bq.textContent.slice(textBefore.length).replace(/^\s+/, '');

        event.preventDefault();

        const nested = document.createElement('blockquote');
        nested.textContent = remaining;
        bq.textContent = '';
        bq.appendChild(nested);
        utils.placeCaretAt(nested, 0);
        return true;
    }

    /**
     * 指定要素を含む最も外側のblockquoteを返す（ネスト対応）
     */
    function outermostBlockquote(el) {
        let result = el;
        let current = el.parentNode;
        while (current && current !== state.editor) {
            if (current.tagName === 'BLOCKQUOTE') {
                result = current;
            }
            current = current.parentNode;
        }
        return result;
    }

    /**
     * 生Markdown表示（キャレットが記法の内側にある間だけ展開する）で使うクラス名。
     * このspanの中身は生のMarkdownテキストそのもののため、
     * `utils.shouldSkipInline` で walkInline の再変換対象から除外する。
     * 直列化（`markdown.js` の serializeInline のSPAN分岐）では中身のテキストが
     * そのまま出力されるため、展開中でもMarkdownは展開前と同一になる（往復に非影響）。
     */
    const RAW_MARKDOWN_CLASS = 'raw-markdown';

    /** 生Markdown表示中の要素（span/div）か */
    function isRawMarkdownSpan(el) {
        return !!(el.classList && el.classList.contains(RAW_MARKDOWN_CLASS));
    }

    /** ブロック数式を生Markdown表示中のdivに付けるクラス（インラインspanと復帰処理を分ける） */
    const RAW_MATH_BLOCK_CLASS = 'raw-math-block';

    /** 数式コンテナ（インライン `$...$` / ブロック `$$...$$`）か */
    function isMathContainer(el) {
        return !!(el.classList &&
            (el.classList.contains('math-inline') || el.classList.contains('math-block')));
    }

    /** レンダリング済みの数式を（MathModuleがあれば）再描画する */
    function renderMath(root) {
        if (window.MathModule && typeof window.MathModule.render === 'function') {
            window.MathModule.render(root);
        }
    }

    /**
     * 生Markdownのブロック数式（`$$ ... $$`）をパースして生の式を返す（不成立なら null）。
     * 開き／閉じの `$$` の内側を式として取り出す（前後の空白・改行はKaTeX同様に無視）。
     */
    function parseRawBlockMath(text) {
        const m = /^\s*\$\$([\s\S]*?)\$\$\s*$/.exec(text);
        return m ? m[1].trim() : null;
    }

    /**
     * 生Markdownのリンク記法（`[text](url)`）をパースする。
     * 記法として成立していなければ null。
     */
    function parseRawLink(text) {
        const m = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(text);
        if (!m) {
            return null;
        }
        // 丸括弧の中身は `url "title"` の可能性があるため、読込パスと同じ規則で
        // URLとタイトルへ分ける。分けずに href として扱うと、リンクを開く経路
        // （handleLinkClick）へタイトル込みの不正なURLが渡り、リンク編集ダイアログ
        // （insertLink）のURL欄にもタイトルが混入する。
        const d = markdown.parseLinkDestination(m[2]);
        return { text: m[1], href: d.url, title: d.title };
    }

    /**
     * 生Markdown表示の対象となるインライン要素のタグ。
     * リンクに加え、強調系（太字・斜体・取り消し線・下線）を対象とする。
     * `CODE` は含めない（インラインコードの中身は記法として解釈しないため）。
     */
    const RAW_INLINE_TAGS = new Set(['A', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'STRIKE', 'U']);

    /**
     * 指定ノードを含む最も外側のインライン装飾要素を返す（無ければ null）。
     * `***text***`（`<strong><em>`）や `[**text**](url)` のような入れ子では、
     * 内側だけを展開すると記法が壊れる（`**text**` だけ生に戻すと `***` が復元できない）ため、
     * 常に最も外側の要素ごと展開する。引用の `outermostBlockquote` と同じ考え方。
     */
    function outermostInlineDecoration(node) {
        let result = null;
        let current = node;
        while (current && current !== state.editor) {
            if (current.nodeType === Node.ELEMENT_NODE &&
                RAW_INLINE_TAGS.has(current.tagName)) {
                result = current;
            }
            current = current.parentNode;
        }
        return result;
    }

    /**
     * インライン装飾要素を生Markdown記法のテキストへ展開し、そのspanを返す。
     * 記法の組み立ては `markdown.serializeInline`（htmlToMarkdownと同じ関数）に任せるため、
     * リンク・太字・斜体・取り消し線・下線とその入れ子が同じ規則で生Markdownになる。
     */
    function expandToRaw(el) {
        const span = document.createElement('span');
        span.className = RAW_MARKDOWN_CLASS;
        span.textContent = markdown.serializeInline(el);
        el.parentNode.replaceChild(span, el);
        return span;
    }

    /**
     * 生Markdown表示中のspanをレンダリング表示へ戻す。
     * 記法の解釈は `markdown.convertInline`（markdownToHtmlと同じ関数）に任せるため、
     * 復帰後の表示は通常のレンダリング結果と必ず一致する。
     * 記法が壊れていれば convertInline が変換しない＝プレーンテキストのまま残り、
     * 以後は通常の入力として再変換され得る。
     */
    function collapseRawMarkdown(el) {
        const parent = el.parentNode;
        const text = markdown.rawMarkdownText(el);

        // ブロック数式（`$$ ... $$`）は math-block コンテナへ戻して再レンダリングする。
        // インライン記法と違い convertInline は `$$` を解釈しないため、専用に復元する。
        if (el.classList.contains(RAW_MATH_BLOCK_CLASS)) {
            const expr = parseRawBlockMath(text);
            const holder = document.createElement('div');
            // 記法が壊れていれば内容を失わないよう通常のMarkdown変換に委ねる
            holder.innerHTML = expr !== null
                ? markdown.buildMathBlockHtml(expr)
                : markdown.markdownToHtml(text);
            while (holder.firstChild) {
                parent.insertBefore(holder.firstChild, el);
            }
            parent.removeChild(el);
            renderMath(parent);
            return;
        }

        // インライン（リンク・強調・インライン数式 `$...$`）は convertInline で戻す。
        // `$...$` は convertInline が math-inline コンテナへ変換するため、renderMath で描画する。
        const holder = document.createElement('span');
        holder.innerHTML = markdown.convertInline(markdown.escapeHtml(text));
        while (holder.firstChild) {
            parent.insertBefore(holder.firstChild, el);
        }
        parent.removeChild(el);
        renderMath(parent);
    }

    /**
     * 数式コンテナ（`contenteditable="false"`）を生Markdown表示へ展開する。
     * - インライン数式: `<span class="raw-markdown">$式$</span>`
     * - ブロック数式: `<div class="raw-markdown raw-math-block">$$\n式\n$$</div>`
     * リンク・強調と同じ `raw-markdown` クラスのため、再変換抑止（`utils.shouldSkipInline`）と
     * キャレット離脱時の復帰（`syncRawMarkdownToCaret` → `collapseRawMarkdown`）を共有する。
     * 数式コンテナはキャレットが内側へ入れない（`contenteditable="false"`）ため、
     * 展開のトリガーだけはクリック（`handleMathClick`）で明示的に行う。
     * 返り値: 展開後の raw-markdown 要素
     */
    function expandMathToRaw(el) {
        const isBlock = el.classList.contains('math-block');
        const expr = el.getAttribute('data-math') || '';
        let raw;
        if (isBlock) {
            raw = document.createElement('div');
            raw.className = RAW_MARKDOWN_CLASS + ' ' + RAW_MATH_BLOCK_CLASS;
            raw.textContent = '$$\n' + expr + '\n$$';
        } else {
            raw = document.createElement('span');
            raw.className = RAW_MARKDOWN_CLASS;
            raw.textContent = '$' + expr + '$';
        }
        el.parentNode.replaceChild(raw, el);
        return raw;
    }

    /**
     * 数式コンテナのクリックで生Markdown表示へ展開し、式の内側へキャレットを置く。
     * 開き記法（インラインは `$`・ブロックは `$$\n`）の直後へ置くことで、
     * 続けて入力する文字が式の一部になる（記法の外へ出したいときはキャレットを動かす）。
     * 展開後はキャレット離脱で `syncRawMarkdownToCaret` がレンダリング表示へ戻す。
     */
    function handleMathClick(el) {
        const isBlock = el.classList.contains('math-block');
        const raw = expandMathToRaw(el);
        utils.placeCaretAt(raw, isBlock ? 3 : 1);
    }

    /**
     * YAML front matterヘッダのクリックで折りたたみ/展開をトグルする。
     * `headerEl`は`.frontmatter-header`要素（またはその子孫）を受け取り、
     * 祖先の`.frontmatter`に`frontmatter-expanded`クラスを付け外しする。
     * 折りたたみ状態はUI表示のみで文書の内容には影響しないため、保存対象にしない。
     */
    function toggleFrontMatter(headerEl) {
        const frontMatter = headerEl.closest('.frontmatter');
        if (frontMatter) {
            frontMatter.classList.toggle('frontmatter-expanded');
        }
    }

    /**
     * キャレット位置に応じて生Markdown表示を切り替える（`selectionchange` から呼ぶ）。
     * - キャレットがインライン装飾（リンク `[](…)`・太字 `**`・斜体 `*`・取り消し線 `~~`・
     *   下線 `++`）の内側のどこかにある間: その要素を生Markdownのテキストへ展開し、
     *   記法ごと直接修正できるようにする
     * - キャレットが展開中のspanの外へ出た時点: レンダリング表示へ戻して確定する
     * 展開中は記法が見えているため、次に入力する文字を装飾の内側／外側どちらに含めるかは
     * キャレットを記法の内側／外側どちらへ置くかで示せる（例: `**太字**` の `**` より内側に
     * 置けば装飾が続き、外側へ置き直せば装飾から抜ける）。
     * 選択範囲がある場合も開始位置（`startContainer`）の所属で判定するため、
     * 展開中のテキストをドラッグ選択して編集できる。
     * 戻り値: DOMを変更した場合 true
     */
    function syncRawMarkdownToCaret() {
        const selection = window.getSelection();

        // 範囲選択（非collapsed）の間は生Markdownの展開・折り畳みを行わない。
        // 展開／折り畳みはDOMを書き換えて進行中の選択を破棄するため、マウスドラッグで
        // 装飾（`**太字**` 等）をまたいで本文を選択・コピーしようとすると、装飾に
        // 到達した瞬間に選択が解除されてしまう。生Markdown表示は「キャレット位置」を
        // 示す機能であり範囲選択中は不要なので、選択がある間は一切触らない。
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            return false;
        }

        const start = (selection && selection.rangeCount > 0)
            ? selection.getRangeAt(0).startContainer
            : null;
        const inEditor = !!start && state.editor.contains(start);
        const active = inEditor ? utils.findAncestor(start, isRawMarkdownSpan) : null;

        // キャレットが外れた展開中のspanを戻す（エディタ外へフォーカスが移った場合も含む）
        let changed = false;
        Array.prototype.forEach.call(
            state.editor.querySelectorAll('.' + RAW_MARKDOWN_CLASS),
            function(span) {
                if (span !== active) {
                    collapseRawMarkdown(span);
                    changed = true;
                }
            }
        );

        if (!inEditor || active) {
            return changed;
        }

        const target = outermostInlineDecoration(start);
        if (!target) {
            return changed;
        }

        // 装飾内のテキストでの相対位置を保つ。展開後は先頭に記法（`**` や `[`）が付くため、
        // 生Markdown内での本文の開始位置（＝記法の文字数）だけキャレットを後ろへずらす。
        const offset = utils.getTextBeforeCaret(target, selection.getRangeAt(0)).length;
        const text = target.textContent;
        const span = expandToRaw(target);
        const prefix = text ? Math.max(span.textContent.indexOf(text), 0) : 0;
        utils.placeCaretAt(span, offset + prefix);
        return true;
    }

    /**
     * 指定コンテナ内のキャレット位置へ<br>を挿入して改行する（引用・アラート本文で共用）。
     * 挿入した<br>の後ろに内容が無い場合、末尾の<br>は描画上の改行として見えない
     * （1回の操作でキャレットが進まない）ため、プレースホルダの<br>を補う。
     * シリアライズ時は末尾の空行として除去される。
     */
    function insertLineBreak(container, range, selection) {
        const br = document.createElement('br');
        range.deleteContents();
        range.insertNode(br);
        const rest = document.createRange();
        rest.setStartAfter(br);
        rest.setEnd(container, container.childNodes.length);
        if (rest.toString().length === 0 &&
            !rest.cloneContents().querySelector('br')) {
            br.after(document.createElement('br'));
        }
        range.setStartAfter(br);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
     * アラートbox（`.markdown-alert`）の本文内でのEnter / Shift+Enterを処理する。
     * - 本文末尾でのEnter: boxを抜けて後続の段落へ移る（キーボードだけで抜けられるように）
     * - 本文の途中でのEnter / Shift+Enter: 本文内に改行（<br>）を挿入して継続する
     * ブラウザ既定のEnterは本文divを分割してbox構造を壊すため、本文内では常に自前で処理する。
     */
    function handleAlertEnter(event) {
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey ||
            event.altKey || event.isComposing) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        const body = utils.findAncestor(range.startContainer, function(el) {
            return el.classList && el.classList.contains('markdown-alert-body');
        });
        if (!body) {
            return false;
        }

        // 末尾でのEnter: boxを抜けて後続の段落へ
        const textBefore = utils.getTextBeforeCaret(body, range);
        if (!event.shiftKey && textBefore.length >= body.textContent.length) {
            const alertEl = utils.findAncestor(body, function(el) {
                return el.classList && el.classList.contains('markdown-alert');
            });
            if (alertEl) {
                event.preventDefault();
                const p = document.createElement('p');
                p.appendChild(document.createElement('br'));
                alertEl.after(p);
                utils.placeCaretAt(p, 0);
                state.editor.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        }

        // 本文の途中、およびShift+Enter: 本文内で改行
        event.preventDefault();
        insertLineBreak(body, range, selection);
        return true;
    }

    /**
     * 引用ブロック内でのEnter / Shift+Enterを処理する。
     * - Shift+Enter: 引用内に改行（<br>）を挿入して引用を継続する
     * - Enter: キャレットが引用の末尾にあるとき、引用を抜けて後続の段落へ移る
     *   （末尾以外での分割は実機依存のため、この段階では何もしない）
     */
    function handleBlockquoteEnter(event) {
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        const bq = utils.findAncestor(range.startContainer, function(el) {
            return el.tagName === 'BLOCKQUOTE';
        });
        if (!bq) {
            return false;
        }

        // Shift+Enter: 引用内で改行
        if (event.shiftKey) {
            event.preventDefault();
            insertLineBreak(bq, range, selection);
            return true;
        }

        // Enter: 末尾にいるときだけ引用を抜ける
        const outer = outermostBlockquote(bq);
        const textBefore = utils.getTextBeforeCaret(outer, range);
        if (textBefore.length < outer.textContent.length) {
            return false;
        }

        event.preventDefault();
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        outer.after(p);
        utils.placeCaretAt(p, 0);
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    /**
     * タスクリスト項目内でのEnterを処理する。
     * ブラウザ標準のli分割ではチェックボックス（contenteditable=false）が
     * 新しい行に引き継がれないため、通常リストと同じ挙動を自前で実装する。
     * - 項目に本文があるとき: キャレット位置で分割し、次の行に未チェックの項目を作る
     * - 項目が空のとき: 項目を削除してリストを抜ける（通常リストのEnterと同じ）
     */
    function handleTaskListEnter(event) {
        if (event.key !== 'Enter' || event.shiftKey ||
            event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        const li = utils.findAncestor(range.startContainer, function(el) {
            return el.tagName === 'LI' &&
                el.classList && el.classList.contains('task-list-item');
        });
        if (!li) {
            return false;
        }

        event.preventDefault();
        if (!range.collapsed) {
            range.deleteContents();
        }

        const list = li.parentElement;

        // 空項目: 項目を削除してリストを抜ける（後続項目があればリストを分割）
        if (li.textContent.trim() === '') {
            const p = document.createElement('p');
            p.appendChild(document.createElement('br'));
            if (li.nextElementSibling) {
                const rest = list.cloneNode(false);
                while (li.nextSibling) {
                    rest.appendChild(li.nextSibling);
                }
                list.after(p);
                p.after(rest);
            } else {
                list.after(p);
            }
            li.remove();
            if (!list.querySelector('li')) {
                list.remove();
            }
            utils.placeCaretAt(p, 0);
            state.editor.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }

        // 本文あり: キャレット以降を新しいタスク項目へ移す
        const newLi = document.createElement('li');
        newLi.className = 'task-list-item';
        newLi.appendChild(createTaskCheckbox(false));
        const spacer = document.createTextNode(' ');
        newLi.appendChild(spacer);

        const tail = document.createRange();
        tail.setStart(range.startContainer, range.startOffset);
        tail.setEnd(li, li.childNodes.length);
        // キャレットがチェックボックスより前にある場合、既存のチェックボックスを
        // 移動対象に含めない
        const ownCheckbox = li.querySelector(':scope > input.task-checkbox');
        if (ownCheckbox && tail.intersectsNode(ownCheckbox)) {
            tail.setStartAfter(ownCheckbox);
        }
        newLi.appendChild(tail.extractContents());

        li.after(newLi);
        setCaretInText(spacer, 1);
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    /**
     * --- / *** / ___ の直後にEnterで水平線化
     */
    function handleHorizontalRule(event) {
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        const block = utils.findBlockAncestor(range.startContainer);
        if (!block) {
            return false;
        }

        // リスト項目内では変換しない（リスト記法と紛らわしいため）
        if (block.tagName === 'LI') {
            return false;
        }

        const text = block.textContent.trim();
        if (!/^(-{3,}|\*{3,}|_{3,})$/.test(text)) {
            return false;
        }

        event.preventDefault();
        event.stopPropagation();

        const hr = document.createElement('hr');
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        block.replaceWith(hr);
        hr.after(p);
        utils.placeCaretAt(p, 0);

        // 変換結果を文書へ書き戻すため入力イベントを発火
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    /**
     * ``` の直後にEnterでコードブロック化
     */
    function handleCodeFence(event) {
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        const block = utils.findBlockAncestor(range.startContainer);
        if (!block) {
            return false;
        }

        const text = block.textContent.trim();
        const match = /^```(\S+)?$/.exec(text);
        if (!match) {
            return false;
        }

        event.preventDefault();
        event.stopPropagation();

        const language = (match[1] || '').trim();
        const safeClass = language.replace(/[^\w-]+/g, '');

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        if (language) {
            code.setAttribute('data-lang', language);
        }
        if (safeClass) {
            code.classList.add(`language-${safeClass}`);
        }

        const textNode = document.createTextNode(state.ZERO_WIDTH);
        code.appendChild(textNode);
        pre.appendChild(code);

        state.isCreatingCodeBlock = true;
        block.replaceWith(pre);
        decorateCodeBlocks();

        function placeCaretInCode() {
            const sel = window.getSelection();
            const r = document.createRange();
            r.setStart(textNode, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        }

        placeCaretInCode();

        setTimeout(() => {
            placeCaretInCode();
            state.editor.focus();
        }, 0);

        setTimeout(() => {
            placeCaretInCode();
        }, 10);

        setTimeout(() => {
            placeCaretInCode();
        }, 50);

        setTimeout(() => {
            state.isCreatingCodeBlock = false;
        }, 200);

        return true;
    }

    /**
     * 見出しの確定処理（Enterキーで確定）
     */
    function handleHeadingConfirm(event) {
        // IME変換確定のEnter（`event.isComposing`）では処理しない。日本語入力で
        // 「## ああ」の「ああ」を変換確定するEnterでDOMを書き換えると、直後にIMEが
        // 確定テキストを挿入して見出しテキストが複製される（改行後に「ああ」が重複）。
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey ||
            event.altKey || event.shiftKey || event.isComposing) {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);

        // 既にレンダリング済みの見出し（h1〜h6）内でEnterが押された場合の処理。
        // findBlockAncestor は見出しをブロックとして扱わないため、ここで捕まえないと
        // ブラウザ既定のEnter処理に委ねられ、見出しテキストが複製されてしまう
        // （`## ああ` で確定後にエンターすると新しい行にも「ああ」が出るバグ）。
        const heading = utils.findAncestor(range.startContainer,
            (el) => /^H[1-6]$/.test(el.tagName));
        if (heading) {
            // 見出し内でのEnterは自前で処理する。ブラウザ既定の分割・複製を防ぐため、
            // 実際に処理できる場合のみ preventDefault する。
            const done = confirmRenderedHeading(heading, range, selection);
            if (done) {
                event.preventDefault();
                event.stopPropagation();
            }
            return done;
        }

        const block = utils.findBlockAncestor(range.startContainer);
        if (!block) {
            return false;
        }

        const text = block.textContent;
        const match = /^(#{1,6})\s+(.*)$/.exec(text);
        if (!match) {
            return false;
        }

        event.preventDefault();
        event.stopPropagation();

        const level = match[1].length;
        const content = match[2];
        const hashMarks = '#'.repeat(level);

        const h = document.createElement(`h${level}`);

        const hashSpan = document.createElement('span');
        hashSpan.className = 'heading-hash';
        hashSpan.textContent = hashMarks + ' ';
        h.appendChild(hashSpan);

        const contentText = document.createTextNode(content);
        h.appendChild(contentText);

        block.replaceWith(h);

        const newP = document.createElement('p');
        const br = document.createElement('br');
        newP.appendChild(br);
        h.insertAdjacentElement('afterend', newP);

        const newRange = document.createRange();
        newRange.setStart(newP, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        state.editor.focus();

        state.editor.dispatchEvent(new Event('input', { bubbles: true }));

        return true;
    }

    /**
     * 既にレンダリング済みの見出し要素内でEnterが押されたときの確定処理。
     * キャレット以降の内容を新しい段落へ切り出し、見出し直下に挿入してから
     * キャレットをその段落へ移す。キャレットが見出し末尾なら空段落を作る。
     * ブラウザ既定のEnter処理（見出しの複製・分割）を防ぐために preventDefault する。
     */
    function confirmRenderedHeading(heading, range, selection) {
        // 見出しのアンカー用 `#` スパンより前にはキャレットを置けない扱いにする
        // （安全のため、切り出しは見出しの範囲内に限定する）。
        const afterRange = document.createRange();
        afterRange.setStart(range.startContainer, range.startOffset);
        afterRange.setEnd(heading, heading.childNodes.length);

        // キャレットが見出しの外を指していた場合は何もしない（保険）。
        if (!heading.contains(afterRange.startContainer)) {
            return false;
        }

        const frag = afterRange.extractContents();

        const newP = document.createElement('p');
        if (frag.textContent.length > 0) {
            newP.appendChild(frag);
        } else {
            newP.appendChild(document.createElement('br'));
        }
        heading.insertAdjacentElement('afterend', newP);

        const newRange = document.createRange();
        newRange.setStart(newP, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        state.editor.focus();

        state.editor.dispatchEvent(new Event('input', { bubbles: true }));

        return true;
    }

    /**
     * インラインマークダウンを即時反映
     */
    function applyInlineFormatting() {
        // contenteditableは入力中のテキストを複数の隣接テキストノードに分割するため、
        // `**` の開始と終了が別ノードに割れて convertInlineText の正規表現にマッチしない
        // ことがある。隣接テキストノードを結合してから走査する（要素境界はまたがない）。
        state.editor.normalize();
        const taskResult = convertTaskLists(state.editor);
        const alertResult = convertAlerts(state.editor);
        // ブロック数式（`$$…$$`）は walkInline より前に変換する（インライン走査が
        // `$$` 行のテキストへ触れないよう、先に math-block へ畳んでおく）。
        const mathBlockResult = convertMathBlocks(state.editor);
        const inlineResult = walkInline(state.editor);
        return {
            didFormat: taskResult.didFormat || alertResult.didFormat ||
                mathBlockResult.didFormat || inlineResult.didFormat,
            caretHandled: taskResult.caretHandled || alertResult.caretHandled ||
                mathBlockResult.caretHandled || inlineResult.caretHandled
        };
    }

    /**
     * チェックボックス要素（レンダリング時と同じ構造）を生成する
     */
    function createTaskCheckbox(checked) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'task-checkbox';
        input.setAttribute('contenteditable', 'false');
        if (checked) {
            input.checked = true;
            input.setAttribute('checked', '');
        }
        return input;
    }

    /**
     * 要素直下の先頭テキストノードを返す。
     * 先頭が要素（既存チェックボックスや <strong> 等）やBRの場合はnull。
     */
    function leadingTextNode(el) {
        let node = el.firstChild;
        while (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.length > 0) {
                    return node;
                }
                node = node.nextSibling;
                continue;
            }
            return null;
        }
        return null;
    }

    /**
     * 指定テキストノードのoffset位置にキャレットを置く
     */
    function setCaretInText(textNode, offset) {
        const selection = window.getSelection();
        if (!selection) {
            return;
        }
        const range = document.createRange();
        range.setStart(textNode, Math.min(offset, textNode.textContent.length));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * タスクリスト記法（[ ] / [] / [x]）をライブでチェックボックスへ変換する。
     * ファイル読込時のパーサ（markdownToHtml）は `- [ ] ` しか解釈しないため、
     * 入力中にGUIへ反映されない問題を補う。
     * - 既存の li の先頭が [ ] / [] / [x] の場合: チェックボックスを差し込む
     *   （`- [ ]` / `- []` を入力したケース。`- ` で handleAutoBlock が li 化済み）
     * - リスト化されていない段落の先頭が -[] / -[ ] / -[x] の場合: タスクリスト化する
     *   （`-[]` のようにスペース無しで handleAutoBlock が発火しなかったケース）
     * いずれもキャレットはチェックボックス直後（本文の先頭）へ移動する。
     */
    function convertTaskLists(root) {
        let didFormat = false;
        let caretHandled = false;

        // 記法トークン: [ ] / [] / [x] / [X]（閉じ括弧の直後はスペースか行末）
        const TASK_RE = /^(\[[ xX]?\])(\s|$)/;

        // --- ケース1: 既存の li 先頭 ---
        const lis = Array.prototype.slice.call(root.querySelectorAll('li'));
        lis.forEach(function(li) {
            const textNode = leadingTextNode(li);
            if (!textNode) {
                return;
            }
            const m = TASK_RE.exec(textNode.textContent);
            if (!m) {
                return;
            }
            const checked = /x/i.test(m[1]);
            textNode.textContent = textNode.textContent.slice(m[0].length);
            li.classList.add('task-list-item');
            li.insertBefore(document.createTextNode(' '), li.firstChild);
            li.insertBefore(createTaskCheckbox(checked), li.firstChild);
            setCaretInText(textNode, 0);
            caretHandled = true;
            didFormat = true;
        });

        // --- ケース2: リスト化されていない段落先頭（-[] 等） ---
        const blocks = Array.prototype.slice.call(root.children);
        blocks.forEach(function(block) {
            if (block.tagName !== 'P' && block.tagName !== 'DIV') {
                return;
            }
            const textNode = leadingTextNode(block);
            if (!textNode) {
                return;
            }
            const m = /^([-*])\s?(\[[ xX]?\])(\s|$)/.exec(textNode.textContent);
            if (!m) {
                return;
            }
            const checked = /x/i.test(m[2]);
            textNode.textContent = textNode.textContent.slice(m[0].length);

            const ul = document.createElement('ul');
            const li = document.createElement('li');
            li.className = 'task-list-item';
            li.appendChild(createTaskCheckbox(checked));
            li.appendChild(document.createTextNode(' '));
            while (block.firstChild) {
                li.appendChild(block.firstChild);
            }
            ul.appendChild(li);
            block.replaceWith(ul);
            setCaretInText(textNode, 0);
            caretHandled = true;
            didFormat = true;
        });

        return { didFormat: didFormat, caretHandled: caretHandled };
    }

    /**
     * GitHubアラート（`> [!NOTE]` 等）をライブでアラートboxへ変換する。
     * ファイル読込時のパーサ（markdownToHtml）でしか解釈されず、手入力・ペーストでは
     * Raw切替や再読込までGUIに反映されない問題を補う（タスクリストのライブ変換と同じ方針）。
     *
     * 対象はエディタ直下のブロック（blockquote / p / div）。要素を一度Markdownへ
     * シリアライズして markdownToHtml に通し、「単一のアラートdiv」になった場合のみ
     * 置き換える。判定・生成をファイル読込時と同一のコード（tryBuildAlertHtml）に
     * 委ねるため、ライブ変換と読込時で挙動が食い違わない。
     * - `> [!NOTE]` → handleAutoBlock でblockquote化済みのケース
     * - `>[!NOTE]`（スペース無し）→ blockquote化されず平文段落のままのケース
     * キャレットが変換対象内にあった場合は本文（.markdown-alert-body）末尾へ移動する。
     */
    function convertAlerts(root) {
        let didFormat = false;
        let caretHandled = false;

        const selection = window.getSelection();
        const anchor = selection && selection.rangeCount > 0
            ? selection.getRangeAt(0).startContainer
            : null;

        const blocks = Array.prototype.slice.call(root.children);
        blocks.forEach(function(block) {
            const tag = block.tagName;
            if (tag !== 'BLOCKQUOTE' && tag !== 'P' && tag !== 'DIV') {
                return;
            }
            // 変換済みアラートやテーブル・Mermaid等のUIコンテナ（class付きdiv）は対象外
            if (tag === 'DIV' && block.classList.length > 0) {
                return;
            }
            // 安価な事前判定: マーカー文字列を含まないブロックはスキップ
            if (block.textContent.indexOf('[!') === -1) {
                return;
            }

            // 要素をMarkdown化→再パース。アラート成立条件（先頭行がマーカーのみ・
            // 全行レベル1）を満たす場合だけ単一の .markdown-alert div が返る
            const md = markdown.htmlToMarkdown(block.outerHTML);
            const temp = document.createElement('div');
            temp.innerHTML = markdown.markdownToHtml(md);
            if (temp.children.length !== 1 ||
                !temp.firstElementChild.classList.contains('markdown-alert')) {
                return;
            }

            const alertEl = temp.firstElementChild;
            const body = alertEl.querySelector('.markdown-alert-body');
            // 本文が空でもキャレットを置けるようゼロ幅文字を入れる
            // （シリアライズ時は stripZeroWidth で除去されるため保存内容には影響しない）
            if (body && body.childNodes.length === 0) {
                body.appendChild(document.createTextNode(state.ZERO_WIDTH));
            }

            const hadCaret = anchor !== null && block.contains(anchor);
            block.replaceWith(alertEl);
            didFormat = true;

            if (hadCaret && body && selection) {
                const range = document.createRange();
                range.selectNodeContents(body);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                caretHandled = true;
            }
        });

        return { didFormat: didFormat, caretHandled: caretHandled };
    }

    /**
     * ブロック数式のライブ変換用に「本文だけの平文ブロック」（class無しの P / DIV）か判定する。
     * 変換済みの math-block やテーブル・Mermaid等のUIコンテナ（class付き）は対象外。
     */
    function isPlainMathLineBlock(el) {
        if (!el) {
            return false;
        }
        const tag = el.tagName;
        if (tag !== 'P' && tag !== 'DIV') {
            return false;
        }
        if (el.classList && el.classList.length > 0) {
            return false;
        }
        return true;
    }

    /**
     * ブロック数式（`$$ … $$`）のライブ変換。
     *
     * インライン数式 `$…$` は convertInlineText が入力時に変換するが、複数行にまたがる
     * `$$…$$` は読込時の markdownToHtml か既存 raw-math-block の collapse でしか math-block
     * 化されず、WYSIWYG上で新規入力した `$$…$$` は段落のまま残っていた。その状態で書き戻すと
     * serializeInline が各 `$` を `\$` へエスケープして生ファイルが破損する。これを防ぐため、
     * 閉じ `$$` を入力した時点で `$$` 行〜`$$` 行のブロック列を math-block へ変換する。
     *
     * エディタ直下の平文ブロック（class無しの P / DIV）だけを対象に、単独の `$$` 行を開き、
     * その先へ現れる次の単独 `$$` 行を閉じとして扱う（間の平文ブロックが式本文。読込時に
     * markdownToHtml が `$$…$$` を1つの math-block にするのと同じ範囲）。式は生テキストのまま
     * 集めて `buildMathBlockHtml`（読込時と同じ生成関数）へ渡すため、`$` はエスケープされない。
     * キャレットが変換範囲内にあれば、`contenteditable="false"` の math-block へは入れないので
     * 直後へ空段落を1つ挿入してそこへ移す（見出し確定と同じ考え方）。
     */
    function convertMathBlocks(root) {
        const selection = window.getSelection();
        const anchor = selection && selection.rangeCount > 0
            ? selection.getRangeAt(0).startContainer
            : null;

        const blocks = Array.prototype.slice.call(root.children);
        for (let i = 0; i < blocks.length; i++) {
            const open = blocks[i];
            if (!isPlainMathLineBlock(open) || open.textContent.trim() !== '$$') {
                continue;
            }

            // 開き `$$` の先へ、平文ブロックが続く限り閉じ `$$` を探す
            let closeIdx = -1;
            for (let j = i + 1; j < blocks.length; j++) {
                if (!isPlainMathLineBlock(blocks[j])) {
                    break; // 非平文ブロック（テーブル等）に当たったら打ち切り
                }
                if (blocks[j].textContent.trim() === '$$') {
                    closeIdx = j;
                    break;
                }
            }
            if (closeIdx === -1) {
                continue; // 閉じ `$$` がまだ無い（入力途中）
            }

            // 間の平文ブロックの生テキストを式本文として集める（$ はエスケープしない）
            const lines = [];
            for (let k = i + 1; k < closeIdx; k++) {
                lines.push(blocks[k].textContent);
            }
            const expr = lines.join('\n').trim();

            const holder = document.createElement('div');
            holder.innerHTML = markdown.buildMathBlockHtml(expr);
            const mathBlock = holder.firstElementChild;
            if (!mathBlock) {
                continue;
            }

            const hadCaret = anchor !== null && blocks.slice(i, closeIdx + 1).some(function (b) {
                return b === anchor || b.contains(anchor);
            });

            open.parentNode.insertBefore(mathBlock, open);
            for (let k = i; k <= closeIdx; k++) {
                blocks[k].remove();
            }
            renderMath(mathBlock.parentNode);

            let caretHandled = false;
            if (hadCaret && selection) {
                // math-block は contenteditable=false でキャレットを保持できないため、
                // 直後に空段落を1つ挿入してそこへキャレットを移す
                const p = document.createElement('p');
                p.appendChild(document.createElement('br'));
                mathBlock.parentNode.insertBefore(p, mathBlock.nextSibling);
                const range = document.createRange();
                range.setStart(p, 0);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                caretHandled = true;
            }

            // 1回のinputで1ブロック変換すれば十分（indexがずれるため走査を終える）
            return { didFormat: true, caretHandled: caretHandled };
        }

        return { didFormat: false, caretHandled: false };
    }

    /**
     * テキストノードの直近ブロック祖先タグ名を返す（脚注参照ライブ変換の対象判定用）。
     * markdown.js の markdownToHtml は段落（<p>）変換にだけ footnoteInfo.labels を渡しており、
     * 見出し・リスト項目・テーブルセル・引用・アラート本文はいずれも脚注参照を変換しない
     * （それらの内容は<p>で包まれず各タグ直下に置かれる）。ライブ変換をこの仕様に揃えないと、
     * 編集中は見出し等でも脚注リンクに見えるのに保存/再読込で消える非対称が生じる。
     */
    function nearestBlockTag(node) {
        let current = node.parentNode;
        while (current && current !== state.editor) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                const tag = current.tagName;
                if (tag === 'P' || tag === 'LI' || tag === 'BLOCKQUOTE' || tag === 'TD' || tag === 'TH' ||
                    tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' ||
                    tag === 'H6' || tag === 'DIV' || tag === 'SECTION') {
                    return tag;
                }
            }
            current = current.parentNode;
        }
        return null;
    }

    /**
     * インラインフォーマットを適用
     */
    function walkInline(root) {
        const selection = window.getSelection();
        const focusNode = selection ? selection.focusNode : null;

        // 脚注参照（[^label]）のライブ変換対象ラベル集合。すでに脚注一覧
        // セクション（section.footnotes、markdownToHtmlの再パースで生成される）が
        // 存在するラベルだけを対象にする＝軽量な1回のDOMクエリで済ませる意図的な
        // 制約（「参照・定義とも今まさに入力中で、まだ一度も保存/Raw切替を経て
        // いない」新規の脚注ペアはこの場ではライブ変換されず、保存や再読込時に
        // markdownToHtmlが変換する）。
        const footnoteLabels = new Set();
        root.querySelectorAll('section.footnotes li[data-footnote-label]').forEach(function (li) {
            const label = li.getAttribute('data-footnote-label');
            if (label) {
                footnoteLabels.add(label);
            }
        });

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const toReplace = [];
        let caretHandled = false;

        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (utils.shouldSkipInline(node)) {
                continue;
            }

            const labelsForNode = nearestBlockTag(node) === 'P' ? footnoteLabels : null;
            const converted = convertInlineText(node.textContent, labelsForNode);
            if (converted !== node.textContent) {
                toReplace.push({ node, html: converted });
            }
        }

        toReplace.forEach(({ node, html }) => {
            const span = document.createElement('span');
            span.innerHTML = html;
            let lastInserted = null;
            while (span.firstChild) {
                lastInserted = span.firstChild;
                node.parentNode.insertBefore(span.firstChild, node);
            }
            node.parentNode.removeChild(node);

            if (!caretHandled && node === focusNode && lastInserted) {
                const range = document.createRange();
                range.setStartAfter(lastInserted);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                caretHandled = true;
            }
        });

        return {
            didFormat: toReplace.length > 0,
            caretHandled
        };
    }

    /**
     * 未エスケープの入力テキストを属性値へ埋め込める形へ変換する。
     * `&`/`<`/`>` を実体参照にし、属性を閉じてしまう `"` も潰す
     * （読込パスの `escapeHtml`＋`escapeAttr` と同じ結果になる）。
     * @param {string} text
     * @returns {string}
     */
    function attrValue(text) {
        return markdown.escapeHtml(String(text == null ? '' : text))
            .replace(/"/g, '&quot;');
    }

    /**
     * インラインテキストを変換
     */
    function convertInlineText(text, footnoteLabels) {
        // インラインコードを先にプレースホルダ（NUL文字＋通し番号）へ退避し、
        // コード内の文字列に他のインライン整形（リンク・強調・取り消し線など）が
        // 適用されて `**太字**` 等が装飾に化けるのを防ぐ。整形後に復元する。
        // markdown.js の convertInline と同じ保護方針。
        const codeSpans = [];
        let html = text.replace(/`([^`]+)`/g, function (_m, p1) {
            codeSpans.push(p1);
            return '\u0000' + (codeSpans.length - 1) + '\u0000';
        });

        // エスケープされたドル記号を退避する。素の $ は数式の開始として扱うため、
        // 通常のドル記号（$100 など）を書きたい場合は \$100 と書く仕様。
        // markdown.js の convertInline と同じ退避順序（\$ → 数式 → 復元）に揃える。
        // 対象は2形態: 入力されたままの `\$` と、読み込み時に convertInline が
        // 「エスケープ由来の $」として展開したゼロ幅スペース付きの `$`（$ + ZERO_WIDTH）。
        // どちらもゼロ幅スペース付きで復元することで、同じテキストノードに複数あっても
        // `$…$` がインライン数式として誤変換されない（バックスラッシュ消失バグの根本対処）。
        const escapedDollars = [];
        html = html.replace(new RegExp('\\\\\\$|\\$' + state.ZERO_WIDTH, 'g'), function () {
            escapedDollars.push('$' + state.ZERO_WIDTH);
            return '' + (escapedDollars.length - 1) + '';
        });

        // インライン数式（$...$）。閉じ `$` を打った時点で math-inline コンテナへ変換する
        // （閉じが無いうちは正規表現がマッチしないため、入力途中で式が壊れない）。
        // 中身は生のまま data-math に保持して要素ごとプレースホルダへ退避し、`$a_1$` の
        // `_` などが後続の強調変換に化けるのを防ぐ（インラインコード退避と同じ方針）。
        // 実レンダリング（KaTeX）は編集イベントの最後に mathModule.render が data-math を
        // 読んで行う（markdown.js と同じ役割分担）。入力テキストは未エスケープのため、
        // 属性値は escapeHtml と " のエスケープを施す。
        const mathSpans = [];
        html = html.replace(/\$([^$\n]+)\$/g, function (_m, expr) {
            const attr = markdown.escapeHtml(expr).replace(/"/g, '&quot;');
            mathSpans.push('<span class="math-inline" data-math="' + attr +
                '" contenteditable="false"></span>');
            return '' + (mathSpans.length - 1) + '';
        });

        // 画像（![alt](url)）。リンクより先に処理して `![` を `!`＋リンクに割らない。
        // 入力テキストは未エスケープのため属性値は escapeHtml＋" を潰す（数式と同方針）。
        const imgSpans = [];
        html = html.replace(/!\[([^\]]*)]\(([^)]+)\)/g, function (_m, alt, dest) {
            const d = markdown.parseLinkDestination(dest);
            const s = attrValue(d.url);
            const a = attrValue(alt);
            imgSpans.push('<img src="' + s + '" alt="' + a + '"' +
                markdown.buildTitleAttr(d.title, attrValue) + '>');
            return '' + (imgSpans.length - 1) + '';
        });

        // リンク（`(url "title")` のタイトルは title 属性へ分離する）
        html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, function (_m, text, dest) {
            const d = markdown.parseLinkDestination(dest);
            return '<a href="' + attrValue(d.url) + '"' +
                markdown.buildTitleAttr(d.title, attrValue) + '>' + text + '</a>';
        });

        // 脚注参照（[^label]）。対応する脚注定義がすでにエディタ内に存在する場合
        // （footnoteLabelsに含まれるラベル）のみ変換し、無ければリテラルテキストの
        // まま残す（markdown.jsのconvertInlineと同じ判定方針。`(?!:)`で定義行自身の
        // 体裁を誤って参照変換しない）。他の記法（コード・数式・画像・エスケープ$）と
        // 同様、ここでは実HTMLを直接埋め込まずデリミタ付きプレースホルダへ退避する。
        // 理由: この時点ではまだ数式/画像/太字/斜体などの変換が残っており、実HTMLを
        // 埋めるとその中の `_` や `*` などが後続の変換に巻き込まれたり、逆に数式/画像の
        // 復元（下記）が完了したあとの属性値に `[^label]` 相当の文字列がたまたま含まれて
        // いた場合に誤って再変換されてしまう。プレースホルダ化しておけば両方を防げる。
        const footnoteSpans = [];
        if (footnoteLabels) {
            html = html.replace(/\[\^([A-Za-z0-9_-]+)\](?!:)/g, function (match, label) {
                if (!footnoteLabels.has(label)) {
                    return match;
                }
                footnoteSpans.push('<sup class="footnote-ref" data-footnote-label="' + label + '">' +
                    '<a href="#fn-' + label + '" id="fnref-' + label + '">' + label + '</a></sup>');
                return '' + (footnoteSpans.length - 1) + '';
            });
        }

        // 下線（++text++）
        html = html.replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>');

        // 取り消し線（~~text~~）
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // 太字
        html = html.replace(/(\*\*|__)([^*]+?)\1/g, '<strong>$2</strong>');

        // 斜体
        html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
        html = html.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');

        // 退避した画像を <img> として復元（属性中の記法文字を強調変換から守った）
        html = html.replace(/(\d+)/g, function (_m, i) {
            return imgSpans[Number(i)];
        });

        // 退避した数式を復元（中身は整形しない。KaTeXでのレンダリングは mathModule が行う）
        html = html.replace(/(\d+)/g, function (_m, i) {
            return mathSpans[Number(i)];
        });

        // 退避した \$ をリテラルのドル記号として復元（この時点なら数式判定は済んでいる）
        html = html.replace(/(\d+)/g, function (_m, i) {
            return escapedDollars[Number(i)];
        });

        // 退避した脚注参照を <sup> として復元（デリミタ付きなので他の復元順序に依存しない）
        html = html.replace(/(\d+)/g, function (_m, i) {
            return footnoteSpans[Number(i)];
        });

        // 退避したインラインコードを <code> として復元（中身は整形しない）
        html = html.replace(/\u0000(\d+)\u0000/g, function (_m, i) {
            return '<code>' + codeSpans[Number(i)] + '</code>';
        });

        return html;
    }

    /**
     * 段落・見出しなど「本文だけの単一ブロック」か判定する。
     * これらの部分選択は素のテキストコピー（既定動作）に委ねてよい
     * （リスト・引用・テーブル・コード・数式・Mermaid は記法が失われるため生Markdown化する）。
     */
    function isPlainTextBlock(el) {
        return !!el && (el.tagName === 'P' || /^H[1-6]$/.test(el.tagName));
    }

    /**
     * 選択範囲を生Markdownへ直列化する（コピー／カット用）。
     * WYSIWYG表示のままコピーするとレンダリング後のテキスト（テーブルや数式が潰れた形）に
     * なるため、選択が交差したトップレベルブロックを生Markdownへ直列化して返す。
     *
     * 「表示中のトップレベルブロック」（Mermaidの隠しソースpreは除外）は
     * クリーンクローン（`markdown.getCleanEditorClone`）のトップレベル子要素と 1:1 で
     * 対応する（`computeEditorLineMap` と同じ不変条件）。選択が交差したブロックだけを
     * クリーンクローン側から取り出し、読込／保存と同じ `htmlToMarkdown` で直列化する。
     *
     * 生Markdown化しない（＝既定のコピーに委ねる）場合は null を返す:
     *   - エディタ内に選択が無い／交差ブロックが無い
     *   - 交差ブロックが本文だけの単一ブロック（段落／見出し）の部分選択
     *   - 不変条件が崩れている（トップレベル数の不一致）
     */
    function getSelectedMarkdown(range) {
        if (!range) {
            return null;
        }
        // 単一テーブルセル内に収まる選択はセルのテキストコピー（既定動作）に委ねる
        // （テーブル全体のMarkdown化はセルをまたぐ選択・テーブル外を含む選択のとき）
        const cell = utils.findAncestor(range.commonAncestorContainer, function (el) {
            return el.tagName === 'TD' || el.tagName === 'TH';
        });
        if (cell) {
            return null;
        }
        const liveBlocks = Array.prototype.slice.call(state.editor.children).filter(function (el) {
            return !(el.classList && el.classList.contains('mermaid-source'));
        });
        const clone = markdown.getCleanEditorClone(state.editor);
        const cleanBlocks = Array.prototype.slice.call(clone.children);
        if (liveBlocks.length !== cleanBlocks.length) {
            return null;
        }

        const selected = [];
        for (let i = 0; i < liveBlocks.length; i++) {
            if (range.intersectsNode(liveBlocks[i])) {
                selected.push({ live: liveBlocks[i], clean: cleanBlocks[i] });
            }
        }
        if (selected.length === 0) {
            return null;
        }
        if (selected.length === 1 && isPlainTextBlock(selected[0].live)) {
            return null;
        }

        // 全ブロック選択時は文書全体の直列化（保存内容と一致）
        if (selected.length === cleanBlocks.length) {
            return markdown.htmlToMarkdown(clone.innerHTML).replace(/\s+$/, '');
        }
        const container = document.createElement('div');
        selected.forEach(function (b) {
            container.appendChild(b.clean.cloneNode(true));
        });
        return markdown.htmlToMarkdown(container.innerHTML).replace(/\s+$/, '');
    }

    /**
     * クリップボードのMarkdownテキストをブロック要素へ変換してキャレット位置に挿入する。
     * 貼り付けを既定動作（プレーンテキスト挿入）に任せるとブロック記法（見出し・リスト・
     * コードフェンス・テーブル・ブロック数式・Mermaid）が再読み込みまで描画されないため、
     * 読込時と同じ `markdown.markdownToHtml` でその場で変換する。
     *
     * 取り込まない（＝既定の貼り付けに委ねる）場合は false を返す:
     *   - キャレットがエディタ内に無い
     *   - 変換結果が単一の段落（インラインのみ）: 既定挿入＋inputイベントの
     *     `applyInlineFormatting` で十分なため
     * 取り込んだ場合は true を返す（呼び出し側で preventDefault し、
     * テーブル描画と input イベント発火＝残りのパイプラインを行う）。
     *
     * 挿入位置:
     *   - キャレットが段落内: 段落をキャレット位置で前半/後半に分割し、間へ挿入
     *   - 段落以外のブロック内: そのトップレベルブロックの直後へ挿入
     *   - 構造ブロックで終わる場合は直後に空段落を作りキャレットを置く
     */
    function handleMarkdownPaste(text) {
        if (!text) {
            return false;
        }
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }
        const range = selection.getRangeAt(0);
        if (!state.editor.contains(range.startContainer)) {
            return false;
        }

        // 実パーサーで判定する（ブロック判定の正規表現を重複させない）。
        // 単一段落＝インラインのみは既定動作に委ねる。
        const holder = document.createElement('div');
        holder.innerHTML = markdown.markdownToHtml(utils.normalizeEol(text));
        const blocks = Array.prototype.slice.call(holder.children);
        if (blocks.length === 0) {
            return false;
        }
        if (blocks.length === 1 && blocks[0].tagName === 'P') {
            return false;
        }

        // 選択範囲は上書き（既定の貼り付けと同じ）。
        // deleteContents は選択の始端・終端が内側にあったブロックを空の殻として
        // 残すため（全選択→貼り付けで空見出しや空フェンスが `# ` や ``` として
        // 直列化されてしまう）、選択に交差していたトップレベルブロックを控えておき、
        // 挿入後に空になっていたら取り除く。
        const emptiedShells = [];
        const didDelete = !range.collapsed;
        if (didDelete) {
            Array.prototype.forEach.call(state.editor.children, function (el) {
                if (range.intersectsNode(el)) {
                    emptiedShells.push(el);
                }
            });
            range.deleteContents();
        }

        // 殻の空判定: 見出しの `#` マーク表示用スパン（直列化時に再生成される）は
        // 本文とみなさない
        function shellIsEmpty(el) {
            let text = '';
            el.childNodes.forEach(function (child) {
                if (child.nodeType === Node.ELEMENT_NODE &&
                    child.classList && child.classList.contains('heading-hash')) {
                    return;
                }
                text += child.textContent;
            });
            return text.trim() === '';
        }

        // キャレットを含むトップレベルブロックを特定
        let block = range.startContainer;
        while (block && block !== state.editor && block.parentNode !== state.editor) {
            block = block.parentNode;
        }

        let anchor;      // このノードの直後へ挿入する（nullなら末尾に追加）
        let tail = null; // 段落分割で生じた後半
        let removeBlock = false;
        if (!block || block === state.editor) {
            anchor = state.editor.lastElementChild;
        } else if (block.tagName === 'P') {
            const after = document.createRange();
            after.setStart(range.startContainer, range.startOffset);
            after.setEnd(block, block.childNodes.length);
            const frag = after.extractContents();
            if (frag.textContent.trim() !== '') {
                tail = document.createElement('p');
                tail.appendChild(frag);
            }
            anchor = block;
            // 前半が空になった段落（空段落への貼り付け含む）は挿入後に取り除く
            removeBlock = block.textContent.trim() === '';
        } else {
            anchor = block;
        }

        let ref = anchor;
        blocks.forEach(function (b) {
            if (ref && ref.parentNode === state.editor) {
                state.editor.insertBefore(b, ref.nextSibling);
            } else {
                state.editor.appendChild(b);
            }
            ref = b;
        });
        if (tail) {
            state.editor.insertBefore(tail, ref.nextSibling);
        }
        if (removeBlock) {
            block.remove();
        }
        // 選択削除で空になった殻ブロックを取り除く（中身のあるものはそのまま）。
        // contenteditable=false のウィジェット（数式・Mermaid・テーブル等）は
        // deleteContents で消えないため textContent では判定せず、対象外とする。
        emptiedShells.forEach(function (el) {
            if (el === block || !el.parentNode || el.parentNode !== state.editor) {
                return;
            }
            if (el.tagName === 'HR') {
                return;
            }
            if (el.querySelector &&
                el.querySelector('.math-block, .math-inline, .mermaid-container, ' +
                    '.mermaid-source, table, input.task-checkbox, hr, img')) {
                return;
            }
            // 見出しの `# ` マーク表示用スパンは本文とみなさない（shellIsEmpty で除外）。
            // 生の textContent で判定すると空見出しが `# ` を含むため消えずに残る。
            if (shellIsEmpty(el)) {
                el.remove();
            }
        });

        // キャレット: 後半段落の先頭 → 最後の挿入ブロックの末尾（段落/見出しのとき）
        // → 構造ブロックで終わるときは直後に空段落を作ってそこへ
        let caretRange = document.createRange();
        if (tail) {
            caretRange.setStart(tail, 0);
        } else {
            const last = blocks[blocks.length - 1];
            if (last.tagName === 'P' || /^H[1-6]$/.test(last.tagName)) {
                caretRange.selectNodeContents(last);
                caretRange.collapse(false);
            } else {
                const p = document.createElement('p');
                p.appendChild(document.createElement('br'));
                state.editor.insertBefore(p, last.nextSibling);
                caretRange.setStart(p, 0);
            }
        }
        caretRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caretRange);
        return true;
    }

    // 公開API
    return {
        getSelectedMarkdown: getSelectedMarkdown,
        handleMarkdownPaste: handleMarkdownPaste,
        isHighlightJsReady: isHighlightJsReady,
        applySyntaxHighlighting: applySyntaxHighlighting,
        decorateCodeBlocks: decorateCodeBlocks,
        setupCodeLangEvents: setupCodeLangEvents,
        executeCommand: executeCommand,
        formatHeading: formatHeading,
        insertLink: insertLink,
        applyLinkDialog: applyLinkDialog,
        removeLinkFromDialog: removeLinkFromDialog,
        closeLinkDialog: closeLinkDialog,
        insertCodeBlock: insertCodeBlock,
        insertBlockquote: insertBlockquote,
        insertToc: insertToc,
        buildImageMarkdown: buildImageMarkdown,
        findClipboardImageItem: findClipboardImageItem,
        insertImageMarkdown: insertImageMarkdown,
        scrollToAnchor: scrollToAnchor,
        collectHeadings: collectHeadings,
        getFootnoteDefinitionText: getFootnoteDefinitionText,
        findCurrentHeadingIndex: findCurrentHeadingIndex,
        buildBreadcrumbChain: buildBreadcrumbChain,
        isSlashCommandTrigger: isSlashCommandTrigger,
        handleInlineCodeExitRight: handleInlineCodeExitRight,
        handleAutoBlock: handleAutoBlock,
        handleHorizontalRule: handleHorizontalRule,
        handleCodeFence: handleCodeFence,
        handleHeadingConfirm: handleHeadingConfirm,
        handleBlockquoteEnter: handleBlockquoteEnter,
        handleAlertEnter: handleAlertEnter,
        syncRawMarkdownToCaret: syncRawMarkdownToCaret,
        expandMathToRaw: expandMathToRaw,
        handleMathClick: handleMathClick,
        toggleFrontMatter: toggleFrontMatter,
        handleLinkClick: handleLinkClick,
        handleTaskListEnter: handleTaskListEnter,
        applyInlineFormatting: applyInlineFormatting,
        convertTaskLists: convertTaskLists,
        convertAlerts: convertAlerts,
        convertMathBlocks: convertMathBlocks
    };
})();
