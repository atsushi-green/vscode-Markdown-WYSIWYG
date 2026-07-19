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
    /**
     * トップレベルブロックの署名（先頭テキスト）を返す。ブロックの挿入・並べ替えで
     * `blockIndex` がずれても、署名が一意に一致するブロックを内容で辿って復元できる
     * ようにするための軽量な識別子。空白は畳んで先頭64文字に丸める。
     */
    function blockSignatureOf(node) {
        if (!node) {
            return '';
        }
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        return text.slice(0, 64);
    }

    function saveCursorPosition() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return null;
        }

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(state.editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        // ブロック基準アンカー（第二候補）。キャレットを含むトップレベルブロック
        // （エディタの直接の子）のインデックスと、そのブロック内でのローカル文字数
        // オフセットを保持する。innerHTML 全書き換えで保存ノードが消えても、
        // トップレベルブロックの並びが保たれていれば、このローカルオフセットで
        // 復元できる。グローバル文字数オフセット（キャレットより前にある別ブロックの
        // 埋め込みウィジェット＝数式・Mermaid・テーブルが再描画で文字量を変えると
        // ドリフトする）と違い、キャレットのあるブロックに閉じるぶん頑健。
        let blockIndex = -1;
        let blockOffset = 0;
        let blockSignature = '';
        if (range.endContainer !== state.editor) {
            let topBlock = range.endContainer;
            while (topBlock && topBlock.parentNode !== state.editor) {
                topBlock = topBlock.parentNode;
            }
            if (topBlock && topBlock.parentNode === state.editor) {
                const children = state.editor.childNodes;
                for (let i = 0; i < children.length; i++) {
                    if (children[i] === topBlock) {
                        blockIndex = i;
                        break;
                    }
                }
                const blockRange = range.cloneRange();
                blockRange.selectNodeContents(topBlock);
                blockRange.setEnd(range.endContainer, range.endOffset);
                blockOffset = blockRange.toString().length;
                blockSignature = blockSignatureOf(topBlock);
            }
        }

        return {
            // ノード基準アンカー（第一候補）。DOMがインプレースで書き換えられても
            // このノードが生きていれば、文字数オフセットの走査（埋め込みウィジェットの
            // 内部テキスト量や再描画でずれやすい）を経ずに正確な位置へ戻せる。
            node: range.endContainer,
            nodeOffset: range.endOffset,
            // ブロック基準アンカー（第二候補）。全書き換えでノードが消えても、
            // 同じインデックスのブロックが残っていればブロック内オフセットで戻せる。
            // ブロックが挿入・並べ替えされてインデックスがずれた場合に備え、内容の
            // 署名（先頭テキスト）も保持して一意に一致するブロックを辿れるようにする。
            blockIndex: blockIndex,
            blockOffset: blockOffset,
            blockSignature: blockSignature,
            // 文字数オフセット（最終フォールバック）。上記いずれも使えない場合に使う。
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

        // まずノード基準で復元を試みる。保存時のノードがまだエディタ内に生きていれば
        // （＝インプレースでのDOM変更）、文字数オフセットの走査を経ずに正確な位置へ戻せる。
        // これにより、埋め込みウィジェット（数式・Mermaid・テーブル）の内部テキスト量が
        // 変わっても、キャレットが本来と別の場所（先頭や最寄り）へずれる不具合を避けられる。
        // ノードが消えている場合（innerHTML 全書き換え等）は下のオフセット方式へ委ねる。
        //
        // 対象はテキストノードのみに限定する。要素コンテナ（キャレットが子ノードの
        // 境界にある場合）では nodeOffset は childNodes のインデックスであり、子が
        // インプレースで増減すると古いインデックスが別の境界を指してしまう。要素境界は
        // 従来どおりオフセット方式に委ねた方が安全（文字カレット＝offsetずれの本丸のみ救う）。
        if (position.node &&
            position.node.nodeType === Node.TEXT_NODE &&
            state.editor.contains(position.node)) {
            try {
                const node = position.node;
                const nodeOffset = Math.min(
                    Math.max(position.nodeOffset || 0, 0), node.textContent.length);
                const nodeRange = document.createRange();
                nodeRange.setStart(node, nodeOffset);
                nodeRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(nodeRange);
                return;
            } catch (e) {
                // ノード基準で失敗した場合は従来のオフセット方式へフォールバックする
            }
        }

        // 指定 root 配下のテキストノードを文書順に走査し、targetOffset 文字目の位置を探す。
        // { result: {node, offset} | null, lastTextNode } を返す。result が null なら
        // 目的オフセットに届かなかった（＝本文が短くなった等）。
        function scanOffset(root, targetOffset) {
            let currentOffset = 0;
            let result = null;
            let lastTextNode = null;

            function walk(node) {
                if (result) return;

                if (node.nodeType === Node.TEXT_NODE) {
                    lastTextNode = node;
                    const nodeLength = node.textContent.length;
                    if (currentOffset + nodeLength >= targetOffset) {
                        result = { node: node, offset: targetOffset - currentOffset };
                        return;
                    }
                    currentOffset += nodeLength;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    for (let child of node.childNodes) {
                        walk(child);
                        if (result) return;
                    }
                }
            }

            walk(root);
            return { result: result, lastTextNode: lastTextNode };
        }

        // ブロック基準で復元を試みる（第二候補）。保存ノードが消えていても、同じ
        // インデックスのトップレベルブロックが残っていて、そのブロック内でローカル
        // オフセットに到達できれば復元する。キャレットより前の別ブロック（数式・
        // Mermaid・テーブル）が再描画で文字量を変えても、キャレットのブロックに閉じた
        // オフセットなのでドリフトしない。届かなければ下のグローバルオフセット走査へ委ねる。
        if (typeof position.blockIndex === 'number' && position.blockIndex >= 0) {
            const children = state.editor.childNodes;
            let block = null;

            // ブロックの挿入・並べ替えで blockIndex がずれても、署名（先頭テキスト）が
            // 一意に一致するブロックがあればそれを優先する。一致が無い（＝キャレットの
            // ブロック自体が編集されて署名が変わった）／複数一致で曖昧な場合は、従来
            // どおり blockIndex で引く。
            const sig = position.blockSignature;
            if (typeof sig === 'string' && sig.length > 0) {
                let matched = null;
                let matchCount = 0;
                for (let i = 0; i < children.length; i++) {
                    if (blockSignatureOf(children[i]) === sig) {
                        matched = children[i];
                        matchCount++;
                    }
                }
                if (matchCount === 1) {
                    block = matched;
                }
            }
            if (!block) {
                block = children[position.blockIndex];
            }

            if (block) {
                const { result } = scanOffset(block, position.blockOffset || 0);
                if (result) {
                    try {
                        const blockRange = document.createRange();
                        blockRange.setStart(result.node, result.offset);
                        blockRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(blockRange);
                        return;
                    } catch (e) {
                        // ブロック基準で失敗した場合はグローバルオフセット方式へ委ねる
                    }
                }
            }
        }

        const range = document.createRange();

        try {
            const { result, lastTextNode } = scanOffset(state.editor, position.offset);

            if (result) {
                range.setStart(result.node, result.offset);
                range.setEnd(result.node, result.offset);
                selection.removeAllRanges();
                selection.addRange(range);
                return;
            }

            // 目的オフセットに届かなかった場合（保存時より本文が短くなった等）。
            // ここでキャレットを一切設定せずに抜けると、直前の `editor.innerHTML = …`
            // で選択が破棄されている時にブラウザがキャレットをエディタ先頭へ描画し、
            // 「編集中に突然キャレットが一番上へ飛ぶ」不具合になる。
            // 既にエディタ内へ妥当な選択が残っているならそれを尊重し（従来動作）、
            // 選択が失われている時だけ、到達できた最寄り位置（最後のテキストノード末尾、
            // テキストが無ければエディタ末尾）へフォールバックして先頭飛びを防ぐ。
            // ただし innerHTML 全書き換え後にブラウザが `(editor, 0)`（エディタ直下の
            // 先頭）へ collapse した選択を置くことがあり、これはまさに「先頭へ飛んだ」
            // 状態そのもの。`editor.contains(editor)` は true になり妥当な選択と誤判定
            // してしまうため、startContainer がエディタ要素自身の場合は妥当とみなさない。
            const startContainer = selection.rangeCount > 0
                ? selection.getRangeAt(0).startContainer
                : null;
            const hasValidSelection = startContainer !== null &&
                startContainer !== state.editor &&
                state.editor.contains(startContainer);
            if (hasValidSelection) {
                return;
            }

            if (lastTextNode) {
                const end = lastTextNode.textContent.length;
                range.setStart(lastTextNode, end);
                range.setEnd(lastTextNode, end);
            } else {
                range.selectNodeContents(state.editor);
                range.collapse(false);
            }
            selection.removeAllRanges();
            selection.addRange(range);
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

    /**
     * 受信した `update` が「競合する古いエコー」かどうかを判定する（純粋関数）。
     *
     * Webview は編集を送るたびに単調増加する `editSeq` を採番し、拡張機能側は
     * その編集を適用して返すエコー `update` に、原因となった編集の `seq` を反映する。
     * タイプ中に「AB」を送った直後に「ABC」を送ると、遅れて届いた「AB」のエコー
     * （＝より小さい seq）が現在の「ABC」を巻き戻し、キャレットを乱していた。
     *
     * `messageSeq`（エコーが反映する編集の seq）が、Webview が既に送った最新の
     * `currentEditSeq` より小さければ、その `update` は陳腐化しているので無視する。
     * `messageSeq` が数値でない（＝外部編集や初期ロードで seq が付かない）場合は
     * 常に適用する（false を返す）。同値（最新エコー）は無視しない＝内容一致の
     * 既存ガードに委ねる。
     *
     * @param {*} messageSeq 受信した update の seq（未定義なら外部編集扱い）
     * @param {number} currentEditSeq Webview が最後に送った編集の seq
     * @returns {boolean} 無視すべきなら true
     */
    function shouldIgnoreStaleUpdate(messageSeq, currentEditSeq) {
        return typeof messageSeq === 'number' &&
            typeof currentEditSeq === 'number' &&
            messageSeq < currentEditSeq;
    }

    /**
     * 非同期描画（Mermaid等）の完了を待ってからキャレット復元を実行するヘルパー。
     *
     * Mermaid の再描画は非同期（`mermaidModule.render()` は Promise を返す）で、
     * `innerHTML` 全書き換え後にキャレットを復元する際、描画完了前に復元すると
     * ブロックの高さ・ノード構成が未確定なためアンカーがずれてキャレットが飛ぶ。
     * 描画 Promise の解決（または失敗）を待ってから復元することでこれを防ぐ。
     * Promise でない値（同期描画のみ／描画対象なし）が渡された場合は、従来どおり
     * 次のマクロタスクで復元する（`setTimeout(0)` 相当）。描画が失敗しても DOM 構造
     * 自体は確定しているため、失敗時も復元は試みる。
     *
     * @param {*} renderPromise Mermaid等 render() の戻り値（Promise か否かは問わない）
     * @param {Function} restoreFn キャレット復元を行うコールバック
     */
    function restoreCaretAfterRender(renderPromise, restoreFn) {
        if (typeof restoreFn !== 'function') {
            return;
        }
        if (renderPromise && typeof renderPromise.then === 'function') {
            renderPromise.then(function() {
                restoreFn();
            }, function() {
                restoreFn();
            });
        } else {
            setTimeout(restoreFn, 0);
        }
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
        blockSignatureOf: blockSignatureOf,
        shouldIgnoreStaleUpdate: shouldIgnoreStaleUpdate,
        restoreCaretAfterRender: restoreCaretAfterRender,
        findAncestor: findAncestor,
        findBlockAncestor: findBlockAncestor,
        getTextBeforeCaret: getTextBeforeCaret,
        placeCaretAt: placeCaretAt,
        ensureTrailingTextNode: ensureTrailingTextNode,
        findCodeBeforeCaret: findCodeBeforeCaret,
        shouldSkipInline: shouldSkipInline
    };
})();
