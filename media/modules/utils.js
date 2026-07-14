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
        state.editor.focus();
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
     */
    function shouldSkipInline(node) {
        let current = node.parentNode;
        while (current && current !== state.editor) {
            if (current.nodeName === 'CODE' || current.nodeName === 'PRE') {
                return true;
            }
            current = current.parentNode;
        }
        return false;
    }

    // 公開API
    return {
        normalizeEol: normalizeEol,
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
