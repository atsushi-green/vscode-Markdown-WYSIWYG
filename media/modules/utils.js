/**
 * utils.js - ユーティリティ関数モジュール
 * エディタ全体で使用される共通ヘルパー関数
 */
window.EditorUtils = (function() {
    'use strict';

    const state = window.EditorState;

    /**
     * 改行コードをLFへ正規化
     */
    function normalizeEol(text) {
        return text.replace(/\r\n?/g, '\n');
    }

    /**
     * テキストから単語数・文字数を数える（純粋関数）
     * - words: 空白区切りの語数（英文向け。日本語のように空白を使わない
     *   言語では語数はあくまで目安）
     * - chars: 空白・改行を除いた文字数（日本語でも意味のある指標）。
     *   Unicodeコードポイント単位で数える（絵文字などサロゲートペア対応）。
     */
    function countText(text) {
        const normalized = normalizeEol(text || '');
        const words = (normalized.match(/\S+/g) || []).length;
        const chars = Array.from(normalized.replace(/\s+/g, '')).length;
        return { words: words, chars: chars };
    }

    /**
     * テキストの論理行数を数える（純粋関数）。
     * textareaの行と一致させるため、行区切りは `\n` のみで数える。
     * - 空文字は1行（textareaも空でカーソル行1がある）
     * - 末尾の改行は次の空行を1行として数える（"a\n" は2行）
     * 呼び出し側は事前に normalizeEol 済みを渡す想定だが、
     * 保険として `\r\n?` も1つの改行として扱う。
     */
    function countLines(text) {
        if (!text) {
            return 1;
        }
        return normalizeEol(text).split('\n').length;
    }

    /**
     * 1..count の行番号を改行区切りで並べた文字列を返す（純粋関数）。
     * Rawモードの行番号ガター（`white-space: pre` の1要素）へそのまま流し込む。
     */
    function buildLineNumberText(count) {
        const n = Math.max(1, count | 0);
        const lines = new Array(n);
        for (let i = 0; i < n; i++) {
            lines[i] = String(i + 1);
        }
        return lines.join('\n');
    }

    /**
     * トースト通知を表示
     */
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'mermaid-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 2000);
    }

    /**
     * カーソル位置を保存
     */
    function saveCursorPosition() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return null;
        }

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(state.editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        return {
            offset: preCaretRange.toString().length,
            text: preCaretRange.toString()
        };
    }

    /**
     * カーソル位置を復元
     */
    function restoreCursorPosition(position) {
        if (!position) return;

        const selection = window.getSelection();
        const range = document.createRange();

        try {
            let currentOffset = 0;
            let found = false;

            function findOffset(node) {
                if (found) return;

                if (node.nodeType === Node.TEXT_NODE) {
                    const nodeLength = node.textContent.length;
                    if (currentOffset + nodeLength >= position.offset) {
                        range.setStart(node, position.offset - currentOffset);
                        range.setEnd(node, position.offset - currentOffset);
                        found = true;
                        return;
                    }
                    currentOffset += nodeLength;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    for (let child of node.childNodes) {
                        findOffset(child);
                        if (found) return;
                    }
                }
            }

            findOffset(state.editor);

            if (found) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } catch (e) {
            console.error('Failed to restore cursor position:', e);
        }
    }

    /**
     * 指定した条件に一致する祖先要素を検索
     */
    function findAncestor(start, predicate) {
        let current = start;
        while (current && current !== state.editor) {
            if (current.nodeType === Node.ELEMENT_NODE && predicate(current)) {
                return current;
            }
            current = current.parentNode;
        }
        return null;
    }

    /**
     * ブロックレベルの祖先要素を検索
     */
    function findBlockAncestor(node) {
        let current = node;
        while (current && current !== state.editor) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                const tag = current.tagName;
                if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
                    return current;
                }
            }
            current = current.parentNode;
        }
        return null;
    }

    /**
     * キャレット位置より前のテキストを取得
     */
    function getTextBeforeCaret(block, range) {
        const clone = range.cloneRange();
        clone.selectNodeContents(block);
        clone.setEnd(range.startContainer, range.startOffset);
        return clone.toString();
    }

    /**
     * 指定位置にキャレットを配置
     */
    function placeCaretAt(node, offset) {
        const selection = window.getSelection();
        const range = document.createRange();

        if (!node.firstChild) {
            node.appendChild(document.createTextNode(''));
        }

        const target = node.firstChild;
        range.setStart(target, Math.min(offset, target.textContent.length));
        range.collapse(true);

        selection.removeAllRanges();
        selection.addRange(range);
        // 既にフォーカスがある場合の focus() はブラウザでは何もしないため呼ばない
        // （フォーカス済み要素への再フォーカスで選択が変わる実装もあるため、明示的に避ける）
        if (document.activeElement !== state.editor) {
            state.editor.focus();
        }
    }

    /**
     * コード要素の末尾にテキストノードを確保
     */
    function ensureTrailingTextNode(codeEl) {
        const parent = codeEl.parentNode;
        if (!parent) {
            return null;
        }

        const next = codeEl.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
            return next;
        }

        const text = document.createTextNode(state.ZERO_WIDTH);
        parent.insertBefore(text, codeEl.nextSibling);
        return text;
    }

    /**
     * キャレット位置の前にコード要素があるか確認
     */
    function findCodeBeforeCaret(container, offset) {
        if (!container) {
            return null;
        }

        // キャレットがテキストノード内にいる場合
        if (container.nodeType === Node.TEXT_NODE && container.parentNode) {
            const parent = container.parentNode;
            const idx = Array.prototype.indexOf.call(parent.childNodes, container);
            if (idx > 0) {
                const prev = parent.childNodes[idx - 1];
                if (prev.nodeType === Node.ELEMENT_NODE && prev.nodeName === 'CODE') {
                    return prev;
                }
            }
            return null;
        }

        // キャレットが要素ノード内のオフセット位置にある場合
        if (container.nodeType === Node.ELEMENT_NODE) {
            if (offset === 0) {
                return null;
            }
            const prev = container.childNodes[offset - 1];
            if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.nodeName === 'CODE') {
                return prev;
            }
        }

        return null;
    }

    /**
     * インラインフォーマットをスキップすべきか判定
     * （コードブロック内、および生Markdown表示中のテキストが対象）
     */
    function shouldSkipInline(node) {
        let current = node.parentNode;
        while (current && current !== state.editor) {
            if (current.nodeName === 'CODE' || current.nodeName === 'PRE') {
                return true;
            }
            // 生Markdown表示中（キャレットが記法の内側にある）のテキストは、
            // 編集中に装飾へ戻ってしまわないよう再変換しない。
            // キャレットが外れた時点で commands.syncRawMarkdownToCaret が確定させる。
            if (current.classList && current.classList.contains('raw-markdown')) {
                return true;
            }
            current = current.parentNode;
        }
        return false;
    }

    // 公開API
    return {
        normalizeEol: normalizeEol,
        countText: countText,
        countLines: countLines,
        buildLineNumberText: buildLineNumberText,
        showToast: showToast,
        saveCursorPosition: saveCursorPosition,
        restoreCursorPosition: restoreCursorPosition,
        findAncestor: findAncestor,
        findBlockAncestor: findBlockAncestor,
        getTextBeforeCaret: getTextBeforeCaret,
        placeCaretAt: placeCaretAt,
        ensureTrailingTextNode: ensureTrailingTextNode,
        findCodeBeforeCaret: findCodeBeforeCaret,
        shouldSkipInline: shouldSkipInline
    };
})();
