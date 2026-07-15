/**
 * commands.js - コマンド・フォーマット機能モジュール
 * エディタコマンド、キーボードショートカット、インラインフォーマットを担当
 */
window.CommandsModule = (function() {
    'use strict';

    const state = window.EditorState;
    const utils = window.EditorUtils;

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
            if (!copyBtn) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            copyCodeBlock(copyBtn);
        });
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
        }

        state.editor.focus();
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
    function insertLink() {
        const url = prompt('リンクURLを入力してください:', 'https://');
        if (url) {
            document.execCommand('createLink', false, url);
        }
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
     * 先頭プレフィックス入力でブロックを変換
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
        const block = utils.findBlockAncestor(range.startContainer);
        if (!block) {
            // 引用ブロック内で「> 」を入力した場合はネストした引用を作る
            // （findBlockAncestor は BLOCKQUOTE を返さないためここで専用処理する）
            return handleNestedQuote(event, range);
        }

        const textBefore = utils.getTextBeforeCaret(block, range);
        const remaining = block.textContent.slice(textBefore.length).replace(/^\s+/, '');
        const trimmed = textBefore.trim();

        const unordered = /^[-*]$/.test(trimmed);
        const ordered = /^\d+\.$/.test(trimmed);
        const quote = /^>$/.test(trimmed);

        if (!unordered && !ordered && !quote) {
            return false;
        }

        event.preventDefault();

        if (unordered || ordered) {
            const list = document.createElement(ordered ? 'ol' : 'ul');
            const li = document.createElement('li');
            li.textContent = remaining;
            list.appendChild(li);
            block.replaceWith(list);
            utils.placeCaretAt(li, 0);
            return true;
        }

        if (quote) {
            const bq = document.createElement('blockquote');
            bq.textContent = remaining;
            block.replaceWith(bq);
            utils.placeCaretAt(bq, 0);
            return true;
        }

        return false;
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
            const br = document.createElement('br');
            range.deleteContents();
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            state.editor.dispatchEvent(new Event('input', { bubbles: true }));
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
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
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
     * インラインマークダウンを即時反映
     */
    function applyInlineFormatting() {
        // contenteditableは入力中のテキストを複数の隣接テキストノードに分割するため、
        // `**` の開始と終了が別ノードに割れて convertInlineText の正規表現にマッチしない
        // ことがある。隣接テキストノードを結合してから走査する（要素境界はまたがない）。
        state.editor.normalize();
        const taskResult = convertTaskLists(state.editor);
        const inlineResult = walkInline(state.editor);
        return {
            didFormat: taskResult.didFormat || inlineResult.didFormat,
            caretHandled: taskResult.caretHandled || inlineResult.caretHandled
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
     * インラインフォーマットを適用
     */
    function walkInline(root) {
        const selection = window.getSelection();
        const focusNode = selection ? selection.focusNode : null;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const toReplace = [];
        let caretHandled = false;

        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (utils.shouldSkipInline(node)) {
                continue;
            }

            const converted = convertInlineText(node.textContent);
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
     * インラインテキストを変換
     */
    function convertInlineText(text) {
        let html = text;

        // リンク
        html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // インラインコード
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 下線（++text++）
        html = html.replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>');

        // 取り消し線（~~text~~）
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // 太字
        html = html.replace(/(\*\*|__)([^*]+?)\1/g, '<strong>$2</strong>');

        // 斜体
        html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
        html = html.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');

        return html;
    }

    // 公開API
    return {
        isHighlightJsReady: isHighlightJsReady,
        applySyntaxHighlighting: applySyntaxHighlighting,
        decorateCodeBlocks: decorateCodeBlocks,
        setupCodeLangEvents: setupCodeLangEvents,
        executeCommand: executeCommand,
        formatHeading: formatHeading,
        insertLink: insertLink,
        insertCodeBlock: insertCodeBlock,
        insertBlockquote: insertBlockquote,
        handleInlineCodeExitRight: handleInlineCodeExitRight,
        handleAutoBlock: handleAutoBlock,
        handleHorizontalRule: handleHorizontalRule,
        handleCodeFence: handleCodeFence,
        handleHeadingConfirm: handleHeadingConfirm,
        handleBlockquoteEnter: handleBlockquoteEnter,
        applyInlineFormatting: applyInlineFormatting,
        convertTaskLists: convertTaskLists
    };
})();
